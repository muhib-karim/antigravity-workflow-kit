/**
 * Antigravity Workflow Kit - Voice Controller
 * Voice command integration for hands-free control
 * @module ui/voice-controller
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const log = createLogger('VoiceController');

// ============ Types ============
export interface VoiceCommand {
    patterns: RegExp[];
    action: string;
    description: string;
    handler: (matches: RegExpMatchArray) => Promise<void>;
}

export interface VoiceConfig {
    enabled: boolean;
    language: string;
    wakeWord?: string;
    confirmActions: boolean;
}

// ============ Voice Controller Class ============
export class VoiceController {
    private commands: VoiceCommand[] = [];
    private config: VoiceConfig = {
        enabled: false,
        language: 'en-US',
        wakeWord: 'workflowKit',
        confirmActions: true
    };
    private isListening = false;

    constructor() {
        this.initializeCommands();
    }

    // ============ Command Registration ============
    private initializeCommands(): void {
        // Extension Control Commands
        this.registerCommand({
            patterns: [
                /(?:start|enable|turn on)\s+(?:auto[- ]?all|automation)/i,
                /(?:autopilot\s+)?auto[- ]?all\s+on/i
            ],
            action: 'workflowKit.toggleAutoAll',
            description: 'Enable Auto-All mode',
            handler: async () => {
                await vscode.commands.executeCommand('workflowKit.toggleAutoAll');
            }
        });

        this.registerCommand({
            patterns: [
                /(?:stop|disable|turn off)\s+(?:auto[- ]?all|automation)/i,
                /(?:autopilot\s+)?auto[- ]?all\s+off/i
            ],
            action: 'workflowKit.toggleAutoAll',
            description: 'Disable Auto-All mode',
            handler: async () => {
                await vscode.commands.executeCommand('workflowKit.toggleAutoAll');
            }
        });

        this.registerCommand({
            patterns: [
                /(?:start|enable|begin)\s+(?:autonomous|autopilot)\s*(?:mode|loop)?/i,
                /(?:autopilot\s+)?(?:start|go)\s+autonomous/i
            ],
            action: 'workflowKit.toggleAutopilotMode',
            description: 'Start autonomous mode',
            handler: async () => {
                await vscode.commands.executeCommand('workflowKit.toggleAutopilotMode');
            }
        });

        this.registerCommand({
            patterns: [
                /(?:stop|end|disable)\s+(?:autonomous|autopilot)\s*(?:mode|loop)?/i,
                /(?:autopilot\s+)?stop/i
            ],
            action: 'workflowKit.toggleAutopilotMode',
            description: 'Stop autonomous mode',
            handler: async () => {
                await vscode.commands.executeCommand('workflowKit.toggleAutopilotMode');
            }
        });

        // Model Switching Commands
        this.registerCommand({
            patterns: [
                /(?:switch|change|use)\s+(?:to\s+)?(?:claude|opus)/i,
                /(?:autopilot\s+)?use\s+claude/i
            ],
            action: 'switchModel:claude',
            description: 'Switch to Claude model',
            handler: async () => {
                await this.switchModel('claude-opus-4.5-thinking');
            }
        });

        this.registerCommand({
            patterns: [
                /(?:switch|change|use)\s+(?:to\s+)?(?:gemini|google)/i,
                /(?:autopilot\s+)?use\s+gemini/i
            ],
            action: 'switchModel:gemini',
            description: 'Switch to Gemini model',
            handler: async () => {
                await this.switchModel('gemini-3-pro-high');
            }
        });

        this.registerCommand({
            patterns: [
                /(?:switch|change|use)\s+(?:to\s+)?(?:flash|fast|quick)/i,
                /(?:autopilot\s+)?use\s+flash/i
            ],
            action: 'switchModel:flash',
            description: 'Switch to fast model',
            handler: async () => {
                await this.switchModel('gemini-3-flash');
            }
        });

        // Dashboard Commands
        this.registerCommand({
            patterns: [
                /(?:open|show)\s+(?:dashboard|settings|config)/i,
                /(?:autopilot\s+)?settings/i
            ],
            action: 'workflowKit.openSettings',
            description: 'Open dashboard',
            handler: async () => {
                await vscode.commands.executeCommand('workflowKit.openSettings');
            }
        });

        // Status Commands
        this.registerCommand({
            patterns: [
                /(?:what(?:'s| is)\s+)?(?:the\s+)?status/i,
                /(?:autopilot\s+)?status(?:\s+report)?/i
            ],
            action: 'status',
            description: 'Report current status',
            handler: async () => {
                await this.reportStatus();
            }
        });

        // Help Command
        this.registerCommand({
            patterns: [
                /(?:what\s+can\s+you\s+do|help|commands)/i,
                /(?:autopilot\s+)?help/i
            ],
            action: 'help',
            description: 'List available commands',
            handler: async () => {
                await this.showHelp();
            }
        });

        log.info(`Registered ${this.commands.length} voice commands`);
    }

    private registerCommand(command: VoiceCommand): void {
        this.commands.push(command);
    }

    // ============ Voice Processing ============
    async processVoiceInput(transcript: string): Promise<boolean> {
        log.debug(`Processing voice input: "${transcript}"`);

        const normalizedInput = transcript.toLowerCase().trim();

        // Check for wake word if configured
        if (this.config.wakeWord && !normalizedInput.includes(this.config.wakeWord)) {
            log.debug('Wake word not detected, ignoring');
            return false;
        }

        // Try to match a command
        for (const command of this.commands) {
            for (const pattern of command.patterns) {
                const match = normalizedInput.match(pattern);
                if (match) {
                    log.info(`Matched command: ${command.action}`);

                    if (this.config.confirmActions) {
                        const confirmed = await this.confirmAction(command.description);
                        if (!confirmed) {
                            log.info('User cancelled action');
                            return false;
                        }
                    }

                    await command.handler(match);
                    return true;
                }
            }
        }

        log.debug('No command matched');
        vscode.window.showWarningMessage(`Voice command not recognized: "${transcript}"`);
        return false;
    }

    // ============ VS Code Speech Integration ============
    async startListening(): Promise<void> {
        if (this.isListening) return;

        try {
            // Check if VS Code Speech extension is available
            const speechExtension = vscode.extensions.getExtension('ms-vscode.vscode-speech');

            if (!speechExtension) {
                vscode.window.showWarningMessage(
                    'VS Code Speech extension not found. Install it for voice control.',
                    'Install'
                ).then(action => {
                    if (action === 'Install') {
                        vscode.commands.executeCommand(
                            'workbench.extensions.installExtension',
                            'ms-vscode.vscode-speech'
                        );
                    }
                });
                return;
            }

            this.isListening = true;
            log.info('Voice listening started');

            vscode.window.showInformationMessage('🎤 Workflow Kit Voice Control: Listening...');

            // Note: Actual speech integration would use VS Code Speech API
            // This is a placeholder for the integration point

        } catch (error) {
            log.error('Failed to start voice listening', { error: (error as Error).message });
            this.isListening = false;
        }
    }

    async stopListening(): Promise<void> {
        this.isListening = false;
        log.info('Voice listening stopped');
        vscode.window.showInformationMessage('🔇 Workflow Kit Voice Control: Stopped');
    }

    // ============ Command Handlers ============
    private async switchModel(modelId: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('workflowKit');

        // Determine which setting to update based on model type
        if (modelId.includes('claude')) {
            await config.update('preferredModelForReasoning', modelId, true);
        } else if (modelId.includes('flash')) {
            await config.update('preferredModelForQuick', modelId, true);
        } else {
            await config.update('preferredModelForFrontend', modelId, true);
        }

        vscode.window.showInformationMessage(`🔄 Switched to model: ${modelId}`);
    }

    private async reportStatus(): Promise<void> {
        const config = vscode.workspace.getConfiguration('workflowKit');

        const autoAll = config.get('autoAllEnabled') ? '✅' : '❌';
        const multiTab = config.get('multiTabEnabled') ? '✅' : '❌';
        const autonomous = config.get('autopilotModeEnabled') ? '✅' : '❌';

        const status = [
            `🤖 Workflow Kit Status:`,
            `Auto-All: ${autoAll}`,
            `Multi-Tab: ${multiTab}`,
            `Autonomous: ${autonomous}`
        ].join('\n');

        vscode.window.showInformationMessage(status);
    }

    private async showHelp(): Promise<void> {
        const helpText = this.commands
            .map(c => `• "${c.patterns[0].source.replace(/[\\^$.*+?()[\]{}|]/g, '')}" - ${c.description}`)
            .join('\n');

        const panel = vscode.window.createWebviewPanel(
            'workflowKitVoiceHelp',
            'Workflow Kit Voice Commands',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: system-ui; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
                    h1 { color: #7c3aed; }
                    ul { list-style: none; padding: 0; }
                    li { padding: 8px 0; border-bottom: 1px solid #333; }
                    .command { color: #4ade80; font-family: monospace; }
                    .desc { color: #a1a1aa; }
                </style>
            </head>
            <body>
                <h1>🎤 Workflow Kit Voice Commands</h1>
                <p>Say these commands to control Workflow Kit:</p>
                <ul>
                    ${this.commands.map(c => `
                        <li>
                            <span class="command">"${c.patterns[0].source.replace(/[\\^$.*+?()[\]{}|]/g, '').replace(/\\/g, '')}"</span>
                            <br><span class="desc">${c.description}</span>
                        </li>
                    `).join('')}
                </ul>
                <p><em>Tip: Use wake word "Workflow Kit" before commands for better recognition.</em></p>
            </body>
            </html>
        `;
    }

    private async confirmAction(description: string): Promise<boolean> {
        const result = await vscode.window.showQuickPick(
            ['Yes', 'No'],
            { placeHolder: `Execute: ${description}?` }
        );
        return result === 'Yes';
    }

    // ============ Configuration ============
    setConfig(config: Partial<VoiceConfig>): void {
        this.config = { ...this.config, ...config };
        log.info('Voice config updated', { config: this.config as unknown as Record<string, unknown> });
    }

    getConfig(): VoiceConfig {
        return { ...this.config };
    }

    isEnabled(): boolean {
        return this.config.enabled;
    }

    // ============ Command List ============
    getAvailableCommands(): Array<{ action: string; description: string; examples: string[] }> {
        return this.commands.map(c => ({
            action: c.action,
            description: c.description,
            examples: c.patterns.map(p => p.source.replace(/[\\^$.*+?()[\]{}|]/g, ''))
        }));
    }
}

// Singleton export
export const voiceController = new VoiceController();
