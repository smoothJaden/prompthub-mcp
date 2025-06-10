import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PromptModule } from './prompt-module.js';
import { PromptVaultClient } from './vault-client.js';
import { PromptRouter } from './prompt-router.js';
import {
  PromptExecutionRequest,
  PromptExecutionResult,
  MCPTool,
  MCPResource,
  PromptHubMCPError,
  ErrorCodes,
  ExecutionContext,
} from '../types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * PromptHub MCP Server
 * Implements the Model Context Protocol for PromptHub integration
 */
export class PromptHubMCPServer {
  private server: Server;
  private vaultClient: PromptVaultClient;
  private promptRouter: PromptRouter;
  private loadedModules: Map<string, PromptModule> = new Map();

  constructor(
    name: string,
    version: string,
    vaultClient: PromptVaultClient,
    promptRouter: PromptRouter
  ) {
    this.server = new Server(
      {
        name,
        version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.vaultClient = vaultClient;
    this.promptRouter = promptRouter;

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools (prompts as tools)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: MCPTool[] = [];

      // Add core PromptHub tools
      tools.push({
        name: 'execute_prompt',
        description: 'Execute a prompt from PromptHub vault',
        inputSchema: {
          type: 'object',
          properties: {
            promptId: {
              type: 'string',
              description: 'The ID of the prompt to execute',
            },
            version: {
              type: 'string',
              description: 'Specific version of the prompt (optional)',
            },
            inputs: {
              type: 'object',
              description: 'Input parameters for the prompt',
            },
            modelProvider: {
              type: 'string',
              description: 'Preferred AI model provider (optional)',
            },
          },
          required: ['promptId', 'inputs'],
        },
      });

      tools.push({
        name: 'search_prompts',
        description: 'Search for prompts in the PromptHub vault',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for prompts',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags',
            },
            author: {
              type: 'string',
              description: 'Filter by author',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 10,
            },
          },
          required: ['query'],
        },
      });

      tools.push({
        name: 'get_prompt_info',
        description: 'Get detailed information about a specific prompt',
        inputSchema: {
          type: 'object',
          properties: {
            promptId: {
              type: 'string',
              description: 'The ID of the prompt',
            },
            version: {
              type: 'string',
              description: 'Specific version (optional)',
            },
          },
          required: ['promptId'],
        },
      });

      tools.push({
        name: 'validate_prompt_input',
        description: 'Validate input parameters against a prompt schema',
        inputSchema: {
          type: 'object',
          properties: {
            promptId: {
              type: 'string',
              description: 'The ID of the prompt',
            },
            inputs: {
              type: 'object',
              description: 'Input parameters to validate',
            },
          },
          required: ['promptId', 'inputs'],
        },
      });

      tools.push({
        name: 'compose_prompt_dag',
        description: 'Execute a composed DAG of multiple prompts',
        inputSchema: {
          type: 'object',
          properties: {
            dag: {
              type: 'object',
              description: 'DAG definition with nodes and edges',
            },
            rootInputs: {
              type: 'object',
              description: 'Initial inputs for the DAG',
            },
          },
          required: ['dag', 'rootInputs'],
        },
      });

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'execute_prompt':
            return await this.handleExecutePrompt(args);
          
          case 'search_prompts':
            return await this.handleSearchPrompts(args);
          
          case 'get_prompt_info':
            return await this.handleGetPromptInfo(args);
          
          case 'validate_prompt_input':
            return await this.handleValidatePromptInput(args);
          
          case 'compose_prompt_dag':
            return await this.handleComposePromptDAG(args);
          
          default:
            throw new PromptHubMCPError(
              ErrorCodes.INVALID_INPUT,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof PromptHubMCPError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                  },
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  code: ErrorCodes.EXECUTION_FAILED,
                  message: error instanceof Error ? error.message : 'Unknown error',
                  details: error,
                },
              }),
            },
          ],
          isError: true,
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources: MCPResource[] = [];

      // Add PromptHub resources
      resources.push({
        uri: 'prompthub://vault/prompts',
        name: 'PromptHub Vault',
        description: 'Access to all prompts in the PromptHub vault',
        mimeType: 'application/json',
      });

      resources.push({
        uri: 'prompthub://vault/metadata',
        name: 'Vault Metadata',
        description: 'Metadata about the PromptHub vault',
        mimeType: 'application/json',
      });

      return { resources };
    });

    // Handle resource reads
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'prompthub://vault/prompts') {
        const prompts = await this.vaultClient.listPrompts();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(prompts, null, 2),
            },
          ],
        };
      }

      if (uri === 'prompthub://vault/metadata') {
        const metadata = await this.vaultClient.getVaultMetadata();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(metadata, null, 2),
            },
          ],
        };
      }

      throw new PromptHubMCPError(
        ErrorCodes.PROMPT_NOT_FOUND,
        `Resource not found: ${uri}`
      );
    });
  }

  private async handleExecutePrompt(args: any) {
    const { promptId, version, inputs, modelProvider } = args;

    // Load or get cached prompt module
    const module = await this.getPromptModule(promptId, version);

    // Create execution context
    const context: ExecutionContext = {
      caller: 'mcp-client', // TODO: Get actual caller identity
      modelProvider,
      timestamp: Date.now(),
      requestId: uuidv4(),
    };

    // Execute the prompt
    const result = await module.execute(inputs, context);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async handleSearchPrompts(args: any) {
    const { query, tags, author, limit = 10 } = args;

    const results = await this.promptRouter.searchPrompts({
      query,
      tags,
      author,
      limit,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  }

  private async handleGetPromptInfo(args: any) {
    const { promptId, version } = args;

    const module = await this.getPromptModule(promptId, version);
    const metadata = module.getMetadata();
    const definition = module.getDefinition();

    const info = {
      metadata,
      definition,
      royaltyInfo: module.getRoyaltyInfo(),
      accessControl: module.getAccessControl(),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  }

  private async handleValidatePromptInput(args: any) {
    const { promptId, inputs } = args;

    const module = await this.getPromptModule(promptId);
    const validation = module.validateInput(inputs);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(validation, null, 2),
        },
      ],
    };
  }

  private async handleComposePromptDAG(args: any) {
    const { dag, rootInputs } = args;

    // Execute DAG through PromptRouter
    const result = await this.promptRouter.executeDag(dag, rootInputs);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async getPromptModule(promptId: string, version?: string): Promise<PromptModule> {
    const cacheKey = `${promptId}@${version || 'latest'}`;

    if (this.loadedModules.has(cacheKey)) {
      return this.loadedModules.get(cacheKey)!;
    }

    // Load prompt from vault
    const promptData = await this.vaultClient.getPrompt(promptId, version);
    if (!promptData) {
      throw new PromptHubMCPError(
        ErrorCodes.PROMPT_NOT_FOUND,
        `Prompt not found: ${promptId}${version ? `@${version}` : ''}`
      );
    }

    // Create and cache module
    const module = new PromptModule(promptData.definition, promptData.metadata);
    this.loadedModules.set(cacheKey, module);

    return module;
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    // Connect to stdin/stdout for MCP communication
    const transport = this.server.connect();
    
    console.error('PromptHub MCP Server started');
    
    // Keep the process alive
    process.on('SIGINT', async () => {
      console.error('Shutting down PromptHub MCP Server');
      await transport.close();
      process.exit(0);
    });
  }

  /**
   * Get the underlying MCP server instance
   */
  getServer(): Server {
    return this.server;
  }
} 