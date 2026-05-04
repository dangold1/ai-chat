// Per-scope "last emoji" so consecutive replies in the same scope always differ.
// Scope = conversationId for Part C, '*' (global) for the stateless /chat route.
//
// Emoji selection itself happens *inside* the reply LLM call (see chat.ts):
// the model is told to end its reply with an emoji that matches the user's
// feeling. This module only stores the previous emoji and provides extraction
// + fallback helpers so the controller can enforce uniqueness in code.

const FALLBACK_POOL: readonly string[] = [
    '🌟', '✨', '🎉', '🙂', '😊', '😐', '🤔', '😔', '💔', '🔥', '🚀', '🌈',
];

const GLOBAL_SCOPE = '*';
const lastByScope = new Map<string, string>();

// Match an emoji cluster (incl. ZWJ-joined sequences and trailing variation
// selectors / skin-tone modifiers).
const EMOJI_CLUSTER = '\\p{Extended_Pictographic}(?:\\u200d\\p{Extended_Pictographic})*';
const TRAILING_EMOJI_RE = new RegExp(`(${EMOJI_CLUSTER})\\s*$`, 'u');
const STRIP_TRAILING_EMOJI_RE = new RegExp(`(?:\\s*${EMOJI_CLUSTER})+\\s*$`, 'u');

export function getLastEmoji(scopeKey: string = GLOBAL_SCOPE): string | null {
    return lastByScope.get(scopeKey) ?? null;
}

export function setLastEmoji(emoji: string, scopeKey: string = GLOBAL_SCOPE): void {
    lastByScope.set(scopeKey, emoji);
}

export function extractTrailingEmoji(text: string): string | null {
    return text.trimEnd().match(TRAILING_EMOJI_RE)?.[1] ?? null;
}

export function stripTrailingEmoji(text: string): string {
    return text.replace(STRIP_TRAILING_EMOJI_RE, '').trimEnd();
}

export function pickFallbackEmoji(last: string | null): string {
    const choices = FALLBACK_POOL.filter((e) => e !== last);
    return choices[Math.floor(Math.random() * choices.length)]!;
}
