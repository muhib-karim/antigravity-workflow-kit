/**
 * Relauncher (main_scripts/relauncher.js): the relaunch script it writes for macOS and Linux.
 * Nothing is launched: child_process.spawn is replaced while the module loads.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { existsSync, statSync, rmSync } from 'fs';

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire('module');
const nodeFs = nodeRequire('fs');
const childProcess = nodeRequire('child_process');

function loadRelauncher() {
    const originalResolve = Module._resolveFilename;
    const originalSpawn = childProcess.spawn;
    Module._resolveFilename = (request: string, ...rest: unknown[]) =>
        request === 'vscode' ? join(__dirname, '..', 'helpers', 'vscode-stub.cjs') : originalResolve.call(Module, request, ...rest);
    childProcess.spawn = () => ({ unref: () => { } }); // relauncher.js captures spawn when it loads
    try {
        const file = nodeRequire.resolve('../../main_scripts/relauncher.js');
        delete nodeRequire.cache[file];
        return nodeRequire(file);
    } finally {
        Module._resolveFilename = originalResolve;
        childProcess.spawn = originalSpawn;
    }
}

const NASTY_FOLDER = '/home/dev/proj $(echo INJECTED) `echo INJECTED` "quoted" it\'s';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('relauncher shell quoting', () => {
    it('shellQuote survives a round trip through bash without any expansion', () => {
        const { shellQuote } = loadRelauncher();
        for (const value of [NASTY_FOLDER, 'plain', '', '$HOME', 'a\\b', "'"]) {
            const echoed = execFileSync('bash', ['-c', `printf '%s' ${shellQuote(value)}`], { encoding: 'utf8' });
            expect(echoed).toBe(value);
        }
    });

    it.each(['_relaunchLinux', '_relaunchMacOS'])('%s quotes workspace paths and writes the script to a private directory', async (method) => {
        vi.useFakeTimers();
        vi.spyOn(console, 'log').mockImplementation(() => { });
        const writes: Array<{ path: string; content: string; mode: unknown }> = [];
        vi.spyOn(nodeFs, 'writeFileSync').mockImplementation((path: unknown, content: unknown, options: unknown) => {
            writes.push({ path: String(path), content: String(content), mode: (options as { mode?: number })?.mode });
        });

        const { Relauncher } = loadRelauncher();
        const relauncher = new Relauncher(() => { });
        const shortcut = { path: '/usr/share/applications/anti gravity.desktop', execLine: '', type: 'app' };

        const result = await relauncher[method](shortcut, [NASTY_FOLDER]);

        expect(result.success).toBe(true);
        expect(writes).toHaveLength(1);
        const script = writes[0];

        // The folder must not sit inside double quotes, where bash still runs $(...) and backticks
        expect(script.content).not.toContain(`"${NASTY_FOLDER}"`);
        // Running just the argument through bash gives back the folder name, unexpanded
        const quoted = script.content.split('\n').find((line) => line.includes('INJECTED'))!.match(/'\/home\/dev\/proj.*'/)![0];
        expect(execFileSync('bash', ['-c', `printf '%s' ${quoted}`], { encoding: 'utf8' })).toBe(NASTY_FOLDER);

        // Not a fixed name in the shared temp dir, but a file in a fresh directory only this user can enter
        expect(script.path).not.toBe(join(tmpdir(), 'relaunch_ide.sh'));
        const scriptDir = dirname(script.path);
        expect(existsSync(scriptDir)).toBe(true);
        expect(statSync(scriptDir).mode & 0o077).toBe(0);
        rmSync(scriptDir, { recursive: true, force: true });
    });
});
