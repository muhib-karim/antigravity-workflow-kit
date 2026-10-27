"use strict";
/**
 * Workflow Kit - Rate Limiter
 * Tracks API usage per model and manages rate limits
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
exports.RateLimiter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const STATE_FILE = '.workflow-kit-rate-limits.json';
// Default rate limit configuration (calls per 5-hour window)
const DEFAULT_LIMITS = {
    'claude-opus-4.5-thinking': 50,
    'claude-sonnet-4.5-thinking': 100,
    'claude-sonnet-4.5': 150,
    'gemini-3-pro-high': 100,
    'gemini-3-pro-low': 200,
    'gemini-3-flash': 300,
    'gpt-oss-120b': 200
};
const RESET_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours
class RateLimiter {
    constructor(projectDir, customLimits) {
        this.stateFile = path.join(projectDir, STATE_FILE);
        this.limits = { ...DEFAULT_LIMITS, ...customLimits };
        this.state = this.loadState();
        this.checkResetPeriod();
    }
    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = fs.readFileSync(this.stateFile, 'utf-8');
                return JSON.parse(data);
            }
        }
        catch (error) {
            console.warn('Failed to load rate limit state, initializing new state');
        }
        return this.initializeState();
    }
    initializeState() {
        const models = {};
        for (const modelId of Object.keys(DEFAULT_LIMITS)) {
            models[modelId] = {
                callCount: 0,
                lastReset: Date.now(),
                isLimited: false
            };
        }
        return {
            models: models,
            globalCalls: 0,
            sessionStart: Date.now()
        };
    }
    saveState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
        }
        catch (error) {
            console.warn('Failed to save rate limit state');
        }
    }
    checkResetPeriod() {
        const now = Date.now();
        for (const [modelId, usage] of Object.entries(this.state.models)) {
            if (now - usage.lastReset >= RESET_INTERVAL_MS) {
                this.state.models[modelId] = {
                    callCount: 0,
                    lastReset: now,
                    isLimited: false
                };
            }
        }
        this.saveState();
    }
    /**
     * Check if a model is available (not rate limited)
     */
    isModelAvailable(modelId) {
        const usage = this.state.models[modelId];
        if (!usage)
            return true;
        this.checkResetPeriod();
        return usage.callCount < this.limits[modelId];
    }
    /**
     * Record a call to a specific model
     */
    recordCall(modelId) {
        if (!this.state.models[modelId]) {
            this.state.models[modelId] = {
                callCount: 0,
                lastReset: Date.now(),
                isLimited: false
            };
        }
        this.state.models[modelId].callCount++;
        this.state.globalCalls++;
        // Check if this model is now limited
        if (this.state.models[modelId].callCount >= this.limits[modelId]) {
            this.state.models[modelId].isLimited = true;
        }
        this.saveState();
    }
    /**
     * Get list of unavailable (rate-limited) models
     */
    getUnavailableModels() {
        this.checkResetPeriod();
        return Object.entries(this.state.models)
            .filter(([_, usage]) => usage.isLimited || usage.callCount >= this.limits[_])
            .map(([modelId]) => modelId);
    }
    /**
     * Get usage statistics for all models
     */
    getStats() {
        this.checkResetPeriod();
        return Object.entries(this.limits).map(([modelId, limit]) => {
            const usage = this.state.models[modelId];
            return {
                modelId: modelId,
                used: usage?.callCount || 0,
                limit,
                available: this.isModelAvailable(modelId)
            };
        });
    }
    /**
     * Get time until next reset for a model
     */
    getTimeUntilReset(modelId) {
        const usage = this.state.models[modelId];
        if (!usage)
            return 0;
        const elapsed = Date.now() - usage.lastReset;
        return Math.max(0, RESET_INTERVAL_MS - elapsed);
    }
    /**
     * Get global call count across all models
     */
    getGlobalCalls() {
        return this.state.globalCalls;
    }
    /**
     * Reset all rate limits (for testing/admin)
     */
    resetAll() {
        this.state = this.initializeState();
        this.saveState();
    }
}
exports.RateLimiter = RateLimiter;
