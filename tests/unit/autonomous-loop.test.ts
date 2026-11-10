/**
 * Autonomous loop - drives the real AutonomousLoop (src/core/autonomous-loop.ts) together with the real
 * circuit breaker, recovery manager, exit detector and progress tracker. Only the edges are mocked:
 * the CDP client (the editor) and `git` (child_process.exec).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

type VsMock = typeof import('../mocks/vscode');

const git = { changedFiles: [] as string[] };
vi.mock('child_process', () => ({
    exec: (_cmd: string, _opts: unknown, cb: (e: Error | null, out: { stdout: string; stderr: string }) => void) =>
        cb(null, { stdout: git.changedFiles.join('\n'), stderr: '' }),
}));

const cdp = {
    isConnected: vi.fn(() => true),
    connect: vi.fn(async () => true),
    injectPrompt: vi.fn(async (_prompt: string) => true),
    waitForResponse: vi.fn(async (_timeoutMs?: number) => ''),
    switchModel: vi.fn(async (_model: string) => true),
    disconnect: vi.fn(),
};
vi.mock('../../src/providers/cdp-client', () => ({ cdpClient: cdp }));

let vs: VsMock;

async function loadLoop() {
    // Fresh module graph per test. The vscode mock comes first: the singletons read the workspace
    // folder when they are constructed.
    vs = (await import('vscode')) as unknown as VsMock;
    vs.reset();
    vs.workspace.workspaceFolders = [{ uri: { fsPath: mkdtempSync(join(tmpdir(), 'awk-loop-')) }, name: 'ws' }];
    const mod = await import('../../src/core/autonomous-loop');
    return mod.autonomousLoop;
}

/** Distinct responses without exit, test-only or rate-limit phrases */
function distinctResponses() {
    let n = 0;
    cdp.waitForResponse.mockImplementation(async () => {
        n++;
        return `Step ${n}: examined module number ${n} and wrote down approach ${n} for the parser.`;
    });
}

async function runUntilStopped(loop: { isRunning(): boolean }, maxSeconds = 600) {
    for (let i = 0; i < maxSeconds && loop.isRunning(); i++) {
        await vi.advanceTimersByTimeAsync(1000);
    }
}

/** First line of every "loop stopped" summary notification */
function stopReasons(): string[] {
    return vs.window.showInformationMessage.mock.calls
        .filter((call) => call[1] === 'Open Dashboard')
        .map((call) => String(call[0]).split('\n')[0]);
}

function notifications(): string[] {
    return vs.window.showInformationMessage.mock.calls.map((call) => String(call[0]));
}

