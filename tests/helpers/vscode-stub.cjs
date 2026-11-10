// CommonJS stand-in for `vscode`, for loading main_scripts/relauncher.js through Node's require
module.exports = {
    env: { appName: 'Antigravity' },
    workspace: { workspaceFolders: [] },
    window: { showInformationMessage: async () => undefined, showErrorMessage: async () => undefined },
    commands: { executeCommand: async () => undefined },
};
