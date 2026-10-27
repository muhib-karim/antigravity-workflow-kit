/**
 * Workflow Kit - Main Loop
 * The autonomous development loop that orchestrates model selection, execution, and exit detection
 */
import { ModelId } from './model-selector';
export interface LoopConfig {
    promptFile: string;
    fixPlanFile: string;
    maxLoops: number;
    pauseBetweenLoops: number;
    verbose: boolean;
}
export interface LoopStatus {
    loopCount: number;
    currentModel: string | null;
    lastAction: string;
    status: 'running' | 'paused' | 'completed' | 'error';
    exitReason: string | null;
    timestamp: string;
}
export declare class AutopilotLoop {
    private config;
    private projectDir;
    private rateLimiter;
    private exitDetector;
    private loopCount;
    private running;
    constructor(projectDir: string, config?: Partial<LoopConfig>);
    private updateStatus;
    private readPrompt;
    private getCurrentTask;
    private executeAntigravity;
    runLoop(): Promise<void>;
    stop(): void;
    private sleep;
    getStats(): {
        loopCount: number;
        rateLimitStats: {
            modelId: ModelId;
            used: number;
            limit: number;
            available: boolean;
        }[];
        exitSignals: import("./exit-detector").ExitSignals;
    };
}
