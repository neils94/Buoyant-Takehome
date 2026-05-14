import 'server-only';

import { put } from '@vercel/blob';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { tool, type UIMessage, type UIMessageStreamWriter } from 'ai';
import type { Session } from 'next-auth';
import { z } from 'zod';

const MAX_READ_CHARS = 100_000;
const MAX_REVISION_MARKDOWN_CHARS = 12_000;
const LINE_WRAP = 92;
const LINE_HEIGHT = 12;
const PAGE_MARGIN = 48;

interface ProposalPdfWorkspaceToolsProps {
  session: Session;
  dataStream: UIMessageStreamWriter<UIMessage>;
  allowedPdfUrlSet: Set<string>;
}

function assertAllowedUrl(url: string, allowedPdfUrlSet: Set<string>) {
  if (!allowedPdfUrlSet.has(url)) {
    return {
      error:
        'That PDF URL is not part of this chat thread. Use a URL from an uploaded/attached proposal PDF in the conversation.',
    } as const;
  }
  return null;
}

async function fetchPdfBytes(
  url: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        ok: false,
        error: `Failed to download PDF (${res.status} ${res.statusText})`,
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 5 || String.fromCharCode(...buf.slice(0, 5)) !== '%PDF-') {
      return {
        ok: false,
        error: 'Downloaded file is not a PDF (missing %PDF- header).',
      };
    }
    return { ok: true, bytes: buf };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Failed to download PDF',
    };
  }
}

function wrapLines(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, '\n').split('\n')) {
    let i = 0;
    while (i < paragraph.length) {
      out.push(paragraph.slice(i, i + maxChars));
      i += maxChars;
    }
    if (paragraph.length === 0) {
      out.push('');
    }
  }
  return out;
}

export function createProposalPdfWorkspaceTools({
  session,
  dataStream,
  allowedPdfUrlSet,
}: ProposalPdfWorkspaceToolsProps) {
  const readUserProposalPdf = tool({
    description:
      'Download a user proposal PDF from a URL that already appears in this chat (file attachment) and return extracted plain text for analysis. Prefer the active proposal PDF URL from the latest user message when unclear.',
    inputSchema: z.object({
      pdfUrl: z
        .string()
        .url()
        .describe('Exact PDF URL from a file part in this chat thread'),
    }),
    execute: async ({ pdfUrl }) => {
      const denied = assertAllowedUrl(pdfUrl, allowedPdfUrlSet);
      if (denied) {
        return denied;
      }

      const downloaded = await fetchPdfBytes(pdfUrl);
      if (!downloaded.ok) {
        return { error: downloaded.error, pdfUrl };
      }

      const pdfParse = (await import('pdf-parse')).default;
      let text: string;
      try {
        const parsed = await pdfParse(Buffer.from(downloaded.bytes));
        text = (parsed.text ?? '').trim();
      } catch (e) {
        return {
          error: 'Could not parse PDF text',
          detail: e instanceof Error ? e.message : String(e),
          pdfUrl,
        };
      }

      const truncated = text.length > MAX_READ_CHARS;
      const body = truncated
        ? `${text.slice(0, MAX_READ_CHARS)}\n\n[Truncated]`
        : text;

      return {
        pdfUrl,
        characterCount: body.length,
        truncated,
        text: body,
      };
    },
  });

  const publishProposalPdfRevision = tool({
    description:
      'Create an updated proposal PDF by copying the user’s original PDF and appending a new “Revision summary” page (markdown/plain text) so the user can compare the prior blob URL with the newly uploaded blob URL in the UI. Use after you have concrete edits; include page/section references and replacement-ready wording on the summary page.',
    inputSchema: z.object({
      sourcePdfUrl: z
        .string()
        .url()
        .describe(
          'The existing proposal PDF URL from this chat to copy as the base',
        ),
      outputFilename: z
        .string()
        .min(1)
        .max(180)
        .describe('Download filename, e.g. proposal-rev-1.pdf'),
      revisionMarkdown: z
        .string()
        .min(1)
        .max(MAX_REVISION_MARKDOWN_CHARS)
        .describe(
          'Human-readable revision notes to render on the appended summary page (headings/bullets ok)',
        ),
    }),
    execute: async ({ sourcePdfUrl, outputFilename, revisionMarkdown }) => {
      const denied = assertAllowedUrl(sourcePdfUrl, allowedPdfUrlSet);
      if (denied) {
        return denied;
      }

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return {
          error:
            'Blob uploads are not configured (missing BLOB_READ_WRITE_TOKEN). Cannot publish a revised PDF.',
        };
      }

      const downloaded = await fetchPdfBytes(sourcePdfUrl);
      if (!downloaded.ok) {
        return { error: downloaded.error, sourcePdfUrl };
      }

      let pdfDoc: PDFDocument;
      try {
        pdfDoc = await PDFDocument.load(downloaded.bytes);
      } catch (e) {
        return {
          error: 'Could not load PDF for editing',
          detail: e instanceof Error ? e.message : String(e),
          sourcePdfUrl,
        };
      }

      const pages = pdfDoc.getPages();
      const first = pages[0];
      const { width, height } = first
        ? first.getSize()
        : { width: 612, height: 792 };

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const header = `Revision summary (generated)\nUser id: ${session.user.id}\nSource: ${sourcePdfUrl}\n\n`;
      const body = `${header}${revisionMarkdown}`;
      const lines = wrapLines(body, LINE_WRAP);

      let page = pdfDoc.addPage([width, height]);
      let x = PAGE_MARGIN;
      let y = height - PAGE_MARGIN;
      const size = 10;

      page.drawText('Revision summary', {
        x,
        y,
        size: 14,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 22;

      for (const line of lines) {
        if (y < PAGE_MARGIN + LINE_HEIGHT) {
          page = pdfDoc.addPage([width, height]);
          x = PAGE_MARGIN;
          y = height - PAGE_MARGIN;
        }
        page.drawText(line, {
          x,
          y,
          size,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= LINE_HEIGHT;
      }

      const outBytes = await pdfDoc.save();
      const safeName = outputFilename.replace(/[^\w.\-()+ ]+/g, '_');
      const uniquePrefix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const blob = await put(
        `${uniquePrefix}-${safeName}`,
        Buffer.from(outBytes),
        {
          access: 'public',
          contentType: 'application/pdf',
        },
      );

      allowedPdfUrlSet.add(blob.url);

      dataStream.write({
        type: 'data-proposalPdfRevision',
        data: {
          previousUrl: sourcePdfUrl,
          newUrl: blob.url,
          name: safeName,
        },
        transient: true,
      });

      return {
        previousUrl: sourcePdfUrl,
        newUrl: blob.url,
        name: safeName,
        message:
          'Published a revised PDF (original pages + appended revision summary page) to blob storage.',
      };
    },
  });

  return { readUserProposalPdf, publishProposalPdfRevision };
}
