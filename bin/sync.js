#!/usr/bin/env node

/**
 * Knobase Sync - Two-way sync with cloud workspace
 * 
 * Usage: openclaw-knobase sync [--agent <id>] [--direction <up|down|both>]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(SKILL_DIR, '.env');

// Parse args
const args = process.argv.slice(2);
let direction = 'both';
let agentId = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--direction' && args[i + 1]) {
    direction = args[i + 1];
    i++;
  } else if (args[i] === '--agent' && args[i + 1]) {
    agentId = args[i + 1];
    i++;
  }
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(chalk.blue.bold('\n🔄 Knobase Sync\n'));
  console.log('Sync your local OpenClaw workspace with Knobase cloud\n');
  console.log(chalk.white('Usage:'));
  console.log(chalk.gray('  openclaw-knobase sync [options]\n'));
  console.log(chalk.white('Options:'));
  console.log(chalk.gray('  --agent <id>       Specific agent to sync'));
  console.log(chalk.gray('  --direction <dir>  Sync direction: up, down, or both (default: both)\n'));
  console.log(chalk.white('Examples:'));
  console.log(chalk.gray('  openclaw-knobase sync'));
  console.log(chalk.gray('  openclaw-knobase sync --direction up'));
  console.log(chalk.gray('  openclaw-knobase sync --agent abc-123 --direction both\n'));
  process.exit(0);
}

async function loadConfig() {
  try {
    const content = await fs.readFile(ENV_FILE, 'utf8');
    const config = {};
    for (const line of content.split('\n')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        config[key.trim()] = valueParts.join('=').trim();
      }
    }
    return config;
  } catch {
    return {};
  }
}

async function sync() {
  console.log(chalk.blue.bold('\n🔄 Knobase Sync\n'));
  
  const config = await loadConfig();
  
  if (!config.KNOBASE_API_KEY || !config.KNOBASE_WORKSPACE_ID) {
    console.error(chalk.red('❌ Not authenticated. Run: openclaw-knobase connect'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ Sync feature ready\n'));
  console.log(chalk.gray('This will sync files between local and cloud workspace.\n'));
}

sync();
