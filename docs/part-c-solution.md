# Part C — Conversations

## Goal

> - User sees a list of ongoing conversations.
> - User can create a new conversation or enter an existing one.
> - Entering a conversation = the chat page from Part A.
> - "Back to list" works.
> - **Browser refresh must NOT lose data.**
> - **Server refresh MAY lose data** (no DB).

## Flow

```
┌────────────────────┐                ┌──────────────────────┐
│ ConversationsList  │  GET /conversations  ─▶ list           │
│  (#/)              │  POST /conversations ─▶ create  ────┐  │
└────────────────────┘                                      │  │
        ▲   click item                                      │  │
        │                                                   │  ▼
window.location.hash = '#/c/<id>'                       hashchange
        │                                                   │
        ▼                                                   ▼
┌────────────────────┐  GET /conversations/:id  ──▶ hydrate  │
│ ConversationView   │  POST /conversations/:id/messages ─▶  │
│  (#/c/:id)         │     append + reply (parallel sentiment)│
└────────────────────┘                                       │
        │  ← back                                            │
        └────────────────────────────────────────────────────┘
```

## Files & responsibilities

### Backend

| File | Role |
|------|------|
| `backend/src/bl/conversationStore.ts` | In-memory `Map<string, Conversation>`. CRUD, title derivation, history projection. |
| `backend/src/controller/index.ts` | Four routes: `GET/POST /conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`. |
| `backend/src/service/chat.ts` | Reused unchanged from Part A. |
| `backend/src/service/sentiment.ts` | Reused unchanged from Part B; conversation id appears in the log line. |

### Frontend

| File | Role |
|------|------|
| `frontend/src/App.tsx` | Hash router — `parseHash()` returns `{name:'list'}` or `{name:'conversation', id}`. Listens to `hashchange`. |
| `frontend/src/views/ConversationsList.tsx` | Loads list, "+ New conversation" button, click-to-open. |
| `frontend/src/views/ConversationView.tsx` | Loads by id, optimistic send, error/`not_found` banners, "← Back". |
| `frontend/src/api/conversations.ts` | `listConversations`, `createConversation`, `getConversation`, `sendConversationMessage`. Reuses `ChatApiError`. |

## Server-side memory

`bl/conversationStore.ts`:

```ts
const conversations = new Map<string, Conversation>();

export interface Conversation {
    id: string;          // randomUUID()
    title: string;       // derived from first user message, capped to 60 chars
    createdAt: number;
    updatedAt: number;
    messages: StoredMessage[];   // role: 'user' | 'assistant'
}
```

- Module-level `Map`, no DB. **Lost on server restart by design** (readme allows this).
- `createConversation()` → UUID + `'New conversation'` placeholder.
- First user message that arrives while title is still placeholder triggers `deriveTitle(content)` (whitespace-collapsed, ≤60 chars with `…`).
- `listConversations()` returns summaries sorted by `updatedAt` desc, including `messageCount`.
- System prompt is **never persisted** — it is composed fresh in `service/chat.ts` per call. Stored roles are restricted to `'user' | 'assistant'`.
- `toChatHistory(conv)` projects stored messages → the `ChatMessage[]` shape OpenAI expects.

## Browser-refresh safety (the key requirement)

> "Refreshing the browser should not lead to loss of data."

Strategy: **the URL is the source of truth, the server holds the data.** The frontend stores nothing in React state that survives across reloads — instead:

1. Navigation sets `window.location.hash = '#/c/<id>'`.
2. Refresh re-runs `App.tsx → parseHash(window.location.hash)` and re-routes to `ConversationView`.
3. `ConversationView` mounts and calls `GET /conversations/:id`.
4. Server returns the full message list; the view re-hydrates.

No `localStorage`, no Redux, no React-Router — minimum viable complexity.

`App.tsx`:

```ts
function parseHash(hash: string): Route {
    const clean = hash.replace(/^#/, '');
    const match = clean.match(/^\/c\/([^/?#]+)/);
    if (match && match[1]) return { name: 'conversation', id: decodeURIComponent(match[1]) };
    return { name: 'list' };
}
```

## What happens on server restart

The readme allows this case to lose data — but we degrade gracefully:

- `GET /conversations/:id` returns `404 { error: 'not_found' }`.
- `ConversationView` catches `ChatApiError` with code `not_found` and renders:

```
This conversation no longer exists. The server may have restarted.
[← Back]
```

The user can return to the (now-empty) list and create a new conversation.

## API contracts

```
GET /conversations
  → 200 { conversations: ConversationSummary[] }    sorted by updatedAt desc

POST /conversations          (body: { title? })
  → 201 { conversation: { id, title, createdAt, updatedAt, messages: [] } }

GET /conversations/:id
  → 200 { conversation: { id, title, createdAt, updatedAt, messages } }
  → 404 { error: 'not_found' }

POST /conversations/:id/messages   (body: { message })
  → 200 { userMessage: StoredMessage, reply: StoredMessage,
           conversation: { id, title, updatedAt } }
  → 404 { error: 'not_found' }
  → 502 / 504 / 500 with userMessage retained when applicable
```

`StoredMessage = { id, role, content, createdAt }` — the server stamps both ids and timestamps so the frontend can replace its optimistic placeholder cleanly.

## Send-message subtleties

`POST /conversations/:id/messages` (controller/index.ts):

1. Snapshot history **before** appending the new user message — `generateReply` adds the user message itself when composing the OpenAI prompt, so we must not double-send.
2. Append the user message immediately so it survives even if OpenAI fails.
3. Run `generateReply` and `extractUserSentiment` in parallel via `Promise.allSettled` (same pattern as `/chat`).
4. On success: append the assistant message, return both.
5. On OpenAI failure: still return the persisted `userMessage` in the error body so the frontend can keep its optimistic bubble.

## Frontend send flow (`ConversationView.tsx`)

1. Submit → push optimistic `IChatMessage` (local UUID, role `user`).
2. Disable input, show "agent is typing…" bubble.
3. Call `sendConversationMessage(id, message)`.
4. On success: replace the optimistic bubble's id with the server-issued `userMessage`, append the assistant `reply`.
5. On failure: append a synthetic assistant bubble explaining the error code (`upstream_timeout`, `not_found`, etc.).

## Why these choices

- **URL-as-state, server-as-store** — exactly meets "browser refresh keeps data, server refresh may lose it" with no extra dependency. No `react-router`, no `localStorage` schema to migrate.
- **Module-level `Map`** — simplest possible store; matches the "no DB" constraint and remains trivial to swap for Redis/Postgres later (one file, one interface).
- **Server stamps message ids and timestamps** — frontend optimistic UI stays consistent without inventing fake ids that diverge from the server's view.
- **Snapshot history before append** — prevents the "user message appears twice in the prompt" bug that's easy to introduce when reusing `generateReply` from Part A.
- **Stored roles are `user|assistant` only** — system prompts are runtime-composed, never persisted, so they can change without touching stored data.
- **Same parallel pattern as `/chat`** — Part B sentiment runs for free in conversations too; the only addition is the `convId` in the log line.
