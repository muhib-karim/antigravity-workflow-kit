/**
 * Dead-man switch of the injected auto-accept script: the page-side loop must not outlive the
 * extension that started it.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { commandPrompt, foregroundConfig, loadInjected, stopAllInjected } from '../helpers/injected-harness';

const config = foregroundConfig(['rm -rf /'], 1000);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { stopAllInjected(); vi.useRealTimers(); });

describe('injected auto-accept script: heartbeat', () => {
    it('keeps clicking while the extension keeps calling __autoAllStart', async () => {
        const button = commandPrompt('npm test', 'Run');
        const page = loadInjected([button]);

        page.__autoAllStart(config);
        for (let i = 0; i < 12; i++) { // one minute of 5s polls, as the extension does
            await vi.advanceTimersByTimeAsync(5000);
            page.__autoAllStart(config);
        }

        expect(page.__autoAllState.isRunning).toBe(true);
        expect(button.clicked).toBeGreaterThan(50);
    });

    it('stops on its own when the extension goes silent, and resumes with the next signal', async () => {
        const button = commandPrompt('npm test', 'Run');
        const page = loadInjected([button]);

        page.__autoAllStart(config);
        await vi.advanceTimersByTimeAsync(5000);
        expect(button.clicked).toBeGreaterThan(3);

        // the extension host dies: no more calls
        await vi.advanceTimersByTimeAsync(25_000);
        expect(page.__autoAllState.isRunning).toBe(false);
        const clicksWhenStopped = button.clicked;

        await vi.advanceTimersByTimeAsync(60_000);
        expect(button.clicked).toBe(clicksWhenStopped);

        // the extension is back
        page.__autoAllStart(config);
        await vi.advanceTimersByTimeAsync(3000);
        expect(page.__autoAllState.isRunning).toBe(true);
        expect(button.clicked).toBeGreaterThan(clicksWhenStopped);
    });
});
