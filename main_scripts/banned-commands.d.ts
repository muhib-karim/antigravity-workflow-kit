/** Types for banned-commands.js (plain JS so it can also be injected into the editor UI). */
export interface BannedCommandVerdict {
    blocked: boolean;
    /** Human-readable explanation when blocked. */
    reason?: string;
    /** The deny-list entry or built-in rule that matched. */
    pattern?: string;
}

/** Decide whether a command must not be auto-run. `bannedList` is the raw workflowKit.bannedCommands value. */
export function check(command: string, bannedList: unknown): BannedCommandVerdict;
/** The configured deny-list as a clean array of non-empty strings. */
export function toList(value: unknown): string[];
/** Canonical form used for literal matching (case, whitespace and quoting removed). */
export function normalize(text: string): string;
/** Label of the built-in destructive rule that matches, or null. */
export function matchBuiltin(command: string): string | null;
