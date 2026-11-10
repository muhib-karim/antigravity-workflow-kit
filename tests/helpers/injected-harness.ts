/**
 * Runs the script that cdp-handler.js injects into the editor UI (banned-commands.js +
 * full_cdp_script.js) in a vm context with a minimal fake DOM.
 */
import { createRequire } from 'module';
import * as vm from 'vm';

const nodeRequire = createRequire(import.meta.url);
const { CDPHandler } = nodeRequire('../../main_scripts/cdp-handler.js');

/** Exactly what gets injected */
export const INJECTED_SCRIPT: string = new CDPHandler().getComposedScript();

export interface FakeEl {
    tagName: string;
    textContent: string;
    parentElement: FakeEl | null;
    previousElementSibling: FakeEl | null;
    clicked: number;
    [key: string]: unknown;
}

export interface InjectedApi {
    __autoAllStart: (config: unknown) => void;
    __autoAllStop: () => void;
    __autoAllGetStats: () => { clicks: number; blocked: number; unverified: number };
    __autoAllState: { isRunning: boolean; bannedCommands: string[] };
}

export function el(tagName: string, textContent: string): FakeEl {
    const element: FakeEl = {
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
        dispatchEvent: () => { element.clicked++; return true; },
    };
    return element;
}

/** `<pre>command</pre>` followed by a row with one button. Pass null for a button with no command text. */
export function commandPrompt(command: string | null, buttonText: string): FakeEl {
    const row = el('DIV', '');
    const button = el('BUTTON', buttonText);
    button.parentElement = row;
    if (command !== null) {
        row.previousElementSibling = el('PRE', command);
    }
    return button;
}

const running: InjectedApi[] = [];

/** Evaluate the injected script in a fresh page whose only buttons are `buttons`. */
export function loadInjected(buttons: FakeEl[]): InjectedApi {
    const document = {
        querySelectorAll: (selector: string) => (selector === 'button' ? buttons : []),
        getElementById: () => null,
    };
    const sandbox: Record<string, unknown> = {
        document,
        console: { log: () => { }, error: () => { } },
        // the test's (possibly fake) clock and timers
        Date,
        setTimeout,
        clearTimeout,
        requestAnimationFrame: (cb: () => void) => setTimeout(cb, 16),
        MouseEvent: class { constructor(public type: string) { } },
        getComputedStyle: () => ({ display: 'block', pointerEvents: 'auto', visibility: 'visible' }),
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(INJECTED_SCRIPT, sandbox);
    const api = sandbox as unknown as InjectedApi;
    running.push(api);
    return api;
}

export const foregroundConfig = (bannedCommands: unknown, pollInterval = 60_000) =>
    ({ ide: 'antigravity', isPro: true, isBackgroundMode: false, pollInterval, bannedCommands });

/**
 * Load the script and start it in foreground mode. The first click pass runs synchronously,
 * so the buttons' `clicked` counters can be checked right after this returns.
 */
export function runInjected(buttons: FakeEl[], bannedCommands: unknown): InjectedApi {
    const api = loadInjected(buttons);
    api.__autoAllStart(foregroundConfig(bannedCommands));
    return api;
}

export function stopAllInjected(): void {
    while (running.length) running.pop()!.__autoAllStop();
}
