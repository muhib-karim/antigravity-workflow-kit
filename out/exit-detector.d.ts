/**
 * Workflow Kit - Exit Detector
 * Detects when the autonomous loop should gracefully exit
 */
export interface ExitSignals {
    testOnlyLoops: number[];
    doneSignals: number[];
    completionIndicators: number[];
    consecutiveFailures: number;
}
export interface ExitConfig {
    maxConsecutiveTestLoops: number;
    maxConsecutiveDoneSignals: number;
    maxConsecutiveFailures: number;
    testPercentageThreshold: number;
}
export declare class ExitDetector {
    private signals;
    private config;
    private stateFile;
    constructor(projectDir: string, config?: Partial<ExitConfig>);
    private loadState;
    private saveState;
    /**
     * Analyze a loop's output and record relevant signals
     */
    analyzeOutput(loopNumber: number, output: string, success: boolean): void;
    /**
     * Check if @fix_plan.md shows all tasks completed
     */
    checkFixPlanComplete(projectDir: string): boolean;
    /**
     * Determine if the loop should exit
     * Returns exit reason or null if should continue
     */
    shouldExit(currentLoop: number, projectDir: string): string | null;
    /**
     * Reset all signals (for testing/new project)
     */
    reset(): void;
    /**
     * Get current signals for monitoring
     */
    getSignals(): ExitSignals;
}
