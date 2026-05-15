import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

import { auth } from '@/app/(auth)/auth';

const MAX_PDF_BYTES = 32 * 1024 * 1024;

const PDF_MIME_TYPES = [
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
  // Some browsers send PDFs as octet-stream; pathname must still end in .pdf.
  'application/octet-stream',
] as const;

function pathnameLooksLikePdf(pathname: string): boolean {
  return pathname.toLowerCase().endsWith('.pdf');
}

export async function POST(request: Request) {
  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        if (!session) {
          throw new Error('Unauthorized');
        }

        if (!pathnameLooksLikePdf(pathname)) {
          throw new Error('File must be a PDF');
        }

        return {
          allowedContentTypes: [...PDF_MIME_TYPES],
          maximumSizeInBytes: MAX_PDF_BYTES,
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      onUploadCompleted: async () => {
        // Optional post-upload hooks (e.g. DB). Vercel Blob cannot reach localhost for this callback.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to process request';
    const status = message === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
