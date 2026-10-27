/**
 * Extension manifest consistency - package.json vs. src/extension.ts and defaults
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONFIG, MODEL_LABELS } from '../../src/utils/constants';

const root = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const extensionSource = readFileSync(join(root, 'src', 'extension.ts'), 'utf8');

describe('package.json manifest', () => {
    const commands: string[] = pkg.contributes.commands.map((c: { command: string }) => c.command);

    it('registers every contributed command in src/extension.ts', () => {
        for (const command of commands) {
            expect(extensionSource, `${command} not registered`).toContain(`registerCommand('${command}'`);
        }
    });

    it('declares settings whose defaults match DEFAULT_CONFIG', () => {
        const props = pkg.contributes.configuration.properties as Record<string, { default: unknown }>;
        for (const [fullKey, schema] of Object.entries(props)) {
            const key = fullKey.replace('workflowKit.', '') as keyof typeof DEFAULT_CONFIG;
            expect(DEFAULT_CONFIG, `${key} missing from DEFAULT_CONFIG`).toHaveProperty(key);
            expect(DEFAULT_CONFIG[key], `default mismatch for ${key}`).toEqual(schema.default);
        }
    });

    it('has a display label for every model ID offered in settings', () => {
        const props = pkg.contributes.configuration.properties as Record<string, { enum?: string[] }>;
        const modelIds = Object.entries(props)
            .filter(([key]) => key.startsWith('workflowKit.preferredModelFor'))
            .flatMap(([, schema]) => schema.enum ?? []);
        expect(modelIds.length).toBeGreaterThan(0);
        for (const id of modelIds) {
            expect(MODEL_LABELS, `no label for ${id}`).toHaveProperty([id]);
        }
    });

    it('points main at the esbuild output', () => {
        expect(pkg.main).toBe('dist/extension.js');
        expect(pkg.scripts.compile).toContain('--outfile=dist/extension.js');
    });
});
