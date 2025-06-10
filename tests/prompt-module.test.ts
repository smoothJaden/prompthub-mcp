import { PromptModule } from '../src/core/prompt-module';
import { PromptDefinition, PromptMetadata, ExecutionContext } from '../src/types';

describe('PromptModule', () => {
  let promptDefinition: PromptDefinition;
  let promptMetadata: PromptMetadata;
  let module: PromptModule;

  beforeEach(() => {
    promptDefinition = {
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
        format: {
          type: 'string',
          required: false,
          default: 'plain',
          enum: ['plain', 'json', 'markdown'],
        },
      },
      template: 'Process this text in {{format}} format: {{text}}',
      output_schema: {
        type: 'object',
        properties: {
          result: { type: 'string' },
        },
      },
      tags: ['test', 'utility'],
    };

    promptMetadata = {
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
    };

    module = new PromptModule(promptDefinition, promptMetadata);
  });

  describe('constructor', () => {
    it('should create a PromptModule with valid definition and metadata', () => {
      expect(module).toBeInstanceOf(PromptModule);
      expect(module.getDefinition()).toEqual(promptDefinition);
      expect(module.getMetadata()).toMatchObject(promptMetadata);
    });

    it('should throw error for invalid prompt definition', () => {
      const invalidDefinition = { ...promptDefinition, id: '' };
      expect(() => new PromptModule(invalidDefinition as any, promptMetadata)).toThrow();
    });
  });

  describe('validateInput', () => {
    it('should validate correct inputs', () => {
      const inputs = {
        text: 'Hello world',
        format: 'json',
      };

      const result = module.validateInput(inputs);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required input', () => {
      const inputs = {
        format: 'json',
      };

      const result = module.validateInput(inputs);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Required parameter 'text' is missing");
    });

    it('should fail validation for invalid enum value', () => {
      const inputs = {
        text: 'Hello world',
        format: 'invalid',
      };

      const result = module.validateInput(inputs);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Parameter 'format' must be one of: plain, json, markdown");
    });

    it('should warn about unexpected parameters', () => {
      const inputs = {
        text: 'Hello world',
        unexpected: 'value',
      };

      const result = module.validateInput(inputs);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain("Unexpected parameter 'unexpected' will be ignored");
    });
  });

  describe('execute', () => {
    let executionContext: ExecutionContext;

    beforeEach(() => {
      executionContext = {
        caller: 'test-caller',
        timestamp: Date.now(),
        requestId: 'test-request-id',
      };
    });

    it('should execute prompt with valid inputs', async () => {
      const inputs = {
        text: 'Hello world',
        format: 'json',
      };

      const result = await module.execute(inputs, executionContext);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.metadata.promptId).toBe('test-prompt');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.signature).toBeDefined();
    });

    it('should fail execution with invalid inputs', async () => {
      const inputs = {
        format: 'json',
        // missing required 'text' parameter
      };

      const result = await module.execute(inputs, executionContext);

      expect(result.success).toBe(false);
      expect(result.metadata.error).toBeDefined();
      expect(result.metadata.error?.code).toBe('INVALID_INPUT');
    });

    it('should apply default values for optional parameters', async () => {
      const inputs = {
        text: 'Hello world',
        // format should default to 'plain'
      };

      const result = await module.execute(inputs, executionContext);

      expect(result.success).toBe(true);
      // The template should have been rendered with default format
    });

    it('should increment execution count', async () => {
      const inputs = {
        text: 'Hello world',
      };

      const initialCount = module.getMetadata().executionCount;
      await module.execute(inputs, executionContext);
      
      const newCount = module.getMetadata().executionCount;
      expect(newCount).toBe(initialCount + 1);
    });
  });

  describe('access control', () => {
    it('should allow access for public prompts', async () => {
      const inputs = { text: 'Hello world' };
      const context = {
        caller: 'any-caller',
        timestamp: Date.now(),
        requestId: 'test-request',
      };

      const result = await module.execute(inputs, context);
      expect(result.success).toBe(true);
    });

    it('should deny access for private prompts from non-owner', async () => {
      // Update metadata to make prompt private
      module.updateMetadata(
        {
          accessPolicy: {
            type: 'private',
          },
        },
        'test-author'
      );

      const inputs = { text: 'Hello world' };
      const context = {
        caller: 'different-caller',
        timestamp: Date.now(),
        requestId: 'test-request',
      };

      const result = await module.execute(inputs, context);
      expect(result.success).toBe(false);
      expect(result.metadata.error?.code).toBe('ACCESS_DENIED');
    });

    it('should allow access for private prompts from owner', async () => {
      // Update metadata to make prompt private
      module.updateMetadata(
        {
          accessPolicy: {
            type: 'private',
          },
        },
        'test-author'
      );

      const inputs = { text: 'Hello world' };
      const context = {
        caller: 'test-author',
        timestamp: Date.now(),
        requestId: 'test-request',
      };

      const result = await module.execute(inputs, context);
      expect(result.success).toBe(true);
    });
  });

  describe('metadata management', () => {
    it('should update metadata when called by owner', () => {
      const newMetadata = {
        description: 'Updated description',
        tags: ['updated', 'test'],
      };

      module.updateMetadata(newMetadata, 'test-author');

      const metadata = module.getMetadata();
      expect(metadata.description).toBe('Updated description');
      expect(metadata.tags).toEqual(['updated', 'test']);
      expect(metadata.updatedAt).toBeGreaterThan(promptMetadata.updatedAt);
    });

    it('should reject metadata updates from non-owner', () => {
      const newMetadata = {
        description: 'Malicious update',
      };

      expect(() => {
        module.updateMetadata(newMetadata, 'different-author');
      }).toThrow('Only the prompt author can update metadata');
    });
  });

  describe('royalty and access info', () => {
    it('should return royalty configuration', () => {
      const royaltyInfo = module.getRoyaltyInfo();
      expect(royaltyInfo).toEqual(promptMetadata.royaltyConfig);
    });

    it('should return access control policy', () => {
      const accessControl = module.getAccessControl();
      expect(accessControl).toEqual(promptMetadata.accessPolicy);
    });
  });
}); 