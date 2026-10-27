/**
 * Antigravity Workflow Kit - Task Analyzer
 * Analyzes task descriptions to determine optimal model selection
 * @module core/task-analyzer
 */

import { TaskType, TaskTypeValue, TASK_KEYWORDS } from '../utils/constants';
import { createLogger } from '../utils/logger';

const log = createLogger('TaskAnalyzer');

export class TaskAnalyzer {
    /**
     * Analyzes a task description and returns the most appropriate task type
     */
    analyze(taskDescription: string): TaskTypeValue {
        if (!taskDescription || taskDescription.trim() === '') {
            log.debug('Empty task description, defaulting to GENERAL');
            return TaskType.GENERAL;
        }

        const lowerDesc = taskDescription.toLowerCase();
        const scores = this.calculateScores(lowerDesc);

        log.debug('Task analysis scores', scores);

        // Return type with highest score, defaulting to GENERAL
        const maxScore = Math.max(scores.reasoning, scores.frontend, scores.quick);

        if (maxScore === 0) {
            return TaskType.GENERAL;
        }

        if (scores.reasoning === maxScore) return TaskType.REASONING;
        if (scores.frontend === maxScore) return TaskType.FRONTEND;
        if (scores.quick === maxScore) return TaskType.QUICK;

        return TaskType.GENERAL;
    }

    /**
     * Calculates keyword match scores for each task type
     */
    private calculateScores(text: string): Record<string, number> {
        return {
            reasoning: this.countMatches(text, TASK_KEYWORDS.reasoning),
            frontend: this.countMatches(text, TASK_KEYWORDS.frontend),
            quick: this.countMatches(text, TASK_KEYWORDS.quick),
        };
    }

    /**
     * Counts how many keywords from the list appear in the text
     */
    private countMatches(text: string, keywords: readonly string[]): number {
        return keywords.reduce((count, keyword) => {
            return count + (text.includes(keyword) ? 1 : 0);
        }, 0);
    }

    /**
     * Extracts the current uncompleted task from @fix_plan.md content
     */
    extractCurrentTask(content: string): string | null {
        const lines = content.split('\n');

        for (const line of lines) {
            // Match uncompleted task: - [ ] or * [ ]
            if (/^[-*]\s*\[\s*\]/.test(line)) {
                const task = line.replace(/^[-*]\s*\[\s*\]\s*/, '').trim();
                log.info('Found current task', { task });
                return task;
            }
        }

        log.info('No uncompleted tasks found');
        return null;
    }

    /**
     * Marks a task as completed in the fix plan content
     */
    markTaskComplete(content: string, task: string): string {
        const escapedTask = task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^([-*]\\s*)\\[\\s*\\](\\s*${escapedTask})`, 'mi');

        const updated = content.replace(pattern, '$1[x]$2');
        log.info('Marked task complete', { task });

        return updated;
    }
}

export const taskAnalyzer = new TaskAnalyzer();
