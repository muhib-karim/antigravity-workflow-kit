/**
 * Deny-list matcher for terminal commands.
 *
 * One implementation, two consumers:
 *  - cdp-handler.js prepends this file to full_cdp_script.js, so the injected auto-accept script
 *    finds it as window.__workflowKitBannedCommands;
 *  - src/core/code-reviewer.ts requires it (esbuild bundles it into dist/extension.js).
 *
 * Keep it dependency-free and free of DOM access. It is a safety net, not a sandbox: it reads the
 * command text it is given and cannot see through aliases, scripts or encoded payloads.
 */
(function (root) {
    'use strict';

    /**
     * The configured deny-list as a clean array of non-empty strings.
     * Accepts a single string (a mis-typed setting) and drops entries that are not strings.
     */
    function toList(value) {
        var raw = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
        var list = [];
        for (var i = 0; i < raw.length; i++) {
            if (typeof raw[i] !== 'string') continue;
            var entry = raw[i].trim();
            if (entry) list.push(entry);
        }
        return list;
    }

    /** Lower-case, join continued lines, drop quoting and backslash escapes. Newlines are kept. */
    function unquote(text) {
        return String(text == null ? '' : text)
            .toLowerCase()
            .replace(/\\\r?\n/g, ' ')
            .replace(/\\(?=\S)/g, '')
            .replace(/["'`]/g, '');
    }

    function collapse(text) {
        return text.replace(/\s+/g, ' ').trim();
    }

    /** Canonical form used for literal matching: case, whitespace and quoting no longer matter. */
    function normalize(text) {
        return collapse(unquote(text));
    }

    /** Split a command line into its simple commands (`a && b; c | d`). */
    function segments(text) {
        var parts = unquote(text).split(/&&|\|\||[;|&\n\r]/);
        var result = [];
        for (var i = 0; i < parts.length; i++) {
            var part = collapse(parts[i]);
            if (part) result.push(part);
        }
        return result;
    }

    function tokens(segment) {
        var parts = segment.split(' ');
        var result = [];
        for (var i = 0; i < parts.length; i++) {
            var token = parts[i].replace(/^(?:\$\(|[({])+/, '').replace(/[)}]+$/, '');
            if (token) result.push(token);
        }
        return result;
    }

    function isRecursiveFlag(token) {
        if (token === '--recursive') return true;
        return /^-[a-z]+$/.test(token) && token.indexOf('r') !== -1; // -r, -rf, -fr, -R (already lower-cased)
    }

    function isRootLikeTarget(token) {
        return token.charAt(0) === '/' || token.charAt(0) === '~' || /^\$\{?home\b/.test(token);
    }

    /** `rm` with a recursive flag in any spelling or order, aimed at an absolute or home path. */
    function isDestructiveRm(toks) {
        for (var i = 0; i < toks.length; i++) {
            var token = toks[i];
            if (token !== 'rm' && !/\/rm$/.test(token)) continue;
            if (i > 0 && toks[i - 1] === 'git') continue; // `git rm -r` only touches the index/work tree

            var recursive = false;
            var noPreserveRoot = false;
            var rootLike = false;
            var operandsOnly = false;
            for (var j = i + 1; j < toks.length; j++) {
                var arg = toks[j];
                if (!operandsOnly && arg === '--') { operandsOnly = true; continue; }
                if (!operandsOnly && arg.charAt(0) === '-') {
                    if (isRecursiveFlag(arg)) recursive = true;
                    if (arg === '--no-preserve-root') noPreserveRoot = true;
                    continue;
                }
                if (isRootLikeTarget(arg)) rootLike = true;
            }
            if (recursive && (rootLike || noPreserveRoot)) return true;
        }
        return false;
    }

    /** `dd` writing to a device node, whatever the argument order. */
    function isDestructiveDd(toks) {
        for (var i = 0; i < toks.length; i++) {
            if (toks[i] !== 'dd' && !/\/dd$/.test(toks[i])) continue;
            for (var j = i + 1; j < toks.length; j++) {
                if (/^of=\/dev\//.test(toks[j])) return true;
            }
        }
        return false;
    }

    /**
     * Built-in destructive patterns. They apply whatever the configured list contains.
     * Returns a short label for the rule that matched, or null.
     */
    function matchBuiltin(command) {
        var parts = segments(command);
        for (var i = 0; i < parts.length; i++) {
            var segment = parts[i];
            var toks = tokens(segment);
            if (isDestructiveRm(toks)) return 'recursive rm of an absolute or home path';
            if (isDestructiveDd(toks)) return 'dd to a device';
            if (/(?:^|\s)format(?:\.com)?\s+[a-z]:/.test(segment)) return 'format of a drive';
            if (/(?:^|\s)(?:del|erase)\s+(?:\S+\s+)*?\/[sfq](?:\s|$)/.test(segment)) return 'del with /s, /f or /q';
            if (/>\s*\/dev\/(?:sd[a-z]|hd[a-z]|vd[a-z]|nvme\d|mmcblk\d|disk\d)/.test(segment)) return 'redirect to a block device';
        }
        return null;
    }

    /** `/pattern/flags` entries are regular expressions (case-insensitive unless flags are given). */
    function toRegExp(entry) {
        var match = /^\/(.+)\/([a-z]*)$/.exec(entry);
        if (!match) return null;
        try {
            // g and y make test() stateful; they add nothing for a yes/no match
            return new RegExp(match[1], (match[2] || 'i').replace(/[gy]/g, ''));
        } catch (e) {
            return null; // e.g. a literal path such as /dev/sda
        }
    }

    /**
     * Decide whether a command must not be auto-run.
     * @param {string} command text of the command as shown to the user
     * @param {unknown} bannedList the workflowKit.bannedCommands setting
     * @returns {{ blocked: boolean, reason?: string, pattern?: string }}
     */
    function check(command, bannedList) {
        var raw = String(command == null ? '' : command);
        var normalized = normalize(raw);
        if (!normalized) return { blocked: false };

        var list = toList(bannedList);
        for (var i = 0; i < list.length; i++) {
            var entry = list[i];
            var literal = normalize(entry);
            if (literal && normalized.indexOf(literal) !== -1) {
                return { blocked: true, reason: 'Command contains banned pattern: ' + entry, pattern: entry };
            }
            var regex = toRegExp(entry);
            if (regex && (regex.test(raw) || regex.test(normalized))) {
                return { blocked: true, reason: 'Command matches banned pattern: ' + entry, pattern: entry };
            }
        }

        var builtin = matchBuiltin(raw);
        if (builtin) {
            return { blocked: true, reason: 'Potentially destructive command detected: ' + builtin, pattern: builtin };
        }
        return { blocked: false };
    }

    var api = { check: check, toList: toList, normalize: normalize, matchBuiltin: matchBuiltin };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.__workflowKitBannedCommands = api;
    }
})(typeof window !== 'undefined' ? window : undefined);
