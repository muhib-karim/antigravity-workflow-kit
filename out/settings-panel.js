"use strict";
/**
 * Workflow Kit - Settings Panel
 * WebView-based settings panel for configuring Workflow Kit
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsPanel = void 0;
const vscode = __importStar(require("vscode"));
class SettingsPanel {
    constructor(panel, extensionUri) {
        this._disposables = [];
        this._panel = panel;
        this._panel.webview.html = this._getHtmlContent();
        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'saveSettings':
                    this._saveSettings(message.settings);
                    break;
                case 'getSettings':
                    this._sendCurrentSettings();
                    break;
            }
        }, null, this._disposables);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }
    static show(extensionUri) {
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }
        const panel = vscode.window.createWebviewPanel('workflowKitSettings', 'Workflow Kit Settings', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
    }
    _saveSettings(settings) {
        const config = vscode.workspace.getConfiguration('workflowKit');
        Object.keys(settings).forEach(key => {
            config.update(key, settings[key], vscode.ConfigurationTarget.Global);
        });
        vscode.window.showInformationMessage('Workflow Kit settings saved!');
    }
    _sendCurrentSettings() {
        const config = vscode.workspace.getConfiguration('workflowKit');
        this._panel.webview.postMessage({
            command: 'loadSettings',
            settings: {
                enabled: config.get('enabled'),
                preferredModelForReasoning: config.get('preferredModelForReasoning'),
                preferredModelForFrontend: config.get('preferredModelForFrontend'),
                preferredModelForQuick: config.get('preferredModelForQuick'),
                maxLoopsPerSession: config.get('maxLoopsPerSession'),
                pauseBetweenLoops: config.get('pauseBetweenLoops'),
                autoExitOnCompletion: config.get('autoExitOnCompletion'),
                showProgressNotifications: config.get('showProgressNotifications')
            }
        });
    }
    _getHtmlContent() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workflow Kit Settings</title>
    <style>
        :root {
            --bg-primary: #1e1e1e;
            --bg-secondary: #252526;
            --bg-tertiary: #2d2d30;
            --text-primary: #cccccc;
            --text-secondary: #9d9d9d;
            --accent: #0e639c;
            --accent-hover: #1177bb;
            --success: #4ec9b0;
            --warning: #dcdcaa;
            --border: #3c3c3c;
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            padding: 20px;
            line-height: 1.6;
        }
        
        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
        }
        
        .header h1 {
            font-size: 24px;
            font-weight: 600;
        }
        
        .header .badge {
            background: var(--accent);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        
        .section {
            background: var(--bg-secondary);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 16px;
        }
        
        .section h2 {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--success);
        }
        
        .setting-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid var(--border);
        }
        
        .setting-row:last-child {
            border-bottom: none;
        }
        
        .setting-label {
            flex: 1;
        }
        
        .setting-label h3 {
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 4px;
        }
        
        .setting-label p {
            font-size: 12px;
            color: var(--text-secondary);
        }
        
        .setting-control {
            min-width: 200px;
            text-align: right;
        }
        
        select, input[type="number"] {
            background: var(--bg-tertiary);
            border: 1px solid var(--border);
            color: var(--text-primary);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
            width: 100%;
            max-width: 200px;
        }
        
        select:focus, input:focus {
            outline: none;
            border-color: var(--accent);
        }
        
        .toggle {
            position: relative;
            width: 48px;
            height: 24px;
        }
        
        .toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--bg-tertiary);
            border-radius: 24px;
            transition: 0.3s;
        }
        
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: var(--text-secondary);
            border-radius: 50%;
            transition: 0.3s;
        }
        
        .toggle input:checked + .toggle-slider {
            background-color: var(--accent);
        }
        
        .toggle input:checked + .toggle-slider:before {
            transform: translateX(24px);
            background-color: white;
        }
        
        .model-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 12px;
            margin-top: 12px;
        }
        
        .model-card {
            background: var(--bg-tertiary);
            border-radius: 6px;
            padding: 12px;
        }
        
        .model-card h4 {
            font-size: 13px;
            color: var(--warning);
            margin-bottom: 8px;
        }
        
        .save-btn {
            background: var(--accent);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .save-btn:hover {
            background: var(--accent-hover);
        }
        
        .footer {
            margin-top: 24px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ Workflow Kit Settings</h1>
        <span class="badge">Autonomous AI Loop</span>
    </div>
    
    <div class="section">
        <h2>🎛️ General</h2>
        
        <div class="setting-row">
            <div class="setting-label">
                <h3>Enable Autopilot Mode</h3>
                <p>Toggle autonomous AI development mode</p>
            </div>
            <div class="setting-control">
                <label class="toggle">
                    <input type="checkbox" id="enabled">
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-label">
                <h3>Max Loops Per Session</h3>
                <p>Maximum iterations before pausing</p>
            </div>
            <div class="setting-control">
                <input type="number" id="maxLoopsPerSession" min="1" max="1000" value="100">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-label">
                <h3>Pause Between Loops (seconds)</h3>
                <p>Delay between each loop iteration</p>
            </div>
            <div class="setting-control">
                <input type="number" id="pauseBetweenLoops" min="1" max="60" value="5">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-label">
                <h3>Auto Exit on Completion</h3>
                <p>Stop when all @fix_plan.md tasks complete</p>
            </div>
            <div class="setting-control">
                <label class="toggle">
                    <input type="checkbox" id="autoExitOnCompletion" checked>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>🧠 Model Preferences</h2>
        <p style="color: var(--text-secondary); margin-bottom: 16px;">
            Configure which AI model to use for each task type
        </p>
        
        <div class="model-grid">
            <div class="model-card">
                <h4>Complex Reasoning / Debugging</h4>
                <select id="preferredModelForReasoning">
                    <option value="claude-opus-4.5-thinking">Claude Opus 4.5 (Thinking)</option>
                    <option value="claude-sonnet-4.5-thinking">Claude Sonnet 4.5 (Thinking)</option>
                    <option value="claude-sonnet-4.5">Claude Sonnet 4.5</option>
                </select>
            </div>
            
            <div class="model-card">
                <h4>Frontend / UI Work</h4>
                <select id="preferredModelForFrontend">
                    <option value="gemini-3-pro-high">Gemini 3 Pro (High)</option>
                    <option value="gemini-3-pro-low">Gemini 3 Pro (Low)</option>
                    <option value="gemini-3-flash">Gemini 3 Flash</option>
                </select>
            </div>
            
            <div class="model-card">
                <h4>Quick Tasks / Simple Edits</h4>
                <select id="preferredModelForQuick">
                    <option value="gemini-3-flash">Gemini 3 Flash</option>
                    <option value="gemini-3-pro-low">Gemini 3 Pro (Low)</option>
                    <option value="gpt-oss-120b">GPT-OSS 120B</option>
                </select>
            </div>
        </div>
    </div>
    
    <div class="footer">
        <button class="save-btn" onclick="saveSettings()">💾 Save Settings</button>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        // Request current settings on load
        window.addEventListener('load', () => {
            vscode.postMessage({ command: 'getSettings' });
        });
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'loadSettings') {
                const s = message.settings;
                document.getElementById('enabled').checked = s.enabled;
                document.getElementById('maxLoopsPerSession').value = s.maxLoopsPerSession;
                document.getElementById('pauseBetweenLoops').value = s.pauseBetweenLoops;
                document.getElementById('autoExitOnCompletion').checked = s.autoExitOnCompletion;
                document.getElementById('preferredModelForReasoning').value = s.preferredModelForReasoning;
                document.getElementById('preferredModelForFrontend').value = s.preferredModelForFrontend;
                document.getElementById('preferredModelForQuick').value = s.preferredModelForQuick;
            }
        });
        
        function saveSettings() {
            const settings = {
                enabled: document.getElementById('enabled').checked,
                maxLoopsPerSession: parseInt(document.getElementById('maxLoopsPerSession').value),
                pauseBetweenLoops: parseInt(document.getElementById('pauseBetweenLoops').value),
                autoExitOnCompletion: document.getElementById('autoExitOnCompletion').checked,
                preferredModelForReasoning: document.getElementById('preferredModelForReasoning').value,
                preferredModelForFrontend: document.getElementById('preferredModelForFrontend').value,
                preferredModelForQuick: document.getElementById('preferredModelForQuick').value
            };
            
            vscode.postMessage({ command: 'saveSettings', settings });
        }
    </script>
</body>
</html>`;
    }
    dispose() {
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
exports.SettingsPanel = SettingsPanel;
