/**
 * Antigravity Workflow Kit - Notification Manager
 * Smart notifications for Slack, Discord, webhooks, and daily summaries
 * @module core/notification-manager
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const log = createLogger('NotificationManager');

// ============ Types ============
export interface NotificationConfig {
    enabled: boolean;
    slackWebhook?: string;
    discordWebhook?: string;
    customWebhooks: string[];
    dailySummary: boolean;
    notifyOnComplete: boolean;
    notifyOnError: boolean;
}

export interface NotificationPayload {
    type: 'success' | 'error' | 'info' | 'warning' | 'summary';
    title: string;
    message: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}

// ============ Notification Manager Class ============
export class NotificationManager {
    private config: NotificationConfig = {
        enabled: true,
        customWebhooks: [],
        dailySummary: true,
        notifyOnComplete: true,
        notifyOnError: true
    };
    private notificationQueue: NotificationPayload[] = [];
    private dailyStats = {
        tasksCompleted: 0,
        errors: 0,
        loopsRun: 0
    };

    constructor() {
        log.info('NotificationManager initialized');
    }

    // ============ Notification Methods ============
    async notify(payload: NotificationPayload): Promise<void> {
        if (!this.config.enabled) return;

        this.notificationQueue.push(payload);

        // Send to all configured channels
        const promises: Promise<void>[] = [];

        if (this.config.slackWebhook) {
            promises.push(this.sendToSlack(payload));
        }

        if (this.config.discordWebhook) {
            promises.push(this.sendToDiscord(payload));
        }

        for (const webhook of this.config.customWebhooks) {
            promises.push(this.sendToWebhook(webhook, payload));
        }

        await Promise.allSettled(promises);
        log.debug(`Notification sent: ${payload.type} - ${payload.title}`);
    }

    async notifySuccess(title: string, message: string): Promise<void> {
        await this.notify({
            type: 'success',
            title,
            message,
            timestamp: Date.now()
        });
    }

    async notifyError(title: string, message: string): Promise<void> {
        if (!this.config.notifyOnError) return;

        await this.notify({
            type: 'error',
            title,
            message,
            timestamp: Date.now()
        });
    }

    async notifyTaskComplete(taskName: string, duration: number): Promise<void> {
        if (!this.config.notifyOnComplete) return;

        this.dailyStats.tasksCompleted++;

        await this.notify({
            type: 'success',
            title: 'Task Completed',
            message: `${taskName} completed in ${duration}ms`,
            timestamp: Date.now(),
            metadata: { taskName, duration }
        });
    }

    // ============ Channel Senders ============
    private async sendToSlack(payload: NotificationPayload): Promise<void> {
        if (!this.config.slackWebhook) return;

        const emoji = {
            success: ':white_check_mark:',
            error: ':x:',
            info: ':information_source:',
            warning: ':warning:',
            summary: ':chart_with_upwards_trend:'
        }[payload.type];

        const body = {
            text: `${emoji} *${payload.title}*\n${payload.message}`,
            attachments: payload.metadata ? [{
                fields: Object.entries(payload.metadata).map(([k, v]) => ({
                    title: k,
                    value: String(v),
                    short: true
                }))
            }] : undefined
        };

        try {
            await fetch(this.config.slackWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (error) {
            log.warn('Failed to send Slack notification', { error: (error as Error).message });
        }
    }

    private async sendToDiscord(payload: NotificationPayload): Promise<void> {
        if (!this.config.discordWebhook) return;

        const color = {
            success: 0x22c55e,
            error: 0xef4444,
            info: 0x3b82f6,
            warning: 0xf59e0b,
            summary: 0x8b5cf6
        }[payload.type];

        const body = {
            embeds: [{
                title: payload.title,
                description: payload.message,
                color,
                timestamp: new Date(payload.timestamp).toISOString(),
                fields: payload.metadata
                    ? Object.entries(payload.metadata).map(([name, value]) => ({
                        name,
                        value: String(value),
                        inline: true
                    }))
                    : undefined
            }]
        };

        try {
            await fetch(this.config.discordWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        } catch (error) {
            log.warn('Failed to send Discord notification', { error: (error as Error).message });
        }
    }

    private async sendToWebhook(url: string, payload: NotificationPayload): Promise<void> {
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            log.warn(`Failed to send to webhook ${url}`, { error: (error as Error).message });
        }
    }

    // ============ Daily Summary ============
    async sendDailySummary(): Promise<void> {
        if (!this.config.dailySummary) return;

        await this.notify({
            type: 'summary',
            title: 'Workflow Kit Daily Summary',
            message: `Tasks: ${this.dailyStats.tasksCompleted} | Loops: ${this.dailyStats.loopsRun} | Errors: ${this.dailyStats.errors}`,
            timestamp: Date.now(),
            metadata: this.dailyStats
        });

        // Reset stats
        this.dailyStats = { tasksCompleted: 0, errors: 0, loopsRun: 0 };
    }

    incrementLoops(): void {
        this.dailyStats.loopsRun++;
    }

    incrementErrors(): void {
        this.dailyStats.errors++;
    }

    // ============ Configuration ============
    setConfig(config: Partial<NotificationConfig>): void {
        this.config = { ...this.config, ...config };
        log.info('Notification config updated');
    }

    getConfig(): NotificationConfig {
        return { ...this.config };
    }

    isEnabled(): boolean {
        return this.config.enabled;
    }

    // ============ History ============
    getRecentNotifications(count = 20): NotificationPayload[] {
        return this.notificationQueue.slice(-count);
    }

    clearHistory(): void {
        this.notificationQueue = [];
    }
}

// Singleton export
export const notificationManager = new NotificationManager();
