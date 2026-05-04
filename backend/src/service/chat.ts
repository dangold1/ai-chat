import type { ChatMessage, ChatReply } from '../types';
import { createChatCompletion } from '../client/openai';
import {
    extractTrailingEmoji,
    getLastEmoji,
    pickFallbackEmoji,
    setLastEmoji,
    stripTrailingEmoji,
} from './emoji';

const buildSystemPrompt = (last: string | null) =>
    `You are a friendly chat assistant for Notch. Keep replies concise and helpful. ` +
    `End every reply with EXACTLY ONE emoji that reflects the user's current feeling ` +
    `based on their latest message. The emoji must be the very last character of your reply, ` +
    `with nothing after it. Do not use any other emoji anywhere else in the reply.` +
    (last ? ` IMPORTANT: do NOT use this emoji: ${last}.` : '');

export async function generateReply(
    history: ChatMessage[],
    userMessage: string,
    opts: { conversationId?: string } = {}
): Promise<ChatReply> {
    const scope = opts.conversationId;
    const last = getLastEmoji(scope);

    const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(last) },
        ...history,
        { role: 'user', content: userMessage },
    ];

    const raw = (await createChatCompletion(messages)).trimEnd();

    // Enforce "different from previous emoji" in code, since the model may
    // ignore the prompt-level constraint or omit the emoji entirely.
    const extracted = extractTrailingEmoji(raw);
    let emoji: string;
    let content: string;

    if (extracted && extracted !== last) {
        emoji = extracted;
        content = raw;
    } else {
        emoji = pickFallbackEmoji(last);
        content = `${stripTrailingEmoji(raw)} ${emoji}`;
    }

    setLastEmoji(emoji, scope);
    return { content };
}
