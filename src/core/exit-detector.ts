/**
 * Antigravity Workflow Kit - Exit Detector
 * Detects when autonomous loop should exit
 * @module core/exit-detector
 */

import { EXIT_PATTERNS } from '../utils/constants';
import { createLogger } from '../utils/logger';

const log = createLogger('ExitDetector');

// Words that turn a completion phrase into a negation or a condition when they precede it in the same clause
const NOT_A_COMPLETION = /\b(?:not|never|no longer|yet to|far from|once|when|whenever|until|unless|if|whether|before|ensure|verify|check)\b|n't\b/i;

export interface ExitCheck {
    shouldExit: boolean;
    reason?: string;
    confidence: number; // 0-1
}

export class ExitDetector {
    private consecutiveFailures = 0;
    private readonly maxConsecutiveFailures = 3;

    /**
     * Analyzes AI response to determine if loop should exit
     */
    checkResponse(response: string): ExitCheck {
        if (!response || response.trim() === '') {
            return { shouldExit: false, confidence: 0 };
        }

        // Check for completion patterns
        for (const pattern of EXIT_PATTERNS) {
            if (this.statesCompletion(response, pattern)) {
                log.info('Exit pattern matched', { pattern: pattern.source });
                return {
                    shouldExit: true,
                    reason: 'Completion signal detected in response',
                    confidence: 0.9,
                };
            }
        }

        // Check for stagnation (same response repeated)
        if (this.isStagnant(response)) {
            return {
                shouldExit: true,
                reason: 'Response stagnation detected',
                confidence: 0.7,
            };
        }

        return { shouldExit: false, confidence: 0 };
    }

    /**
     * True when the response states completion with this phrase. A phrase that is negated
     * ("not all tasks are completed yet") or conditional ("once all tasks are completed, ...")
     * within its clause is not a statement of completion.
     */
    private statesCompletion(response: string, pattern: RegExp): boolean {
        const matcher = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        let match: RegExpExecArray | null;
        while ((match = matcher.exec(response)) !== null) {
            const before = response.slice(Math.max(0, match.index - 80), match.index);
            const clause = before.split(/[.!?;:,\n]/).pop() || '';
            if (!NOT_A_COMPLETION.test(clause)) {
                return true;
            }
            if (match[0].length === 0) matcher.lastIndex++;
        }
        return false;
    }

    /**
     * Reports a failure in the loop (e.g., error, timeout)
     */
    reportFailure(): ExitCheck {
        this.consecutiveFailures++;
        log.warn('Failure reported', { count: this.consecutiveFailures });

        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            return {
                shouldExit: true,
                reason: `${this.consecutiveFailures} consecutive failures`,
                confidence: 1.0,
            };
        }

        return { shouldExit: false, confidence: 0 };
    }

    /**
     * Reports success, resetting failure counter
     */
    reportSuccess(): void {
        if (this.consecutiveFailures > 0) {
            log.info('Success after failures, resetting counter');
        }
        this.consecutiveFailures = 0;
    }

    /**
     * Resets all state
     */
    reset(): void {
        this.consecutiveFailures = 0;
        this.lastResponses = [];
    }

    // Stagnation detection
    private lastResponses: string[] = [];
    private readonly stagnationThreshold = 3;

    private isStagnant(response: string): boolean {
        const fingerprint = this.fingerprint(response);

        // How many of the recent responses were the same text
        const duplicates = this.lastResponses.filter((r) => r === fingerprint).length;

        // Update history
        this.lastResponses.push(fingerprint);
        if (this.lastResponses.length > 5) {
            this.lastResponses.shift();
        }

        return duplicates >= this.stagnationThreshold - 1;
    }

    /**
     * Identifies a response by its whole text, ignoring case and whitespace. Comparing only an
     * opening excerpt made different answers with the same boilerplate first sentence look identical.
     */
    private fingerprint(response: string): string {
        const normalized = response.toLowerCase().replace(/\s+/g, ' ').trim();
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
        }
        return `${normalized.length}:${hash.toString(16)}`;
    }
}

export const exitDetector = new ExitDetector();
