import type { ChatMessage } from '@/lib/types';

function isPdfMediaType(mediaType: string | undefined): boolean {
  if (!mediaType) {
    return false;
  }
  return (
    mediaType === 'application/pdf' || mediaType.toLowerCase().includes('pdf')
  );
}

function isPdfFilename(name: string | undefined): boolean {
  if (!name) {
    return false;
  }
  return name.toLowerCase().endsWith('.pdf');
}

/**
 * Collects PDF blob URLs referenced in the chat UI messages (user/assistant file parts).
 * Used to constrain server-side PDF tools to URLs the user actually shared.
 */
export function extractChatPdfUrls(messages: ChatMessage[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== 'file') {
        continue;
      }
      const file = part as {
        url: string;
        mediaType: string;
        filename?: string;
        name?: string;
      };
      const name = file.filename ?? file.name ?? 'document.pdf';
      if (
        !file.url ||
        !(isPdfMediaType(file.mediaType) || isPdfFilename(name))
      ) {
        continue;
      }
      if (!seen.has(file.url)) {
        seen.add(file.url);
        ordered.push(file.url);
      }
    }
  }

  return ordered;
}
