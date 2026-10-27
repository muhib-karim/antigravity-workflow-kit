/**
 * Workflow Kit - Settings Panel
 * WebView-based settings panel for configuring Workflow Kit
 */
import * as vscode from 'vscode';
export declare class SettingsPanel {
    static currentPanel: SettingsPanel | undefined;
    private readonly _panel;
    private _disposables;
    private constructor();
    static show(extensionUri: vscode.Uri): void;
    private _saveSettings;
    private _sendCurrentSettings;
    private _getHtmlContent;
    dispose(): void;
}
