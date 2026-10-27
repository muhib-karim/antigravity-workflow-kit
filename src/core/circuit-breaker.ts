/**
 * Antigravity Workflow Kit - Circuit Breaker
 * Prevents runaway loops that waste credits
 * Based on Michael Nygard's "Release It!" pattern
 * @module core/circuit-breaker
 */

import { createLogger } from '../utils/logger';

const log = createLogger('CircuitBreaker');

// Circuit Breaker States
export enum CircuitState {
    CLOSED = 'CLOSED',       // Normal operation
    HALF_OPEN = 'HALF_OPEN', // Monitoring mode
    OPEN = 'OPEN',           // Halted - no progress
}

export interface CircuitBreakerState {
    state: CircuitState;
    consecutiveNoProgress: number;
    consecutiveSameError: number;
    lastProgressLoop: number;
    totalOpens: number;
    reason: string;
    currentLoop: number;
}

export interface LoopResult {
    loopNumber: number;
    filesChanged: number;
    hasErrors: boolean;
    responseLength: number;
    responseHash?: string;
}

const DEFAULT_STATE: CircuitBreakerState = {
    state: CircuitState.CLOSED,
    consecutiveNoProgress: 0,
    consecutiveSameError: 0,
    lastProgressLoop: 0,
    totalOpens: 0,
    reason: '',
    currentLoop: 0,
};

// Thresholds
const NO_PROGRESS_THRESHOLD = 3;    // Open after 3 loops no progress
const SAME_ERROR_THRESHOLD = 5;     // Open after 5 same errors
const HALF_OPEN_THRESHOLD = 2;      // Enter half-open after 2 no progress

export class CircuitBreaker {
    private state: CircuitBreakerState;
    private lastResponseHashes: string[] = [];

    constructor() {
        this.state = { ...DEFAULT_STATE };
        log.info('Circuit breaker initialized (CLOSED)');
    }

    /**
     * Get current circuit state
     */
    getState(): CircuitState {
        return this.state.state;
    }

    /**
     * Get full state for dashboard
     */
    getFullState(): CircuitBreakerState {
        return { ...this.state };
    }

    /**
     * Check if execution is allowed
     */
    canExecute(): boolean {
        return this.state.state !== CircuitState.OPEN;
    }

    /**
     * Record the result of a loop iteration
     * Returns true if can continue, false if circuit opened
     */
    recordResult(result: LoopResult): boolean {
        const previousState = this.state.state;
        let hasProgress = false;

        // Detect progress
        if (result.filesChanged > 0) {
            hasProgress = true;
            this.state.consecutiveNoProgress = 0;
            this.state.lastProgressLoop = result.loopNumber;
            log.info(`Progress detected: ${result.filesChanged} files changed`);
        } else {
            this.state.consecutiveNoProgress++;
            log.warn(`No progress: ${this.state.consecutiveNoProgress} consecutive loops`);
        }

        // Detect same response (stagnation)
        if (result.responseHash) {
            const isDuplicate = this.lastResponseHashes.includes(result.responseHash);
            if (isDuplicate) {
                this.state.consecutiveSameError++;
                log.warn(`Duplicate response: ${this.state.consecutiveSameError} times`);
            } else {
                this.state.consecutiveSameError = 0;
            }

            // Keep last 5 hashes
            this.lastResponseHashes.push(result.responseHash);
            if (this.lastResponseHashes.length > 5) {
                this.lastResponseHashes.shift();
            }
        }

        // Detect errors
        if (result.hasErrors) {
            this.state.consecutiveSameError++;
        }

        // State transitions
        this.state.currentLoop = result.loopNumber;
        this.updateState(hasProgress);

        // Log transition
        if (this.state.state !== previousState) {
            this.logTransition(previousState, this.state.state);
        }

        return this.state.state !== CircuitState.OPEN;
    }

    /**
     * Update circuit state based on metrics
     */
    private updateState(hasProgress: boolean): void {
        switch (this.state.state) {
            case CircuitState.CLOSED:
                if (this.state.consecutiveNoProgress >= NO_PROGRESS_THRESHOLD) {
                    this.openCircuit(`No progress in ${this.state.consecutiveNoProgress} consecutive loops`);
                } else if (this.state.consecutiveSameError >= SAME_ERROR_THRESHOLD) {
                    this.openCircuit(`Same error repeated ${this.state.consecutiveSameError} times`);
                } else if (this.state.consecutiveNoProgress >= HALF_OPEN_THRESHOLD) {
                    this.state.state = CircuitState.HALF_OPEN;
                    this.state.reason = `Monitoring: ${this.state.consecutiveNoProgress} loops without progress`;
                }
                break;

            case CircuitState.HALF_OPEN:
                if (hasProgress) {
                    this.state.state = CircuitState.CLOSED;
                    this.state.reason = 'Progress detected, circuit recovered';
                    log.info('Circuit recovered to CLOSED');
                } else if (this.state.consecutiveNoProgress >= NO_PROGRESS_THRESHOLD) {
                    this.openCircuit(`No recovery after ${this.state.consecutiveNoProgress} loops`);
                }
                break;

            case CircuitState.OPEN:
                // Stay open until manual reset
                break;
        }
    }

    /**
     * Open the circuit breaker
     */
    private openCircuit(reason: string): void {
        this.state.state = CircuitState.OPEN;
        this.state.reason = reason;
        this.state.totalOpens++;
        log.error(`🛑 CIRCUIT BREAKER OPENED: ${reason}`);
    }

    /**
     * Log state transition
     */
    private logTransition(from: CircuitState, to: CircuitState): void {
        const emoji = to === CircuitState.OPEN ? '🛑' : to === CircuitState.HALF_OPEN ? '⚠️' : '✅';
        log.info(`Circuit: ${from} → ${to} ${emoji}`);
    }

    /**
     * Manually reset the circuit breaker
     */
    reset(reason = 'Manual reset'): void {
        this.state = { ...DEFAULT_STATE, reason };
        this.lastResponseHashes = [];
        log.info(`Circuit breaker reset: ${reason}`);
    }

    /**
     * Get user-friendly status message
     */
    getStatusMessage(): string {
        switch (this.state.state) {
            case CircuitState.CLOSED:
                return '✅ Running normally';
            case CircuitState.HALF_OPEN:
                return `⚠️ Monitoring (${this.state.consecutiveNoProgress} loops no progress)`;
            case CircuitState.OPEN:
                return `🛑 Stopped: ${this.state.reason}`;
        }
    }

    /**
     * Get credits saved estimate
     */
    getCreditsSaved(): number {
        // Estimate based on preventing further loops
        // Assume each loop would cost ~0.1 credits on average
        const loopsPreventedEstimate = this.state.state === CircuitState.OPEN ? 10 : 0;
        return loopsPreventedEstimate * 0.1;
    }
}

export const circuitBreaker = new CircuitBreaker();
