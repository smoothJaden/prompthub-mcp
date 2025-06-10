#!/usr/bin/env node

import { program } from 'commander';
import { PromptHubMCP } from './index';
import { createMCPServer, createDevServer, createProductionServer } from './utils/server-factory';
import { validatePromptDSL } from './utils/validation';
import { getConfig, validateConfig } from './config/default';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CLI for PromptHub MCP
 */

program
  .name('prompthub-mcp')
  .description('PromptHub Model Context Protocol server and utilities')
  .version('1.0.0');

// Start server command
program
  .command('start')
  .description('Start the PromptHub MCP server')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-e, --env <environment>', 'Environment (development, production)', 'development')
  .option('-k, --keypair <path>', 'Solana keypair file path')
  .option('-r, --rpc <url>', 'Solana RPC URL')
  .option('-p, --program-id <id>', 'PromptVault program ID')
  .option('--dev', 'Use development configuration')
  .action(async (options) => {
    try {
      let server;

      if (options.dev) {
        console.log('Starting PromptHub MCP server in development mode...');
        server = await createDevServer();
      } else if (options.config) {
        console.log(`Loading configuration from ${options.config}...`);
        const configData = JSON.parse(fs.readFileSync(options.config, 'utf8'));
        const validation = validateConfig(configData);
        
        if (!validation.valid) {
          console.error('Configuration validation failed:');
          validation.errors.forEach(error => console.error(`  - ${error}`));
          process.exit(1);
        }

        const prompthub = new PromptHubMCP();
        await prompthub.initialize({
          blockchain: {
            network: configData.blockchain.network,
            rpcUrl: options.rpc || configData.blockchain.rpcUrl,
            programId: options.programId || configData.blockchain.programId,
            keypairPath: options.keypair || configData.blockchain.keypairPath,
          },
          server: {
            name: configData.server.name,
            version: configData.server.version,
          },
        });
        server = prompthub.getServer();
      } else {
        // Use environment-based configuration
        const config = getConfig(options.env);
        
        if (options.env === 'production') {
          if (!options.keypair) {
            console.error('Keypair path is required for production environment');
            process.exit(1);
          }
          if (!options.programId) {
            console.error('Program ID is required for production environment');
            process.exit(1);
          }
          
          server = await createProductionServer(options.programId, options.keypair);
        } else {
          server = await createDevServer();
        }
      }

      console.log('PromptHub MCP server starting...');
      await server.start();
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  });

// Validate prompt command
program
  .command('validate')
  .description('Validate a PromptDSL file')
  .argument('<file>', 'PromptDSL file to validate')
  .option('-v, --verbose', 'Show detailed validation results')
  .action(async (file, options) => {
    try {
      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      const content = fs.readFileSync(file, 'utf8');
      const promptDSL = JSON.parse(content);
      
      const result = validatePromptDSL(promptDSL);
      
      if (result.valid) {
        console.log('✅ PromptDSL validation passed');
        
        if (options.verbose && result.warnings && result.warnings.length > 0) {
          console.log('\nWarnings:');
          result.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
        }
      } else {
        console.log('❌ PromptDSL validation failed');
        console.log('\nErrors:');
        result.errors.forEach(error => console.log(`  ❌ ${error}`));
        
        if (result.warnings && result.warnings.length > 0) {
          console.log('\nWarnings:');
          result.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
        }
        
        process.exit(1);
      }
    } catch (error) {
      console.error('Validation failed:', error);
      process.exit(1);
    }
  });

// Generate config command
program
  .command('init')
  .description('Generate a configuration file')
  .option('-o, --output <path>', 'Output file path', 'prompthub-mcp.config.json')
  .option('-e, --env <environment>', 'Environment template', 'development')
  .action((options) => {
    try {
      const config = getConfig(options.env);
      
      // Remove sensitive defaults
      const outputConfig = {
        ...config,
        blockchain: {
          ...config.blockchain[options.env === 'production' ? 'mainnet' : 'devnet'],
          keypairPath: '/path/to/your/keypair.json',
        },
        models: {
          openai: {
            ...config.models.openai,
            apiKey: 'your-openai-api-key',
          },
          anthropic: {
            ...config.models.anthropic,
            apiKey: 'your-anthropic-api-key',
          },
        },
      };

      fs.writeFileSync(options.output, JSON.stringify(outputConfig, null, 2));
      console.log(`Configuration file generated: ${options.output}`);
      console.log('Please update the API keys and keypair path before using.');
    } catch (error) {
      console.error('Failed to generate config:', error);
      process.exit(1);
    }
  });

// Test connection command
program
  .command('test')
  .description('Test connection to blockchain and models')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-k, --keypair <path>', 'Solana keypair file path')
  .option('-r, --rpc <url>', 'Solana RPC URL', 'https://api.devnet.solana.com')
  .option('-p, --program-id <id>', 'PromptVault program ID')
  .action(async (options) => {
    try {
      console.log('Testing PromptHub MCP connections...\n');

      // Test blockchain connection
      console.log('🔗 Testing blockchain connection...');
      const { Connection } = await import('@solana/web3.js');
      const connection = new Connection(options.rpc);
      
      try {
        const version = await connection.getVersion();
        console.log(`✅ Connected to Solana RPC (version: ${version['solana-core']})`);
      } catch (error) {
        console.log(`❌ Failed to connect to Solana RPC: ${error}`);
      }

      // Test program if provided
      if (options.programId) {
        try {
          const { PublicKey } = await import('@solana/web3.js');
          const programId = new PublicKey(options.programId);
          const accountInfo = await connection.getAccountInfo(programId);
          
          if (accountInfo) {
            console.log('✅ PromptVault program found on blockchain');
          } else {
            console.log('❌ PromptVault program not found');
          }
        } catch (error) {
          console.log(`❌ Invalid program ID: ${error}`);
        }
      }

      // Test model adapters if config provided
      if (options.config && fs.existsSync(options.config)) {
        const config = JSON.parse(fs.readFileSync(options.config, 'utf8'));
        
        if (config.models?.openai?.apiKey) {
          console.log('\n🤖 Testing OpenAI connection...');
          const { OpenAIAdapter } = await import('./adapters/openai');
          const openai = new OpenAIAdapter({
            apiKey: config.models.openai.apiKey,
            model: config.models.openai.defaultModel,
          });
          
          try {
            const isValid = await openai.validate();
            if (isValid) {
              console.log('✅ OpenAI connection successful');
            } else {
              console.log('❌ OpenAI connection failed');
            }
          } catch (error) {
            console.log(`❌ OpenAI error: ${error}`);
          }
        }

        if (config.models?.anthropic?.apiKey) {
          console.log('\n🤖 Testing Anthropic connection...');
          const { AnthropicAdapter } = await import('./adapters/anthropic');
          const anthropic = new AnthropicAdapter({
            apiKey: config.models.anthropic.apiKey,
            model: config.models.anthropic.defaultModel,
          });
          
          try {
            const isValid = await anthropic.validate();
            if (isValid) {
              console.log('✅ Anthropic connection successful');
            } else {
              console.log('❌ Anthropic connection failed');
            }
          } catch (error) {
            console.log(`❌ Anthropic error: ${error}`);
          }
        }
      }

      console.log('\n✅ Connection tests completed');
    } catch (error) {
      console.error('Test failed:', error);
      process.exit(1);
    }
  });

// Version command
program
  .command('version')
  .description('Show version information')
  .action(() => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
    );
    
    console.log(`PromptHub MCP v${packageJson.version}`);
    console.log(`Node.js ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
  });

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 