/**
 * Antigravity Workflow Kit - Main Extension Entry Point
 * Replicates AUTO-ALL-Antigravity's working flow + adds Workflow Kit features
 * @module extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { StatusBarManager } from './ui/status-bar';
import { DashboardPanel } from './ui/dashboard';
import { config } from './utils/config';
import { createLogger } from './utils/logger';
import { CDP_PORT_MIN, CDP_PORT_MAX } from './utils/constants';
import { cdpClient } from './providers/cdp-client';
import { autonomousLoop } from './core/autonomous-loop';
import { circuitBreaker } from './core/circuit-breaker';
import { progressTracker } from './core/progress-tracker';
// New feature imports
import { memoryManager } from './core/memory-manager';
import { codeReviewer } from './core/code-reviewer';
import { projectManager } from './providers/project-manager';
import { voiceController } from './ui/voice-controller';
import { agentOrchestrator } from './core/agent-orchestrator';
import { testGenerator } from './core/test-generator';

const log = createLogger('Extension');

// ============ State (matches old extension) ============
let statusBar: StatusBarManager;
/** What src/extension.ts uses of main_scripts/cdp-handler.js (plain JS, loaded at runtime) */
interface CdpHandler {
    setProStatus?(isPro: boolean): void;
    setLogFile(filePath: string): void;
    isCDPAvailable(): Promise<boolean>;
    start(config: Record<string, unknown>): Promise<void>;
    stop(): Promise<void>;
}

/** What src/extension.ts uses of main_scripts/relauncher.js */
interface RelauncherLike {
    showRelaunchPrompt(): Promise<string>;
}

let cdpHandler: CdpHandler | null = null;
let relauncher: RelauncherLike | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let currentIDE = 'Antigravity';
let globalContext: vscode.ExtensionContext;
// One collection for all code-review diagnostics; created on first use, disposed with the extension
let reviewDiagnostics: vscode.DiagnosticCollection | undefined;

// ============ Activation (matches old extension flow) ============
export function activate(context: vscode.ExtensionContext): void {
    globalContext = context;
    log.info('Antigravity Workflow Kit activating...');

    // Detect IDE
    const appName = vscode.env.appName || '';
    if (appName.toLowerCase().includes('cursor')) currentIDE = 'Cursor';
    else if (appName.toLowerCase().includes('antigravity')) currentIDE = 'Antigravity';
    log.info(`Detected IDE: ${currentIDE}`);

    // Initialize the CDP handler from main_scripts (plain JS, loaded at runtime).
    // Auto-accept cannot work without it, so a load failure is shown to the user instead of only logged.
    cdpHandler = null;
    relauncher = null;
    try {
        const cdpHandlerPath = path.join(context.extensionPath, 'main_scripts', 'cdp-handler.js');
        // eslint-disable-next-line @typescript-eslint/no-var-requires -- plain JS loaded from the installed extension folder at runtime
        const { CDPHandler } = require(cdpHandlerPath);

        const handler: CdpHandler = new CDPHandler(CDP_PORT_MIN, CDP_PORT_MAX, log.info.bind(log));
        cdpHandler = handler;

        // CRITICAL: Set Pro status like old extension (enables all features)
        if (handler.setProStatus) {
            handler.setProStatus(true);
        }

        // Set log file like old extension
        try {
            const logPath = path.join(context.extensionPath, 'workflow-kit-cdp.log');
            handler.setLogFile(logPath);
        } catch {
            // the log file is optional (the extension folder may be read-only)
        }

        log.info('CDP handler initialized with Pro status');
    } catch (err) {
        cdpHandler = null;
        const reason = (err as Error).message.split('\n')[0];
        log.error(`Failed to load the CDP handler: ${reason}`);
        vscode.window.showErrorMessage(
            `Workflow Kit: auto-accept is unavailable because its CDP handler failed to load (${reason}). ` +
            'Reinstall the extension or report this issue.'
        );
    }

    // The relauncher is only needed to offer a restart with the remote-debugging port.
    try {
        const relauncherPath = path.join(context.extensionPath, 'main_scripts', 'relauncher.js');
        // eslint-disable-next-line @typescript-eslint/no-var-requires -- plain JS loaded from the installed extension folder at runtime
        const { Relauncher } = require(relauncherPath);
        relauncher = new Relauncher(log.info.bind(log));
    } catch (err) {
        log.warn(`Failed to load the relauncher: ${(err as Error).message.split('\n')[0]}`);
    }

    // Initialize status bar
    statusBar = new StatusBarManager(context);
    updateStatusBar();

    // Register commands
    registerCommands(context);

    // Set up autonomous loop status callback
    autonomousLoop.setStatusCallback((status) => {
        updateStatusBar();
        refreshDashboard();
        if (!status.running) {
            config.set('autopilotModeEnabled', false);
        }
    });

    // Check environment and start (SAME AS OLD EXTENSION)
    checkEnvironmentAndStart().catch(err => {
        log.warn(`Environment check error: ${(err as Error).message}`);
    });

    log.info('Antigravity Workflow Kit activated!');
}

