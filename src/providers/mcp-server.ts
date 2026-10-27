/**
 * Antigravity Workflow Kit - MCP Server Implementation
 * Implements Model Context Protocol for AI tool communication
 * @module providers/mcp-server
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const log = createLogger('MCPServer');

// ============ MCP Types ============
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            enum?: string[];
        }>;
        required?: string[];
    };
}

export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

export interface MCPToolCall {
    name: string;
    arguments: Record<string, unknown>;
}

export interface MCPToolResult {
    content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: string;
        mimeType?: string;
    }>;
    isError?: boolean;
}

// ============ MCP Server Class ============
export class MCPServer {
    private workspaceRoot: string | null = null;
    private tools: Map<string, MCPTool> = new Map();
    private resources: Map<string, MCPResource> = new Map();
    private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<MCPToolResult>> = new Map();

    constructor() {
        this.initializeTools();
        this.updateWorkspaceRoot();
    }

    private updateWorkspaceRoot(): void {
        const folders = vscode.workspace.workspaceFolders;
        this.workspaceRoot = folders?.[0]?.uri.fsPath || null;
    }

    // ============ Tool Definitions ============
    private initializeTools(): void {
        // File Operations
        this.registerTool({
            name: 'read_file',
            description: 'Read the contents of a file from the workspace',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to the file from workspace root' },
                    startLine: { type: 'number', description: 'Optional start line (1-indexed)' },
                    endLine: { type: 'number', description: 'Optional end line (1-indexed)' }
                },
                required: ['path']
            }
        }, this.handleReadFile.bind(this));

        this.registerTool({
            name: 'write_file',
            description: 'Write or overwrite content to a file',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to the file' },
                    content: { type: 'string', description: 'Content to write' },
                    createDirectories: { type: 'boolean', description: 'Create parent directories if needed' }
                },
                required: ['path', 'content']
            }
        }, this.handleWriteFile.bind(this));

        this.registerTool({
            name: 'list_directory',
            description: 'List files and folders in a directory',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to directory (empty for root)' },
                    recursive: { type: 'boolean', description: 'Include subdirectories' },
                    pattern: { type: 'string', description: 'Glob pattern to filter files' }
                },
                required: []
            }
        }, this.handleListDirectory.bind(this));

        this.registerTool({
            name: 'search_files',
            description: 'Search for text pattern in files',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query (regex supported)' },
                    path: { type: 'string', description: 'Directory to search in' },
                    filePattern: { type: 'string', description: 'Glob pattern for files to search' },
                    caseSensitive: { type: 'boolean', description: 'Case sensitive search' }
                },
                required: ['query']
            }
        }, this.handleSearchFiles.bind(this));

        // Terminal Operations
        this.registerTool({
            name: 'run_terminal_command',
            description: 'Execute a command in the integrated terminal',
            inputSchema: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to execute' },
                    cwd: { type: 'string', description: 'Working directory (relative to workspace)' }
                },
                required: ['command']
            }
        }, this.handleRunCommand.bind(this));

        // Workspace Operations
        this.registerTool({
            name: 'get_workspace_info',
            description: 'Get information about the current workspace',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }, this.handleGetWorkspaceInfo.bind(this));

        this.registerTool({
            name: 'get_open_editors',
            description: 'Get list of currently open editor tabs',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }, this.handleGetOpenEditors.bind(this));

        this.registerTool({
            name: 'get_diagnostics',
            description: 'Get diagnostic problems (errors, warnings) for the workspace',
            inputSchema: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Optional file path to filter diagnostics' },
                    severity: { type: 'string', description: 'Filter by severity', enum: ['error', 'warning', 'info', 'hint'] }
                },
                required: []
            }
        }, this.handleGetDiagnostics.bind(this));

        // Git Operations
        this.registerTool({
            name: 'git_status',
            description: 'Get current git status of the workspace',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }, this.handleGitStatus.bind(this));

        this.registerTool({
            name: 'git_diff',
            description: 'Get git diff for staged or unstaged changes',
            inputSchema: {
                type: 'object',
                properties: {
                    staged: { type: 'boolean', description: 'Show staged changes only' },
                    path: { type: 'string', description: 'Optional file path to diff' }
                },
                required: []
            }
        }, this.handleGitDiff.bind(this));

        log.info(`Registered ${this.tools.size} MCP tools`);
    }

    // ============ Tool Registration ============
    private registerTool(
        tool: MCPTool,
        handler: (args: Record<string, unknown>) => Promise<MCPToolResult>
    ): void {
        this.tools.set(tool.name, tool);
        this.toolHandlers.set(tool.name, handler);
    }

    // ============ Public API ============
    getTools(): MCPTool[] {
        return Array.from(this.tools.values());
    }

    getResources(): MCPResource[] {
        return Array.from(this.resources.values());
    }

    async callTool(call: MCPToolCall): Promise<MCPToolResult> {
        const handler = this.toolHandlers.get(call.name);
        if (!handler) {
            return {
                content: [{ type: 'text', text: `Unknown tool: ${call.name}` }],
                isError: true
            };
        }

        try {
            log.debug(`Calling tool: ${call.name}`, call.arguments);
            const result = await handler(call.arguments);
            log.debug(`Tool result: ${call.name}`, { success: !result.isError });
            return result;
        } catch (error) {
            log.error(`Tool error: ${call.name}`, { error: (error as Error).message });
            return {
                content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
                isError: true
            };
        }
    }

    // ============ Tool Handlers ============
    private async handleReadFile(args: Record<string, unknown>): Promise<MCPToolResult> {
        const filePath = args.path as string;
        const fullPath = this.resolvePath(filePath);

        if (!fs.existsSync(fullPath)) {
            return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true };
        }

        let content = fs.readFileSync(fullPath, 'utf-8');

        const startLine = args.startLine as number | undefined;
        const endLine = args.endLine as number | undefined;

        if (startLine || endLine) {
            const lines = content.split('\n');
            const start = (startLine || 1) - 1;
            const end = endLine || lines.length;
            content = lines.slice(start, end).join('\n');
        }

        return { content: [{ type: 'text', text: content }] };
    }

    private async handleWriteFile(args: Record<string, unknown>): Promise<MCPToolResult> {
        const filePath = args.path as string;
        const content = args.content as string;
        const createDirs = args.createDirectories as boolean;
        const fullPath = this.resolvePath(filePath);

        if (createDirs) {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        fs.writeFileSync(fullPath, content, 'utf-8');
        return { content: [{ type: 'text', text: `File written: ${filePath}` }] };
    }

    private async handleListDirectory(args: Record<string, unknown>): Promise<MCPToolResult> {
        const dirPath = (args.path as string) || '';
        const recursive = args.recursive as boolean;
        const fullPath = this.resolvePath(dirPath);

        if (!fs.existsSync(fullPath)) {
            return { content: [{ type: 'text', text: `Directory not found: ${dirPath}` }], isError: true };
        }

        const entries = this.listDir(fullPath, recursive, dirPath);
        return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] };
    }

    private listDir(dirPath: string, recursive: boolean, relativePath: string): object[] {
        const entries: object[] = [];
        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;

            const itemPath = path.join(relativePath, item.name);
            const fullItemPath = path.join(dirPath, item.name);

            if (item.isDirectory()) {
                entries.push({ type: 'directory', path: itemPath });
                if (recursive) {
                    entries.push(...this.listDir(fullItemPath, true, itemPath));
                }
            } else {
                const stats = fs.statSync(fullItemPath);
                entries.push({
                    type: 'file',
                    path: itemPath,
                    size: stats.size
                });
            }
        }

        return entries;
    }

    private async handleSearchFiles(args: Record<string, unknown>): Promise<MCPToolResult> {
        const query = args.query as string;
        const searchPath = (args.path as string) || '';
        const caseSensitive = args.caseSensitive as boolean;
        const fullPath = this.resolvePath(searchPath);

        const results: { file: string; line: number; content: string }[] = [];
        const regex = new RegExp(query, caseSensitive ? 'g' : 'gi');

        this.searchInDir(fullPath, regex, searchPath, results);

        return {
            content: [{
                type: 'text',
                text: results.length > 0
                    ? JSON.stringify(results.slice(0, 50), null, 2)
                    : 'No matches found'
            }]
        };
    }

    private searchInDir(
        dirPath: string,
        regex: RegExp,
        relativePath: string,
        results: { file: string; line: number; content: string }[]
    ): void {
        if (!fs.existsSync(dirPath)) return;

        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const item of items) {
            if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist') continue;

            const itemPath = path.join(relativePath, item.name);
            const fullItemPath = path.join(dirPath, item.name);

            if (item.isDirectory()) {
                this.searchInDir(fullItemPath, regex, itemPath, results);
            } else if (item.isFile()) {
                try {
                    const content = fs.readFileSync(fullItemPath, 'utf-8');
                    const lines = content.split('\n');

                    lines.forEach((line, idx) => {
                        if (regex.test(line) && results.length < 50) {
                            results.push({
                                file: itemPath,
                                line: idx + 1,
                                content: line.trim().substring(0, 200)
                            });
                        }
                    });
                } catch { /* Skip binary files */ }
            }
        }
    }

    private async handleRunCommand(args: Record<string, unknown>): Promise<MCPToolResult> {
        const command = args.command as string;
        const cwd = args.cwd as string | undefined;

        const terminal = vscode.window.createTerminal({
            name: 'MCP Command',
            cwd: cwd ? this.resolvePath(cwd) : this.workspaceRoot || undefined
        });

        terminal.show();
        terminal.sendText(command);

        return {
            content: [{
                type: 'text',
                text: `Command sent to terminal: ${command}`
            }]
        };
    }

    private async handleGetWorkspaceInfo(args: Record<string, unknown>): Promise<MCPToolResult> {
        const folders = vscode.workspace.workspaceFolders || [];
        const info = {
            folders: folders.map(f => ({ name: f.name, path: f.uri.fsPath })),
            name: vscode.workspace.name,
            rootPath: this.workspaceRoot,
            configuration: {
                files: vscode.workspace.getConfiguration('files'),
            }
        };

        return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
    }

    private async handleGetOpenEditors(args: Record<string, unknown>): Promise<MCPToolResult> {
        const editors = vscode.window.visibleTextEditors.map(e => ({
            path: vscode.workspace.asRelativePath(e.document.uri),
            languageId: e.document.languageId,
            isDirty: e.document.isDirty,
            lineCount: e.document.lineCount
        }));

        return { content: [{ type: 'text', text: JSON.stringify(editors, null, 2) }] };
    }

    private async handleGetDiagnostics(args: Record<string, unknown>): Promise<MCPToolResult> {
        const filterPath = args.path as string | undefined;
        const filterSeverity = args.severity as string | undefined;

        const diagnostics: { file: string; line: number; message: string; severity: string }[] = [];

        const severityMap: Record<number, string> = {
            0: 'error',
            1: 'warning',
            2: 'info',
            3: 'hint'
        };

        vscode.languages.getDiagnostics().forEach(([uri, diags]) => {
            const relativePath = vscode.workspace.asRelativePath(uri);

            if (filterPath && !relativePath.includes(filterPath)) return;

            diags.forEach(d => {
                const severity = severityMap[d.severity] || 'unknown';
                if (filterSeverity && severity !== filterSeverity) return;

                diagnostics.push({
                    file: relativePath,
                    line: d.range.start.line + 1,
                    message: d.message,
                    severity
                });
            });
        });

        return { content: [{ type: 'text', text: JSON.stringify(diagnostics, null, 2) }] };
    }

    private async handleGitStatus(args: Record<string, unknown>): Promise<MCPToolResult> {
        const { exec } = require('child_process');

        return new Promise((resolve) => {
            exec('git status --porcelain', { cwd: this.workspaceRoot }, (error: Error | null, stdout: string) => {
                if (error) {
                    resolve({ content: [{ type: 'text', text: 'Not a git repository' }], isError: true });
                    return;
                }

                const files = stdout.trim().split('\n').filter(Boolean).map(line => {
                    const status = line.substring(0, 2).trim();
                    const file = line.substring(3);
                    return { status, file };
                });

                resolve({ content: [{ type: 'text', text: JSON.stringify(files, null, 2) }] });
            });
        });
    }

    private async handleGitDiff(args: Record<string, unknown>): Promise<MCPToolResult> {
        const { exec } = require('child_process');
        const staged = args.staged as boolean;
        const filePath = args.path as string | undefined;

        let command = 'git diff';
        if (staged) command += ' --staged';
        if (filePath) command += ` -- "${filePath}"`;

        return new Promise((resolve) => {
            exec(command, { cwd: this.workspaceRoot, maxBuffer: 1024 * 1024 }, (error: Error | null, stdout: string) => {
                if (error) {
                    resolve({ content: [{ type: 'text', text: `Git error: ${error.message}` }], isError: true });
                    return;
                }

                resolve({ content: [{ type: 'text', text: stdout || 'No changes' }] });
            });
        });
    }

    // ============ Utility ============
    private resolvePath(relativePath: string): string {
        if (path.isAbsolute(relativePath)) return relativePath;
        return path.join(this.workspaceRoot || '', relativePath);
    }
}

// Singleton export
export const mcpServer = new MCPServer();
