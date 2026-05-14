# Project outline — checklist

Product goal: upload a proposal PDF, interact with its content, drive AI edits on selected spans, review diffs, apply or discard, and compose edits with undo when feasible.

**Reference:** [AI SDK — Next.js: Chat with PDFs](https://ai-sdk.dev/cookbook/next/chat-with-pdf) (PDF-capable models, `convertToModelMessages`, file parts as data URLs, `streamText` / UI message stream).

---

## Basic loop

### 1. Upload PDF

- [ ] Choose upload entry point (dedicated flow vs. chat composer attachment).
- [ ] Validate file type, size limits, and error messaging.
- [ ] Persist or stage the PDF (memory, Blob, or server) per security and size constraints.
- [ ] Surface upload progress and failure recovery.

### 2. Render PDF in the browser (interactive)

- [ ] Pick rendering strategy (e.g. canvas/pdf.js, text layer, or hybrid).
- [ ] Ensure text is selectable and accessible (focus, keyboard where applicable).
- [ ] Sync scroll/zoom state with any side panels (chat, outline).
- [ ] Handle large documents (lazy pages, virtualization if needed).

### 3. Select a unit and prompt the AI

- [ ] Define selection unit (paragraph, block, page region, or structured chunk).
- [ ] Capture stable offsets or IDs for the selection relative to extracted/rendered text.
- [ ] Build prompt context: selected text + user instruction + optional KB context.
- [ ] Wire “actions” (rewrite, tighten, fix names, tone, enrich from KB, etc.) as presets or freeform.

### 4. Proposed change — review before apply

- [ ] Stream or display the model’s proposed replacement.
- [ ] Show **what changed** (inline diff, side-by-side, or highlight insert/delete).
- [ ] Clear **Apply** / **Discard** (and optional **Regenerate** with tweaked instruction).
- [ ] Log metadata for audit (optional): model, timestamp, instruction summary.

### 5. Apply, compose, undo

- [ ] Apply accepted edits into the working document model (not only chat transcript).
- [ ] Ensure multiple edits **compose** in order without clobbering prior spans (re-map offsets when content shifts).
- [ ] **Undo / redo** stack (or stepping history) if feasible; document limitations if not.
- [ ] Export or save final document state when required.

---

## Implementation track — Chat with PDFs cookbook

Aligns with [Chat with PDFs](https://ai-sdk.dev/cookbook/next/chat-with-pdf): multimodal messages with PDF file parts and a streaming chat route.

### Model and environment

- [x] Confirm a **PDF-capable** model and provider (per cookbook and provider docs).
- [x] Configure API keys / AI Gateway routing in env (e.g. `.env.local`).
- [ ] Document model choice and fallback policy if the primary model is unavailable.

### Backend (route handler)

- [ ] `POST` handler accepts `messages` (and any custom fields you add for selection metadata).
- [ ] Use `convertToModelMessages(messages)` so file parts map correctly for the provider.
- [ ] Call `streamText` (or equivalent) with the converted messages; return UI stream response (`toUIMessageStreamResponse` or project equivalent).
- [ ] Add guards: max message size, PDF count per request, timeouts, and safe error payloads.

### Frontend (chat + files)

- [ ] File input (or drop zone) for one or more PDFs; reset input after send.
- [ ] Convert selected files to **data URLs** (or another supported representation) with correct `mediaType` / `filename`.
- [ ] Send user messages with `parts`: `[{ type: 'text', text }, ...fileParts]` via `useChat` + transport (`DefaultChatTransport` / app pattern).
- [ ] Render assistant streams; handle file parts in the transcript if you show attachments.

### Integration with the product loop (beyond the cookbook)

- [ ] Decide whether the **same** chat sends full-document PDFs repeatedly or only **selection + excerpt** to control cost and latency.
- [ ] Thread **selection ranges** and **instruction** into the message body or structured metadata the server understands.
- [ ] Keep **document edit state** separate from chat history so apply/discard updates the PDF/text view, not only the thread.

---

## Cross-cutting

- [ ] Auth and tenancy (who can upload, rate limits).
- [ ] Telemetry and basic tests (upload, stream, apply path).
- [ ] Privacy: retention, PII in proposals, and whether PDFs leave the browser.
