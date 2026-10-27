/**
 * Workflow Kit - Model Selector
 * Intelligently selects the optimal AI model based on task type
 */
export type ModelId = 'gemini-3-pro-high' | 'gemini-3-pro-low' | 'gemini-3-flash' | 'claude-sonnet-4.5' | 'claude-sonnet-4.5-thinking' | 'claude-opus-4.5-thinking' | 'gpt-oss-120b';
export type TaskType = 'reasoning' | 'frontend' | 'quick' | 'general' | 'bulk';
export interface ModelConfig {
    id: ModelId;
    displayName: string;
    taskTypes: TaskType[];
    priority: number;
    costTier: 'high' | 'medium' | 'low';
}
export declare const MODELS: ModelConfig[];
/**
 * Analyzes a task description and determines its type
 */
export declare function analyzeTaskType(taskDescription: string): TaskType;
/**
 * Selects the optimal model for a given task type
 */
export declare function selectModel(taskType: TaskType, unavailableModels?: ModelId[]): ModelConfig | null;
/**
 * Main model selection function
 */
export declare function selectModelForTask(taskDescription: string, unavailableModels?: ModelId[]): {
    model: ModelConfig | null;
    taskType: TaskType;
};
