# Antigravity Workflow Kit

**Auto-accept, autonomous loops and safety rails for the Antigravity IDE.**

Antigravity Workflow Kit connects to the Antigravity editor over the Chrome DevTools Protocol and clicks the
approval buttons on AI-proposed file edits and terminal commands for you. An approval whose command matches a
deny-list is left for you to click. It also adds an experimental autonomous loop that works through a
`@fix_plan.md` checklist, guarded by a circuit breaker, an exit detector and a rate limiter.

![Background mode overlay](media/background-mode.png)

## Features

- **Auto-All**: auto-accepts edits and commands. Offers to relaunch Antigravity with a remote-debugging port if needed.
- **Banned commands**: `workflowKit.bannedCommands` plus built-in destructive patterns (recursive `rm` of `/` or
  `~`, `dd` to a device, `format`, `del /s /f /q`), matched regardless of case, whitespace and quoting.
- **Multi-Tab**: works across conversation tabs with a background overlay.
- **Autonomous loop (beta)**: sends the next unchecked `@fix_plan.md` item each iteration, with a call limit per
  hour, a per-loop timeout and a maximum number of loops.
- **Circuit breaker and exit detection**: stops after repeated loops without file changes, repeated errors or
  responses, completion phrases, or three failures in a row.
- **Code review**: 20 regex rules (security, quality, performance, bugs) shown as diagnostics.
- **Dashboard**: feature toggles, model preferences, loop settings and session stats.
- Also included: a test-file generator and GitHub/Jira sync into `@fix_plan.md`. The MCP-style tool registry,
  multi-agent roles, voice commands, notifications and session memory are scaffolds that are not connected to the
  agent yet.

## Commands

Open the Command Palette and type **Workflow Kit:** to see all commands (toggle the extension, Multi-Tab or the
autonomous loop, open the dashboard, run a code review, generate tests, and more).

## Notes

- Auto-accept needs the editor to run with an unauthenticated local remote-debugging port, and depends on
  Antigravity's internal UI, so editor updates may break it.
- The banned-command list is a safety net, not a sandbox. A *Run* button with no readable command text next to it
  is still clicked.

Source, docs, security policy and issues: https://github.com/muhib-karim/antigravity-workflow-kit

License: MIT
