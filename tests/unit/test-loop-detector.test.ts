/**
 * Test loop detector - tests against the real implementation in src/core
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestLoopDetector } from '../../src/core/test-loop-detector';

describe('TestLoopDetector (src/core/test-loop-detector)', () => {
    let detector: TestLoopDetector;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        detector = new TestLoopDetector();
    });

    it('ignores empty responses', () => {
        expect(detector.analyzeResponse('')).toEqual({ isTestOnly: false, confidence: 0, shouldExit: false });
        expect(detector.getStatus().percentage).toBe(0);
    });

    it('recognises a test-only response and one that also did feature work', () => {
        expect(detector.analyzeResponse('Running unit tests: 12 tests passed.').isTestOnly).toBe(true);
        expect(detector.analyzeResponse('Implemented the parser and all tests pass.').isTestOnly).toBe(false);
    });

    it('exits after 3 consecutive test-only responses (workflowKit.maxConsecutiveTestLoops)', () => {
        expect(detector.analyzeResponse('All tests passed.').shouldExit).toBe(false);
        expect(detector.analyzeResponse('npm test: 40 tests passing.').shouldExit).toBe(false);
        const third = detector.analyzeResponse('Looks good, the test suite is green.');
        expect(third.shouldExit).toBe(true);
        expect(third.reason).toMatch(/3 consecutive test-only loops/);
    });

    it('starts counting again after a response with feature work, and after reset()', () => {
        detector.analyzeResponse('All tests passed.');
        detector.analyzeResponse('All tests passed.');
        detector.analyzeResponse('Refactored the tokenizer.');
        expect(detector.analyzeResponse('All tests passed.').shouldExit).toBe(false);
        expect(detector.getStatus()).toMatchObject({ consecutive: 1, total: 3 });
        expect(detector.getTestPercentage()).toBe(75);

        detector.reset();
        expect(detector.getStatus()).toEqual({ consecutive: 0, total: 0, percentage: 0 });
    });
});
