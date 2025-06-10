import { MCPServer } from '../src/core/mcp-server.js';
import { PromptModule } from '../src/core/prompt-module.js';
import { VaultClient } from '../src/core/vault-client.js';
import { PromptRouter } from '../src/core/prompt-router.js';
import { ModelProviderManager } from '../src/providers/index.js';
import { ExecutionContextManager } from '../src/context/index.js';
import { PromptDefinition, MCPRequest, MCPResponse } from '../src/types/index.js';

// Mock dependencies
jest.mock('../src/core/prompt-module.js');
jest.mock('../src/core/vault-client.js');
jest.mock('../src/core/prompt-router.js');
jest.mock('../src/providers/index.js');
jest.mock('../src/context/index.js');

describe('MCPServer', () => {
  let mcpServer: MCPServer;
  let mockPromptModule: jest.Mocked<PromptModule>;
  let mockVaultClient: jest.Mocked<VaultClient>;
  let mockPromptRouter: jest.Mocked<PromptRouter>;
  let mockModelProvider: jest.Mocked<ModelProviderManager>;
  let mockContextManager: jest.Mocked<ExecutionContextManager>;

  const mockPromptDefinition: PromptDefinition = {
    id: 'test-prompt',
    name: 'Test Prompt',
    description: 'A test prompt',
    version: '1.0.0',
    author: 'test-author',
    template: 'Hello {{name}}!',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    },
    outputSchema: {
      type: 'object',
      properties: {
        response: { type: 'string' }
      }
    },
    metadata: {
      tags: ['test'],
      category: 'greeting',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    access: {
      type: 'public'
    },
    dependencies: [],
    royalty: {
      percentage: 0,
      recipient: 'test-recipient'
    }
  };

  beforeEach(() => {
    // Create mocked instances
    mockPromptModule = new PromptModule({} as any) as jest.Mocked<PromptModule>;
    mockVaultClient = new VaultClient({} as any) as jest.Mocked<VaultClient>;
    mockPromptRouter = new PromptRouter({} as any) as jest.Mocked<PromptRouter>;
    mockModelProvider = new ModelProviderManager({} as any) as jest.Mocked<ModelProviderManager>;
    mockContextManager = new ExecutionContextManager() as jest.Mocked<ExecutionContextManager>;

    // Setup default mock implementations
    mockPromptModule.loadPrompt.mockResolvedValue(mockPromptDefinition);
    mockPromptModule.executePrompt.mockResolvedValue({
      success: true,
      result: { response: 'Hello World!' },
      executionTime: 100,
      signature: 'mock-signature',
      metadata: {}
    });

    mockVaultClient.getPrompt.mockResolvedValue(mockPromptDefinition);
    mockVaultClient.validateAccess.mockResolvedValue(true);

    mockPromptRouter.searchPrompts.mockResolvedValue([mockPromptDefinition]);
    mockPromptRouter.getPromptInfo.mockResolvedValue(mockPromptDefinition);

    mockModelProvider.getAvailableProviders.mockReturnValue(['openai', 'anthropic']);

    mockContextManager.createContext.mockReturnValue({
      contextId: 'test-context',
      sessionId: 'test-session',
      userId: 'test-user',
      promptId: 'test-prompt',
      inputs: { name: 'World' },
      outputs: {},
      metadata: {
        startTime: new Date(),
        version: '1.0.0',
        executionSignature: 'test-signature'
      },
      dependencies: new Map(),
      accessTokens: new Map()
    });

    // Create MCPServer instance
    mcpServer = new MCPServer({
      promptModule: mockPromptModule,
      vaultClient: mockVaultClient,
      promptRouter: mockPromptRouter,
      modelProvider: mockModelProvider,
      contextManager: mockContextManager
    });
  });

  describe('Tool Handling', () => {
    test('should handle execute_prompt tool', async () => {
      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: 'execute_prompt',
          arguments: {
            promptId: 'test-prompt',
            inputs: { name: 'World' },
            userId: 'test-user',
            sessionId: 'test-session'
          }
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.success).toBe(true);
      expect(response.result.result.response).toBe('Hello World!');
      expect(mockPromptModule.executePrompt).toHaveBeenCalledWith(
        mockPromptDefinition,
        { name: 'World' },
        expect.any(Object)
      );
    });

    test('should handle search_prompts tool', async () => {
      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: 'search_prompts',
          arguments: {
            query: 'greeting',
            limit: 10
          }
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.prompts).toHaveLength(1);
      expect(response.result.prompts[0].id).toBe('test-prompt');
      expect(mockPromptRouter.searchPrompts).toHaveBeenCalledWith('greeting', { limit: 10 });
    });

    test('should handle get_prompt_info tool', async () => {
      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: 'get_prompt_info',
          arguments: {
            promptId: 'test-prompt'
          }
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.id).toBe('test-prompt');
      expect(response.result.name).toBe('Test Prompt');
      expect(mockPromptRouter.getPromptInfo).toHaveBeenCalledWith('test-prompt');
    });

    test('should handle validate_prompt_input tool', async () => {
      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: 'validate_prompt_input',
          arguments: {
            promptId: 'test-prompt',
            inputs: { name: 'World' }
          }
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.valid).toBe(true);
      expect(mockPromptModule.validateInputs).toHaveBeenCalledWith(
        mockPromptDefinition,
        { name: 'World' }
      );
    });

    test('should handle compose_prompt_dag tool', async () => {
      const mockDAG = {
        nodes: [{ id: 'test-prompt', promptId: 'test-prompt', inputs: {} }],
        edges: []
      };

      mockPromptRouter.executeDAG.mockResolvedValue({
        success: true,
        results: new Map([['test-prompt', { response: 'Hello World!' }]]),
        executionOrder: ['test-prompt'],
        totalExecutionTime: 100
      });

      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: 'compose_prompt_dag',
          arguments: {
            dag: mockDAG,
            userId: 'test-user',
            sessionId: 'test-session'
          }
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.success).toBe(true);
      expect(mockPromptRouter.executeDAG).toHaveBeenCalledWith(mockDAG, expect.any(Object));
    });

    test('should handle unknown tool', async () => {
      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('TOOL_NOT_FOUND');
    });
  });

  describe('Resource Handling', () => {
    test('should handle vault resource', async () => {
      const request: MCPRequest = {
        method: 'resources/read',
        params: {
          uri: 'vault://prompts/test-prompt'
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.contents).toBeDefined();
      expect(mockVaultClient.getPrompt).toHaveBeenCalledWith('test-prompt');
    });

    test('should handle context resource', async () => {
      const request: MCPRequest = {
        method: 'resources/read',
        params: {
          uri: 'context://execution/test-context'
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(mockContextManager.getContext).toHaveBeenCalledWith('test-context');
    });

    test('should handle unknown resource', async () => {
      const request: MCPRequest = {
        method: 'resources/read',
        params: {
          uri: 'unknown://resource'
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('Error Handling', () => {
    test('should handle prompt execution errors', async () => {
      mockPromptModule.executePrompt.mockRejectedValue(new Error('Execution failed'));

      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: 'execute_prompt',
          arguments: {
            promptId: 'test-prompt',
            inputs: { name: 'World' },
            userId: 'test-user',
            sessionId: 'test-session'
          }
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Execution failed');
    });

    test('should handle validation errors', async () => {
      mockPromptModule.validateInputs.mockReturnValue({
        valid: false,
        errors: ['Name is required']
      });

      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: 'validate_prompt_input',
          arguments: {
            promptId: 'test-prompt',
            inputs: {}
          }
        }
      };

      const response = await mcpServer.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.valid).toBe(false);
      expect(response.result.errors).toContain('Name is required');
    });
  });

  describe('Server Lifecycle', () => {
    test('should initialize server', async () => {
      await mcpServer.initialize();
      expect(mcpServer.isInitialized()).toBe(true);
    });

    test('should shutdown server', async () => {
      await mcpServer.initialize();
      await mcpServer.shutdown();
      expect(mcpServer.isInitialized()).toBe(false);
    });

    test('should get server info', () => {
      const info = mcpServer.getServerInfo();
      expect(info.name).toBe('PromptHub MCP Server');
      expect(info.version).toBeDefined();
      expect(info.tools).toHaveLength(5);
      expect(info.resources).toHaveLength(2);
    });
  });
}); 