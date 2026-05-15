import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  JsonToSseTransformStream,
  type ModelMessage,
  UI_MESSAGE_STREAM_HEADERS,
  smoothStream,
  stepCountIs,
  streamText,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import {
  conversationalAssistantSystemPrompt,
  groundingPrompt,
  knowledgeBaseToolsPrompt,
  artifactsPrompt,
  pdfWorkspaceAgentPrompt,
  regularPrompt,
  systemPrompt,
} from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getUserById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import {
  listKnowledgeBase,
  readKnowledgeBaseDocument,
} from '@/lib/ai/tools/knowledge-base';
import { createProposalPdfWorkspaceTools } from '@/lib/ai/tools/proposal-pdf-workspace';
import {
  extractChatPdfUrls,
  mapUiMessagesPdfFilesToTextInstructions,
} from '@/lib/extract-chat-pdf-urls';
import { isProductionEnvironment, isTestEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsForSessionUser } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { createClient } from 'redis';
import { after } from 'next/server';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { ChatModel } from '@/lib/ai/models';
import type { VisibilityType } from '@/components/visibility-selector';

export const maxDuration = 60;

/**
 * Anthropic rejects new generations when the prompt ends with an assistant
 * message (unsupported prefill on this model). Step 1 leaves assistant/tool
 * turns in `response.messages`; step 2 must end with a user turn.
 */
function withTrailingUserMessageForAnthropic(
  messages: ModelMessage[],
): ModelMessage[] {
  const last = messages.at(-1);
  if (last?.role === 'user') {
    return messages;
  }
  return [
    ...messages,
    {
      role: 'user',
      content:
        'Please write your user-facing follow-up for this turn now. Use the workspace pass and tool results already in the thread; the system prompt describes what to summarize.',
    },
  ];
}

let globalStreamContext: ResumableStreamContext | null = null;
/** After Redis/resumable errors, skip Redis for this warm instance (serverless). */
let skipResumableRedis = false;
let loggedVercelLocalRedisSkip = false;
let loggedResumableRedisSkipReason = false;

/**
 * Same resolution order as `resumable-stream` (REDIS_URL || KV_URL).
 * `KV_URL` from Vercel/Upstash is often HTTPS (REST), which node-redis rejects
 * with "Invalid protocol" — only redis: / rediss: are valid here.
 */
