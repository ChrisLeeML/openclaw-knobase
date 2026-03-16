#!/usr/bin/env node

/**
 * Interactive agent selector for the CLI.
 *
 * Usage: knobase agents select
 */

import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '../..');
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

async function saveAgentId(agentId) {
  let content = '';
  try {
    content = await fs.readFile(ENV_FILE, 'utf8');
  } catch {
    // .env doesn't exist yet
  }

  const lines = content.split('\n');
  let found = false;
  const updated = lines.map(line => {
    if (line.startsWith('AGENT_ID=')) {
      found = true;
      return `AGENT_ID=${agentId}`;
    }
    return line;
  });

  if (!found) {
    updated.unshift(`AGENT_ID=${agentId}`);
  }

  await fs.writeFile(ENV_FILE, updated.join('\n'), 'utf8');
}

function prompt(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

function typeLabel(agent) {
  const kind = (agent.type ?? agent.kind ?? '').toLowerCase();
  if (kind === 'human' || agent.is_human) return chalk.blue('Human');
  if (kind === 'ai' || kind === 'bot' || kind === 'agent') return chalk.magenta('Agent');
  return chalk.white(kind || 'Unknown');
}

function statusBadge(agent) {
  const status = (agent.status ?? '').toLowerCase();
  if (status === 'active' || status === 'online') return chalk.green('● Active');
  if (status === 'inactive' || status === 'offline') return chalk.gray('○ Inactive');
  if (status === 'error') return chalk.red('✗ Error');
  return chalk.yellow(status || '—');
}

function formatCapabilities(agent) {
  const caps = agent.capabilities ?? agent.skills ?? [];
  if (!Array.isArray(caps) || caps.length === 0) return chalk.gray('—');
  return caps.map(c => (typeof c === 'string' ? c : c.name ?? c.id ?? '')).join(', ');
}

function printAgentList(agents) {
  const nameWidth = 28;
  const typeWidth = 12;
  const statusWidth = 16;

  const header =
    chalk.bold('#'.padEnd(5)) +
    chalk.bold('Name'.padEnd(nameWidth)) +
    chalk.bold('Type'.padEnd(typeWidth)) +
    chalk.bold('Status'.padEnd(statusWidth)) +
    chalk.bold('Capabilities');

  const separator = chalk.gray('─'.repeat(5 + nameWidth + typeWidth + statusWidth + 40));

  console.log('');
  console.log(header);
  console.log(separator);

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const num = chalk.bold.white(String(i + 1).padEnd(5));
    const name = (agent.name ?? agent.display_name ?? 'Unnamed')
      .slice(0, nameWidth - 2)
      .padEnd(nameWidth);
    const type = typeLabel(agent).padEnd(typeWidth + 10);
    const status = statusBadge(agent).padEnd(statusWidth + 10);
    const caps = formatCapabilities(agent);

    console.log(num + chalk.cyan(name) + type + status + caps);
  }

  console.log(separator);
}

async function selectAgent() {
  console.log(chalk.blue.bold('\n🤖 Select Agent\n'));

  const config = await loadConfig();

  if (!config) {
    console.error(chalk.red('✗ Could not load .env config.'));
    console.log(chalk.gray('  Run: openclaw knobase auth'));
    process.exit(1);
  }

  const apiKey = config.KNOBASE_API_KEY;
  const workspaceId = config.KNOBASE_WORKSPACE_ID;

  if (!apiKey) {
    console.error(chalk.red('✗ KNOBASE_API_KEY is not set in .env'));
    console.log(chalk.gray('  Run: openclaw knobase auth'));
    process.exit(1);
  }

  if (!workspaceId) {
    console.error(chalk.red('✗ KNOBASE_WORKSPACE_ID is not set in .env'));
    process.exit(1);
  }

  const baseUrl = config.KNOBASE_API_ENDPOINT || 'https://app.knobase.com';
  const url = `${baseUrl}/api/v1/agents?workspace_id=${encodeURIComponent(workspaceId)}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
  } catch (err) {
    console.error(chalk.red(`✗ Network error: ${err.message}`));
    process.exit(1);
  }

  if (response.status === 401) {
    console.error(chalk.red('✗ Not authenticated — API key is invalid or expired.'));
    console.log(chalk.gray('  Run: openclaw knobase auth'));
    process.exit(1);
  }

  if (response.status === 403) {
    console.error(chalk.red('✗ Forbidden — insufficient permissions.'));
    process.exit(1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(chalk.red(`✗ API returned ${response.status}: ${body || response.statusText}`));
    process.exit(1);
  }

  const data = await response.json();
  const agents = Array.isArray(data) ? data : data.agents ?? data.members ?? data.data ?? [];

  if (agents.length === 0) {
    console.log(chalk.yellow('No agents found in this workspace.'));
    process.exit(0);
  }

  printAgentList(agents);

  const currentAgentId = config.AGENT_ID || config.KNOBASE_AGENT_ID;
  if (currentAgentId) {
    const currentAgent = agents.find(a => (a.id ?? a.agent_id) === currentAgentId);
    if (currentAgent) {
      console.log(
        chalk.gray('\nCurrently selected: ') +
        chalk.bold.cyan(currentAgent.name ?? currentAgent.display_name ?? currentAgentId)
      );
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await prompt(
      rl,
      chalk.white(`\nSelect agent [1-${agents.length}]: `)
    );

    if (!answer) {
      console.log(chalk.yellow('\nSelection cancelled.'));
      process.exit(0);
    }

    const index = parseInt(answer, 10);

    if (isNaN(index) || index < 1 || index > agents.length) {
      console.error(chalk.red(`\n✗ Invalid selection. Enter a number between 1 and ${agents.length}.`));
      process.exit(1);
    }

    const selected = agents[index - 1];
    const selectedId = selected.id ?? selected.agent_id;
    const selectedName = selected.name ?? selected.display_name ?? 'Unnamed';

    if (!selectedId) {
      console.error(chalk.red('\n✗ Selected agent has no ID.'));
      process.exit(1);
    }

    await saveAgentId(selectedId);

    console.log('');
    console.log(chalk.green('✓ Agent selected successfully!\n'));
    console.log(chalk.gray('  Name:     ') + chalk.bold.cyan(selectedName));
    console.log(chalk.gray('  ID:       ') + chalk.white(selectedId));
    console.log(chalk.gray('  Saved to: ') + chalk.white('.env'));
    console.log('');
  } finally {
    rl.close();
  }
}

selectAgent().catch(err => {
  console.error(chalk.red(`✗ ${err.message}`));
  process.exit(1);
});
