"use strict";
/**
 * Workflow Kit - Exit Detector
 * Detects when the autonomous loop should gracefully exit
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitDetector = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const EXIT_STATE_FILE = '.workflow-kit-exit-signals.json';
const DEFAULT_CONFIG = {
    maxConsecutiveTestLoops: 3,
    maxConsecutiveDoneSignals: 2,
    maxConsecutiveFailures: 5,
    testPercentageThreshold: 30
};
// Patterns that indicate completion
const COMPLETION_PATTERNS = [
    'all tasks completed',
    'project is complete',
    'nothing left to do',
    'all items checked',
    'implementation complete',
    'all features implemented',
    'ready for review',
    'all tests passing'
];
// Patterns that indicate test-only work
const TEST_ONLY_PATTERNS = [
    'only ran tests',
    'just running tests',
    'test execution only',
    'validating tests',
    'no code changes, only tests'
];
// Patterns that indicate "done" signal
const DONE_PATTERNS = [
    'done',
    'finished',
    'completed',
    'all set',
    'nothing more to do'
];
class ExitDetector {
    constructor(projectDir, config) {
        this.stateFile = path.join(projectDir, EXIT_STATE_FILE);
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.signals = this.loadState();
    }
    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf-8');
                return JSON.parse(data);
            }
        }
        catch (error) {
            console.warn('Failed to load exit signals, initializing new state');
        }
        return {
            testOnlyLoops: [],
            doneSignals: [],
            completionIndicators: [],
            consecutiveFailures: 0
        };
    }
    saveState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.signals, null, 2));
        }
        catch (error) {
            console.warn('Failed to save exit signals');
        }
    }
    /**
     * Analyze a loop's output and record relevant signals
     */
    analyzeOutput(loopNumber, output, success) {
        const lowerOutput = output.toLowerCase();
        // Record failure
        if (!success) {
            this.signals.consecutiveFailures++;
        }
        else {
            this.signals.consecutiveFailures = 0;
        }
        // Check for test-only loop
        const isTestOnly = TEST_ONLY_PATTERNS.some(pattern => lowerOutput.includes(pattern));
        if (isTestOnly) {
            this.signals.testOnlyLoops.push(loopNumber);
        }
        // Check for done signals
        const hasDoneSignal = DONE_PATTERNS.some(pattern => {
            // Look for these patterns at end of output or as standalone statements
            const regex = new RegExp(`\\b${pattern}\\b[.!]*\\s*$`, 'i');
            return regex.test(output.trim());
        });
        if (hasDoneSignal) {
            this.signals.doneSignals.push(loopNumber);
        }
        // Check for completion indicators
        const hasCompletionIndicator = COMPLETION_PATTERNS.some(pattern => lowerOutput.includes(pattern));
        if (hasCompletionIndicator) {
            this.signals.completionIndicators.push(loopNumber);
        }
        // Keep only recent signals (last 10 loops)
        this.signals.testOnlyLoops = this.signals.testOnlyLoops.slice(-10);
        this.signals.doneSignals = this.signals.doneSignals.slice(-10);
        this.signals.completionIndicators = this.signals.completionIndicators.slice(-10);
        this.saveState();
    }
    /**
     * Check if @fix_plan.md shows all tasks completed
     */
    checkFixPlanComplete(projectDir) {
        const fixPlanPath = path.join(projectDir, '@fix_plan.md');
        if (!fs.existsSync(fixPlanPath)) {
            return false;
        }
        try {
            const content = fs.readFileSync(fixPlanPath, 'utf-8');
            const lines = content.split('\n');
            let totalItems = 0;
            let completedItems = 0;
            for (const line of lines) {
                if (line.match(/^-\s*\[/)) {
                    totalItems++;
                    if (line.match(/^-\s*\[x\]/i)) {
                        completedItems++;
                    }
                }
            }
            return totalItems > 0 && completedItems === totalItems;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Determine if the loop should exit
     * Returns exit reason or null if should continue
     */
    shouldExit(currentLoop, projectDir) {
        // Check consecutive failures (circuit breaker)
        if (this.signals.consecutiveFailures >= this.config.maxConsecutiveFailures) {
            return `circuit_breaker: ${this.signals.consecutiveFailures} consecutive failures`;
        }
        // Check fix_plan.md completion
        if (this.checkFixPlanComplete(projectDir)) {
            return 'plan_complete: All tasks in @fix_plan.md completed';
        }
        // Check consecutive test-only loops
        const recentTestLoops = this.signals.testOnlyLoops.filter(n => n > currentLoop - this.config.maxConsecutiveTestLoops);
        if (recentTestLoops.length >= this.config.maxConsecutiveTestLoops) {
            return `test_saturation: ${recentTestLoops.length} consecutive test-only loops`;
        }
        // Check consecutive done signals
        const recentDoneSignals = this.signals.doneSignals.filter(n => n > currentLoop - this.config.maxConsecutiveDoneSignals);
        if (recentDoneSignals.length >= this.config.maxConsecutiveDoneSignals) {
            return `completion_signals: ${recentDoneSignals.length} consecutive done signals`;
        }
        // Check strong completion indicators
        if (this.signals.completionIndicators.length >= 2) {
            const recentCompletions = this.signals.completionIndicators.filter(n => n > currentLoop - 5);
            if (recentCompletions.length >= 2) {
                return 'project_complete: Multiple completion indicators detected';
            }
        }
        return null;
    }
    /**
     * Reset all signals (for testing/new project)
     */
    reset() {
        this.signals = {
            testOnlyLoops: [],
            doneSignals: [],
            completionIndicators: [],
            consecutiveFailures: 0
        };
        this.saveState();
    }
    /**
     * Get current signals for monitoring
     */
    getSignals() {
        return { ...this.signals };
    }
}
exports.ExitDetector = ExitDetector;
