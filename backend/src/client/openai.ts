import { config } from '../config';
import type { ChatMessage } from '../types';

export class OpenAIError extends Error {
    constructor(public status: number, public body: string) {
        super(`OpenAI error ${status}: ${body}`);
        this.name = 'OpenAIError';
    }
}

export class OpenAITimeoutError extends Error {
    constructor() {
        super('OpenAI request timed out');
        this.name = 'OpenAITimeoutError';
    }
}

export class OpenAIToolCallError extends Error {
    constructor(reason: string) {
        super(`OpenAI tool call error: ${reason}`);
        this.name = 'OpenAIToolCallError';
    }
}

export interface OpenAITool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 20_000;

const inFlight = new Set<AbortController>();

export function abortAllInFlight(): void {
    for (const controller of inFlight) controller.abort();
    inFlight.clear();
}

export async function createChatCompletion(
    messages: ChatMessage[],
    opts: { model?: string; temperature?: number } = {}
): Promise<string> {
    const controller = new AbortController();
    inFlight.add(controller);
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: opts.model ?? config.OPENAI_MODEL,
                messages,
                temperature: opts.temperature ?? 0.8,
            }),
            signal: controller.signal,
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new OpenAITimeoutError();
        }
        throw err;
    } finally {
        clearTimeout(timeout);
        inFlight.delete(controller);
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new OpenAIError(res.status, text);
    }

    const data: any = await res.json();
    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
        throw new OpenAIError(502, 'empty completion');
    }
    return content;
}

export async function createChatCompletionWithTool(
    messages: ChatMessage[],
    tool: OpenAITool,
    opts: { model?: string; temperature?: number } = {}
): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    inFlight.add(controller);
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
        res = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: opts.model ?? config.OPENAI_MODEL,
                messages,
                temperature: opts.temperature ?? 0,
                tools: [{ type: 'function', function: tool }],
                tool_choice: { type: 'function', function: { name: tool.name } },
            }),
            signal: controller.signal,
        });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new OpenAITimeoutError();
        }
        throw err;
    } finally {
        clearTimeout(timeout);
        inFlight.delete(controller);
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new OpenAIError(res.status, text);
    }

    const data: any = await res.json();
    const call: any = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call || call.type !== 'function' || call.function?.name !== tool.name) {
        throw new OpenAIToolCallError(`expected tool call '${tool.name}'`);
    }
    const rawArgs: unknown = call.function.arguments;
    if (typeof rawArgs !== 'string') {
        throw new OpenAIToolCallError('arguments missing or non-string');
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawArgs);
    } catch {
        throw new OpenAIToolCallError('arguments not valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new OpenAIToolCallError('arguments not an object');
    }
    return parsed as Record<string, unknown>;
}
