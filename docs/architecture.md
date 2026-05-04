# Architecture

## Overview

A two-tier mini-chat application:

- **Frontend** — React + Vite + TypeScript + styled-components SPA. Hash-routed (no react-router dep).
- **Backend** — Express + TypeScript proxy in front of the OpenAI Chat Completions API. In-memory conversation store. Stateless `/chat` route plus stateful `/conversations/*` routes.

```
┌────────────────────────┐         HTTP / JSON          ┌────────────────────────┐         HTTPS          ┌────────────┐
│ Frontend (Vite, :5173) │ ──────────────────────────▶ │ Backend (Express,:3000) │ ─────────────────────▶ │  OpenAI    │
│  React + styled-comp   │ ◀────────────────────────── │  controller / service   │ ◀───────────────────── │  Chat API  │
└────────────────────────┘                              └────────────────────────┘                        └────────────┘
       hash router                                              in-memory Map
       URL = source of truth                                    (lost on restart)
```

## Layers

### Backend (`backend/src/`)

| Layer        | File(s)                                | Responsibility                                                                 |
|--------------|----------------------------------------|--------------------------------------------------------------------------------|
| Bootstrap    | `index.ts`                             | Express app, CORS + JSON middleware, listen, graceful shutdown.                |
| Config       | `config.ts`                            | Loads `local.env` via dotenv, validates with Zod (`PORT`, `OPENAI_API_KEY`, `OPENAI_MODEL`). |
| Controller   | `controller/index.ts`                  | HTTP routes, Zod request validation, error→status mapping.                     |
| Service      | `service/chat.ts`, `service/sentiment.ts`, `service/emoji.ts` | Domain logic — reply generation, sentiment extraction, emoji rotation.        |
| Client       | `client/openai.ts`                     | Single fetch-based OpenAI client. Two entry points: plain completion + tool-call completion. Typed errors. |
| BL           | `bl/conversationStore.ts`              | In-memory `Map<id, Conversation>`. Title derivation, append, list, history conversion. |
| Types        | `types.ts`                             | Shared `ChatRole`, `ChatMessage`, `ChatReply`.                                 |

Strict separation: controllers never call OpenAI directly; services never know about Express.

### Frontend (`frontend/src/`)

| Layer       | File(s)                                       | Responsibility                                                              |
|-------------|-----------------------------------------------|-----------------------------------------------------------------------------|
| Bootstrap   | `main.tsx`, `App.tsx`                         | Mount root, parse `window.location.hash`, route between two views.          |
| Views       | `views/ConversationsList.tsx`, `views/ConversationView.tsx` | Two screens: list + per-conversation chat.                                  |
| Components  | `ChatMessage/index.tsx`                       | Single message bubble. User vs assistant styling.                           |
| API client  | `api/chat.ts`, `api/conversations.ts`         | Typed `fetch` wrappers, shared `ChatApiError`.                              |
| Styling     | styled-components inline; `App.css`, `reset.css` | Reset + per-component styles.                                               |

## Routing

Hash-based — no extra dep:

| Hash      | View                |
|-----------|---------------------|
| `#/`      | `ConversationsList` |
| `#/c/:id` | `ConversationView`  |

URL is the single source of truth for "which conversation is open" (refresh-safe).

## API surface

| Method | Path                              | Purpose                                                       |
|--------|-----------------------------------|---------------------------------------------------------------|
| GET    | `/healthCheck`                    | Liveness.                                                     |
| POST   | `/chat`                           | Stateless reply (Part A/B). Body: `{message, history?}`.      |
| GET    | `/conversations`                  | List summaries, sorted by `updatedAt` desc (Part C).          |
| POST   | `/conversations`                  | Create. Optional `{title}`.                                   |
| GET    | `/conversations/:id`              | Full conversation incl. messages.                             |
| POST   | `/conversations/:id/messages`     | Append user message, generate reply, return both.             |

Errors use stable string codes (`bad_request`, `not_found`, `upstream_error`, `upstream_timeout`, `internal_error`) so the frontend can branch on them.

## Concurrency model

For each user message the backend issues **two parallel OpenAI calls** via `Promise.allSettled`:

1. `generateReply(history, userMessage)` — Part A reply with emoji.
2. `extractUserSentiment(history, userMessage)` — Part B function-calling sentiment, logged to console.

Sentiment failure never blocks the reply — it is logged and swallowed.

## Persistence

| Layer    | Mechanism                                | Lifetime                       |
|----------|------------------------------------------|--------------------------------|
| Server   | `Map<string, Conversation>` in `bl/conversationStore.ts` | Until process restart.         |
| Client   | URL hash + server fetch on mount         | Across browser refresh; cleared if server restarts (404 → friendly banner). |

This satisfies the readme constraint: refreshing the **browser** preserves data, refreshing the **server** is allowed to lose it.

## Validation & error policy

- All request bodies parsed with Zod schemas (length caps: 4000 chars per message, ≤50 history items).
- OpenAI errors typed (`OpenAIError`, `OpenAITimeoutError`, `OpenAIToolCallError`); 20s timeout via `AbortController`.
- Mapping: timeout → 504, upstream HTTP error → 502, validation → 400, unknown → 500.

## Run instructions

```bash
# backend
cd backend && npm install
# create local.env with: PORT=3000  OPENAI_API_KEY=sk-...  (optional) OPENAI_MODEL=gpt-4o-mini
npm start    # tsc --watch + node --watch dist/index.js

# frontend (separate terminal)
cd frontend && npm install
npm run dev  # vite, default :5173
```

Node ≥ 18 (uses native `fetch` and `AbortController`).
