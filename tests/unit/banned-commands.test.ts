/**
 * Deny-list matcher (main_scripts/banned-commands.js) - shared by the injected auto-accept script
 * and CodeReviewer.checkBannedCommands.
 */
import { describe, it, expect } from 'vitest';
import bannedCommands = require('../../main_scripts/banned-commands');
import { DEFAULT_CONFIG } from '../../src/utils/constants';

const DEFAULTS = DEFAULT_CONFIG.bannedCommands;
const blocked = (command: string, list: unknown = DEFAULTS) => bannedCommands.check(command, list).blocked;

describe('banned-commands matcher', () => {
    it.each([
        'rm -rf /',
        'RM -RF /',
        'rm  -rf /',                     // extra whitespace
        'rm\t-rf\t/',
        'rm -fr /',                      // flag order
        'rm -r -f /',                    // split flags
        'rm --recursive --force /',      // long flags
        'rm -rf "/"',                    // quoting
        "rm -rf '/'",
        'r\\m -rf /',                    // backslash escape
        'rm -rf --no-preserve-root /',   // interposed option
        'rm -rf -- /',
        'sudo rm   -rf   ~',
        'rm -rf $HOME',
        'rm -rf ~/projects',
        'echo ok && rm -rf /tmp/build',  // chained
        'cd /; rm -Rf ~/work',
        'true || rm -rf /',
        'ls | xargs rm -rf /var/data',
        'sh -c "rm -rf /"',
        '/bin/rm -rf /',
        'dd if=/dev/zero of=/dev/sda bs=1M',
        'dd of=/dev/sda if=/dev/zero',   // argument order
        'cat image.bin > /dev/sda',
        'format c:',
        'FORMAT D: /q',
        'del /f /s /q c:\\temp',
        'del c:\\temp /s /q',
    ])('blocks %s', (command) => {
        expect(blocked(command)).toBe(true);
    });

    it.each([
        'npm test',
        'rm -rf node_modules',
        'rm -rf ./dist',
        'rm /tmp/file.txt',              // not recursive
        'git rm -r --cached /abs/path',
        'ls -la /',
        'dd if=disk.img of=copy.img',
        'npm run format',
        'docker rm -f web',
        'echo "the performance is fine"',
    ])('allows %s', (command) => {
        expect(blocked(command)).toBe(false);
    });

    it('applies the built-in destructive patterns even with an empty list', () => {
        expect(blocked('rm -rf /', [])).toBe(true);
        expect(blocked('dd if=/dev/zero of=/dev/nvme0n1', [])).toBe(true);
        expect(bannedCommands.matchBuiltin('npm test')).toBeNull();
    });

    it('matches custom literal entries regardless of case, whitespace and quotes', () => {
        expect(blocked('git   PUSH  --force origin main', ['git push --force'])).toBe(true);
        expect(blocked('git push origin main', ['git push --force'])).toBe(false);
    });

    it('supports /pattern/flags entries and treats path-like entries as literals', () => {
        expect(blocked('DROP TABLE users;', ['/drop\\s+table/'])).toBe(true);
        expect(blocked('select 1', ['/drop\\s+table/'])).toBe(false);
        expect(blocked('cat /dev/sdb1', ['/dev/sdb'])).toBe(true);
        expect(blocked('ls /tmp', ['/dev/sdb'])).toBe(false);
    });

    it('ignores empty and non-string entries instead of blocking everything or throwing', () => {
        expect(blocked('npm test', ['', '   '])).toBe(false);
        expect(blocked('npm test', [null, 42, {}, undefined])).toBe(false);
        expect(blocked('rm -rf /', [null, 'rm -rf /'])).toBe(true);
        expect(bannedCommands.toList([' a ', '', 3, 'b'])).toEqual(['a', 'b']);
    });

    it('still enforces a deny-list that was mis-typed as a single string', () => {
        expect(blocked('git push --force', 'git push --force')).toBe(true);
        expect(bannedCommands.toList('rm -rf /')).toEqual(['rm -rf /']);
        expect(bannedCommands.toList(undefined)).toEqual([]);
    });

    it('does not block an empty command and explains what matched', () => {
        expect(bannedCommands.check('', DEFAULTS)).toEqual({ blocked: false });
        expect(bannedCommands.check('rm -rf /', DEFAULTS).reason).toContain('rm -rf /');
        expect(bannedCommands.check('rm -fr /', DEFAULTS).reason).toMatch(/destructive/i);
    });
});
