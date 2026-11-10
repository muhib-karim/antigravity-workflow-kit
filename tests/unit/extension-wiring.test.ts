/**
 * src/extension.ts wiring: the real activate() and commands, with stub main_scripts so the calls
 * made to the CDP handler and the relauncher can be observed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createStubExtension, stubCalls } from '../helpers/stub-extension';
import { DEFAULT_CONFIG } from '../../src/utils/constants';

type VsMock = typeof import('../mocks/vscode');

let vs: VsMock;
let ext: typeof import('../../src/extension');

async function activate(options: { cdpAvailable: boolean }) {
    const extensionPath = createStubExtension(options);
    vi.resetModules();
    vs = (await import('vscode')) as unknown as VsMock;
    vs.reset();
    vs.workspace.workspaceFolders = [{ uri: { fsPath: mkdtempSync(join(tmpdir(), 'awk-ws-')) }, name: 'ws' }];
    ext = await import('../../src/extension');
    ext.activate({ extensionPath, subscriptions: [] } as never);
    await vi.advanceTimersByTimeAsync(0);
}

const run = (id: string) => vs.state.commands.get(id)!();
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(async () => {
    await ext?.deactivate();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('Auto-All wiring', () => {
    it('starts the handler with the configured deny-list and keeps signalling every 5 seconds', async () => {
        await activate({ cdpAvailable: true });
        expect(stubCalls().ports).toEqual([9000, 9010]);

        await run('workflowKit.toggleAutoAll');
        await settle();

        expect(stubCalls().start).toHaveLength(1);
        expect(stubCalls().start[0]).toMatchObject({
            ide: 'antigravity',
            isBackgroundMode: false,
            pollInterval: 1000,
            bannedCommands: DEFAULT_CONFIG.bannedCommands,
        });

        await vi.advanceTimersByTimeAsync(15_000);
        expect(stubCalls().start).toHaveLength(4); // the page-side heartbeat depends on these
    });

    it('stops the handler and the polling when Auto-All is turned off', async () => {
        await activate({ cdpAvailable: true });
        await run('workflowKit.toggleAutoAll');
        await settle();
        await run('workflowKit.toggleAutoAll');
        await settle();

        expect(stubCalls().stop).toBe(1);
        const startsSoFar = stubCalls().start.length;
        await vi.advanceTimersByTimeAsync(30_000);
        expect(stubCalls().start).toHaveLength(startsSoFar);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not start auto-accept when Auto-All was turned off while the relaunch prompt was open', async () => {
        await activate({ cdpAvailable: false });

        await run('workflowKit.toggleAutoAll'); // ON -> no CDP -> relaunch prompt opens and stays open
        await settle();
        expect(stubCalls().prompts).toBe(1);

        await run('workflowKit.toggleAutoAll'); // OFF while the prompt is still open
        await settle();

        stubCalls().cdpAvailable = true;
        stubCalls().answerPrompt!('cancelled'); // the user finally dismisses the prompt
        await settle();
        await vi.advanceTimersByTimeAsync(10_000);

        expect(stubCalls().start).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('disposables', () => {
    it('workflowKit.runCodeReview reuses one diagnostic collection instead of leaking one per run', async () => {
        await activate({ cdpAvailable: true });
        (vs.window as { activeTextEditor: unknown }).activeTextEditor = {
            document: { getText: () => 'const x = eval(input);', fileName: '/tmp/a.js', uri: { fsPath: '/tmp/a.js' } },
        };

        await run('workflowKit.runCodeReview');
        await run('workflowKit.runCodeReview');
        await run('workflowKit.runCodeReview');

        expect(vs.state.diagnosticCollections).toHaveLength(1);

        await ext.deactivate();
        expect(vs.state.diagnosticCollections[0].disposed).toBe(true);
    });

    it('deactivate() stops auto-accept, closes the loop socket and returns a promise VS Code can wait on', async () => {
        await activate({ cdpAvailable: true });
        await run('workflowKit.toggleAutoAll');
        await settle();
        const { cdpClient } = await import('../../src/providers/cdp-client');
        const disconnect = vi.spyOn(cdpClient, 'disconnect');

        const result = ext.deactivate();

        expect(typeof (result as unknown as { then?: unknown })?.then).toBe('function');
        await result;
        expect(disconnect).toHaveBeenCalled();
        expect(stubCalls().stop).toBe(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});
