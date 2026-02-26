#!/usr/bin/env node

/**
 * Knobase Status Check
 * 
 * Usage: openclaw knobase status
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

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

async function checkStatus() {
  console.log(chalk.blue.bold('🔍 Knobase Connection Status\n'));
  
  const config = await loadConfig();
  
  if (!config || !config.AGENT_ID) {
    console.log(chalk.red('❌ Not authenticated'));
    console.log(chalk.gray('\nRun: openclaw knobase auth'));
    return;
  }
  
  console.log(chalk.white('Agent ID: ') + chalk.cyan(config.AGENT_ID));
  console.log(chalk.white('Agent Name: ') + chalk.cyan(config.AGENT_NAME || 'Unknown'));
  console.log(chalk.white('API Endpoint: ') + chalk.cyan(config.KNOBASE_API_ENDPOINT || 'https://api.knobase.ai'));
  
  if (config.KNOBASE_WORKSPACE_ID) {
    console.log(chalk.white('Workspace: ') + chalk.cyan(config.KNOBASE_WORKSPACE_ID));
  }
  
  if (config.AUTHENTICATED_AT) {
    const date = new Date(config.AUTHENTICATED_AT);
    console.log(chalk.white('Authenticated: ') + chalk.cyan(date.toLocaleString()));
  }
  
  // Check webhook status
  if (config.TELEGRAM_BOT_TOKEN) {
    console.log(chalk.green('\n✓ Webhook configured'));
    console.log(chalk.white('  Telegram: ') + chalk.cyan('Configured'));
    console.log(chalk.white('  Chat ID: ') + chalk.cyan(config.TELEGRAM_CHAT_ID));
  } else {
    console.log(chalk.yellow('\n⚠ Webhook not configured'));
  }
  
  // Test API connectivity
  try {
    const response = await fetch(`${config.KNOBASE_API_ENDPOINT || 'https://api.knobase.ai'}/v1/health`, {
      headers: {
        'Authorization': `Bearer ${config.KNOBASE_API_KEY}`
      }
    });
    
    if (response.ok) {
      console.log(chalk.green('\n✓ API connection: OK'));
    } else {
      console.log(chalk.red('\n✗ API connection: Failed'));
    }
  } catch {
    console.log(chalk.red('\n✗ API connection: Failed'));
  }
  
  console.log(chalk.gray('\n─────────────────────────────'));
  console.log(chalk.gray('Config file: ') + ENV_FILE);
}

checkStatus().catch(console.error);
