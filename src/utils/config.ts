/**
 * Antigravity Workflow Kit - Configuration Manager
 * @module config
 */

import * as vscode from 'vscode';
import { WorkflowKitConfig, DEFAULT_CONFIG, ModelIdType } from './constants';

class ConfigurationManager {
    private static instance: ConfigurationManager;

    private constructor() { }

    static getInstance(): ConfigurationManager {
        if (!ConfigurationManager.instance) {
            ConfigurationManager.instance = new ConfigurationManager();
        }
        return ConfigurationManager.instance;
    }

    private getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration('workflowKit');
    }

    get<K extends keyof WorkflowKitConfig>(key: K): WorkflowKitConfig[K] {
        const config = this.getConfig();
        return config.get(key, DEFAULT_CONFIG[key]);
    }

    async set<K extends keyof WorkflowKitConfig>(key: K, value: WorkflowKitConfig[K]): Promise<void> {
        const config = this.getConfig();
        await config.update(key, value, vscode.ConfigurationTarget.Global);
    }

    getAll(): WorkflowKitConfig {
        return {
            autoAllEnabled: this.get('autoAllEnabled'),
            multiTabEnabled: this.get('multiTabEnabled'),
            autopilotModeEnabled: this.get('autopilotModeEnabled'),
            autoSwitchModels: this.get('autoSwitchModels'),
            autoGitCommit: this.get('autoGitCommit'),
            loopInterval: this.get('loopInterval'),
            maxLoopsPerSession: this.get('maxLoopsPerSession'),
            pollFrequency: this.get('pollFrequency'),
            bannedCommands: this.get('bannedCommands'),
            preferredModelForReasoning: this.get('preferredModelForReasoning'),
            preferredModelForFrontend: this.get('preferredModelForFrontend'),
            preferredModelForQuick: this.get('preferredModelForQuick'),
            executionTimeout: this.get('executionTimeout'),
            maxCallsPerHour: this.get('maxCallsPerHour'),
            maxConsecutiveTestLoops: this.get('maxConsecutiveTestLoops'),
            // v3.0 features
            mcpEnabled: this.get('mcpEnabled'),
            memoryEnabled: this.get('memoryEnabled'),
            codeReviewEnabled: this.get('codeReviewEnabled'),
            voiceControlEnabled: this.get('voiceControlEnabled'),
            notificationsEnabled: this.get('notificationsEnabled'),
            multiAgentEnabled: this.get('multiAgentEnabled'),
            autoTestGeneration: this.get('autoTestGeneration'),
        };
    }

    async setMultiple(updates: Partial<WorkflowKitConfig>): Promise<void> {
        for (const [key, value] of Object.entries(updates)) {
            await this.set(key as keyof WorkflowKitConfig, value as WorkflowKitConfig[keyof WorkflowKitConfig]);
        }
    }

    getModelForTaskType(taskType: 'reasoning' | 'frontend' | 'quick'): ModelIdType {
        switch (taskType) {
            case 'reasoning':
                return this.get('preferredModelForReasoning');
            case 'frontend':
                return this.get('preferredModelForFrontend');
            case 'quick':
                return this.get('preferredModelForQuick');
            default:
                return this.get('preferredModelForReasoning');
        }
    }
}

export const config = ConfigurationManager.getInstance();
