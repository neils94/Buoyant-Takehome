import { toast } from 'sonner';

import type { Attachment } from '@/lib/types';

export async function uploadChatFile(
  file: File,
): Promise<Attachment | undefined> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      const { url, pathname, contentType } = data;

      return {
        url,
        name: pathname,
        contentType,
      };
    }

    const { error } = await response.json();
    toast.error(error);
  } catch {
    toast.error('Failed to upload file, please try again!');
  }

  return undefined;
}
