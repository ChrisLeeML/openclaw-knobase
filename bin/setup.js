#!/usr/bin/env node

/**
 * OpenClaw Knobase Skill - Setup Script
 * 
 * One-command installation:
 *   npx openclaw-knobase
 *   curl -fsSL https://knobase.ai/install-openclaw.sh | bash
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const INSTALL_DIR = path.join(os.homedir(), '.openclaw', 'skills', 'knobase');
const REPO_URL = 'https://github.com/Knobase/openclaw-knobase.git';

async function checkOpenClaw() {
  try {
    execSync('which openclaw', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function checkGit() {
  try {
    execSync('which git', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function checkNode() {
  try {
    const version = execSync('node --version', { encoding: 'utf8' }).trim();
    const major = parseInt(version.slice(1).split('.')[0]);
    return major >= 18;
  } catch {
    return false;
  }
}

async function install() {
  console.log(chalk.blue.bold('🚀 Installing Knobase Skill for OpenClaw\n'));
  
  // Check prerequisites
  console.log(chalk.gray('Checking prerequisites...'));
  
  if (!(await checkNode())) {
    console.error(chalk.red('❌ Node.js 18+ is required'));
    console.log(chalk.gray('Install from: https://nodejs.org/'));
    process.exit(1);
  }
  console.log(chalk.green('✓ Node.js detected'));
  
  if (!(await checkGit())) {
    console.error(chalk.red('❌ Git is required'));
    process.exit(1);
  }
  console.log(chalk.green('✓ Git detected'));
  
  const hasOpenClaw = await checkOpenClaw();
  if (hasOpenClaw) {
    console.log(chalk.green('✓ OpenClaw detected'));
  } else {
    console.log(chalk.yellow('⚠ OpenClaw CLI not found (optional)'));
  }
  
  // Check if already installed
  try {
    await fs.access(INSTALL_DIR);
    console.log(chalk.yellow('\n⚠ Knobase skill already installed'));
    console.log(chalk.gray(`Location: ${INSTALL_DIR}`));
    
    // Ask for reinstall
    const readline = (await import('readline')).default;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question(chalk.yellow('Reinstall? [y/N] '), resolve);
    });
    rl.close();
    
    if (answer.toLowerCase() !== 'y') {
      console.log(chalk.gray('Installation cancelled.'));
      return;
    }
    
    // Remove old installation
    console.log(chalk.gray('\nRemoving old installation...'));
    execSync(`rm -rf "${INSTALL_DIR}"`, { stdio: 'inherit' });
  } catch {
    // Directory doesn't exist, continue with fresh install
  }
  
  // Create directories
  console.log(chalk.gray('\nCreating directories...'));
  await fs.mkdir(path.dirname(INSTALL_DIR), { recursive: true });
  
  // Clone repository
  console.log(chalk.gray('Cloning repository...'));
  try {
    execSync(`git clone "${REPO_URL}" "${INSTALL_DIR}"`, { stdio: 'inherit' });
  } catch {
    // Fallback to local copy if git clone fails
    console.log(chalk.yellow('Git clone failed, using local copy...'));
    const currentDir = process.cwd();
    execSync(`cp -r "${currentDir}" "${INSTALL_DIR}"`, { stdio: 'inherit' });
  }
  
  // Install dependencies
  console.log(chalk.gray('\nInstalling dependencies...'));
  execSync(`cd "${INSTALL_DIR}" && npm install`, { stdio: 'inherit' });
  
  // Make scripts executable
  console.log(chalk.gray('Setting up commands...'));
  const binDir = path.join(INSTALL_DIR, 'bin');
  const scripts = ['auth.js', 'connect.js', 'status.js', 'webhook.js'];
  for (const script of scripts) {
    await fs.chmod(path.join(binDir, script), 0o755);
  }
  
  console.log(chalk.green.bold('\n✅ Installation complete!\n'));
  
  // Next steps
  console.log(chalk.white('Next steps:'));
  console.log(chalk.gray('  1. Authenticate with Knobase:'));
  console.log(chalk.cyan('     node ' + path.join(INSTALL_DIR, 'bin/auth.js')));
  console.log(chalk.gray('  2. Or if you have OpenClaw:'));
  if (hasOpenClaw) {
    console.log(chalk.cyan('     openclaw knobase auth'));
  } else {
    console.log(chalk.cyan('     openclaw knobase auth') + chalk.gray(' (after installing OpenClaw)'));
  }
  
  console.log(chalk.gray('\nDocumentation:'));
  console.log(chalk.cyan('  cat ' + path.join(INSTALL_DIR, 'SKILL.md')));
  
  console.log(chalk.gray('\n─────────────────────────────'));
  console.log(chalk.gray('Installed to: ') + INSTALL_DIR);
}

install().catch(error => {
  console.error(chalk.red('\n❌ Installation failed:'), error.message);
  process.exit(1);
});
