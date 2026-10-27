/**
 * Antigravity Workflow Kit - Test Loop Detector
 * Detects when AI is stuck in test-only loops (feature completeness indicator)
 * Inspired by Ralph Claude Code
 * @module core/test-loop-detector
 */

import { createLogger } from '../utils/logger';
import { config } from '../utils/config';

const log = createLogger('TestLoopDetector');

// Patterns that indicate test-only activity
const TEST_PATTERNS = [
    /running\s+(unit\s+)?tests?/i,
    /npm\s+(run\s+)?test/i,
    /jest|vitest|mocha|pytest|rspec/i,
    /all\s+tests?\s+pass(ed|ing)?/i,
    /\d+\s+tests?\s+(passed|passing)/i,
    /test\s+suite/i,
    /coverage\s+report/i,
    /✓.*test|test.*✓/i,
    /PASS\s+\w+\.test\./i,
    /no\s+changes?\s+(needed|required)/i,
    /everything\s+is\s+working/i,
    /all\s+good|looks\s+good/i,
];

// Patterns that indicate actual feature work
const FEATURE_WORK_PATTERNS = [
    /creat(ed?|ing)\s+(new\s+)?file/i,
    /modif(ied|ying)\s+\w+/i,
    /implement(ed|ing)/i,
    /add(ed|ing)\s+(new\s+)?/i,
    /fix(ed|ing)\s+(bug|issue|error)/i,
    /refactor(ed|ing)/i,
    /updat(ed|ing)\s+\w+/i,
];

export interface TestLoopCheck {
    isTestOnly: boolean;
    confidence: number;
    shouldExit: boolean;
    reason?: string;
}

export class TestLoopDetector {
    private consecutiveTestLoops = 0;
    private totalLoops = 0;
    private testLoops = 0;

    /**
     * Analyze response to determine if it's test-only activity
     */
    analyzeResponse(response: string): TestLoopCheck {
        if (!response || response.trim() === '') {
            return { isTestOnly: false, confidence: 0, shouldExit: false };
        }

        this.totalLoops++;

        // Count matches for each pattern type
        let testMatches = 0;
        let featureMatches = 0;

        for (const pattern of TEST_PATTERNS) {
            if (pattern.test(response)) {
                testMatches++;
            }
        }

        for (const pattern of FEATURE_WORK_PATTERNS) {
            if (pattern.test(response)) {
                featureMatches++;
            }
        }

        // Determine if this is a test-only loop
        const isTestOnly = testMatches > 0 && featureMatches === 0;
        const confidence = testMatches / (testMatches + featureMatches + 1);

        if (isTestOnly) {
            this.consecutiveTestLoops++;
            this.testLoops++;
            log.warn(`Test-only loop detected (${this.consecutiveTestLoops} consecutive)`);
        } else {
            this.consecutiveTestLoops = 0;
        }

        // Check if we should exit
        const maxTestLoops = config.get('maxConsecutiveTestLoops') || 3;
        const shouldExit = this.consecutiveTestLoops >= maxTestLoops;

        if (shouldExit) {
            log.info(`🔴 Exiting: ${this.consecutiveTestLoops} consecutive test-only loops`);
        }

        return {
            isTestOnly,
            confidence,
            shouldExit,
            reason: shouldExit
                ? `${this.consecutiveTestLoops} consecutive test-only loops (feature likely complete)`
                : undefined,
        };
    }

    /**
     * Get test loop percentage
     */
    getTestPercentage(): number {
        if (this.totalLoops === 0) return 0;
        return (this.testLoops / this.totalLoops) * 100;
    }

    /**
     * Get status for dashboard
     */
    getStatus(): { consecutive: number; total: number; percentage: number } {
        return {
            consecutive: this.consecutiveTestLoops,
            total: this.testLoops,
            percentage: this.getTestPercentage(),
        };
    }

    /**
     * Reset state
     */
    reset(): void {
        this.consecutiveTestLoops = 0;
        this.totalLoops = 0;
        this.testLoops = 0;
        log.info('Test loop detector reset');
    }
}

export const testLoopDetector = new TestLoopDetector();
