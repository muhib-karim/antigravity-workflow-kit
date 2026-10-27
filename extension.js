/**
 * Workflow Kit - All-in-One Autonomous Antigravity Extension
 * Features: Auto-All, Multi-Tab, Autopilot Mode (autonomous loop), Intelligent Model Selection
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// Usage provider
let usageProvider;
let cachedUsage = null;

let globalContext;
let autoAllEnabled = false;
let multiTabEnabled = false;
let autopilotModeEnabled = false;
let autoSwitchModels = true;
let autoGitCommit = false;
let pollFrequency = 1000;
let loopInterval = 30;
let maxLoopsPerSession = 100;
let bannedCommands = [];

// Status bar items
let statusAutoAll;
let statusMultiTab;
let statusWorkflowKit;
let statusSettings;

// CDP and handlers  
let cdpHandler;
let relauncher;

// Workflow Kit state
let autopilotLoopTimer;
let autopilotLoopCount = 0;
let sessionStats = {
    promptsSent: 0,
    modelSwitches: 0,
    tasksCompleted: 0,
    timeSavedMinutes: 0,
    startTime: null
};

// ============ LOGGING ============
function log(message) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[Workflow Kit ${timestamp}] ${message}`);
}

// ============ ACTIVATION ============
async function activate(context) {
    globalContext = context;
    log('Workflow Kit All-in-One extension activating...');

    // Load saved states
    loadConfiguration();

    // Create status bar items
    createStatusBarItems(context);

    // Initialize CDP handlers
    try {
        const { CDPHandler } = require('./main_scripts/cdp-handler');
        const { Relauncher, BASE_CDP_PORT } = require('./main_scripts/relauncher');
        cdpHandler = new CDPHandler(BASE_CDP_PORT, BASE_CDP_PORT + 10, log);
        relauncher = new Relauncher(log);
        log('CDP handlers initialized');
    } catch (err) {
        log(`CDP init failed: ${err.message}`);
    }

    // Initialize usage provider
    try {
        const { AntigravityUsageProvider } = require('./main_scripts/usage-provider');
        usageProvider = new AntigravityUsageProvider(log);
        log('Usage provider initialized');
    } catch (err) {
        log(`Usage provider init failed: ${err.message}`);
    }

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('workflowKit.toggleAutoAll', () => toggleAutoAll()),
        vscode.commands.registerCommand('workflowKit.toggleMultiTab', () => toggleMultiTab()),
        vscode.commands.registerCommand('workflowKit.toggleAutopilotMode', () => toggleAutopilotMode()),
        vscode.commands.registerCommand('workflowKit.openSettings', () => openDashboard(context))
    );

    updateAllStatusBars();

    // Auto-start if enabled
    if (autoAllEnabled) {
        startAutoAllPolling();
    }
    if (autopilotModeEnabled) {
        startAutopilotLoop();
    }

    log('Workflow Kit extension activated!');
}

function loadConfiguration() {
    const config = vscode.workspace.getConfiguration('workflowKit');
    autoAllEnabled = config.get('autoAllEnabled', false);
    multiTabEnabled = config.get('multiTabEnabled', false);
    autopilotModeEnabled = config.get('autopilotModeEnabled', false);
    autoSwitchModels = config.get('autoSwitchModels', true);
    autoGitCommit = config.get('autoGitCommit', false);
    pollFrequency = config.get('pollFrequency', 1000);
    loopInterval = config.get('loopInterval', 30);
    maxLoopsPerSession = config.get('maxLoopsPerSession', 100);
    bannedCommands = config.get('bannedCommands', ['rm -rf /', 'format c:']);
}

// ============ STATUS BAR ============
function createStatusBarItems(context) {
    // Auto-All status (rightmost to work left)
    statusAutoAll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 103);
    statusAutoAll.command = 'workflowKit.toggleAutoAll';
    context.subscriptions.push(statusAutoAll);
    statusAutoAll.show();

    // Multi-Tab status
    statusMultiTab = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
    statusMultiTab.command = 'workflowKit.toggleMultiTab';
    context.subscriptions.push(statusMultiTab);

    // Autopilot Mode status  
    statusWorkflowKit = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    statusWorkflowKit.command = 'workflowKit.toggleAutopilotMode';
    context.subscriptions.push(statusWorkflowKit);
    statusWorkflowKit.show();

    // Settings gear
    statusSettings = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusSettings.command = 'workflowKit.openSettings';
    statusSettings.text = '$(gear) Workflow Kit Settings';
    statusSettings.tooltip = 'Open Workflow Kit Dashboard & Settings';
    context.subscriptions.push(statusSettings);
    statusSettings.show();
}

function updateAllStatusBars() {
    // Auto-All
    if (autoAllEnabled) {
        statusAutoAll.text = '$(check) Auto-All: ON';
        statusAutoAll.tooltip = 'Auto-accept is ON - Click to toggle';
        statusAutoAll.backgroundColor = undefined;
    } else {
        statusAutoAll.text = '$(circle-slash) Auto-All: OFF';
        statusAutoAll.tooltip = 'Auto-accept is OFF - Click to toggle';
        statusAutoAll.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    // Multi-Tab
    if (autoAllEnabled) {
        statusMultiTab.show();
        if (multiTabEnabled) {
            statusMultiTab.text = '$(check-all) Multi-Tab: ON';
            statusMultiTab.tooltip = 'Working across all tabs - Click to toggle';
        } else {
            statusMultiTab.text = '$(browser) Multi-Tab: OFF';
            statusMultiTab.tooltip = 'Single tab mode - Click to toggle';
        }
    } else {
        statusMultiTab.hide();
    }

    // Autopilot Mode
    if (autopilotModeEnabled) {
        statusWorkflowKit.text = `$(sync~spin) Workflow Kit: ON (#${autopilotLoopCount})`;
        statusWorkflowKit.tooltip = `Autonomous loop running - ${autopilotLoopCount} loops - Click to stop`;
        statusWorkflowKit.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    } else {
        statusWorkflowKit.text = '$(debug-pause) Workflow Kit: OFF';
        statusWorkflowKit.tooltip = 'Autonomous loop is OFF - Click to start';
        statusWorkflowKit.backgroundColor = undefined;
    }
}

// ============ AUTO-ALL ============
let pollTimer;

async function toggleAutoAll() {
    autoAllEnabled = !autoAllEnabled;
    await vscode.workspace.getConfiguration('workflowKit').update('autoAllEnabled', autoAllEnabled, true);

    updateAllStatusBars();

    if (autoAllEnabled) {
        log('Auto-All enabled');
        vscode.window.showInformationMessage('✅ Workflow Kit Auto-All: ON');
        startAutoAllPolling();
    } else {
        log('Auto-All disabled');
        vscode.window.showInformationMessage('⏸️ Workflow Kit Auto-All: OFF');
        stopAutoAllPolling();
    }
}

async function startAutoAllPolling() {
    if (pollTimer) clearInterval(pollTimer);
    log('Starting Auto-All polling...');

    await syncCDPSessions();

    pollTimer = setInterval(async () => {
        if (!autoAllEnabled) return;
        await syncCDPSessions();
    }, 5000);
}

function stopAutoAllPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (cdpHandler) cdpHandler.stop();
    log('Auto-All polling stopped');
}

async function syncCDPSessions() {
    if (!cdpHandler) return;

    try {
        await cdpHandler.start({
            isPro: true,
            isBackgroundMode: multiTabEnabled,
            pollInterval: pollFrequency,
            ide: 'Antigravity',
            bannedCommands: bannedCommands
        });
    } catch (err) {
        log(`CDP sync error: ${err.message}`);
    }
}

// ============ MULTI-TAB ============
async function toggleMultiTab() {
    if (!autoAllEnabled) {
        vscode.window.showWarningMessage('Enable Auto-All first to use Multi-Tab mode');
        return;
    }

    multiTabEnabled = !multiTabEnabled;
    await vscode.workspace.getConfiguration('workflowKit').update('multiTabEnabled', multiTabEnabled, true);

    updateAllStatusBars();

    if (multiTabEnabled) {
        vscode.window.showInformationMessage('✅ Workflow Kit Multi-Tab: ON');
    } else {
        vscode.window.showInformationMessage('⏸️ Workflow Kit Multi-Tab: OFF');
    }

    syncCDPSessions();
}

// ============ AUTOPILOT MODE (AUTONOMOUS LOOP) ============
async function toggleAutopilotMode() {
    autopilotModeEnabled = !autopilotModeEnabled;
    await vscode.workspace.getConfiguration('workflowKit').update('autopilotModeEnabled', autopilotModeEnabled, true);

    updateAllStatusBars();

    if (autopilotModeEnabled) {
        log('Autopilot Mode enabled');
        vscode.window.showInformationMessage('🚀 Workflow Kit Autonomous Loop: STARTING');
        sessionStats.startTime = Date.now();
        startAutopilotLoop();
    } else {
        log('Autopilot Mode disabled');
        stopAutopilotLoop();
        showSessionSummary();
    }
}

async function startAutopilotLoop() {
    autopilotLoopCount = 0;

    // Inject Workflow Kit script via CDP
    await injectWorkflowKitScript();

    // Start CDP-based autonomous loop
    if (cdpHandler) {
        const config = getWorkflowKitConfig();
        for (const [pageId] of cdpHandler.connections || []) {
            try {
                await cdpHandler.sendCommand(pageId, 'Runtime.evaluate', {
                    expression: `if(typeof window !== 'undefined' && window.__workflowKitStart) window.__workflowKitStart(${JSON.stringify(config)})`,
                    userGesture: true
                });
                log(`Workflow Kit started on page ${pageId}`);
            } catch (e) {
                log(`Failed to start Workflow Kit on ${pageId}: ${e.message}`);
            }
        }
    }

    // Also run local monitoring
    autopilotLoopTimer = setInterval(async () => {
        if (!autopilotModeEnabled) {
            stopAutopilotLoop();
            return;
        }

        autopilotLoopCount++;
        updateAllStatusBars();

        // Check for completion
        if (autopilotLoopCount >= maxLoopsPerSession) {
            log(`Max loops (${maxLoopsPerSession}) reached`);
            autopilotModeEnabled = false;
            stopAutopilotLoop();
            showSessionSummary();
        }

        // Get stats from injected script
        await updateStatsFromCDP();

        // Auto git commit if enabled
        if (autoGitCommit && autopilotLoopCount % 10 === 0) {
            await gitAutoCommit();
        }

    }, loopInterval * 1000);
}

function stopAutopilotLoop() {
    if (autopilotLoopTimer) {
        clearInterval(autopilotLoopTimer);
        autopilotLoopTimer = null;
    }

    // Stop Workflow Kit in CDP
    if (cdpHandler) {
        for (const [pageId] of cdpHandler.connections || []) {
            try {
                cdpHandler.sendCommand(pageId, 'Runtime.evaluate', {
                    expression: 'if(typeof window !== "undefined" && window.__workflowKitStop) window.__workflowKitStop()'
                }).catch(() => { });
            } catch (e) { }
        }
    }

    autopilotModeEnabled = false;
    updateAllStatusBars();
    log(`Autopilot loop stopped after ${autopilotLoopCount} iterations`);
}

async function injectWorkflowKitScript() {
    if (!cdpHandler) return;

    const scriptPath = path.join(__dirname, 'main_scripts', 'workflowkit_cdp_script.js');
    if (!fs.existsSync(scriptPath)) {
        log('Workflow Kit CDP script not found');
        return;
    }

    const script = fs.readFileSync(scriptPath, 'utf8');

    const instances = await cdpHandler.scanForInstances();
    for (const instance of instances) {
        for (const page of instance.pages) {
            if (!cdpHandler.connections.has(page.id)) {
                await cdpHandler.connectToPage(page);
            }

            try {
                await cdpHandler.sendCommand(page.id, 'Runtime.evaluate', {
                    expression: script,
                    userGesture: true
                });
                log(`Workflow Kit script injected on ${page.id}`);
            } catch (e) {
                log(`Failed to inject Workflow Kit script: ${e.message}`);
            }
        }
    }
}

function getWorkflowKitConfig() {
    const config = vscode.workspace.getConfiguration('workflowKit');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const projectDir = workspaceFolders?.[0]?.uri.fsPath || '';

    // Read current task from @fix_plan.md
    let currentTask = '';
    const fixPlanPath = path.join(projectDir, '@fix_plan.md');
    if (fs.existsSync(fixPlanPath)) {
        const content = fs.readFileSync(fixPlanPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.match(/^-\s*\[\s*\]/)) {
                currentTask = line.replace(/^-\s*\[\s*\]\s*/, '').trim();
                break;
            }
        }
    }

    return {
        maxLoops: maxLoopsPerSession,
        loopInterval: loopInterval,
        autoSwitchModels: autoSwitchModels,
        currentTask: currentTask,
        models: {
            reasoning: config.get('preferredModelForReasoning', 'claude-opus-4.5-thinking'),
            frontend: config.get('preferredModelForFrontend', 'gemini-3-pro-high'),
            quick: config.get('preferredModelForQuick', 'gemini-3-flash')
        }
    };
}

