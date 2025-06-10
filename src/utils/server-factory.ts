import { PromptHubMCPServer } from '../core/mcp-server';
import { PromptVaultClient } from '../core/vault-client';
import { PromptRouter } from '../core/prompt-router';
import { BlockchainConfig } from '../types';

/**
 * Configuration for creating MCP server
 */
export interface MCPServerConfig {
  name: string;
  version: string;
  blockchain: BlockchainConfig;
  features?: {
    enableCaching?: boolean;
    enableMetrics?: boolean;
    enableLogging?: boolean;
  };
}

/**
 * Factory function to create and configure PromptHub MCP server
 */
export async function createMCPServer(config: MCPServerConfig): Promise<PromptHubMCPServer> {
  // Initialize vault client
  const vaultClient = new PromptVaultClient(config.blockchain);
  await vaultClient.initialize(config.blockchain.keypairPath);

  // Initialize router
  const router = new PromptRouter(vaultClient);
  await router.initialize();

  // Create MCP server
  const server = new PromptHubMCPServer(
    config.name,
    config.version,
    vaultClient,
    router
  );

  return server;
}

/**
 * Quick setup function for development
 */
export async function createDevServer(): Promise<PromptHubMCPServer> {
  return createMCPServer({
    name: 'prompthub-mcp-dev',
    version: '1.0.0-dev',
    blockchain: {
      network: 'localnet',
      rpcUrl: 'http://localhost:8899',
      programId: 'PromptVault11111111111111111111111111111111',
      commitment: 'confirmed',
    },
    features: {
      enableCaching: true,
      enableMetrics: false,
      enableLogging: true,
    },
  });
}

/**
 * Production setup function
 */
export async function createProductionServer(
  programId: string,
  keypairPath: string
): Promise<PromptHubMCPServer> {
  return createMCPServer({
    name: 'prompthub-mcp',
    version: '1.0.0',
    blockchain: {
      network: 'mainnet-beta',
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      programId,
      keypairPath,
      commitment: 'finalized',
    },
    features: {
      enableCaching: true,
      enableMetrics: true,
      enableLogging: true,
    },
  });
} 