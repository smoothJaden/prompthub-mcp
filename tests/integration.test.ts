import { MCPServer } from '../src/core/mcp-server.js';
import { PromptModule } from '../src/core/prompt-module.js';
import { VaultClient } from '../src/core/vault-client.js';
import { PromptRouter } from '../src/core/prompt-router.js';
import { ModelProviderManager } from '../src/providers/index.js';
import { ExecutionContextManager } from '../src/context/index.js';
import { createServerFactory } from '../src/utils/server-factory.js';
import { PromptDefinition } from '../src/types/index.js';

describe('Integration Tests', () => {
  let mcpServer: MCPServer;
  
  const testPromptDefinition: PromptDefinition = {
    id: 'integration-test-prompt',
    name: 'Integration Test Prompt',
    description: 'A prompt for integration testing',
    version: '1.0.0',
    author: 'test-author',
    template: 'Generate a {{type}} about {{topic}}. Make it {{style}}.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['story', 'poem', 'essay'] },
        topic: { type: 'string' },
        style: { type: 'string', enum: ['formal', 'casual', 'creative'] }
      },
      required: ['type', 'topic', 'style']
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        wordCount: { type: 'number' }
      }
    },
    metadata: {
      tags: ['creative', 'writing'],
      category: 'content-generation',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    access: {
      type: 'public'
    },
    dependencies: [],
    royalty: {
      percentage: 5,
      recipient: 'author-wallet'
    }
  };

  beforeAll(async () => {
    // Create server using factory
    mcpServer = createServerFactory({
      environment: 'test',
      blockchain: {
        network: 'localnet',
        rpcUrl: 'http://localhost:8899',
        programId: 'test-program-id'
      },
      models: {
        openai: {
          apiKey: 'test-openai-key'
        },
        anthropic: {
          apiKey: 'test-anthropic-key'
        },
        defaultProvider: 'openai'
      }
    });

    await mcpServer.initialize();
  });

  afterAll(async () => {
    await mcpServer.shutdown();
  });

  describe('End-to-End Prompt Execution', () => {
    test('should execute a complete prompt workflow', async () => {
      // 1. Register prompt in vault (mocked)
      const vaultClient = (mcpServer as any).vaultClient;
      jest.spyOn(vaultClient, 'getPrompt').mockResolvedValue(testPromptDefinition);
      jest.spyOn(vaultClient, 'validateAccess').mockResolvedValue(true);

      // 2. Search for prompts
      const searchRequest = {
        method: 'tools/call',
        params: {
          name: 'search_prompts',
          arguments: {
            query: 'creative writing',
            limit: 5
          }
        }
      };

      const searchResponse = await mcpServer.handleRequest(searchRequest);
      expect(searchResponse.result).toBeDefined();
      expect(searchResponse.result.prompts).toBeDefined();

      // 3. Get prompt information
      const infoRequest = {
        method: 'tools/call',
        params: {
          name: 'get_prompt_info',
          arguments: {
            promptId: 'integration-test-prompt'
          }
        }
      };

      const infoResponse = await mcpServer.handleRequest(infoRequest);
      expect(infoResponse.result).toBeDefined();
      expect(infoResponse.result.id).toBe('integration-test-prompt');

      // 4. Validate inputs
      const validateRequest = {
        method: 'tools/call',
        params: {
          name: 'validate_prompt_input',
          arguments: {
            promptId: 'integration-test-prompt',
            inputs: {
              type: 'story',
              topic: 'artificial intelligence',
              style: 'creative'
            }
          }
        }
      };

      const validateResponse = await mcpServer.handleRequest(validateRequest);
      expect(validateResponse.result).toBeDefined();
      expect(validateResponse.result.valid).toBe(true);

      // 5. Execute prompt
      const executeRequest = {
        method: 'tools/call',
        params: {
          name: 'execute_prompt',
          arguments: {
            promptId: 'integration-test-prompt',
            inputs: {
              type: 'story',
              topic: 'artificial intelligence',
              style: 'creative'
            },
            userId: 'test-user',
            sessionId: 'test-session'
          }
        }
      };

      // Mock the model provider response
      const modelProvider = (mcpServer as any).modelProvider;
      jest.spyOn(modelProvider, 'executePrompt').mockResolvedValue({
        content: 'Once upon a time, in a world where artificial intelligence...',
        usage: { tokens: 150 },
        model: 'gpt-3.5-turbo'
      });

      const executeResponse = await mcpServer.handleRequest(executeRequest);
      expect(executeResponse.result).toBeDefined();
      expect(executeResponse.result.success).toBe(true);
      expect(executeResponse.result.result).toBeDefined();
    });

    test('should handle prompt composition with DAG', async () => {
      // Create a simple DAG with two prompts
      const dag = {
        nodes: [
          {
            id: 'topic-generator',
            promptId: 'topic-generator-prompt',
            inputs: { domain: 'technology' }
          },
          {
            id: 'story-writer',
            promptId: 'integration-test-prompt',
            inputs: {
              type: 'story',
              topic: '${topic-generator.topic}',
              style: 'creative'
            }
          }
        ],
        edges: [
          {
            from: 'topic-generator',
            to: 'story-writer',
            mapping: { topic: 'topic' }
          }
        ]
      };

      // Mock the topic generator prompt
      const topicGeneratorPrompt: PromptDefinition = {
        id: 'topic-generator-prompt',
        name: 'Topic Generator',
        description: 'Generates topics for content creation',
        version: '1.0.0',
        author: 'test-author',
        template: 'Generate an interesting topic about {{domain}}',
        inputSchema: {
          type: 'object',
          properties: {
            domain: { type: 'string' }
          },
          required: ['domain']
        },
        outputSchema: {
          type: 'object',
          properties: {
            topic: { type: 'string' }
          }
        },
        metadata: {
          tags: ['utility'],
          category: 'content-generation',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        access: { type: 'public' },
        dependencies: [],
        royalty: { percentage: 0, recipient: '' }
      };

      // Mock vault responses
      const vaultClient = (mcpServer as any).vaultClient;
      jest.spyOn(vaultClient, 'getPrompt')
        .mockImplementation((promptId: string) => {
          if (promptId === 'topic-generator-prompt') {
            return Promise.resolve(topicGeneratorPrompt);
          }
          return Promise.resolve(testPromptDefinition);
        });

      // Mock model responses
      const modelProvider = (mcpServer as any).modelProvider;
      jest.spyOn(modelProvider, 'executePrompt')
        .mockImplementation((prompt: string) => {
          if (prompt.includes('Generate an interesting topic')) {
            return Promise.resolve({
              topic: 'The future of quantum computing',
              usage: { tokens: 50 },
              model: 'gpt-3.5-turbo'
            });
          }
          return Promise.resolve({
            content: 'A fascinating story about quantum computing...',
            wordCount: 200,
            usage: { tokens: 200 },
            model: 'gpt-3.5-turbo'
          });
        });

      const dagRequest = {
        method: 'tools/call',
        params: {
          name: 'compose_prompt_dag',
          arguments: {
            dag,
            userId: 'test-user',
            sessionId: 'test-session'
          }
        }
      };

      const dagResponse = await mcpServer.handleRequest(dagRequest);
      expect(dagResponse.result).toBeDefined();
      expect(dagResponse.result.success).toBe(true);
      expect(dagResponse.result.results).toBeDefined();
      expect(dagResponse.result.executionOrder).toEqual(['topic-generator', 'story-writer']);
    });
  });

  describe('Resource Access', () => {
    test('should access vault resources', async () => {
      const vaultClient = (mcpServer as any).vaultClient;
      jest.spyOn(vaultClient, 'getPrompt').mockResolvedValue(testPromptDefinition);

      const resourceRequest = {
        method: 'resources/read',
        params: {
          uri: 'vault://prompts/integration-test-prompt'
        }
      };

      const resourceResponse = await mcpServer.handleRequest(resourceRequest);
      expect(resourceResponse.result).toBeDefined();
      expect(resourceResponse.result.contents).toBeDefined();
    });

    test('should access execution context resources', async () => {
      // First create an execution context
      const contextManager = (mcpServer as any).contextManager;
      const context = contextManager.createContext(
        'test-session',
        'test-user',
        testPromptDefinition,
        { type: 'story', topic: 'AI', style: 'creative' }
      );

      const resourceRequest = {
        method: 'resources/read',
        params: {
          uri: `context://execution/${context.contextId}`
        }
      };

      const resourceResponse = await mcpServer.handleRequest(resourceRequest);
      expect(resourceResponse.result).toBeDefined();
      expect(resourceResponse.result.contents).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle network errors gracefully', async () => {
      const vaultClient = (mcpServer as any).vaultClient;
      jest.spyOn(vaultClient, 'getPrompt').mockRejectedValue(new Error('Network timeout'));

      const request = {
        method: 'tools/call',
        params: {
          name: 'get_prompt_info',
          arguments: {
            promptId: 'non-existent-prompt'
          }
        }
      };

      const response = await mcpServer.handleRequest(request);
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Network timeout');
    });

    test('should handle invalid inputs', async () => {
      const request = {
        method: 'tools/call',
        params: {
          name: 'execute_prompt',
          arguments: {
            promptId: 'integration-test-prompt',
            inputs: {
              type: 'invalid-type',
              topic: '',
              style: 'invalid-style'
            },
            userId: 'test-user',
            sessionId: 'test-session'
          }
        }
      };

      const vaultClient = (mcpServer as any).vaultClient;
      jest.spyOn(vaultClient, 'getPrompt').mockResolvedValue(testPromptDefinition);

      const response = await mcpServer.handleRequest(request);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('VALIDATION_ERROR');
    });

    test('should handle access control violations', async () => {
      const restrictedPrompt = {
        ...testPromptDefinition,
        id: 'restricted-prompt',
        access: {
          type: 'private' as const,
          allowedUsers: ['authorized-user']
        }
      };

      const vaultClient = (mcpServer as any).vaultClient;
      jest.spyOn(vaultClient, 'getPrompt').mockResolvedValue(restrictedPrompt);
      jest.spyOn(vaultClient, 'validateAccess').mockResolvedValue(false);

      const request = {
        method: 'tools/call',
        params: {
          name: 'execute_prompt',
          arguments: {
            promptId: 'restricted-prompt',
            inputs: {
              type: 'story',
              topic: 'AI',
              style: 'creative'
            },
            userId: 'unauthorized-user',
            sessionId: 'test-session'
          }
        }
      };

      const response = await mcpServer.handleRequest(request);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe('ACCESS_DENIED');
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle concurrent requests', async () => {
      const vaultClient = (mcpServer as any).vaultClient;
      jest.spyOn(vaultClient, 'getPrompt').mockResolvedValue(testPromptDefinition);
      jest.spyOn(vaultClient, 'validateAccess').mockResolvedValue(true);

      const modelProvider = (mcpServer as any).modelProvider;
      jest.spyOn(modelProvider, 'executePrompt').mockResolvedValue({
        content: 'Test response',
        usage: { tokens: 50 },
        model: 'gpt-3.5-turbo'
      });

      const requests = Array.from({ length: 10 }, (_, i) => ({
        method: 'tools/call',
        params: {
          name: 'execute_prompt',
          arguments: {
            promptId: 'integration-test-prompt',
            inputs: {
              type: 'story',
              topic: `Topic ${i}`,
              style: 'creative'
            },
            userId: `user-${i}`,
            sessionId: `session-${i}`
          }
        }
      }));

      const responses = await Promise.all(
        requests.map(request => mcpServer.handleRequest(request))
      );

      expect(responses).toHaveLength(10);
      responses.forEach(response => {
        expect(response.result).toBeDefined();
        expect(response.result.success).toBe(true);
      });
    });

    test('should cleanup expired contexts', async () => {
      const contextManager = (mcpServer as any).contextManager;
      
      // Create multiple contexts
      for (let i = 0; i < 5; i++) {
        contextManager.createContext(
          `session-${i}`,
          `user-${i}`,
          testPromptDefinition,
          { type: 'story', topic: `Topic ${i}`, style: 'creative' }
        );
      }

      const statsBefore = contextManager.getStats();
      expect(statsBefore.activeContexts).toBe(5);

      // Cleanup with very short max age to force cleanup
      contextManager.cleanupExpiredContexts(1);

      const statsAfter = contextManager.getStats();
      expect(statsAfter.activeContexts).toBeLessThan(statsBefore.activeContexts);
    });
  });
}); 