/**
 * The live deny-list path: the script that cdp-handler.js injects into the editor UI
 * (banned-commands.js + full_cdp_script.js), evaluated in a vm context with a minimal fake DOM.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import * as vm from 'vm';
import { DEFAULT_CONFIG } from '../../src/utils/constants';

const nodeRequire = createRequire(import.meta.url);
const { CDPHandler } = nodeRequire('../../main_scripts/cdp-handler.js');
// exactly what gets injected
const SCRIPT: string = new CDPHandler().getComposedScript();

interface FakeEl {
    tagName: string;
    textContent: string;
    parentElement: FakeEl | null;
    previousElementSibling: FakeEl | null;
    clicked: number;
    [k: string]: unknown;
}

function el(tagName: string, textContent: string): FakeEl {
    const e: FakeEl = {
        tagName,
        textContent,
        parentElement: null,
        previousElementSibling: null,
        clicked: 0,
        isConnected: true,
        disabled: false,
        querySelectorAll: () => [],
        getAttribute: () => null,
        getBoundingClientRect: () => ({ width: 80, height: 24, top: 0, left: 0 }),
        dispatchEvent: () => { e.clicked++; return true; },
    };
    return e;
}

/** <pre>command</pre> followed by a row containing one button */
function commandPrompt(command: string | null, buttonText: string): FakeEl {
    const row = el('DIV', '');
    const button = el('BUTTON', buttonText);
    button.parentElement = row;
    if (command !== null) {
        row.previousElementSibling = el('PRE', command);
    }
    return button;
}

const stops: Array<() => void> = [];

type InjectedApi = {
    __autoAllStart: (c: unknown) => void;
    __autoAllStop: () => void;
    __autoAllGetStats: () => { blocked: number; unverified: number };
};

function runInjected(buttons: FakeEl[], bannedCommands: unknown): InjectedApi {
    const document = {
        querySelectorAll: (sel: string) => (sel === 'button' ? buttons : []),
        getElementById: () => null,
    };
    const sandbox: Record<string, unknown> = {
        document,
        console: { log: () => { }, error: () => { } },
        setTimeout,
        clearTimeout,
        requestAnimationFrame: (cb: () => void) => setTimeout(cb, 1),
        MouseEvent: class { constructor(public type: string) { } },
        getComputedStyle: () => ({ display: 'block', pointerEvents: 'auto', visibility: 'visible' }),
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SCRIPT, sandbox);
    const w = sandbox as unknown as InjectedApi;
    // foreground (static) mode: performClick runs synchronously up to its first await
    w.__autoAllStart({ ide: 'antigravity', isPro: true, isBackgroundMode: false, pollInterval: 60_000, bannedCommands });
    stops.push(() => w.__autoAllStop());
    return w;
}

afterEach(() => { while (stops.length) stops.pop()!(); });

const DEFAULT_BANNED = DEFAULT_CONFIG.bannedCommands;

describe('injected auto-accept script: deny-list', () => {
    it('sanity: blocks the exact default pattern and clicks a harmless command', () => {
        const bad = commandPrompt('rm -rf /', 'Run');
        runInjected([bad], DEFAULT_BANNED);
        expect(bad.clicked).toBe(0);

        const ok = commandPrompt('npm test', 'Run');
        runInjected([ok], DEFAULT_BANNED);
        expect(ok.clicked).toBe(1);
    });

    it.each([
        'rm  -rf /',                       // extra whitespace
        'rm -fr /',                        // flag order
        'rm -r -f /',                      // split flags
        'rm -rf "/"',                      // quoting
        'rm -rf --no-preserve-root /',     // interposed option
        'sudo rm   -rf   ~',               // whitespace after sudo
    ])('does not auto-run a trivially obfuscated banned command: %s', (cmd) => {
        const b = commandPrompt(cmd, 'Run');
        runInjected([b], DEFAULT_BANNED);
        expect(b.clicked).toBe(0);
    });

    it('applies the built-in destructive patterns (dd to a block device), even with an empty list', () => {
        const b = commandPrompt('dd if=/dev/zero of=/dev/sda bs=1M', 'Run');
        runInjected([b], DEFAULT_BANNED);
        expect(b.clicked).toBe(0);

        const c = commandPrompt('rm -rf /', 'Run');
        const api = runInjected([c], []);
        expect(c.clicked).toBe(0);
        expect(api.__autoAllGetStats().blocked).toBe(1);
    });

    it.each(['Accept', 'Allow', 'Allow once', 'Confirm', 'Apply', 'Retry'])(
        'checks the deny-list for a command prompt whose button says "%s"',
        (label) => {
            const b = commandPrompt('rm -rf /', label);
            runInjected([b], DEFAULT_BANNED);
            expect(b.clicked).toBe(0);
        }
    );

    it('keeps enforcing when workflowKit.bannedCommands is mis-typed as a string', () => {
        const b = commandPrompt('rm -rf /', 'Run');
        runInjected([b], 'rm -rf /');
        expect(b.clicked).toBe(0);
    });

    it('still clicks a command button with no readable command text, but counts it as unverified', () => {
        const noText = commandPrompt(null, 'Run');
        const api = runInjected([noText], DEFAULT_BANNED);
        expect(noText.clicked).toBe(1);
        expect(api.__autoAllGetStats().unverified).toBe(1);

        const edit = commandPrompt(null, 'Accept');
        const api2 = runInjected([edit], DEFAULT_BANNED);
        expect(edit.clicked).toBe(1);
        expect(api2.__autoAllGetStats().unverified).toBe(0);
    });

    it('survives a non-string entry in the deny-list (still blocks, still clicks safe commands)', () => {
        const bad = commandPrompt('rm -rf /', 'Run');
        const ok = commandPrompt('npm test', 'Run');
        let threw = false;
        try { runInjected([ok, bad], [null, 'rm -rf /']); } catch { threw = true; }
        expect(threw).toBe(false);
        expect(bad.clicked).toBe(0);
        expect(ok.clicked).toBe(1);
    });
});
