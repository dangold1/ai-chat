import './App.css'
import './reset.css'
import {useEffect, useState} from "react";
import {ConversationsList} from "./views/ConversationsList";
import {ConversationView} from "./views/ConversationView";

type Route =
    | { name: 'list' }
    | { name: 'conversation'; id: string };

function parseHash(hash: string): Route {
    // Supported: #/  and  #/c/<id>
    const clean = hash.replace(/^#/, '');
    const match = clean.match(/^\/c\/([^/?#]+)/);
    if (match && match[1]) return { name: 'conversation', id: decodeURIComponent(match[1]) };
    return { name: 'list' };
}

function App() {
    const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

    useEffect(() => {
        const onHashChange = () => setRoute(parseHash(window.location.hash));
        window.addEventListener('hashchange', onHashChange);
        // Normalize empty hash to "#/" so the back/forward stack is consistent.
        if (!window.location.hash) {
            window.location.replace('#/');
        }
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    if (route.name === 'conversation') {
        return <ConversationView conversationId={route.id} />;
    }
    return <ConversationsList />;
}

export default App
