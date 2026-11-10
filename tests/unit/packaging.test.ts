/**
 * Packaging - what `vsce package` would put in the VSIX (.vscodeignore is an allow-list).
 * Regression: the VSIX used to ship without node_modules/ws, so main_scripts/cdp-handler.js could not load.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { builtinModules } from 'module';
import { join } from 'path';

const root = join(__dirname, '..', '..');
let files: string[] = [];

beforeAll(() => {
    const vsce = join(root, 'node_modules', '@vscode', 'vsce', 'vsce');
    const output = execFileSync(process.execPath, [vsce, 'ls', '--readme-path', 'docs/MARKETPLACE.md'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    // keep only lines that are real paths (drops the npm/esbuild chatter of the prepublish step)
    files = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && existsSync(join(root, line)));
}, 120_000);

describe('VSIX contents', () => {
    it('ships the bundle, the runtime scripts and their dependency', () => {
        expect(files).toEqual(expect.arrayContaining([
            'package.json',
            'dist/extension.js',
            'main_scripts/cdp-handler.js',
            'main_scripts/relauncher.js',
            'main_scripts/full_cdp_script.js',
            'node_modules/ws/package.json',
        ]));
    });

    it('can resolve every bare require() made by the shipped main_scripts', () => {
        const builtins = new Set(builtinModules);
        const missing: string[] = [];
        for (const file of files.filter((f) => f.startsWith('main_scripts/') && f.endsWith('.js'))) {
            const source = readFileSync(join(root, file), 'utf8');
            for (const match of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
                const request = match[1];
                if (request.startsWith('.') || request.startsWith('node:') || builtins.has(request) || request === 'vscode') continue;
                const packageName = request.startsWith('@') ? request.split('/').slice(0, 2).join('/') : request.split('/')[0];
                if (!files.includes(`node_modules/${packageName}/package.json`)) missing.push(`${file} -> ${request}`);
            }
        }
        expect(missing).toEqual([]);
    });

    it('ships nothing outside the allow-list (no sources, tests, coverage, maps, dotfiles)', () => {
        const allowed = /^(package\.json|LICENSE|CHANGELOG\.md|docs\/MARKETPLACE\.md|dist\/extension\.js|main_scripts\/.+|node_modules\/ws\/.+|media\/(icon|background-mode)\.png)$/;
        expect(files.filter((f) => !allowed.test(f))).toEqual([]);
    });
});
