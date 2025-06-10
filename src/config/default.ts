import { BlockchainConfig } from '../types';

/**
 * Default configuration for PromptHub MCP
 */
export const defaultConfig = {
  // Server configuration
  server: {
    name: 'prompthub-mcp',
    version: '1.0.0',
    timeout: 60000, // 60 seconds
    maxConcurrentRequests: 10,
  },

  // Blockchain configuration
  blockchain: {
    localnet: {
      network: 'localnet' as const,
      rpcUrl: 'http://localhost:8899',
      programId: 'PromptVault11111111111111111111111111111111',
      commitment: 'confirmed' as const,
    },
    devnet: {
      network: 'devnet' as const,
      rpcUrl: 'https://api.devnet.solana.com',
      programId: 'PromptVault11111111111111111111111111111111',
      commitment: 'confirmed' as const,
    },
    mainnet: {
      network: 'mainnet-beta' as const,
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      programId: 'PromptVault11111111111111111111111111111111',
      commitment: 'finalized' as const,
    },
  } as Record<string, BlockchainConfig>,

  // Model adapter configurations
  models: {
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-3.5-turbo',
      defaultSettings: {
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      },
      timeout: 60000,
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-3-sonnet-20240229',
      defaultSettings: {
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 1,
      },
      timeout: 60000,
    },
  },

  // Cache configuration
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
    maxSize: 1000, // Maximum number of cached items
    promptModuleTtl: 600000, // 10 minutes for prompt modules
    searchResultsTtl: 60000, // 1 minute for search results
  },

  // Validation configuration
  validation: {
    maxPromptLength: 50000, // Maximum prompt template length
    maxInputSize: 100000, // Maximum input data size in bytes
    maxOutputSize: 500000, // Maximum output data size in bytes
    allowedFileTypes: ['json', 'txt', 'md'], // Allowed file types for uploads
    maxDagNodes: 50, // Maximum nodes in a DAG
    maxDagDepth: 10, // Maximum depth of DAG
  },

  // Security configuration
  security: {
    enableInputSanitization: true,
    enableOutputFiltering: true,
    maxExecutionTime: 300000, // 5 minutes
    rateLimiting: {
      enabled: true,
      windowMs: 60000, // 1 minute
      maxRequests: 100, // Max requests per window
    },
  },

  // Logging configuration
  logging: {
    level: 'info', // debug, info, warn, error
    enableConsole: true,
    enableFile: false,
    enableMetrics: true,
    metricsInterval: 60000, // 1 minute
  },

  // IPFS configuration
  ipfs: {
    gateway: 'https://ipfs.io/ipfs/',
    uploadEndpoint: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
    timeout: 30000, // 30 seconds
    maxFileSize: 10485760, // 10MB
  },

  // Error handling configuration
  errorHandling: {
    enableRetry: true,
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    exponentialBackoff: true,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5, // Failures before opening circuit
    circuitBreakerTimeout: 60000, // 1 minute
  },

  // Feature flags
  features: {
    enableDAGExecution: true,
    enablePromptCaching: true,
    enableMetrics: true,
    enableStreamingResponses: true,
    enableBatchExecution: false, // Future feature
    enablePromptVersioning: true,
    enableAccessControl: true,
  },
};

/**
 * Environment-specific configuration overrides
 */
export const environmentConfigs = {
  development: {
    logging: {
      level: 'debug',
      enableConsole: true,
      enableFile: true,
    },
    security: {
      rateLimiting: {
        enabled: false,
      },
    },
    cache: {
      ttl: 60000, // 1 minute for faster development
    },
  },

  testing: {
    blockchain: {
      network: 'localnet',
      rpcUrl: 'http://localhost:8899',
    },
    cache: {
      enabled: false,
    },
    logging: {
      level: 'warn',
      enableConsole: false,
    },
    security: {
      rateLimiting: {
        enabled: false,
      },
    },
  },

  production: {
    logging: {
      level: 'info',
      enableConsole: false,
      enableFile: true,
    },
    security: {
      rateLimiting: {
        enabled: true,
        maxRequests: 50, // More restrictive in production
      },
    },
    blockchain: {
      commitment: 'finalized',
    },
    errorHandling: {
      enableCircuitBreaker: true,
    },
  },
};

/**
 * Get configuration for current environment
 */
export function getConfig(environment: string = 'development') {
  const envConfig = environmentConfigs[environment as keyof typeof environmentConfigs] || {};
  
  // Deep merge default config with environment-specific overrides
  return mergeDeep(defaultConfig, envConfig);
}

/**
 * Deep merge utility function
 */
function mergeDeep(target: any, source: any): any {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = mergeDeep(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * Validate configuration
 */
export function validateConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate required fields
  if (!config.server?.name) {
    errors.push('Server name is required');
  }

  if (!config.server?.version) {
    errors.push('Server version is required');
  }

  if (!config.blockchain) {
    errors.push('Blockchain configuration is required');
  }

  // Validate blockchain config
  if (config.blockchain) {
    const requiredBlockchainFields = ['network', 'rpcUrl', 'programId'];
    for (const field of requiredBlockchainFields) {
      if (!config.blockchain[field]) {
        errors.push(`Blockchain ${field} is required`);
      }
    }
  }

  // Validate numeric values
  if (config.server?.timeout && config.server.timeout < 1000) {
    errors.push('Server timeout must be at least 1000ms');
  }

  if (config.cache?.ttl && config.cache.ttl < 1000) {
    errors.push('Cache TTL must be at least 1000ms');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
} 