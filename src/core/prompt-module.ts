import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';
import {
  PromptDefinition,
  ExecutionContext,
  ModuleResponse,
  ValidationResult,
  PromptMetadata,
  RoyaltyConfiguration,
  AccessPolicy,
  PromptHubMCPError,
  ErrorCodes,
  PromptDefinitionSchema,
  ExecutionContextSchema,
} from '../types';

/**
 * Core PromptModule implementation
 * Represents a single executable prompt with validation, execution, and metadata management
 */
export class PromptModule {
  private definition: PromptDefinition;
  private metadata: PromptMetadata;
  private executionCount: number = 0;
  private lastExecutionTime?: number;

  constructor(
    definition: PromptDefinition,
    metadata: PromptMetadata
  ) {
    // Validate definition on construction
    const validationResult = PromptDefinitionSchema.safeParse(definition);
    if (!validationResult.success) {
      throw new PromptHubMCPError(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid prompt definition',
        validationResult.error.errors
      );
    }

    this.definition = definition;
    this.metadata = metadata;
  }

  /**
   * Get module metadata
   */
  getMetadata(): PromptMetadata {
    return {
      ...this.metadata,
      executionCount: this.executionCount,
      updatedAt: this.lastExecutionTime || this.metadata.updatedAt,
    };
  }

  /**
   * Get prompt definition
   */
  getDefinition(): PromptDefinition {
    return { ...this.definition };
  }

