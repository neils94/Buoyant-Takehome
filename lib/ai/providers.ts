import {
  customProvider,
  defaultSettingsMiddleware,
  wrapLanguageModel,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { xai } from '@ai-sdk/xai';
import {
  artifactModel,
  chatModel,
  pdfExtractionModel,
  reasoningModel,
} from './models.test';
import { isTestEnvironment } from '../constants';

/**
 * PDF-capable primary chat model (see docs/PROJECT_OUTLINE.md — Chat with PDFs).
 *
 * `pdf-extraction-model` uses the same underlying model for tasks that must **read file/PDF
 * parts faithfully** (extract facts, quotes, structure) before compressing them. Call sites
 * should use system instructions that require accuracy over brevity until the final output
 * shape is applied (e.g. a short chat title grounded in the document).
 */
const CHAT_MODEL_ID = 'claude-opus-4-6';

/** Anthropic-compatible prefix: SDK calls `${baseURL}/messages` (same shape as `https://api.anthropic.com/v1/messages`). */
const DEFAULT_ANTHROPIC_BASE_URL =
  'https://hiring-proxy.trybuoyant.ai/anthropic/v1';

const rawAnthropicBaseURL = (
  process.env.AI_PROXY_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL
).replace(/\/+$/, '');

const anthropicBaseURL = rawAnthropicBaseURL.endsWith('/anthropic')
  ? `${rawAnthropicBaseURL}/v1`
  : rawAnthropicBaseURL;

/** `ANTHROPIC_AUTH_TOKEN` is passed as `apiKey` — the SDK resolves credentials before merging custom `headers`. */
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: anthropicBaseURL,
});

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'pdf-extraction-model': pdfExtractionModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': anthropic(CHAT_MODEL_ID),
        'chat-model-reasoning': wrapLanguageModel({
          model: anthropic(CHAT_MODEL_ID),
          middleware: defaultSettingsMiddleware({
            settings: {
              providerOptions: {
                anthropic: {
                  thinking: { type: 'enabled', budgetTokens: 12_000 },
                  sendReasoning: true,
                },
              },
            },
          }),
        }),
        'pdf-extraction-model': anthropic(CHAT_MODEL_ID),
        'artifact-model': anthropic(CHAT_MODEL_ID),
      },
      imageModels: {
        'small-model': xai.imageModel('grok-2-image'),
      },
    });
