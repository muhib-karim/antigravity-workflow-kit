/**
 * Antigravity Workflow Kit - Model Provider
 * Custom model provider support for multiple AI backends
 * @module providers/model-provider
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { ModelId, MODEL_LABELS } from '../utils/constants';

const log = createLogger('ModelProvider');

// ============ Types ============
export interface ModelProvider {
    id: string;
    name: string;
    type: 'cloud' | 'local' | 'custom';
    baseUrl: string;
    apiKey?: string;
    models: ModelDefinition[];
    enabled: boolean;
    rateLimits?: RateLimits;
}

export interface ModelDefinition {
    id: string;
    name: string;
    contextWindow: number;
    maxOutputTokens: number;
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
    capabilities: ModelCapability[];
}

export type ModelCapability =
    | 'code-generation'
    | 'code-completion'
    | 'reasoning'
    | 'vision'
    | 'tool-use'
    | 'long-context';

export interface RateLimits {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay?: number;
}

export interface ModelRequest {
    model: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
}

export interface ModelResponse {
    id: string;
    model: string;
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
    latencyMs: number;
}

export interface ModelUsageStats {
    providerId: string;
    modelId: string;
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
    averageLatency: number;
    errors: number;
    lastUsed: number;
}

// ============ Built-in Provider Definitions ============
const BUILTIN_PROVIDERS: Omit<ModelProvider, 'apiKey'>[] = [
    {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'cloud',
        baseUrl: 'https://api.anthropic.com/v1',
        enabled: true,
        models: [
            {
                id: 'claude-opus-4.5-thinking',
                name: 'Claude Opus 4.5 (Thinking)',
                contextWindow: 200000,
                maxOutputTokens: 8192,
                inputPricePerMillion: 15,
                outputPricePerMillion: 75,
                capabilities: ['code-generation', 'reasoning', 'tool-use', 'long-context']
            },
            {
                id: 'claude-sonnet-4.5',
                name: 'Claude Sonnet 4.5',
                contextWindow: 200000,
                maxOutputTokens: 8192,
                inputPricePerMillion: 3,
                outputPricePerMillion: 15,
                capabilities: ['code-generation', 'reasoning', 'tool-use']
            }
        ],
        rateLimits: {
            requestsPerMinute: 50,
            tokensPerMinute: 100000
        }
    },
    {
        id: 'google',
        name: 'Google AI',
        type: 'cloud',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        enabled: true,
        models: [
            {
                id: 'gemini-3-pro-high',
                name: 'Gemini 3 Pro (High)',
                contextWindow: 1000000,
                maxOutputTokens: 8192,
                inputPricePerMillion: 1.25,
                outputPricePerMillion: 5,
                capabilities: ['code-generation', 'reasoning', 'vision', 'long-context']
            },
            {
                id: 'gemini-3-flash',
                name: 'Gemini 3 Flash',
                contextWindow: 1000000,
                maxOutputTokens: 8192,
                inputPricePerMillion: 0.075,
                outputPricePerMillion: 0.3,
                capabilities: ['code-generation', 'code-completion']
            }
        ],
        rateLimits: {
            requestsPerMinute: 60,
            tokensPerMinute: 1000000
        }
    },
    {
        id: 'openai',
        name: 'OpenAI',
        type: 'cloud',
        baseUrl: 'https://api.openai.com/v1',
        enabled: false,
        models: [
            {
                id: 'gpt-4-turbo',
                name: 'GPT-4 Turbo',
                contextWindow: 128000,
                maxOutputTokens: 4096,
                inputPricePerMillion: 10,
                outputPricePerMillion: 30,
                capabilities: ['code-generation', 'reasoning', 'vision']
            },
            {
                id: 'gpt-4o',
                name: 'GPT-4o',
                contextWindow: 128000,
                maxOutputTokens: 16384,
                inputPricePerMillion: 5,
                outputPricePerMillion: 15,
                capabilities: ['code-generation', 'reasoning', 'vision', 'tool-use']
            }
        ],
        rateLimits: {
            requestsPerMinute: 60,
            tokensPerMinute: 150000
        }
    },
    {
        id: 'ollama',
        name: 'Ollama (Local)',
        type: 'local',
        baseUrl: 'http://localhost:11434/api',
        enabled: false,
        models: [
            {
                id: 'codellama:34b',
                name: 'Code Llama 34B',
                contextWindow: 16384,
                maxOutputTokens: 4096,
                capabilities: ['code-generation', 'code-completion']
            },
            {
                id: 'deepseek-coder:33b',
                name: 'DeepSeek Coder 33B',
                contextWindow: 16384,
                maxOutputTokens: 4096,
                capabilities: ['code-generation', 'code-completion']
            }
        ]
    }
];

// ============ Model Provider Manager Class ============
export class ModelProviderManager {
    private providers: Map<string, ModelProvider> = new Map();
    private usageStats: Map<string, ModelUsageStats> = new Map();
    private activeProvider: string | null = null;
    private requestQueue: Array<{ request: ModelRequest; resolve: Function; reject: Function }> = [];
    private isProcessingQueue = false;

    constructor() {
        this.initializeBuiltinProviders();
    }

    private initializeBuiltinProviders(): void {
        for (const provider of BUILTIN_PROVIDERS) {
            this.providers.set(provider.id, { ...provider, apiKey: undefined });
        }
        log.info(`Initialized ${this.providers.size} model providers`);
    }

    // ============ Provider Management ============
    getProviders(): ModelProvider[] {
        return Array.from(this.providers.values());
    }

    getProvider(id: string): ModelProvider | undefined {
        return this.providers.get(id);
    }

    addProvider(provider: ModelProvider): void {
        this.providers.set(provider.id, provider);
        log.info(`Added model provider: ${provider.name}`);
    }

    removeProvider(id: string): boolean {
        const result = this.providers.delete(id);
        if (result) {
            log.info(`Removed model provider: ${id}`);
        }
        return result;
    }

    setProviderApiKey(providerId: string, apiKey: string): boolean {
        const provider = this.providers.get(providerId);
        if (provider) {
            provider.apiKey = apiKey;
            log.info(`Set API key for provider: ${providerId}`);
            return true;
        }
        return false;
    }

    enableProvider(providerId: string, enabled: boolean): boolean {
        const provider = this.providers.get(providerId);
        if (provider) {
            provider.enabled = enabled;
            log.info(`Provider ${providerId} ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        }
        return false;
    }

    // ============ Model Lookup ============
    getAllModels(): Array<{ provider: string; model: ModelDefinition }> {
        const models: Array<{ provider: string; model: ModelDefinition }> = [];

        for (const provider of this.providers.values()) {
            if (provider.enabled) {
                for (const model of provider.models) {
                    models.push({ provider: provider.id, model });
                }
            }
        }

        return models;
    }

    findModel(modelId: string): { provider: ModelProvider; model: ModelDefinition } | null {
        for (const provider of this.providers.values()) {
            const model = provider.models.find(m => m.id === modelId);
            if (model) {
                return { provider, model };
            }
        }
        return null;
    }

    getModelsWithCapability(capability: ModelCapability): ModelDefinition[] {
        const models: ModelDefinition[] = [];

        for (const provider of this.providers.values()) {
            if (provider.enabled) {
                for (const model of provider.models) {
                    if (model.capabilities.includes(capability)) {
                        models.push(model);
                    }
                }
            }
        }

        return models;
    }

    // ============ API Calls ============
    async callModel(request: ModelRequest): Promise<ModelResponse> {
        const start = Date.now();
        const found = this.findModel(request.model);

        if (!found) {
            throw new Error(`Model not found: ${request.model}`);
        }

        const { provider, model } = found;

        if (!provider.enabled) {
            throw new Error(`Provider ${provider.name} is not enabled`);
        }

        if (!provider.apiKey && provider.type === 'cloud') {
            throw new Error(`No API key configured for ${provider.name}`);
        }

        try {
            const response = await this.executeRequest(provider, request);
            const latency = Date.now() - start;

            // Update stats
            this.updateUsageStats(provider.id, model.id, response, latency);

            return {
                ...response,
                latencyMs: latency
            };
        } catch (error) {
            this.recordError(provider.id, request.model);
            throw error;
        }
    }

    private async executeRequest(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
        // Different API formats for different providers
        switch (provider.id) {
            case 'anthropic':
                return this.callAnthropic(provider, request);
            case 'google':
                return this.callGoogle(provider, request);
            case 'openai':
                return this.callOpenAI(provider, request);
            case 'ollama':
                return this.callOllama(provider, request);
            default:
                return this.callGeneric(provider, request);
        }
    }

    private async callAnthropic(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
        const response = await fetch(`${provider.baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': provider.apiKey || '',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages.filter(m => m.role !== 'system'),
                system: request.messages.find(m => m.role === 'system')?.content,
                max_tokens: request.maxTokens || 4096,
                temperature: request.temperature || 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        const data = await response.json() as {
            id: string;
            content: Array<{ text: string }>;
            usage: { input_tokens: number; output_tokens: number };
            stop_reason: string;
        };

        return {
            id: data.id,
            model: request.model,
            content: data.content.map(c => c.text).join(''),
            usage: {
                promptTokens: data.usage.input_tokens,
                completionTokens: data.usage.output_tokens,
                totalTokens: data.usage.input_tokens + data.usage.output_tokens
            },
            finishReason: data.stop_reason === 'end_turn' ? 'stop' : 'length',
            latencyMs: 0
        };
    }

    private async callGoogle(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
        const response = await fetch(
            `${provider.baseUrl}/models/${request.model}:generateContent?key=${provider.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: request.messages.map(m => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content }]
                    })),
                    generationConfig: {
                        temperature: request.temperature || 0.7,
                        maxOutputTokens: request.maxTokens || 4096
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Google API error: ${response.status}`);
        }

        const data = await response.json() as {
            candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
            usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
        };

        return {
            id: `google-${Date.now()}`,
            model: request.model,
            content: data.candidates[0]?.content.parts.map(p => p.text).join('') || '',
            usage: {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0)
            },
            finishReason: 'stop',
            latencyMs: 0
        };
    }

    private async callOpenAI(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`
            },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                max_tokens: request.maxTokens || 4096,
                temperature: request.temperature || 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json() as {
            id: string;
            choices: Array<{ message: { content: string }; finish_reason: string }>;
            usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        return {
            id: data.id,
            model: request.model,
            content: data.choices[0]?.message.content || '',
            usage: {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            },
            finishReason: data.choices[0]?.finish_reason === 'stop' ? 'stop' : 'length',
            latencyMs: 0
        };
    }

    private async callOllama(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
        const response = await fetch(`${provider.baseUrl}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
        }

        const data = await response.json() as {
            message: { content: string };
            prompt_eval_count: number;
            eval_count: number;
        };

        return {
            id: `ollama-${Date.now()}`,
            model: request.model,
            content: data.message.content,
            usage: {
                promptTokens: data.prompt_eval_count || 0,
                completionTokens: data.eval_count || 0,
                totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
            },
            finishReason: 'stop',
            latencyMs: 0
        };
    }

    private async callGeneric(provider: ModelProvider, request: ModelRequest): Promise<ModelResponse> {
        // Generic OpenAI-compatible endpoint
        return this.callOpenAI(provider, request);
    }

    // ============ Usage Stats ============
    private updateUsageStats(
        providerId: string,
        modelId: string,
        response: ModelResponse,
        latency: number
    ): void {
        const key = `${providerId}:${modelId}`;
        const existing = this.usageStats.get(key);

        const model = this.findModel(modelId)?.model;
        const cost = model
            ? (response.usage.promptTokens * (model.inputPricePerMillion || 0) / 1000000) +
            (response.usage.completionTokens * (model.outputPricePerMillion || 0) / 1000000)
            : 0;

        if (existing) {
            existing.requests++;
            existing.promptTokens += response.usage.promptTokens;
            existing.completionTokens += response.usage.completionTokens;
            existing.totalCost += cost;
            existing.averageLatency = (existing.averageLatency * (existing.requests - 1) + latency) / existing.requests;
            existing.lastUsed = Date.now();
        } else {
            this.usageStats.set(key, {
                providerId,
                modelId,
                requests: 1,
                promptTokens: response.usage.promptTokens,
                completionTokens: response.usage.completionTokens,
                totalCost: cost,
                averageLatency: latency,
                errors: 0,
                lastUsed: Date.now()
            });
        }
    }

    private recordError(providerId: string, modelId: string): void {
        const key = `${providerId}:${modelId}`;
        const existing = this.usageStats.get(key);

        if (existing) {
            existing.errors++;
        }
    }

    getUsageStats(): ModelUsageStats[] {
        return Array.from(this.usageStats.values());
    }

    getTotalCost(): number {
        let total = 0;
        for (const stats of this.usageStats.values()) {
            total += stats.totalCost;
        }
        return total;
    }

    // ============ Health Check ============
    async checkProviderHealth(providerId: string): Promise<boolean> {
        const provider = this.providers.get(providerId);
        if (!provider) return false;

        try {
            if (provider.type === 'local') {
                const response = await fetch(`${provider.baseUrl.replace('/api', '')}/api/version`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(5000)
                });
                return response.ok;
            }
            return true; // Assume cloud providers are healthy
        } catch {
            return false;
        }
    }
}

// Singleton export
export const modelProviderManager = new ModelProviderManager();
