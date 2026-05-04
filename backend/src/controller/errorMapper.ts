import type { Response } from 'express';
import { OpenAIError, OpenAITimeoutError } from '../client/openai';

export interface ErrorContext {
    requestId: string;
    conversationId?: string;
    extra?: Record<string, unknown>;
}

export function sendOpenAIError(res: Response, err: unknown, ctx: ErrorContext): void {
    const tag = ctx.conversationId
        ? `[${ctx.requestId}] [conv ${ctx.conversationId}]`
        : `[${ctx.requestId}]`;

    if (err instanceof OpenAITimeoutError) {
        console.error(`${tag} OpenAI timeout`);
        res.status(504).json({ error: 'upstream_timeout', ...(ctx.extra ?? {}) });
        return;
    }
    if (err instanceof OpenAIError) {
        console.error(`${tag} OpenAI error`, err.status, err.body);
        res.status(502).json({ error: 'upstream_error', ...(ctx.extra ?? {}) });
        return;
    }
    console.error(`${tag} unexpected error`, err);
    res.status(500).json({ error: 'internal_error', ...(ctx.extra ?? {}) });
}
