import axios, { AxiosInstance } from 'axios';
import {
  BaseModelAdapter,
  ModelExecutionRequest,
  ModelExecutionResponse,
} from './base';
import { PromptHubMCPError, ErrorCodes } from '../types';

/**
 * OpenAI API response interface
 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI model adapter
 */
export class OpenAIAdapter extends BaseModelAdapter {
  private client: AxiosInstance;

  constructor(config: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    defaultSettings?: Record<string, any>;
  }) {
    super(config.model || 'gpt-3.5-turbo', {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      defaultSettings: {
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        ...config.defaultSettings,
      },
    });

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000, // 60 second timeout
    });
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse> {
    this.validateApiKey();

    try {
      const settings = this.prepareSettings(
        request.settings,
        request.context.modelProvider === 'openai' ? request.context.previousOutputs : undefined
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

      const response = await this.client.post<OpenAIResponse>('/chat/completions', payload);

      const choice = response.data.choices[0];
      if (!choice) {
        throw new PromptHubMCPError(
          ErrorCodes.EXECUTION_FAILED,
          'No response choices returned from OpenAI'
        );
      }

      return {
        content: choice.message.content,
        tokenUsage: {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens,
        },
        finishReason: choice.finish_reason,
        metadata: {
          model: response.data.model,
          id: response.data.id,
          created: response.data.created,
        },
      };
    } catch (error) {
      this.handleApiError(error, 'OpenAI execution');
    }
  }

  async validate(): Promise<boolean> {
    try {
      this.validateApiKey();
      
      // Test with a simple request
      const response = await this.client.post('/chat/completions', {
        model: this.modelName,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1,
      });

      return response.status === 200;
    } catch (error) {
      console.warn('OpenAI validation failed:', error);
      return false;
    }
  }

  protected getProviderName(): string {
    return 'OpenAI';
  }

  protected getCapabilities(): string[] {
    const capabilities = ['text-generation', 'conversation'];
    
    // Add model-specific capabilities
    if (this.modelName.includes('gpt-4')) {
      capabilities.push('advanced-reasoning', 'long-context');
    }
    
    if (this.modelName.includes('vision')) {
      capabilities.push('image-understanding');
    }

    return capabilities;
  }

  /**
   * Get available OpenAI models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/models');
      return response.data.data
        .filter((model: any) => model.id.startsWith('gpt-'))
        .map((model: any) => model.id);
    } catch (error) {
      console.warn('Failed to fetch OpenAI models:', error);
      return ['gpt-3.5-turbo', 'gpt-4'];
    }
  }

  /**
   * Estimate cost for a request
   */
  estimateCost(promptTokens: number, completionTokens: number): number {
    // Pricing as of 2024 (in USD per 1K tokens)
    const pricing: Record<string, { prompt: number; completion: number }> = {
      'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
    };

    const modelPricing = pricing[this.modelName] || pricing['gpt-3.5-turbo'];
    
    return (
      (promptTokens / 1000) * modelPricing.prompt +
      (completionTokens / 1000) * modelPricing.completion
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

      const response = await this.client.post('/chat/completions', payload, {
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
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta?.content;
              if (delta) {
                yield delta;
              }
            } catch (parseError) {
              // Ignore parsing errors for malformed chunks
            }
          }
        }
      }
    } catch (error) {
      this.handleApiError(error, 'OpenAI streaming');
    }
  }
} 