async function updateStatsFromCDP() {
    if (!cdpHandler) return;

    for (const [pageId] of cdpHandler.connections || []) {
        try {
            const result = await cdpHandler.sendCommand(pageId, 'Runtime.evaluate', {
                expression: '(function(){ if(window.__workflowKitGetStats) return window.__workflowKitGetStats(); return "{}"; })()',
                returnByValue: true
            });

            if (result.result?.value) {
                const stats = JSON.parse(result.result.value);
                sessionStats.promptsSent = stats.promptsSent || 0;
                sessionStats.modelSwitches = stats.modelSwitches || 0;
                sessionStats.tasksCompleted = stats.tasksCompleted || 0;
            }
        } catch (e) { }
    }
}

async function gitAutoCommit() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const projectDir = workspaceFolders[0].uri.fsPath;

    try {
        const { exec } = require('child_process');
        exec(`git add -A && git commit -m "Workflow Kit auto-commit: Loop #${autopilotLoopCount}"`, { cwd: projectDir }, (err) => {
            if (!err) {
                log(`Git auto-commit at loop #${autopilotLoopCount}`);
            }
        });
    } catch (e) {
        log(`Git commit failed: ${e.message}`);
    }
}

function showSessionSummary() {
    const duration = sessionStats.startTime ? Math.floor((Date.now() - sessionStats.startTime) / 60000) : 0;

    vscode.window.showInformationMessage(
        `🎉 Workflow Kit Session Complete!\n` +
        `• Loops: ${autopilotLoopCount}\n` +
        `• Prompts sent: ${sessionStats.promptsSent}\n` +
        `• Model switches: ${sessionStats.modelSwitches}\n` +
        `• Duration: ${duration} minutes`,
        'Open Dashboard'
    ).then(choice => {
        if (choice === 'Open Dashboard') {
            openDashboard(globalContext);
        }
    });
}

