/**
 * Antigravity Workflow Kit - Progress Tracker
 * Tracks progress across loop iterations
 * @module core/progress-tracker
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger';
import { SessionStats, INITIAL_SESSION_STATS } from '../utils/constants';

const execAsync = promisify(exec);
const log = createLogger('ProgressTracker');

export interface LoopProgress {
    loopNumber: number;
    timestamp: number;
    filesChanged: number;
    responseLength: number;
    responseHash: string;
    hasErrors: boolean;
    taskCompleted: boolean;
    modelUsed: string;
    durationMs: number;
}

export class ProgressTracker {
    private history: LoopProgress[] = [];
    private stats: SessionStats = { ...INITIAL_SESSION_STATS };
    private workspaceRoot: string | null = null;

    constructor() {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            this.workspaceRoot = folders[0].uri.fsPath;
        }
    }

    /**
     * Start a new session
     */
    startSession(): void {
        this.history = [];
        this.stats = { ...INITIAL_SESSION_STATS, startTime: Date.now() };
        log.info('Session started');
    }

    /**
     * Record a loop iteration
     */
    async recordLoop(partial: Partial<LoopProgress>): Promise<LoopProgress> {
        const filesChanged = await this.getFilesChanged();

        const progress: LoopProgress = {
            loopNumber: this.stats.loopCount + 1,
            timestamp: Date.now(),
            filesChanged,
            responseLength: partial.responseLength || 0,
            responseHash: partial.responseHash || this.hashString(String(partial.responseLength)),
            hasErrors: partial.hasErrors || false,
            taskCompleted: partial.taskCompleted || false,
            modelUsed: partial.modelUsed || 'unknown',
            durationMs: partial.durationMs || 0,
        };

        this.history.push(progress);
        this.stats.loopCount++;
        if (partial.taskCompleted) {
            this.stats.tasksCompleted++;
        }

        // Keep last 20 entries
        if (this.history.length > 20) {
            this.history.shift();
        }

        log.info(`Loop ${progress.loopNumber}: ${filesChanged} files, ${progress.responseLength} chars`);
        return progress;
    }

    /**
     * Get files changed since last loop
     */
    private async getFilesChanged(): Promise<number> {
        if (!this.workspaceRoot) return 0;

        try {
            const { stdout } = await execAsync('git diff --name-only', {
                cwd: this.workspaceRoot,
                timeout: 5000,
            });
            const files = stdout.trim().split('\n').filter(Boolean);
            return files.length;
        } catch {
            return 0;
        }
    }

    /**
     * Simple hash for response comparison
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    /**
     * Get session stats
     */
    getStats(): SessionStats {
        return { ...this.stats };
    }

    /**
     * Get recent history
     */
    getHistory(): LoopProgress[] {
        return [...this.history];
    }

    /**
     * Get session duration in minutes
     */
    getDurationMinutes(): number {
        if (!this.stats.startTime) return 0;
        return Math.floor((Date.now() - this.stats.startTime) / 60000);
    }

    /**
     * Check for stagnation patterns
     */
    isStagnating(): boolean {
        if (this.history.length < 3) return false;

        const recent = this.history.slice(-3);
        const noProgress = recent.every(p => p.filesChanged === 0);
        const sameResponse = recent.every(p => p.responseHash === recent[0].responseHash);

        return noProgress || sameResponse;
    }

    /**
     * Increment prompt counter
     */
    recordPromptSent(): void {
        this.stats.promptsSent++;
    }

    /**
     * Increment model switch counter
     */
    recordModelSwitch(): void {
        this.stats.modelSwitches++;
    }

    /**
     * Get summary for notification
     */
    getSummary(): string {
        return `${this.stats.loopCount} loops • ${this.stats.promptsSent} prompts • ${this.getDurationMinutes()}m`;
    }
}

export const progressTracker = new ProgressTracker();
