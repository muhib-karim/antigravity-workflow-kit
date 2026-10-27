/**
 * Workflow Kit - Rate Limiter
 * Tracks API usage per model and manages rate limits
 */
import { ModelId } from './model-selector';
export interface ModelUsage {
    callCount: number;
    lastReset: number;
    isLimited: boolean;
}
export interface RateLimitState {
    models: Record<ModelId, ModelUsage>;
    globalCalls: number;
    sessionStart: number;
}
export declare class RateLimiter {
    private state;
    private stateFile;
    private limits;
    constructor(projectDir: string, customLimits?: Partial<Record<ModelId, number>>);
    private loadState;
    private initializeState;
    private saveState;
    private checkResetPeriod;
    /**
     * Check if a model is available (not rate limited)
     */
    isModelAvailable(modelId: ModelId): boolean;
    /**
     * Record a call to a specific model
     */
    recordCall(modelId: ModelId): void;
    /**
     * Get list of unavailable (rate-limited) models
     */
    getUnavailableModels(): ModelId[];
    /**
     * Get usage statistics for all models
     */
    getStats(): {
        modelId: ModelId;
        used: number;
        limit: number;
        available: boolean;
    }[];
    /**
     * Get time until next reset for a model
     */
    getTimeUntilReset(modelId: ModelId): number;
    /**
     * Get global call count across all models
     */
    getGlobalCalls(): number;
    /**
     * Reset all rate limits (for testing/admin)
     */
    resetAll(): void;
}