  /**
   * Validate input against the prompt's input schema
   */
  validateInput(input: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    for (const [key, param] of Object.entries(this.definition.inputs)) {
      if (param.required && !(key in input)) {
        errors.push(`Required parameter '${key}' is missing`);
        continue;
      }

      if (key in input) {
        const value = input[key];
        const validationError = this.validateParameterValue(key, value, param);
        if (validationError) {
          errors.push(validationError);
        }
      }
    }

    // Check for unexpected parameters
    for (const key of Object.keys(input)) {
      if (!(key in this.definition.inputs)) {
        warnings.push(`Unexpected parameter '${key}' will be ignored`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Execute the prompt with given inputs and context
   */
  async execute(
    input: Record<string, any>,
    context: ExecutionContext
  ): Promise<ModuleResponse> {
    const startTime = Date.now();
    const executionId = uuidv4();

    try {
      // Validate context
      const contextValidation = ExecutionContextSchema.safeParse(context);
      if (!contextValidation.success) {
        throw new PromptHubMCPError(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid execution context',
          contextValidation.error.errors
        );
      }

      // Validate inputs
      const inputValidation = this.validateInput(input);
      if (!inputValidation.valid) {
        throw new PromptHubMCPError(
          ErrorCodes.INVALID_INPUT,
          'Input validation failed',
          inputValidation.errors
        );
      }

      // Check access permissions
      await this.checkAccess(context.caller);

      // Prepare execution inputs with defaults
      const executionInputs = this.prepareExecutionInputs(input);

      // Resolve dependencies if any
      const resolvedDependencies = await this.resolveDependencies(
        executionInputs,
        context
      );

      // Render template with inputs
      const renderedPrompt = this.renderTemplate(
        executionInputs,
        resolvedDependencies
      );

      // Execute the prompt (this would integrate with actual AI models)
      const output = await this.executePrompt(
        renderedPrompt,
        context,
        executionId
      );

      // Update execution statistics
      this.executionCount++;
      this.lastExecutionTime = Date.now();

      const executionTime = Date.now() - startTime;

      // Generate execution signature
      const signature = this.generateExecutionSignature(
        executionId,
        input,
        output,
        context
      );

      return {
        success: true,
        output,
        metadata: {
          executionId,
          promptId: this.definition.id,
          version: this.definition.version,
          executionTime,
          timestamp: startTime,
        },
        executionTime,
        signature,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      if (error instanceof PromptHubMCPError) {
        return {
          success: false,
          output: null,
          metadata: {
            executionId,
            promptId: this.definition.id,
            version: this.definition.version,
            executionTime,
            timestamp: startTime,
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          },
          executionTime,
        };
      }

      return {
        success: false,
        output: null,
        metadata: {
          executionId,
          promptId: this.definition.id,
          version: this.definition.version,
          executionTime,
          timestamp: startTime,
          error: {
            code: ErrorCodes.EXECUTION_FAILED,
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error,
          },
        },
        executionTime,
      };
    }
  }

  /**
   * Get royalty configuration for this prompt
   */
  getRoyaltyInfo(): RoyaltyConfiguration {
    return this.metadata.royaltyConfig;
  }

  /**
   * Get access control policy
   */
  getAccessControl(): AccessPolicy {
    return this.metadata.accessPolicy;
  }

  /**
   * Update prompt metadata (only by owner)
   */
  updateMetadata(
    newMetadata: Partial<PromptMetadata>,
    caller: string
  ): void {
    if (caller !== this.metadata.author) {
      throw new PromptHubMCPError(
        ErrorCodes.ACCESS_DENIED,
        'Only the prompt author can update metadata'
      );
    }

    this.metadata = {
      ...this.metadata,
      ...newMetadata,
      updatedAt: Date.now(),
    };
  }

  // Private helper methods

  private validateParameterValue(
    key: string,
    value: any,
    param: any
  ): string | null {
    // Type validation
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          return `Parameter '${key}' must be a string`;
        }
        if (param.minLength && value.length < param.minLength) {
          return `Parameter '${key}' must be at least ${param.minLength} characters`;
        }
        if (param.maxLength && value.length > param.maxLength) {
          return `Parameter '${key}' must be at most ${param.maxLength} characters`;
        }
        if (param.pattern && !new RegExp(param.pattern).test(value)) {
          return `Parameter '${key}' does not match required pattern`;
        }
        if (param.enum && !param.enum.includes(value)) {
          return `Parameter '${key}' must be one of: ${param.enum.join(', ')}`;
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          return `Parameter '${key}' must be a number`;
        }
        if (param.minimum !== undefined && value < param.minimum) {
          return `Parameter '${key}' must be at least ${param.minimum}`;
        }
        if (param.maximum !== undefined && value > param.maximum) {
          return `Parameter '${key}' must be at most ${param.maximum}`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Parameter '${key}' must be a boolean`;
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return `Parameter '${key}' must be an array`;
        }
        if (param.minItems && value.length < param.minItems) {
          return `Parameter '${key}' must have at least ${param.minItems} items`;
        }
        if (param.maxItems && value.length > param.maxItems) {
          return `Parameter '${key}' must have at most ${param.maxItems} items`;
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return `Parameter '${key}' must be an object`;
        }
        break;
    }

    return null;
  }

  private prepareExecutionInputs(input: Record<string, any>): Record<string, any> {
    const executionInputs: Record<string, any> = {};

    // Apply defaults and prepare inputs
    for (const [key, param] of Object.entries(this.definition.inputs)) {
      if (key in input) {
        executionInputs[key] = input[key];
      } else if (param.default !== undefined) {
        executionInputs[key] = param.default;
      }
    }

    return executionInputs;
  }

  private async resolveDependencies(
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<Record<string, any>> {
    const resolved: Record<string, any> = {};

    if (!this.definition.dependencies || this.definition.dependencies.length === 0) {
      return resolved;
    }

    // This would integrate with PromptRouter to resolve dependencies
    // For now, return empty resolved dependencies
    // TODO: Implement dependency resolution
    
    return resolved;
  }

  private renderTemplate(
    inputs: Record<string, any>,
    dependencies: Record<string, any>
  ): string {
    let rendered = this.definition.template;

    // Simple template rendering - replace {{variable}} with values
    for (const [key, value] of Object.entries(inputs)) {
      const placeholder = `{{${key}}}`;
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      rendered = rendered.replace(new RegExp(placeholder, 'g'), stringValue);
    }

    // Replace dependency references
    for (const [key, value] of Object.entries(dependencies)) {
      const placeholder = `{{${key}}}`;
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      rendered = rendered.replace(new RegExp(placeholder, 'g'), stringValue);
    }

    return rendered;
  }

  private async executePrompt(
    renderedPrompt: string,
    context: ExecutionContext,
    executionId: string
  ): Promise<any> {
    // This is where the actual AI model execution would happen
    // For now, return a mock response
    // TODO: Integrate with actual AI models via MCP
    
    return {
      text: `Mock response for prompt: ${this.definition.name}`,
      renderedPrompt,
      executionId,
      timestamp: Date.now(),
    };
  }

  private async checkAccess(caller: string): Promise<void> {
    const policy = this.metadata.accessPolicy;

    switch (policy.type) {
      case 'public':
        // Public access - no restrictions
        return;

      case 'private':
        if (caller !== this.metadata.author) {
          throw new PromptHubMCPError(
            ErrorCodes.ACCESS_DENIED,
            'This prompt is private and can only be accessed by the author'
          );
        }
        return;

      case 'token_gated':
        // TODO: Implement token balance checking
        // This would check if the caller has sufficient token balance
        break;

      case 'nft_gated':
        // TODO: Implement NFT ownership checking
        // This would check if the caller owns the required NFT
        break;

      case 'custom':
        if (policy.whitelist && !policy.whitelist.includes(caller)) {
          throw new PromptHubMCPError(
            ErrorCodes.ACCESS_DENIED,
            'Caller is not in the whitelist for this prompt'
          );
        }
        break;
    }

    // Check expiration
    if (policy.expirationDate && Date.now() > policy.expirationDate) {
      throw new PromptHubMCPError(
        ErrorCodes.ACCESS_DENIED,
        'Access to this prompt has expired'
      );
    }

    // TODO: Implement rate limiting based on maxUsagePerDay
  }

  private generateExecutionSignature(
    executionId: string,
    input: Record<string, any>,
    output: any,
    context: ExecutionContext
  ): string {
    const signatureData = {
      executionId,
      promptId: this.definition.id,
      version: this.definition.version,
      inputHash: CryptoJS.SHA256(JSON.stringify(input)).toString(),
      outputHash: CryptoJS.SHA256(JSON.stringify(output)).toString(),
      caller: context.caller,
      timestamp: context.timestamp,
    };

    return CryptoJS.SHA256(JSON.stringify(signatureData)).toString();
  }
} 