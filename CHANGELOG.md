# Changelog

All notable changes to Antigravity Workflow Kit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed
- Model IDs in `src/utils/constants.ts` now match the IDs declared in `package.json` settings (e.g. `claude-opus-4.5-thinking`), so display labels and rate-limit model fallback resolve the configured model.
- `npm run lint` now has an ESLint configuration; CI workflow now triggers on the `master` branch.
- `npm run package` uses `docs/MARKETPLACE.md` as the VSIX README; legacy `out/` and root `extension.js` are no longer packaged.

### Added
- Unit tests against the real `src/core` modules and a manifest consistency test (54 tests total).

---

## [3.0.2] - 2026-09-24

### Changed
- Renamed to Antigravity Workflow Kit (new extension ID ai-dev-2024.antigravity-workflow-kit). Commands and settings now use the workflowKit.* prefix; the autonomous loop mode is now called Autopilot Mode.

---

## [3.0.1] - 2024-12-30

### Added
- **Enable All / Disable All Buttons**: One-click batch toggling of all 12 features from the dashboard
- All toggles now auto-save immediately (no need to click Save button)

### Fixed
- **CDP Auto-Prompt**: Now automatically prompts for relaunch when Auto-All is enabled but CDP is not available
- Users will see "Setup & Restart" dialog on first use to enable auto-accept

### Published
- ✅ Open VSX: https://open-vsx.org/extension/ai-dev-2024/antigravity-workflow-kit
- ✅ GitHub: https://github.com/muhib-karim/antigravity-workflow-kit/releases

---

## [3.0.0] - 2024-12-30 🚀 Major Feature Release

### 🆕 New Features (9 Modules Added)

#### 🔴 P0 — Near-Term Priority
- **MCP Server Integration**: Model Context Protocol with 10 AI-callable tools for file operations, terminal commands, workspace info, diagnostics, and git
- **Persistent Session Memory**: Context tracking across sessions with semantic search and automatic summarization
- **AI Code Review**: Security scanning with 15+ vulnerability patterns (SQL injection, XSS, hardcoded secrets, etc.) and VS Code diagnostics integration
- **Project Management Integration**: Jira & GitHub Issues sync, @fix_plan.md automation, branch and PR generation

#### 🟡 P1/P2 — Medium-Term Priority
- **Voice Control**: Natural language commands ("Workflow Kit start autonomous", "switch to Claude") with VS Code Speech API integration
- **Multi-Agent Orchestration**: 5 specialized agents (Researcher, Implementer, Reviewer, Tester, Planner) with parallel task execution

#### 🟢 P3 — Experimental
- **Autonomous Test Generator**: Multi-framework support (Vitest, Jest, Mocha), edge case detection, coverage parsing
- **Custom Model Provider**: BYOM support for Anthropic, Google, OpenAI, Ollama with unified API and cost tracking
- **Smart Notifications**: Slack, Discord, webhook integrations with quiet hours and daily summaries

### 📦 New Commands
- `workflowKit.toggleMcp` — Toggle MCP Server
- `workflowKit.toggleVoice` — Toggle Voice Control
- `workflowKit.generateTests` — Generate Tests for Current File
- `workflowKit.runCodeReview` — Run Code Review
- `workflowKit.startMultiAgent` — Start Multi-Agent Task
- `workflowKit.showMemory` — Show Session Memory
- `workflowKit.syncProjectTasks` — Sync Project Tasks (Jira/GitHub)

### ⚙️ New Configuration Settings
- `workflowKit.mcpEnabled` — MCP server toggle
- `workflowKit.memoryEnabled` — Persistent memory toggle
- `workflowKit.codeReviewEnabled` — Code review toggle
- `workflowKit.voiceControlEnabled` — Voice control toggle
- `workflowKit.notificationsEnabled` — Notifications toggle
- `workflowKit.multiAgentEnabled` — Multi-agent toggle
- `workflowKit.autoTestGeneration` — Auto test generation toggle

### 📊 Technical
- Bundle size: 293.6kb (up from 221.9kb)
- ~3,550 lines of new code across 9 modules
- Full TypeScript strict mode compliance

---

## [2.15.0] - 2024-12-30

### Fixed
- **CRITICAL: Auto-Accept Not Working in Non-Background Mode**: The static poll loop was using generic selectors that missed Antigravity's `.bg-ide-button-background` accept buttons. Now uses IDE-specific selectors.

### Changed
- **Simplified Status Bar**: Removed clutter (Auto-All, Multi-Tab items). Now shows single toggle + settings gear.
- Removed VS Code Marketplace references (Open VSX only)

---

## [2.14.0] - 2024-12-30

### Added
- **Dashboard Screenshot**: Updated dashboard preview for marketplace and GitHub
- **Verified Release**: Full functionality verification of all autonomous features

### Fixed
- **CRITICAL: Auto-All Not Working**: Fixed path resolution bug in `cdp-handler.js` that prevented the auto-accept script from loading. The `getComposedScript()` function was using incorrect relative path `../main_scripts/full_cdp_script.js` instead of just `full_cdp_script.js` in the same directory.

