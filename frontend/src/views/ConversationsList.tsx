import {useEffect, useState} from "react";
import styled from "styled-components";
import {ChatApiError} from "../api/chat";
import {
    type ConversationSummary,
    createConversation,
    listConversations,
} from "../api/conversations";

const Wrapper = styled.main`
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 60%;
    margin-inline: auto;
    padding-block: 8px;
    font-family: Roboto, sans-serif;
`;

const Header = styled.h1`
    margin: auto;
`;

const Toolbar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
`;

const NewButton = styled.button`
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
`;

const List = styled.ul`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    overflow-y: scroll;
    flex: 1;
`;

const Item = styled.li`
    padding: 12px;
    border-radius: 8px;
    background-color: #f3f3f3;
    cursor: pointer;

    &:hover {
        background-color: #e7e7e7;
    }
`;

const ItemTitle = styled.div`
    font-weight: 600;
`;

const ItemMeta = styled.div`
    font-size: 12px;
    color: #555;
    margin-top: 4px;
`;

const Empty = styled.p`
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

const formatTime = (ts: number) => new Date(ts).toLocaleString();

export function ConversationsList() {
    const [items, setItems] = useState<ConversationSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        let cancelled = false;
        listConversations()
            .then((data) => { if (!cancelled) setItems(data); })
            .catch((err) => {
                if (cancelled) return;
                const code = err instanceof ChatApiError ? err.message : 'unknown_error';
                setError(`Could not load conversations (${code}).`);
                setItems([]);
            });
        return () => { cancelled = true; };
    }, []);

    const onCreate = async () => {
        if (creating) return;
        setCreating(true);
        setError(null);
        try {
            const conv = await createConversation();
            window.location.hash = `#/c/${encodeURIComponent(conv.id)}`;
        } catch (err) {
            const code = err instanceof ChatApiError ? err.message : 'unknown_error';
            setError(`Could not create conversation (${code}).`);
        } finally {
            setCreating(false);
        }
    };

    const open = (id: string) => {
        window.location.hash = `#/c/${encodeURIComponent(id)}`;
    };

    return (
        <Wrapper>
            <Header>Conversations</Header>
            <Toolbar>
                <span>{items ? `${items.length} ongoing` : 'Loading…'}</span>
                <NewButton onClick={onCreate} disabled={creating}>
                    {creating ? 'Creating…' : '+ New conversation'}
                </NewButton>
            </Toolbar>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            {items && items.length === 0 && !error && (
                <Empty>No conversations yet. Create one to get started.</Empty>
            )}
            {items && items.length > 0 && (
                <List>
                    {items.map((c) => (
                        <Item key={c.id} onClick={() => open(c.id)}>
                            <ItemTitle>{c.title}</ItemTitle>
                            <ItemMeta>
                                {c.messageCount} message{c.messageCount === 1 ? '' : 's'} · updated {formatTime(c.updatedAt)}
                            </ItemMeta>
                        </Item>
                    ))}
                </List>
            )}
        </Wrapper>
    );
}
