/**
 * Antigravity Workflow Kit - Rate Limit Handler
 * Detects rate limits and switches models automatically
 * @module core/rate-limit-handler
 */

import { ModelId, ModelIdType } from '../utils/constants';
import { config } from '../utils/config';
import { createLogger } from '../utils/logger';

const log = createLogger('RateLimitHandler');

// Rate limit detection patterns. They are specific phrases on purpose: single words such as
// "capacity" or "overloaded" also appear in ordinary answers about code.
const RATE_LIMIT_PATTERNS = [
    /rate[\s-]*limit(?:ed)?\s+(?:reached|exceeded|hit|error)/i,
    /(?:hit|reached|exceeded)\s+(?:the|your|a)\s+rate[\s-]*limit/i,
    /you(?:'ve|\s+have|\s+are)\s+(?:been\s+)?rate[\s-]*limited/i,
    /too\s+many\s+requests/i,
    /usage\s+limit\s+(?:reached|exceeded)/i,
    /\blimit\s+exceeded/i,
    /quota\s+(?:exceeded|exhausted|reached)/i,
    /exceeded\s+(?:your|the)\s+(?:usage\s+)?(?:quota|limit)/i,
    /model\s+(?:is\s+)?(?:currently\s+|temporarily\s+)?(?:unavailable|overloaded|at\s+capacity)/i,
    /(?:servers?|service)\s+(?:is|are)\s+(?:currently\s+)?(?:overloaded|at\s+capacity)/i,
    /try\s+again\s+later/i,
];

// A rate-limit notice is a short message. A long response is the model's answer, which may well
// talk about rate limits without being one.
const MAX_RATE_LIMIT_NOTICE_LENGTH = 500;

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
        if (response.trim().length > MAX_RATE_LIMIT_NOTICE_LENGTH) return false;

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
        if (!this.state.rateLimitedModels.has(model)) {
            this.state.currentModel = model;
            return;
        }

        log.warn(`${model} is rate limited, finding alternative`);
        // Keep the model in use if it still works. Only the requested model is known to be limited;
        // going through getNextModel() here would mark the healthy current model as limited too.
        if (!this.state.rateLimitedModels.has(this.state.currentModel)) return;

        const fallback = MODEL_FALLBACK_ORDER.find((m) => !this.state.rateLimitedModels.has(m));
        if (fallback) {
            this.state.currentModel = fallback;
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
