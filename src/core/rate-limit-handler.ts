/**
 * Antigravity Workflow Kit - Rate Limit Handler
 * Detects rate limits and switches models automatically
 * @module core/rate-limit-handler
 */

import { ModelId, ModelIdType } from '../utils/constants';
import { config } from '../utils/config';
import { createLogger } from '../utils/logger';

const log = createLogger('RateLimitHandler');

// Rate limit detection patterns
const RATE_LIMIT_PATTERNS = [
    /rate\s*limit/i,
    /model.*unavailable/i,
    /try\s*again\s*later/i,
    /usage\s*limit\s*reached/i,
    /limit\s*exceeded/i,
    /too\s*many\s*requests/i,
    /quota\s*exceeded/i,
    /capacity/i,
    /overloaded/i,
];

// Model fallback priority
const MODEL_FALLBACK_ORDER: ModelIdType[] = [
    ModelId.CLAUDE_OPUS_THINKING,
    ModelId.CLAUDE_SONNET_THINKING,
    ModelId.CLAUDE_SONNET,
    ModelId.GEMINI_PRO_HIGH,
    ModelId.GEMINI_PRO_LOW,
    ModelId.GEMINI_FLASH,
    ModelId.GPT_OSS,
];

export interface RateLimitState {
    currentModel: ModelIdType;
    rateLimitedModels: Set<ModelIdType>;
    lastSwitch: number;
    switchCount: number;
}

export class RateLimitHandler {
    private state: RateLimitState;

    constructor() {
        this.state = {
            currentModel: config.get('preferredModelForReasoning'),
            rateLimitedModels: new Set(),
            lastSwitch: 0,
            switchCount: 0,
        };
    }

    /**
     * Check if response indicates rate limiting
     */
    isRateLimited(response: string): boolean {
        if (!response) return false;

        for (const pattern of RATE_LIMIT_PATTERNS) {
            if (pattern.test(response)) {
                log.warn(`Rate limit detected: ${pattern.source}`);
                return true;
            }
        }
        return false;
    }

    /**
     * Get next available model when rate limited
     * Returns null if all models are rate limited
     */
    getNextModel(): ModelIdType | null {
        // Mark current model as rate limited
        this.state.rateLimitedModels.add(this.state.currentModel);
        log.info(`Marked ${this.state.currentModel} as rate limited`);

        // Find next available model
        for (const model of MODEL_FALLBACK_ORDER) {
            if (!this.state.rateLimitedModels.has(model)) {
                this.state.currentModel = model;
                this.state.lastSwitch = Date.now();
                this.state.switchCount++;
                log.info(`Switching to ${model}`);
                return model;
            }
        }

        log.error('All models are rate limited!');
        return null;
    }

    /**
     * Get current model
     */
    getCurrentModel(): ModelIdType {
        return this.state.currentModel;
    }

    /**
     * Set current model (for task-based switching)
     */
    setCurrentModel(model: ModelIdType): void {
        if (this.state.rateLimitedModels.has(model)) {
            log.warn(`${model} is rate limited, finding alternative`);
            this.getNextModel();
        } else {
            this.state.currentModel = model;
        }
    }

    /**
     * Clear rate limit for a model (e.g., after cooldown)
     */
    clearRateLimit(model: ModelIdType): void {
        this.state.rateLimitedModels.delete(model);
        log.info(`Cleared rate limit for ${model}`);
    }

    /**
     * Clear all rate limits (e.g., after 5 hours)
     */
    clearAllRateLimits(): void {
        this.state.rateLimitedModels.clear();
        log.info('All rate limits cleared');
    }

    /**
     * Get number of available models
     */
    getAvailableModelCount(): number {
        return MODEL_FALLBACK_ORDER.length - this.state.rateLimitedModels.size;
    }

    /**
     * Check if any models are available
     */
    hasAvailableModels(): boolean {
        return this.getAvailableModelCount() > 0;
    }

    /**
     * Reset state
     */
    reset(): void {
        this.state = {
            currentModel: config.get('preferredModelForReasoning'),
            rateLimitedModels: new Set(),
            lastSwitch: 0,
            switchCount: 0,
        };
        log.info('Rate limit handler reset');
    }

    /**
     * Get state for dashboard
     */
    getState(): { current: string; limited: string[]; available: number } {
        return {
            current: this.state.currentModel,
            limited: Array.from(this.state.rateLimitedModels),
            available: this.getAvailableModelCount(),
        };
    }
}

export const rateLimitHandler = new RateLimitHandler();
