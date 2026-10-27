/**
 * Antigravity Workflow Kit - Antigravity Usage Provider
 * Fetches usage quotas from local language server API
 * @module providers/antigravity-usage
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as http from 'http';
import { UsageData, ModelUsage } from '../utils/constants';
import { createLogger } from '../utils/logger';

const execAsync = promisify(exec);
const log = createLogger('UsageProvider');

interface ProcessInfo {
    pid: number;
    csrfToken: string;
}

interface UserStatusResponse {
    userStatus?: {
        email?: string;
        planStatus?: {
            planInfo?: {
                planDisplayName?: string;
                displayName?: string;
                productName?: string;
                planName?: string;
            };
        };
        cascadeModelConfigData?: {
            clientModelConfigs?: Array<{
                label: string;
                modelOrAlias?: { model: string };
                quotaInfo?: {
                    remainingFraction?: number;
                    resetTime?: string;
                };
            }>;
        };
    };
}

export class AntigravityUsageProvider {
    private timeout = 8000;
    private cachedUsage: UsageData | null = null;
    private lastFetch = 0;
    private cacheTimeout = 30000; // 30 seconds
    private previousUsage: Map<string, number> = new Map(); // Track previous usage for delta logging

    async fetch(): Promise<UsageData | null> {
        // Return cached if recent
        if (this.cachedUsage && Date.now() - this.lastFetch < this.cacheTimeout) {
            return this.cachedUsage;
        }

        try {
            const processInfo = await this.detectProcess();
            const ports = await this.getListeningPorts(processInfo.pid);
            const workingPort = await this.findWorkingPort(ports, processInfo.csrfToken);

            const response = await this.makeRequest(
                workingPort,
                processInfo.csrfToken,
                '/exa.language_server_pb.LanguageServerService/GetUserStatus'
            );

            const usage = this.parseUserStatus(response);

            // Log quota changes to help user understand which operations consume which models
            this.logQuotaChanges(usage);

            this.cachedUsage = usage;
            this.lastFetch = Date.now();
            log.info('Usage fetched', { models: usage.models.length });
            return usage;
        } catch (error) {
            log.warn('Usage fetch failed', { error: (error as Error).message });
            return null;
        }
    }

    /**
     * Log quota changes between fetches to help users understand which operations consume quota
     */
    private logQuotaChanges(usage: UsageData): void {
        if (this.previousUsage.size === 0) {
            // First fetch - just record baseline
            for (const model of usage.models) {
                this.previousUsage.set(model.modelId, model.remainingPercent);
                log.info(`📊 ${model.label}: ${model.remainingPercent.toFixed(1)}% remaining`);
            }
            return;
        }

        // Compare with previous and log any changes
        for (const model of usage.models) {
            const prevRemaining = this.previousUsage.get(model.modelId);
            if (prevRemaining !== undefined) {
                const delta = prevRemaining - model.remainingPercent;
                if (Math.abs(delta) >= 0.1) { // Only log if change is >= 0.1%
                    const emoji = delta > 0 ? '⬇️' : '⬆️';
                    log.info(`${emoji} ${model.label}: ${model.remainingPercent.toFixed(1)}% (${delta > 0 ? '-' : '+'}${Math.abs(delta).toFixed(1)}%)`);
                }
            }
            this.previousUsage.set(model.modelId, model.remainingPercent);
        }
    }

    private async detectProcess(): Promise<ProcessInfo> {
        const { stdout } = await execAsync(
            'wmic process where "Name like \'%language_server%\'" get ProcessId,CommandLine /format:list',
            { timeout: this.timeout, maxBuffer: 10 * 1024 * 1024 }
        );

        if (!stdout?.trim()) {
            throw new Error('Language server not detected');
        }

        const entries = stdout.split(/\r?\n\r?\n/).filter((block) => block.trim());

        for (const entry of entries) {
            const lines = entry.split(/\r?\n/).filter((l) => l.trim());
            let commandLine = '';
            let pid = 0;

            for (const line of lines) {
                if (line.startsWith('CommandLine=')) {
                    commandLine = line.substring('CommandLine='.length);
                } else if (line.startsWith('ProcessId=')) {
                    pid = parseInt(line.substring('ProcessId='.length), 10);
                }
            }

            if (!commandLine || !pid) continue;

            const csrfToken = this.extractFlag('--csrf_token', commandLine);
            if (!csrfToken) continue;

            return { pid, csrfToken };
        }

        throw new Error('No valid language server process found');
    }

    private extractFlag(flag: string, commandLine: string): string | undefined {
        const patterns = [
            new RegExp(`${flag}[=\\s]+([^\\s"]+)`, 'i'),
            new RegExp(`${flag}[=\\s]+"([^"]+)"`, 'i'),
        ];

        for (const pattern of patterns) {
            const match = commandLine.match(pattern);
            if (match?.[1]) return match[1];
        }
        return undefined;
    }

    private async getListeningPorts(pid: number): Promise<number[]> {
        const { stdout } = await execAsync(
            `netstat -ano | findstr "${pid}" | findstr "LISTENING"`,
            { timeout: this.timeout }
        );

        const ports = new Set<number>();
        for (const line of stdout.split('\n')) {
            const match = line.match(/:(\d+)\s+[\d.:]+\s+LISTENING/);
            if (match?.[1]) {
                ports.add(parseInt(match[1], 10));
            }
        }

        return Array.from(ports).sort((a, b) => a - b);
    }

    private async findWorkingPort(ports: number[], csrfToken: string): Promise<number> {
        for (const port of ports) {
            try {
                await this.makeRequest(
                    port,
                    csrfToken,
                    '/exa.language_server_pb.LanguageServerService/GetUnleashData'
                );
                return port;
            } catch {
                // Try next
            }
        }
        throw new Error('No working API port found');
    }

    private makeRequest(port: number, csrfToken: string, path: string): Promise<UserStatusResponse> {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify({
                metadata: {
                    ideName: 'antigravity',
                    extensionName: 'workflowKit',
                    ideVersion: 'unknown',
                    locale: 'en',
                },
            });

            const options = {
                hostname: '127.0.0.1',
                port,
                path,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': csrfToken,
                },
                rejectUnauthorized: false,
                timeout: this.timeout,
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        reject(new Error('Invalid JSON'));
                    }
                });
            });

            req.on('error', () => {
                // HTTP fallback
                const httpReq = http.request({ ...options }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            reject(new Error('Invalid JSON'));
                        }
                    });
                });
                httpReq.on('error', reject);
                httpReq.write(body);
                httpReq.end();
            });

            req.write(body);
            req.end();
        });
    }

    private parseUserStatus(response: UserStatusResponse): UsageData {
        const userStatus = response.userStatus;
        if (!userStatus) {
            return { models: [], updatedAt: new Date().toISOString(), error: 'No data' };
        }

        const modelConfigs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];

        const models: ModelUsage[] = modelConfigs
            .filter((config) => config.quotaInfo)
            .map((config) => {
                const remaining =
                    config.quotaInfo?.remainingFraction !== undefined
                        ? Math.max(0, Math.min(100, config.quotaInfo.remainingFraction * 100))
                        : 100;

                return {
                    label: config.label,
                    modelId: config.modelOrAlias?.model || config.label,
                    remainingPercent: remaining,
                    usedPercent: 100 - remaining,
                    resetTime: config.quotaInfo?.resetTime,
                };
            })
            .sort((a, b) => a.label.localeCompare(b.label));

        const planInfo = userStatus.planStatus?.planInfo;
        const plan =
            planInfo?.planDisplayName ||
            planInfo?.displayName ||
            planInfo?.productName ||
            planInfo?.planName ||
            'Free';

        return {
            email: userStatus.email,
            plan,
            models,
            updatedAt: new Date().toISOString(),
        };
    }
}

export const usageProvider = new AntigravityUsageProvider();
