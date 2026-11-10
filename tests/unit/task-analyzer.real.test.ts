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

    it('matches keywords as whole words, not as substrings', () => {
        expect(analyzer.analyze('Build the release pipeline')).toBe(TaskType.GENERAL);       // "ui" in "build"
        expect(analyzer.analyze('Add a prefix to every log line')).toBe(TaskType.GENERAL);   // "fix" in "prefix"
        expect(analyzer.analyze('Write the information page text')).toBe(TaskType.FRONTEND); // "page", not "form"
        expect(analyzer.analyze('Tidy the UI')).toBe(TaskType.FRONTEND);
    });

    it('still matches simple inflections of a keyword', () => {
        expect(analyzer.analyze('Fixing two bugs')).toBe(TaskType.REASONING);
        expect(analyzer.analyze('Optimizing the hot path')).toBe(TaskType.REASONING);
        expect(analyzer.analyze('Renamed variables and removed comments')).toBe(TaskType.QUICK);
        expect(analyzer.analyze('New buttons and forms')).toBe(TaskType.FRONTEND);
    });

    it('finds nested (indented) unchecked items and + bullets', () => {
        expect(analyzer.extractCurrentTask('- [x] Parent item\n  - [ ] Nested child task\n')).toBe('Nested child task');
        expect(analyzer.extractCurrentTask('+ [ ] Plus bullet')).toBe('Plus bullet');
        expect(analyzer.extractCurrentTask('\t* [ ] Tab indented')).toBe('Tab indented');
    });

    it('ignores checkbox examples inside fenced code blocks', () => {
        const plan = ['Format:', '```', '- [ ] example item', '```', '- [x] done', '- [ ] Real task'].join('\n');
        expect(analyzer.extractCurrentTask(plan)).toBe('Real task');
    });

    it('marks a nested task complete and keeps its indentation', () => {
        const plan = '- [x] Parent\n  - [ ] Child';
        expect(analyzer.markTaskComplete(plan, 'Child')).toBe('- [x] Parent\n  - [x] Child');
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
