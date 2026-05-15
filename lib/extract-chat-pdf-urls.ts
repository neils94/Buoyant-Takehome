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

/**
 * Replaces user/assistant `file` parts for PDFs with plain `text` instructions.
 *
 * Native Anthropic PDF `document` blocks require the `pdfs-2024-09-25` beta header.
 * LiteLLM-style proxies (e.g. Buoyant hiring-proxy) often omit or mishandle that,
 * which surfaces as upstream `api_error` / 500. The chat flow already exposes
 * `readUserProposalPdf`, which downloads the same blob URL server-side.
 */
export function mapUiMessagesPdfFilesToTextInstructions(
  messages: ChatMessage[],
): ChatMessage[] {
  return messages.map((message) => {
    const nextParts: ChatMessage['parts'] = [];

    for (const part of message.parts) {
      if (part.type !== 'file') {
        nextParts.push(part);
        continue;
      }

      const file = part as {
        type: 'file';
        url: string;
        mediaType: string;
        filename?: string;
        name?: string;
      };
      const name = file.filename ?? file.name ?? 'document.pdf';
      const isPdfAttachment =
        Boolean(file.url) &&
        (isPdfMediaType(file.mediaType) || isPdfFilename(name));

      if (!isPdfAttachment) {
        nextParts.push(part);
        continue;
      }

      nextParts.push({
        type: 'text',
        text: [
          `A proposal PDF named "${name}" is attached in this thread.`,
          'Read it with the readUserProposalPdf tool using exactly this pdfUrl (must match character-for-character):',
          file.url,
        ].join('\n'),
      });
    }

    return { ...message, parts: nextParts };
  });
}