// ============ Environment Check (SAME AS OLD EXTENSION) ============
async function checkEnvironmentAndStart(): Promise<void> {
    if (config.get('autoAllEnabled')) {
        log.info('Initializing Workflow Kit Auto-All environment...');
        // AUTO-PROMPT for relaunch if CDP not available
        await ensureCDPOrPrompt(true);
        await startPolling();
    }
    updateStatusBar();
}

async function ensureCDPOrPrompt(showPrompt: boolean): Promise<void> {
    if (!cdpHandler) return;

    log.info('Checking for active CDP session...');
    const cdpAvailable = await cdpHandler.isCDPAvailable();
    log.info(`CDP Available = ${cdpAvailable}`);

    if (cdpAvailable) {
        log.info('CDP is active and available.');
    } else {
        log.info(`CDP not found on expected ports (${CDP_PORT_MIN}-${CDP_PORT_MAX}).`);

        if (showPrompt && relauncher) {
            log.info('Auto-prompting user for relaunch to enable CDP...');
            await relauncher.showRelaunchPrompt();
        } else {
            log.info('Skipping relaunch prompt. User can click status bar to trigger.');
        }
    }
}

// ============ Polling (SAME AS OLD EXTENSION) ============
async function startPolling(): Promise<void> {
    // Callers reach this after awaiting the relaunch prompt; Auto-All may have been turned off meanwhile
    if (!config.get('autoAllEnabled')) {
        log.info('Workflow Kit: Auto-All is off, not starting CDP polling');
        return;
    }

    if (pollTimer) clearInterval(pollTimer);
    log.info('Workflow Kit: Starting CDP polling...');

    // The timer is registered before the first (awaited) sync, so a second startPolling() that
    // arrives during that sync replaces it instead of adding another one.
    pollTimer = setInterval(async () => {
        if (!config.get('autoAllEnabled')) {
            await stopPolling();
            return;
        }
        await syncCDPSession();
    }, 5000);

    await syncCDPSession();
}

async function syncCDPSession(): Promise<void> {
    if (!cdpHandler) return;
    if (!config.get('autoAllEnabled')) return;

    try {
        await cdpHandler.start({
            isPro: true,
            isBackgroundMode: config.get('multiTabEnabled'),
            pollInterval: config.get('pollFrequency'),
            ide: currentIDE.toLowerCase(), // CRITICAL: Must be lowercase like original extension
            bannedCommands: config.get('bannedCommands') // Use actual banned commands from config
        });
    } catch (err) {
        log.warn(`CDP sync error: ${(err as Error).message}`);
    }
}

async function stopPolling(): Promise<void> {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (cdpHandler) {
        try {
            await cdpHandler.stop();
        } catch {
            // stopping is best effort; the page-side heartbeat ends the loop if this did not get through
        }
    }
    log.info('Workflow Kit: Polling stopped');
}

