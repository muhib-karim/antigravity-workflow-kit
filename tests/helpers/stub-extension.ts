/**
 * Builds a throw-away "installed extension" directory whose main_scripts are stubs, so tests can run
 * the real activate() and observe exactly what src/extension.ts asks the CDP handler and the
 * relauncher to do. The stubs report into globalThis.__awkStub.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface StubCalls {
    ports: number[];
    start: Array<Record<string, unknown>>;
    stop: number;
    prompts: number;
    cdpAvailable: boolean;
    /** resolves the relaunch prompt that is currently open */
    answerPrompt: ((answer: string) => void) | null;
}

export function stubCalls(): StubCalls {
    return (globalThis as unknown as { __awkStub: StubCalls }).__awkStub;
}

export function createStubExtension(options: { cdpAvailable: boolean }): string {
    (globalThis as unknown as { __awkStub: StubCalls }).__awkStub = {
        ports: [], start: [], stop: 0, prompts: 0, cdpAvailable: options.cdpAvailable, answerPrompt: null,
    };

    const dir = mkdtempSync(join(tmpdir(), 'awk-stub-ext-'));
    mkdirSync(join(dir, 'main_scripts'));
    writeFileSync(join(dir, 'main_scripts', 'cdp-handler.js'), `
        const calls = globalThis.__awkStub;
        class CDPHandler {
            constructor(startPort, endPort) { calls.ports = [startPort, endPort]; }
            setProStatus() {}
            setLogFile() {}
            async isCDPAvailable() { return calls.cdpAvailable; }
            async start(config) { calls.start.push(config); }
            async stop() { calls.stop++; }
        }
        module.exports = { CDPHandler };
    `);
    writeFileSync(join(dir, 'main_scripts', 'relauncher.js'), `
        const calls = globalThis.__awkStub;
        class Relauncher {
            showRelaunchPrompt() {
                calls.prompts++;
                return new Promise((resolve) => { calls.answerPrompt = resolve; });
            }
        }
        module.exports = { Relauncher, BASE_CDP_PORT: 9000 };
    `);
    return dir;
}
