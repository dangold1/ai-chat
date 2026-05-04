import {FormEvent, useEffect, useState} from "react";
import styled from "styled-components";
import {ChatApiError} from "../api/chat";
import {ChatMessage, IChatMessage} from "../ChatMessage";
import {
    type Conversation,
    type StoredMessage,
    getConversation,
    sendConversationMessage,
} from "../api/conversations";

const MainBodyWrapper = styled.main`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 60%;
    margin-inline: auto;
    padding-block: 8px;
    font-family: Roboto, sans-serif;
`;

const TopBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
`;

const BackButton = styled.button`
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
`;

const Title = styled.h1`
    flex: 1;
    text-align: center;
    font-size: 20px;
`;

const ChatMessagesWrapper = styled.section`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    overflow-y: scroll;
    flex: 1;
`;

const Form = styled.form`
    display: flex;
    gap: 8px;
    margin-inline: auto;
`;

const PendingBubble = styled.span`
    display: block;
    padding: 8px;
    border-radius: 8px;
    margin: 8px;
    max-width: 60%;
    color: white;
    background-color: #444;
    margin-inline-end: auto;
    font-style: italic;
`;

const Status = styled.p`
    text-align: center;
    color: #777;
    padding: 16px;
`;

const ErrorBanner = styled.div`
    margin: 8px;
    padding: 8px;
    border-radius: 8px;
    background-color: #fee;
    color: #900;
`;

const newLocalId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

const toView = (m: StoredMessage): IChatMessage => ({
    id: m.id,
    role: m.role,
    content: m.content,
});

interface Props {
    conversationId: string;
}

export function ConversationView({conversationId}: Props) {
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [messages, setMessages] = useState<IChatMessage[]>([]);
    const [pending, setPending] = useState(false);
    const [input, setInput] = useState('');

    useEffect(() => {
        let cancelled = false;
        setConversation(null);
        setLoadError(null);
        setMessages([]);
        getConversation(conversationId)
            .then((conv) => {
                if (cancelled) return;
                setConversation(conv);
                const initial = conv.messages.map(toView);
                if (initial.length === 0) {
                    initial.push({
                        id: newLocalId(),
                        role: 'assistant',
                        content: 'Hi! Ask me anything.',
                    });
                }
                setMessages(initial);
            })
            .catch((err) => {
                if (cancelled) return;
                const code = err instanceof ChatApiError ? err.message : 'unknown_error';
                setLoadError(
                    code === 'not_found'
                        ? 'This conversation no longer exists. The server may have restarted.'
                        : `Could not load conversation (${code}).`
                );
            });
        return () => { cancelled = true; };
    }, [conversationId]);

    const goBack = () => {
        window.location.hash = '#/';
    };

    const formOnSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const message = input.trim();
        if (!message || pending || !conversation) return;

        const optimisticUser: IChatMessage = {
            id: newLocalId(),
            role: 'user',
            content: message,
        };
        setMessages((prev) => [...prev, optimisticUser]);
        setInput('');
        setPending(true);

        try {
            const {userMessage, reply} = await sendConversationMessage(conversation.id, message);
            setMessages((prev) => {
                // Replace optimistic user message with the server-issued one,
                // then append the assistant reply.
                const replaced = prev.map((m) => (m.id === optimisticUser.id ? toView(userMessage) : m));
                return [...replaced, toView(reply)];
            });
        } catch (err) {
            const code = err instanceof ChatApiError ? err.message : 'unknown_error';
            setMessages((prev) => [
                ...prev,
                {
                    id: newLocalId(),
                    role: 'assistant',
                    content: `Sorry, something went wrong (${code}). Please try again.`,
                },
            ]);
        } finally {
            setPending(false);
        }
    };

    if (loadError) {
        return (
            <MainBodyWrapper>
                <TopBar>
                    <BackButton onClick={goBack}>← Back</BackButton>
                    <Title>Conversation</Title>
                    <span style={{width: 64}} />
                </TopBar>
                <ErrorBanner>{loadError}</ErrorBanner>
            </MainBodyWrapper>
        );
    }

    if (!conversation) {
        return (
            <MainBodyWrapper>
                <TopBar>
                    <BackButton onClick={goBack}>← Back</BackButton>
                    <Title>Loading…</Title>
                    <span style={{width: 64}} />
                </TopBar>
                <Status>Loading conversation…</Status>
            </MainBodyWrapper>
        );
    }

    return (
        <MainBodyWrapper>
            <TopBar>
                <BackButton onClick={goBack}>← Back</BackButton>
                <Title>{conversation.title}</Title>
                <span style={{width: 64}} />
            </TopBar>
            <ChatMessagesWrapper>
                {messages.map((m) => <ChatMessage {...m} key={m.id} />)}
                {pending && <PendingBubble>agent is typing…</PendingBubble>}
            </ChatMessagesWrapper>
            <Form onSubmit={formOnSubmit}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={pending}
                    autoFocus
                />
                <button type="submit" disabled={pending || input.trim().length === 0}>
                    Send
                </button>
            </Form>
        </MainBodyWrapper>
    );
}
