# Contributing to Antigravity Workflow Kit

Thank you for your interest in contributing!

## Development setup

You need **Node.js 22.12 or newer**.

```bash
git clone https://github.com/muhib-karim/antigravity-workflow-kit.git
cd antigravity-workflow-kit
npm ci
npm run compile      # esbuild bundle -> dist/extension.js
npm run package      # builds the .vsix; install it in your editor to try it
```

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run package
```

CI runs the same commands on Node 22 and 24, loads the CDP handler from the built VSIX, audits production
dependencies and scans for secrets. All of them have to pass.

## Tests

- Add a regression test with every fix: a test that fails without your change.
- Tests go in `tests/unit/` and import the real modules from `src/` or `main_scripts/`.
- `tests/mocks/vscode.ts` is a stateful mock of the `vscode` API. Call `reset()` between tests. It rejects
  `update()` for settings that `package.json` does not declare, as VS Code does, so declare new settings there.
- Changes to the deny-list need cases in `tests/unit/banned-commands.test.ts`, and in
  `tests/unit/injected-denylist.test.ts` if they touch `main_scripts/full_cdp_script.js`.
- Anything a new runtime file needs must be listed in `.vscodeignore` (an allow-list);
  `tests/unit/packaging.test.ts` checks the result.

## Code style

- TypeScript with strict mode; plain JavaScript only in `main_scripts/`
- ESLint for linting
- Keep functions small and focused

## Pull request process

1. Fork and create a feature branch
2. Make your changes, with tests
3. Add a line to `CHANGELOG.md` under `[Unreleased]`
4. Submit a PR with a clear description

## Release process

Releases are made by a maintainer:

1. Move the `[Unreleased]` entries in `CHANGELOG.md` under the new version and update `version` in `package.json`.
2. Create and push a tag that matches it, for example `git tag v3.0.3 && git push origin v3.0.3`.
3. `.github/workflows/release.yml` then runs lint, type check and tests, packages the VSIX, checks that the tag
   matches `package.json`, creates a GitHub Release with the VSIX, and publishes to Open VSX and the VS Code
   Marketplace when the `OPENVSX_TOKEN` and `VSCE_PAT` secrets are set.

Nothing is published from branches or pull requests.

## Security

See [SECURITY.md](SECURITY.md). Please report vulnerabilities privately.

## Questions?

Open an issue or start a discussion on GitHub.
