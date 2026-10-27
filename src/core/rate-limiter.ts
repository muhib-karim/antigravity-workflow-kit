/**
 * Antigravity Workflow Kit - Rate Limiter
 * Configurable rate limiting with hourly tracking
 * Inspired by Ralph Claude Code
 * @module core/rate-limiter
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { config } from '../utils/config';

const log = createLogger('RateLimiter');

interface RateLimitState {
    callsThisHour: number;
    hourStartTime: number;
    isLimited: boolean;
    waitingForReset: boolean;
}

export class RateLimiter {
    private state: RateLimitState = {
        callsThisHour: 0,
        hourStartTime: Date.now(),
        isLimited: false,
        waitingForReset: false,
    };

    private waitTimer: NodeJS.Timeout | null = null;

    /**
     * Check if we can make a call
     */
    canMakeCall(): boolean {
        this.checkHourReset();

        const maxCalls = config.get('maxCallsPerHour') || 100;
        return this.state.callsThisHour < maxCalls && !this.state.waitingForReset;
    }

    /**
     * Record a call
     */
    recordCall(): void {
        this.checkHourReset();
        this.state.callsThisHour++;
        log.info(`Call recorded (${this.state.callsThisHour}/${config.get('maxCallsPerHour') || 100})`);
    }

    /**
     * Check if hour has passed and reset
     */
    private checkHourReset(): void {
        const now = Date.now();
        const hourMs = 60 * 60 * 1000;

        if (now - this.state.hourStartTime >= hourMs) {
            this.state.callsThisHour = 0;
            this.state.hourStartTime = now;
            this.state.isLimited = false;
            log.info('Hourly rate limit reset');
        }
    }

    /**
     * Get remaining calls this hour
     */
    getRemainingCalls(): number {
        this.checkHourReset();
        const maxCalls = config.get('maxCallsPerHour') || 100;
        return Math.max(0, maxCalls - this.state.callsThisHour);
    }

    /**
     * Get time until rate limit resets (ms)
     */
    getTimeUntilReset(): number {
        const hourMs = 60 * 60 * 1000;
        const elapsed = Date.now() - this.state.hourStartTime;
        return Math.max(0, hourMs - elapsed);
    }

    /**
     * Handle rate limit - prompt user to wait or exit
     * Returns true if user chose to wait, false if they want to exit
     */
    async handleRateLimitReached(): Promise<'wait' | 'exit'> {
        this.state.isLimited = true;
        const timeUntilReset = this.getTimeUntilReset();
        const minutesRemaining = Math.ceil(timeUntilReset / 60000);

        log.warn(`Rate limit reached. ${minutesRemaining} minutes until reset.`);

        // Show dialog with options
        const choice = await vscode.window.showWarningMessage(
            `⚠️ Rate Limit Reached\n\n` +
            `You've made ${this.state.callsThisHour} calls this hour.\n` +
            `The limit will reset in ${minutesRemaining} minutes.`,
            { modal: true },
            'Wait for Reset',
            'Exit Now'
        );

        if (choice === 'Wait for Reset') {
            return this.waitForReset();
        } else {
            return 'exit';
        }
    }

    /**
     * Wait for rate limit to reset with countdown
     */
    private async waitForReset(): Promise<'wait' | 'exit'> {
        this.state.waitingForReset = true;
        const timeUntilReset = this.getTimeUntilReset();

        log.info(`Waiting ${Math.ceil(timeUntilReset / 60000)} minutes for rate limit reset...`);

        // Show progress notification
        return new Promise((resolve) => {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Antigravity Workflow Kit: Waiting for rate limit reset',
                    cancellable: true,
                },
                async (progress, token) => {
                    const startTime = Date.now();
                    const totalMs = timeUntilReset;

                    token.onCancellationRequested(() => {
                        this.state.waitingForReset = false;
                        resolve('exit');
                    });

                    // Update progress every 10 seconds
                    while (Date.now() - startTime < totalMs) {
                        if (token.isCancellationRequested) {
                            break;
                        }

                        const elapsed = Date.now() - startTime;
                        const remaining = totalMs - elapsed;
                        const minutesLeft = Math.ceil(remaining / 60000);
                        const percentage = (elapsed / totalMs) * 100;

                        progress.report({
                            increment: percentage,
                            message: `${minutesLeft} minutes remaining...`,
                        });

                        await new Promise((r) => setTimeout(r, 10000));
                    }

                    this.state.waitingForReset = false;
                    this.state.callsThisHour = 0;
                    this.state.hourStartTime = Date.now();
                    this.state.isLimited = false;

                    log.info('Rate limit reset. Resuming...');
                    resolve('wait');
                }
            );
        });
    }

    /**
     * Get status for dashboard
     */
    getStatus(): {
        callsThisHour: number;
        maxCalls: number;
        remaining: number;
        isLimited: boolean;
        minutesUntilReset: number;
    } {
        this.checkHourReset();
        return {
            callsThisHour: this.state.callsThisHour,
            maxCalls: config.get('maxCallsPerHour') || 100,
            remaining: this.getRemainingCalls(),
            isLimited: this.state.isLimited,
            minutesUntilReset: Math.ceil(this.getTimeUntilReset() / 60000),
        };
    }

    /**
     * Reset state
     */
    reset(): void {
        this.state = {
            callsThisHour: 0,
            hourStartTime: Date.now(),
            isLimited: false,
            waitingForReset: false,
        };
        if (this.waitTimer) {
            clearTimeout(this.waitTimer);
            this.waitTimer = null;
        }
        log.info('Rate limiter reset');
    }
}

export const rateLimiter = new RateLimiter();
