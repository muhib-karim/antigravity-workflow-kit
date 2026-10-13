/**
 * Exit Detector - tests against the real implementation in src/core
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExitDetector } from '../../src/core/exit-detector';

describe('ExitDetector (src/core/exit-detector)', () => {
    let detector: ExitDetector;

    beforeEach(() => {
        detector = new ExitDetector();
    });

    it('does not exit on empty responses', () => {
        expect(detector.checkResponse('').shouldExit).toBe(false);
        expect(detector.checkResponse('   ').shouldExit).toBe(false);
    });

    it.each([
        'All tasks are completed.',
        'The implementation is complete.',
        'There is no more work to do here.',
        'Nothing left to change; the project is ready.',
    ])('detects completion signal: %s', (response) => {
        const result = detector.checkResponse(response);
        expect(result.shouldExit).toBe(true);
        expect(result.confidence).toBeCloseTo(0.9);
    });

    it('does not exit on ordinary progress messages', () => {
        expect(detector.checkResponse('Updated the parser and added two tests.').shouldExit).toBe(false);
    });

    it('detects stagnation when the same long response repeats 3 times', () => {
        const long = 'Working on the refactor. '.repeat(10);
        expect(detector.checkResponse(long).shouldExit).toBe(false);
        expect(detector.checkResponse(long).shouldExit).toBe(false);
        const third = detector.checkResponse(long);
        expect(third.shouldExit).toBe(true);
        expect(third.reason).toMatch(/stagnation/i);
    });

    it('trips after 3 consecutive failures and resets on success', () => {
        expect(detector.reportFailure().shouldExit).toBe(false);
        expect(detector.reportFailure().shouldExit).toBe(false);
        detector.reportSuccess();
        expect(detector.reportFailure().shouldExit).toBe(false);
        expect(detector.reportFailure().shouldExit).toBe(false);
        const third = detector.reportFailure();
        expect(third.shouldExit).toBe(true);
        expect(third.confidence).toBe(1);
    });
});
