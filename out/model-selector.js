"use strict";
/**
 * Workflow Kit - Model Selector
 * Intelligently selects the optimal AI model based on task type
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODELS = void 0;
exports.analyzeTaskType = analyzeTaskType;
exports.selectModel = selectModel;
exports.selectModelForTask = selectModelForTask;
exports.MODELS = [
    {
        id: 'claude-opus-4.5-thinking',
        displayName: 'Claude Opus 4.5 (Thinking)',
        taskTypes: ['reasoning'],
        priority: 100,
        costTier: 'high'
    },
    {
        id: 'claude-sonnet-4.5-thinking',
        displayName: 'Claude Sonnet 4.5 (Thinking)',
        taskTypes: ['reasoning', 'general'],
        priority: 90,
        costTier: 'medium'
    },
    {
        id: 'gemini-3-pro-high',
        displayName: 'Gemini 3 Pro (High)',
        taskTypes: ['frontend', 'general'],
        priority: 85,
        costTier: 'high'
    },
    {
        id: 'claude-sonnet-4.5',
        displayName: 'Claude Sonnet 4.5',
        taskTypes: ['general', 'reasoning'],
        priority: 80,
        costTier: 'medium'
    },
    {
        id: 'gemini-3-pro-low',
        displayName: 'Gemini 3 Pro (Low)',
        taskTypes: ['frontend', 'general', 'quick'],
        priority: 70,
        costTier: 'low'
    },
    {
        id: 'gemini-3-flash',
        displayName: 'Gemini 3 Flash',
        taskTypes: ['quick', 'bulk'],
        priority: 60,
        costTier: 'low'
    },
    {
        id: 'gpt-oss-120b',
        displayName: 'GPT-OSS 120B (Medium)',
        taskTypes: ['bulk', 'general'],
        priority: 50,
        costTier: 'low'
    }
];
// Task detection patterns
const TASK_PATTERNS = {
    reasoning: [
        'debug', 'fix bug', 'algorithm', 'architecture', 'refactor',
        'optimize', 'analyze', 'complex', 'logic', 'performance',
        'multi-file', 'migration', 'security', 'error handling'
    ],
    frontend: [
        'ui', 'css', 'component', 'react', 'vue', 'html', 'style',
        'design', 'animation', 'responsive', 'layout', 'tailwind',
        'button', 'form', 'modal', 'navbar', 'sidebar', 'dashboard'
    ],
    quick: [
        'format', 'typo', 'rename', 'simple', 'small change', 'minor',
        'comment', 'cleanup', 'lint', 'import', 'export'
    ],
    general: [
        'feature', 'implement', 'add', 'create', 'test', 'documentation',
        'api', 'endpoint', 'function', 'class', 'module'
    ],
    bulk: [
        'batch', 'multiple files', 'bulk update', 'mass', 'all files'
    ]
};
/**
 * Analyzes a task description and determines its type
 */
function analyzeTaskType(taskDescription) {
    const lowerTask = taskDescription.toLowerCase();
    // Score each task type based on keyword matches
    const scores = {
        reasoning: 0,
        frontend: 0,
        quick: 0,
        general: 0,
        bulk: 0
    };
    for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
        for (const pattern of patterns) {
            if (lowerTask.includes(pattern)) {
                scores[taskType] += 1;
            }
        }
    }
    // Find highest scoring type
    let maxScore = 0;
    let selectedType = 'general';
    for (const [type, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            selectedType = type;
        }
    }
    return selectedType;
}
/**
 * Selects the optimal model for a given task type
 */
function selectModel(taskType, unavailableModels = []) {
    // Filter models that support this task type and are available
    const candidates = exports.MODELS
        .filter(m => m.taskTypes.includes(taskType))
        .filter(m => !unavailableModels.includes(m.id))
        .sort((a, b) => b.priority - a.priority);
    return candidates[0] || null;
}
/**
 * Main model selection function
 */
function selectModelForTask(taskDescription, unavailableModels = []) {
    const taskType = analyzeTaskType(taskDescription);
    const model = selectModel(taskType, unavailableModels);
    return { model, taskType };
}
