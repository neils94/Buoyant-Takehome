export const DEFAULT_CHAT_MODEL: string = 'chat-model';

export interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model',
    name: 'Chat model',
    description: 'Claude Opus 4.6 — multimodal chat including PDFs',
  },
  {
    id: 'chat-model-reasoning',
    name: 'Reasoning model',
    description: 'Claude Opus 4.6 with extended thinking enabled',
  },
];
