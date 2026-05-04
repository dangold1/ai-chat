import './App.css'
import './reset.css'
import {lazy, Suspense, useEffect, useState} from "react";

const ConversationsList = lazy(() =>
    import("./views/ConversationsList").then((m) => ({default: m.ConversationsList}))
);
const ConversationView = lazy(() =>
    import("./views/ConversationView").then((m) => ({default: m.ConversationView}))
);

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

    return (
        <Suspense fallback={null}>
            {route.name === 'conversation'
                ? <ConversationView conversationId={route.id} />
                : <ConversationsList />}
        </Suspense>
    );
}

export default App
