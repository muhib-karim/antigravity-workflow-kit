/**
 * CI configuration guards: one gating workflow, actions pinned to commit SHAs,
 * and no step that hides a failure.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const workflowsDir = join(root, '.github', 'workflows');
const workflows = readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)).sort();
const read = (name: string) => readFileSync(join(workflowsDir, name), 'utf8');

describe('GitHub Actions workflows', () => {
    it('has exactly one CI workflow and one release workflow', () => {
        expect(workflows).toEqual(['ci.yml', 'release.yml']);
    });

    it.each(workflows)('%s pins every action to a full commit SHA', (name) => {
        const uses = [...read(name).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map((m) => m[1]);
        expect(uses.length).toBeGreaterThan(0);
        expect(uses.filter((ref) => !/@[0-9a-f]{40}$/.test(ref))).toEqual([]);
    });

    it.each(workflows)('%s sets a job timeout and least-privilege default permissions', (name) => {
        const text = read(name);
        expect(text).toMatch(/^permissions:\n {2}contents: read$/m);
        const jobs = text.split(/^jobs:$/m)[1];
        const jobCount = (jobs.match(/^ {2}[\w-]+:$/gm) || []).length;
        expect((jobs.match(/^ {4}timeout-minutes: \d+$/gm) || []).length).toBe(jobCount);
    });

    it('lets nothing but the artifact upload continue on error', () => {
        const ci = read('ci.yml');
        const flagged = [...ci.matchAll(/^\s*continue-on-error:\s*true\s*\n\s*uses:\s*(\S+)/gm)].map((m) => m[1].split('@')[0]);
        expect(flagged).toEqual(['actions/upload-artifact']);
        expect((ci.match(/continue-on-error:\s*true/g) || []).length).toBe(1);
        expect(read('release.yml')).not.toMatch(/continue-on-error/);
    });

    it('gates on lint, types, tests, build and package on Node 22 and 24, and scans for secrets', () => {
        const ci = read('ci.yml');
        for (const command of ['npm ci', 'npm run lint', 'npm run typecheck', 'npm run test:coverage', 'npm run compile', 'npm run package']) {
            expect(ci, command).toContain(`run: ${command}`);
        }
        expect(ci).toMatch(/node-version: \[22\.x, 24\.x\]/);
        expect(ci).toMatch(/gitleaks" git /);
        expect(ci).toMatch(/retention-days: 3/);
    });

    it('never passes publishing tokens on the command line', () => {
        expect(read('release.yml')).not.toMatch(/-p \$\{\{\s*secrets\./);
    });

    it('has Dependabot configured for npm and GitHub Actions', () => {
        const file = join(root, '.github', 'dependabot.yml');
        expect(existsSync(file)).toBe(true);
        const text = readFileSync(file, 'utf8');
        expect(text).toMatch(/package-ecosystem: npm/);
        expect(text).toMatch(/package-ecosystem: github-actions/);
    });
});
