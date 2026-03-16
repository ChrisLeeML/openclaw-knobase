#!/usr/bin/env node

/**
 * OpenClaw Knobase Skill - Setup/Install Script
 * 
 * Handles installation/reinstallation of the skill
 * 
 * Usage: npx openclaw-knobase setup
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

const INSTALL_DIR = path.join(os.homedir(), '.openclaw', 'skills', 'knobase');
const REPO_URL = 'https://github.com/Knobase-AI/openclaw-knobase.git';

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

async function cleanInstallDir() {
  console.log(chalk.gray('Cleaning up old installation...'));
  try {
    // Remove directory contents but preserve the directory itself if possible
    // Use rm -rf for Mac/Linux
    if (process.platform === 'win32') {
      execSync(`rmdir /s /q "${INSTALL_DIR}"`, { stdio: 'ignore' });
    } else {
      execSync(`rm -rf "${INSTALL_DIR}"`, { stdio: 'ignore' });
    }
    console.log(chalk.green('✓ Old installation removed'));
  } catch (err) {
    console.log(chalk.yellow('⚠ Could not remove old directory, will try to overwrite'));
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
  let shouldReinstall = false;
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
    
    shouldReinstall = true;
    await cleanInstallDir();
  } catch {
    // Directory doesn't exist, continue with fresh install
  }
  
  // Create parent directories
  console.log(chalk.gray('\nCreating directories...'));
  await fs.mkdir(path.dirname(INSTALL_DIR), { recursive: true });
  
  // Clone repository
  console.log(chalk.gray('Cloning repository...'));
  console.log(chalk.gray(`From: ${REPO_URL}`));
  console.log(chalk.gray(`To: ${INSTALL_DIR}`));
  
  try {
    execSync(`git clone "${REPO_URL}" "${INSTALL_DIR}"`, { stdio: 'inherit' });
  } catch (error) {
    console.log(chalk.yellow('\n⚠ Git clone failed'));
    
    if (shouldReinstall) {
      console.log(chalk.gray('Using local copy from npm package...'));
      try {
        const currentDir = process.cwd();
        // Use cp -R instead of cp -r for better compatibility
        if (process.platform === 'win32') {
          execSync(`xcopy /E /I /Y "${currentDir}" "${INSTALL_DIR}"`, { stdio: 'ignore' });
        } else {
          // Use rsync if available, otherwise cp -R
          try {
            execSync(`rsync -av --exclude='node_modules' --exclude='.git' "${currentDir}/" "${INSTALL_DIR}/"`, { stdio: 'ignore' });
          } catch {
            execSync(`cp -R "${currentDir}/." "${INSTALL_DIR}/"`, { stdio: 'ignore' });
          }
        }
        console.log(chalk.green('✓ Local copy installed'));
      } catch (copyError) {
        console.error(chalk.red('❌ Failed to copy local files'));
        console.error(chalk.gray(copyError.message));
        process.exit(1);
      }
    } else {
      console.error(chalk.red('❌ Git clone failed. Please check your internet connection.'));
      console.error(chalk.gray(error.message));
      process.exit(1);
    }
  }
  
  // Install dependencies
  console.log(chalk.gray('\nInstalling dependencies...'));
  try {
    execSync(`cd "${INSTALL_DIR}" && npm install`, { stdio: 'inherit' });
    console.log(chalk.green('✓ Dependencies installed'));
  } catch (error) {
    console.error(chalk.yellow('⚠ npm install had issues, but continuing...'));
  }
  
  // Make scripts executable
  console.log(chalk.gray('Setting up commands...'));
  const binDir = path.join(INSTALL_DIR, 'bin');
  const scripts = ['auth.js', 'connect.js', 'status.js', 'webhook.js', 'cli.js', 'setup.js'];
  for (const script of scripts) {
    try {
      await fs.chmod(path.join(binDir, script), 0o755);
    } catch {
      // File might not exist, skip
    }
  }
  console.log(chalk.green('✓ Commands ready'));
  
  console.log(chalk.green.bold('\n✅ Installation complete!\n'));
  
  // Next steps
  console.log(chalk.white('Next steps:'));
  console.log(chalk.gray('  1. Authenticate with Knobase:'));
  console.log(chalk.cyan('     npx openclaw-knobase auth'));
  console.log(chalk.gray('  2. Or use OpenClaw:'));
  if (hasOpenClaw) {
    console.log(chalk.cyan('     openclaw knobase auth'));
  } else {
    console.log(chalk.cyan('     openclaw knobase auth') + chalk.gray(' (after installing OpenClaw)'));
  }
  
  console.log(chalk.gray('\nDocumentation:'));
  console.log(chalk.cyan('  ' + path.join(INSTALL_DIR, 'SKILL.md')));
  
  console.log(chalk.gray('\n─────────────────────────────'));
  console.log(chalk.gray('Installed to: ') + INSTALL_DIR);
}

install().catch(err => {
  console.error(chalk.red('❌ Installation failed:'));
  console.error(err.message);
  process.exit(1);
});
