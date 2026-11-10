/**
 * Antigravity Workflow Kit - Dashboard WebView
 * @module ui/dashboard
 */

import * as vscode from 'vscode';
import { DASHBOARD_CSS, KOFI_LINK, GITHUB_LINK, ICONS } from './styles';
import { config } from '../utils/config';
import { usageProvider } from '../providers/antigravity-usage';
import { createLogger } from '../utils/logger';
import { SessionStats, UsageData, ModelId, MODEL_LABELS } from '../utils/constants';

const log = createLogger('Dashboard');

/** Escape text that comes from outside the extension before it goes into the webview HTML */
function escapeHtml(text: string): string {
    return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

export interface DashboardState {
    autoAllEnabled: boolean;
    multiTabEnabled: boolean;
    autopilotModeEnabled: boolean;
    autoSwitchModels: boolean;
    autoGitCommit: boolean;
    // v3.0 features
    mcpEnabled: boolean;
    memoryEnabled: boolean;
    codeReviewEnabled: boolean;
    voiceControlEnabled: boolean;
    multiAgentEnabled: boolean;
    notificationsEnabled: boolean;
    autoTestGeneration: boolean;
    loopCount: number;
    sessionStats: SessionStats;
    duration: number;
    usage: UsageData | null;
}

export class DashboardPanel {
    private static instance: DashboardPanel | undefined;

    /** The open dashboard, if any */
    static get current(): DashboardPanel | undefined {
        return DashboardPanel.instance;
    }

    private panel: vscode.WebviewPanel;
    private state: DashboardState;
    private refreshTimer: NodeJS.Timeout | null = null;

    private constructor(
        panel: vscode.WebviewPanel,
        private onToggle: (feature: string, enabled: boolean) => void,
        private onSaveSettings: (settings: Record<string, unknown>, silent?: boolean) => void
    ) {
        this.panel = panel;
        this.state = this.getInitialState();

        this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));
        this.panel.onDidDispose(() => this.dispose());

        // Start refresh timer
        this.startAutoRefresh();
        this.fetchUsage();
        this.update();

        log.info('Dashboard opened');
    }

    static create(
        context: vscode.ExtensionContext,
        onToggle: (feature: string, enabled: boolean) => void,
        onSaveSettings: (settings: Record<string, unknown>) => void
    ): DashboardPanel {
        if (DashboardPanel.instance) {
            DashboardPanel.instance.panel.reveal(vscode.ViewColumn.One);
            return DashboardPanel.instance;
        }

        const panel = vscode.window.createWebviewPanel(
            'workflowKitDashboard',
            'Workflow Kit Dashboard',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        DashboardPanel.instance = new DashboardPanel(panel, onToggle, onSaveSettings);
        return DashboardPanel.instance;
    }

    private getInitialState(): DashboardState {
        return {
            autoAllEnabled: config.get('autoAllEnabled'),
            multiTabEnabled: config.get('multiTabEnabled'),
            autopilotModeEnabled: config.get('autopilotModeEnabled'),
            autoSwitchModels: config.get('autoSwitchModels'),
            autoGitCommit: config.get('autoGitCommit'),
            // v3.0 features
            mcpEnabled: config.get('mcpEnabled') ?? false,
            memoryEnabled: config.get('memoryEnabled') ?? true,
            codeReviewEnabled: config.get('codeReviewEnabled') ?? true,
            voiceControlEnabled: config.get('voiceControlEnabled') ?? false,
            multiAgentEnabled: config.get('multiAgentEnabled') ?? false,
            notificationsEnabled: config.get('notificationsEnabled') ?? true,
            autoTestGeneration: config.get('autoTestGeneration') ?? false,
            loopCount: 0,
            sessionStats: { promptsSent: 0, modelSwitches: 0, tasksCompleted: 0, loopCount: 0, startTime: null },
            duration: 0,
            usage: null,
        };
    }

    updateState(partialState: Partial<DashboardState>): void {
        this.state = { ...this.state, ...partialState };
        this.update();
    }

    private async fetchUsage(): Promise<void> {
        try {
            const usage = await usageProvider.fetch();
            this.state.usage = usage;
            this.update();
        } catch (e) {
            log.warn('Usage fetch failed');
        }
    }

    private startAutoRefresh(): void {
        this.refreshTimer = setInterval(() => {
            this.fetchUsage();
        }, 15000); // 15 seconds
    }

    private handleMessage(message: { command: string; feature?: string; enabled?: boolean; settings?: Record<string, unknown>; silent?: boolean }): void {
        switch (message.command) {
            case 'toggleFeature':
                if (message.feature !== undefined && message.enabled !== undefined) {
                    this.onToggle(message.feature, message.enabled);
                }
                break;
            case 'saveSettings':
                if (message.settings) {
                    this.onSaveSettings(message.settings, message.silent ?? false);
                }
                break;
            case 'refresh':
                this.fetchUsage();
                break;
            case 'openKofi':
                vscode.env.openExternal(vscode.Uri.parse(KOFI_LINK));
                break;
        }
    }

    private update(): void {
        this.syncTogglesFromConfig();
        this.panel.webview.html = this.generateHtml();
    }

    /**
     * Feature toggles are rendered from the configuration, not from a snapshot taken when the panel
     * opened. Otherwise the periodic re-render flips a toggle back while the setting stays changed.
     * (autopilotModeEnabled is the loop's running state and is pushed in through updateState.)
     */
    private syncTogglesFromConfig(): void {
        this.state.autoAllEnabled = config.get('autoAllEnabled');
        this.state.multiTabEnabled = config.get('multiTabEnabled');
        this.state.autoSwitchModels = config.get('autoSwitchModels');
        this.state.autoGitCommit = config.get('autoGitCommit');
        this.state.mcpEnabled = config.get('mcpEnabled');
        this.state.memoryEnabled = config.get('memoryEnabled');
        this.state.codeReviewEnabled = config.get('codeReviewEnabled');
        this.state.voiceControlEnabled = config.get('voiceControlEnabled');
        this.state.multiAgentEnabled = config.get('multiAgentEnabled');
        this.state.notificationsEnabled = config.get('notificationsEnabled');
        this.state.autoTestGeneration = config.get('autoTestGeneration');
    }

    private generateUsageBars(): string {
        if (!this.state.usage?.models?.length) {
            return '<div class="usage-loading">Click Refresh to load usage data</div>';
        }

        return this.state.usage.models
            .map((model) => {
                const remaining = model.remainingPercent || 0;
                const barClass = remaining > 50 ? 'good' : remaining > 20 ? 'warning' : 'critical';
                return `
          <div class="usage-item">
            <div class="usage-header">
              <span class="model-name">${escapeHtml(model.label)}</span>
              <span class="usage-percent ${barClass}">${remaining.toFixed(0)}% left</span>
            </div>
            <div class="meter-container">
              <div class="meter-fill ${barClass}" style="width: ${remaining}%"></div>
            </div>
          </div>
        `;
            })
            .join('');
    }

    private generateHtml(): string {
        const cfg = config.getAll();
        const planBadge = this.state.usage?.plan ? `<span class="plan-badge">${escapeHtml(this.state.usage.plan)}</span>` : '';
        const email = escapeHtml(this.state.usage?.email || '');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Kit Dashboard</title>
    <style>${DASHBOARD_CSS}</style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <div class="header-left">
                <span class="logo">⚡</span>
                <h1>Workflow Kit Dashboard</h1>
            </div>
            <div class="header-right">
                <span class="email">${email}</span>
                ${planBadge}
                <span class="status-badge ${this.state.autopilotModeEnabled ? 'status-running' : 'status-stopped'}">
                    ${this.state.autopilotModeEnabled ? '🚀 RUNNING' : '⏸️ STOPPED'}
                </span>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${this.state.loopCount}</div>
                <div class="stat-label">Loops</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.state.sessionStats.promptsSent}</div>
                <div class="stat-label">Prompts</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.state.sessionStats.modelSwitches}</div>
                <div class="stat-label">Switches</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.state.duration}m</div>
                <div class="stat-label">Duration</div>
            </div>
        </div>
        
        <div class="section">
            <h2>${ICONS.chart} Antigravity Usage</h2>
            ${this.generateUsageBars()}
        </div>
        
        <div class="section">
            <h2>${ICONS.toggles} Features</h2>
            <div class="enable-all-row">
                <button class="btn btn-enable-all" onclick="enableAll()">🚀 Enable All</button>
                <button class="btn btn-secondary" onclick="disableAll()">⏸️ Disable All</button>
            </div>
            ${this.generateToggleRow('Auto-All Mode', 'Automatically accept all file changes and terminal commands - no more clicking Accept buttons', 'autoAll', this.state.autoAllEnabled)}
            ${this.generateToggleRow('Multi-Tab Mode', 'Work across all your open Antigravity conversations simultaneously', 'multiTab', this.state.multiTabEnabled)}
            ${this.generateToggleRow('AI Autonomous Mode (beta)', 'Works through @fix_plan.md on its own: picks a model per task, tries recovery prompts when stuck, and stops when the circuit breaker or exit detector says so', 'autopilotMode', this.state.autopilotModeEnabled)}
            ${this.generateToggleRow('Smart Model Switching', 'Automatically uses Claude for complex problems, Gemini for UI work, and Flash for quick tasks', 'autoSwitchModels', this.state.autoSwitchModels)}
            ${this.generateToggleRow('Auto Git Commit', 'Runs git add -A and git commit every 10 loops of the autonomous loop', 'autoGitCommit', this.state.autoGitCommit)}
        </div>
        
        <div class="section">
            <h2>🧪 Experimental scaffolds</h2>
            <p class="section-note">These switches only store a setting. The modules behind them are not connected to the agent yet.</p>
            ${this.generateToggleRow('MCP tool registry', 'In-process registry of file, terminal, git and diagnostics tools. Not exposed to the agent yet', 'mcpEnabled', this.state.mcpEnabled)}
            ${this.generateToggleRow('Session Memory', 'Storage for session notes. Nothing records to it yet', 'memoryEnabled', this.state.memoryEnabled)}
            ${this.generateToggleRow('Code Review', 'Reserved for automatic review. The Run Code Review command works regardless', 'codeReviewEnabled', this.state.codeReviewEnabled)}
            ${this.generateToggleRow('Voice Control', 'Voice command parser. Speech input is not connected yet', 'voiceControlEnabled', this.state.voiceControlEnabled)}
            ${this.generateToggleRow('Multi-Agent', 'Agent roles and a task queue. Agents do not execute anything yet', 'multiAgentEnabled', this.state.multiAgentEnabled)}
            ${this.generateToggleRow('Notifications', 'Slack/Discord/webhook senders. Nothing sends them yet', 'notificationsEnabled', this.state.notificationsEnabled)}
            ${this.generateToggleRow('Auto Test Gen', 'Reserved for automatic test generation. The Generate Tests command works regardless', 'autoTestGeneration', this.state.autoTestGeneration)}
        </div>
        
        <div class="section">
            <h2>${ICONS.brain} Model Preferences</h2>
            ${this.generateModelSelect('Complex Reasoning', 'preferredModelForReasoning', cfg.preferredModelForReasoning, this.getAllModelOptions())}
            ${this.generateModelSelect('Frontend / UI', 'preferredModelForFrontend', cfg.preferredModelForFrontend, this.getAllModelOptions())}
            ${this.generateModelSelect('Quick Tasks', 'preferredModelForQuick', cfg.preferredModelForQuick, this.getAllModelOptions())}
        </div>
        
        <div class="section">
            <h2>${ICONS.settings} Loop Settings</h2>
            ${this.generateNumberInput('Loop Interval (sec)', 'loopInterval', cfg.loopInterval, 10, 120)}
            ${this.generateNumberInput('Max Loops', 'maxLoopsPerSession', cfg.maxLoopsPerSession, 1, 1000)}
            ${this.generateNumberInput('Poll Frequency (ms)', 'pollFrequency', cfg.pollFrequency, 500, 5000)}
        </div>
        
        <div class="footer">
            <a href="#" class="sponsor-link" onclick="vscode.postMessage({command:'openKofi'})">
                ${ICONS.heart}
                Support on Ko-fi
            </a>
            <button class="btn btn-secondary" onclick="vscode.postMessage({command:'refresh'})">${ICONS.refresh} Refresh</button>
            <button class="btn" onclick="saveSettings()">${ICONS.save} Save</button>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function toggleFeature(feature, enabled) {
            vscode.postMessage({ command: 'toggleFeature', feature, enabled });
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
        
        // Auto-save individual settings on change (silent - no notification)
        function autoSave(key, value) {
            vscode.postMessage({
                command: 'saveSettings',
                settings: { [key]: value },
                silent: true
            });
        }
        
        // Adjust number input value
        function adjustNumber(id, delta, min, max) {
            const input = document.getElementById(id);
            let value = parseInt(input.value) || min;
            value = Math.max(min, Math.min(max, value + delta));
            input.value = value;
            
            autoSave(id, value);
        }
        
        // Clamp value to min/max bounds
        function clampValue(id, min, max) {
            const input = document.getElementById(id);
            let value = parseInt(input.value) || min;
            value = Math.max(min, Math.min(max, value));
            input.value = value;
            autoSave(id, value);
        }
        
        // Enable All Features
        function enableAll() {
            const features = ['autoAll', 'multiTab', 'autopilotMode', 'autoSwitchModels', 'autoGitCommit', 
                'mcpEnabled', 'memoryEnabled', 'codeReviewEnabled', 'voiceControlEnabled', 
                'multiAgentEnabled', 'notificationsEnabled', 'autoTestGeneration'];
            features.forEach(f => toggleFeature(f, true));
        }
        
        // Disable All Features
        function disableAll() {
            const features = ['autoAll', 'multiTab', 'autopilotMode', 'autoSwitchModels', 'autoGitCommit', 
                'mcpEnabled', 'memoryEnabled', 'codeReviewEnabled', 'voiceControlEnabled', 
                'multiAgentEnabled', 'notificationsEnabled', 'autoTestGeneration'];
            features.forEach(f => toggleFeature(f, false));
        }
    </script>
</body>
</html>`;
    }

    private generateToggleRow(title: string, desc: string, id: string, checked: boolean): string {
        return `
      <div class="toggle-row">
        <div class="toggle-info"><h3>${title}</h3><p>${desc}</p></div>
        <label class="toggle">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleFeature('${id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
    }

    private generateModelSelect(label: string, id: string, current: string, options: { value: string; label: string }[]): string {
        const opts = options.map((o) => `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${o.label}</option>`).join('');
        return `<div class="setting-row"><label>${label}</label><select id="${id}" onchange="autoSave('${id}', this.value)">${opts}</select></div>`;
    }

    private generateNumberInput(label: string, id: string, value: number, min: number, max: number): string {
        const minusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        const plusIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

        return `
        <div class="setting-row">
            <label>${label}</label>
            <div class="number-input-container">
                <button type="button" class="number-btn decrement" onclick="adjustNumber('${id}', -1, ${min}, ${max})" title="Decrease">
                    ${minusIcon}
                </button>
                <input type="number" class="number-input" id="${id}" value="${value}" min="${min}" max="${max}" 
                    onchange="autoSave('${id}', parseInt(this.value))"
                    onblur="clampValue('${id}', ${min}, ${max})">
                <button type="button" class="number-btn increment" onclick="adjustNumber('${id}', 1, ${min}, ${max})" title="Increase">
                    ${plusIcon}
                </button>
            </div>
        </div>`;
    }

    /**
     * Get all available model options from MODEL_LABELS
     */
    private getAllModelOptions(): { value: string; label: string }[] {
        return Object.entries(MODEL_LABELS).map(([value, label]) => ({
            value,
            label: label as string
        }));
    }

    dispose(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        DashboardPanel.instance = undefined;
        log.info('Dashboard closed');
    }
}
