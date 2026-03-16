#!/usr/bin/env node

/**
 * Knobase One-Click Agent Connection
 * 
 * Usage: openclaw-knobase connect --device-code <device_code> [--name <agent_name>]
 * 
 * Implements a streamlined connection flow:
 * 1. Takes a device_code (UUID) from the --device-code flag
 * 2. Exchanges it for a token via the device token endpoint
 * 3. Connects the agent to the workspace
 * 4. Saves credentials and starts the webhook server
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import crypto from 'crypto';
import chalk from 'chalk';
import ora from 'ora';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(SKILL_DIR, '.env');

const KNOBASE_BASE_URL = 'https://app.knobase.com';
const DEVICE_TOKEN_URL = `${KNOBASE_BASE_URL}/api/oauth/device/token`;
const AGENT_CONNECT_URL = `${KNOBASE_BASE_URL}/api/v1/agents/connect`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = { deviceCode: null, name: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--device-code' && args[i + 1]) {
      flags.deviceCode = args[i + 1];
      i++;
    } else if (args[i] === '--name' && args[i + 1]) {
      flags.name = args[i + 1];
      i++;
    }
  }
  return flags;
}

function generateAgentId() {
  const uuid = crypto.randomUUID();
  return `knobase_agent_${uuid}`;
}

async function saveConfig(config) {
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  await fs.writeFile(ENV_FILE, envContent, { mode: 0o600 });
  console.log(chalk.green('\n✓ Configuration saved to .env'));
}

async function exchangeCodeForToken(deviceCode) {
  const response = await fetch(DEVICE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
  }

  return await response.json();
}

async function connectAgent(deviceCode) {
  const response = await fetch(AGENT_CONNECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_code: deviceCode }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to connect agent (${response.status}): ${body}`);
  }

  return await response.json();
}

function launchWebhook() {
  console.log('');
  const webhookPath = path.join(__dirname, 'webhook.js');
  const child = spawn(process.execPath, [webhookPath, 'start'], {
    stdio: 'inherit',
    cwd: SKILL_DIR,
  });
  child.on('error', (err) => {
    console.error(chalk.red(`\n  Failed to start webhook server: ${err.message}`));
    console.log(chalk.gray('  You can start it manually with: openclaw knobase webhook start\n'));
  });
}

async function main() {
  const flags = parseArgs(process.argv);

  console.log(chalk.blue.bold('\n⚡ Knobase Quick Connect\n'));

  if (!flags.deviceCode) {
    console.error(chalk.red('  Error: --device-code flag is required.\n'));
    console.log(chalk.white('  Usage:'));
    console.log(chalk.gray('    openclaw-knobase connect --device-code <device_code> [--name <agent_name>]\n'));
    console.log(chalk.gray('  Get your device code from the Knobase app or run:'));
    console.log(chalk.gray('    openclaw knobase auth\n'));
    process.exit(1);
  }

  const deviceCode = flags.deviceCode;
  console.log(chalk.white('  Device Code: ') + chalk.yellow.bold(deviceCode) + '\n');

  // Step 1: Exchange device_code for token
  const tokenSpinner = ora('Exchanging device code for token...').start();
  let tokenData;
  try {
    tokenData = await exchangeCodeForToken(deviceCode);
    tokenSpinner.succeed('Token received');
  } catch (err) {
    tokenSpinner.fail('Token exchange failed');
    console.error(chalk.red(`\n  ${err.message}\n`));
    process.exit(1);
  }

  // Step 2: Connect agent to workspace
  const connectSpinner = ora('Connecting agent to workspace...').start();
  let agentData;
  try {
    agentData = await connectAgent(deviceCode);
    connectSpinner.succeed('Agent connected');
  } catch (err) {
    connectSpinner.fail('Failed to connect agent');
    console.error(chalk.red(`\n  ${err.message}\n`));
    process.exit(1);
  }

  // Step 3: Save config
  const { agent_id, api_key, workspace_id } = agentData;

  const agentName = flags.name || agentData.name || null;

  const config = {
    AGENT_ID: agent_id || generateAgentId(),
    ...(agentName && { AGENT_NAME: agentName }),
    KNOBASE_API_KEY: api_key,
    KNOBASE_WORKSPACE_ID: workspace_id,
    KNOBASE_API_ENDPOINT: KNOBASE_BASE_URL,
    AUTHENTICATED_AT: new Date().toISOString(),
  };

  await saveConfig(config);

  // Step 4: Success message
  const successLabel = agentName
    ? `\n✅ ${agentName} connected successfully!\n`
    : '\n✅ Connected successfully!\n';
  console.log(chalk.green.bold(successLabel));
  if (agentName) {
    console.log(chalk.white('  Agent Name:  ') + chalk.cyan.bold(agentName));
  }
  console.log(chalk.white('  Agent ID:    ') + chalk.cyan(config.AGENT_ID));
  console.log(chalk.white('  Workspace:   ') + chalk.cyan(workspace_id));

  console.log(chalk.white.bold('\n  Try ') + chalk.cyan.bold('@openclaw') + chalk.white.bold(' in your Knobase document!\n'));
  console.log(chalk.gray('  Example commands:'));
  console.log(chalk.gray('    @openclaw summarize this page'));
  console.log(chalk.gray('    @openclaw find action items'));
  console.log(chalk.gray('    @openclaw draft a reply\n'));

  // Step 5: Auto-start webhook server
  console.log(chalk.gray('  Starting webhook server...\n'));
  launchWebhook();
}

main().catch((err) => {
  console.error(chalk.red(err.message));
  process.exit(1);
});