// ============ Commands ============
function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        // Core commands
        vscode.commands.registerCommand('workflowKit.toggleExtension', toggleExtension),
        vscode.commands.registerCommand('workflowKit.toggleAutoAll', toggleAutoAll),
        vscode.commands.registerCommand('workflowKit.toggleMultiTab', toggleMultiTab),
        vscode.commands.registerCommand('workflowKit.toggleAutopilotMode', toggleAutopilotMode),
        vscode.commands.registerCommand('workflowKit.openSettings', () => openDashboard(context)),
        vscode.commands.registerCommand('workflowKit.resetCircuitBreaker', resetCircuitBreaker),
        // New feature commands
        vscode.commands.registerCommand('workflowKit.toggleMcp', toggleMcp),
        vscode.commands.registerCommand('workflowKit.toggleVoice', toggleVoice),
        vscode.commands.registerCommand('workflowKit.generateTests', generateTests),
        vscode.commands.registerCommand('workflowKit.runCodeReview', runCodeReview),
        vscode.commands.registerCommand('workflowKit.startMultiAgent', startMultiAgent),
        vscode.commands.registerCommand('workflowKit.showMemory', showMemory),
        vscode.commands.registerCommand('workflowKit.syncProjectTasks', syncProjectTasks)
    );
}

// ============ New Feature Commands ============
async function toggleMcp(): Promise<void> {
    const current = config.get('mcpEnabled');
    await config.set('mcpEnabled', !current);

    if (!current) {
        log.info('MCP Server enabled');
        vscode.window.showInformationMessage('✅ MCP tool registry: ON (experimental: not exposed to the agent yet)');
    } else {
        log.info('MCP Server disabled');
        vscode.window.showInformationMessage('⏸️ MCP tool registry: OFF');
    }
}

async function toggleVoice(): Promise<void> {
    const current = config.get('voiceControlEnabled');
    await config.set('voiceControlEnabled', !current);

    if (!current) {
        voiceController.setConfig({ enabled: true });
        await voiceController.startListening();
        vscode.window.showInformationMessage('🎤 Voice Control: ON');
    } else {
        voiceController.setConfig({ enabled: false });
        await voiceController.stopListening();
        vscode.window.showInformationMessage('🔇 Voice Control: OFF');
    }
}