function loggedErrors(): string[] {
    return (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    git.changedFiles = [];
    for (const fn of Object.values(cdp)) fn.mockReset();
    cdp.isConnected.mockImplementation(() => true);
    cdp.connect.mockImplementation(async () => true);
    cdp.injectPrompt.mockImplementation(async () => true);
    cdp.waitForResponse.mockImplementation(async () => '');
    cdp.switchModel.mockImplementation(async () => true);
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'warn').mockImplementation(() => { });
    vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('AutonomousLoop with the real circuit breaker', () => {
    it('halts when no loop ever makes progress: 3 loops, then at most 3 recovery attempts', async () => {
        const loop = await loadLoop();
        distinctResponses();
        git.changedFiles = [];

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(loop.isRunning()).toBe(false);
        expect(stopReasons()).toHaveLength(1);
        expect(stopReasons()[0]).toMatch(/No recovery after 3 loops|No progress in 3 consecutive loops/);
        expect(loop.getStatus().loopCount).toBe(12);
        expect(notifications().filter((m) => m.includes('🔄'))).toHaveLength(3);
    });

    it('does not trip the breaker while every loop changes files and responses differ', async () => {
        const loop = await loadLoop();
        distinctResponses();
        git.changedFiles = ['src/a.ts', 'src/b.ts'];

        void loop.start({ goal: 'Ship the parser', maxLoops: 10, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(loggedErrors().filter((m) => m.includes('CIRCUIT BREAKER OPENED'))).toEqual([]);
        expect(notifications().filter((m) => m.includes('🔄'))).toEqual([]);
        expect(stopReasons()).toEqual(['Workflow Kit: Max loops reached (10)']);
        expect(cdp.injectPrompt).toHaveBeenCalledTimes(10);
    });

    it('opens on the same response repeated 5 times even though files keep changing', async () => {
        const loop = await loadLoop();
        // identical every time, and short enough that the exit detector's own stagnation check is not what stops it
        cdp.waitForResponse.mockImplementation(async () => 'Thinking about it.');
        git.changedFiles = ['src/a.ts'];
        const exit = await import('../../src/core/exit-detector');
        vi.spyOn(exit.exitDetector, 'checkResponse').mockReturnValue({ shouldExit: false, confidence: 0 });

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(loggedErrors().some((m) => m.includes('Same response repeated 5 times'))).toBe(true);
    });

    it('counts failed prompt injections as failures and stops after 3 in a row', async () => {
        const loop = await loadLoop();
        cdp.injectPrompt.mockImplementation(async () => false);

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(loop.getStatus().loopCount).toBe(3);
        expect(stopReasons()).toEqual(['Workflow Kit: 3 consecutive failures (last: could not inject the prompt into the chat)']);
    });

    it('never runs two loops at once after stop() then start() while a response is still pending', async () => {
        const loop = await loadLoop();
        const pending: Array<(response: string) => void> = [];
        cdp.waitForResponse.mockImplementation(() => new Promise<string>((resolve) => pending.push(resolve)));
        git.changedFiles = ['src/a.ts'];

        void loop.start({ goal: 'Task A', maxLoops: 40, loopIntervalSeconds: 1 });
        await vi.advanceTimersByTimeAsync(10);
        expect(cdp.injectPrompt).toHaveBeenCalledTimes(1);

        loop.stop('User stopped');
        void loop.start({ goal: 'Task B', maxLoops: 40, loopIntervalSeconds: 1 });
        await vi.advanceTimersByTimeAsync(10);
        expect(cdp.injectPrompt).toHaveBeenCalledTimes(2); // session B, loop 1, waiting for its own response

        pending[0]('Late answer for the first session: wrote module one.');
        await vi.advanceTimersByTimeAsync(5000);

        // Session B is still blocked on its response, so nothing else may have been injected
        expect(cdp.injectPrompt).toHaveBeenCalledTimes(2);
        expect(cdp.injectPrompt.mock.calls[1][0]).toContain('Task B');
        loop.stop('test cleanup');
    });

    it('lets start() settle when stop() is called during the pause between loops', async () => {
        const loop = await loadLoop();
        distinctResponses();
        git.changedFiles = ['src/a.ts'];

        let settled = false;
        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 30 }).then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(100); // loop 1 done, now sleeping for 30s
        expect(cdp.injectPrompt).toHaveBeenCalledTimes(1);

        loop.stop('User stopped');
        await vi.advanceTimersByTimeAsync(0);

        expect(settled).toBe(true);
    });

    it('does not stay "running" forever when the loop throws', async () => {
        const loop = await loadLoop();
        cdp.isConnected.mockImplementation(() => { throw new Error('socket exploded'); });

        await loop.start({ goal: 'Ship the parser', maxLoops: 5, loopIntervalSeconds: 1 });

        expect(loop.isRunning()).toBe(false);
        expect(stopReasons()).toEqual(['Workflow Kit: Loop error: socket exploded']);

        // and it can be started again
        cdp.isConnected.mockImplementation(() => true);
        distinctResponses();
        git.changedFiles = ['src/a.ts'];
        void loop.start({ goal: 'Ship the parser', maxLoops: 1, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);
        expect(cdp.injectPrompt).toHaveBeenCalledTimes(1);
    });

    it('starts every session with a fresh recovery budget', async () => {
        const loop = await loadLoop();
        distinctResponses();
        git.changedFiles = [];

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);
        vs.window.showInformationMessage.mockClear();

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(notifications().filter((m) => m.includes('🔄'))).toHaveLength(3);
        expect(loop.getStatus().loopCount).toBe(12);
    });
});
