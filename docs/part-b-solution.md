# Part B — Sentiment extraction via OpenAI function calling

## Goal

> Use OpenAI's function-calling interface to rate the user's current sentiment from 0 (very negative) to 100 (very positive).
> Print the result to the console (stand-in for a DB write in a real app).

## Flow

```
controller (POST /chat or /conversations/:id/messages)
   │
   ├─ generateReply(...)               ─┐
   │                                    ├─ Promise.allSettled (parallel)
   └─ extractUserSentiment(...)         ─┘
        │
        ├─ system prompt + history + user
        ├─ createChatCompletionWithTool(messages, log_user_sentiment)
        │     tool_choice = forced
        │     temperature = 0
        ├─ Zod-validate parsed args
        └─ clamp to [0,100], round → integer
                  │
                  ▼
        console.log("User sentiment: 73")
```

The reply path and the sentiment path run **in parallel**, exactly as the readme tip suggests:

```ts
const [replyResult, sentimentResult] = await Promise.allSettled([
    generateReply(history, message),
    extractUserSentiment(history, message),
]);

if (sentimentResult.status === 'fulfilled') {
    console.log(`User sentiment: ${sentimentResult.value}`);
} else {
    console.warn('[sentiment] extraction failed', sentimentResult.reason);
}
```

Sentiment failure **never blocks** the user-visible reply.

## Files & responsibilities

| File | Role |
|------|------|
| `backend/src/service/sentiment.ts` | `extractUserSentiment` — defines the tool schema, validates args, clamps result. |
| `backend/src/client/openai.ts` | `createChatCompletionWithTool` — generic forced-tool-call helper, parses `tool_calls[0]`. |
| `backend/src/controller/index.ts` | Calls `extractUserSentiment` in parallel with `generateReply` for both `/chat` and `/conversations/:id/messages`. |

## Tool definition

`service/sentiment.ts`:

```ts
const LOG_USER_SENTIMENT_TOOL: OpenAITool = {
    name: 'log_user_sentiment',
    description: "Log the user's current sentiment as an integer from 0 (very negative) to 100 (very positive).",
    parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['sentiment'],
        properties: {
            sentiment: {
                type: 'integer',
                minimum: 0,
                maximum: 100,
                description: 'Sentiment score: 0 = very negative, 50 = neutral, 100 = very positive.',
            },
        },
    },
};
```

## System prompt

```
You rate the user's current sentiment on a 0-100 scale.
0 is very negative, 50 is neutral, 100 is very positive.
Always call the `log_user_sentiment` function with a single integer.
```

Combined with `tool_choice: { type:'function', function:{ name:'log_user_sentiment' } }`, this **forces** the model to call the tool — no free-text fallback.

## OpenAI client (`createChatCompletionWithTool`)

Hardened parsing:

| Check | Failure |
|-------|---------|
| `tool_calls[0]` exists, type `function`, name matches | `OpenAIToolCallError("expected tool call …")` |
| `arguments` is a string                              | `OpenAIToolCallError("arguments missing or non-string")` |
| `JSON.parse(arguments)` succeeds                     | `OpenAIToolCallError("arguments not valid JSON")` |
| Parsed value is a non-array object                   | `OpenAIToolCallError("arguments not an object")` |

Then in `extractUserSentiment`:

```ts
const parsed = argsSchema.safeParse(args);   // z.object({ sentiment: z.number().finite() })
if (!parsed.success) throw new OpenAIToolCallError('invalid sentiment payload');
return Math.max(0, Math.min(100, Math.round(parsed.data.sentiment)));
```

Defense in depth: the JSON-Schema constraint runs server-side at OpenAI, **and** Zod re-checks, **and** we clamp/round on our side.

## Configuration

- `temperature: 0` for deterministic scoring.
- Same `OPENAI_MODEL` as Part A (`gpt-4o-mini` by default — supports parallel function calling and is cheap).

## Output

Console only, per the readme:

```
User sentiment: 78
User sentiment (conv 9c1e3e4f-…): 12   ← Part C variant
```

In the conversation route we include the `convId` so logs are attributable when multiple chats run.

## Why these choices

- **Forced tool call** — turns a soft prompt into a structured contract; no string-parsing of free-form numbers.
- **Parallel via `Promise.allSettled`** — A and B are independent OpenAI calls, so running them in parallel halves wall-clock latency and isolates failure.
- **Zod + clamp** — the model can technically still emit `"sentiment": 110` if SDKs change; clamping keeps the downstream contract honest.
- **Single shared client (`openai.ts`)** — the tool-call helper and the plain helper share auth, timeout, and error types so both paths fail predictably.
