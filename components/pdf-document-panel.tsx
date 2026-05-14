'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Minus, Plus, FileText, Wand2 } from 'lucide-react';
import { useWindowSize } from 'usehooks-ts';

import { getActivePdf } from '@/lib/get-active-pdf';
import type { Attachment, ChatMessage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { PdfSelectionEditLayer } from '@/components/pdf-selection-edit-layer';
import { cn } from '@/lib/utils';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

function configurePdfWorker() {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

const FIND_EDITS_DOC_INTRO =
  'Review the proposal PDF for this chat: use the file attached with my outgoing message when present; otherwise use the proposal PDF already shared in the thread above. ';

const FIND_EDITS_PRESETS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Full review',
    prompt: `${FIND_EDITS_DOC_INTRO}Read the full document and suggest edits that would strengthen the proposal: clarity, structure, completeness, and persuasiveness. Reply with a numbered list; for each item, cite a section heading, table, or a short quoted phrase so I can find it in the PDF.`,
  },
  {
    label: 'Grammar & typos',
    prompt: `${FIND_EDITS_DOC_INTRO}Scan the document for grammar, spelling, punctuation, and awkward phrasing. Reply with a numbered list of fixes; quote or paraphrase the exact location (e.g. section title or a brief phrase) for each issue.`,
  },
  {
    label: 'Red flags',
    prompt: `${FIND_EDITS_DOC_INTRO}Identify possible red flags for a competitive bid: vague scope, compliance gaps, unrealistic commitments, inconsistent terminology, missing required information, risky assumptions, or anything that could hurt win probability. Reply with a numbered list and cite where in the document you found each concern.`,
  },
  {
    label: 'Numbers & consistency',
    prompt: `${FIND_EDITS_DOC_INTRO}Check dollar amounts, quantities, units, dates, and cross-references for internal consistency and obvious errors. Reply with a numbered list of discrepancies or things to verify; cite tables, line items, or section context.`,
  },
  {
    label: 'Tone & polish',
    prompt: `${FIND_EDITS_DOC_INTRO}Review tone and polish for a formal proposal: professionalism, redundancy, jargon, and flow. Reply with a numbered list of suggested improvements; reference section headings or short quotes where helpful.`,
  },
  {
    label: 'Executive summary',
    prompt: `${FIND_EDITS_DOC_INTRO}Focus on the executive summary and key win themes (or the opening sections if there is no explicit summary). Suggest edits to sharpen the narrative and differentiation. Reply with a numbered list tied to specific passages or headings.`,
  },
];

export function PdfDocumentPanel({
  messages,
  attachments,
  className,
  splitEdge = 'left',
  revisionOffer,
  onPdfEditToComposer,
  onFindEditsPrompt,
}: {
  messages: ChatMessage[];
  attachments: Attachment[];
  className?: string;
  splitEdge?: 'left' | 'top';
  revisionOffer?: {
    previousUrl: string;
    newUrl: string;
    name: string;
  } | null;
  onPdfEditToComposer?: (payload: {
    excerpt: string;
    instruction: string;
  }) => void;
  /** Appends a full-document review prompt to the chat composer (when PDF is active). */
  onFindEditsPrompt?: (prompt: string) => void;
}) {
  const activePdf = useMemo(
    () => getActivePdf(attachments, messages),
    [attachments, messages],
  );

  const [viewingRevision, setViewingRevision] = useState(false);

  useEffect(() => {
    setViewingRevision(false);
  }, [revisionOffer?.newUrl]);

  const viewerPdf = useMemo(() => {
    if (revisionOffer && viewingRevision) {
      return { url: revisionOffer.newUrl, name: revisionOffer.name };
    }
    return activePdf;
  }, [revisionOffer, viewingRevision, activePdf]);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(560);
  const { width: windowWidth } = useWindowSize();

  useEffect(() => {
    configurePdfWorker();
  }, []);

  useEffect(() => {
    setNumPages(null);
    setLoadError(null);
    setScale(1);
  }, [viewerPdf?.url]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width;
      if (w && w > 0) {
        setPageWidth(Math.floor(w - 8));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: nextNumPages }: { numPages: number }) => {
      setNumPages(nextNumPages);
      setLoadError(null);
    },
    [],
  );

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error(err);
    setLoadError(
      'Could not load this PDF. Try opening the file link from the chat.',
    );
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(0.5, Math.round((s - 0.15) * 100) / 100));
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(2.5, Math.round((s + 0.15) * 100) / 100));
  }, []);

  const isCompact = windowWidth ? windowWidth < 768 : false;

  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-0 min-w-0 bg-muted/30 dark:bg-background',
        splitEdge === 'top' ? 'border-t' : 'border-l',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-background/80 backdrop-blur-sm shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Document
          </p>
          <p className="text-sm font-medium truncate" title={viewerPdf?.name}>
            {viewerPdf?.name ?? 'No PDF yet'}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={!viewerPdf}
            onClick={zoomOut}
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </Button>
          <span className="text-xs tabular-nums w-12 text-center text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            disabled={!viewerPdf}
            onClick={zoomIn}
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {revisionOffer && (
        <div className="shrink-0 border-b bg-emerald-500/10 px-3 py-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-foreground">
            {viewingRevision
              ? 'Showing the published revision (includes an appended summary page).'
              : 'A revised PDF was published for this thread.'}
          </p>
          {!viewingRevision ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewingRevision(true)}
            >
              View revision
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={!activePdf}
              onClick={() => setViewingRevision(false)}
            >
              Back to original
            </Button>
          )}
        </div>
      )}

      {activePdf && onFindEditsPrompt && !loadError && (
        <div className="shrink-0 border-b bg-muted/20 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-2">
            <Wand2 className="size-3.5 text-muted-foreground shrink-0" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Find edits for me
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
            Adds a ready-made request below your message. Send when you are
            ready—the PDF goes with the attachment.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FIND_EDITS_PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs font-normal"
                onClick={() => onFindEditsPrompt(p.prompt)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
      >
        {!viewerPdf && (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground h-full min-h-[200px]">
            <FileText className="size-10 opacity-40" />
            <p className="text-sm max-w-[240px]">
              Upload a PDF with the attachment button. It appears here as you
              compose and after you send.
            </p>
            {revisionOffer && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => setViewingRevision(true)}
              >
                Open revised PDF
              </Button>
            )}
          </div>
        )}

        {viewerPdf && loadError && (
          <div className="p-4 text-sm text-destructive">{loadError}</div>
        )}

        {viewerPdf && !loadError && (
          <div className="flex flex-col items-center gap-3 py-3 px-1">
            <Document
              key={viewerPdf.url}
              file={viewerPdf.url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="text-sm text-muted-foreground py-12">
                  Loading PDF…
                </div>
              }
            >
              {numPages &&
                Array.from({ length: numPages }, (_, i) => (
                  <div
                    key={`page_wrap_${i + 1}`}
                    className="shadow-sm rounded-md border bg-background mb-3 last:mb-0"
                  >
                    <Page
                      pageNumber={i + 1}
                      width={Math.max(
                        120,
                        Math.floor(pageWidth * (isCompact ? 0.92 : 1)),
                      )}
                      scale={scale}
                      renderTextLayer
                      renderAnnotationLayer
                      className="rounded-md"
                    />
                  </div>
                ))}
            </Document>
          </div>
        )}

        {onPdfEditToComposer && (
          <PdfSelectionEditLayer
            scrollContainerRef={containerRef}
            enabled={Boolean(activePdf && !loadError && !viewingRevision)}
            onSubmitToComposer={onPdfEditToComposer}
          />
        )}
      </div>
    </div>
  );
}
