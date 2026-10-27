/**
 * Code Reviewer - tests against the real implementation in src/core
 */

import { describe, it, expect } from 'vitest';
import { CodeReviewer } from '../../src/core/code-reviewer';

describe('CodeReviewer (src/core/code-reviewer)', () => {
    it('flags eval() and fails review at the default "high" block severity', () => {
        const reviewer = new CodeReviewer();
        const result = reviewer.review('const x = eval(userInput);');
        expect(result.issues.some(i => i.rule === 'no-eval')).toBe(true);
        expect(result.passed).toBe(false);
        expect(result.score).toBeLessThan(100);
    });

    it('flags hardcoded secrets in quick security scan', () => {
        const reviewer = new CodeReviewer();
        const scan = reviewer.quickSecurityScan('const apiKey = "abcdef1234567890";');
        expect(scan.safe).toBe(false);
        expect(scan.criticalIssues.some(i => i.rule === 'hardcoded-secret')).toBe(true);
    });

    it('passes clean code', () => {
        const reviewer = new CodeReviewer();
        const result = reviewer.review('export const add = (a: number, b: number): number => a + b;');
        expect(result.passed).toBe(true);
    });

    it('respects disabled rules', () => {
        const reviewer = new CodeReviewer();
        reviewer.disableRule('no-eval');
        const result = reviewer.review('eval(x);');
        expect(result.issues.some(i => i.rule === 'no-eval')).toBe(false);
    });

    describe('checkBannedCommands', () => {
        const reviewer = new CodeReviewer();
        const banned = ['rm -rf /', 'format c:'];

        it('blocks commands from the banned list (case-insensitive)', () => {
            expect(reviewer.checkBannedCommands('FORMAT C:', banned).blocked).toBe(true);
        });

        it('blocks built-in destructive patterns not in the list', () => {
            expect(reviewer.checkBannedCommands('dd if=/dev/zero of=/dev/sda', []).blocked).toBe(true);
            expect(reviewer.checkBannedCommands('rm -rf ~/projects', []).blocked).toBe(true);
        });

        it('allows ordinary commands', () => {
            expect(reviewer.checkBannedCommands('npm test', banned).blocked).toBe(false);
        });
    });
});
