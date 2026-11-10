# Security Policy

## Supported versions

Only the latest release published on
[Open VSX](https://open-vsx.org/extension/ai-dev-2024/antigravity-workflow-kit) receives fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private vulnerability reporting: on the
[repository](https://github.com/muhib-karim/antigravity-workflow-kit), go to **Security → Report a vulnerability**.
If that option is not available to you, open an issue that only asks for a private contact and leave the details
out.

Include what you did, what happened, what you expected, and the extension and Antigravity versions. A deny-list
bypass (a command that should have been held back but was auto-run) is in scope and worth reporting; please
include the exact command text as it appeared in the editor.

## What this extension does, and what to keep in mind

This extension exists to approve AI actions without asking you. That is a deliberate trade of safety for speed.

**It needs an open remote-debugging port.** Auto-accept talks to the editor over the Chrome DevTools Protocol on
`127.0.0.1`, ports 9000–9010. That port has no authentication: while it is open, any process running as you can
read and drive the editor. **Setup & Restart** changes your Antigravity shortcut (Windows `.lnk`, a wrapper script
in `~/.local/bin` on macOS, the `.desktop` file on Linux) so the flag stays on for later launches. Remove
`--remote-debugging-port=9000` from that shortcut to undo it.

**The auto-accept script runs in every page the port exposes.** It clicks buttons whose label contains `accept`,
`run`, `retry`, `apply`, `execute`, `confirm` or `allow`.

**The deny-list is a safety net, not a sandbox.**

- Before clicking, the script reads the code block next to the button and skips the button when the text matches
  an entry of `workflowKit.bannedCommands` or a built-in destructive pattern. The README's
  [Safety model](README.md#safety-model) section lists exactly what matches.
- If no command text can be found next to a *Run* button, the button is still clicked. That case is logged and
  counted as `unverified`.
- It matches text. It cannot see through aliases, scripts, `eval`, encoded payloads, or destructive commands it has
  no pattern for.

**The autonomous loop sends prompts on its own.** It takes them from `@fix_plan.md`. With
`workflowKit.autoGitCommit` enabled it also runs `git add -A && git commit` every 10 loops, which will commit
whatever is in the working tree.

**Project sync turns remote text into prompts.** *Sync Project Tasks* writes GitHub issue titles or Jira summaries
into `@fix_plan.md`, and the loop then sends them to the model with auto-accept on. Only sync from trackers where
you trust everyone who can file an issue.

**Tokens for project sync are stored in plain text.** They live in `.workflow-kit/project-manager.json` inside the
workspace. Add `.workflow-kit/` to your `.gitignore`.

## How the project is checked

- CI runs lint, type check, tests, build and packaging on every push and pull request, loads the CDP handler from
  the built VSIX, audits production dependencies and scans the history with gitleaks.
- GitHub Actions are pinned to commit SHAs; Dependabot proposes updates for npm packages and actions.
- Each bug fix comes with a regression test. The deny-list has unit tests for the matcher and tests that run the
  injected script itself.
