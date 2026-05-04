import type { ChatMessage, ChatReply } from '../types';
import { generateReply } from './chat';
import { extractUserSentiment } from './sentiment';

export interface ChatTurnResult {
    reply: ChatReply;
    sentiment: number | null;
}

export interface ChatTurnOpts {
    requestId: string;
    conversationId?: string;
}

export async function runChatTurn(
    history: ChatMessage[],
    userMessage: string,
    opts: ChatTurnOpts
): Promise<ChatTurnResult> {
    const [replyResult, sentimentResult] = await Promise.allSettled([
        generateReply(history, userMessage, { conversationId: opts.conversationId }),
        extractUserSentiment(history, userMessage),
    ]);

    const tag = opts.conversationId
        ? `[${opts.requestId}] [conv ${opts.conversationId}]`
        : `[${opts.requestId}]`;

    let sentiment: number | null = null;
    if (sentimentResult.status === 'fulfilled') {
        sentiment = sentimentResult.value;
        console.log(`${tag} User sentiment: ${sentiment}`);
    } else {
        console.warn(`${tag} sentiment extraction failed`, sentimentResult.reason);
    }

    if (replyResult.status === 'rejected') {
        throw replyResult.reason;
    }

    return { reply: replyResult.value, sentiment };
}
