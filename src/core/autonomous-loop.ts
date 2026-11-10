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
import { MODEL_LABELS } from '../utils/constants';
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
    /** Incremented by every start(). A loop whose id is no longer current must stop touching things. */
    private runId = 0;
    private loopCount = 0;
    private currentTask: string | null = null;
    private timer: NodeJS.Timeout | null = null;
    private wakeUp: (() => void) | null = null;
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
        const runId = ++this.runId;
        this.loopCount = 0;
        this.currentTask = null;
        this.recoveryPrompt = null;
        this.goal = loopConfig.goal || '';
        recoveryManager.reset();
        circuitBreaker.reset('New session started');
        progressTracker.startSession();
        rateLimitHandler.reset();
        rateLimiter.reset();
        testLoopDetector.reset();
        exitDetector.reset();
        this.previousModel = null; // Reset model tracking for new session

        log.info('🚀 Autonomous loop starting');
        this.showNotification('🚀 Antigravity Workflow Kit Autonomous Mode: STARTING');

        // Start the loop. Whatever happens inside, `running` must not stay true once it is over.
        try {
            await this.runLoop(loopConfig, runId);
        } catch (err) {
            const message = (err as Error).message;
            log.error(`Loop crashed: ${message}`);
            if (this.isCurrent(runId)) {
                this.stop(`Loop error: ${message}`);
            }
        }
    }

    /**
     * True while the loop started with this id is the one that should be running.
     * Checked after every await, so a loop that was stopped (or replaced by a new start())
     * while it was waiting on the editor does not carry on.
     */
    private isCurrent(runId: number): boolean {
        return this.running && this.runId === runId;
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
        // Release a loop that is sleeping between iterations so it can end instead of hanging
        if (this.wakeUp) {
            const wake = this.wakeUp;
            this.wakeUp = null;
            wake();
        }

        log.info(`Loop stopped: ${reason}`);
        this.showSummary(reason);
        this.updateStatus();
    }

    /**
     * Main loop logic
     */
    private async runLoop(loopConfig: Partial<LoopConfig>, runId: number): Promise<void> {
        const maxLoops = loopConfig.maxLoops || config.get('maxLoopsPerSession');
        const intervalSeconds = loopConfig.loopIntervalSeconds || config.get('loopInterval');

        while (this.isCurrent(runId)) {
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
                if (!this.isCurrent(runId)) return;
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
            if (!this.isCurrent(runId)) return;
            if (!this.currentTask) {
                this.stop('All tasks completed! 🎉');
                return;
            }

            // 4. SELECT MODEL (if auto-switching enabled)
            if (config.get('autoSwitchModels')) {
                const selection = modelSelector.selectForTask(this.currentTask);
                rateLimitHandler.setCurrentModel(selection.modelId);
                // Not necessarily the preferred model: that one may be rate limited
                const target = rateLimitHandler.getCurrentModel();
                log.info(`Model: ${MODEL_LABELS[target] || target} (${selection.reasoning})`);

                // Select it in the editor whenever it changes, including on the first loop (the
                // picker can be on anything). One attempt per change; a switch is only announced
                // and counted when it really happened.
                if (this.previousModel !== target) {
                    const firstLoop = this.previousModel === null;
                    this.previousModel = target;

                    if (!cdpClient.isConnected()) {
                        await cdpClient.connect();
                        if (!this.isCurrent(runId)) return;
                    }
                    const switched = await cdpClient.switchModel(target);
                    if (!this.isCurrent(runId)) return;

                    if (!switched) {
                        log.warn(`Could not select ${target} in the editor; continuing with the model that is active`);
                    } else if (!firstLoop) {
                        if (target === selection.modelId) {
                            modelSelector.showSwitchNotification(selection);
                        } else {
                            this.showNotification(`🔄 Workflow Kit: switched to ${MODEL_LABELS[target] || target}`);
                        }
                        progressTracker.recordModelSwitch();
                    }
                }
            }

            // 5. EXECUTE TASK
            const { success, response } = await this.executeTask(runId);
            // Stopped (exit signal, repeated failures, user) or replaced by a new session meanwhile
            if (!this.isCurrent(runId)) return;

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
                responseLength: response.length,
                responseHash: progressTracker.hashResponse(response),
            });
            if (!this.isCurrent(runId)) return;

            // 8. UPDATE CIRCUIT BREAKER
            const canContinue = circuitBreaker.recordResult({
                loopNumber: this.loopCount,
                filesChanged: progress.filesChanged,
                hasErrors: progress.hasErrors,
                responseLength: progress.responseLength,
                responseHash: progress.responseHash || undefined,
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
            }

            // A recovery prompt is used for one loop only. The recovery budget is handed back only
            // when a loop makes real progress; "the breaker is not open yet" is not progress, and
            // resetting on it let a stuck loop recover forever.
            this.recoveryPrompt = null;
            if (progress.filesChanged > 0) {
                recoveryManager.reset();
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
     * Execute the current task via CDP.
     * Returns whether the iteration succeeded and the response text (empty when there was none).
     */
    private async executeTask(runId: number): Promise<{ success: boolean; response: string }> {
        // Ensure connected
        if (!cdpClient.isConnected()) {
            const connected = await cdpClient.connect();
            if (!this.isCurrent(runId)) return { success: false, response: '' };
            if (!connected) {
                log.warn('CDP not available, waiting for Antigravity...');
                await this.wait(5000);
                return { success: true, response: '' }; // Keep loop running
            }
        }

        try {
            const prompt = this.buildPrompt();
            progressTracker.recordPromptSent();

            // Inject prompt into Antigravity chat
            log.info('Injecting prompt...');
            const injected = await cdpClient.injectPrompt(prompt);
            if (!this.isCurrent(runId)) return { success: false, response: '' };
            if (!injected) {
                log.error('Failed to inject prompt');
                this.recordFailure('could not inject the prompt into the chat');
                return { success: false, response: '' };
            }

            // Record call for rate limiting
            rateLimiter.recordCall();

            // Wait for AI response with configurable timeout
            log.info('Waiting for response...');
            const timeoutMs = (config.get('executionTimeout') || 15) * 60 * 1000;
            const response = await cdpClient.waitForResponse(timeoutMs);
            if (!this.isCurrent(runId)) return { success: false, response: '' };

            // Check for rate limit in response
            if (rateLimitHandler.isRateLimited(response)) {
                log.warn('Rate limit detected, switching model');
                const nextModel = rateLimitHandler.getNextModel();
                if (nextModel) {
                    this.previousModel = nextModel;
                    if (await cdpClient.switchModel(nextModel)) {
                        progressTracker.recordModelSwitch();
                    }
                }
                return { success: false, response }; // Retry with new model
            }

            // Check for exit signals
            const exitCheck = exitDetector.checkResponse(response);
            if (exitCheck.shouldExit) {
                log.info(`Exit signal: ${exitCheck.reason}`);
                this.stop(exitCheck.reason || 'Task completed');
                return { success: true, response };
            }

            // Check for test-only loops (Ralph feature)
            const testCheck = testLoopDetector.analyzeResponse(response);
            if (testCheck.shouldExit) {
                log.info(`Test loop exit: ${testCheck.reason}`);
                this.stop(testCheck.reason || 'Feature likely complete (test loops detected)');
                return { success: true, response };
            }

            exitDetector.reportSuccess();
            return { success: true, response };
        } catch (err) {
            const message = (err as Error).message;
            log.error(`Execution error: ${message}`);
            this.recordFailure(message);
            return { success: false, response: '' };
        }
    }

    /**
     * Count a failed iteration. Three in a row stop the loop.
     */
    private recordFailure(what: string): void {
        const failCheck = exitDetector.reportFailure();
        if (failCheck.shouldExit) {
            this.stop(`${failCheck.reason || 'Too many failures'} (last: ${what})`);
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
            const done = () => {
                this.timer = null;
                this.wakeUp = null;
                resolve();
            };
            this.wakeUp = done; // stop() calls this so the sleeping loop can end
            this.timer = setTimeout(done, ms);
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
