import { randomUUID } from 'node:crypto';
import corsMiddleware from 'cors';
import express from 'express';
import { json } from 'body-parser';
import controller from './controller';
import { config } from './config';
import { abortAllInFlight } from './client/openai';

const port = config.PORT;

const app = express();
app.use(corsMiddleware({ exposedHeaders: ['X-Request-Id'] }));
app.use(json());

app.use((req, res, next) => {
    const incoming = req.header('x-request-id');
    const requestId =
        typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
            ? incoming
            : randomUUID();
    res.locals['requestId'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
});

app.use(controller);

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[index] port ${port} in use; exiting for watcher restart`);
    } else {
        console.error('[index] listen error', err);
    }
    process.exit(1);
});

const shutdown = (signal: string) => {
    console.log(`[index] received ${signal}, closing server`);
    abortAllInFlight();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
