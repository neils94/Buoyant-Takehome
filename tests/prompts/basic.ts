import type { ModelMessage } from 'ai';

export const TEST_PROMPTS: Record<string, ModelMessage> = {
  USER_SKY: {
    role: 'user',
    content: [{ type: 'text', text: 'Why is the sky blue?' }],
  },
  USER_GRASS: {
    role: 'user',
    content: [{ type: 'text', text: 'Why is grass green?' }],
  },
  USER_THANKS: {
    role: 'user',
    content: [{ type: 'text', text: 'Thanks!' }],
  },
  USER_NEXTJS: {
    role: 'user',
    content: [
      { type: 'text', text: 'What are the advantages of using Next.js?' },
    ],
  },
  USER_IMAGE_ATTACHMENT: {
    role: 'user',
    content: [
      {
        type: 'file',
        mediaType: '...',
        data: '...',
      },
      {
        type: 'text',
        text: 'Who painted this?',
      },
    ],
  },
  USER_TEXT_ARTIFACT: {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Help me write an essay about Silicon Valley',
      },
    ],
  },
  CREATE_DOCUMENT_TEXT_CALL: {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Essay about Silicon Valley',
      },
    ],
  },
  CREATE_DOCUMENT_TEXT_RESULT: {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_123',
        toolName: 'createDocument',
        output: {
          type: 'json',
          value: {
            id: '3ca386a4-40c6-4630-8ed1-84cbd46cc7eb',
            title: 'Essay about Silicon Valley',
            kind: 'text',
            content: 'A document was created and is now visible to the user.',
          },
        },
      },
    ],
  },
  LIST_KB_CALL: {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'What example documents are in the knowledge base?',
      },
    ],
  },
  READ_KB_RESULT: {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call_456',
        toolName: 'readKnowledgeBaseDocument',
        output: {
          type: 'json',
          value: {
            fileName: 'example_soq.pdf',
            characterCount: 120,
            truncated: false,
            text: 'Sample extracted text from a reference SOQ for tests.',
          },
        },
      },
    ],
  },
};
