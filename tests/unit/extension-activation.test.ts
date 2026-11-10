/**
 * Extension activation - goes through the real activate() with the stateful vscode mock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

type VsMock = typeof import('../mocks/vscode');
const repoRoot = join(__dirname, '..', '..');

let vs: VsMock;
let ext: typeof import('../../src/extension');

async function activate(extensionPath: string) {
    vi.resetModules();
    vs = (await import('vscode')) as unknown as VsMock;
    vs.reset();
    vs.workspace.workspaceFolders = [{ uri: { fsPath: mkdtempSync(join(tmpdir(), 'awk-ws-')) }, name: 'ws' }];
    ext = await import('../../src/extension');
    ext.activate({ extensionPath, subscriptions: [] } as never);
}

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    ext?.deactivate();
    vi.restoreAllMocks();
});

describe('activate()', () => {
    it('loads the CDP handler from main_scripts without complaint', async () => {
        await activate(repoRoot);
        expect(vs.window.showErrorMessage).not.toHaveBeenCalled();
        expect(vs.state.commands.has('workflowKit.toggleAutoAll')).toBe(true);
    });

    it('tells the user when the CDP handler cannot be loaded instead of failing silently', async () => {
        await activate(mkdtempSync(join(tmpdir(), 'awk-broken-install-')));
        expect(vs.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(String(vs.window.showErrorMessage.mock.calls[0][0])).toMatch(/auto-accept is unavailable/i);
        // the rest of the extension still comes up
        expect(vs.state.commands.has('workflowKit.openSettings')).toBe(true);
    });
});
