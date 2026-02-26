#!/usr/bin/env node

/**
 * Knobase Webhook Server
 * 
 * Usage: openclaw knobase webhook start [--port 3456] [--daemon]
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(SKILL_DIR, '.env');

let config = null;

async function loadConfig() {
  try {
    const content = await fs.readFile(ENV_FILE, 'utf8');
    config = {};
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

function verifySignature(payload, signature, secret) {
  if (!signature || !secret) return true;
  
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

async function sendTelegram(message) {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    console.log(chalk.yellow('Telegram not configured, skipping notification'));
    return;
  }
  
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        })
      }
    );
    
    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text());
    }
  } catch (error) {
    console.error('Telegram error:', error.message);
  }
}

function formatMention(data) {
  return `
🎯 <b>@claw Mention in Knobase</b>

<b>From:</b> ${escapeHtml(data.user)}
<b>Channel:</b> ${escapeHtml(data.channel || 'Unknown')}
<b>Time:</b> ${new Date(data.timestamp).toLocaleString()}

<b>Message:</b>
${escapeHtml(data.message)}

${data.context ? `<b>Context:</b> ${escapeHtml(data.context)}\n` : ''}
${data.url ? `<a href="${data.url}">🔗 Open in Knobase</a>` : ''}
  `.trim();
}

function formatNotification(data) {
  const emoji = data.priority === 'high' ? '🔴' : data.priority === 'low' ? '⚪' : '🔵';
  return `
${emoji} <b>${escapeHtml(data.title || 'Notification')}</b>

${escapeHtml(data.message)}

<i>${new Date(data.timestamp).toLocaleString()}</i>
  `.trim();
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function startServer(port = 3456) {
  await loadConfig();
  
  if (!config || !config.AGENT_ID) {
    console.error(chalk.red('❌ Not authenticated. Run: openclaw knobase auth'));
    process.exit(1);
  }
  
  const app = express();
  app.use(express.json());
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      agent: config.AGENT_ID,
      timestamp: new Date().toISOString()
    });
  });
  
  // Webhook endpoint
  app.post('/webhook/knobase', async (req, res) => {
    try {
      const signature = req.headers['x-knobase-signature'];
      
      if (!verifySignature(req.body, signature, config.KNOBASE_WEBHOOK_SECRET)) {
        console.log(chalk.red('Invalid webhook signature'));
        return res.status(401).json({ error: 'Invalid signature' });
      }
      
      const { event, data } = req.body;
      
      console.log(chalk.gray(`[${new Date().toISOString()}] Received ${event} event`));
      
      switch (event) {
        case 'mention':
          await sendTelegram(formatMention(data));
          console.log(chalk.green('✓ Mention notification sent'));
          break;
          
        case 'notification':
          await sendTelegram(formatNotification(data));
          console.log(chalk.green('✓ Notification sent'));
          break;
          
        case 'system':
          console.log(chalk.blue('System event:', data.event));
          break;
          
        default:
          console.log(chalk.yellow(`Unknown event type: ${event}`));
      }
      
      res.json({ success: true });
      
    } catch (error) {
      console.error(chalk.red('Webhook error:', error.message));
      res.status(500).json({ error: 'Internal error' });
    }
  });
  
  app.listen(port, () => {
    console.log(chalk.green.bold(`🚀 Knobase webhook server running`));
    console.log(chalk.white('Agent ID: ') + chalk.cyan(config.AGENT_ID));
    console.log(chalk.white('Webhook URL: ') + chalk.cyan(`http://localhost:${port}/webhook/knobase`));
    console.log(chalk.white('Health Check: ') + chalk.cyan(`http://localhost:${port}/health`));
    console.log(chalk.gray('\nPress Ctrl+C to stop\n'));
  });
}

// Parse arguments
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : (process.env.WEBHOOK_PORT || 3456);

startServer(port);
