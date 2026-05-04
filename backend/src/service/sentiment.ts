import { z } from 'zod';
import type { ChatMessage } from '../types';
import {
    createChatCompletionWithTool,
    OpenAIToolCallError,
    type OpenAITool,
} from '../client/openai';

const SENTIMENT_PROMPT =
    "You rate the user's current sentiment on a 0-100 scale. " +
    '0 is very negative, 50 is neutral, 100 is very positive. ' +
    'Always call the `log_user_sentiment` function with a single integer.';

const LOG_USER_SENTIMENT_TOOL: OpenAITool = {
    name: 'log_user_sentiment',
    description:
        "Log the user's current sentiment as an integer from 0 (very negative) to 100 (very positive).",
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

const argsSchema = z.object({ sentiment: z.number().finite() });

export async function extractUserSentiment(
    history: ChatMessage[],
    userMessage: string
): Promise<number> {
    const messages: ChatMessage[] = [
        { role: 'system', content: SENTIMENT_PROMPT },
        ...history,
        { role: 'user', content: userMessage },
    ];

    const args = await createChatCompletionWithTool(messages, LOG_USER_SENTIMENT_TOOL, {
        temperature: 0,
    });

    const parsed = argsSchema.safeParse(args);
    if (!parsed.success) {
        throw new OpenAIToolCallError('invalid sentiment payload');
    }

    return Math.max(0, Math.min(100, Math.round(parsed.data.sentiment)));
}
