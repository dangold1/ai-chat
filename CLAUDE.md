# Notch AI Chat — Project CLAUDE.md

Mini chat app talking to OpenAI Chat Completions. Two services, no DB.

## Run

```bash
# Backend (port 3000) — needs backend/local.env with PORT, OPENAI_API_KEY, OPENAI_MODEL
cd backend && npm i && npm start

# Frontend (Vite dev server) — talks to http://localhost:3000
cd frontend && npm i && npm run dev
```

`backend/local.env` is gitignored in spirit (contains the key). `OPENAI_MODEL` defaults to `gpt-4o-mini`.

## Tech

- **Backend**: TypeScript, Express, Zod, dotenv, native `fetch` to OpenAI. No OpenAI SDK — direct REST.
- **Frontend**: React 18 + Vite + TypeScript + styled-components. No router lib — hash routing in `App.tsx`.
- **State**: in-memory `Map` on the server. No DB, no auth, no persistence. Server restart drops conversations by design (per Part C spec).

## Backend layering (industry-standard, enforced by structure)

```
backend/src/
  index.ts          # bootstrap: cors, json, controller, graceful shutdown
  config.ts         # zod-validated env loaded from local.env
  controller/       # HTTP layer: routing, validation, status codes
  service/          # use cases: prompt assembly, sentiment extraction, emoji rotation
  bl/               # stateful domain: in-memory conversationStore (Map)
  client/           # outbound integrations: openai REST + typed errors
  types.ts          # shared domain types (ChatRole, ChatMessage, ChatReply)
```

Rules:
- Controllers validate input with Zod, never call OpenAI directly.
- Services compose prompts and call `client/openai`. They never touch `req`/`res`.
- `client/openai.ts` owns timeouts (20s `AbortController`), HTTP error mapping (`OpenAIError`, `OpenAITimeoutError`, `OpenAIToolCallError`), and is the only place that talks to OpenAI.
- `bl/` holds domain state. Today that's `conversationStore` (Map keyed by UUID, with `appendMessage`, `toChatHistory`, etc.). Stored messages are user/assistant only — system prompts are composed per-call in services and never persisted.

## OpenAI patterns (preserve when extending)

- **Chat completion** → `service/chat.ts::generateReply`. Builds `[system, ...history, user]`, calls `createChatCompletion`, and re-appends the per-process rotating emoji (`service/emoji.ts`) if the model dropped it. Temperature 0.8.
- **Function calling for sentiment** → `service/sentiment.ts::extractUserSentiment`. Forces `tool_choice: { type: 'function', function: { name } }`, validates args with Zod, clamps to 0–100. Temperature 0.
- **Parallelism** → controller fires reply + sentiment via `Promise.allSettled` so sentiment failure never blocks the reply. Sentiment is logged (`console.log`), not surfaced to the client.
- **History snapshot** when appending in conversation routes: snapshot `toChatHistory(conv)` *before* `appendMessage('user', ...)`, because services append the new user message themselves. See `controller/index.ts:139-142`.
- **Error mapping** in controllers: `OpenAITimeoutError` → 504, `OpenAIError` → 502, anything else → 500.

## API surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthCheck` | Smoke test |
| POST | `/chat` | Stateless one-shot: `{ message, history }` → `{ reply }`. Kept for Part A/B compatibility. |
| GET | `/conversations` | List summaries sorted by `updatedAt` desc |
| POST | `/conversations` | Create empty conversation, returns full record |
| GET | `/conversations/:id` | Fetch with messages, 404 if missing |
| POST | `/conversations/:id/messages` | Append user msg, generate reply + sentiment in parallel, append assistant msg |

Both `/chat` and `/conversations/:id/messages` must keep the parallel reply + sentiment pattern.

## Frontend conventions

- `App.tsx` is a hash-router shell: `#/` → `<ConversationsList />`, `#/c/:id` → `<ConversationView />`. Empty hash is normalized to `#/`.
- `frontend/src/api/` mirrors backend route groups (`chat.ts`, `conversations.ts`). Both throw `ChatApiError(status, code)` on failure; UI translates `code === 'not_found'` into a friendly "server may have restarted" message.
- Optimistic UX: the user message is rendered immediately, then replaced with the server-issued `StoredMessage` after the request resolves. Send button disabled while `pending`.
- styled-components only, scoped per file. No global CSS beyond `reset.css`.
- Component layout: small components live in folders with `index.tsx` (`ChatMessage/`); page-level components live in `views/`.

## When adding features

- **New OpenAI capability** → add a typed function in `client/openai.ts` (own its timeout + error class), call it from a service, expose via a controller route.
- **New stored entity** → put it in `bl/` as a typed `Map`. Don't reach for a DB unless the spec changes.
- **New input** → validate with Zod at the controller boundary; never trust untyped `req.body`.
- **New error path** → throw a typed error from the client layer; map to status in the controller. Don't leak OpenAI bodies to the client.
- **New route on the frontend** → extend `parseHash` in `App.tsx`. Don't introduce `react-router` for a single new screen.

## Non-goals (don't add unless asked)

- Database, persistence beyond process memory
- Auth, sessions, users
- Streaming responses (SSE/WebSocket)
- A full router library
- Tests (the skeleton ships without a test runner; if added, jest/vitest + supertest is the obvious choice — confirm scope first)
- Backwards-compat shims for routes that haven't shipped externally

## Gotchas

- `tsc --watch & node --watch dist/index.js` in `backend/package.json`: an `EADDRINUSE` is expected during reload — the process exits and the watcher restarts it. Don't "fix" it.
- The emoji rotator (`service/emoji.ts`) tracks the last emoji per *process*, not per conversation. Acceptable for the spec but worth knowing if you parallelize requests.
- CORS is wide open (`cors()` with no options). Fine for local dev; tighten before any non-local deployment.
- Empty completions from OpenAI are mapped to `OpenAIError(502)` — don't silently return `""`.
