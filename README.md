# MeAI

[![CI](https://github.com/Asiel091307/MeAI/actions/workflows/ci.yml/badge.svg)](https://github.com/Asiel091307/MeAI/actions/workflows/ci.yml)
[![Image](https://github.com/Asiel091307/MeAI/actions/workflows/release.yml/badge.svg)](https://github.com/Asiel091307/MeAI/pkgs/container/meai)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Ask questions about your own PDFs and get answers grounded only in them, with the page they come from.**

MeAI is a small, readable **RAG** (*Retrieval-Augmented Generation*) application built to learn how RAG works end to end. You upload PDFs, MeAI indexes them in PostgreSQL with pgvector, and every answer is written only from the retrieved passages, streamed as it is generated, with citations you can open. When your documents do not contain the answer, MeAI says so instead of making one up.

Bring your own database and your own AI provider: **Gemini**, **OpenAI**, a **100 % local Ollama**, or any OpenAI-compatible service (OpenRouter, Groq, LM Studio…).

[Leer en español](README.es.md)

![MeAI: library, conversation with citations and the evidence panel](docs/images/meai-workspace.png)

## Features

- Text PDFs and scanned PDFs (offline OCR in Spanish and English).
- Chunking with configurable size and overlap, one embedding per chunk, cosine-similarity search in pgvector.
- Streaming answers with `[page]` citations, an evidence panel with the exact passages and their similarity, and an in-app PDF viewer.
- An explicit "not enough evidence" answer when the documents do not support one.
- Reprocess or delete documents (the PDF, its chunks and its embeddings go together).
- Embeddings and generation can use different providers. The app shows the active provider and its privacy level.

## Quick start (published image)

You need [Docker](https://docs.docker.com/get-docker/). No Node.js and no cloning.

```bash
mkdir meai && cd meai
curl -fsSLo compose.yaml https://raw.githubusercontent.com/Asiel091307/MeAI/main/deploy/compose.yaml
curl -fsSLo .env https://raw.githubusercontent.com/Asiel091307/MeAI/main/.env.example
```

On Windows PowerShell, use `curl.exe` instead of `curl`.

Edit `.env`: set `POSTGRES_PASSWORD` and pick **one** provider (the file has ready-to-uncomment templates). Then:

```bash
docker compose up -d
```

Open <http://127.0.0.1:3000>. The database tables are created on first start. Stop with `docker compose down`; your documents stay in the `postgres_data` volume (`down -v` deletes them).

### Choose your AI provider

| Option | What to set in `.env` | Privacy |
| --- | --- | --- |
| **Gemini** (default) | `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey) | Free tier: Google may use the text sent (chunks and questions) to improve its products. With billing enabled (`GEMINI_TIER=paid`) it does not. |
| **OpenAI** | `EMBEDDING_PROVIDER=openai-compatible`, `GENERATION_PROVIDER=openai-compatible`, `OPENAI_API_KEY` | Text is sent to OpenAI under its terms. |
| **Ollama, 100 % local** | Option 3 of `.env.example`, then `docker compose --profile ollama up -d` and pull the two models | Nothing leaves your machine. Needs ~4 GB of RAM for the small models. |
| **Other OpenAI-compatible** | `GENERATION_BASE_URL`, `GENERATION_API_KEY`, `GENERATION_MODEL` (and the same for embeddings) | Depends on the service. |

Embeddings and generation are configured separately (`EMBEDDING_*` and `GENERATION_*`), so you can, for example, embed locally with Ollama and answer with Gemini. The library footer shows the provider and a dot: green (local or paid), amber (free tier or external service), terracotta (a key is missing).

Changing the embedding model or its dimensions makes previous vectors incomparable: MeAI keeps searching only the documents indexed with the current model and tells you how many need **reprocessing**.

### Your own PostgreSQL

Set `DATABASE_URL=postgresql://user:password@host:5432/db` to use your own PostgreSQL 15+ with the `vector` extension available. MeAI applies its migrations on start.

> **Single user, no authentication.** MeAI has no login. Keep it on `127.0.0.1` (the compose files already do) and do not expose it to the internet.

## Run from source

```bash
git clone https://github.com/Asiel091307/MeAI.git && cd MeAI
cp .env.example .env   # set POSTGRES_PASSWORD and your provider
docker compose up -d --build
```

For development: Node.js 20+, `corepack enable` (pnpm 10.17.1), then:

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Next.js in development mode (needs the `db` service) |
| `pnpm lint`, `pnpm typecheck` | Static checks |
| `pnpm test` | Unit tests: RAG logic with fake providers and UI with happy-dom |
| `pnpm test:integration` | Real PostgreSQL + pgvector in Docker, real OCR, and a real Gemini call when `GEMINI_API_KEY` is set (port 3000 must be free) |
| `pnpm build`, `pnpm start` | Production build and server |

## How it works

```
PDF ──► text per page (pdf.js, or Tesseract OCR) ──► chunks (size / overlap)
    ──► embeddings ──► PostgreSQL + pgvector

Question ──► embedding ──► top-K nearest chunks (cosine) ──► grounded prompt
         ──► streamed answer + validated [FUENTES: …] citations ──► UI
```

| Folder | Contents |
| --- | --- |
| `app/`, `components/` | Next.js UI and thin HTTP routes (`app/api/`) |
| `src/rag/` | Ingestion (PDF, OCR, chunking), retrieval, answering and AI providers |
| `src/documents/` | Use cases: register, process, reprocess, delete |
| `src/db/`, `db/migrations/` | Plain SQL repositories and versioned migrations |
| `docs/` | Constitution, specs and tasks (spec-driven, in Spanish) |

The RAG logic never imports React or HTTP objects, and providers are plain `fetch` adapters behind small interfaces (`EmbeddingProvider`, `AnswerGenerator`). Every feature started as a spec in [`docs/specs/`](docs/specs/) with acceptance criteria and tests written first.

### Tunable parameters

| Variable | Default | Controls |
| --- | --- | --- |
| `CHUNK_SIZE` | `1000` | Characters per chunk |
| `CHUNK_OVERLAP` | `200` | Characters shared by consecutive chunks |
| `RETRIEVAL_TOP_K` | `5` | Chunks used as evidence per answer |

Reprocess your documents after changing the chunk size.

## Tech stack

TypeScript · Next.js 15 · React 19 · PostgreSQL 17 + pgvector · pdf.js · Tesseract.js · Vitest · Docker Compose · GitHub Actions (CI + multi-arch image on GHCR).

## License

[MIT](LICENSE)
