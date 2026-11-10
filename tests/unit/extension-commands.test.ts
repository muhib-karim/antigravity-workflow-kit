/**
 * Commands, dashboard and project sync through the real activate(), with the stateful vscode mock
 * (which rejects updates to undeclared settings, as VS Code does) and stub runtime scripts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createStubExtension } from '../helpers/stub-extension';

type VsMock = typeof import('../mocks/vscode');

let vs: VsMock;
let ws: string;
let ext: typeof import('../../src/extension');

async function activate() {
    vi.resetModules();
    vs = (await import('vscode')) as unknown as VsMock;
    vs.reset();
    vs.workspace.workspaceFolders = [{ uri: { fsPath: ws }, name: 'ws' }];
    ext = await import('../../src/extension');
    ext.activate({ extensionPath: createStubExtension({ cdpAvailable: false }), subscriptions: [] } as never);
    await flush();
}

const run = (id: string) => vs.state.commands.get(id)!();
const flush = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const checked = (html: string, feature: string) =>
    new RegExp(`<input type="checkbox" checked onchange="toggleFeature\\('${feature}'`).test(html);

async function waitFor(condition: () => boolean, timeoutMs = 4000) {
    const start = Date.now();
    while (!condition() && Date.now() - start < timeoutMs) await flush(25);
}

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'awk-ws-'));
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(async () => {
    for (const panel of vs?.state.panels ?? []) panel.disposeHandlers.forEach((dispose) => dispose());
    await ext?.deactivate();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('activation side effects', () => {
    it('does not create .workflow-kit/ in the workspace just because the extension activated', async () => {
        await activate();
        await run('workflowKit.showMemory');
        expect(existsSync(join(ws, '.workflow-kit'))).toBe(false);
    });
});

describe('commands backed by settings', () => {
    it('workflowKit.toggleMcp flips its setting and says what it really does', async () => {
        await activate();
        await run('workflowKit.toggleMcp');
        expect(vs.state.config.get('workflowKit.mcpEnabled')).toBe(true);
        expect(String(vs.window.showInformationMessage.mock.calls.at(-1)![0])).toMatch(/not exposed to the agent yet/);
        await run('workflowKit.toggleMcp');
        expect(vs.state.config.get('workflowKit.mcpEnabled')).toBe(false);
    });

    it('workflowKit.toggleVoice no longer fails on an undeclared setting', async () => {
        await activate();
        await run('workflowKit.toggleVoice');
        expect(vs.state.config.get('workflowKit.voiceControlEnabled')).toBe(true);
    });
});

describe('dashboard', () => {
    it.each(['mcpEnabled', 'memoryEnabled', 'codeReviewEnabled', 'voiceControlEnabled', 'multiAgentEnabled', 'notificationsEnabled', 'autoTestGeneration'])(
        'the %s toggle stores its setting and the panel shows it',
        async (feature) => {
            await activate();
            await run('workflowKit.openSettings');
            const panel = vs.state.panels[0];
            const before = checked(panel.webview.html, feature);

            await panel.send({ command: 'toggleFeature', feature, enabled: !before });
            await flush();

            expect(vs.state.config.get(`workflowKit.${feature}`)).toBe(!before);
            expect(checked(panel.webview.html, feature)).toBe(!before);
        }
    );

    it('keeps showing the real state of a toggle after the periodic re-render', async () => {
        await activate();
        await run('workflowKit.openSettings');
        const panel = vs.state.panels[0];
        expect(checked(panel.webview.html, 'autoSwitchModels')).toBe(true); // default: on

        await panel.send({ command: 'toggleFeature', feature: 'autoSwitchModels', enabled: false });
        await flush();
        expect(vs.state.config.get('workflowKit.autoSwitchModels')).toBe(false);

        // 'refresh' is the code path of the 15s auto-refresh: fetch usage, then re-render
        panel.webview.html = '';
        await panel.send({ command: 'refresh' });
        await waitFor(() => panel.webview.html !== '');

        expect(checked(panel.webview.html, 'autoSwitchModels')).toBe(false);
    });

    it('labels the scaffold switches as such and ignores unknown toggles', async () => {
        await activate();
        await run('workflowKit.openSettings');
        const panel = vs.state.panels[0];
        expect(panel.webview.html).toContain('These switches only store a setting');
        await panel.send({ command: 'toggleFeature', feature: 'noSuchFeature', enabled: true });
        await flush();
        expect(vs.state.config.has('workflowKit.noSuchFeature')).toBe(false);
    });
});

describe('workflowKit.syncProjectTasks', () => {
    const plan = () => join(ws, '@fix_plan.md');

    function configureGitHub() {
        writeFileSync(plan(), '# Fix Plan\n\n- [ ] Local task one\n- [x] Local task two\n');
        mkdirSync(join(ws, '.workflow-kit'));
        writeFileSync(join(ws, '.workflow-kit', 'project-manager.json'), JSON.stringify({ github: { owner: 'o', repo: 'r', token: 'placeholder' } }));
    }

    const issuesResponse = (titles: string[]) => ({
        ok: true,
        json: async () => titles.map((title, i) => ({ number: i + 1, title, body: '', html_url: `https://example.test/${i + 1}`, labels: [] })),
    });

    it('leaves @fix_plan.md alone when the GitHub fetch fails, and says so', async () => {
        configureGitHub();
        const original = readFileSync(plan(), 'utf8');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com'); }));

        await activate();
        await run('workflowKit.syncProjectTasks');

        expect(readFileSync(plan(), 'utf8')).toBe(original);
        expect(String(vs.window.showErrorMessage.mock.calls.at(-1)![0])).toMatch(/Sync failed, @fix_plan\.md was left unchanged/);
    });

    it('leaves @fix_plan.md alone when GitHub answers with an error status', async () => {
        configureGitHub();
        const original = readFileSync(plan(), 'utf8');
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));

        await activate();
        await run('workflowKit.syncProjectTasks');

        expect(readFileSync(plan(), 'utf8')).toBe(original);
    });

    it('adds fetched issues to the tasks that are already there, without duplicating them on the next sync', async () => {
        configureGitHub();
        vi.stubGlobal('fetch', vi.fn(async () => issuesResponse(['Remote issue A', 'Local task one'])));

        await activate();
        await run('workflowKit.syncProjectTasks');
        await run('workflowKit.syncProjectTasks');

        const content = readFileSync(plan(), 'utf8');
        expect(content).toContain('- [ ] Local task one');
        expect(content).toContain('- [x] Local task two'); // a ticked box stays ticked
        expect(content.match(/Remote issue A/g)).toHaveLength(1);
        expect(content.match(/Local task one/g)).toHaveLength(1);
    });
});
