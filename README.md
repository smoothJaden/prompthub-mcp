# PromptHub MCP (Model Context Protocol)

A comprehensive Model Context Protocol implementation for PromptHub, enabling standardized AI model integration with blockchain-based prompt assets.

## Overview

PromptHub MCP bridges the gap between AI models and the PromptHub protocol, providing:

- **Standardized AI Integration**: Compatible with various AI models through MCP
- **Blockchain Integration**: Direct connection to Solana-based PromptVault
- **Prompt Asset Management**: Execute, validate, and manage prompt assets
- **DAG Orchestration**: Compose complex workflows from multiple prompts
- **Economic Integration**: Handle fees, royalties, and access control

## Features

### Core Capabilities

- ✅ **MCP Server Implementation**: Full Model Context Protocol support
- ✅ **Multi-Model Support**: OpenAI, Anthropic, and extensible adapter system
- ✅ **Blockchain Integration**: Solana PromptVault client with transaction support
- ✅ **Prompt Execution**: Validate inputs, execute prompts, record results
- ✅ **DAG Workflows**: Compose and execute multi-step prompt workflows
- ✅ **Access Control**: Token-gated, NFT-gated, and custom access policies
- ✅ **Template Engine**: Advanced prompt templating with helpers and conditionals
- ✅ **Caching System**: Intelligent caching for performance optimization
- ✅ **CLI Tools**: Command-line interface for management and testing

### MCP Tools Provided

- `execute_prompt`: Execute a prompt from PromptHub vault
- `search_prompts`: Search for prompts by query, tags, or author
- `get_prompt_info`: Get detailed information about a specific prompt
- `validate_prompt_input`: Validate input parameters against prompt schema
- `compose_prompt_dag`: Execute composed DAG workflows

### MCP Resources

- `prompthub://vault/prompts`: Access to all prompts in the vault
- `prompthub://vault/metadata`: Vault metadata and statistics

## Installation

```bash
npm install @prompthub/mcp
```

## Quick Start

### 1. Basic Setup

```typescript
import { PromptHubMCP } from '@prompthub/mcp';

const prompthub = new PromptHubMCP();

await prompthub.initialize({
  blockchain: {
    network: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    programId: 'PromptVault11111111111111111111111111111111',
    keypairPath: './keypair.json',
  },
  server: {
    name: 'my-prompthub-mcp',
    version: '1.0.0',
  },
});

await prompthub.start();
```

### 2. Using the CLI

```bash
# Start development server
npx prompthub-mcp start --dev

# Start with custom configuration
npx prompthub-mcp start --config ./config.json

# Validate a PromptDSL file
npx prompthub-mcp validate ./my-prompt.json

# Generate configuration template
npx prompthub-mcp init --env production

# Test connections
npx prompthub-mcp test --config ./config.json
```

### 3. Configuration File

Generate a configuration file:

```bash
npx prompthub-mcp init --output prompthub-mcp.config.json
```

Example configuration:

```json
{
  "server": {
    "name": "prompthub-mcp",
    "version": "1.0.0"
  },
  "blockchain": {
    "network": "devnet",
    "rpcUrl": "https://api.devnet.solana.com",
    "programId": "PromptVault11111111111111111111111111111111",
    "keypairPath": "/path/to/keypair.json"
  },
  "models": {
    "openai": {
      "apiKey": "your-openai-api-key",
      "defaultModel": "gpt-3.5-turbo"
    },
    "anthropic": {
      "apiKey": "your-anthropic-api-key",
      "defaultModel": "claude-3-sonnet-20240229"
    }
  }
}
```

## Usage Examples

### Execute a Prompt

```typescript
import { PromptVaultClient, PromptRouter } from '@prompthub/mcp';

const vaultClient = new PromptVaultClient({
  network: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',
  programId: 'PromptVault11111111111111111111111111111111',
});

const router = new PromptRouter(vaultClient);

const result = await router.executePrompt(
  'text-summarizer-v1',
  {
    text: 'Long text to summarize...',
    length: 3,
  },
  {
    caller: 'user-wallet-address',
    timestamp: Date.now(),
    requestId: 'unique-request-id',
  }
);

console.log(result.output);
```

### Search for Prompts

```typescript
const results = await router.searchPrompts({
  query: 'text summarization',
  tags: ['nlp', 'utility'],
  limit: 10,
});

console.log(`Found ${results.length} prompts`);
```

### Execute a DAG Workflow

```typescript
const dagResult = await router.executeDag(
  {
    id: 'content-pipeline',
    name: 'Content Processing Pipeline',
    description: 'Extract, summarize, and classify content',
    nodes: [
      {
        id: 'extract',
        promptId: 'content-extractor-v1',
        inputs: { url: '{{url}}' },
        dependencies: [],
      },
      {
        id: 'summarize',
        promptId: 'text-summarizer-v1',
        inputs: { text: '{{extract.content}}' },
        dependencies: ['extract'],
      },
      {
        id: 'classify',
        promptId: 'text-classifier-v1',
        inputs: { text: '{{summarize.summary}}' },
        dependencies: ['summarize'],
      },
    ],
    edges: [
      { from: 'extract', to: 'summarize' },
      { from: 'summarize', to: 'classify' },
    ],
  },
  { url: 'https://example.com/article' }
);
```

### Create Custom Model Adapter

