/**
 * Circuit Breaker - tests against the real implementation in src/core
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitState } from '../../src/core/circuit-breaker';

const noProgress = (loopNumber: number) => ({ loopNumber, filesChanged: 0, hasErrors: false, responseLength: 10 });
const progress = (loopNumber: number) => ({ loopNumber, filesChanged: 2, hasErrors: false, responseLength: 10 });

describe('CircuitBreaker (src/core/circuit-breaker)', () => {
    let cb: CircuitBreaker;

    beforeEach(() => {
        cb = new CircuitBreaker();
    });

    it('starts CLOSED and allows execution', () => {
        expect(cb.getState()).toBe(CircuitState.CLOSED);
        expect(cb.canExecute()).toBe(true);
    });

    it('moves to HALF_OPEN after 2 loops without progress', () => {
        cb.recordResult(noProgress(1));
        expect(cb.getState()).toBe(CircuitState.CLOSED);
        cb.recordResult(noProgress(2));
        expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
        expect(cb.canExecute()).toBe(true);
    });

    it('opens after 3 loops without progress and blocks execution', () => {
        cb.recordResult(noProgress(1));
        cb.recordResult(noProgress(2));
        const canContinue = cb.recordResult(noProgress(3));
        expect(canContinue).toBe(false);
        expect(cb.getState()).toBe(CircuitState.OPEN);
        expect(cb.canExecute()).toBe(false);
        expect(cb.getFullState().totalOpens).toBe(1);
        expect(cb.getStatusMessage()).toContain('Stopped');
    });

    it('recovers from HALF_OPEN to CLOSED when progress is detected', () => {
        cb.recordResult(noProgress(1));
        cb.recordResult(noProgress(2));
        cb.recordResult(progress(3));
        expect(cb.getState()).toBe(CircuitState.CLOSED);
        expect(cb.getFullState().lastProgressLoop).toBe(3);
    });

    it('stays OPEN until manually reset', () => {
        for (let i = 1; i <= 3; i++) cb.recordResult(noProgress(i));
        cb.recordResult(progress(4));
        expect(cb.getState()).toBe(CircuitState.OPEN);
        cb.reset();
        expect(cb.getState()).toBe(CircuitState.CLOSED);
        expect(cb.getFullState().consecutiveNoProgress).toBe(0);
    });

    it('opens after 5 repeated identical responses even with file changes', () => {
        let canContinue = true;
        for (let i = 1; i <= 6; i++) {
            canContinue = cb.recordResult({ ...progress(i), responseHash: 'same' });
        }
        expect(canContinue).toBe(false);
        expect(cb.getFullState().reason).toMatch(/Same error repeated/);
    });
});
