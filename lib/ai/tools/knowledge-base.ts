import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { getKnowledgeBaseRoot } from '@/lib/knowledge-base/root';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown']);
const PDF_EXTENSION = '.pdf';
const MAX_RETURN_CHARS = 100_000;

function safeKbFilename(input: string): string {
  const base = path.basename(input.trim());
  if (!base || base === '.' || base === '..') {
    throw new Error('Invalid file name');
  }
  if (base !== input.trim()) {
    throw new Error('Use a file name only, not a path');
  }
  return base;
}

function resolveKbFile(fileName: string): string {
  const safe = safeKbFilename(fileName);
  const root = path.resolve(getKnowledgeBaseRoot());
  const resolved = path.resolve(root, safe);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Invalid path');
  }
  return resolved;
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_RETURN_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, MAX_RETURN_CHARS)}\n\n[Truncated: document exceeds ${MAX_RETURN_CHARS} characters. Ask for a specific section or use listKnowledgeBase to pick another file.]`,
    truncated: true,
  };
}

async function readPdfText(absPath: string): Promise<string> {
  const buffer = await fs.readFile(absPath);
  const pdfParse = (await import('pdf-parse')).default;
  const parsed = await pdfParse(buffer);
  return parsed.text ?? '';
}

export const listKnowledgeBase = tool({
  description:
    'List files in the on-disk knowledge base (reference SOQs and PDFs). Call this before readKnowledgeBaseDocument to discover exact file names.',
  inputSchema: z.object({}),
  execute: async () => {
    const root = getKnowledgeBaseRoot();
    let names: string[];
    try {
      names = await fs.readdir(root);
    } catch (error) {
      return {
        error: `Could not read knowledge base directory: ${root}`,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const files = (
      await Promise.all(
        names
          .filter((n) => !n.startsWith('.'))
          .map(async (name) => {
            const abs = path.join(root, name);
            const st = await fs.stat(abs);
            if (!st.isFile()) {
              return null;
            }
            return { name, sizeBytes: st.size };
          }),
      )
    ).filter((e): e is { name: string; sizeBytes: number } => e !== null);

    files.sort((a, b) => a.name.localeCompare(b.name));

    return {
      root,
      files,
      hint: 'Use readKnowledgeBaseDocument with one of the file names to load text for grounding.',
    };
  },
});

export const readKnowledgeBaseDocument = tool({
  description:
    'Read a knowledge base file by name (PDF, .txt, or .md). Returns extracted text for use as reference context when analyzing user PDFs or drafting proposal content.',
  inputSchema: z.object({
    fileName: z
      .string()
      .describe('Exact file name from listKnowledgeBase, e.g. hannibal_demolition_soq.pdf'),
  }),
  execute: async ({ fileName }) => {
    let absPath: string;
    try {
      absPath = resolveKbFile(fileName);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        fileName,
      };
    }
    let st: Awaited<ReturnType<typeof fs.stat>>;
    try {
      st = await fs.stat(absPath);
    } catch {
      return { error: `File not found: ${fileName}` };
    }
    if (!st.isFile()) {
      return { error: `Not a file: ${fileName}` };
    }

    const ext = path.extname(fileName).toLowerCase();
    let rawText: string;

    try {
      if (ext === PDF_EXTENSION) {
        rawText = await readPdfText(absPath);
      } else if (TEXT_EXTENSIONS.has(ext)) {
        rawText = await fs.readFile(absPath, 'utf8');
      } else {
        return {
          error: `Unsupported extension ${ext}. Use PDF, .txt, or .md.`,
          fileName,
        };
      }
    } catch (error) {
      return {
        error: `Failed to read ${fileName}`,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const { text, truncated } = truncate(rawText.trim() || '');
    return {
      fileName,
      characterCount: text.length,
      truncated,
      text,
    };
  },
});
