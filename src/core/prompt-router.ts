import { PromptVaultClient } from './vault-client';
import { PromptModule } from './prompt-module';
import {
  PromptMetadata,
  PromptDefinition,
  ExecutionContext,
  PromptExecutionResult,
  PromptHubMCPError,
  ErrorCodes,
} from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Search query interface
 */
export interface SearchQuery {
  query: string;
  tags?: string[];
  author?: string;
  domain?: string;
  outputFormat?: string;
  modelProvider?: string;
  limit?: number;
  offset?: number;
}

/**
 * DAG node definition
 */
export interface DAGNode {
  id: string;
  promptId: string;
  version?: string;
  inputs: Record<string, any>;
  dependencies: string[]; // IDs of nodes this depends on
}

/**
 * DAG definition
 */
export interface DAGDefinition {
  id: string;
  name: string;
  description: string;
  nodes: DAGNode[];
  edges: Array<{
    from: string;
    to: string;
    outputKey?: string;
    inputKey?: string;
  }>;
}

/**
 * DAG execution result
 */
export interface DAGExecutionResult {
  success: boolean;
  results: Record<string, any>; // Node ID -> execution result
  executionOrder: string[];
  totalExecutionTime: number;
  error?: {
    nodeId: string;
    error: any;
  };
}

/**
 * PromptRouter - Semantic routing and orchestration for prompts
 */
export class PromptRouter {
  private vaultClient: PromptVaultClient;
  private moduleCache: Map<string, PromptModule> = new Map();
  private searchIndex: Map<string, PromptMetadata[]> = new Map();

  constructor(vaultClient: PromptVaultClient) {
    this.vaultClient = vaultClient;
  }