// ============ DASHBOARD ============
let dashboardPanel;

function openDashboard(context) {
    if (dashboardPanel) {
        dashboardPanel.reveal(vscode.ViewColumn.One);
        updateDashboardContent();
        return;
    }

    dashboardPanel = vscode.window.createWebviewPanel(
        'workflowKitDashboard',
        'Workflow Kit Dashboard',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true }
    );

    // Fetch usage on open
    fetchUsageData();

    updateDashboardContent();

    dashboardPanel.webview.onDidReceiveMessage(async message => {
        switch (message.command) {
            case 'toggleFeature':
                await handleFeatureToggle(message.feature, message.enabled);
                updateDashboardContent();
                break;
            case 'saveSettings':
                await saveSettings(message.settings);
                vscode.window.showInformationMessage('Settings saved!');
                break;
            case 'refresh':
                updateDashboardContent();
                break;
        }
    });

    dashboardPanel.onDidDispose(() => {
        dashboardPanel = null;
    });

    // Auto-refresh stats
    const refreshInterval = setInterval(() => {
        if (dashboardPanel) {
            fetchUsageData();
            updateDashboardContent();
        } else {
            clearInterval(refreshInterval);
        }
    }, 10000); // 10 seconds
}

async function fetchUsageData() {
    if (!usageProvider) return;
    try {
        cachedUsage = await usageProvider.fetch();
        log(`Usage fetched: ${cachedUsage?.models?.length || 0} models`);
    } catch (e) {
        log(`Usage fetch failed: ${e.message}`);
    }
}

