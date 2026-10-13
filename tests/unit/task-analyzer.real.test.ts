/**
 * Task Analyzer & Model Selector - tests against the real implementations in src/core
 */

import { describe, it, expect } from 'vitest';
import { TaskAnalyzer } from '../../src/core/task-analyzer';
import { ModelSelector } from '../../src/core/model-selector';
import { TaskType, DEFAULT_CONFIG } from '../../src/utils/constants';

const analyzer = new TaskAnalyzer();

describe('TaskAnalyzer (src/core/task-analyzer)', () => {
    it('defaults to GENERAL for empty or unmatched input', () => {
        expect(analyzer.analyze('')).toBe(TaskType.GENERAL);
        expect(analyzer.analyze('zzz qqq')).toBe(TaskType.GENERAL);
    });

    it('classifies debugging work as REASONING', () => {
        expect(analyzer.analyze('Debug and fix the race condition bug')).toBe(TaskType.REASONING);
    });

    it('extracts the first unchecked task from a fix plan', () => {
        const plan = ['# Plan', '- [x] Done already', '- [ ] Add login page', '* [ ] Later'].join('\n');
        expect(analyzer.extractCurrentTask(plan)).toBe('Add login page');
    });

    it('returns null when every task is checked', () => {
        expect(analyzer.extractCurrentTask('- [x] a\n- [x] b')).toBeNull();
    });

    it('marks only the matching task complete, escaping regex characters', () => {
        const plan = '- [ ] Fix (urgent) bug?\n- [ ] Other';
        const updated = analyzer.markTaskComplete(plan, 'Fix (urgent) bug?');
        expect(updated).toBe('- [x] Fix (urgent) bug?\n- [ ] Other');
    });
});

describe('ModelSelector (src/core/model-selector)', () => {
    const selector = new ModelSelector();

    it('routes reasoning tasks to the configured reasoning model', () => {
        const selection = selector.selectForTask('investigate and debug the crash');
        expect(selection.taskType).toBe(TaskType.REASONING);
        expect(selection.modelId).toBe(DEFAULT_CONFIG.preferredModelForReasoning);
        expect(selection.reasoning).toContain('complex reasoning');
    });

    it('uses the reasoning model for GENERAL tasks', () => {
        const selection = selector.selectForTask('zzz');
        expect(selection.taskType).toBe(TaskType.GENERAL);
        expect(selection.modelId).toBe(DEFAULT_CONFIG.preferredModelForReasoning);
    });
});
