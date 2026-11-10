/**
 * Rate limit handler - model fallback when the editor reports a rate limit
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimitHandler } from '../../src/core/rate-limit-handler';
import { ModelId } from '../../src/utils/constants';

describe('RateLimitHandler (src/core/rate-limit-handler)', () => {
    let handler: RateLimitHandler;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        handler = new RateLimitHandler(); // starts on claude-opus-4.5-thinking
    });

    it('falls back through the model list and reports when nothing is left', () => {
        expect(handler.getNextModel()).toBe(ModelId.CLAUDE_SONNET_THINKING);
        expect(handler.getState().limited).toEqual([ModelId.CLAUDE_OPUS_THINKING]);
        for (let i = 0; i < 5; i++) expect(handler.getNextModel()).not.toBeNull();
        expect(handler.getNextModel()).toBeNull();
        expect(handler.hasAvailableModels()).toBe(false);
    });

    it('setCurrentModel on a limited model keeps the healthy current model and marks nothing else', () => {
        handler.getNextModel(); // opus got rate limited -> now on sonnet-thinking
        for (let i = 0; i < 6; i++) {
            handler.setCurrentModel(ModelId.CLAUDE_OPUS_THINKING); // what the loop asks for on every reasoning task
        }
        expect(handler.getState().limited).toEqual([ModelId.CLAUDE_OPUS_THINKING]);
        expect(handler.getCurrentModel()).toBe(ModelId.CLAUDE_SONNET_THINKING);
        expect(handler.hasAvailableModels()).toBe(true);
    });

    it('setCurrentModel switches to a model that is not limited', () => {
        handler.setCurrentModel(ModelId.GEMINI_FLASH);
        expect(handler.getCurrentModel()).toBe(ModelId.GEMINI_FLASH);
    });

    it.each([
        'Rate limit reached. Please try again later.',
        'You have exceeded your quota for this model.',
        'Too many requests',
        'The model is currently overloaded.',
        'Usage limit reached for Claude Opus 4.5',
    ])('detects a rate-limit notice: %s', (notice) => {
        expect(handler.isRateLimited(notice)).toBe(true);
    });

    it.each([
        'Refactored the overloaded parse() signatures and increased the buffer capacity to 64KB.',
        'Implemented the rate limiter module and its unit tests; all green.',
        'The queue now has a capacity check.',
        '',
    ])('does not mistake ordinary output for a rate limit: %s', (response) => {
        expect(handler.isRateLimited(response)).toBe(false);
    });

    it('ignores rate-limit phrases inside a long answer', () => {
        const answer = 'Here is the retry helper. '.repeat(30) + 'It shows "Rate limit reached, try again later" to the user.';
        expect(handler.isRateLimited(answer)).toBe(false);
    });
});
