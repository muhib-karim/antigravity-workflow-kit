/**
 * Antigravity Workflow Kit - Autonomous Loop Orchestrator
 * Main loop that runs continuously until goal is achieved
 * @module core/autonomous-loop
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { circuitBreaker, CircuitState } from './circuit-breaker';
import { progressTracker } from './progress-tracker';
import { rateLimitHandler } from './rate-limit-handler';
import { rateLimiter } from './rate-limiter';
import { testLoopDetector } from './test-loop-detector';
import { taskAnalyzer } from './task-analyzer';
import { modelSelector } from './model-selector';
import { exitDetector } from './exit-detector';
import { recoveryManager } from './recovery-strategies';
import { cdpClient } from '../providers/cdp-client';
import { config } from '../utils/config';
import { createLogger } from '../utils/logger';

const log = createLogger('AutonomousLoop');

export interface LoopConfig {
    goal?: string;
    maxLoops: number;
    loopIntervalSeconds: number;
    autoSwitchModels: boolean;
}

export interface LoopStatus {
    running: boolean;
    loopCount: number;
    currentTask: string | null;
    currentModel: string;
    circuitState: CircuitState;
    message: string;
}

export class AutonomousLoop {
    private running = false;
    private loopCount = 0;
    private currentTask: string | null = null;
    private timer: NodeJS.Timeout | null = null;
    private workspaceRoot: string | null = null;
    private goal: string = '';
    private recoveryPrompt: string | null = null;
    private onStatusChange: ((status: LoopStatus) => void) | null = null;
    private autoAllTimer: NodeJS.Timeout | null = null;
    private previousModel: string | null = null;

    constructor() {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            this.workspaceRoot = folders[0].uri.fsPath;
        }
    }

    /**
     * Set status change callback for UI updates
     */
    setStatusCallback(callback: (status: LoopStatus) => void): void {
        this.onStatusChange = callback;
    }

    /**
     * Start the autonomous loop
     */
    async start(loopConfig: Partial<LoopConfig> = {}): Promise<void> {
        if (this.running) {
            log.warn('Loop already running');
            return;
        }

        // Reset state
        this.running = true;
        this.loopCount = 0;
        this.goal = loopConfig.goal || '';
        circuitBreaker.reset('New session started');
        progressTracker.startSession();
        rateLimitHandler.reset();
        rateLimiter.reset();
        testLoopDetector.reset();
        exitDetector.reset();
        this.previousModel = null; // Reset model tracking for new session

        log.info('🚀 Autonomous loop starting');
        this.showNotification('🚀 Antigravity Workflow Kit Autonomous Mode: STARTING');

        // Start the loop
        await this.runLoop(loopConfig);
    }

    /**
     * Stop the autonomous loop
     */
    stop(reason = 'User stopped'): void {
        if (!this.running) return;

        this.running = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        log.info(`Loop stopped: ${reason}`);
        this.showSummary(reason);
        this.updateStatus();
    }

    /**
     * Main loop logic
     */
    private async runLoop(loopConfig: Partial<LoopConfig>): Promise<void> {
        const maxLoops = loopConfig.maxLoops || config.get('maxLoopsPerSession');
        const intervalSeconds = loopConfig.loopIntervalSeconds || config.get('loopInterval');

        while (this.running) {
            this.loopCount++;
            log.info(`=== Loop #${this.loopCount} ===`);
            this.updateStatus();

            // 1. CHECK CIRCUIT BREAKER
            if (!circuitBreaker.canExecute()) {
                this.stop(`Circuit breaker opened: ${circuitBreaker.getFullState().reason}`);
                return;
            }

            // 1.5 CHECK HOURLY RATE LIMIT (Ralph feature)
            if (!rateLimiter.canMakeCall()) {
                log.warn('Hourly rate limit reached');
                const decision = await rateLimiter.handleRateLimitReached();
                if (decision === 'exit') {
                    this.stop('Rate limit reached - user chose to exit');
                    return;
                }
                // User chose to wait, continue loop
            }

            // 2. CHECK MAX LOOPS
            if (this.loopCount > maxLoops) {
                this.stop(`Max loops reached (${maxLoops})`);
                return;
            }

            // 3. GET CURRENT TASK
            this.currentTask = await this.getCurrentTask();
            if (!this.currentTask) {
                this.stop('All tasks completed! 🎉');
                return;
            }

            // 4. SELECT MODEL (if auto-switching enabled)
            if (config.get('autoSwitchModels')) {
                const selection = modelSelector.selectForTask(this.currentTask);
                rateLimitHandler.setCurrentModel(selection.modelId);
                log.info(`Model: ${selection.modelDisplayName} (${selection.reasoning})`);

                // Only show notification if model actually changed
                if (this.previousModel !== selection.modelId) {
                    if (this.previousModel !== null) {
                        modelSelector.showSwitchNotification(selection);
                        progressTracker.recordModelSwitch();
                    }
                    this.previousModel = selection.modelId;
                }
            }

            // 5. EXECUTE TASK
            const success = await this.executeTask();

            // 6. HANDLE RESULT
            if (!success) {
                // Check if rate limited
                if (!rateLimitHandler.hasAvailableModels()) {
                    this.stop('All models rate limited. Try again later.');
                    return;
                }
            }

            // 7. RECORD PROGRESS
            const progress = await progressTracker.recordLoop({
                modelUsed: rateLimitHandler.getCurrentModel(),
                hasErrors: !success,
            });

            // 8. UPDATE CIRCUIT BREAKER
            const canContinue = circuitBreaker.recordResult({
                loopNumber: this.loopCount,
                filesChanged: progress.filesChanged,
                hasErrors: progress.hasErrors,
                responseLength: progress.responseLength,
                responseHash: progress.responseHash,
            });

            // 9. TRY RECOVERY IF CIRCUIT BREAKER INDICATES TROUBLE
            if (!canContinue) {
                // Try recovery before giving up
                if (recoveryManager.canRecover()) {
                    const recovery = recoveryManager.getNextRecoveryAction();
                    if (recovery) {
                        log.info(`🔄 Attempting recovery: ${recovery.description}`);
                        this.showNotification(`🔄 Workflow Kit: ${recovery.description}`);

                        // Apply recovery action
                        if (recovery.modelSwitch) {
                            rateLimitHandler.setCurrentModel(recovery.modelSwitch);
                            progressTracker.recordModelSwitch();
                        }
                        if (recovery.promptModifier) {
                            this.recoveryPrompt = recovery.promptModifier;
                        }

                        // Reset circuit breaker to try again
                        circuitBreaker.reset('Recovery attempt');
                        continue; // Try again with recovery
                    }
                }

                // All recovery attempts exhausted
                this.stop(circuitBreaker.getFullState().reason);
                return;
            } else {
                // Success! Reset recovery state
                recoveryManager.reset();
                this.recoveryPrompt = null;
            }

            // 10. AUTO GIT COMMIT (every 10 loops)
            if (config.get('autoGitCommit') && this.loopCount % 10 === 0) {
                await this.gitCommit();
            }

            // 11. WAIT BEFORE NEXT LOOP
            await this.wait(intervalSeconds * 1000);
        }
    }

    /**
     * Get current task from @fix_plan.md or use goal
     */
    private async getCurrentTask(): Promise<string | null> {
        // If user provided a goal, use it (only on first loop)
        if (this.goal && this.loopCount === 1) {
            return this.goal;
        }

        // Try to read @fix_plan.md
        if (this.workspaceRoot) {
            const fixPlanPath = path.join(this.workspaceRoot, '@fix_plan.md');
            if (fs.existsSync(fixPlanPath)) {
                try {
                    const content = fs.readFileSync(fixPlanPath, 'utf-8');
                    const task = taskAnalyzer.extractCurrentTask(content);
                    if (task) {
                        return task;
                    }
                    // All tasks in @fix_plan.md are complete - EXIT
                    log.info('All tasks in @fix_plan.md are complete');
                    return null;
                } catch (err) {
                    log.warn('Could not read @fix_plan.md');
                }
            } else {
                // No @fix_plan.md file exists
                log.info('No @fix_plan.md found in workspace');
            }
        }

        // If there's a goal, continue with it after first loop
        if (this.goal) {
            return this.goal;
        }

        // No goal and no tasks - EXIT (don't use generic prompt)
        log.info('No goal or @fix_plan.md tasks - stopping loop');
        return null;
    }

    /**
     * Execute the current task via CDP
     */
    private async executeTask(): Promise<boolean> {
        // Ensure connected
        if (!cdpClient.isConnected()) {
            const connected = await cdpClient.connect();
            if (!connected) {
                log.warn('CDP not available, waiting for Antigravity...');
                await this.wait(5000);
                return true; // Keep loop running
            }
        }

        try {
            const prompt = this.buildPrompt();
            progressTracker.recordPromptSent();

            // Inject prompt into Antigravity chat
            log.info('Injecting prompt...');
            const injected = await cdpClient.injectPrompt(prompt);
            if (!injected) {
                log.error('Failed to inject prompt');
                return false;
            }

            // Record call for rate limiting
            rateLimiter.recordCall();

            // Wait for AI response with configurable timeout
            log.info('Waiting for response...');
            const timeoutMs = (config.get('executionTimeout') || 15) * 60 * 1000;
            const response = await cdpClient.waitForResponse(timeoutMs);

            // Check for rate limit in response
            if (rateLimitHandler.isRateLimited(response)) {
                log.warn('Rate limit detected, switching model');
                progressTracker.recordModelSwitch();
                const nextModel = rateLimitHandler.getNextModel();
                if (nextModel) {
                    await cdpClient.switchModel(nextModel);
                    return false; // Retry with new model
                }
                return false;
            }

            // Check for exit signals
            const exitCheck = exitDetector.checkResponse(response);
            if (exitCheck.shouldExit) {
                log.info(`Exit signal: ${exitCheck.reason}`);
                this.stop(exitCheck.reason || 'Task completed');
                return true;
            }

            // Check for test-only loops (Ralph feature)
            const testCheck = testLoopDetector.analyzeResponse(response);
            if (testCheck.shouldExit) {
                log.info(`Test loop exit: ${testCheck.reason}`);
                this.stop(testCheck.reason || 'Feature likely complete (test loops detected)');
                return true;
            }

            exitDetector.reportSuccess();
            return true;
        } catch (err) {
            log.error(`Execution error: ${(err as Error).message}`);
            const failCheck = exitDetector.reportFailure();
            if (failCheck.shouldExit) {
                this.stop(failCheck.reason || 'Too many failures');
            }
            return false;
        }
    }

    /**
     * Build the prompt to inject
     */
    private buildPrompt(): string {
        if (!this.currentTask) return '';

        // If recovery prompt is set, use it
        if (this.recoveryPrompt) {
            return this.recoveryPrompt;
        }

        // Add context about being in autonomous mode
        return `${this.currentTask}

[Note: Running in autonomous mode. Please make incremental progress and commit when meaningful checkpoints are reached.]`;
    }

    /**
     * Wait for specified duration
     */
    private wait(ms: number): Promise<void> {
        return new Promise((resolve) => {
            this.timer = setTimeout(resolve, ms);
        });
    }

    /**
     * Auto git commit
     */
    private async gitCommit(): Promise<void> {
        if (!this.workspaceRoot) return;

        try {
            const { exec } = require('child_process');
            exec(
                `git add -A && git commit -m "Workflow Kit auto-commit: Loop ${this.loopCount}"`,
                { cwd: this.workspaceRoot },
                (err: Error | null) => {
                    if (!err) log.info(`Git commit at loop ${this.loopCount}`);
                }
            );
        } catch {
            log.warn('Git commit failed');
        }
    }

    /**
     * Show notification to user
     */
    private showNotification(message: string): void {
        vscode.window.showInformationMessage(message);
    }

    /**
     * Show session summary
     */
    private showSummary(reason: string): void {
        const summary = progressTracker.getSummary();
        vscode.window.showInformationMessage(
            `Workflow Kit: ${reason}\n${summary}`,
            'Open Dashboard'
        ).then((action) => {
            if (action === 'Open Dashboard') {
                vscode.commands.executeCommand('workflowKit.openSettings');
            }
        });
    }

    /**
     * Update status and notify callback
     */
    private updateStatus(): void {
        if (this.onStatusChange) {
            this.onStatusChange(this.getStatus());
        }
    }

    /**
     * Get current loop status
     */
    getStatus(): LoopStatus {
        return {
            running: this.running,
            loopCount: this.loopCount,
            currentTask: this.currentTask,
            currentModel: rateLimitHandler.getCurrentModel(),
            circuitState: circuitBreaker.getState(),
            message: circuitBreaker.getStatusMessage(),
        };
    }

    /**
     * Check if loop is running
     */
    isRunning(): boolean {
        return this.running;
    }
}

export const autonomousLoop = new AutonomousLoop();