function resolveResumableRedisUrl(): string | null {
  const raw = (process.env.REDIS_URL || process.env.KV_URL || '').trim();
  if (!raw) {
    return null;
  }
  try {
    const { protocol } = new URL(raw);
    if (protocol === 'redis:' || protocol === 'rediss:') {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

function redisUrlLooksUnreachableOnVercel(): boolean {
  if (process.env.VERCEL !== '1') {
    return false;
  }
  const url = process.env.REDIS_URL ?? '';
  const bad = Boolean(url) && /\b(localhost|127\.0\.0\.1)\b/i.test(url);
  if (bad && !loggedVercelLocalRedisSkip) {
    loggedVercelLocalRedisSkip = true;
    console.log(
      ' > Resumable streams disabled: REDIS_URL points to localhost on Vercel',
    );
  }
  return bad;
}

export function getStreamContext() {
  if (skipResumableRedis || redisUrlLooksUnreachableOnVercel()) {
    return null;
  }

  const redisUrl = resolveResumableRedisUrl();
  const rawEnvUrl = (process.env.REDIS_URL || process.env.KV_URL || '').trim();

  if (!redisUrl) {
    if (!loggedResumableRedisSkipReason) {
      loggedResumableRedisSkipReason = true;
      if (!rawEnvUrl) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL/KV_URL',
        );
      } else {
        console.log(
          ' > Resumable streams disabled: REDIS_URL/KV_URL must be redis:// or rediss:// (non-Redis URLs are ignored)',
        );
      }
    }
    return null;
  }

  if (!globalStreamContext) {
    try {
      const subscriber = createClient({ url: redisUrl });
      const publisher = createClient({ url: redisUrl });
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
        subscriber,
        publisher,
      });
    } catch (error: unknown) {
      skipResumableRedis = true;
      globalStreamContext = null;
      console.error(
        'Resumable stream (Redis) init failed; streaming without resume.',
        error,
      );
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const dbUser = await getUserById({ id: session.user.id });
    if (!dbUser) {
      return new ChatSDKError(
        'unauthorized:chat',
        'Your session does not match this database (user record missing). Sign out and sign in again.',
      ).toResponse();
    }

    if (!isTestEnvironment && !process.env.ANTHROPIC_AUTH_TOKEN) {
      return new ChatSDKError(
        'bad_request:api',
        'Missing ANTHROPIC_AUTH_TOKEN (proxy).',
      ).toResponse();
    }

    const entitlements = entitlementsForSessionUser({
      type: session.user.type,
      email: dbUser.email,
    });

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlements.maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    // DB order is oldest-first; the new user turn must be last for Anthropic (no trailing assistant).
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const allowedPdfUrlSet = new Set(extractChatPdfUrls(uiMessages));
        const baseModelMessages = convertToModelMessages(
          mapUiMessagesPdfFilesToTextInstructions(uiMessages),
        );

        if (selectedChatModel === 'chat-model-reasoning') {
          const result = streamText({
            model: myProvider.languageModel(selectedChatModel),
            system: systemPrompt({ selectedChatModel }),
            messages: baseModelMessages,
            abortSignal: request.signal,
            stopWhen: stepCountIs(5),
            experimental_activeTools: [],
            experimental_transform: smoothStream({ chunking: 'word' }),
            tools: {
              listKnowledgeBase,
              readKnowledgeBaseDocument,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({
                session,
                dataStream,
              }),
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: 'stream-text',
            },
          });

          result.consumeStream();

          dataStream.merge(
            result.toUIMessageStream({
              sendReasoning: true,
            }),
          );
          return;
        }

        const proposalPdfTools = createProposalPdfWorkspaceTools({
          session,
          dataStream,
          allowedPdfUrlSet,
        });

        const workspaceSystem = `${groundingPrompt}\n\n${regularPrompt}\n\n${pdfWorkspaceAgentPrompt}\n\n${knowledgeBaseToolsPrompt}\n\n${artifactsPrompt}`;

        const result1 = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: workspaceSystem,
          messages: baseModelMessages,
          abortSignal: request.signal,
          stopWhen: stepCountIs(15),
          experimental_activeTools: [
            'readUserProposalPdf',
            'publishProposalPdfRevision',
            'listKnowledgeBase',
            'readKnowledgeBaseDocument',
            'createDocument',
            'updateDocument',
          ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools: {
            readUserProposalPdf: proposalPdfTools.readUserProposalPdf,
            publishProposalPdfRevision:
              proposalPdfTools.publishProposalPdfRevision,
            listKnowledgeBase,
            readKnowledgeBaseDocument,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text-workspace',
          },
        });

        dataStream.merge(
          result1.toUIMessageStream({
            sendReasoning: true,
            sendFinish: false,
          }),
        );

        const response1 = await result1.response;
        const result2 = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: conversationalAssistantSystemPrompt({
            selectedChatModel,
          }),
          messages: withTrailingUserMessageForAnthropic([
            ...baseModelMessages,
            ...response1.messages,
          ]),
          abortSignal: request.signal,
          stopWhen: stepCountIs(5),
          experimental_activeTools: [
            'listKnowledgeBase',
            'readKnowledgeBaseDocument',
            'createDocument',
            'updateDocument',
            'requestSuggestions',
          ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools: {
            listKnowledgeBase,
            readKnowledgeBaseDocument,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text-conversation',
          },
        });

        dataStream.merge(
          result2.toUIMessageStream({
            sendReasoning: true,
            sendStart: false,
          }),
        );

        await result2.response;
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });
      },
      onError: (error) => {
        console.log(error);
        return 'Oops, an error occurred!';
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      try {
        const resumed = await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream()),
        );
        if (resumed == null) {
          return new Response(null, { status: 204 });
        }
        return new Response(resumed.pipeThrough(new TextEncoderStream()), {
          headers: UI_MESSAGE_STREAM_HEADERS,
        });
      } catch (error) {
        skipResumableRedis = true;
        globalStreamContext = null;
        console.error(
          'Resumable stream (Redis) failed; falling back to a direct SSE response. Check REDIS_URL on Vercel.',
          error,
        );
      }
    }

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error(error);
    return Response.json(
      { code: '', message: 'Something went wrong. Please try again later.' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user?.id) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  try {
    const chat = await getChatById({ id });

    if (!chat) {
      return new ChatSDKError('not_found:chat').toResponse();
    }

    if (chat.userId !== session.user.id) {
      return new ChatSDKError('forbidden:chat').toResponse();
    }

    const deletedChat = await deleteChatById({ id });

    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error('[DELETE /api/chat]', error);
    return Response.json(
      { code: '', message: 'Something went wrong. Please try again later.' },
      { status: 500 },
    );
  }
}
