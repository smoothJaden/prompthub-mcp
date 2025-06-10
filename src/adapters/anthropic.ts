import axios, { AxiosInstance } from 'axios';
import {
  BaseModelAdapter,
  ModelExecutionRequest,
  ModelExecutionResponse,
} from './base';
import { PromptHubMCPError, ErrorCodes } from '../types';

/**
 * Anthropic API response interface
 */
interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic Claude model adapter
 */
export class AnthropicAdapter extends BaseModelAdapter {
  private client: AxiosInstance;

  constructor(config: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    defaultSettings?: Record<string, any>;
  }) {
    super(config.model || 'claude-3-sonnet-20240229', {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.anthropic.com/v1',
      defaultSettings: {
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 1,
        ...config.defaultSettings,
      },
    });

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      timeout: 60000, // 60 second timeout
    });
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse> {
    this.validateApiKey();

    try {
      const settings = this.prepareSettings(
        request.settings,
        request.context.modelProvider === 'anthropic' ? request.context.previousOutputs : undefined
      );

      const sanitizedPrompt = this.sanitizePrompt(request.prompt);

      const payload = {
        model: this.modelName,
        messages: [
          {
            role: 'user',
            content: sanitizedPrompt,
          },
        ],
        ...settings,
      };

      const response = await this.client.post<AnthropicResponse>('/messages', payload);

      const content = response.data.content[0];
      if (!content || content.type !== 'text') {
        throw new PromptHubMCPError(
          ErrorCodes.EXECUTION_FAILED,
          'No text content returned from Anthropic'
        );
      }

      return {
        content: content.text,
        tokenUsage: {
          promptTokens: response.data.usage.input_tokens,
          completionTokens: response.data.usage.output_tokens,
          totalTokens: response.data.usage.input_tokens + response.data.usage.output_tokens,
        },
        finishReason: response.data.stop_reason,
        metadata: {
          model: response.data.model,
          id: response.data.id,
          type: response.data.type,
        },
      };
    } catch (error) {
      this.handleApiError(error, 'Anthropic execution');
    }
  }

  async validate(): Promise<boolean> {
    try {
      this.validateApiKey();
      
      // Test with a simple request
      const response = await this.client.post('/messages', {
        model: this.modelName,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1,
      });

      return response.status === 200;
    } catch (error) {
      console.warn('Anthropic validation failed:', error);
      return false;
    }
  }

  protected getProviderName(): string {
    return 'Anthropic';
  }

  protected getCapabilities(): string[] {
    const capabilities = ['text-generation', 'conversation', 'advanced-reasoning'];
    
    // Add model-specific capabilities
    if (this.modelName.includes('claude-3')) {
      capabilities.push('long-context', 'document-analysis');
    }
    
    if (this.modelName.includes('opus')) {
      capabilities.push('complex-reasoning', 'creative-writing');
    }

    return capabilities;
  }

  /**
   * Get available Anthropic models
   */
  getAvailableModels(): string[] {
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2',
    ];
  }

  /**
   * Estimate cost for a request
   */
  estimateCost(promptTokens: number, completionTokens: number): number {
    // Pricing as of 2024 (in USD per 1K tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
      'claude-2.1': { input: 0.008, output: 0.024 },
      'claude-2.0': { input: 0.008, output: 0.024 },
      'claude-instant-1.2': { input: 0.0008, output: 0.0024 },
    };

    const modelPricing = pricing[this.modelName] || pricing['claude-3-sonnet-20240229'];
    
    return (
      (promptTokens / 1000) * modelPricing.input +
      (completionTokens / 1000) * modelPricing.output
    );
  }

  /**
   * Stream completion (for real-time responses)
   */
  async *streamCompletion(request: ModelExecutionRequest): AsyncGenerator<string, void, unknown> {
    this.validateApiKey();

    try {
      const settings = this.prepareSettings(request.settings);
      const sanitizedPrompt = this.sanitizePrompt(request.prompt);

      const payload = {
        model: this.modelName,
        messages: [
          {
            role: 'user',
            content: sanitizedPrompt,
          },
        ],
        stream: true,
        ...settings,
      };

      const response = await this.client.post('/messages', payload, {
        responseType: 'stream',
      });

      // Parse SSE stream
      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta?.text;
                if (delta) {
                  yield delta;
                }
              } else if (parsed.type === 'message_stop') {
                return;
              }
            } catch (parseError) {
              // Ignore parsing errors for malformed chunks
            }
          }
        }
      }
    } catch (error) {
      this.handleApiError(error, 'Anthropic streaming');
    }
  }

  /**
   * Format prompt for Claude's specific requirements
   */
  protected sanitizePrompt(prompt: string): string {
    // Claude has specific formatting requirements
    let sanitized = super.sanitizePrompt(prompt);
    
    // Ensure proper human/assistant formatting if needed
    if (!sanitized.includes('Human:') && !sanitized.includes('Assistant:')) {
      // For simple prompts, no special formatting needed with messages API
      return sanitized;
    }
    
    return sanitized;
  }

  /**
   * Handle Claude-specific error responses
   */
  protected handleApiError(error: any, context: string): never {
    if (error.response?.data?.error) {
      const anthropicError = error.response.data.error;
      
      if (anthropicError.type === 'invalid_request_error') {
        throw new PromptHubMCPError(
          ErrorCodes.INVALID_INPUT,
          `Invalid request to Anthropic: ${anthropicError.message}`
        );
      } else if (anthropicError.type === 'authentication_error') {
        throw new PromptHubMCPError(
          ErrorCodes.ACCESS_DENIED,
          `Authentication failed for Anthropic: ${anthropicError.message}`
        );
      } else if (anthropicError.type === 'rate_limit_error') {
        throw new PromptHubMCPError(
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          `Rate limit exceeded for Anthropic: ${anthropicError.message}`
        );
      }
    }

    // Fall back to base error handling
    super.handleApiError(error, context);
  }
} 