async function generateTests(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No file open to generate tests for');
        return;
    }

    const filePath = vscode.workspace.asRelativePath(editor.document.uri);
    vscode.window.showInformationMessage(`🧪 Generating tests for ${filePath}...`);

    try {
        const suite = await testGenerator.generateTestsForFile(filePath);
        vscode.window.showInformationMessage(
            `✅ Generated ${suite.tests.length} tests in ${suite.tests[0]?.testFile || 'tests/'}`,
            'Open Tests'
        ).then(action => {
            if (action === 'Open Tests' && suite.tests[0]?.testFile) {
                const testUri = vscode.Uri.file(path.join(
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                    suite.tests[0].testFile
                ));
                vscode.window.showTextDocument(testUri);
            }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Test generation failed: ${(error as Error).message}`);
    }
}

async function runCodeReview(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No file open to review');
        return;
    }

    const code = editor.document.getText();
    const filename = path.basename(editor.document.fileName);

    vscode.window.showInformationMessage(`🔍 Reviewing ${filename}...`);

    const result = codeReviewer.review(code, filename);

    // Show diagnostics in VS Code. One shared collection: set() replaces this file's previous
    // results, and the collection is disposed together with the extension.
    const diagnostics = codeReviewer.showDiagnostics(editor.document, result.issues);
    if (!reviewDiagnostics) {
        reviewDiagnostics = vscode.languages.createDiagnosticCollection('workflow-kit-review');
        globalContext.subscriptions.push(reviewDiagnostics);
    }
    reviewDiagnostics.set(editor.document.uri, diagnostics);

    vscode.window.showInformationMessage(result.summary, 'View Details').then(action => {
        if (action === 'View Details') {
            const panel = vscode.window.createWebviewPanel(
                'workflowKitCodeReview',
                `Code Review: ${filename}`,
                vscode.ViewColumn.Two,
                {}
            );
            panel.webview.html = generateReviewHtml(result);
        }
    });
}

function generateReviewHtml(result: import('./core/code-reviewer').ReviewResult): string {
    const issueRows = result.issues.map(i => `
        <tr>
            <td>${i.severity}</td>
            <td>${i.type}</td>
            <td>${i.line || '-'}</td>
            <td>${i.message}</td>
            <td><code>${i.rule}</code></td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: system-ui; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
                h1 { color: ${result.passed ? '#4ade80' : '#f87171'}; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #333; }
                th { background: #2d2d2d; }
                .score { font-size: 2em; color: ${result.score >= 80 ? '#4ade80' : result.score >= 50 ? '#facc15' : '#f87171'}; }
            </style>
        </head>
        <body>
            <h1>${result.passed ? '✅ Review Passed' : '❌ Issues Found'}</h1>
            <p class="score">Score: ${result.score}/100</p>
            <table>
                <tr><th>Severity</th><th>Type</th><th>Line</th><th>Message</th><th>Rule</th></tr>
                ${issueRows || '<tr><td colspan="5">No issues found!</td></tr>'}
            </table>
        </body>
        </html>
    `;
}

async function startMultiAgent(): Promise<void> {
    const task = await vscode.window.showInputBox({
        prompt: 'Describe the task for multi-agent collaboration',
        placeHolder: 'e.g., Implement user authentication with OAuth2'
    });

    if (!task) return;

    await config.set('multiAgentEnabled', true);
    vscode.window.showInformationMessage(`🤖 Starting multi-agent task: ${task.substring(0, 50)}...`);

    try {
        await agentOrchestrator.coordinateAgents(task);
        vscode.window.showInformationMessage('✅ Multi-agent run finished (experimental: agents do not execute anything yet)');
    } catch (error) {
        vscode.window.showErrorMessage(`Multi-agent error: ${(error as Error).message}`);
    }
}

async function showMemory(): Promise<void> {
    const stats = memoryManager.getStats();
    const recent = memoryManager.getRecentMemories(10);

    const panel = vscode.window.createWebviewPanel(
        'workflowKitMemory',
        'Workflow Kit Session Memory',
        vscode.ViewColumn.Two,
        {}
    );

    const memoryRows = recent.map(m => `
        <tr>
            <td>${new Date(m.timestamp).toLocaleTimeString()}</td>
            <td>${m.type}</td>
            <td>${m.content.substring(0, 100)}...</td>
        </tr>
    `).join('');

    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: system-ui; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
                h1 { color: #7c3aed; }
                .stat { display: inline-block; margin: 10px; padding: 15px; background: #2d2d2d; border-radius: 8px; }
                .stat-value { font-size: 2em; color: #4ade80; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #333; }
            </style>
        </head>
        <body>
            <h1>🧠 Session Memory</h1>
            <div>
                <div class="stat"><div class="stat-value">${stats.currentEntries}</div>Current Entries</div>
                <div class="stat"><div class="stat-value">${stats.totalSessions}</div>Total Sessions</div>
                <div class="stat"><div class="stat-value">${stats.indexedTerms}</div>Indexed Terms</div>
            </div>
            <h2>Recent Memories</h2>
            <table>
                <tr><th>Time</th><th>Type</th><th>Content</th></tr>
                ${memoryRows || '<tr><td colspan="3">No memories yet</td></tr>'}
            </table>
        </body>
        </html>
    `;
}

async function syncProjectTasks(): Promise<void> {
    const configured = projectManager.isConfigured();

    if (!configured.github && !configured.jira) {
        const config = await vscode.window.showQuickPick(
            ['Configure GitHub', 'Configure Jira', 'Use Local @fix_plan.md'],
            { placeHolder: 'Select project management integration' }
        );

        if (config === 'Use Local @fix_plan.md') {
            const tasks = await projectManager.syncFromFixPlan();
            vscode.window.showInformationMessage(`📋 Synced ${tasks.length} tasks from @fix_plan.md`);
            return;
        }

        vscode.window.showInformationMessage('Configure integration in .workflow-kit/project-manager.json');
        return;
    }

    vscode.window.showInformationMessage('📋 Syncing project tasks...');

    try {
        // A failed fetch throws, so the plan is only rewritten with a complete result
        const remote = [];
        if (configured.github) {
            remote.push(...await projectManager.fetchGitHubIssues());
        }
        if (configured.jira) {
            remote.push(...await projectManager.fetchJiraIssues());
        }

        // Keep what is already in @fix_plan.md and add what is new
        const local = await projectManager.syncFromFixPlan();
        const merged = projectManager.mergeTasks(local, remote);
        await projectManager.updateFixPlan(merged);
        vscode.window.showInformationMessage(`✅ Synced ${remote.length} tasks (${merged.length - local.length} new)`);
    } catch (error) {
        vscode.window.showErrorMessage(`Sync failed, @fix_plan.md was left unchanged: ${(error as Error).message}`);
    }
}

// ============ Extension Toggle (Universal ON/OFF) ============
async function toggleExtension(): Promise<void> {
    const current = config.get('autoAllEnabled');

    if (current) {
        // Turning OFF - disable everything
        log.info('Workflow Kit: Turning OFF');
        await config.set('autoAllEnabled', false);
        await stopPolling();

        // Also stop autonomous mode if running
        if (autonomousLoop.isRunning()) {
            autonomousLoop.stop('Extension disabled');
            await config.set('autopilotModeEnabled', false);
        }

        vscode.window.showInformationMessage('⏸️ Workflow Kit: OFF');
    } else {
        // Turning ON - enable auto-all
        log.info('Workflow Kit: Turning ON');
        await config.set('autoAllEnabled', true);
        vscode.window.showInformationMessage('✅ Workflow Kit: ON');
        ensureCDPOrPrompt(true).then(() => startPolling());
    }

    updateStatusBar();
}

// ============ Toggle Functions (SAME FLOW AS OLD EXTENSION) ============
async function toggleAutoAll(): Promise<void> {
    const current = config.get('autoAllEnabled');
    await config.set('autoAllEnabled', !current);

    log.info(`Auto-All toggled: ${!current}`);
    updateStatusBar();

    if (!current) {
        // Enabling - same as old extension
        log.info('Workflow Kit Auto-All: Enabled');
        vscode.window.showInformationMessage('✅ Workflow Kit Auto-All: ON');
        ensureCDPOrPrompt(true).then(() => startPolling());
    } else {
        // Disabling
        log.info('Workflow Kit Auto-All: Disabled');
        vscode.window.showInformationMessage('⏸️ Workflow Kit Auto-All: OFF');
        await stopPolling();
    }
}

async function toggleMultiTab(): Promise<void> {
    if (!config.get('autoAllEnabled')) {
        vscode.window.showWarningMessage('Enable Auto-All first to use Multi-Tab');
        return;
    }

    const current = config.get('multiTabEnabled');
    await config.set('multiTabEnabled', !current);

    vscode.window.showInformationMessage(
        !current ? '✅ Multi-Tab: ON' : '⏸️ Multi-Tab: OFF'
    );

    // Re-sync with new mode
    if (config.get('autoAllEnabled')) {
        await syncCDPSession();
    }

    updateStatusBar();
}

async function toggleAutopilotMode(): Promise<void> {
    // Use actual loop state, not config - this ensures proper sync
    const isRunning = autonomousLoop.isRunning();

    // Update config to match the intended new state
    await config.set('autopilotModeEnabled', !isRunning);

    if (!isRunning) {
        log.info('AI Autonomous Mode enabled');

        // Auto-enable prerequisites
        if (!config.get('autoAllEnabled')) {
            log.info('Auto-enabling Auto-All as prerequisite');
            await config.set('autoAllEnabled', true);
            ensureCDPOrPrompt(true).then(() => startPolling());
        }

        startWorkflowKitAutonomous();
    } else {
        log.info('AI Autonomous Mode disabled');
        autonomousLoop.stop('User stopped');
    }

    updateStatusBar();
}

function resetCircuitBreaker(): void {
    circuitBreaker.reset('User reset');
    vscode.window.showInformationMessage('✅ Circuit breaker reset.');
}

// ============ Workflow Kit Autonomous ============
async function startWorkflowKitAutonomous(): Promise<void> {
    vscode.window.showInformationMessage(
        '🚀 AI Autonomous Mode: STARTING',
        'Stop'
    ).then((action) => {
        if (action === 'Stop') {
            autonomousLoop.stop('User clicked Stop');
        }
    });

    await autonomousLoop.start({
        maxLoops: config.get('maxLoopsPerSession'),
        loopIntervalSeconds: config.get('loopInterval'),
        autoSwitchModels: config.get('autoSwitchModels'),
    });
}

// ============ Dashboard ============
/** Settings that the dashboard's experimental toggles store. Nothing else reads them yet. */
const SCAFFOLD_TOGGLES = [
    'mcpEnabled',
    'memoryEnabled',
    'codeReviewEnabled',
    'voiceControlEnabled',
    'multiAgentEnabled',
    'notificationsEnabled',
    'autoTestGeneration',
] as const;

function openDashboard(context: vscode.ExtensionContext): void {
    DashboardPanel.create(context, handleFeatureToggle, handleSaveSettings);
    refreshDashboard();
}

/**
 * Push the loop's live numbers to the dashboard and re-render it. Feature toggles are read from
 * the configuration at render time, so the panel always shows what is actually set.
 */
function refreshDashboard(): void {
    const loopStatus = autonomousLoop.getStatus();
    DashboardPanel.current?.updateState({
        autopilotModeEnabled: loopStatus.running,
        loopCount: loopStatus.loopCount,
        sessionStats: progressTracker.getStats(),
        duration: progressTracker.getDurationMinutes(),
    });
}

async function handleFeatureToggle(feature: string, enabled: boolean): Promise<void> {
    switch (feature) {
        case 'autoAll':
            if (enabled !== config.get('autoAllEnabled')) await toggleAutoAll();
            break;
        case 'multiTab':
            if (enabled !== config.get('multiTabEnabled')) await toggleMultiTab();
            break;
        case 'autopilotMode':
            if (enabled !== autonomousLoop.isRunning()) await toggleAutopilotMode();
            break;
        case 'autoSwitchModels':
            await config.set('autoSwitchModels', enabled);
            // Auto-enable Auto-All as prerequisite
            if (enabled && !config.get('autoAllEnabled')) {
                log.info('Auto-enabling Auto-All for Smart Model Switching');
                await config.set('autoAllEnabled', true);
                ensureCDPOrPrompt(true).then(() => startPolling());
            }
            break;
        case 'autoGitCommit':
            await config.set('autoGitCommit', enabled);
            break;
        case 'resetCircuitBreaker':
            resetCircuitBreaker();
            break;
        default:
            if ((SCAFFOLD_TOGGLES as readonly string[]).includes(feature)) {
                await config.set(feature as typeof SCAFFOLD_TOGGLES[number], enabled);
            } else {
                log.warn(`Ignoring unknown dashboard toggle: ${feature}`);
            }
    }
    updateStatusBar();
    refreshDashboard();
}

async function handleSaveSettings(settings: Record<string, unknown>, silent = false): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
        await config.set(key as keyof import('./utils/constants').WorkflowKitConfig, value as never);
    }
    if (!silent) {
        vscode.window.showInformationMessage('Settings saved!');
    }
}

// ============ Status Bar ============
function updateStatusBar(): void {
    const loopStatus = autonomousLoop.getStatus();
    statusBar.update({
        autoAllEnabled: config.get('autoAllEnabled'),
        multiTabEnabled: config.get('multiTabEnabled'),
        autopilotModeEnabled: loopStatus.running,
        loopCount: loopStatus.loopCount,
    });
}

// ============ Deactivation ============
/**
 * VS Code waits for the returned promise, so the stop signal reaches the editor pages and the
 * sockets are closed before the extension host moves on.
 */
export async function deactivate(): Promise<void> {
    autonomousLoop.stop('Extension deactivated');
    cdpClient.disconnect();
    reviewDiagnostics?.dispose();
    reviewDiagnostics = undefined;
    statusBar?.dispose();
    await stopPolling();
    log.info('Antigravity Workflow Kit deactivated');
}
