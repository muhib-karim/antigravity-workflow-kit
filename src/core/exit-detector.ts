/**
 * Antigravity Workflow Kit - Exit Detector
 * Detects when autonomous loop should exit
 * @module core/exit-detector
 */

import { EXIT_PATTERNS } from '../utils/constants';
import { createLogger } from '../utils/logger';

const log = createLogger('ExitDetector');

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
            if (pattern.test(response)) {
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
     * Reports a failure in the loop (e.g., error, timeout)
     */
    reportFailure(): ExitCheck {
        this.consecutiveFailures++;
        log.warn('Failure reported', { count: this.consecutiveFailures });

        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            return {
                shouldExit: true,
                reason: `Circuit breaker: ${this.consecutiveFailures} consecutive failures`,
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
        // Normalize response for comparison
        const normalized = this.normalizeResponse(response);

        // Check if this response is similar to recent ones
        const duplicates = this.lastResponses.filter(
            (r) => this.isSimilar(normalized, r)
        ).length;

        // Update history
        this.lastResponses.push(normalized);
        if (this.lastResponses.length > 5) {
            this.lastResponses.shift();
        }

        return duplicates >= this.stagnationThreshold - 1;
    }

    private normalizeResponse(response: string): string {
        return response
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 500); // Only compare first 500 chars
    }

    private isSimilar(a: string, b: string): boolean {
        if (a === b) return true;

        // Simple similarity: check if one contains the other
        if (a.length > 100 && b.length > 100) {
            const overlap = a.substring(0, 100) === b.substring(0, 100);
            return overlap;
        }

        return false;
    }
}

export const exitDetector = new ExitDetector();
