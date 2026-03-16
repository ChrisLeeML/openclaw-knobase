#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');
const HEALTH_URL = 'http://localhost:3456/health';

function isWebhookRunning() {
  try {
    execSync(`curl -s ${HEALTH_URL}`, { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (isWebhookRunning()) {
    process.exit(0);
  }
  
  const webhookPath = path.join(SKILL_DIR, 'bin', 'webhook.js');
  const child = spawn('node', [webhookPath, 'start'], {
    detached: true,
    stdio: 'ignore',
    cwd: SKILL_DIR
  });
  child.unref();
  
  await new Promise(r => setTimeout(r, 3000));
  
  if (isWebhookRunning()) {
    console.log('✅ Knobase webhook auto-started');
    process.exit(0);
  } else {
    console.error('❌ Failed to auto-start Knobase webhook');
    process.exit(1);
  }
}

main();
