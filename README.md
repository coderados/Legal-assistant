# Legal Assistant

A Next.js web app for legal research and document drafting grounded in your uploaded legal reference materials. It uses **Agnes AI** for chat and drafting and **OpenAI** for embeddings.

> **Disclaimer:** This tool is for research and drafting assistance only. It is not a lawyer and does not provide legal advice. Always consult a qualified, licensed attorney before filing or relying on any generated document.

## Features

- **Source upload** — index PDFs and text files into a searchable vector store.
- **AI chat** — ask questions about U.S. federal and California law; answers cite your uploaded sources.
- **Document drafting** — generate demand letters, complaints, motions, contracts, and cease-and-desist letters.
- **Streaming responses** — chat replies stream in real time.

## Tech stack

- Next.js 16 (App Router)
- TypeScript + Tailwind CSS
- SQLite + `better-sqlite3` for persistence
- OpenAI embeddings (`text-embedding-3-small`)
- Agnes AI (`agnes-2.5-flash`) for chat/completions

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your API keys:

   ```bash
   cp .env.example .env
   ```

   - `AGNES_API_KEY` — from [platform.agnes-ai.com](https://platform.agnes-ai.com/)
   - `OPENAI_API_KEY` — from [platform.openai.com](https://platform.openai.com/)

3. Run the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Go to **Sources** and upload your legal books (PDF or plain text).
2. Go to **Chat** to ask legal questions.
3. Go to **Draft** to generate document templates.

## Deploying to Render

A `render.yaml` is included. To deploy:

1. Push this repo to GitHub.
2. In Render, create a new **Blueprint** from your repository.
3. Set the environment variables `AGNES_API_KEY` and `OPENAI_API_KEY` in the Render dashboard.

The SQLite database is stored on a Render disk mounted at `/var/data`.

## Legal data sources

Useful public repositories for U.S. and California law:

- [divegeek/uscode](https://github.com/divegeek/uscode) — United States Code
- [johnakelly-yahoo-com/california-codes](https://github.com/johnakelly-yahoo-com/california-codes) — California statutory codes
- [freelawproject/courtlistener](https://github.com/freelawproject/courtlistener) — Court opinions and filings

## License

MIT
