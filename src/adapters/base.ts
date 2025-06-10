import {
  PromptDefinition,
  ExecutionContext,
  ModuleResponse,
  PromptHubMCPError,
  ErrorCodes,
} from '../types';

/**
 * Model execution request
 */
export interface ModelExecutionRequest {
  prompt: string;
  inputs: Record<string, any>;
  settings?: Record<string, any>;
  context: ExecutionContext;
}

/**
 * Model execution response
 */
export interface ModelExecutionResponse {
  content: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  metadata?: Record<string, any>;
}

/**
 * Base model adapter interface
 */
export abstract class BaseModelAdapter {
  protected modelName: string;
  protected apiKey?: string;
  protected baseUrl?: string;
  protected defaultSettings: Record<string, any>;

  constructor(
    modelName: string,
    config: {
      apiKey?: string;
      baseUrl?: string;
      defaultSettings?: Record<string, any>;
    } = {}
  ) {
    this.modelName = modelName;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.defaultSettings = config.defaultSettings || {};
  }

  /**
   * Execute a prompt using this model adapter
   */
  abstract execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse>;

  /**
   * Validate that the adapter is properly configured
   */
  abstract validate(): Promise<boolean>;

  /**
   * Get model information
   */
  getModelInfo(): {
    name: string;
    provider: string;
    capabilities: string[];
  } {
    return {
      name: this.modelName,
      provider: this.getProviderName(),
      capabilities: this.getCapabilities(),
    };
  }

  /**
   * Get provider name
   */
  protected abstract getProviderName(): string;

  /**
   * Get model capabilities
   */
  protected abstract getCapabilities(): string[];

  /**
   * Prepare execution settings by merging defaults with prompt-specific settings
   */
  protected prepareSettings(
    promptSettings?: Record<string, any>,
    contextSettings?: Record<string, any>
  ): Record<string, any> {
    return {
      ...this.defaultSettings,
      ...promptSettings,
      ...contextSettings,
    };
  }

  /**
   * Validate API key is present
   */
  protected validateApiKey(): void {
    if (!this.apiKey) {
      throw new PromptHubMCPError(
        ErrorCodes.VALIDATION_ERROR,
        `API key required for ${this.getProviderName()}`
      );
    }
  }

  /**
   * Handle API errors consistently
   */
  protected handleApiError(error: any, context: string): never {
    if (error.response) {
      // HTTP error response
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;
      
      if (status === 401) {
        throw new PromptHubMCPError(
          ErrorCodes.ACCESS_DENIED,
          `Authentication failed for ${this.getProviderName()}: ${message}`
        );
      } else if (status === 429) {
        throw new PromptHubMCPError(
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          `Rate limit exceeded for ${this.getProviderName()}: ${message}`
        );
      } else if (status >= 500) {
        throw new PromptHubMCPError(
          ErrorCodes.NETWORK_ERROR,
          `Server error from ${this.getProviderName()}: ${message}`
        );
      } else {
        throw new PromptHubMCPError(
          ErrorCodes.EXECUTION_FAILED,
          `API error from ${this.getProviderName()}: ${message}`
        );
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new PromptHubMCPError(
        ErrorCodes.NETWORK_ERROR,
        `Network error connecting to ${this.getProviderName()}: ${error.message}`
      );
    } else {
      throw new PromptHubMCPError(
        ErrorCodes.EXECUTION_FAILED,
        `${context} failed: ${error.message}`,
        error
      );
    }
  }

  /**
   * Estimate token count (basic implementation)
   */
  protected estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Sanitize and validate prompt content
   */
  protected sanitizePrompt(prompt: string): string {
    // Remove any potentially harmful content
    // This is a basic implementation - more sophisticated filtering may be needed
    return prompt
      .replace(/\x00/g, '') // Remove null bytes
      .trim();
  }

  /**
   * Format error for consistent error handling
   */
  protected formatError(error: any, operation: string): PromptHubMCPError {
    if (error instanceof PromptHubMCPError) {
      return error;
    }

    return new PromptHubMCPError(
      ErrorCodes.EXECUTION_FAILED,
      `${operation} failed: ${error.message || 'Unknown error'}`,
      error
    );
  }
}

/**
 * Mock model adapter for testing
 */
export class MockModelAdapter extends BaseModelAdapter {
  constructor() {
    super('mock-model', {
      defaultSettings: {
        temperature: 0.7,
        maxTokens: 1000,
      },
    });
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    const promptTokens = this.estimateTokenCount(request.prompt);
    const completionTokens = Math.floor(Math.random() * 200) + 50;

    return {
      content: `Mock response for prompt: "${request.prompt.substring(0, 50)}..."`,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      finishReason: 'stop',
      metadata: {
        model: this.modelName,
        timestamp: Date.now(),
      },
    };
  }

  async validate(): Promise<boolean> {
    return true; // Mock adapter is always valid
  }

  protected getProviderName(): string {
    return 'Mock';
  }

  protected getCapabilities(): string[] {
    return ['text-generation', 'conversation'];
  }
} 