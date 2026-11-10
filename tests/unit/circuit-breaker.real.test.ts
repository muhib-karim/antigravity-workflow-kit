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
        expect(cb.getFullState().reason).toMatch(/Same response repeated 5 times/);
    });

    it('does not count different responses as repeats', () => {
        for (let i = 1; i <= 20; i++) {
            expect(cb.recordResult({ ...progress(i), responseHash: `hash-${i}` })).toBe(true);
        }
        expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('only counts errors that are consecutive', () => {
        // an error every other loop, 5 errors in total, always with progress
        for (let i = 1; i <= 10; i++) {
            expect(cb.recordResult({ ...progress(i), hasErrors: i % 2 === 1 })).toBe(true);
        }
        expect(cb.getState()).toBe(CircuitState.CLOSED);
        expect(cb.getFullState().consecutiveErrors).toBe(0);
    });

    it('opens after 5 consecutive errors even when each response is different', () => {
        let canContinue = true;
        for (let i = 1; i <= 5; i++) {
            canContinue = cb.recordResult({ ...progress(i), hasErrors: true, responseHash: `hash-${i}` });
        }
        expect(canContinue).toBe(false);
        expect(cb.getFullState().reason).toBe('Same error repeated 5 times');
    });

    it('does not count one bad loop twice when it both errors and repeats a response', () => {
        for (let i = 1; i <= 3; i++) {
            cb.recordResult({ ...progress(i), hasErrors: true, responseHash: 'same' });
        }
        expect(cb.getState()).toBe(CircuitState.CLOSED);
        expect(cb.getFullState().consecutiveErrors).toBe(3);
        expect(cb.getFullState().consecutiveDuplicateResponses).toBe(2);
    });

    it('opens from HALF_OPEN on repeated errors too', () => {
        cb.recordResult({ ...progress(1), hasErrors: true });
        cb.recordResult({ ...progress(2), hasErrors: true });
        cb.recordResult({ ...progress(3), hasErrors: true });
        cb.recordResult({ ...noProgress(4), hasErrors: true });
        expect(cb.recordResult({ ...noProgress(5), hasErrors: true })).toBe(false);
        expect(cb.getFullState().reason).toBe('Same error repeated 5 times');
    });

    it('keeps the number of times it opened across resets', () => {
        for (let i = 1; i <= 3; i++) cb.recordResult(noProgress(i));
        cb.reset('Recovery attempt');
        for (let i = 4; i <= 6; i++) cb.recordResult(noProgress(i));
        cb.reset();
        expect(cb.getFullState().totalOpens).toBe(2);
        expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
});