async function handleFeatureToggle(feature, enabled) {
    const config = vscode.workspace.getConfiguration('workflowKit');

    switch (feature) {
        case 'autoAll':
            if (enabled !== autoAllEnabled) await toggleAutoAll();
            break;
        case 'multiTab':
            if (enabled !== multiTabEnabled) await toggleMultiTab();
            break;
        case 'autopilotMode':
            if (enabled !== autopilotModeEnabled) await toggleAutopilotMode();
            break;
        case 'autoSwitchModels':
            autoSwitchModels = enabled;
            await config.update('autoSwitchModels', enabled, true);
            break;
        case 'autoGitCommit':
            autoGitCommit = enabled;
            await config.update('autoGitCommit', enabled, true);
            break;
    }

    updateAllStatusBars();
}

async function saveSettings(settings) {
    const config = vscode.workspace.getConfiguration('workflowKit');

    for (const [key, value] of Object.entries(settings)) {
        await config.update(key, value, true);
    }

    loadConfiguration();
}

function updateDashboardContent() {
    if (!dashboardPanel) return;

    const config = vscode.workspace.getConfiguration('workflowKit');
    const duration = sessionStats.startTime ? Math.floor((Date.now() - sessionStats.startTime) / 60000) : 0;

    dashboardPanel.webview.html = getDashboardHtml({
        autoAllEnabled,
        multiTabEnabled,
        autopilotModeEnabled,
        autoSwitchModels,
        autoGitCommit,
        autopilotLoopCount,
        sessionStats,
        duration,
        config,
        usage: cachedUsage
    });
}

