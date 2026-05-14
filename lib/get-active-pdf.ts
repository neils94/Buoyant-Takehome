import type { Attachment, ChatMessage } from '@/lib/types';

export type ActivePdf = { url: string; name: string };

function isPdfMediaType(mediaType: string | undefined): boolean {
  if (!mediaType) {
    return false;
  }
  return (
    mediaType === 'application/pdf' || mediaType.toLowerCase().includes('pdf')
  );
}

function isPdfFilename(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf');
}

/**
 * Prefer in-composer attachments (live preview), then the most recent PDF
 * referenced in the thread (user or assistant file parts).
 */
export function getActivePdf(
  attachments: Attachment[],
  messages: ChatMessage[],
): ActivePdf | null {
  for (let i = attachments.length - 1; i >= 0; i--) {
    const a = attachments[i];
    if (a.url && (isPdfMediaType(a.contentType) || isPdfFilename(a.name))) {
      return { url: a.url, name: a.name };
    }
  }

  for (let mi = messages.length - 1; mi >= 0; mi--) {
    const message = messages[mi];
    const fileParts = message.parts.filter(
      (p): p is Extract<typeof p, { type: 'file' }> => p.type === 'file',
    );
    for (let fi = fileParts.length - 1; fi >= 0; fi--) {
      const p = fileParts[fi];
      const name = p.filename ?? 'document.pdf';
      if (p.url && (isPdfMediaType(p.mediaType) || isPdfFilename(name))) {
        return { url: p.url, name };
      }
    }
  }

  return null;
}
