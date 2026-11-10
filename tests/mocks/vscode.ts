/**
 * Stateful mock of the `vscode` module (aliased in vitest.config.ts).
 * - Configuration is stored in memory. update() rejects keys that package.json does not declare,
 *   which is what VS Code does ("... is not a registered configuration").
 * - Registered commands, webview panels, diagnostic collections and progress tokens are captured in `state`.
 * - Notification functions are vi.fn() spies. Call reset() between tests.
 */
import { vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
const registeredKeys = new Set<string>(Object.keys(pkg.contributes.configuration.properties));

export const state = {
    config: new Map<string, unknown>(),
    commands: new Map<string, (...args: unknown[]) => unknown>(),
    panels: [] as Array<{ webview: { html: string }; send: (msg: unknown) => unknown; disposeHandlers: Array<() => void> }>,
    diagnosticCollections: [] as Array<{ disposed: boolean }>,
    progressTokens: [] as Array<{ cancel: () => void }>,
};

export function reset(): void {
    state.config.clear();
    state.commands.clear();
    state.panels.length = 0;
    state.diagnosticCollections.length = 0;
    state.progressTokens.length = 0;
    workspace.workspaceFolders = [];
    (window as { activeTextEditor: unknown }).activeTextEditor = undefined;
    for (const fn of [window.showInformationMessage, window.showWarningMessage, window.showErrorMessage]) {
        fn.mockReset();
        fn.mockResolvedValue(undefined);
    }
}

export const workspace = {
    workspaceFolders: [] as Array<{ uri: { fsPath: string }; name: string }>,
    name: 'test-workspace',
    getConfiguration: (section?: string) => ({
        get: (key: string, defaultValue?: unknown) => {
            const full = section ? `${section}.${key}` : key;
            return state.config.has(full) ? state.config.get(full) : defaultValue;
        },
        update: vi.fn(async (key: string, value: unknown) => {
            const full = section ? `${section}.${key}` : key;
            if (!registeredKeys.has(full)) {
                throw new Error(`Unable to write to User Settings because ${full} is not a registered configuration.`);
            }
            state.config.set(full, value);
        }),
        has: (key: string) => registeredKeys.has(section ? `${section}.${key}` : key),
    }),
    asRelativePath: (p: unknown) => String((p as { fsPath?: string })?.fsPath ?? p),
};

export const window = {
    activeTextEditor: undefined as unknown,
    visibleTextEditors: [],
    showInformationMessage: vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined),
    showWarningMessage: vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined),
    showErrorMessage: vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined),
    showQuickPick: vi.fn(async (): Promise<unknown> => undefined),
    showInputBox: vi.fn(async (): Promise<unknown> => undefined),
    showTextDocument: vi.fn(async () => undefined),
    withProgress: vi.fn(async (_opts: unknown, task: (p: { report: (v: unknown) => void }, t: unknown) => Promise<unknown>) => {
        const listeners: Array<() => void> = [];
        const token = {
            isCancellationRequested: false,
            onCancellationRequested: (cb: () => void) => { listeners.push(cb); return { dispose: () => { } }; },
        };
        state.progressTokens.push({ cancel: () => { token.isCancellationRequested = true; listeners.forEach((l) => l()); } });
        return task({ report: progressReport }, token);
    }),
    createWebviewPanel: vi.fn(() => {
        let handler: (msg: unknown) => unknown = () => undefined;
        const disposeHandlers: Array<() => void> = [];
        const webview = {
            html: '',
            onDidReceiveMessage: (cb: (msg: unknown) => unknown) => { handler = cb; return { dispose: () => { } }; },
            postMessage: async () => true,
        };
        const panel = {
            webview,
            reveal: () => { },
            onDidDispose: (cb: () => void) => { disposeHandlers.push(cb); return { dispose: () => { } }; },
            dispose: () => disposeHandlers.forEach((d) => d()),
        };
        state.panels.push({ webview, send: (msg) => handler(msg), disposeHandlers });
        return panel;
    }),
    createStatusBarItem: () => ({ show: () => { }, hide: () => { }, dispose: () => { }, text: '', tooltip: '', command: '', backgroundColor: undefined }),
    createTerminal: vi.fn(() => ({ show: () => { }, sendText: () => { }, dispose: () => { } })),
};

export const progressReport = vi.fn();

export const commands = {
    registerCommand: (id: string, cb: (...args: unknown[]) => unknown) => {
        state.commands.set(id, cb);
        return { dispose: () => state.commands.delete(id) };
    },
    executeCommand: vi.fn(async () => undefined),
};

export const languages = {
    createDiagnosticCollection: vi.fn(() => {
        const c = { disposed: false, set: () => { }, clear: () => { }, delete: () => { }, dispose: () => { c.disposed = true; } };
        state.diagnosticCollections.push(c);
        return c;
    }),
    getDiagnostics: () => [],
};

export const extensions = { getExtension: () => undefined };
export const env = { appName: 'Antigravity', openExternal: async () => true };
export const Uri = {
    parse: (str: string) => ({ toString: () => str }),
    file: (path: string) => ({ fsPath: path }),
};
export const ViewColumn = { One: 1, Two: 2, Three: 3 };
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
export const ProgressLocation = { Notification: 15 };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export class ThemeColor { constructor(public id: string) { } }
export class Range { constructor(public sl: number, public sc: number, public el: number, public ec: number) { } }
export class Diagnostic {
    source?: string;
    code?: string;
    constructor(public range: Range, public message: string, public severity: number) { }
}
