/**
 * CDP client used by the autonomous loop (src/providers/cdp-client)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as vm from 'vm';
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
