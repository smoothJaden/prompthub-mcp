// Core exports
export { PromptModule } from './core/prompt-module';
export { PromptHubMCPServer } from './core/mcp-server';
export { PromptVaultClient } from './core/vault-client';
export { PromptRouter } from './core/prompt-router';

// Type exports
export * from './types';

// Utility exports
export { createMCPServer } from './utils/server-factory';
export { validatePromptDSL } from './utils/validation';
export { PromptTemplateEngine } from './utils/template-engine';

// Model adapter exports
export { OpenAIAdapter } from './adapters/openai';
export { AnthropicAdapter } from './adapters/anthropic';
export { BaseModelAdapter } from './adapters/base';

// Configuration
export { defaultConfig } from './config/default';

/**
 * Main entry point for PromptHub MCP integration
 */
export class PromptHubMCP {
  private server: PromptHubMCPServer | null = null;
  private vaultClient: PromptVaultClient | null = null;
  private router: PromptRouter | null = null;

  /**
   * Initialize PromptHub MCP with configuration
   */
  async initialize(config: {
    blockchain: {
      network: 'localnet' | 'devnet' | 'mainnet-beta';
      rpcUrl: string;
      programId: string;
      keypairPath?: string;
    };
    server: {
      name: string;
      version: string;
    };
  }): Promise<void> {
    // Initialize vault client
    this.vaultClient = new PromptVaultClient({
      network: config.blockchain.network,
      rpcUrl: config.blockchain.rpcUrl,
      programId: config.blockchain.programId,
      keypairPath: config.blockchain.keypairPath,
    });

    await this.vaultClient.initialize();

    // Initialize router
    this.router = new PromptRouter(this.vaultClient);
    await this.router.initialize();

    // Initialize MCP server
    this.server = new PromptHubMCPServer(
      config.server.name,
      config.server.version,
      this.vaultClient,
      this.router
    );
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (!this.server) {
      throw new Error('PromptHub MCP not initialized');
    }

    await this.server.start();
  }

  /**
   * Get the vault client
   */
  getVaultClient(): PromptVaultClient {
    if (!this.vaultClient) {
      throw new Error('PromptHub MCP not initialized');
    }
    return this.vaultClient;
  }

  /**
   * Get the router
   */
  getRouter(): PromptRouter {
    if (!this.router) {
      throw new Error('PromptHub MCP not initialized');
    }
    return this.router;
  }

  /**
   * Get the MCP server
   */
  getServer(): PromptHubMCPServer {
    if (!this.server) {
      throw new Error('PromptHub MCP not initialized');
    }
    return this.server;
  }
} 