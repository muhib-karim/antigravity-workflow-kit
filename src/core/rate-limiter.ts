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
     * Wait for the hourly window to end, with a cancellable countdown.
     * Resolves 'wait' when the window is over (the quota is then fresh) and 'exit' when the user
     * cancels. Cancelling ends the wait; it does not hand back the quota.
     */
    private async waitForReset(): Promise<'wait' | 'exit'> {
        this.state.waitingForReset = true;
        const totalMs = this.getTimeUntilReset();

        log.info(`Waiting ${Math.ceil(totalMs / 60000)} minutes for rate limit reset...`);

        try {
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Antigravity Workflow Kit: Waiting for rate limit reset',
                    cancellable: true,
                },
                (progress, token) => new Promise<'wait' | 'exit'>((resolve) => {
                    const startTime = Date.now();
                    let reportedPercent = 0;
                    let ticker: NodeJS.Timeout | null = null;

                    const finish = (decision: 'wait' | 'exit') => {
                        if (ticker) {
                            clearInterval(ticker);
                            ticker = null;
                        }
                        resolve(decision);
                    };

                    const tick = () => {
                        const elapsed = Date.now() - startTime;
                        if (elapsed >= totalMs) {
                            this.state.callsThisHour = 0;
                            this.state.hourStartTime = Date.now();
                            this.state.isLimited = false;
                            log.info('Rate limit reset. Resuming...');
                            finish('wait');
                            return;
                        }

                        // `increment` is added to what was reported before, so report the difference
                        const percent = (elapsed / totalMs) * 100;
                        progress.report({
                            increment: percent - reportedPercent,
                            message: `${Math.ceil((totalMs - elapsed) / 60000)} minutes remaining...`,
                        });
                        reportedPercent = percent;
                    };

                    token.onCancellationRequested(() => {
                        log.info('Rate limit wait cancelled');
                        finish('exit');
                    });

                    tick();
                    if (ticker === null && Date.now() - startTime < totalMs) {
                        ticker = setInterval(tick, 10000); // update every 10 seconds
                    }
                })
            );
        } finally {
            this.state.waitingForReset = false;
        }
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
        log.info('Rate limiter reset');
    }
}

export const rateLimiter = new RateLimiter();
