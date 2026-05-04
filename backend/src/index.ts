import corsMiddleware from 'cors';
import express from 'express';
import { json } from 'body-parser';
import controller from './controller';
import { config } from './config';

const port = config.PORT;

const app = express();
app.use(corsMiddleware());
app.use(json());
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
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
