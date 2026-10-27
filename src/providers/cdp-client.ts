/**
 * Antigravity Workflow Kit - CDP Client
 * Controls Antigravity browser via Chrome DevTools Protocol
 * @module providers/cdp-client
 */

import * as http from 'http';
import WebSocket from 'ws';
import { createLogger } from '../utils/logger';

const log = createLogger('CDPClient');

const CDP_PORT_MIN = 9000;
const CDP_PORT_MAX = 9030;

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
    private pendingMessages: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
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
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                this.connected = true;
                resolve();
            });

            this.ws.on('message', (data) => {
                try {
                    const msg: CDPMessage = JSON.parse(data.toString());
                    const pending = this.pendingMessages.get(msg.id);
                    if (pending) {
                        this.pendingMessages.delete(msg.id);
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

            this.ws.on('error', reject);
            this.ws.on('close', () => {
                this.connected = false;
            });

            setTimeout(() => reject(new Error('Connection timeout')), 5000);
        });
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

            this.pendingMessages.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(message));

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingMessages.has(id)) {
                    this.pendingMessages.delete(id);
                    reject(new Error('Timeout'));
                }
            }, 30000);
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
     * Switch model in Antigravity
     */
    async switchModel(modelId: string): Promise<boolean> {
        if (!this.connected) return false;

        try {
            const result = await this.evaluate(`
        (function() {
          // Find model selector
          const selector = document.querySelector('[data-testid="model-selector"], .model-dropdown, button[aria-label*="model"]');
          if (!selector) return { success: false, error: 'No model selector' };
          
          // Click to open
          selector.click();
          
          // Wait and find model option
          setTimeout(() => {
            const options = document.querySelectorAll('[role="option"], .model-option, li[data-model]');
            for (const opt of options) {
              if (opt.textContent?.toLowerCase().includes('${modelId.toLowerCase()}')) {
                (opt as HTMLElement).click();
                return;
              }
            }
          }, 500);
          
          return { success: true };
        })()
      `) as { success: boolean };

            return result?.success || false;
        } catch {
            return false;
        }
    }

    /**
     * Click Accept buttons (auto-all)
     */
    async clickAcceptButtons(): Promise<number> {
        if (!this.connected) return 0;

        try {
            const count = await this.evaluate(`
        (function() {
          let clicked = 0;
          const buttons = document.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || '';
            if (text.includes('accept') || text.includes('approve') || text.includes('run')) {
              btn.click();
              clicked++;
            }
          }
          return clicked;
        })()
      `) as number;

            if (count > 0) {
                log.info(`Clicked ${count} accept buttons`);
            }
            return count || 0;
        } catch {
            return 0;
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
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.pendingMessages.clear();
    }

    private wait(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }
}

export const cdpClient = new CDPClient();
