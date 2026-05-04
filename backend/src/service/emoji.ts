import { createChatCompletion } from '../client/openai';

// Per-scope "last emoji" so consecutive replies in the same scope always differ.
// Scope = conversationId for Part C, '*' (global) for the stateless /chat route.

const FALLBACK_POOL: readonly string[] = [
    '🌟', '✨', '🎉', '🙂', '😊', '😐', '🤔', '😔', '💔', '🔥', '🚀', '🌈',
];

const GLOBAL_SCOPE = '*';
const lastByScope = new Map<string, string>();

// Match a single emoji (incl. ZWJ-joined sequences) anywhere in the response.
const EMOJI_RE = /(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*)/u;

function extractEmoji(raw: string): string | null {
    return raw.match(EMOJI_RE)?.[1] ?? null;
}

function fallbackPick(last: string | null): string {
    const choices = FALLBACK_POOL.filter((e) => e !== last);
    return choices[Math.floor(Math.random() * choices.length)]!;
}

const SYSTEM_BASE =
    "Pick exactly ONE emoji that best matches the user's current feeling " +
    "based on their message. Reply with ONLY that emoji and nothing else.";

export async function pickEmoji(
    userMessage: string,
    scopeKey: string = GLOBAL_SCOPE
): Promise<string> {
    const last = lastByScope.get(scopeKey) ?? null;

    const system = last ? `${SYSTEM_BASE} Do not use this emoji: ${last}.` : SYSTEM_BASE;

    let chosen: string;
    try {
        const raw = await createChatCompletion(
            [
                { role: 'system', content: system },
                { role: 'user', content: userMessage },
            ],
            { temperature: 0 }
        );
        chosen = extractEmoji(raw) ?? fallbackPick(last);
    } catch {
        // Emoji classification must never fail the chat reply.
        chosen = fallbackPick(last);
    }

    if (chosen === last) chosen = fallbackPick(chosen);
    lastByScope.set(scopeKey, chosen);
    return chosen;
}
