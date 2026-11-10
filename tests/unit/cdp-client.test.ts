/**
 * CDP client used by the autonomous loop (src/providers/cdp-client)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as vm from 'vm';
import { WebSocketServer, WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import { CDPClient } from '../../src/providers/cdp-client';

function connectedClient() {
    const client = new CDPClient();
    (client as unknown as { connected: boolean }).connected = true;
    return client;
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('CDPClient.switchModel', () => {
    it('sends valid JavaScript that looks for the model display label', async () => {
        const client = connectedClient();
        const evaluate = vi.spyOn(client, 'evaluate').mockResolvedValue({ success: true });

        expect(await client.switchModel('gemini-3-flash')).toBe(true);

        const expression = String(evaluate.mock.calls[0][0]);
        // it runs in the editor page, so it must be JavaScript (it used to contain a TypeScript cast)
        expect(() => new vm.Script(expression)).not.toThrow();
        expect(expression).toContain('"gemini 3 flash"');
        expect(expression).not.toContain('gemini-3-flash');
    });

    it('reports failure when the picker or the model is not found', async () => {
        const client = connectedClient();
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(client, 'evaluate').mockResolvedValue({ success: false, error: 'Model not found in the picker' });
        expect(await client.switchModel('gemini-3-flash')).toBe(false);
    });

    it('does nothing when not connected', async () => {
        const client = new CDPClient();
        const evaluate = vi.spyOn(client, 'evaluate');
        expect(await client.switchModel('gemini-3-flash')).toBe(false);
        expect(evaluate).not.toHaveBeenCalled();
    });
});

describe('CDPClient.waitForResponse', () => {
    it('returns promptly once the connection is gone instead of polling until the timeout', async () => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        const client = connectedClient();
        const internals = client as unknown as { connected: boolean };
        vi.spyOn(client, 'evaluate').mockImplementation(async () => {
            internals.connected = false;
            throw new Error('Connection closed');
        });

        let settled = false;
        void client.waitForResponse(15 * 60 * 1000).then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(5000);

        expect(settled).toBe(true);
    });
});

describe('CDPClient connection', () => {
    let wss: WebSocketServer;
    let url: string;
    let serverSockets: WebSocket[];
    type Internals = { connectToTarget(wsUrl: string): Promise<void> };

    beforeEach(async () => {
        serverSockets = [];
        wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
        wss.on('connection', (socket) => { serverSockets.push(socket); }); // never answers commands
        await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
        url = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}/devtools/page/1`;
    });

    afterEach(async () => {
        for (const socket of serverSockets) socket.terminate();
        await new Promise((resolve) => wss.close(resolve));
    });

    it('disconnect() fails commands that are still waiting, so callers do not hang', async () => {
        const client = new CDPClient();
        await (client as unknown as Internals).connectToTarget(url);
        expect(client.isConnected()).toBe(true);

        const pending = client.evaluate('1 + 1');
        client.disconnect();

        await expect(pending).rejects.toThrow('Disconnected');
        expect(client.isConnected()).toBe(false);
    });

    it('a dropped connection fails pending commands and marks the client disconnected', async () => {
        const client = new CDPClient();
        await (client as unknown as Internals).connectToTarget(url);

        const pending = client.evaluate('1 + 1');
        serverSockets[0].terminate();

        await expect(pending).rejects.toThrow('Connection closed');
        expect(client.isConnected()).toBe(false);
    });

    it('an old socket closing after a reconnect does not mark the new connection as down', async () => {
        const client = new CDPClient();
        const internals = client as unknown as Internals;
        await internals.connectToTarget(url);
        const firstSocket = (client as unknown as { ws: WebSocket }).ws;
        const firstSocketClosed = new Promise<void>((resolve) => {
            if (firstSocket.readyState === WebSocket.CLOSED) resolve();
            else firstSocket.once('close', () => resolve());
        });

        await internals.connectToTarget(url); // reconnect: the first socket is dropped
        await firstSocketClosed; // its close event has been delivered (the client's listener runs first)

        expect(client.isConnected()).toBe(true);
        client.disconnect();
    });
});
