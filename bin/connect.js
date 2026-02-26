#!/usr/bin/env node

/**
 * Knobase Workspace Connector
 * 
 * Usage: openclaw knobase connect
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(SKILL_DIR, '.env');

async function loadConfig() {
  try {
    const content = await fs.readFile(ENV_FILE, 'utf8');
    const config = {};
    content.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        config[key.trim()] = valueParts.join('=').trim();
      }
    });
    return config;
  } catch {
    return null;
  }
}

async function saveConfig(config) {
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  await fs.writeFile(ENV_FILE, envContent, { mode: 0o600 });
}

async function listWorkspaces(apiKey, endpoint) {
  try {
    const response = await fetch(`${endpoint}/v1/workspaces`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch workspaces');
    }
    
    return await response.json();
  } catch (error) {
    throw new Error(`Cannot list workspaces: ${error.message}`);
  }
}

async function connectWorkspace() {
  console.log(chalk.blue.bold('🔗 Connect to Knobase Workspace\n'));
  
  const config = await loadConfig();
  
  if (!config || !config.KNOBASE_API_KEY) {
    console.log(chalk.red('❌ Not authenticated'));
    console.log(chalk.gray('Run: openclaw knobase auth'));
    return;
  }
  
  const spinner = ora('Fetching workspaces...').start();
  
  try {
    const endpoint = config.KNOBASE_API_ENDPOINT || 'https://api.knobase.ai';
    const workspaces = await listWorkspaces(config.KNOBASE_API_KEY, endpoint);
    spinner.succeed('Workspaces loaded');
    
    if (!workspaces || workspaces.length === 0) {
      console.log(chalk.yellow('\nNo workspaces found. Create one in Knobase first.'));
      return;
    }
    
    const { workspace } = await inquirer.prompt([{
      type: 'list',
      name: 'workspace',
      message: 'Select a workspace:',
      choices: workspaces.map(w => ({
        name: `${w.name} (${w.id})`,
        value: w.id
      }))
    }]);
    
    // Save workspace ID
    config.KNOBASE_WORKSPACE_ID = workspace;
    await saveConfig(config);
    
    console.log(chalk.green('\n✅ Connected to workspace!'));
    console.log(chalk.white('Workspace ID: ') + chalk.cyan(workspace));
    
    // Register webhook if we have a public URL
    if (config.WEBHOOK_URL) {
      console.log(chalk.gray('\nRegistering webhook with Knobase...'));
      // TODO: Implement webhook registration API call
    }
    
    console.log(chalk.gray('\nYou can now receive @claw mentions!'));
    console.log(chalk.gray('Start webhook server: openclaw knobase webhook start\n'));
    
  } catch (error) {
    spinner.fail('Failed to connect');
    console.error(chalk.red(error.message));
    
    // Manual entry fallback
    const { manual } = await inquirer.prompt([{
      type: 'confirm',
      name: 'manual',
      message: 'Would you like to enter the workspace ID manually?',
      default: true
    }]);
    
    if (manual) {
      const { workspaceId } = await inquirer.prompt([{
        type: 'input',
        name: 'workspaceId',
        message: 'Enter Workspace ID:',
        validate: (input) => input.length > 0 || 'Workspace ID is required'
      }]);
      
      config.KNOBASE_WORKSPACE_ID = workspaceId;
      await saveConfig(config);
      
      console.log(chalk.green('\n✅ Workspace ID saved!'));
    }
  }
}

connectWorkspace().catch(console.error);
