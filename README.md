# Buoyant take-home — AI chat with PDFs

Next.js app for uploading proposal PDFs, chatting with an AI about them, and driving edits with selection-aware workflows. Built on the Vercel AI SDK, Next.js App Router, Postgres (Drizzle), Redis (resumable streams), and Vercel Blob for file storage.

---

## What you need installed

These are **system-level** tools (not npm packages). Install them before cloning the repo.

| Requirement | Notes |
| --- | --- |
| **Node.js** | **20.x or newer** (LTS recommended). Next.js 15 and this toolchain expect a current Node release. |
| **pnpm** | The repo pins **`pnpm@9.12.3`** ([Corepack](https://nodejs.org/api/corepack.html): `corepack enable` then `corepack prepare pnpm@9.12.3 --activate`). |
| **Docker Engine** + **Docker Compose** | Used to run **PostgreSQL** and **Redis** locally (`docker compose up -d`). |

Optional, for end-to-end tests:

| Optional | Notes |
| --- | --- |
| **Playwright browsers** | After `pnpm install`, run `pnpm exec playwright install` so `@playwright/test` can launch Chromium (and any other configured projects). |

JavaScript dependencies themselves are installed with **`pnpm install`** (see below); you do not need to download those manually.

---

## Local setup

### 1. Clone and install npm dependencies

```bash
git clone <repository-url>
cd Buoyant-TakeHome
pnpm install
```

### 2. Environment variables

Copy the example file and fill in secrets:

```bash
cp .env.example .env.local
```

See [`.env.example`](./.env.example) for every variable. At minimum you will need:

- **`AUTH_SECRET`** — random string (e.g. `openssl rand -base64 32`).
- **`ANTHROPIC_AUTH_TOKEN`** — API key for the configured Anthropic-compatible endpoint (see comments in `.env.example` for Buoyant hiring proxy vs direct Anthropic).
- **`BLOB_READ_WRITE_TOKEN`** — [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) read/write token for uploads.
- **`POSTGRES_URL`** — Postgres connection string (local example below).
- **`REDIS_URL`** — e.g. `redis://localhost:6379` when using Docker Compose Redis.

Optional: **`XAI_API_KEY`**, **`AI_PROXY_BASE_URL`** — see `.env.example`.

### 3. Database and Redis (Docker)

From the repo root:

```bash
docker compose up -d
```

That starts **Postgres 16** and **Redis 7** with the settings in [`docker-compose.yml`](./docker-compose.yml). A matching local URL is:

```bash
POSTGRES_URL="postgresql://postgres:postgres@localhost:5432/buoyant"
```

### 4. Run migrations

```bash
pnpm db:migrate
```

### 5. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Useful scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Next.js dev server (Turbopack). |
| `pnpm build` | Migrate then production build. |
| `pnpm start` | Run production server (after `pnpm build`). |
| `pnpm lint` | ESLint + Biome. |
| `pnpm format` | Biome format. |
| `pnpm db:migrate` | Apply Drizzle migrations. |
| `pnpm db:studio` | Drizzle Studio. |
| `pnpm test` | Playwright e2e tests (`PLAYWRIGHT=True`). |

---

## Sample PDFs

Example civil-engineering proposals live under [`app/ExampleProposals/`](./app/ExampleProposals/README.txt) (`easy.pdf`, `hard.pdf`, and a `kb/` folder for knowledge-base context). See that README for how to use them.

---

## Full-document summary: hallucination spot-check

When evaluating **end-to-end full-document review** (not selection-local edits), we tracked a simple **hallucination metric**: each numbered suggestion was checked against the PDF while scrolling through [`hard.pdf`](./app/ExampleProposals/proposals/hard.pdf). Items that misstated or inverted what the document actually says were counted as hallucinations.

**Prompt used:**

> Review the proposal PDF for this chat: use the file attached with my outgoing message when present; otherwise use the proposal PDF already shared in the thread above. Read the full document and suggest edits that would strengthen the proposal: clarity, structure, completeness, and persuasiveness. Reply with a numbered list; for each item, cite a section heading, table, or a short quoted phrase so I can find it in the PDF.

**Outcome:** roughly **3 hallucinations in ~30 suggestions** (~**90%** grounded), which lines up with expectations for **Claude Opus–style natural summarization** when the read stays **under about 50k tokens** (often quoted around **~93%** accuracy for that class of task).

**Representative false positives (model vs PDF):**

1. **Team roles** — The model claimed roles were not defined for the five named people; the PDF **does** define who does what (e.g. PM, lead design).  
2. **Ryan Huseman experience (p. 15)** — The model called out “marine docking, sports arena turf, nature trails” as irrelevant to a water-treatment RFQ; the PDF’s **marine docking design** experience is plausibly on-scope, so “not relevant” was overstated.  
3. **Tenure math** — The model inferred “~2 years” at MECO from a 2023 start date and “13 years total”; from the evaluation date, **2023 is three years ago**, not two, so the reframing advice rested on a small arithmetic slip.

This is **spot-check methodology**, not a formal benchmark; it is still useful for comparing runs and for setting expectations when the model is asked to **invent editorial feedback** across a long PDF in one pass.

---

## License / privacy

This repository is configured as **`"private": true`** in `package.json`. Treat keys in `.env.local` as secrets and never commit them.
