/**
 * Antigravity Workflow Kit - Project Manager Integration
 * Jira and GitHub Issues integration for task management
 * @module providers/project-manager
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const log = createLogger('ProjectManager');

// ============ Types ============
export interface ProjectTask {
    id: string;
    key?: string; // Jira key or GitHub issue number
    title: string;
    description?: string;
    status: 'todo' | 'in_progress' | 'done' | 'blocked';
    priority?: 'critical' | 'high' | 'medium' | 'low';
    assignee?: string;
    labels?: string[];
    source: 'jira' | 'github' | 'local';
    url?: string;
    createdAt: number;
    updatedAt: number;
}

export interface PullRequest {
    title: string;
    body: string;
    branch: string;
    baseBranch: string;
    labels?: string[];
    linkedIssues?: string[];
}

export interface ProjectConfig {
    jira?: {
        baseUrl: string;
        projectKey: string;
        email: string;
        apiToken: string;
    };
    github?: {
        owner: string;
        repo: string;
        token: string;
    };
}

// ============ Project Manager Class ============
export class ProjectManager {
    private config: ProjectConfig | null = null;
    private workspaceRoot: string | null = null;
    private fixPlanPath: string | null = null;

    constructor() {
        this.initializeWorkspace();
    }

    private initializeWorkspace(): void {
        const folders = vscode.workspace.workspaceFolders;
        if (folders?.[0]) {
            this.workspaceRoot = folders[0].uri.fsPath;
            this.fixPlanPath = path.join(this.workspaceRoot, '@fix_plan.md');
        }
        this.loadConfig();
    }

    private loadConfig(): void {
        if (!this.workspaceRoot) return;

        const configPath = path.join(this.workspaceRoot, '.workflow-kit', 'project-manager.json');
        if (fs.existsSync(configPath)) {
            try {
                this.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                log.info('Project manager config loaded');
            } catch (error) {
                log.warn('Failed to load project config', { error: (error as Error).message });
            }
        }
    }

    // ============ Fix Plan Sync ============
    async syncFromFixPlan(): Promise<ProjectTask[]> {
        if (!this.fixPlanPath || !fs.existsSync(this.fixPlanPath)) {
            return [];
        }

        const content = fs.readFileSync(this.fixPlanPath, 'utf-8');
        const tasks: ProjectTask[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            // Parse markdown task format: - [ ] Task description
            const match = line.match(/^[-*]\s*\[([x\s])\]\s*(.+)$/i);
            if (match) {
                const status = match[1].toLowerCase() === 'x' ? 'done' : 'todo';
                const title = match[2].trim();

                tasks.push({
                    id: this.generateId(title),
                    title,
                    status,
                    source: 'local',
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
            }
        }

        log.info(`Synced ${tasks.length} tasks from @fix_plan.md`);
        return tasks;
    }

    async updateFixPlan(tasks: ProjectTask[]): Promise<void> {
        if (!this.fixPlanPath) return;

        const lines: string[] = ['# Fix Plan\n'];

        const todoTasks = tasks.filter(t => t.status !== 'done');
        const doneTasks = tasks.filter(t => t.status === 'done');

        if (todoTasks.length > 0) {
            lines.push('## To Do\n');
            for (const task of todoTasks) {
                const checkbox = task.status === 'in_progress' ? '[/]' : '[ ]';
                const priority = task.priority ? ` [${task.priority}]` : '';
                lines.push(`- ${checkbox} ${task.title}${priority}`);
            }
            lines.push('');
        }

        if (doneTasks.length > 0) {
            lines.push('## Completed\n');
            for (const task of doneTasks) {
                lines.push(`- [x] ${task.title}`);
            }
        }

        fs.writeFileSync(this.fixPlanPath, lines.join('\n'));
        log.info('Updated @fix_plan.md');
    }

    // ============ GitHub Integration ============
    async fetchGitHubIssues(): Promise<ProjectTask[]> {
        if (!this.config?.github) {
            log.debug('GitHub not configured');
            return [];
        }

        const { owner, repo, token } = this.config.github;

        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/issues?state=open`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const issues = await response.json() as Array<{
                number: number;
                title: string;
                body: string;
                html_url: string;
                labels: Array<{ name: string }>;
                assignee?: { login: string };
            }>;

            return issues.map(issue => ({
                id: `gh-${issue.number}`,
                key: `#${issue.number}`,
                title: issue.title,
                description: issue.body,
                status: 'todo' as const,
                labels: issue.labels.map(l => l.name),
                assignee: issue.assignee?.login,
                source: 'github' as const,
                url: issue.html_url,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }));
        } catch (error) {
            log.error('Failed to fetch GitHub issues', { error: (error as Error).message });
            return [];
        }
    }

    async createGitHubIssue(task: Omit<ProjectTask, 'id' | 'source' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
        if (!this.config?.github) {
            log.warn('GitHub not configured');
            return null;
        }

        const { owner, repo, token } = this.config.github;

        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/issues`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: task.title,
                        body: task.description || '',
                        labels: task.labels || []
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const issue = await response.json() as { number: number; html_url: string };
            log.info(`Created GitHub issue #${issue.number}`);
            return issue.html_url;
        } catch (error) {
            log.error('Failed to create GitHub issue', { error: (error as Error).message });
            return null;
        }
    }

    async createPullRequest(pr: PullRequest): Promise<string | null> {
        if (!this.config?.github) return null;

        const { owner, repo, token } = this.config.github;

        try {
            const response = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/pulls`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: pr.title,
                        body: pr.body,
                        head: pr.branch,
                        base: pr.baseBranch
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const result = await response.json() as { html_url: string; number: number };
            log.info(`Created PR #${result.number}`);
            return result.html_url;
        } catch (error) {
            log.error('Failed to create PR', { error: (error as Error).message });
            return null;
        }
    }

    // ============ Jira Integration ============
    async fetchJiraIssues(): Promise<ProjectTask[]> {
        if (!this.config?.jira) {
            log.debug('Jira not configured');
            return [];
        }

        const { baseUrl, projectKey, email, apiToken } = this.config.jira;
        const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

        try {
            const jql = encodeURIComponent(`project = ${projectKey} AND status != Done ORDER BY priority DESC`);
            const response = await fetch(
                `${baseUrl}/rest/api/3/search?jql=${jql}`,
                {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Jira API error: ${response.status}`);
            }

            const data = await response.json() as {
                issues: Array<{
                    key: string;
                    fields: {
                        summary: string;
                        description?: { content: Array<{ content: Array<{ text: string }> }> };
                        status: { name: string };
                        priority?: { name: string };
                        assignee?: { displayName: string };
                        labels: string[];
                    };
                    self: string;
                }>;
            };

            return data.issues.map(issue => ({
                id: `jira-${issue.key}`,
                key: issue.key,
                title: issue.fields.summary,
                description: this.extractJiraDescription(issue.fields.description),
                status: this.mapJiraStatus(issue.fields.status.name),
                priority: this.mapJiraPriority(issue.fields.priority?.name),
                assignee: issue.fields.assignee?.displayName,
                labels: issue.fields.labels,
                source: 'jira' as const,
                url: `${baseUrl}/browse/${issue.key}`,
                createdAt: Date.now(),
                updatedAt: Date.now()
            }));
        } catch (error) {
            log.error('Failed to fetch Jira issues', { error: (error as Error).message });
            return [];
        }
    }

    private extractJiraDescription(desc: { content: Array<{ content: Array<{ text: string }> }> } | undefined): string {
        if (!desc?.content) return '';
        return desc.content
            .flatMap(c => c.content?.map(t => t.text) || [])
            .join('\n');
    }

    private mapJiraStatus(status: string): ProjectTask['status'] {
        const normalized = status.toLowerCase();
        if (normalized.includes('done') || normalized.includes('closed')) return 'done';
        if (normalized.includes('progress') || normalized.includes('active')) return 'in_progress';
        if (normalized.includes('blocked')) return 'blocked';
        return 'todo';
    }

    private mapJiraPriority(priority: string | undefined): ProjectTask['priority'] {
        if (!priority) return undefined;
        const normalized = priority.toLowerCase();
        if (normalized.includes('critical') || normalized.includes('highest')) return 'critical';
        if (normalized.includes('high')) return 'high';
        if (normalized.includes('low') || normalized.includes('lowest')) return 'low';
        return 'medium';
    }

    // ============ Git Operations ============
    async getCurrentBranch(): Promise<string> {
        const { exec } = require('child_process');

        return new Promise((resolve) => {
            exec('git branch --show-current', { cwd: this.workspaceRoot }, (error: Error | null, stdout: string) => {
                resolve(error ? 'main' : stdout.trim());
            });
        });
    }

    async createBranchFromTask(task: ProjectTask): Promise<string> {
        const { exec } = require('child_process');

        const branchName = this.generateBranchName(task);

        return new Promise((resolve, reject) => {
            exec(`git checkout -b ${branchName}`, { cwd: this.workspaceRoot }, (error: Error | null) => {
                if (error) {
                    reject(error);
                } else {
                    log.info(`Created branch: ${branchName}`);
                    resolve(branchName);
                }
            });
        });
    }

    async commitProgress(message: string): Promise<void> {
        const { exec } = require('child_process');

        return new Promise((resolve, reject) => {
            exec(`git add -A && git commit -m "${message}"`, { cwd: this.workspaceRoot }, (error: Error | null) => {
                if (error) {
                    log.warn('Commit failed (may have no changes)');
                    resolve();
                } else {
                    log.info(`Committed: ${message}`);
                    resolve();
                }
            });
        });
    }

    generatePRDescription(task: ProjectTask, changes: string[]): string {
        const lines: string[] = [
            `## Summary`,
            task.description || task.title,
            '',
            `## Changes`,
            ...changes.map(c => `- ${c}`),
            '',
            `## Related Issue`,
            task.url ? `Closes ${task.key || task.url}` : `Task: ${task.title}`,
            '',
            `---`,
            `_Generated by Antigravity Workflow Kit_`
        ];

        return lines.join('\n');
    }

    // ============ Utilities ============
    private generateId(title: string): string {
        const slug = title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 20);
        return `${slug}-${Date.now().toString(36)}`;
    }

    private generateBranchName(task: ProjectTask): string {
        const prefix = task.key ? task.key.toLowerCase() : 'task';
        const slug = task.title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .substring(0, 40);
        return `${prefix}/${slug}`;
    }

    // ============ Configuration ============
    async configure(config: ProjectConfig): Promise<void> {
        this.config = config;

        if (this.workspaceRoot) {
            const configDir = path.join(this.workspaceRoot, '.workflow-kit');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const configPath = path.join(configDir, 'project-manager.json');
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            log.info('Saved project manager configuration');
        }
    }

    isConfigured(): { jira: boolean; github: boolean } {
        return {
            jira: !!this.config?.jira,
            github: !!this.config?.github
        };
    }
}

// Singleton export
export const projectManager = new ProjectManager();
