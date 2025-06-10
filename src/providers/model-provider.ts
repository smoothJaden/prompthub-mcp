import { BaseModelAdapter } from '../adapters/base.js';
import { OpenAIAdapter } from '../adapters/openai.js';
import { AnthropicAdapter } from '../adapters/anthropic.js';
import { PromptHubMCPError, ErrorCodes } from '../types/index.js';

export interface ModelProviderConfig {
  openai?: {
    apiKey: string;
    baseUrl?: string;
    organization?: string;
  };
  anthropic?: {
    apiKey: string;
    baseUrl?: string;
  };
  defaultProvider?: 'openai' | 'anthropic';
}

/**
 * Model Provider Manager
 * Manages different AI model adapters and provides unified access
 */
export class ModelProviderManager {
  private adapters: Map<string, BaseModelAdapter> = new Map();
  private defaultProvider: string;

  constructor(config: ModelProviderConfig) {
    this.initializeAdapters(config);
    this.defaultProvider = config.defaultProvider || 'openai';
  }

  /**
   * Initialize model adapters based on configuration
   */
  private initializeAdapters(config: ModelProviderConfig): void {
    // Initialize OpenAI adapter
    if (config.openai?.apiKey) {
      const openaiAdapter = new OpenAIAdapter({
        apiKey: config.openai.apiKey,
        baseUrl: config.openai.baseUrl,
        organization: config.openai.organization
      });
      this.adapters.set('openai', openaiAdapter);
    }

    // Initialize Anthropic adapter
    if (config.anthropic?.apiKey) {
      const anthropicAdapter = new AnthropicAdapter({
        apiKey: config.anthropic.apiKey,
        baseUrl: config.anthropic.baseUrl
      });
      this.adapters.set('anthropic', anthropicAdapter);
    }

    if (this.adapters.size === 0) {
      throw new PromptHubMCPError(
        ErrorCodes.VALIDATION_ERROR,
        'No model adapters configured'
      );
    }
  }

  /**
   * Get adapter by provider name
   */
  getAdapter(provider?: string): BaseModelAdapter {
    const providerName = provider || this.defaultProvider;
    const adapter = this.adapters.get(providerName);
    
    if (!adapter) {
      throw new PromptHubMCPError(
        ErrorCodes.PROMPT_NOT_FOUND,
        `Model provider '${providerName}' not found or not configured`
      );
    }

    return adapter;
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if provider is available
   */
  hasProvider(provider: string): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Execute prompt with specified or default provider
   */
  async executePrompt(
    prompt: string,
    options: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    } = {}
  ): Promise<any> {
    const adapter = this.getAdapter(options.provider);
    
    // Create a basic execution request
    const request = {
      prompt,
      inputs: {},
      settings: {
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: options.stream
      },
      context: {
        contextId: 'provider-manager',
        sessionId: 'default',
        userId: 'system',
        promptId: 'direct-execution',
        inputs: {},
        outputs: {},
        metadata: {
          startTime: new Date(),
          version: '1.0.0',
          executionSignature: 'direct'
        },
        dependencies: new Map(),
        accessTokens: new Map()
      }
    };

    return await adapter.execute(request);
  }

  /**
   * Health check for all providers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [providerName, adapter] of this.adapters.entries()) {
      try {
        await adapter.validate();
        results[providerName] = true;
      } catch (error) {
        results[providerName] = false;
      }
    }

    return results;
  }

  /**
   * Get provider information
   */
  getProviderInfo(provider?: string): {
    name: string;
    provider: string;
    capabilities: string[];
  } {
    const adapter = this.getAdapter(provider);
    return adapter.getModelInfo();
  }

  /**
   * Add custom adapter
   */
  addAdapter(name: string, adapter: BaseModelAdapter): void {
    this.adapters.set(name, adapter);
  }

  /**
   * Remove adapter
   */
  removeAdapter(name: string): void {
    this.adapters.delete(name);
  }
} 