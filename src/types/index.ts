import { z } from 'zod';

// PromptDSL Schema Definitions
export const InputParameterSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  required: z.boolean().optional().default(false),
  default: z.any().optional(),
  description: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  enum: z.array(z.string()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  items: z.lazy(() => InputParameterSchema).optional(),
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
  properties: z.record(z.lazy(() => InputParameterSchema)).optional(),
});

export const OutputSchemaSchema = z.object({
  type: z.string(),
  properties: z.record(z.any()).optional(),
  required: z.array(z.string()).optional(),
});

export const PromptDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  license: z.string(),
  inputs: z.record(InputParameterSchema),
  template: z.string(),
  output_schema: OutputSchemaSchema,
  dependencies: z.array(z.string()).optional(),
  execution_settings: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  models: z.array(z.string()).optional(),
});

export const ExecutionContextSchema = z.object({
  caller: z.string(),
  modelProvider: z.string().optional(),
  timestamp: z.number(),
  previousOutputs: z.record(z.any()).optional(),
  requestId: z.string(),
  chainId: z.string().optional(),
  blockHeight: z.number().optional(),
});

export const ModuleResponseSchema = z.object({
  success: z.boolean(),
  output: z.any(),
  metadata: z.record(z.any()).optional(),
  executionTime: z.number().optional(),
  tokenUsage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }).optional(),
  signature: z.string().optional(),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()).optional(),
});

export const RoyaltyConfigurationSchema = z.object({
  creatorShare: z.number().min(0).max(10000), // basis points
  daoShare: z.number().min(0).max(10000),
  validatorShare: z.number().min(0).max(10000),
  burnShare: z.number().min(0).max(10000),
});

export const AccessPolicySchema = z.object({
  type: z.enum(['public', 'token_gated', 'nft_gated', 'private', 'custom']),
  tokenAddress: z.string().optional(),
  minimumBalance: z.string().optional(),
  whitelist: z.array(z.string()).optional(),
  maxUsagePerDay: z.number().optional(),
  expirationDate: z.number().optional(),
});

export const PromptMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  license: z.string(),
  tags: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  executionCount: z.number(),
  averageRating: z.number().optional(),
  accessPolicy: AccessPolicySchema,
  royaltyConfig: RoyaltyConfigurationSchema,
});

// Type exports
export type InputParameter = z.infer<typeof InputParameterSchema>;
export type OutputSchema = z.infer<typeof OutputSchemaSchema>;
export type PromptDefinition = z.infer<typeof PromptDefinitionSchema>;
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
export type ModuleResponse = z.infer<typeof ModuleResponseSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type RoyaltyConfiguration = z.infer<typeof RoyaltyConfigurationSchema>;
export type AccessPolicy = z.infer<typeof AccessPolicySchema>;
export type PromptMetadata = z.infer<typeof PromptMetadataSchema>;

// MCP-specific types
export interface MCPRequest {
  method: string;
  params: {
    name: string;
    arguments: Record<string, any>;
  };
  id: string;
}

export interface MCPResponse {
  id: string;
  result?: {
    content: Array<{
      type: string;
      text?: string;
      data?: any;
    }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// PromptHub-specific MCP extensions
export interface PromptHubMCPContext {
  promptId: string;
  version: string;
  caller: string;
  chainContext?: {
    network: string;
    programId: string;
    vaultAddress: string;
  };
  executionId: string;
  timestamp: number;
}

export interface PromptExecutionRequest {
  promptId: string;
  version?: string;
  inputs: Record<string, any>;
  context: ExecutionContext;
  options?: {
    validateInputs?: boolean;
    recordExecution?: boolean;
    generateSignature?: boolean;
    modelProvider?: string;
    modelSettings?: Record<string, any>;
  };
}

export interface PromptExecutionResult {
  success: boolean;
  output: any;
  metadata: {
    promptId: string;
    version: string;
    executionId: string;
    timestamp: number;
    executionTime: number;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    modelProvider?: string;
    cost?: number;
  };
  signature?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Blockchain integration types
export interface BlockchainConfig {
  network: 'localnet' | 'devnet' | 'mainnet-beta';
  rpcUrl: string;
  programId: string;
  keypairPath?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface PromptVaultEntry {
  id: string;
  owner: string;
  contentHash: string;
  metadataUri: string;
  licenseType: number;
  tokenGate?: string;
  feeAmount?: number;
  createdAt: number;
  lastUpdated: number;
  versionHistory: Array<{
    version: string;
    contentHash: string;
    timestamp: number;
  }>;
  status: number;
}

// Error types
export class PromptHubMCPError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PromptHubMCPError';
  }
}

export enum ErrorCodes {
  PROMPT_NOT_FOUND = 'PROMPT_NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  ACCESS_DENIED = 'ACCESS_DENIED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  BLOCKCHAIN_ERROR = 'BLOCKCHAIN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
} 