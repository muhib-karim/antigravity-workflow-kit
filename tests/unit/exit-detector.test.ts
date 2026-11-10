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

    it.each([
        'Not all tasks are completed yet; continuing with the parser.',
        "I don't think everything is working, the login test still fails.",
        'Once all tasks are completed, I will open the pull request.',
        'I will check whether the implementation is complete after the next step.',
        'There is still work left before the project is ready.',
    ])('does not treat a negated or conditional completion phrase as completion: %s', (response) => {
        expect(detector.checkResponse(response).shouldExit).toBe(false);
    });

    it('still exits when a later sentence does state completion', () => {
        const response = 'Not all tasks were completed in the first pass. After the fixes, all tasks are completed.';
        expect(detector.checkResponse(response).shouldExit).toBe(true);
    });

    it('does not flag stagnation for different responses that share a boilerplate opening', () => {
        const preamble = 'I will continue working on the task in autonomous mode and make incremental progress on the next unchecked item. ';
        expect(preamble.length).toBeGreaterThan(100);
        const results = [
            'Created src/parser.ts with the tokenizer and wired it into the CLI entry point.',
            'Wrote the evaluator module and connected it to the parser output for arithmetic.',
            'Introduced error recovery in the parser so malformed input reports a line number.',
            'Documented the grammar in docs/grammar.md and linked it from the README.',
        ].map((body) => detector.checkResponse(preamble + body).shouldExit);
        expect(results).toEqual([false, false, false, false]);
    });

    it('treats responses that differ only in case and whitespace as the same', () => {
        expect(detector.checkResponse('Working on   the refactor.').shouldExit).toBe(false);
        expect(detector.checkResponse('working on the refactor.').shouldExit).toBe(false);
        expect(detector.checkResponse(' WORKING on the\nrefactor. ').shouldExit).toBe(true);
    });

    it('forgets earlier responses after reset()', () => {
        detector.checkResponse('Same answer.');
        detector.checkResponse('Same answer.');
        detector.reset();
        expect(detector.checkResponse('Same answer.').shouldExit).toBe(false);
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
