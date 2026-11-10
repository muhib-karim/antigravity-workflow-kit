/**
 * CDP handler for auto-accept (main_scripts/cdp-handler.js) against a fake CDP endpoint:
 * an HTTP /json/list plus a WebSocket that records every Runtime.evaluate.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import { createRequire } from 'module';
import { WebSocketServer, WebSocket } from 'ws';
import type { AddressInfo } from 'net';

const nodeRequire = createRequire(import.meta.url);
const { CDPHandler } = nodeRequire('../../main_scripts/cdp-handler.js');

const cfg = { isPro: true, isBackgroundMode: false, pollInterval: 1000, ide: 'antigravity', bannedCommands: ['rm -rf /'] };
const isStartCall = (expression: string) => expression.includes('__autoAllStart({"');
const isStopCall = (expression: string) => expression.includes('__autoAllStop()') && expression.length < 300;
/** Wait for a condition instead of sleeping for a guessed time (slow CI machines make guesses wrong) */
async function waitFor(condition: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

let server: http.Server;
let wss: WebSocketServer;
let port: number;
let evals: string[];
let sockets: Set<WebSocket>;
let listGate: Promise<void> | null;
let listRequests: number;
const page = () => ({ id: 'page-1', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/page-1` });

beforeEach(async () => {
    evals = [];
    sockets = new Set();
    listGate = null;
    listRequests = 0;
    server = http.createServer(async (req, res) => {
        if (req.url === '/json/list') {
            listRequests++;
            if (listGate) await listGate;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify([page()]));
        } else {
            res.statusCode = 404;
            res.end();
        }
    });
    wss = new WebSocketServer({ server });
    wss.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            evals.push(String(msg.params?.expression ?? ''));
            socket.send(JSON.stringify({ id: msg.id, result: { result: { value: 'started' } } }));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
    for (const socket of sockets) socket.terminate();
    wss.close();
    await new Promise((resolve) => server.close(resolve));
});

describe('CDPHandler', () => {
    it('injects the deny-list matcher with the script, starts it, and stops it on stop()', async () => {
        const handler = new CDPHandler(port, port, () => { });
        await handler.start(cfg);

        expect(evals[0]).toContain('__workflowKitBannedCommands');
        expect(evals.filter(isStartCall)).toHaveLength(1);
        expect(evals.find(isStartCall)).toContain('"bannedCommands":["rm -rf /"]');

        await handler.start(cfg); // next poll: no second injection, just the start signal (heartbeat)
        expect(evals.filter((e) => e.includes('__workflowKitBannedCommands'))).toHaveLength(1);
        expect(evals.filter(isStartCall)).toHaveLength(2);

        await handler.stop();
        expect(evals.filter(isStopCall)).toHaveLength(1); // stop() waits for the page to answer
        expect(handler.getConnectionCount()).toBe(0);
        await waitFor(() => sockets.size === 0, 'the page socket to close');
    });

    it('a start() that was already in flight does not re-enable auto-accept after stop()', async () => {
        const handler = new CDPHandler(port, port, () => { });
        await handler.start(cfg);

        let release!: () => void;
        listGate = new Promise<void>((resolve) => { release = resolve; });
        const requestsBefore = listRequests;
        const inFlight = handler.start(cfg); // e.g. the 5s poll tick, now waiting on /json/list
        await waitFor(() => listRequests > requestsBefore, 'the in-flight start() to reach /json/list');

        const stopping = handler.stop(); // the user turns Auto-All off
        // connected pages are told immediately, before stop() has finished its own scan
        await waitFor(() => evals.some(isStopCall), 'the stop signal');
        const stopIndex = evals.findIndex(isStopCall);

        release();
        await Promise.all([inFlight, stopping]);
        // every socket is closed, so anything that was sent has arrived
        await waitFor(() => sockets.size === 0, 'all page sockets to close');

        expect(evals.slice(stopIndex + 1).filter(isStartCall)).toEqual([]);
        expect(handler.getConnectionCount()).toBe(0);
    });

    it('stop() still reaches a page whose socket dropped since the last poll', async () => {
        const handler = new CDPHandler(port, port, () => { });
        await handler.start(cfg);
        for (const socket of sockets) socket.terminate(); // transient drop; the injected loop keeps running in the page
        await waitFor(() => handler.getConnectionCount() === 0, 'the handler to notice the dropped socket');

        await handler.stop();

        expect(evals.filter(isStopCall)).toHaveLength(1);
        expect(handler.getConnectionCount()).toBe(0);
    });

    it('an old socket that closes late does not unregister the newer connection to the same page', async () => {
        const handler = new CDPHandler(port, port, () => { });
        await handler.start(cfg);
        const oldSocket = handler.connections.get('page-1').ws;

        await handler.connectToPage(page()); // a second connection replaces the registered one
        // The handler's own close listener was registered first, so it has run by the time this resolves
        const oldSocketClosed = new Promise((resolve) => oldSocket.once('close', resolve));
        oldSocket.close();
        await oldSocketClosed;

        expect(handler.getConnectionCount()).toBe(1);
        expect(handler.connections.get('page-1').ws).not.toBe(oldSocket);
        handler.disconnectAll();
    });

    it('a newer start() supersedes an older one that is still waiting', async () => {
        const handler = new CDPHandler(port, port, () => { });
        let release!: () => void;
        listGate = new Promise<void>((resolve) => { release = resolve; });
        const older = handler.start(cfg);
        await waitFor(() => listRequests === 1, 'the older start() to reach /json/list');
        listGate = null;
        await handler.start(cfg);
        release();
        await older;

        expect(evals.filter(isStartCall)).toHaveLength(1);
        expect(sockets.size).toBe(1);
        handler.disconnectAll();
    });
});
