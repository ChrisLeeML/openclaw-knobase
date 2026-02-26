/**
 * OpenClaw Knobase Integration - Main Module
 * 
 * Provides programmatic API for OpenClaw to interact with Knobase
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(SKILL_DIR, '.env');

class KnobaseClient {
  constructor() {
    this.config = null;
    this.baseUrl = 'https://api.knobase.ai';
  }

  async init() {
    await this.loadConfig();
    if (this.config?.KNOBASE_API_ENDPOINT) {
      this.baseUrl = this.config.KNOBASE_API_ENDPOINT;
    }
  }

  async loadConfig() {
    try {
      const content = await fs.readFile(ENV_FILE, 'utf8');
      this.config = {};
      content.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          this.config[key.trim()] = valueParts.join('=').trim();
        }
      });
      return this.config;
    } catch {
      this.config = null;
      return null;
    }
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.config?.KNOBASE_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Agent-ID': this.config?.AGENT_ID
    };
  }

  async request(endpoint, options = {}) {
    if (!this.config?.KNOBASE_API_KEY) {
      throw new Error('Not authenticated. Run: openclaw knobase auth');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Status
  async status() {
    await this.init();
    return {
      authenticated: !!this.config?.AGENT_ID,
      agentId: this.config?.AGENT_ID,
      workspaceId: this.config?.KNOBASE_WORKSPACE_ID,
      connected: !!this.config?.KNOBASE_WORKSPACE_ID
    };
  }

  // Get mentions
  async getMentions(options = {}) {
    await this.init();
    const { limit = 10, unreadOnly = false } = options;
    return this.request(`/v1/agents/${this.config.AGENT_ID}/mentions?limit=${limit}&unread=${unreadOnly}`);
  }

  // Mark mention as read
  async markMentionRead(mentionId) {
    await this.init();
    return this.request(`/v1/mentions/${mentionId}/read`, { method: 'POST' });
  }

  // Send message to Knobase
  async sendMessage({ channel, message, threadId = null }) {
    await this.init();
    return this.request('/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: this.config.KNOBASE_WORKSPACE_ID,
        channel,
        message,
        thread_id: threadId,
        agent_id: this.config.AGENT_ID
      })
    });
  }

  // Get workspace channels
  async getChannels() {
    await this.init();
    return this.request(`/v1/workspaces/${this.config.KNOBASE_WORKSPACE_ID}/channels`);
  }

  // Sync context with Knobase
  async syncContext(context) {
    await this.init();
    return this.request('/v1/context/sync', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: this.config.AGENT_ID,
        workspace_id: this.config.KNOBASE_WORKSPACE_ID,
        context
      })
    });
  }

  // Query Knobase knowledge
  async query(query, options = {}) {
    await this.init();
    return this.request('/v1/query', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: this.config.KNOBASE_WORKSPACE_ID,
        query,
        agent_id: this.config.AGENT_ID,
        ...options
      })
    });
  }
}

// Singleton instance
let client = null;

export async function getClient() {
  if (!client) {
    client = new KnobaseClient();
    await client.init();
  }
  return client;
}

// Convenience exports
export async function status() {
  const c = await getClient();
  return c.status();
}

export async function getMentions(options) {
  const c = await getClient();
  return c.getMentions(options);
}

export async function sendMessage(params) {
  const c = await getClient();
  return c.sendMessage(params);
}

export async function query(q, options) {
  const c = await getClient();
  return c.query(q, options);
}

export async function syncContext(context) {
  const c = await getClient();
  return c.syncContext(context);
}

export default KnobaseClient;
