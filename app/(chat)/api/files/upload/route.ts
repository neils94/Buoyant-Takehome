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

/**
 * URL Vercel Blob will POST `blob.upload-completed` to after a client upload.
 * Must match this route; use `VERCEL_BLOB_CALLBACK_URL` when the request host
 * is not publicly reachable (e.g. tunnels or custom domains).
 */
function resolveBlobClientUploadCallbackUrl(request: Request): string {
  const base = process.env.VERCEL_BLOB_CALLBACK_URL?.trim().replace(/\/+$/, '');
  const path = new URL(request.url).pathname;
  if (base) {
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }
  return new URL(request.url).href;
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
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: JSON.stringify({ userId: session.user.id }),
          callbackUrl: resolveBlobClientUploadCallbackUrl(request),
        };
      },
      onUploadCompleted: async () => {
        // Optional: persist blob metadata. Requires `callbackUrl` above or
        // `VERCEL_BLOB_CALLBACK_URL`; Blob cannot reach plain localhost.
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
