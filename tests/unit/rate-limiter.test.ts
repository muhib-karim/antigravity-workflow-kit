/**
 * Hourly rate limiter (src/core/rate-limiter)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type VsMock = typeof import('../mocks/vscode');
let vs: VsMock;

async function newLimiter() {
    const { RateLimiter } = await import('../../src/core/rate-limiter');
    return new RateLimiter();
}

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vs = (await import('vscode')) as unknown as VsMock;
    vs.reset();
    vs.progressReport.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('RateLimiter', () => {
    it('allows calls up to workflowKit.maxCallsPerHour and starts a new window after an hour', async () => {
        vs.state.config.set('workflowKit.maxCallsPerHour', 3);
        const limiter = await newLimiter();

        for (let i = 0; i < 3; i++) {
            expect(limiter.canMakeCall()).toBe(true);
            limiter.recordCall();
        }
        expect(limiter.canMakeCall()).toBe(false);
        expect(limiter.getRemainingCalls()).toBe(0);

        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(limiter.canMakeCall()).toBe(true);
        expect(limiter.getStatus().callsThisHour).toBe(0);
    });

    it('returns "exit" when the dialog is dismissed or "Exit Now" is chosen', async () => {
        const limiter = await newLimiter();
        expect(await limiter.handleRateLimitReached()).toBe('exit');
        vs.window.showWarningMessage.mockResolvedValue('Exit Now');
        expect(await limiter.handleRateLimitReached()).toBe('exit');
        expect(vs.window.withProgress).not.toHaveBeenCalled();
    });

    it('waits out the window and then hands back the quota', async () => {
        vs.window.showWarningMessage.mockResolvedValue('Wait for Reset');
        const limiter = await newLimiter();
        for (let i = 0; i < 100; i++) limiter.recordCall();

        let decision: string | undefined;
        void limiter.handleRateLimitReached().then((d) => { decision = d; });
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
        expect(decision).toBeUndefined();
        expect(limiter.canMakeCall()).toBe(false); // still waiting

        await vi.advanceTimersByTimeAsync(31 * 60 * 1000);
        expect(decision).toBe('wait');
        expect(limiter.canMakeCall()).toBe(true);
        expect(limiter.getRemainingCalls()).toBe(100);
    });

    it('cancelling "Wait for Reset" ends the wait at once and does not hand back the quota', async () => {
        vs.window.showWarningMessage.mockResolvedValue('Wait for Reset');
        const limiter = await newLimiter();
        for (let i = 0; i < 100; i++) limiter.recordCall();
        expect(limiter.canMakeCall()).toBe(false);

        let decision: string | undefined;
        void limiter.handleRateLimitReached().then((d) => { decision = d; });
        await vi.advanceTimersByTimeAsync(1000);
        vs.state.progressTokens[0].cancel();
        await vi.advanceTimersByTimeAsync(0);

        expect(decision).toBe('exit');
        expect(limiter.getRemainingCalls()).toBe(0);
        expect(limiter.canMakeCall()).toBe(false);
        expect(vi.getTimerCount()).toBe(0); // no countdown timer left behind
    });

    it('reports progress increments that add up to at most 100%', async () => {
        vs.window.showWarningMessage.mockResolvedValue('Wait for Reset');
        const limiter = await newLimiter();
        for (let i = 0; i < 100; i++) limiter.recordCall();

        void limiter.handleRateLimitReached();
        await vi.advanceTimersByTimeAsync(61 * 60 * 1000);

        const increments = vs.progressReport.mock.calls.map((call) => (call[0] as { increment: number }).increment);
        expect(increments.length).toBeGreaterThan(100);
        expect(increments.every((value) => value >= 0)).toBe(true);
        expect(increments.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(100.001);
    });
});
