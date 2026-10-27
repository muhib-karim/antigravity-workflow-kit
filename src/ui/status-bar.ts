/**
 * Antigravity Workflow Kit - Status Bar Manager
 * Manages status bar items - simplified to main toggle + settings
 * @module ui/status-bar
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const log = createLogger('StatusBar');

export interface StatusBarState {
    autoAllEnabled: boolean;
    multiTabEnabled: boolean;
    autopilotModeEnabled: boolean;
    loopCount: number;
}

export class StatusBarManager {
    private statusMain: vscode.StatusBarItem;
    private statusSettings: vscode.StatusBarItem;
    private disposed = false;

    constructor(context: vscode.ExtensionContext) {
        // Main Workflow Kit toggle (controls Auto-All)
        this.statusMain = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            101
        );
        this.statusMain.command = 'workflowKit.toggleExtension';
        context.subscriptions.push(this.statusMain);

        // Settings Gear
        this.statusSettings = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusSettings.command = 'workflowKit.openSettings';
        this.statusSettings.text = '$(gear)';
        this.statusSettings.tooltip = 'Open Workflow Kit Dashboard';
        context.subscriptions.push(this.statusSettings);

        // Show initial state
        this.statusMain.show();
        this.statusSettings.show();

        log.info('Status bar initialized (simplified)');
    }

    update(state: StatusBarState): void {
        if (this.disposed) return;

        // Main toggle - shows extension state
        if (state.autopilotModeEnabled) {
            // Autonomous mode is running
            this.statusMain.text = `$(sync~spin) Workflow Kit #${state.loopCount}`;
            this.statusMain.tooltip = 'Autonomous running - Click to toggle extension';
            this.statusMain.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.prominentBackground'
            );
        } else if (state.autoAllEnabled) {
            // Extension enabled (auto-accept active)
            this.statusMain.text = '$(check) Workflow Kit: ON';
            this.statusMain.tooltip = 'Auto-accept enabled - Click to disable';
            this.statusMain.backgroundColor = undefined;
        } else {
            // Extension disabled
            this.statusMain.text = '$(circle-slash) Workflow Kit: OFF';
            this.statusMain.tooltip = 'Click to enable Workflow Kit auto-accept';
            this.statusMain.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        }
    }

    dispose(): void {
        this.disposed = true;
        this.statusMain.dispose();
        this.statusSettings.dispose();
    }
}
