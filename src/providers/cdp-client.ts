/**
 * Antigravity Workflow Kit - CDP Client
 * Controls Antigravity browser via Chrome DevTools Protocol
 * @module providers/cdp-client
 */

import * as http from 'http';
import WebSocket from 'ws';
import { createLogger } from '../utils/logger';
import { MODEL_LABELS, CDP_PORT_MIN, CDP_PORT_MAX } from '../utils/constants';

const log = createLogger('CDPClient');

const CONNECT_TIMEOUT_MS = 5000;
const COMMAND_TIMEOUT_MS = 30000;

interface CDPTarget {
    id: string;
    type: string;
    title: string;
    url: string;
    webSocketDebuggerUrl: string;
}

interface CDPMessage {
    id: number;
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
    error?: { message: string };
}

export class CDPClient {
    private ws: WebSocket | null = null;
    private messageId = 0;
    private pendingMessages: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = new Map();
    private port: number | null = null;
    private connected = false;

    /**
     * Find Antigravity and connect to it
     */
    async connect(): Promise<boolean> {
        // Try each port
        for (let port = CDP_PORT_MIN; port <= CDP_PORT_MAX; port++) {
            try {
                const targets = await this.getTargets(port);
                const antigravityTarget = targets.find(t =>
                    t.type === 'page' &&
                    (t.url.includes('antigravity') || t.title.toLowerCase().includes('antigravity'))
                );

                if (antigravityTarget && antigravityTarget.webSocketDebuggerUrl) {
                    await this.connectToTarget(antigravityTarget.webSocketDebuggerUrl);
                    this.port = port;
                    log.info(`Connected to Antigravity on port ${port}`);
                    return true;
                }
            } catch {
                // Try next port
            }
        }

        log.warn('Could not find Antigravity browser');
        return false;
    }

