export type ApiRole = 'user' | 'assistant';

export interface ApiMessage {
    role: ApiRole;
    content: string;
}

interface ChatResponse {
    reply: ApiMessage;
}

const API_URL = 'http://localhost:3000';

export class ChatApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'ChatApiError';
    }
}

export async function sendChat(
    message: string,
    history: ApiMessage[]
): Promise<ApiMessage> {
    let res: Response;
    try {
        res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, history }),
        });
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

    const data = (await res.json()) as ChatResponse;
    return data.reply;
}
