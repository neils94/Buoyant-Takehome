import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';

import type { Attachment } from '@/lib/types';

const MULTIPART_THRESHOLD_BYTES = 4 * 1024 * 1024;

export async function uploadChatFile(
  file: File,
): Promise<Attachment | undefined> {
  try {
    const data = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/files/upload',
      contentType: file.type || 'application/pdf',
      multipart: file.size > MULTIPART_THRESHOLD_BYTES,
    });

    return {
      url: data.url,
      name: data.pathname,
      contentType: data.contentType ?? 'application/pdf',
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
