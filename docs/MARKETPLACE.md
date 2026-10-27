# Antigravity Workflow Kit

**Auto-accept, autonomous loops and safety rails for the Antigravity IDE.**

Antigravity Workflow Kit connects to the Antigravity editor over the Chrome DevTools Protocol. It auto-accepts
AI-proposed file edits and terminal commands, and blocks commands on a configurable deny-list. It also adds an
experimental autonomous loop that works through a `@fix_plan.md` checklist. The loop is guarded by a circuit
breaker, an exit detector and a rate limiter.

![Background mode overlay](media/background-mode.png)

## Features

- **Auto-All**: auto-accepts edits and commands. Offers to relaunch Antigravity with a remote-debugging port if needed.
- **Banned commands**: `workflowKit.bannedCommands` plus built-in destructive-pattern checks.
- **Multi-Tab**: works across conversation tabs with a background overlay.
- **Autonomous loop (beta)**: task-type based model routing, max calls per hour, per-loop timeout, max loops per session.
- **Circuit breaker & exit detection**: stops on repeated no-progress, identical responses or completion signals.
- **Code review**: 20 regex rules (security, quality, performance, bugs) surfaced as diagnostics.
- **Dashboard**: feature toggles, model preferences and session stats.
- Extras: MCP-style tool registry, multi-agent roles, session memory, test generator, Jira/GitHub sync, notifications, voice commands.

## Commands

Open the Command Palette and type **Workflow Kit:** to see all commands (toggle Auto-All / Multi-Tab /
Autonomous Loop, open dashboard, run code review, generate tests, and more).

## Notes

- Auto-accept depends on Antigravity's internal UI, so editor updates may break it.
- The banned-command list is a safety net, not a sandbox.

Source, docs and issues: https://github.com/muhib-karim/antigravity-workflow-kit

License: MIT
