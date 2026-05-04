import { ChatApiError, type ApiMessage, type ApiRole } from './chat';

export interface ConversationSummary {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
}

export interface StoredMessage {
    id: string;
    role: ApiRole;
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

interface SendMessageResponse {
    userMessage: StoredMessage;
    reply: StoredMessage;
    conversation: { id: string; title: string; updatedAt: number };
}

const API_URL = 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, init);
    } catch {
        throw new ChatApiError(0, 'network_error');
    }
    if (!res.ok) {
        let code = 'request_failed';
        try {
            const body = await res.json();
            if (body && typeof body.error === 'string') code = body.error;
        } catch { /* ignore */ }
        throw new ChatApiError(res.status, code);
    }
    return (await res.json()) as T;
}

export async function listConversations(): Promise<ConversationSummary[]> {
    const data = await request<{ conversations: ConversationSummary[] }>('/conversations');
    return data.conversations;
}

export async function createConversation(title?: string): Promise<Conversation> {
    const data = await request<{ conversation: Conversation }>('/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(title ? { title } : {}),
    });
    return data.conversation;
}

export async function getConversation(id: string): Promise<Conversation> {
    const data = await request<{ conversation: Conversation }>(
        `/conversations/${encodeURIComponent(id)}`
    );
    return data.conversation;
}

export async function sendConversationMessage(
    id: string,
    message: string
): Promise<{ userMessage: StoredMessage; reply: StoredMessage }> {
    const data = await request<SendMessageResponse>(
        `/conversations/${encodeURIComponent(id)}/messages`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        }
    );
    return { userMessage: data.userMessage, reply: data.reply };
}

// Helper for any code that wants ApiMessage shape (drops id/createdAt).
export const toApiMessage = (m: StoredMessage): ApiMessage => ({
    role: m.role,
    content: m.content,
});
