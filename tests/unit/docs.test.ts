/**
 * Documentation guards: the README has to stay in step with package.json and the repository.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');

describe('README', () => {
    it('lists every contributed command', () => {
        for (const { command, title } of pkg.contributes.commands as Array<{ command: string; title: string }>) {
            expect(readme, command).toContain(`\`${command}\``);
            expect(readme, title).toContain(title);
        }
    });

    it('only documents settings that exist, with their real defaults', () => {
        const props = pkg.contributes.configuration.properties as Record<string, { default: unknown }>;
        const rows = [...readme.matchAll(/^\| `(workflowKit\.\w+)` \| (.+?) \| .+\|$/gm)];
        expect(rows.length).toBeGreaterThan(5);
        for (const [, key, shown] of rows) {
            expect(props, key).toHaveProperty([key]);
            const def = props[key].default;
            const expected = Array.isArray(def) ? def.map((v) => `\`${v}\``).join(', ') : `\`${def}\``;
            expect(shown, key).toBe(expected);
        }
    });

    it('points its badges and links at the repository and keeps the Open VSX link', () => {
        expect(readme).toContain('https://github.com/muhib-karim/antigravity-workflow-kit/actions/workflows/ci.yml/badge.svg');
        expect(readme).toContain('img.shields.io/github/license/muhib-karim/antigravity-workflow-kit');
        expect(readme).toContain('https://open-vsx.org/extension/ai-dev-2024/antigravity-workflow-kit');
        expect(pkg.repository.url).toBe('https://github.com/muhib-karim/antigravity-workflow-kit');
    });

    it('only references files that exist', () => {
        const paths = [...readme.matchAll(/`((?:src|main_scripts|tests|docs|\.github)\/[\w./-]+\.(?:ts|js|md|yml))`/g)].map((m) => m[1]);
        expect(paths.length).toBeGreaterThan(10);
        expect(paths.filter((p) => !existsSync(join(root, p)))).toEqual([]);
        for (const image of [...readme.matchAll(/<img src="((?:docs|media)\/[^"]+)"/g)].map((m) => m[1])) {
            expect(existsSync(join(root, image)), image).toBe(true);
        }
    });

    it('states the Node.js version the toolchain actually needs', () => {
        expect(readme).toMatch(/Node\.js 22\.12 or newer/);
        expect(readme).not.toMatch(/Node(\.js)? 20/);
    });
});

describe('supporting documents', () => {
    it('has a security policy that the README and the packaged readme point to', () => {
        expect(existsSync(join(root, 'SECURITY.md'))).toBe(true);
        expect(readme).toContain('(SECURITY.md)');
        expect(read('SECURITY.md')).toMatch(/Report a vulnerability/);
    });

    it('packages a readme that exists and names the repository', () => {
        expect(pkg.scripts.package).toContain('--readme-path docs/MARKETPLACE.md');
        expect(read('docs/MARKETPLACE.md')).toContain('https://github.com/muhib-karim/antigravity-workflow-kit');
    });
});