  /**
   * Initialize the router and build search indices
   */
  async initialize(): Promise<void> {
    try {
      await this.buildSearchIndex();
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.EXECUTION_FAILED,
        'Failed to initialize prompt router',
        error
      );
    }
  }

  /**
   * Search for prompts using semantic query
   */
  async searchPrompts(query: SearchQuery): Promise<PromptMetadata[]> {
    try {
      // Get all prompts from vault
      const allPrompts = await this.vaultClient.listPrompts({
        author: query.author,
        limit: query.limit,
        offset: query.offset,
      });

      // Filter by query terms
      let results = allPrompts.filter(prompt => {
        // Text search in name and description
        const searchText = `${prompt.name} ${prompt.description}`.toLowerCase();
        const queryLower = query.query.toLowerCase();
        
        if (!searchText.includes(queryLower)) {
          return false;
        }

        // Filter by tags if specified
        if (query.tags && query.tags.length > 0) {
          const hasMatchingTag = query.tags.some(tag => 
            prompt.tags.some(promptTag => 
              promptTag.toLowerCase().includes(tag.toLowerCase())
            )
          );
          if (!hasMatchingTag) {
            return false;
          }
        }

        return true;
      });

      // Sort by relevance (simple scoring for now)
      results = results.sort((a, b) => {
        const scoreA = this.calculateRelevanceScore(a, query);
        const scoreB = this.calculateRelevanceScore(b, query);
        return scoreB - scoreA;
      });

      return results.slice(0, query.limit || 10);
    } catch (error) {
      throw new PromptHubMCPError(
        ErrorCodes.EXECUTION_FAILED,
        'Failed to search prompts',
        error
      );
    }
  }

  /**
   * Resolve a prompt by semantic query
   */
  async resolvePrompt(query: SearchQuery): Promise<PromptMetadata | null> {
    const results = await this.searchPrompts({ ...query, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute a single prompt
   */
  async executePrompt(
    promptId: string,
    inputs: Record<string, any>,
    context: ExecutionContext,
    version?: string
  ): Promise<PromptExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();

    try {
      // Get or load prompt module
      const module = await this.getPromptModule(promptId, version);

      // Execute the prompt
      const result = await module.execute(inputs, {
        ...context,
        requestId: executionId,
      });

      const executionTime = Date.now() - startTime;

      // Record execution on-chain if successful
      if (result.success && context.caller) {
        try {
          await this.vaultClient.recordExecution(
            promptId,
            executionId,
            this.hashObject(inputs),
            this.hashObject(result.output),
            result.success,
            executionTime
          );
        } catch (recordError) {
          console.warn('Failed to record execution on-chain:', recordError);
        }
      }

      return {
        success: result.success,
        output: result.output,
        metadata: {
          promptId,
          version: version || 'latest',
          executionId,
          timestamp: startTime,
          executionTime,
          tokenUsage: result.tokenUsage,
          modelProvider: context.modelProvider,
        },
        signature: result.signature,
        error: result.success ? undefined : {
          code: ErrorCodes.EXECUTION_FAILED,
          message: 'Prompt execution failed',
          details: result.metadata,
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        output: null,
        metadata: {
          promptId,
          version: version || 'latest',
          executionId,
          timestamp: startTime,
          executionTime,
        },
        error: {
          code: error instanceof PromptHubMCPError ? error.code : ErrorCodes.EXECUTION_FAILED,
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        },
      };
    }
  }

  /**
   * Execute a DAG of prompts
   */
  async executeDag(
    dag: DAGDefinition,
    rootInputs: Record<string, any>,
    context?: Partial<ExecutionContext>
  ): Promise<DAGExecutionResult> {
    const startTime = Date.now();
    const results: Record<string, any> = {};
    const executionOrder: string[] = [];

    try {
      // Validate DAG structure
      this.validateDAG(dag);

      // Topological sort to determine execution order
      const sortedNodes = this.topologicalSort(dag);

      // Execute nodes in order
      for (const node of sortedNodes) {
        const nodeStartTime = Date.now();
        
        try {
          // Prepare inputs for this node
          const nodeInputs = this.prepareNodeInputs(node, rootInputs, results);

          // Create execution context
          const nodeContext: ExecutionContext = {
            caller: context?.caller || 'dag-executor',
            modelProvider: context?.modelProvider,
            timestamp: nodeStartTime,
            requestId: uuidv4(),
            previousOutputs: results,
          };

          // Execute the node
          const nodeResult = await this.executePrompt(
            node.promptId,
            nodeInputs,
            nodeContext,
            node.version
          );

          results[node.id] = nodeResult;
          executionOrder.push(node.id);

          // If node failed and no error handling, fail the entire DAG
          if (!nodeResult.success) {
            return {
              success: false,
              results,
              executionOrder,
              totalExecutionTime: Date.now() - startTime,
              error: {
                nodeId: node.id,
                error: nodeResult.error,
              },
            };
          }
        } catch (error) {
          return {
            success: false,
            results,
            executionOrder,
            totalExecutionTime: Date.now() - startTime,
            error: {
              nodeId: node.id,
              error,
            },
          };
        }
      }

      return {
        success: true,
        results,
        executionOrder,
        totalExecutionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        results,
        executionOrder,
        totalExecutionTime: Date.now() - startTime,
        error: {
          nodeId: 'validation',
          error,
        },
      };
    }
  }

  /**
   * Get cached prompt module or load from vault
   */
  private async getPromptModule(promptId: string, version?: string): Promise<PromptModule> {
    const cacheKey = `${promptId}@${version || 'latest'}`;

    if (this.moduleCache.has(cacheKey)) {
      return this.moduleCache.get(cacheKey)!;
    }

    // Load from vault
    const promptData = await this.vaultClient.getPrompt(promptId, version);
    if (!promptData) {
      throw new PromptHubMCPError(
        ErrorCodes.PROMPT_NOT_FOUND,
        `Prompt not found: ${promptId}${version ? `@${version}` : ''}`
      );
    }

    // Create module and cache it
    const module = new PromptModule(promptData.definition, promptData.metadata);
    this.moduleCache.set(cacheKey, module);

    return module;
  }

  /**
   * Build search index for faster queries
   */
  private async buildSearchIndex(): Promise<void> {
    try {
      const allPrompts = await this.vaultClient.listPrompts();

      // Build tag index
      const tagIndex = new Map<string, PromptMetadata[]>();
      
      for (const prompt of allPrompts) {
        for (const tag of prompt.tags) {
          if (!tagIndex.has(tag)) {
            tagIndex.set(tag, []);
          }
          tagIndex.get(tag)!.push(prompt);
        }
      }

      this.searchIndex = tagIndex;
    } catch (error) {
      console.warn('Failed to build search index:', error);
    }
  }

  /**
   * Calculate relevance score for search results
   */
  private calculateRelevanceScore(prompt: PromptMetadata, query: SearchQuery): number {
    let score = 0;

    // Name match (highest weight)
    if (prompt.name.toLowerCase().includes(query.query.toLowerCase())) {
      score += 10;
    }

    // Description match
    if (prompt.description.toLowerCase().includes(query.query.toLowerCase())) {
      score += 5;
    }

    // Tag matches
    if (query.tags) {
      for (const queryTag of query.tags) {
        for (const promptTag of prompt.tags) {
          if (promptTag.toLowerCase().includes(queryTag.toLowerCase())) {
            score += 3;
          }
        }
      }
    }

    // Execution count (popularity)
    score += Math.log(prompt.executionCount + 1);

    // Rating
    if (prompt.averageRating) {
      score += prompt.averageRating;
    }

    return score;
  }

  /**
   * Validate DAG structure
   */
  private validateDAG(dag: DAGDefinition): void {
    const nodeIds = new Set(dag.nodes.map(n => n.id));

    // Check for duplicate node IDs
    if (nodeIds.size !== dag.nodes.length) {
      throw new PromptHubMCPError(
        ErrorCodes.VALIDATION_ERROR,
        'DAG contains duplicate node IDs'
      );
    }

    // Check that all dependencies exist
    for (const node of dag.nodes) {
      for (const dep of node.dependencies) {
        if (!nodeIds.has(dep)) {
          throw new PromptHubMCPError(
            ErrorCodes.VALIDATION_ERROR,
            `Node ${node.id} depends on non-existent node ${dep}`
          );
        }
      }
    }

    // Check for cycles
    if (this.hasCycles(dag)) {
      throw new PromptHubMCPError(
        ErrorCodes.VALIDATION_ERROR,
        'DAG contains cycles'
      );
    }
  }

  /**
   * Topological sort for DAG execution order
   */
  private topologicalSort(dag: DAGDefinition): DAGNode[] {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const result: DAGNode[] = [];
    const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));

    const visit = (nodeId: string) => {
      if (temp.has(nodeId)) {
        throw new PromptHubMCPError(
          ErrorCodes.VALIDATION_ERROR,
          'DAG contains cycles'
        );
      }
      if (visited.has(nodeId)) {
        return;
      }

      temp.add(nodeId);
      const node = nodeMap.get(nodeId)!;
      
      for (const dep of node.dependencies) {
        visit(dep);
      }

      temp.delete(nodeId);
      visited.add(nodeId);
      result.unshift(node);
    };

    for (const node of dag.nodes) {
      if (!visited.has(node.id)) {
        visit(node.id);
      }
    }

    return result;
  }

  /**
   * Check if DAG has cycles
   */
  private hasCycles(dag: DAGDefinition): boolean {
    try {
      this.topologicalSort(dag);
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Prepare inputs for a DAG node
   */
  private prepareNodeInputs(
    node: DAGNode,
    rootInputs: Record<string, any>,
    previousResults: Record<string, any>
  ): Record<string, any> {
    const inputs = { ...node.inputs };

    // Replace dependency references with actual values
    for (const dep of node.dependencies) {
      if (previousResults[dep] && previousResults[dep].success) {
        // Merge dependency output into inputs
        const depOutput = previousResults[dep].output;
        if (typeof depOutput === 'object' && depOutput !== null) {
          Object.assign(inputs, depOutput);
        }
      }
    }

    // Merge root inputs
    Object.assign(inputs, rootInputs);

    return inputs;
  }

  /**
   * Hash an object for signature generation
   */
  private hashObject(obj: any): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  }
} 