### Verified Working
- ✅ AI Autonomous Mode with intelligent model selection
- ✅ Test-loop detector for feature completeness detection
- ✅ Circuit breaker and recovery strategies
- ✅ Rate limiting and API quota management
- ✅ Auto-All and Multi-Tab modes

### Technical
- Code quality improvements and cleanup
- Build verification with TypeScript strict mode

---

## [2.11.0] - 2024-12-30

### Added
- **Model Quota Logging**: Track which operations consume which model quotas with delta logging between fetches
- **Professional Publishing**: Complete GitHub repository with banners, screenshots, and documentation

### Changed
- Updated feature status: All core features now operational
- Improved documentation with usage explanation

---

## [2.10.1] - 2024-12-30

### Fixed
- **Exit Detection**: Loop now properly stops when all tasks in `@fix_plan.md` are complete
- **No More Loop Forever**: Removed generic prompt fallback that kept loop running indefinitely
- **Cleaner Exit**: Returns null and stops when no goal or tasks exist

## [2.10.0] - 2024-12-30

### Added (Ralph Claude Code Features)
- **Test Loop Detection**: Automatically exits after 3 consecutive test-only loops (configurable via `workflowKit.maxConsecutiveTestLoops`)
- **Hourly Rate Limiting**: Configurable max calls per hour (`workflowKit.maxCallsPerHour`, default: 100)
- **API Limit Handling**: User prompt to wait or exit when rate limit reached (with countdown timer)
- **Execution Timeout**: Configurable timeout per loop (`workflowKit.executionTimeout`, default: 15 minutes)

### Changed
- Renamed project to "Antigravity Workflow Kit" (capital A and G)

## [2.9.2] - 2024-12-30

### Brand & Documentation
- **New Logo**: Modern, abstract design symbolizing the 'Workflow Kit' concept.
- **Documentation Overhaul**: Complete rewrite of README.md with visual badges, star history, and improved layout.
- **Visual Identity**: Added new banner images and consistent styling.

## [2.9.1] - 2024-12-30

### Fixed
- **Critical**: Fixed CDP port mismatch in autonomous loop - changed from 9222-9232 to 9000-9030 to match working Auto-All handler
- Autonomous Mode should now properly connect to Antigravity browser
- Minor stability improvements

### Known Issues
- **Autonomous Mode (Workflow Kit)**: Not triggering due to CDP port mismatch between Auto-All handler (ports 9000-9030) and autonomous loop client (ports 9222-9232)
- **Model Switching**: Not executing because autonomous loop never starts
- **Usage Dashboard**: May show null values

---

## [2.9.0] - 2024-12-29

### Added
- Auto-enable prerequisites when enabling Autonomous Mode or Smart Model Switching
- Enhanced model switching notifications with model names and reasoning

### Fixed
- Circuit breaker reset functionality
- Recovery strategy improvements

---

## [2.8.x] - 2024-12-28

### Added
- Circuit breaker pattern to prevent runaway loops
- Recovery strategies for error handling
- Rate limit detection and automatic model fallback
- Progress tracker for session statistics

---

## [2.7.x] - 2024-12-27

### Added
- Task analyzer for intelligent model selection
- Exit detection patterns
- Auto git commit feature

### Changed
- Improved model selection algorithm

---

## [2.6.0] - 2024-12-26

### Added
- Dashboard panel with feature toggles
- Model preference configuration per task type
- Session statistics display

---

## [2.5.0] - 2024-12-25

### Added
- Smart Model Switching based on task type
- Model labels matching Antigravity UI

---

## [2.0.0] - 2024-12-20

### Added
- Complete rewrite with TypeScript
- Workflow Kit Autonomous Mode concept
- Status bar with multiple toggles
- Multi-tab mode for parallel development

### Changed
- Separated concerns into modular architecture
- CDP handling split between working legacy handler and new TypeScript client

---

## [1.x.x] - Earlier Versions

### Initial Features
- Auto-All mode for accepting file edits and commands
- Basic CDP integration
- Banned command filtering

---

## Feature Status Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Auto-All Mode | ✅ Working | Uses main_scripts/cdp-handler.js |
| Multi-Tab Mode | ✅ Working | Requires Auto-All enabled |
| Status Bar | ✅ Working | 4 items: Auto-All, Multi-Tab, Workflow Kit, Settings |
| Dashboard | ✅ Working | UI functional, usage display, settings persist |
| Autonomous Loop | ✅ Working | Continuous AI development with model switching |
| Model Switching | ✅ Working | Task-based automatic selection |
| Usage Display | ✅ Working | Real-time quota from AntiGravity API |
| Circuit Breaker | ✅ Working | Error recovery and loop protection |
| Rate Limiting | ✅ Working | Configurable hourly limits |
| Quota Logging | ✅ New | Track which operations consume quota |