```typescript
import { BaseModelAdapter } from '@prompthub/mcp';

class CustomModelAdapter extends BaseModelAdapter {
  constructor(config: { apiKey: string; endpoint: string }) {
    super('custom-model', config);
  }

  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse> {
    // Implement your model's API integration
    const response = await this.callCustomAPI(request.prompt);
    
    return {
      content: response.text,
      tokenUsage: {
        promptTokens: response.usage.input,
        completionTokens: response.usage.output,
        totalTokens: response.usage.total,
      },
    };
  }

  async validate(): Promise<boolean> {
    // Implement validation logic
    return true;
  }

  protected getProviderName(): string {
    return 'Custom';
  }

  protected getCapabilities(): string[] {
    return ['text-generation'];
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PromptHub MCP Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │             │    │             │    │                     │  │
│  │ MCP Server  │◄──►│PromptRouter │◄──►│   PromptVault      │  │
│  │             │    │             │    │   (Solana)         │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│         │                   │                      │            │
│         │                   │                      │            │
│         ▼                   ▼                      ▼            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │             │    │             │    │                     │  │
│  │AI Models    │    │PromptModule │    │      IPFS          │  │
│  │(OpenAI,     │    │  Cache      │    │   (Metadata)       │  │
│  │ Anthropic)  │    │             │    │                     │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Development

### Setup

```bash
git clone https://github.com/prompthub/prompthub-mcp.git
cd prompthub-mcp
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
npm run test:watch
npm run test:coverage
```

### Lint and Format

```bash
npm run lint
npm run format
```

## API Reference

### Core Classes

#### PromptHubMCP

Main entry point for the MCP integration.

```typescript
class PromptHubMCP {
  async initialize(config: MCPConfig): Promise<void>
  async start(): Promise<void>
  getVaultClient(): PromptVaultClient
  getRouter(): PromptRouter
  getServer(): PromptHubMCPServer
}
```

#### PromptVaultClient

Client for interacting with the Solana-based PromptVault.

```typescript
class PromptVaultClient {
  async getPrompt(id: string, version?: string): Promise<PromptData | null>
  async listPrompts(filters?: ListFilters): Promise<PromptMetadata[]>
  async registerPrompt(definition: PromptDefinition): Promise<string>
  async recordExecution(promptId: string, ...): Promise<string>
}
```

#### PromptRouter

Semantic routing and orchestration for prompts.

```typescript
class PromptRouter {
  async searchPrompts(query: SearchQuery): Promise<PromptMetadata[]>
  async executePrompt(promptId: string, inputs: any, context: ExecutionContext): Promise<PromptExecutionResult>
  async executeDag(dag: DAGDefinition, inputs: any): Promise<DAGExecutionResult>
}
```

#### PromptModule

Represents an executable prompt with validation and execution capabilities.

```typescript
class PromptModule {
  validateInput(input: Record<string, any>): ValidationResult
  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ModuleResponse>
  getMetadata(): PromptMetadata
  getRoyaltyInfo(): RoyaltyConfiguration
}
```

### Model Adapters

#### BaseModelAdapter

Abstract base class for model integrations.

```typescript
abstract class BaseModelAdapter {
  abstract execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse>
  abstract validate(): Promise<boolean>
  getModelInfo(): ModelInfo
}
```

#### OpenAIAdapter

OpenAI API integration.

```typescript
class OpenAIAdapter extends BaseModelAdapter {
  constructor(config: { apiKey: string; model?: string })
  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse>
  async *streamCompletion(request: ModelExecutionRequest): AsyncGenerator<string>
}
```

#### AnthropicAdapter

Anthropic Claude API integration.

```typescript
class AnthropicAdapter extends BaseModelAdapter {
  constructor(config: { apiKey: string; model?: string })
  async execute(request: ModelExecutionRequest): Promise<ModelExecutionResponse>
  async *streamCompletion(request: ModelExecutionRequest): AsyncGenerator<string>
}
```

## Configuration

### Environment Variables

- `PROMPTHUB_NETWORK`: Solana network (localnet, devnet, mainnet-beta)
- `PROMPTHUB_RPC_URL`: Solana RPC endpoint
- `PROMPTHUB_PROGRAM_ID`: PromptVault program ID
- `PROMPTHUB_KEYPAIR_PATH`: Path to Solana keypair file
- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Anthropic API key

### Configuration Schema

See [src/config/default.ts](src/config/default.ts) for the complete configuration schema and default values.

## Error Handling

PromptHub MCP uses structured error handling with specific error codes:

- `PROMPT_NOT_FOUND`: Requested prompt doesn't exist
- `INVALID_INPUT`: Input validation failed
- `ACCESS_DENIED`: Insufficient permissions
- `EXECUTION_FAILED`: Prompt execution failed
- `BLOCKCHAIN_ERROR`: Blockchain interaction failed
- `NETWORK_ERROR`: Network connectivity issues
- `RATE_LIMIT_EXCEEDED`: API rate limits exceeded

## Security

- Input sanitization and validation
- Access control enforcement
- Rate limiting
- Secure API key handling
- Blockchain transaction verification

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- GitHub Issues: [Report bugs and request features](https://github.com/prompthub/prompthub-mcp/issues)
- Documentation: [Full documentation](https://docs.prompthub.xyz/mcp)
- Discord: [Join our community](https://discord.gg/prompthub)

## Related Projects

- [PromptHub Protocol](https://github.com/prompthub/prompthub-protocol) - Core Solana smart contracts
- [PromptHub App](https://github.com/prompthub/prompthub-app) - Web interface
- [PromptHub SDK](https://github.com/prompthub/prompthub-sdk) - JavaScript/TypeScript SDK 