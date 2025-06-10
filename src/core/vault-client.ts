import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import axios from 'axios';
import {
  PromptDefinition,
  PromptMetadata,
  PromptVaultEntry,
  BlockchainConfig,
  PromptHubMCPError,
  ErrorCodes,
} from '../types';

/**
 * Client for interacting with PromptVault on Solana blockchain
 */
export class PromptVaultClient {
  private connection: Connection;
  private program: anchor.Program | null = null;
  private wallet: anchor.Wallet | null = null;
  private config: BlockchainConfig;

  constructor(config: BlockchainConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, {
      commitment: config.commitment || 'confirmed',
    });
  }

  /**
   * Initialize the client with wallet and program
   */
  async initialize(keypairPath?: string): Promise<void> {
    try {
      // Load wallet if keypair path provided
      if (keypairPath || this.config.keypairPath) {
        const fs = await import('fs');
        const path = keypairPath || this.config.keypairPath!;
        const keypairData = JSON.parse(fs.readFileSync(path, 'utf8'));
        const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        this.wallet = new anchor.Wallet(keypair);
      }

      // Set up Anchor provider
      const provider = new anchor.AnchorProvider(
        this.connection,
        this.wallet || ({} as anchor.Wallet),
        {
          commitment: this.config.commitment || 'confirmed',
        }
      );

      anchor.setProvider(provider);

      // Load program IDL (this would be loaded from the deployed program)
      // For now, we'll create a mock program interface
      this.program = await this.loadProgram();
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        'Failed to initialize vault client',
        error
      );
    }
  }

  /**
   * Get a prompt by ID and optional version
   */
  async getPrompt(
    promptId: string,
    version?: string
  ): Promise<{ definition: PromptDefinition; metadata: PromptMetadata } | null> {
    try {
      // Get prompt data from blockchain
      const promptData = await this.getPromptFromChain(promptId);
      if (!promptData) {
        return null;
      }

      // Fetch full definition from IPFS
      const definition = await this.fetchFromIPFS(promptData.metadataUri);

      // Convert blockchain data to metadata format
      const metadata: PromptMetadata = {
        id: promptData.id,
        name: definition.name,
        description: definition.description,
        version: version || definition.version,
        author: promptData.owner,
        license: definition.license,
        tags: definition.tags || [],
        createdAt: promptData.createdAt,
        updatedAt: promptData.lastUpdated,
        executionCount: 0, // This would be tracked separately
        accessPolicy: {
          type: this.mapLicenseTypeToAccessPolicy(promptData.licenseType),
          tokenAddress: promptData.tokenGate,
          minimumBalance: promptData.feeAmount?.toString(),
        },
        royaltyConfig: {
          creatorShare: 6000, // 60%
          daoShare: 1500,     // 15%
          validatorShare: 1500, // 15%
          burnShare: 1000,    // 10%
        },
      };

      return { definition, metadata };
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        `Failed to get prompt: ${promptId}`,
        error
      );
    }
  }

  /**
   * List all prompts in the vault
   */
  async listPrompts(
    filters?: {
      author?: string;
      tags?: string[];
      limit?: number;
      offset?: number;
    }
  ): Promise<PromptMetadata[]> {
    try {
      // This would query the blockchain for all prompt accounts
      // For now, return mock data
      const mockPrompts: PromptMetadata[] = [
        {
          id: 'text-summarizer-v1',
          name: 'Text Summarizer',
          description: 'Summarizes long text into concise points',
          version: '1.0.0',
          author: 'PromptHub',
          license: 'MIT',
          tags: ['text', 'summarization', 'utility'],
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now() - 86400000,
          executionCount: 150,
          averageRating: 4.5,
          accessPolicy: {
            type: 'public',
          },
          royaltyConfig: {
            creatorShare: 6000,
            daoShare: 1500,
            validatorShare: 1500,
            burnShare: 1000,
          },
        },
      ];

      return mockPrompts;
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        'Failed to list prompts',
        error
      );
    }
  }

  /**
   * Register a new prompt in the vault
   */
  async registerPrompt(
    definition: PromptDefinition,
    metadata: Partial<PromptMetadata>
  ): Promise<string> {
    if (!this.program || !this.wallet) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        'Client not initialized with wallet'
      );
    }

    try {
      // Upload definition to IPFS
      const metadataUri = await this.uploadToIPFS(definition);

      // Create prompt account on blockchain
      const promptId = definition.id;
      const [promptDataPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('prompt'), Buffer.from(promptId)],
        new PublicKey(this.config.programId)
      );

      // This would call the actual smart contract
      // For now, return success
      console.log(`Registering prompt ${promptId} at ${promptDataPDA.toString()}`);
      
      return promptId;
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        'Failed to register prompt',
        error
      );
    }
  }

  /**
   * Record prompt execution on-chain
   */
  async recordExecution(
    promptId: string,
    executionId: string,
    inputHash: string,
    outputHash: string,
    success: boolean,
    executionTime: number
  ): Promise<string> {
    if (!this.program || !this.wallet) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        'Client not initialized with wallet'
      );
    }

    try {
      // This would call the record_execution instruction
      // For now, return mock transaction signature
      const signature = `mock_tx_${Date.now()}`;
      
      console.log(`Recording execution ${executionId} for prompt ${promptId}`);
      
      return signature;
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        'Failed to record execution',
        error
      );
    }
  }

  /**
   * Get vault metadata and statistics
   */
  async getVaultMetadata(): Promise<{
    totalPrompts: number;
    totalExecutions: number;
    totalAuthors: number;
    networkInfo: {
      network: string;
      programId: string;
      rpcUrl: string;
    };
  }> {
    try {
      // This would query the vault state account
      return {
        totalPrompts: 42,
        totalExecutions: 1337,
        totalAuthors: 15,
        networkInfo: {
          network: this.config.network,
          programId: this.config.programId,
          rpcUrl: this.config.rpcUrl,
        },
      };
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        'Failed to get vault metadata',
        error
      );
    }
  }

  /**
   * Check if caller has access to a prompt
   */
  async checkAccess(
    promptId: string,
    caller: string
  ): Promise<{ hasAccess: boolean; reason?: string }> {
    try {
      const promptData = await this.getPromptFromChain(promptId);
      if (!promptData) {
        return { hasAccess: false, reason: 'Prompt not found' };
      }

      // Check access based on license type
      switch (promptData.licenseType) {
        case 0: // Public
          return { hasAccess: true };
        
        case 1: // Token gated
          if (promptData.tokenGate) {
            // Check token balance
            const hasTokens = await this.checkTokenBalance(
              caller,
              promptData.tokenGate,
              promptData.feeAmount || 0
            );
            return {
              hasAccess: hasTokens,
              reason: hasTokens ? undefined : 'Insufficient token balance',
            };
          }
          return { hasAccess: false, reason: 'Token gate not configured' };
        
        case 2: // Private
          return {
            hasAccess: caller === promptData.owner,
            reason: caller === promptData.owner ? undefined : 'Private prompt',
          };
        
        default:
          return { hasAccess: false, reason: 'Unknown license type' };
      }
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.BLOCKCHAIN_ERROR,
        'Failed to check access',
        error
      );
    }
  }

  // Private helper methods

  private async loadProgram(): Promise<anchor.Program> {
    // This would load the actual program IDL
    // For now, return a mock program
    return {} as anchor.Program;
  }

  private async getPromptFromChain(promptId: string): Promise<PromptVaultEntry | null> {
    try {
      // This would query the actual blockchain account
      // For now, return mock data
      return {
        id: promptId,
        owner: 'PromptHub',
        contentHash: 'mock_hash',
        metadataUri: 'ipfs://QmMockHash123',
        licenseType: 0, // Public
        createdAt: Date.now() - 86400000,
        lastUpdated: Date.now() - 86400000,
        versionHistory: [],
        status: 1, // Active
      };
    } catch (error) {
      console.error('Error fetching prompt from chain:', error);
      return null;
    }
  }

  private async fetchFromIPFS(uri: string): Promise<PromptDefinition> {
    try {
      // Convert IPFS URI to HTTP gateway URL
      const httpUrl = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
      
      const response = await axios.get(httpUrl, { timeout: 10000 });
      return response.data;
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.NETWORK_ERROR,
        `Failed to fetch from IPFS: ${uri}`,
        error
      );
    }
  }

  private async uploadToIPFS(data: any): Promise<string> {
    try {
      // This would upload to IPFS
      // For now, return mock URI
      const mockHash = `Qm${Date.now()}`;
      return `ipfs://${mockHash}`;
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.NETWORK_ERROR,
        'Failed to upload to IPFS',
        error
      );
    }
  }

  private mapLicenseTypeToAccessPolicy(licenseType: number): 'public' | 'token_gated' | 'private' | 'nft_gated' | 'custom' {
    switch (licenseType) {
      case 0: return 'public';
      case 1: return 'token_gated';
      case 2: return 'private';
      case 3: return 'nft_gated';
      default: return 'custom';
    }
  }

  private async checkTokenBalance(
    wallet: string,
    tokenMint: string,
    requiredAmount: number
  ): Promise<boolean> {
    try {
      // This would check actual token balance
      // For now, return true
      return true;
    } catch (error) {
      console.error('Error checking token balance:', error);
      return false;
    }
  }
} 