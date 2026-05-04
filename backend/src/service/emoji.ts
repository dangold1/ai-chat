// Per-process "last emoji" so consecutive replies always differ.
// Per-conversation tracking is Part C territory.

const POOL: readonly string[] = [
    '🌟', '🎯', '🚀', '🔥', '✨', '🌈', '🎨', '🦄', '🍀', '🎁',
    '🌸', '🍕', '🎵', '🐳', '🌊', '☀️', '🍎', '🦊', '🐝', '🌻',
    '🪐', '⚡', '🍩', '🎈', '🧠', '📚', '🛟', '🧩', '🌙', '🍉',
];

let last: string | null = null;

export function pickEmoji(): string {
    const choices = POOL.filter((e) => e !== last);
    const next = choices[Math.floor(Math.random() * choices.length)]!;
    last = next;
    return next;
}
