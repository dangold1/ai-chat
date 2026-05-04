# Part A — Server replies via OpenAI Chat Completions

## Goal

> Every time a user submits a message, the server responds with an answer from OpenAI's Chat Completion feature.
> **The bot must always sign each message with a different emoji.**

## Flow

```
client ──POST /chat {message, history}──▶ controller
                                          │
                                          ├─ Zod validate body
                                          │
                                          ├─ generateReply(history, message)
                                          │     ├─ pickEmoji()          ── different from last
                                          │     ├─ buildSystemPrompt(emoji)
                                          │     └─ createChatCompletion([sys, ...history, user])
                                          │
                                          └─ 200 { reply: { role:'assistant', content } }
```

## Files & responsibilities

| File | Role |
|------|------|
| `backend/src/controller/index.ts` | `POST /chat` route, Zod validation, error→status mapping. |
| `backend/src/service/chat.ts` | `generateReply` — composes system prompt, calls OpenAI, enforces emoji suffix. |
| `backend/src/service/emoji.ts` | `pickEmoji()` — rotates from a 30-emoji pool, never returns the previous one. |
| `backend/src/client/openai.ts` | `createChatCompletion()` — fetch + 20 s `AbortController`, typed errors. |
| `frontend/src/api/chat.ts` | Typed `sendChat(message, history)`, throws `ChatApiError`. |
| `frontend/src/views/ConversationView.tsx` | Optimistic user bubble, "agent is typing…" pending state, error fallback. |
| `frontend/src/ChatMessage/index.tsx` | Per-bubble styled-component (green=user, blue=assistant). |

## Emoji uniqueness

Implementation in `service/emoji.ts`:

```ts
const POOL = ['🌟','🎯','🚀', /* …30 total… */];
let last: string | null = null;

export function pickEmoji(): string {
    const choices = POOL.filter((e) => e !== last);
    const next = choices[Math.floor(Math.random() * choices.length)]!;
    last = next;
    return next;
}
```

- `last` lives at module scope → process-wide. Two consecutive replies are **guaranteed** to use different emojis.
- The choice is then injected into the system prompt and (belt-and-suspenders) appended in `service/chat.ts` if the model drops it:

```ts
const content = raw.trimEnd().endsWith(emoji) ? raw.trimEnd() : `${raw.trimEnd()} ${emoji}`;
```

## System prompt

```
You are a friendly chat assistant for Notch. Keep replies concise and helpful.
End every reply with this exact emoji and nothing after it: <emoji>.
Do not use any other emoji anywhere in the reply.
```

Single system message + the prior `user`/`assistant` history + the new `user` message — exactly the shape recommended by the OpenAI guide.

## Request / response contract

**Request**

```json
POST /chat
{
  "message": "hi there",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

Validation (Zod): trimmed `message` 1-4000 chars, history ≤ 50 items, each item ≤ 4000 chars, role ∈ {user, assistant}.

**Response**

```json
200 OK
{ "reply": { "role": "assistant", "content": "Hello! How can I help? 🚀" } }
```

**Errors**

| Status | Body                              | Cause                       |
|--------|-----------------------------------|-----------------------------|
| 400    | `{error:"bad_request", details}`  | Zod validation failed.      |
| 502    | `{error:"upstream_error"}`        | OpenAI 4xx/5xx.             |
| 504    | `{error:"upstream_timeout"}`      | 20 s `AbortController`.     |
| 500    | `{error:"internal_error"}`        | Anything else.              |

## OpenAI client

`backend/src/client/openai.ts::createChatCompletion`:

- Direct `fetch` — no SDK dependency.
- 20 s timeout via `AbortController`; aborts map to `OpenAITimeoutError`.
- `temperature: 0.8` for varied chat style.
- Empty/missing `choices[0].message.content` → `OpenAIError(502, 'empty completion')`.

## Frontend behavior

- User submit → optimistic local bubble appended; input disabled; `agent is typing…` shows.
- On 200, optimistic message replaced with server-issued `StoredMessage` (consistent ids), assistant reply appended.
- On error, an apologetic assistant bubble shows the error code (`upstream_timeout`, etc.).

## Why these choices

- **No OpenAI SDK** — keeps the dep tree small, gives explicit control over timeouts and error shapes.
- **Process-wide `last` emoji** — readme requires *different* per-message; full uniqueness across the run isn't required and would exhaust the pool.
- **Zod everywhere on input** — single source of truth for "what is a valid request", maps cleanly to 400.
- **Promise.allSettled with sentiment** (see Part B) — Part A reply must never fail because of a Part B failure.
