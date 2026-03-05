# OpenCouncil

**Multi-LLM Debate Platform** — Let AI models discuss, debate, and synthesize answers together.

OpenCouncil enables users to select multiple LLM models, have them debate a topic from different perspectives, and produce a synthesized conclusion grounded in real-world evidence.

---

## Features

- **Multi-LLM Support** — OpenAI (GPT-4o, GPT-4o-mini), Anthropic (Claude 3.5 Sonnet, Claude 3 Haiku), Google (Gemini 2.0 Flash, Gemini 1.5 Pro). Pick any 3 models per debate.
- **4 Debate Modes**
  - **Simultaneous** — All models answer in parallel, then synthesize.
  - **Round-based** — 3-round sequential debate with position bias prevention via model shuffling.
  - **Structured** — 4-phase debate with assigned roles (Advocate / Opponent / Mediator).
  - **Freeform** — 5-turn conversational debate with rolling context window.
- **RAG-Powered Context** — Tavily web search injects real-world evidence into every debate, so models argue with facts, not just training data.
- **Real-Time Streaming** — Server-Sent Events (SSE) with heartbeat deliver model responses as they generate.
- **LLM Synthesis** — After all models respond, a synthesis module merges perspectives into a unified conclusion.
- **Secure API Key Storage** — AES-256-GCM encryption with scrypt key derivation. User API keys are never stored in plaintext.
- **Authentication** — Google OAuth and email/password login via Auth.js v5.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | Neon PostgreSQL + Drizzle ORM |
| Auth | Auth.js v5 (NextAuth) |
| Styling | Tailwind CSS 4 |
| LLM SDKs | `openai`, `@anthropic-ai/sdk`, `@google/generative-ai` |
| Search (RAG) | Tavily API |
| Runtime | Bun |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (or Node.js 18+)
- PostgreSQL database ([Neon](https://neon.tech/) recommended)

### Installation

```bash
git clone https://github.com/MoerAI/OpenCouncil.git
cd OpenCouncil

bun install

cp .env.example .env.local
# Edit .env.local with your credentials

bun run db:push

bun run dev
```

The app will be available at `http://localhost:3000`.

---

## Environment Variables

Create a `.env.local` file based on `.env.example`:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `AUTH_SECRET` | Random secret for Auth.js session encryption |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AUTH_TRUST_HOST` | Set to `true` for Vercel deployment |
| `ENCRYPTION_MASTER_KEY` | Master key for API key encryption (AES-256-GCM) |
| `TAVILY_API_KEY` | Tavily API key for RAG web search |
| `OPENAI_API_KEY` | (Optional) Default OpenAI key for synthesis |

---

## Project Structure

```
src/
├── app/                        # Next.js App Router pages + API routes
│   ├── api/
│   │   ├── auth/               # Auth endpoints (OAuth, signup)
│   │   ├── debates/            # Debate CRUD + SSE streaming
│   │   └── keys/               # API key management
│   ├── auth/                   # Sign in / Sign up pages
│   ├── debates/                # Debate creation, history, results pages
│   └── settings/               # API key settings page
├── components/
│   ├── debate/                 # Debate UI components
│   ├── layout/                 # Header, navigation
│   └── settings/               # API key card
├── db/                         # Drizzle ORM schema + connection
├── hooks/                      # React hooks (useSSEDebate, useDebate)
├── lib/
│   ├── auth/                   # Auth helpers
│   ├── crypto/                 # API key encryption (AES-256-GCM + scrypt)
│   ├── debates/
│   │   ├── engines/            # 4 debate engine implementations
│   │   └── synthesis/          # LLM merge + prompt templates
│   ├── llm/                    # LLM provider adapters + fan-out
│   └── rag/                    # RAG pipeline (search, embeddings, context)
└── types/                      # TypeScript type definitions
```

---

## How It Works

1. **Select Models** — Choose 3 LLM models from any combination of providers.
2. **Choose Debate Type** — Pick one of 4 debate modes (simultaneous, round-based, structured, freeform).
3. **RAG Search** — The platform searches the web for relevant evidence using Tavily.
4. **Debate Execution** — The selected engine orchestrates the discussion, with each model responding from its own perspective, grounded in the retrieved evidence.
5. **Real-Time Streaming** — Responses stream to the client via SSE as models generate them.
6. **Synthesis** — A synthesis module merges all perspectives into a unified, balanced conclusion.

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server (Turbopack) |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run typecheck` | Run TypeScript type checking |
| `bun test` | Run test suite |
| `bun run db:push` | Push schema changes to database |
| `bun run db:studio` | Open Drizzle Studio |

---

## Testing

```bash
bun test
```

44 tests across 8 test files, with 170 assertions covering:

- API key encryption/decryption (AES-256-GCM)
- LLM fan-out execution
- All 4 debate engines (simultaneous, round-based, structured, freeform)
- RAG pipeline (search, context building)
- Synthesis module

---

## License

This project is licensed under the [Elastic License 2.0](LICENSE.md).

You may use, copy, distribute, and modify this software under the terms of the Elastic License 2.0. The license allows free use but prohibits providing the software as a managed service to third parties.

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request
