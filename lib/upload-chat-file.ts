import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';

import type { Attachment } from '@/lib/types';

const MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;
/** Must match `filePartSchema` in `app/(chat)/api/chat/schema.ts` (model + Zod). */
const MAX_CHAT_FILE_NAME_CHARS = 100;

function chatAttachmentName(file: File): string {
  const raw = file.name.trim() || 'document.pdf';
  return raw.length <= MAX_CHAT_FILE_NAME_CHARS
    ? raw
    : raw.slice(0, MAX_CHAT_FILE_NAME_CHARS);
}

export async function uploadChatFile(
  file: File,
): Promise<Attachment | undefined> {
  try {
    const data = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/files/upload',
      contentType: 'application/pdf',
      multipart: file.size > MULTIPART_THRESHOLD_BYTES,
    });

    return {
      url: data.url,
      name: chatAttachmentName(file),
      contentType: 'application/pdf',
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to upload file, please try again!';
    toast.error(message);
    return undefined;
  }
}