    /**
     * Get available CDP targets on a port
     */
    private getTargets(port: number): Promise<CDPTarget[]> {
        return new Promise((resolve, reject) => {
            const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        reject(new Error('Invalid JSON'));
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(2000, () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
        });
    }

    /**
     * Connect WebSocket to target
     */
    private connectToTarget(wsUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Replace any previous socket; its late events are ignored below
            this.dropSocket('Reconnecting');
            const ws = new WebSocket(wsUrl);
            this.ws = ws;

            const timeout = setTimeout(() => {
                // Do not leave a half-open socket behind
                if (this.ws === ws) this.dropSocket('Connection timeout');
                else ws.terminate();
                reject(new Error('Connection timeout'));
            }, CONNECT_TIMEOUT_MS);

            ws.on('open', () => {
                clearTimeout(timeout);
                if (this.ws !== ws) return; // superseded while connecting
                this.connected = true;
                resolve();
            });

            ws.on('message', (data) => {
                try {
                    const msg: CDPMessage = JSON.parse(data.toString());
                    const pending = this.pendingMessages.get(msg.id);
                    if (pending) {
                        this.pendingMessages.delete(msg.id);
                        clearTimeout(pending.timer);
                        if (msg.error) {
                            pending.reject(new Error(msg.error.message));
                        } else {
                            pending.resolve(msg.result);
                        }
                    }
                } catch {
                    // Ignore parse errors
                }
            });

            ws.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
            ws.on('close', () => {
                clearTimeout(timeout);
                if (this.ws !== ws) return; // an old socket closing must not mark the new one as down
                this.ws = null;
                this.connected = false;
                this.rejectPending('Connection closed');
            });
        });
    }

    /**
     * Close the current socket (if any) and fail whatever was waiting on it
     */
    private dropSocket(reason: string): void {
        const ws = this.ws;
        this.ws = null;
        this.connected = false;
        if (ws) {
            try {
                // terminate() also works on a socket that is still connecting
                ws.terminate();
            } catch {
                // already gone
            }
        }
        this.rejectPending(reason);
    }

    /**
     * Fail every command that is still waiting for a reply, so callers do not hang
     */
    private rejectPending(reason: string): void {
        for (const [id, pending] of this.pendingMessages) {
            clearTimeout(pending.timer);
            this.pendingMessages.delete(id);
            pending.reject(new Error(reason));
        }
    }

    /**
     * Send CDP command and wait for response
     */
    private send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
        return new Promise((resolve, reject) => {
            if (!this.ws || !this.connected) {
                reject(new Error('Not connected'));
                return;
            }

            const id = ++this.messageId;
            const message: CDPMessage = { id, method, params };

            const timer = setTimeout(() => {
                if (this.pendingMessages.has(id)) {
                    this.pendingMessages.delete(id);
                    reject(new Error('Timeout'));
                }
            }, COMMAND_TIMEOUT_MS);

            this.pendingMessages.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify(message));
        });
    }

    /**
     * Execute JavaScript in the page
     */
    async evaluate(expression: string): Promise<unknown> {
        const result = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        }) as { result?: { value?: unknown } };
        return result?.result?.value;
    }

    /**
     * Inject prompt into Antigravity chat input
     */
    async injectPrompt(prompt: string): Promise<boolean> {
        if (!this.connected) {
            const connected = await this.connect();
            if (!connected) return false;
        }

        try {
            // Find chat input and set value
            const escaped = prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

            const result = await this.evaluate(`
        (function() {
          // Find the chat textarea
          const textarea = document.querySelector('textarea[placeholder*="message"], textarea[data-testid="chat-input"], .chat-input textarea');
          if (!textarea) return { success: false, error: 'No textarea found' };
          
          // Set value
          textarea.value = \`${escaped}\`;
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          
          // Find and click send button
          const sendBtn = document.querySelector('button[type="submit"], button[aria-label*="send"], button[data-testid="send-button"]');
          if (sendBtn) {
            sendBtn.click();
            return { success: true };
          }
          
          // Try keyboard Enter
          textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return { success: true };
        })()
      `) as { success: boolean; error?: string };

            if (result?.success) {
                log.info('Prompt injected');
                return true;
            }
            log.warn(`Inject failed: ${result?.error}`);
            return false;
        } catch (err) {
            log.error(`Inject error: ${(err as Error).message}`);
            return false;
        }
    }

    /**
     * Wait for AI response to complete
     */
    async waitForResponse(timeoutMs = 120000): Promise<string> {
        if (!this.connected) return '';

        const startTime = Date.now();
        let lastResponse = '';
        let stableCount = 0;

        while (Date.now() - startTime < timeoutMs) {
            if (!this.connected) {
                // Polling a dead connection until the timeout (15 minutes by default) helps nobody
                log.warn('Connection lost while waiting for a response');
                return lastResponse;
            }

            try {
                const response = await this.evaluate(`
          (function() {
            // Get the last AI message
            const messages = document.querySelectorAll('[data-message-author="assistant"], .message.assistant, .ai-response');
            if (messages.length === 0) return '';
            const lastMsg = messages[messages.length - 1];
            return lastMsg.textContent || '';
          })()
        `) as string;

                // Check if response is stable (same for 3 checks)
                if (response && response === lastResponse) {
                    stableCount++;
                    if (stableCount >= 3) {
                        // Check if AI is still generating
                        const isGenerating = await this.evaluate(`
              document.querySelector('.generating, .loading, [data-loading="true"]') !== null
            `);
                        if (!isGenerating) {
                            return response;
                        }
                    }
                } else {
                    stableCount = 0;
                    lastResponse = response || '';
                }

                // Wait before next check
                await this.wait(2000);
            } catch {
                await this.wait(2000);
            }
        }

        return lastResponse;
    }

    /**
     * Select a model in Antigravity's model picker.
     * Returns true only when the model is selected (or already was).
     */
    async switchModel(modelId: string): Promise<boolean> {
        if (!this.connected) return false;

        // The picker shows display names ("Gemini 3 Flash"), not ids ("gemini-3-flash")
        const label = (MODEL_LABELS[modelId] || modelId).toLowerCase();

        try {
            // Plain JavaScript only: this string is evaluated in the editor page.
            const result = await this.evaluate(`
        (async function() {
          const wanted = ${JSON.stringify(label)};
          const selector = document.querySelector('[data-testid="model-selector"], .model-dropdown, button[aria-label*="model"]');
          if (!selector) return { success: false, error: 'No model selector' };
          if ((selector.textContent || '').toLowerCase().includes(wanted)) return { success: true };

          // Open the picker and give it a moment to render its options
          selector.click();
          await new Promise((resolve) => setTimeout(resolve, 500));

          const options = document.querySelectorAll('[role="option"], .model-option, li[data-model]');
          for (const opt of options) {
            if ((opt.textContent || '').toLowerCase().includes(wanted)) {
              opt.click();
              return { success: true };
            }
          }

          // Not offered: close the picker again
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return { success: false, error: 'Model not found in the picker' };
        })()
      `) as { success: boolean; error?: string } | undefined;

            if (!result?.success) {
                log.warn(`Model switch to ${modelId} failed: ${result?.error || 'no result'}`);
            }
            return result?.success || false;
        } catch {
            return false;
        }
    }

    /**
     * Get current model name
     */
    async getCurrentModel(): Promise<string> {
        if (!this.connected) return 'unknown';

        try {
            const model = await this.evaluate(`
        (function() {
          const selector = document.querySelector('[data-testid="model-selector"], .model-name, .current-model');
          return selector?.textContent || 'unknown';
        })()
      `) as string;
            return model || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Disconnect
     */
    disconnect(): void {
        this.dropSocket('Disconnected');
    }

    private wait(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }
}

export const cdpClient = new CDPClient();
