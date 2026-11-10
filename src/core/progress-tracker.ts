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
    /** Workspace state after the previous loop (or at session start); null when git is not usable */
    private snapshot: Promise<Set<string> | null> = Promise.resolve(null);

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
        // Baseline, so that what the first loop changes counts as progress
        this.snapshot = this.takeSnapshot();
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
            // No placeholder: an empty hash means "no response this loop"
            responseHash: partial.responseHash || '',
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

        log.info(`Loop ${progress.loopNumber}: ${filesChanged} workspace changes, ${progress.responseLength} chars`);
        return progress;
    }

    /**
     * Number of workspace changes since the previous loop: a new commit, a file that became
     * modified/added/deleted/untracked, or further edits to a file that was already modified.
     *
     * It compares two snapshots instead of counting dirty files, so a loop that commits its work
     * still counts as progress and a tree that was already dirty when the session started does not.
     * Returns 0 when the workspace is not a git repository.
     */
    private async getFilesChanged(): Promise<number> {
        const previous = await this.snapshot;
        const current = await this.takeSnapshot();
        this.snapshot = Promise.resolve(current);

        if (!previous || !current) return 0;

        let changes = 0;
        for (const entry of current) if (!previous.has(entry)) changes++;
        for (const entry of previous) if (!current.has(entry)) changes++;
        return changes;
    }

    /**
     * Describe the workspace as a set of lines: HEAD, `git status --porcelain` and the per-file
     * added/removed line counts against HEAD.
     */
    private async takeSnapshot(): Promise<Set<string> | null> {
        if (!this.workspaceRoot) return null;

        const options = { cwd: this.workspaceRoot, timeout: 5000, maxBuffer: 10 * 1024 * 1024 };
        try {
            const status = (await execAsync('git status --porcelain', options)).stdout;
            // Both fail in a repository without commits; that is fine
            const head = await execAsync('git rev-parse HEAD', options).then((r) => r.stdout.trim(), () => 'none');
            const numstat = await execAsync('git diff HEAD --numstat', options).then((r) => r.stdout, () => '');

            const entries = new Set<string>([`head ${head}`]);
            for (const line of status.split('\n')) if (line.trim()) entries.add(`status ${line}`);
            for (const line of numstat.split('\n')) if (line.trim()) entries.add(`diff ${line}`);
            return entries;
        } catch {
            return null; // not a git repository, or git is not installed
        }
    }

    /**
     * Hash of a response for repeat detection (case and whitespace are ignored).
     * Returns '' for an empty response.
     */
    hashResponse(response: string): string {
        const normalized = (response || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return normalized ? this.hashString(normalized) : '';
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
        const sameResponse = recent.every(p => p.responseHash !== '' && p.responseHash === recent[0].responseHash);

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
