import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../types';

// Stored messages are user/assistant only. The system prompt is composed per-call
// in the chat service, so we never persist it.
export type StoredRole = 'user' | 'assistant';

export interface StoredMessage {
    id: string;
    role: StoredRole;
    content: string;
    createdAt: number;
}

export interface Conversation {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: StoredMessage[];
}

export interface ConversationSummary {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
}

const conversations = new Map<string, Conversation>();

const DEFAULT_TITLE = 'New conversation';
const MAX_TITLE_LEN = 60;

function deriveTitle(content: string): string {
    const trimmed = content.trim().replace(/\s+/g, ' ');
    if (trimmed.length === 0) return DEFAULT_TITLE;
    return trimmed.length > MAX_TITLE_LEN ? `${trimmed.slice(0, MAX_TITLE_LEN - 1)}…` : trimmed;
}

export function createConversation(title?: string): Conversation {
    const now = Date.now();
    const conv: Conversation = {
        id: randomUUID(),
        title: title?.trim() || DEFAULT_TITLE,
        createdAt: now,
        updatedAt: now,
        messages: [],
    };
    conversations.set(conv.id, conv);
    return conv;
}

export function getConversation(id: string): Conversation | undefined {
    return conversations.get(id);
}

export function listConversations(): ConversationSummary[] {
    const all = Array.from(conversations.values());
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    return all.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c.messages.length,
    }));
}

export function appendMessage(
    id: string,
    role: StoredRole,
    content: string
): StoredMessage | undefined {
    const conv = conversations.get(id);
    if (!conv) return undefined;
    const msg: StoredMessage = {
        id: randomUUID(),
        role,
        content,
        createdAt: Date.now(),
    };
    conv.messages.push(msg);
    conv.updatedAt = msg.createdAt;
    // First user message becomes the title if still default.
    if (conv.title === DEFAULT_TITLE && role === 'user' && conv.messages.length === 1) {
        conv.title = deriveTitle(content);
    }
    return msg;
}

export function toChatHistory(conv: Conversation): ChatMessage[] {
    return conv.messages.map((m) => ({ role: m.role, content: m.content }));
}
