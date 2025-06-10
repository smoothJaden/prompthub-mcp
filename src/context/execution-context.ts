import { ExecutionContext, PromptDefinition, ModuleResponse } from '../types/index.js';
import { createHash } from 'crypto';

/**
 * Execution Context Manager
 * Manages the state and data flow during prompt execution
 */
export class ExecutionContextManager {
  private contexts: Map<string, ExecutionContext> = new Map();
  private executionHistory: Map<string, ModuleResponse[]> = new Map();

  /**
   * Create a new execution context
   */
  createContext(
    sessionId: string,
    userId: string,
    promptDefinition: PromptDefinition,
    inputs: Record<string, any>
  ): ExecutionContext {
    const contextId = this.generateContextId(sessionId, userId, promptDefinition.id);
    
    const context: ExecutionContext = {
      contextId,
      sessionId,
      userId,
      promptId: promptDefinition.id,
      inputs,
      outputs: {},
      metadata: {
        startTime: new Date(),
        version: promptDefinition.version,
        executionSignature: this.generateExecutionSignature(contextId, inputs)
      },
      dependencies: new Map(),
      accessTokens: new Map()
    };

    this.contexts.set(contextId, context);
    this.executionHistory.set(contextId, []);
    
    return context;
  }

  /**
   * Get execution context by ID
   */
  getContext(contextId: string): ExecutionContext | undefined {
    return this.contexts.get(contextId);
  }

  /**
   * Update context with execution results
   */
  updateContext(contextId: string, outputs: Record<string, any>): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.outputs = { ...context.outputs, ...outputs };
      context.metadata.lastUpdated = new Date();
    }
  }

  /**
   * Add execution step to history
   */
  addExecutionStep(contextId: string, response: ModuleResponse): void {
    const history = this.executionHistory.get(contextId);
    if (history) {
      history.push(response);
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(contextId: string): ModuleResponse[] {
    return this.executionHistory.get(contextId) || [];
  }

  /**
   * Set dependency result
   */
  setDependencyResult(contextId: string, dependencyId: string, result: any): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.dependencies.set(dependencyId, result);
    }
  }

  /**
   * Get dependency result
   */
  getDependencyResult(contextId: string, dependencyId: string): any {
    const context = this.contexts.get(contextId);
    return context?.dependencies.get(dependencyId);
  }

  /**
   * Set access token
   */
  setAccessToken(contextId: string, tokenType: string, token: string): void {
    const context = this.contexts.get(contextId);
    if (context) {
      context.accessTokens.set(tokenType, token);
    }
  }

  /**
   * Get access token
   */
  getAccessToken(contextId: string, tokenType: string): string | undefined {
    const context = this.contexts.get(contextId);
    return context?.accessTokens.get(tokenType);
  }

  /**
   * Clean up expired contexts
   */
  cleanupExpiredContexts(maxAge: number = 3600000): void { // 1 hour default
    const now = new Date();
    const expiredContexts: string[] = [];

    for (const [contextId, context] of this.contexts.entries()) {
      const age = now.getTime() - context.metadata.startTime.getTime();
      if (age > maxAge) {
        expiredContexts.push(contextId);
      }
    }

    for (const contextId of expiredContexts) {
      this.contexts.delete(contextId);
      this.executionHistory.delete(contextId);
    }
  }

  /**
   * Generate unique context ID
   */
  private generateContextId(sessionId: string, userId: string, promptId: string): string {
    const timestamp = Date.now();
    const data = `${sessionId}-${userId}-${promptId}-${timestamp}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Generate execution signature
   */
  private generateExecutionSignature(contextId: string, inputs: Record<string, any>): string {
    const data = JSON.stringify({ contextId, inputs, timestamp: Date.now() });
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get context statistics
   */
  getStats(): {
    activeContexts: number;
    totalExecutions: number;
    averageExecutionTime: number;
  } {
    const activeContexts = this.contexts.size;
    let totalExecutions = 0;
    let totalExecutionTime = 0;

    for (const history of this.executionHistory.values()) {
      totalExecutions += history.length;
      for (const response of history) {
        if (response.executionTime) {
          totalExecutionTime += response.executionTime;
        }
      }
    }

    return {
      activeContexts,
      totalExecutions,
      averageExecutionTime: totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0
    };
  }
} 