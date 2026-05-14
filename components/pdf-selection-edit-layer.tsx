'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { SparklesIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const MIN_EXCERPT_CHARS = 12;
const MAX_EXCERPT_PREVIEW = 600;

const PRESETS: Array<{ label: string; instruction: string }> = [
  {
    label: 'Rewrite',
    instruction: 'Rewrite the excerpt for clarity and flow.',
  },
  { label: 'Tighten', instruction: 'Tighten the wording; remove redundancy.' },
  {
    label: 'Grammar here',
    instruction:
      'Fix grammar, spelling, punctuation, and awkward phrasing in this excerpt only.',
  },
  {
    label: 'Red flags',
    instruction:
      'Review this excerpt for bid risks: vague scope, compliance issues, unrealistic promises, or internal inconsistencies. Say what to change.',
  },
  {
    label: 'Fix names',
    instruction:
      'Fix entity names, titles, and proper nouns for consistency and accuracy.',
  },
  {
    label: 'Formal tone',
    instruction: 'Revise to a more formal, proposal-appropriate tone.',
  },
  {
    label: '+ KB context',
    instruction:
      'Enrich this section with relevant detail from the knowledge base where supported by facts.',
  },
];

function nodeInside(container: HTMLElement, node: Node | null): boolean {
  if (!node) {
    return false;
  }
  const el =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  return el ? container.contains(el) : false;
}

function readPdfSelection(
  scrollRoot: HTMLElement,
): { excerpt: string; rect: DOMRect } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    return null;
  }

  const range = sel.getRangeAt(0);
  if (!nodeInside(scrollRoot, range.commonAncestorContainer)) {
    return null;
  }

  const excerpt = sel
    .toString()
    .replace(/\u00a0/g, ' ')
    .trim();
  if (excerpt.length < MIN_EXCERPT_CHARS) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return { excerpt, rect };
}

export function PdfSelectionEditLayer({
  scrollContainerRef,
  enabled,
  onSubmitToComposer,
}: {
  scrollContainerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onSubmitToComposer: (payload: {
    excerpt: string;
    instruction: string;
  }) => void;
}) {
  const [pick, setPick] = useState<{
    excerpt: string;
    rect: DOMRect;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const barRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => {
    setPick(null);
    setExpanded(false);
    setInstruction('');
    window.getSelection()?.removeAllRanges();
  }, []);

  const syncFromSelection = useCallback(() => {
    if (!enabled) {
      return;
    }
    if (expanded) {
      return;
    }
    const root = scrollContainerRef.current;
    if (!root) {
      return;
    }
    const next = readPdfSelection(root);
    setPick(next);
  }, [enabled, expanded, scrollContainerRef]);

  useEffect(() => {
    if (!enabled) {
      closeAll();
    }
  }, [enabled, closeAll]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const root = scrollContainerRef.current;
    let raf = 0;

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncFromSelection);
    };

    const onScroll = () => {
      closeAll();
    };

    root?.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('selectionchange', schedule);
    root?.addEventListener('mouseup', schedule);

    return () => {
      cancelAnimationFrame(raf);
      root?.removeEventListener('scroll', onScroll);
      document.removeEventListener('selectionchange', schedule);
      root?.removeEventListener('mouseup', schedule);
    };
  }, [enabled, scrollContainerRef, syncFromSelection, closeAll]);

  useEffect(() => {
    if (!pick && !expanded) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAll();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pick, expanded, closeAll]);

  useEffect(() => {
    if (!pick && !expanded) {
      return;
    }

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (barRef.current?.contains(t)) {
        return;
      }
      const root = scrollContainerRef.current;
      if (root?.contains(t)) {
        return;
      }
      closeAll();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [pick, expanded, closeAll, scrollContainerRef]);

  const openEditor = useCallback(() => {
    if (!pick) {
      return;
    }
    setExpanded(true);
    setInstruction('');
    window.getSelection()?.removeAllRanges();
  }, [pick]);

  const handleAddToComposer = useCallback(() => {
    if (!pick) {
      return;
    }
    const trimmed = instruction.trim();
    if (!trimmed) {
      return;
    }
    onSubmitToComposer({ excerpt: pick.excerpt, instruction: trimmed });
    closeAll();
  }, [pick, instruction, onSubmitToComposer, closeAll]);

  if (!enabled || (!pick && !expanded)) {
    return null;
  }

  const excerptPreview =
    pick && pick.excerpt.length > MAX_EXCERPT_PREVIEW
      ? `${pick.excerpt.slice(0, MAX_EXCERPT_PREVIEW)}…`
      : (pick?.excerpt ?? '');

  const anchor = pick?.rect;
  const barWidth = expanded ? 360 : 220;
  const margin = 8;
  let top = anchor ? anchor.bottom + margin : margin;
  let left = anchor ? anchor.left + anchor.width / 2 - barWidth / 2 : margin;

  if (typeof window !== 'undefined') {
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - barWidth - margin),
    );
    const barHeight = expanded ? 280 : 48;
    if (top + barHeight > window.innerHeight - margin) {
      top = Math.max(
        margin,
        (anchor ? anchor.top : margin + barHeight) - barHeight - margin,
      );
    }
  }

  return (
    <div
      ref={barRef}
      data-pdf-edit-toolbar
      className={cn(
        'fixed z-[60] rounded-lg border bg-background text-foreground shadow-lg',
        expanded ? 'w-[min(92vw,360px)] p-3' : 'px-1 py-1',
      )}
      style={{
        top,
        left,
        width: expanded ? undefined : 'auto',
        minWidth: expanded ? undefined : 200,
      }}
    >
      {!expanded && pick && (
        <div className="flex items-center gap-1 pr-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-1.5 h-8"
            onClick={openEditor}
          >
            <SparklesIcon size={14} />
            Edit with AI
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-muted-foreground"
            onClick={closeAll}
          >
            Dismiss
          </Button>
        </div>
      )}

      {expanded && pick && (
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Selected from PDF
            </p>
            <div className="max-h-28 overflow-y-auto rounded-md border bg-muted/40 px-2 py-1.5 text-xs leading-relaxed whitespace-pre-wrap">
              {excerptPreview}
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setInstruction(p.instruction)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          <div>
            <label
              htmlFor="pdf-edit-instruction"
              className="text-xs font-medium text-muted-foreground"
            >
              What should the model do?
            </label>
            <Textarea
              id="pdf-edit-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Shorten this to one paragraph and keep dollar amounts."
              className="mt-1 min-h-[88px] text-sm resize-y"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeAll}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!instruction.trim()}
              onClick={handleAddToComposer}
            >
              Append to message
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
