import express from "express";
import { z } from "zod";
import { generateReply } from "../service/chat";
import { extractUserSentiment } from "../service/sentiment";
import { OpenAIError, OpenAITimeoutError } from "../client/openai";
import {
    appendMessage,
    createConversation,
    getConversation,
    listConversations,
    toChatHistory,
} from "../bl/conversationStore";

const router = express.Router();

router.get('/healthCheck', (_req, res) => {
    res.send('Hello world!');
});

const chatRequestSchema = z.object({
    message: z.string().trim().min(1).max(4000),
    history: z
        .array(
            z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string().min(1).max(4000),
            })
        )
        .max(50)
        .optional()
        .default([]),
});

router.post('/chat', async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'bad_request', details: parsed.error.issues });
        return;
    }

    const { message, history } = parsed.data;

    const [replyResult, sentimentResult] = await Promise.allSettled([
        generateReply(history, message),
        extractUserSentiment(history, message),
    ]);

    if (sentimentResult.status === 'fulfilled') {
        console.log(`User sentiment: ${sentimentResult.value}`);
    } else {
        console.warn('[sentiment] extraction failed', sentimentResult.reason);
    }

    if (replyResult.status === 'fulfilled') {
        res.status(200).json({
            reply: { role: 'assistant', content: replyResult.value.content },
        });
        return;
    }

    const err = replyResult.reason;
    if (err instanceof OpenAITimeoutError) {
        console.error('[chat] OpenAI timeout');
        res.status(504).json({ error: 'upstream_timeout' });
        return;
    }
    if (err instanceof OpenAIError) {
        console.error('[chat] OpenAI error', err.status, err.body);
        res.status(502).json({ error: 'upstream_error' });
        return;
    }
    console.error('[chat] unexpected error', err);
    res.status(500).json({ error: 'internal_error' });
});

// ---------- Conversations (Part C) ----------
// Server-side in-memory conversations. Lost on server restart by design.

const createConversationSchema = z.object({
    title: z.string().trim().min(1).max(60).optional(),
});

const conversationMessageSchema = z.object({
    message: z.string().trim().min(1).max(4000),
});

router.get('/conversations', (_req, res) => {
    res.status(200).json({ conversations: listConversations() });
});

router.post('/conversations', (req, res) => {
    const parsed = createConversationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json({ error: 'bad_request', details: parsed.error.issues });
        return;
    }
    const conv = createConversation(parsed.data.title);
    res.status(201).json({
        conversation: {
            id: conv.id,
            title: conv.title,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            messages: conv.messages,
        },
    });
});

router.get('/conversations/:id', (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    res.status(200).json({
        conversation: {
            id: conv.id,
            title: conv.title,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            messages: conv.messages,
        },
    });
});

router.post('/conversations/:id/messages', async (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv) {
        res.status(404).json({ error: 'not_found' });
        return;
    }
    const parsed = conversationMessageSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'bad_request', details: parsed.error.issues });
        return;
    }
    const { message } = parsed.data;

    // Snapshot history BEFORE appending the new user message — generateReply
    // will append the user message itself when composing the prompt.
    const history = toChatHistory(conv);
    const userMsg = appendMessage(conv.id, 'user', message)!;

    const [replyResult, sentimentResult] = await Promise.allSettled([
        generateReply(history, message),
        extractUserSentiment(history, message),
    ]);

    if (sentimentResult.status === 'fulfilled') {
        console.log(`User sentiment (conv ${conv.id}): ${sentimentResult.value}`);
    } else {
        console.warn('[sentiment] extraction failed', sentimentResult.reason);
    }

    if (replyResult.status === 'fulfilled') {
        const assistantMsg = appendMessage(conv.id, 'assistant', replyResult.value.content)!;
        res.status(200).json({
            userMessage: userMsg,
            reply: assistantMsg,
            conversation: {
                id: conv.id,
                title: conv.title,
                updatedAt: conv.updatedAt,
            },
        });
        return;
    }

    const err = replyResult.reason;
    if (err instanceof OpenAITimeoutError) {
        console.error('[conversations] OpenAI timeout');
        res.status(504).json({ error: 'upstream_timeout', userMessage: userMsg });
        return;
    }
    if (err instanceof OpenAIError) {
        console.error('[conversations] OpenAI error', err.status, err.body);
        res.status(502).json({ error: 'upstream_error', userMessage: userMsg });
        return;
    }
    console.error('[conversations] unexpected error', err);
    res.status(500).json({ error: 'internal_error', userMessage: userMsg });
});

export default router;
