import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { PromptHubMCPError, ErrorCodes } from '../../types/index.js';

export interface WebConnectorConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface WebRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
}

export interface WebResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  url: string;
  executionTime: number;
}

/**
 * Web Connector
 * Handles HTTP requests and web API integrations for prompt execution
 */
export class WebConnector {
  private client: AxiosInstance;
  private config: WebConnectorConfig;
  private requestCount: number = 0;
  private totalExecutionTime: number = 0;

  constructor(config: WebConnectorConfig = {}) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'PromptHub-MCP/1.0',
        'Content-Type': 'application/json',
        ...this.config.headers
      }
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.metadata = { startTime: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const executionTime = Date.now() - response.config.metadata.startTime;
        this.requestCount++;
        this.totalExecutionTime += executionTime;
        response.executionTime = executionTime;
        return response;
      },
      (error) => {
        if (error.config?.metadata?.startTime) {
          const executionTime = Date.now() - error.config.metadata.startTime;
          this.totalExecutionTime += executionTime;
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Execute web request
   */
  async request(request: WebRequest): Promise<WebResponse> {
    const startTime = Date.now();
    
    try {
      const config: AxiosRequestConfig = {
        url: request.url,
        method: request.method,
        headers: request.headers,
        params: request.params,
        data: request.data,
        timeout: request.timeout || this.config.timeout
      };

      const response = await this.executeWithRetry(config);
      
      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        url: response.config.url || request.url,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      throw this.handleError(error, request);
    }
  }

  /**
   * Execute GET request
   */
  async get(url: string, params?: Record<string, any>, headers?: Record<string, string>): Promise<WebResponse> {
    return this.request({
      url,
      method: 'GET',
      params,
      headers
    });
  }

  /**
   * Execute POST request
   */
  async post(url: string, data?: any, headers?: Record<string, string>): Promise<WebResponse> {
    return this.request({
      url,
      method: 'POST',
      data,
      headers
    });
  }

  /**
   * Execute PUT request
   */
  async put(url: string, data?: any, headers?: Record<string, string>): Promise<WebResponse> {
    return this.request({
      url,
      method: 'PUT',
      data,
      headers
    });
  }

  /**
   * Execute DELETE request
   */
  async delete(url: string, headers?: Record<string, string>): Promise<WebResponse> {
    return this.request({
      url,
      method: 'DELETE',
      headers
    });
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry(config: AxiosRequestConfig, attempt: number = 1): Promise<AxiosResponse> {
    try {
      return await this.client.request(config);
    } catch (error) {
      if (attempt < this.config.retryAttempts! && this.shouldRetry(error)) {
        await this.delay(this.config.retryDelay! * attempt);
        return this.executeWithRetry(config, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Check if request should be retried
   */
  private shouldRetry(error: any): boolean {
    if (!error.response) {
      return true; // Network error
    }

    const status = error.response.status;
    return status >= 500 || status === 429; // Server error or rate limit
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: any, request: WebRequest): PromptHubMCPError {
    if (error.response) {
      // Server responded with error status
      return new PromptHubMCPError(
        `HTTP ${error.response.status}: ${error.response.statusText} for ${request.method} ${request.url}`,
        ErrorCodes.HTTP_ERROR,
        {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          url: request.url,
          method: request.method
        }
      );
    } else if (error.request) {
      // Network error
      return new PromptHubMCPError(
        `Network error for ${request.method} ${request.url}: ${error.message}`,
        ErrorCodes.NETWORK_ERROR,
        {
          url: request.url,
          method: request.method,
          message: error.message
        }
      );
    } else {
      // Request setup error
      return new PromptHubMCPError(
        `Request setup error: ${error.message}`,
        ErrorCodes.VALIDATION_ERROR,
        {
          message: error.message,
          request
        }
      );
    }
  }

  /**
   * Health check
   */
  async healthCheck(url?: string): Promise<boolean> {
    try {
      const testUrl = url || (this.config.baseURL ? `${this.config.baseURL}/health` : 'https://httpbin.org/status/200');
      await this.get(testUrl);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get connector statistics
   */
  getStats(): {
    requestCount: number;
    averageExecutionTime: number;
    totalExecutionTime: number;
  } {
    return {
      requestCount: this.requestCount,
      averageExecutionTime: this.requestCount > 0 ? this.totalExecutionTime / this.requestCount : 0,
      totalExecutionTime: this.totalExecutionTime
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.requestCount = 0;
    this.totalExecutionTime = 0;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WebConnectorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Update axios instance if needed
    if (newConfig.baseURL) {
      this.client.defaults.baseURL = newConfig.baseURL;
    }
    if (newConfig.timeout) {
      this.client.defaults.timeout = newConfig.timeout;
    }
    if (newConfig.headers) {
      this.client.defaults.headers = { ...this.client.defaults.headers, ...newConfig.headers };
    }
  }
} 