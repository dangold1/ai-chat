import type { ChatMessage, ChatReply } from '../types';
import { createChatCompletion } from '../client/openai';
import { pickEmoji } from './emoji';

const buildSystemPrompt = (emoji: string) =>
    `You are a friendly chat assistant for Notch. Keep replies concise and helpful. ` +
    `End every reply with this exact emoji and nothing after it: ${emoji}. ` +
    `Do not use any other emoji anywhere in the reply.`;

export async function generateReply(
    history: ChatMessage[],
    userMessage: string
): Promise<ChatReply> {
    const emoji = pickEmoji();

    const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(emoji) },
        ...history,
        { role: 'user', content: userMessage },
    ];

    const raw = await createChatCompletion(messages);

    // Belt-and-suspenders: models occasionally drop the emoji.
    const content = raw.trimEnd().endsWith(emoji) ? raw.trimEnd() : `${raw.trimEnd()} ${emoji}`;

    return { content };
}
