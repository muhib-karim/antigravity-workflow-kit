/**
 * Antigravity Workflow Kit - Recovery Strategies
 * When stuck, tries different approaches to unstick the AI
 * @module core/recovery-strategies
 */

import { createLogger } from '../utils/logger';
import { ModelId, ModelIdType } from '../utils/constants';

const log = createLogger('Recovery');

export enum RecoveryStrategy {
    SWITCH_TO_THINKING = 'SWITCH_TO_THINKING',
    USE_WEB_SEARCH = 'USE_WEB_SEARCH',
    BREAK_DOWN_PROBLEM = 'BREAK_DOWN_PROBLEM',
    TRY_DIFFERENT_MODEL = 'TRY_DIFFERENT_MODEL',
    SIMPLIFY_REQUEST = 'SIMPLIFY_REQUEST',
    ASK_FOR_CLARIFICATION = 'ASK_FOR_CLARIFICATION',
}

interface RecoveryAction {
    strategy: RecoveryStrategy;
    description: string;
    promptModifier?: string;
    modelSwitch?: ModelIdType;
    priority: number;
}

const RECOVERY_ACTIONS: RecoveryAction[] = [
    {
        strategy: RecoveryStrategy.SWITCH_TO_THINKING,
        description: 'Switch to thinking model for deeper reasoning',
        modelSwitch: ModelId.CLAUDE_SONNET_THINKING,
        priority: 1,
    },
    {
        strategy: RecoveryStrategy.USE_WEB_SEARCH,
        description: 'Suggest using @web for online research',
        promptModifier: `
I notice we might be stuck. Please try:
1. Use @web to search for solutions or documentation
2. Look up error messages or similar issues online
3. Find code examples that might help

Continue working on the task with this additional research.`,
        priority: 2,
    },
    {
        strategy: RecoveryStrategy.BREAK_DOWN_PROBLEM,
        description: 'Break the problem into smaller steps',
        promptModifier: `
Let's break this down into smaller steps:
1. Identify what's currently blocking progress
2. List the smallest possible next action
3. Complete just that one small step
4. Then we'll continue from there

What's the single smallest step we can take right now?`,
        priority: 3,
    },
    {
        strategy: RecoveryStrategy.TRY_DIFFERENT_MODEL,
        description: 'Try a different model for fresh perspective',
        modelSwitch: ModelId.GEMINI_PRO_HIGH,
        priority: 4,
    },
    {
        strategy: RecoveryStrategy.SIMPLIFY_REQUEST,
        description: 'Simplify the current request',
        promptModifier: `
Let's simplify our approach:
1. Skip any complex optimizations for now
2. Build the most basic working version first
3. We can enhance it later

What's the simplest implementation that would work?`,
        priority: 5,
    },
    {
        strategy: RecoveryStrategy.ASK_FOR_CLARIFICATION,
        description: 'Request clarification on requirements',
        promptModifier: `
Before continuing, let's clarify:
1. What exactly are we trying to achieve?
2. What's the expected outcome?
3. Are there any constraints I should know about?

Please summarize the current goal and what's blocking us.`,
        priority: 6,
    },
];

export class RecoveryManager {
    private attemptedStrategies: Set<RecoveryStrategy> = new Set();
    private recoveryCount = 0;
    private maxRecoveryAttempts = 3;

    /**
     * Get next recovery action to try
     */
    getNextRecoveryAction(): RecoveryAction | null {
        // Sort by priority
        const availableActions = RECOVERY_ACTIONS
            .filter(action => !this.attemptedStrategies.has(action.strategy))
            .sort((a, b) => a.priority - b.priority);

        if (availableActions.length === 0 || this.recoveryCount >= this.maxRecoveryAttempts) {
            log.warn('All recovery strategies exhausted');
            return null;
        }

        const action = availableActions[0];
        this.attemptedStrategies.add(action.strategy);
        this.recoveryCount++;

        log.info(`Recovery attempt ${this.recoveryCount}: ${action.description}`);
        return action;
    }

    /**
     * Check if recovery is available
     */
    canRecover(): boolean {
        return (
            this.recoveryCount < this.maxRecoveryAttempts &&
            this.attemptedStrategies.size < RECOVERY_ACTIONS.length
        );
    }

    /**
     * Reset recovery state (after successful progress)
     */
    reset(): void {
        this.attemptedStrategies.clear();
        this.recoveryCount = 0;
        log.info('Recovery state reset');
    }

    /**
     * Get recovery status for dashboard
     */
    getStatus(): { attempts: number; max: number; canRecover: boolean } {
        return {
            attempts: this.recoveryCount,
            max: this.maxRecoveryAttempts,
            canRecover: this.canRecover(),
        };
    }

    /**
     * Build recovery prompt to inject
     */
    buildRecoveryPrompt(action: RecoveryAction): string {
        if (action.promptModifier) {
            return action.promptModifier;
        }
        return '';
    }
}

export const recoveryManager = new RecoveryManager();
