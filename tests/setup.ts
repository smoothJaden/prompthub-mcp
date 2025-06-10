// Test setup file
import { jest } from '@jest/globals';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock environment variables
process.env.NODE_ENV = 'test';

// Global test timeout
jest.setTimeout(30000);

// Mock Solana Web3.js to avoid network calls in tests
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getVersion: jest.fn().mockResolvedValue({ 'solana-core': '1.16.0' }),
    getAccountInfo: jest.fn().mockResolvedValue(null),
  })),
  PublicKey: jest.fn().mockImplementation((key) => ({ toString: () => key })),
  Keypair: {
    fromSecretKey: jest.fn().mockReturnValue({
      publicKey: { toString: () => 'mock-public-key' },
      secretKey: new Uint8Array(64),
    }),
  },
}));

// Mock Anchor
jest.mock('@coral-xyz/anchor', () => ({
  AnchorProvider: jest.fn(),
  Wallet: jest.fn(),
  setProvider: jest.fn(),
  web3: {
    PublicKey: {
      findProgramAddressSync: jest.fn().mockReturnValue([
        { toString: () => 'mock-pda' },
        255,
      ]),
    },
    SystemProgram: {
      programId: { toString: () => 'system-program-id' },
    },
  },
}));

// Mock axios for HTTP requests
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
  })),
  get: jest.fn(),
  post: jest.fn(),
}));

// Mock file system operations
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
}));

// Global test utilities
global.createMockPromptDefinition = () => ({
  id: 'test-prompt',
  name: 'Test Prompt',
  description: 'A test prompt for unit testing',
  version: '1.0.0',
  author: 'test-author',
  license: 'MIT',
  inputs: {
    text: {
      type: 'string',
      required: true,
      description: 'Input text to process',
    },
  },
  template: 'Process this text: {{text}}',
  output_schema: {
    type: 'object',
    properties: {
      result: { type: 'string' },
    },
  },
  tags: ['test', 'utility'],
});

global.createMockExecutionContext = () => ({
  caller: 'test-caller',
  timestamp: Date.now(),
  requestId: 'test-request-id',
});

global.createMockPromptMetadata = () => ({
  id: 'test-prompt',
  name: 'Test Prompt',
  description: 'A test prompt for unit testing',
  version: '1.0.0',
  author: 'test-author',
  license: 'MIT',
  tags: ['test', 'utility'],
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
  executionCount: 0,
  accessPolicy: {
    type: 'public',
  },
  royaltyConfig: {
    creatorShare: 6000,
    daoShare: 1500,
    validatorShare: 1500,
    burnShare: 1000,
  },
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
}); 