function getDashboardHtml(state) {
    // Generate usage bars HTML
    let usageBarsHtml = '';
    if (state.usage && state.usage.models && state.usage.models.length > 0) {
        usageBarsHtml = state.usage.models.map(model => {
            const remaining = model.remainingPercent || 0;
            const barClass = remaining > 50 ? 'good' : remaining > 20 ? 'warning' : 'critical';
            return `
                <div class="usage-item">
                    <div class="usage-header">
                        <span class="model-name">${model.label}</span>
                        <span class="usage-percent ${barClass}">${remaining.toFixed(0)}% left</span>
                    </div>
                    <div class="meter-container">
                        <div class="meter-fill ${barClass}" style="width: ${remaining}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        usageBarsHtml = '<div class="usage-loading">Click Refresh to load usage data</div>';
    }

    const planBadge = state.usage?.plan ? `<span class="plan-badge">${state.usage.plan}</span>` : '';
    const emailDisplay = state.usage?.email || '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Kit Dashboard</title>
    <style>
        :root {
            /* Frosted Glass Theme - Dark Mode */
            --bg-blur: rgba(20, 20, 25, 0.92);
            --bg-card: rgba(30, 30, 38, 0.85);
            --backdrop-filter: blur(25px) saturate(150%);
            --border-color: rgba(255, 255, 255, 0.08);
            --shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
            
            --text-primary: #e4e4e7;
            --text-secondary: rgba(228, 228, 231, 0.65);
            --text-muted: rgba(228, 228, 231, 0.45);
            
            --accent: #14b8a6;
            --accent-green: #22c55e;
            --accent-yellow: #f59e0b;
            --accent-red: #ef4444;
            
            --meter-bg: rgba(255, 255, 255, 0.08);
            --separator: rgba(255, 255, 255, 0.06);
            --hover-bg: rgba(255, 255, 255, 0.05);
            
            --font-family: "Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: var(--font-family);
            background: var(--bg-blur);
            color: var(--text-primary);
            min-height: 100vh;
            line-height: 1.5;
        }
        
        .dashboard {
            max-width: 900px;
            margin: 0 auto;
            padding: 24px;
        }
        
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--separator);
            margin-bottom: 24px;
        }
        
        .header-left { display: flex; align-items: center; gap: 12px; }
        .header-left h1 { font-size: 24px; font-weight: 600; }
        .logo { font-size: 28px; }
        
        .header-right { display: flex; align-items: center; gap: 12px; }
        .email { color: var(--text-secondary); font-size: 12px; }
        .plan-badge {
            background: rgba(20, 184, 166, 0.15);
            color: var(--accent);
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        }
        
        .status-badge {
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .status-running { background: var(--accent-green); color: #000; }
        .status-stopped { background: rgba(255,255,255,0.1); color: var(--text-secondary); }
        
        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            backdrop-filter: blur(10px);
        }
        
        .stat-value {
            font-size: 32px;
            font-weight: 700;
            color: var(--accent);
        }
        
        .stat-label {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        /* Sections */
        .section {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
            backdrop-filter: blur(10px);
        }
        
        .section h2 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        /* Usage Meters */
        .usage-item {
            margin-bottom: 16px;
        }
        
        .usage-item:last-child { margin-bottom: 0; }
        
        .usage-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 13px;
        }
        
        .model-name { color: var(--text-primary); font-weight: 500; }
        .usage-percent { font-weight: 600; }
        .usage-percent.good { color: var(--accent-green); }
        .usage-percent.warning { color: var(--accent-yellow); }
        .usage-percent.critical { color: var(--accent-red); }
        
        .meter-container {
            height: 8px;
            background: var(--meter-bg);
            border-radius: 4px;
            overflow: hidden;
        }
        
        .meter-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.5s ease, background-color 0.3s ease;
        }
        
        .meter-fill.good { background: var(--accent-green); }
        .meter-fill.warning { background: var(--accent-yellow); }
        .meter-fill.critical { background: var(--accent-red); }
        
        .usage-loading {
            color: var(--text-muted);
            font-size: 13px;
            text-align: center;
            padding: 20px;
        }
        
        /* Toggle Rows */
        .toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 0;
            border-bottom: 1px solid var(--separator);
        }
        
        .toggle-row:last-child { border-bottom: none; }
        
        .toggle-info h3 { font-size: 13px; font-weight: 500; }
        .toggle-info p { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
        
        .toggle {
            position: relative;
            width: 44px;
            height: 24px;
        }
        
        .toggle input { opacity: 0; width: 0; height: 0; }
        
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            inset: 0;
            background: rgba(255,255,255,0.1);
            border-radius: 24px;
            transition: 0.25s;
        }
        
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background: var(--text-secondary);
            border-radius: 50%;
            transition: 0.25s;
        }
        
        .toggle input:checked + .toggle-slider { background: var(--accent); }
        .toggle input:checked + .toggle-slider:before { transform: translateX(20px); background: white; }
        
        /* Settings */
        .setting-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid var(--separator);
        }
        
        .setting-row:last-child { border-bottom: none; }
        .setting-row label { font-size: 13px; color: var(--text-primary); }
        
        select, input[type="number"] {
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            min-width: 160px;
        }
        
        select:focus, input:focus {
            outline: none;
            border-color: var(--accent);
        }
        
        /* Buttons */
        .btn {
            background: var(--accent);
            color: #000;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
        }
        
        .btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-secondary { background: rgba(255,255,255,0.08); color: var(--text-primary); }
        
        .footer {
            margin-top: 20px;
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        }
        
        @media (max-width: 600px) {
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <div class="header-left">
                <span class="logo">⚡</span>
                <h1>Workflow Kit Dashboard</h1>
            </div>
            <div class="header-right">
                <span class="email">${emailDisplay}</span>
                ${planBadge}
                <span class="status-badge ${state.autopilotModeEnabled ? 'status-running' : 'status-stopped'}">
                    ${state.autopilotModeEnabled ? '🚀 RUNNING' : '⏸️ STOPPED'}
                </span>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${state.autopilotLoopCount}</div>
                <div class="stat-label">Loops</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.sessionStats.promptsSent}</div>
                <div class="stat-label">Prompts</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.sessionStats.modelSwitches}</div>
                <div class="stat-label">Switches</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${state.duration}m</div>
                <div class="stat-label">Duration</div>
            </div>
        </div>
        
        <div class="section">
            <h2>📊 Antigravity Usage</h2>
            ${usageBarsHtml}
        </div>
        
        <div class="section">
            <h2>🎛️ Features</h2>
            
            <div class="toggle-row">
                <div class="toggle-info">
                    <h3>Auto-All Mode</h3>
                    <p>Auto-accept file edits and terminal commands</p>
                </div>
                <label class="toggle">
                    <input type="checkbox" ${state.autoAllEnabled ? 'checked' : ''} onchange="toggleFeature('autoAll', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="toggle-row">
                <div class="toggle-info">
                    <h3>Multi-Tab Mode</h3>
                    <p>Work across all conversation tabs</p>
                </div>
                <label class="toggle">
                    <input type="checkbox" ${state.multiTabEnabled ? 'checked' : ''} onchange="toggleFeature('multiTab', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="toggle-row">
                <div class="toggle-info">
                    <h3>Workflow Kit Autonomous Mode</h3>
                    <p>Continuous AI loop with model selection</p>
                </div>
                <label class="toggle">
                    <input type="checkbox" ${state.autopilotModeEnabled ? 'checked' : ''} onchange="toggleFeature('autopilotMode', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="toggle-row">
                <div class="toggle-info">
                    <h3>Auto Model Switching</h3>
                    <p>Select model based on task type</p>
                </div>
                <label class="toggle">
                    <input type="checkbox" ${state.autoSwitchModels ? 'checked' : ''} onchange="toggleFeature('autoSwitchModels', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
            
            <div class="toggle-row">
                <div class="toggle-info">
                    <h3>Auto Git Commit</h3>
                    <p>Commit progress every 10 loops</p>
                </div>
                <label class="toggle">
                    <input type="checkbox" ${state.autoGitCommit ? 'checked' : ''} onchange="toggleFeature('autoGitCommit', this.checked)">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        
        <div class="section">
            <h2>🧠 Model Preferences</h2>
            
            <div class="setting-row">
                <label>Complex Reasoning</label>
                <select id="preferredModelForReasoning">
                    <option value="claude-opus-4.5-thinking" ${state.config.get('preferredModelForReasoning') === 'claude-opus-4.5-thinking' ? 'selected' : ''}>Claude Opus 4.5 (Thinking)</option>
                    <option value="claude-sonnet-4.5-thinking" ${state.config.get('preferredModelForReasoning') === 'claude-sonnet-4.5-thinking' ? 'selected' : ''}>Claude Sonnet 4.5 (Thinking)</option>
                    <option value="claude-sonnet-4.5" ${state.config.get('preferredModelForReasoning') === 'claude-sonnet-4.5' ? 'selected' : ''}>Claude Sonnet 4.5</option>
                </select>
            </div>
            
            <div class="setting-row">
                <label>Frontend / UI</label>
                <select id="preferredModelForFrontend">
                    <option value="gemini-3-pro-high" ${state.config.get('preferredModelForFrontend') === 'gemini-3-pro-high' ? 'selected' : ''}>Gemini 3 Pro (High)</option>
                    <option value="gemini-3-pro-low" ${state.config.get('preferredModelForFrontend') === 'gemini-3-pro-low' ? 'selected' : ''}>Gemini 3 Pro (Low)</option>
                    <option value="gemini-3-flash" ${state.config.get('preferredModelForFrontend') === 'gemini-3-flash' ? 'selected' : ''}>Gemini 3 Flash</option>
                </select>
            </div>
            
            <div class="setting-row">
                <label>Quick Tasks</label>
                <select id="preferredModelForQuick">
                    <option value="gemini-3-flash" ${state.config.get('preferredModelForQuick') === 'gemini-3-flash' ? 'selected' : ''}>Gemini 3 Flash</option>
                    <option value="gemini-3-pro-low" ${state.config.get('preferredModelForQuick') === 'gemini-3-pro-low' ? 'selected' : ''}>Gemini 3 Pro (Low)</option>
                    <option value="gpt-oss-120b" ${state.config.get('preferredModelForQuick') === 'gpt-oss-120b' ? 'selected' : ''}>GPT-OSS 120B</option>
                </select>
            </div>
        </div>
        
        <div class="section">
            <h2>⚙️ Loop Settings</h2>
            
            <div class="setting-row">
                <label>Loop Interval (sec)</label>
                <input type="number" id="loopInterval" value="${state.config.get('loopInterval', 30)}" min="10" max="120">
            </div>
            
            <div class="setting-row">
                <label>Max Loops</label>
                <input type="number" id="maxLoopsPerSession" value="${state.config.get('maxLoopsPerSession', 100)}" min="1" max="1000">
            </div>
            
            <div class="setting-row">
                <label>Poll Frequency (ms)</label>
                <input type="number" id="pollFrequency" value="${state.config.get('pollFrequency', 1000)}" min="500" max="5000">
            </div>
        </div>
        
        <div class="footer">
            <button class="btn btn-secondary" onclick="refresh()">🔄 Refresh</button>
            <button class="btn" onclick="saveSettings()">💾 Save Settings</button>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function toggleFeature(feature, enabled) {
            vscode.postMessage({ command: 'toggleFeature', feature, enabled });
        }
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function saveSettings() {
            vscode.postMessage({
                command: 'saveSettings',
                settings: {
                    preferredModelForReasoning: document.getElementById('preferredModelForReasoning').value,
                    preferredModelForFrontend: document.getElementById('preferredModelForFrontend').value,
                    preferredModelForQuick: document.getElementById('preferredModelForQuick').value,
                    loopInterval: parseInt(document.getElementById('loopInterval').value),
                    maxLoopsPerSession: parseInt(document.getElementById('maxLoopsPerSession').value),
                    pollFrequency: parseInt(document.getElementById('pollFrequency').value)
                }
            });
        }
    </script>
</body>
</html>`;
}

// ============ DEACTIVATION ============
function deactivate() {
    stopAutoAllPolling();
    stopAutopilotLoop();
    if (cdpHandler) cdpHandler.stop();
}

module.exports = { activate, deactivate };
