#!/usr/bin/env node

/**
 * Knobase Authentication Script
 * 
 * Usage: openclaw knobase auth
 * 
 * This script:
 * 1. Generates a unique Agent ID
 * 2. Prompts for Knobase API credentials
 * 3. Validates credentials with Knobase API
 * 4. Stores configuration securely
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(SKILL_DIR, '.env');
const CONFIG_FILE = path.join(SKILL_DIR, 'config.json');

// Generate unique Agent ID
function generateAgentId() {
  const uuid = crypto.randomUUID();
  return `knobase_agent_${uuid}`;
}

// Check if already authenticated
async function checkExistingAuth() {
  try {
    const envContent = await fs.readFile(ENV_FILE, 'utf8');
    const agentIdMatch = envContent.match(/AGENT_ID=(.+)/);
    if (agentIdMatch) {
      return agentIdMatch[1];
    }
  } catch {
    // File doesn't exist
  }
  return null;
}

// Save configuration
async function saveConfig(config) {
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  await fs.writeFile(ENV_FILE, envContent, { mode: 0o600 }); // Secure permissions
  console.log(chalk.green('\n✓ Configuration saved to .env'));
}

// Validate API key with Knobase
async function validateApiKey(apiKey, endpoint = 'https://api.knobase.ai') {
  try {
    const response = await fetch(`${endpoint}/v1/auth/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Invalid API key');
    }
    
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to validate API key: ${error.message}`);
  }
}

// Register agent with Knobase
async function registerAgent(apiKey, agentId, metadata, endpoint) {
  try {
    const response = await fetch(`${endpoint}/v1/agents/register`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: agentId,
        name: metadata.name || 'OpenClaw Agent',
        type: 'openclaw',
        version: '1.0.0',
        capabilities: ['mention_handler', 'notification_receiver', 'context_sync'],
        platform: process.platform,
        hostname: require('os').hostname()
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to register agent');
    }
    
    return await response.json();
  } catch (error) {
    throw new Error(`Agent registration failed: ${error.message}`);
  }
}

// Main authentication flow
async function authenticate() {
  console.log(chalk.blue.bold('🔌 Knobase Authentication\n'));
  
  // Check existing auth
  const existingAgentId = await checkExistingAuth();
  if (existingAgentId) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: `Agent already authenticated (${existingAgentId.slice(0, 20)}...). Re-authenticate?`,
      default: false
    }]);
    
    if (!overwrite) {
      console.log(chalk.yellow('Authentication cancelled.'));
      return;
    }
  }
  
  // Generate new Agent ID
  const agentId = generateAgentId();
  console.log(chalk.gray(`Generated Agent ID: ${agentId}\n`));
  
  // Collect credentials
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: 'Enter your Knobase API Key:',
      validate: (input) => input.length > 0 || 'API Key is required'
    },
    {
      type: 'input',
      name: 'endpoint',
      message: 'Knobase API Endpoint:',
      default: 'https://api.knobase.ai'
    },
    {
      type: 'input',
      name: 'agentName',
      message: 'Agent Name (optional):',
      default: `OpenClaw ${require('os').hostname()}`
    },
    {
      type: 'confirm',
      name: 'webhookSetup',
      message: 'Do you want to set up webhook notifications?',
      default: true
    }
  ]);
  
  // Validate API key
  const spinner = ora('Validating API key...').start();
  
  try {
    const validation = await validateApiKey(answers.apiKey, answers.endpoint);
    spinner.succeed('API key validated');
    
    // Register agent
    const registerSpinner = ora('Registering agent with Knobase...').start();
    const registration = await registerAgent(
      answers.apiKey, 
      agentId, 
      { name: answers.agentName },
      answers.endpoint
    );
    registerSpinner.succeed('Agent registered');
    
    // Build config
    const config = {
      AGENT_ID: agentId,
      KNOBASE_API_KEY: answers.apiKey,
      KNOBASE_API_ENDPOINT: answers.endpoint,
      KNOBASE_WORKSPACE_ID: validation.workspace_id || '',
      AGENT_NAME: answers.agentName,
      AUTHENTICATED_AT: new Date().toISOString()
    };
    
    // Optional webhook config
    if (answers.webhookSetup) {
      const webhookAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'webhookSecret',
          message: 'Webhook Secret (for verification):',
          default: crypto.randomBytes(32).toString('hex')
        },
        {
          type: 'input',
          name: 'telegramToken',
          message: 'Telegram Bot Token (for notifications):',
          validate: (input) => input.length > 0 || 'Bot token is required for notifications'
        },
        {
          type: 'input',
          name: 'telegramChatId',
          message: 'Telegram Chat ID:',
          validate: (input) => input.length > 0 || 'Chat ID is required'
        }
      ]);
      
      config.KNOBASE_WEBHOOK_SECRET = webhookAnswers.webhookSecret;
      config.TELEGRAM_BOT_TOKEN = webhookAnswers.telegramToken;
      config.TELEGRAM_CHAT_ID = webhookAnswers.telegramChatId;
      config.WEBHOOK_PORT = '3456';
    }
    
    // Save configuration
    await saveConfig(config);
    
    console.log(chalk.green.bold('\n✅ Authentication successful!\n'));
    console.log(chalk.white('Agent ID: ') + chalk.cyan(agentId));
    console.log(chalk.white('Workspace: ') + chalk.cyan(validation.workspace_name || 'Unknown'));
    console.log(chalk.white('Connected as: ') + chalk.cyan(answers.agentName));
    
    if (answers.webhookSetup) {
      console.log(chalk.gray('\nTo start receiving notifications:'));
      console.log(chalk.gray('  openclaw knobase webhook start'));
    }
    
    console.log(chalk.gray('\nTo connect to a workspace:'));
    console.log(chalk.gray('  openclaw knobase connect\n'));
    
  } catch (error) {
    spinner.fail('Authentication failed');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

// Run authentication
authenticate().catch(console.error);
