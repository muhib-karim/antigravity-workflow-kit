/**
 * Antigravity Workflow Kit - Model Selector
 * Intelligent model selection based on task analysis
 * @module core/model-selector
 */

import { ModelIdType, TaskTypeValue, TaskType, MODEL_LABELS } from '../utils/constants';
import { config } from '../utils/config';
import { createLogger } from '../utils/logger';
import { taskAnalyzer } from './task-analyzer';
import * as vscode from 'vscode';

const log = createLogger('ModelSelector');

export interface ModelSelection {
    modelId: ModelIdType;
    modelDisplayName: string;
    taskType: TaskTypeValue;
    reasoning: string;
}

export class ModelSelector {
    /**
     * Selects the optimal model for a given task description
     */
    selectForTask(taskDescription: string): ModelSelection {
        const taskType = taskAnalyzer.analyze(taskDescription);
        const modelId = this.getModelForType(taskType);
        const modelDisplayName = MODEL_LABELS[modelId] || modelId;

        const selection: ModelSelection = {
            modelId,
            modelDisplayName,
            taskType,
            reasoning: this.generateReasoning(taskType, modelDisplayName),
        };

        log.info(`Selected model: ${modelId} (${selection.reasoning})`);
        return selection;
    }

    /**
     * Gets the configured model for a task type
     */
    private getModelForType(taskType: TaskTypeValue): ModelIdType {
        switch (taskType) {
            case TaskType.REASONING:
                return config.get('preferredModelForReasoning');
            case TaskType.FRONTEND:
                return config.get('preferredModelForFrontend');
            case TaskType.QUICK:
                return config.get('preferredModelForQuick');
            case TaskType.GENERAL:
            default:
                // For general tasks, use reasoning model as it's most capable
                return config.get('preferredModelForReasoning');
        }
    }

    /**
     * Generates a human-readable reasoning for model selection
     */
    private generateReasoning(taskType: TaskTypeValue, modelName: string): string {
        const taskTypeNames: Record<TaskTypeValue, string> = {
            [TaskType.REASONING]: 'complex reasoning',
            [TaskType.FRONTEND]: 'UI work',
            [TaskType.QUICK]: 'quick task',
            [TaskType.GENERAL]: 'general task',
        };

        return `Using ${modelName} for ${taskTypeNames[taskType]}`;
    }

    /**
     * Shows a notification with model switch info
     */
    showSwitchNotification(selection: ModelSelection): void {
        vscode.window.showInformationMessage(
            `🔄 Workflow Kit: ${selection.reasoning}`
        );
    }

    /**
     * Checks if model switching is enabled
     */
    isAutoSwitchEnabled(): boolean {
        return config.get('autoSwitchModels');
    }
}

export const modelSelector = new ModelSelector();
