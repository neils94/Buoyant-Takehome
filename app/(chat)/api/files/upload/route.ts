import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';

const MAX_PDF_BYTES = 32 * 1024 * 1024;

const PDF_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
]);

function looksLikePdf(file: Blob, filename: string): boolean {
  const type = file.type.toLowerCase();
  if (PDF_MIME_TYPES.has(type)) {
    return true;
  }
  // Some clients send empty type or octet-stream for uploads; fall back to extension.
  if (type === '' || type === 'application/octet-stream') {
    return filename.toLowerCase().endsWith('.pdf');
  }
  return false;
}

const UploadSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_PDF_BYTES, {
      message: `File size should be less than ${MAX_PDF_BYTES / (1024 * 1024)}MB`,
    }),
  filename: z.string().min(1, { message: 'Filename is required' }),
}).refine(({ file, filename }) => looksLikePdf(file, filename), {
  message: 'File must be a PDF',
  path: ['file'],
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const filename =
      file instanceof File && file.name
        ? file.name
        : (formData.get('filename') as string | null) ?? 'document.pdf';

    const validated = UploadSchema.safeParse({ file, filename });

    if (!validated.success) {
      const errorMessage = validated.error.errors
        .map((error) => error.message)
        .join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();

    try {
      const data = await put(filename, fileBuffer, {
        access: 'public',
        contentType: 'application/pdf',
      });

      return NextResponse.json(data);
    } catch (error) {
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
