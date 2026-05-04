import React from "react";
import styled from "styled-components";

export type ChatRole = 'user' | 'assistant';

export interface IChatMessage {
    id: string;
    content: string;
    role: ChatRole;
}

const ChatMessageWrapper = styled.span`
    display: block;
    padding: 8px;
    border-radius: 8px;
    margin: 8px;
    max-width: 60%;
    word-wrap: break-word;
    color: white;
`;
const UserChatMessage = styled(ChatMessageWrapper)`
    background-color: darkgreen;
    margin-inline-start: auto;
`
const AgentChatMessage = styled(ChatMessageWrapper)`
    background-color: darkblue;
    margin-inline-end: auto;
`

const ROLE_LABEL: Record<ChatRole, string> = {
    user: 'user',
    assistant: 'agent',
};

const ChatMessageImpl: React.FC<IChatMessage> = ({ content, role }) => {
    const Component = role === 'user' ? UserChatMessage : AgentChatMessage;
    return <Component><b>{ROLE_LABEL[role]}:</b> {content}</Component>
}

export const ChatMessage = React.memo(ChatMessageImpl);
