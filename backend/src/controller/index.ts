import express from "express";
import { z } from "zod";
import { runChatTurn } from "../service/chatOrchestrator";
import { sendOpenAIError } from "./errorMapper";
import {
    appendMessage,
    createConversation,
    getConversation,
    listConversations,
    toChatHistory,
} from "../bl/conversationStore";

const router = express.Router();

const getRequestId = (res: express.Response): string =>
    typeof res.locals['requestId'] === 'string' ? res.locals['requestId'] : 'no-req-id';

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
    const requestId = getRequestId(res);
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'bad_request', details: parsed.error.issues });
        return;
    }

    const { message, history } = parsed.data;

    try {
        const { reply } = await runChatTurn(history, message, { requestId });
        res.status(200).json({ reply: { role: 'assistant', content: reply.content } });
    } catch (err) {
        sendOpenAIError(res, err, { requestId });
    }
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
    const requestId = getRequestId(res);
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

    // Snapshot history BEFORE appending the new user message — runChatTurn
    // composes the prompt with the user message itself, so we must not double-send.
    const history = toChatHistory(conv);
    const userMsg = appendMessage(conv.id, 'user', message)!;

    try {
        const { reply } = await runChatTurn(history, message, {
            requestId,
            conversationId: conv.id,
        });
        const assistantMsg = appendMessage(conv.id, 'assistant', reply.content)!;
        res.status(200).json({
            userMessage: userMsg,
            reply: assistantMsg,
            conversation: {
                id: conv.id,
                title: conv.title,
                updatedAt: conv.updatedAt,
            },
        });
    } catch (err) {
        sendOpenAIError(res, err, {
            requestId,
            conversationId: conv.id,
            extra: { userMessage: userMsg },
        });
    }
});

export default router;
