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

/** Fake repository state: bump `head` for a commit, change `status` for uncommitted edits */
const git = { head: 0, status: [] as string[] };
vi.mock('child_process', () => ({
    exec: (cmd: string, _opts: unknown, cb: (e: Error | null, out: { stdout: string; stderr: string }) => void) => {
        if (cmd.startsWith('git rev-parse')) return cb(null, { stdout: `commit-${git.head}\n`, stderr: '' });
        if (cmd.startsWith('git status')) return cb(null, { stdout: git.status.join('\n'), stderr: '' });
        return cb(null, { stdout: '', stderr: '' }); // git diff HEAD --numstat
    },
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

type Work = 'none' | 'commit' | 'edit';

/**
 * Distinct responses without exit, test-only or rate-limit phrases. While "responding", the fake
 * model either does nothing, commits its work, or leaves a new uncommitted edit.
 */
function distinctResponses(work: Work = 'none') {
    let n = 0;
    cdp.waitForResponse.mockImplementation(async () => {
        n++;
        if (work === 'commit') git.head++;
        if (work === 'edit') git.status = [...git.status, ` M src/file-${n}.ts`];
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
    git.head = 0;
    git.status = [];
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
        distinctResponses('none');

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(loop.isRunning()).toBe(false);
        expect(stopReasons()).toHaveLength(1);
        expect(stopReasons()[0]).toMatch(/No recovery after 3 loops|No progress in 3 consecutive loops/);
        expect(loop.getStatus().loopCount).toBe(12);
        expect(notifications().filter((m) => m.includes('🔄'))).toHaveLength(3);
    });

    it.each(['commit', 'edit'] as const)('does not trip the breaker while every loop makes progress (%s) and responses differ', async (work) => {
        const loop = await loadLoop();
        distinctResponses(work);

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
        cdp.waitForResponse.mockImplementation(async () => { git.head++; return 'Thinking about it.'; });
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
        distinctResponses('commit');

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
        distinctResponses('commit');
        void loop.start({ goal: 'Ship the parser', maxLoops: 1, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);
        expect(cdp.injectPrompt).toHaveBeenCalledTimes(1);
    });

    it('starts every session with a fresh recovery budget', async () => {
        const loop = await loadLoop();
        distinctResponses('none');

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);
        vs.window.showInformationMessage.mockClear();

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(notifications().filter((m) => m.includes('🔄'))).toHaveLength(3);
        expect(loop.getStatus().loopCount).toBe(12);
    });
});

describe('AutonomousLoop progress detection', () => {
    it('does not mistake a tree that was already dirty when the session started for progress', async () => {
        const loop = await loadLoop();
        git.status = [' M src/untouched.ts', '?? notes.txt']; // the user's own uncommitted work
        distinctResponses('none');

        void loop.start({ goal: 'Ship the parser', maxLoops: 40, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(loop.getStatus().loopCount).toBe(12);
        expect(stopReasons()[0]).not.toMatch(/Max loops/);
    });

    it('hands the recovery budget back once a loop makes progress again', async () => {
        const loop = await loadLoop();
        let n = 0;
        cdp.waitForResponse.mockImplementation(async () => {
            n++;
            if (n % 4 === 0) git.head++; // progress on every 4th loop, i.e. right after each recovery attempt
            return `Step ${n}: examined module number ${n} and wrote down approach ${n} for the parser.`;
        });

        void loop.start({ goal: 'Ship the parser', maxLoops: 30, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        // never more than one recovery in a row, so the budget of 3 is never used up
        expect(stopReasons()).toEqual(['Workflow Kit: Max loops reached (30)']);
    });
});

describe('AutonomousLoop model routing', () => {
    it('selects the routed model in the editor, starting with the first loop', async () => {
        const loop = await loadLoop();
        distinctResponses('commit');

        void loop.start({ goal: 'Restyle the button layout css', maxLoops: 2, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(cdp.switchModel).toHaveBeenCalledTimes(1); // once per change, not once per loop
        expect(cdp.switchModel).toHaveBeenCalledWith('gemini-3-pro-high');
        expect(cdp.switchModel.mock.invocationCallOrder[0]).toBeLessThan(cdp.injectPrompt.mock.invocationCallOrder[0]);
    });

    it('announces and counts a model switch only when the editor really switched', async () => {
        const loop = await loadLoop();
        const { writeFileSync } = await import('fs');
        const plan = join(vs.workspace.workspaceFolders[0].uri.fsPath, '@fix_plan.md');
        writeFileSync(plan, '- [ ] Restyle the button layout css\n');
        let n = 0;
        cdp.waitForResponse.mockImplementation(async () => {
            n++;
            git.head++;
            writeFileSync(plan, '- [x] Restyle the button layout css\n- [ ] Investigate the deadlock in the scheduler\n');
            return `Step ${n}: finished item ${n} of the plan and moved on.`;
        });
        cdp.switchModel.mockImplementation(async (model: string) => model === 'gemini-3-pro-high'); // 2nd switch fails

        void loop.start({ maxLoops: 2, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(cdp.switchModel.mock.calls.map((c) => c[0])).toEqual(['gemini-3-pro-high', 'claude-opus-4.5-thinking']);
        expect(notifications().filter((m) => m.includes('🔄'))).toEqual([]);
        const { progressTracker } = await import('../../src/core/progress-tracker');
        expect(progressTracker.getStats().modelSwitches).toBe(0);
    });

    it('does not touch the model picker when auto-switching is off', async () => {
        const loop = await loadLoop();
        vs.state.config.set('workflowKit.autoSwitchModels', false);
        distinctResponses('commit');

        void loop.start({ goal: 'Restyle the button layout css', maxLoops: 2, loopIntervalSeconds: 1 });
        await runUntilStopped(loop);

        expect(cdp.switchModel).not.toHaveBeenCalled();
    });
});
