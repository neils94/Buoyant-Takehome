'use client';

import dynamic from 'next/dynamic';
import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { cn, fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import type { Attachment, ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useWindowSize } from 'usehooks-ts';

const chatComposerPlaceholder = 'Send a message… Enter to submit';

const PdfDocumentPanel = dynamic(
  () =>
    import('@/components/pdf-document-panel').then(
      (mod) => mod.PdfDocumentPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-0 min-w-0 flex-col bg-muted/30 dark:bg-background">
        <div className="h-12 shrink-0 border-b bg-background/80 animate-pulse" />
        <div className="flex-1 min-h-0 animate-pulse bg-muted/15" />
      </div>
    ),
  },
);

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const { setDataStream, dataStream } = useDataStream();

  useEffect(() => {
    setDataStream([]);
  }, [id, setDataStream]);

  const [input, setInput] = useState<string>('');
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const appendToComposer = useCallback((block: string) => {
    flushSync(() => {
      setInput((prev) => {
        const trimmed = prev.trimEnd();
        if (trimmed.length === 0) {
          return block;
        }
        return `${trimmed}\n\n${block}`;
      });
    });

    const el = composerTextareaRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, []);

  const handlePdfEditToComposer = useCallback(
    ({
      excerpt,
      instruction,
    }: {
      excerpt: string;
      instruction: string;
    }) => {
      const excerptBlock = excerpt.trim();
      const block = `The following is an excerpt from the uploaded proposal PDF:\n\n"""\n${excerptBlock}\n"""\n\n${instruction.trim()}`;
      appendToComposer(block);
    },
    [appendToComposer],
  );

  const handlePdfFindEditsPrompt = useCallback(
    (prompt: string) => {
      appendToComposer(prompt.trim());
    },
    [appendToComposer],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest({ messages, id, body }) {
        return {
          body: {
            id,
            message: messages.at(-1),
            selectedChatModel: initialChatModel,
            selectedVisibilityType: visibilityType,
            ...body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: 'user' as const,
        parts: [{ type: 'text', text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);
  const { width: windowWidth } = useWindowSize();
  const isStackedPdfLayout = windowWidth ? windowWidth < 768 : false;

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  const latestPdfRevision = useMemo(() => {
    for (let i = dataStream.length - 1; i >= 0; i--) {
      const part = dataStream[i];
      if (part.type === 'data-proposalPdfRevision') {
        return part.data;
      }
    }
    return null;
  }, [dataStream]);

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          selectedModelId={initialChatModel}
          isReadonly={isReadonly}
          session={session}
        />

        <PanelGroup
          direction={isStackedPdfLayout ? 'vertical' : 'horizontal'}
          className="flex flex-1 min-h-0 min-w-0"
        >
          <Panel
            defaultSize={55}
            minSize={28}
            className="flex min-h-0 min-w-0 h-full"
          >
            <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full h-full">
              <Messages
                chatId={id}
                status={status}
                votes={votes}
                messages={messages}
                setMessages={setMessages}
                regenerate={regenerate}
                isReadonly={isReadonly}
                isArtifactVisible={isArtifactVisible}
              />

              <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full max-w-3xl shrink-0">
                {!isReadonly && (
                  <MultimodalInput
                    chatId={id}
                    input={input}
                    setInput={setInput}
                    status={status}
                    stop={stop}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    messages={messages}
                    setMessages={setMessages}
                    sendMessage={sendMessage}
                    selectedVisibilityType={visibilityType}
                    composerRef={composerTextareaRef}
                    inputPlaceholder={chatComposerPlaceholder}
                  />
                )}
              </form>
            </div>
          </Panel>

          <PanelResizeHandle
            className={cn(
              'group relative flex shrink-0 items-center justify-center bg-border',
              isStackedPdfLayout
                ? 'h-2 w-full cursor-row-resize'
                : 'h-full w-2 cursor-col-resize',
            )}
          >
            <span
              className={cn(
                'rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/50',
                isStackedPdfLayout ? 'h-1 w-12' : 'h-12 w-1',
              )}
            />
          </PanelResizeHandle>

          <Panel
            defaultSize={45}
            minSize={22}
            className="flex min-h-0 min-w-0 h-full"
          >
            <PdfDocumentPanel
              messages={messages}
              attachments={attachments}
              setAttachments={isReadonly ? undefined : setAttachments}
              chatStatus={status}
              splitEdge={isStackedPdfLayout ? 'top' : 'left'}
              className="flex-1"
              revisionOffer={latestPdfRevision}
              onPdfEditToComposer={handlePdfEditToComposer}
              onFindEditsPrompt={
                isReadonly ? undefined : handlePdfFindEditsPrompt
              }
            />
          </Panel>
        </PanelGroup>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        sendMessage={sendMessage}
        messages={messages}
        setMessages={setMessages}
        regenerate={regenerate}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
      />
    </>
  );
}
