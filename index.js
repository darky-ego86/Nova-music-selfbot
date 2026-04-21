// Nova Music Selfbot
// Credit: Darky

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('discord.js-selfbot-v13');
const { Lavalink } = require('lavalink-client');
const { PlayerManager } = require('./src/player');
const { CLI } = require('./src/cli');
const { logger } = require('./src/logger');
const { truncateToken } = require('./src/utils');

// ── Config ──────────────────────────────────────────────────────────────────

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      logger.error(`config.json not found at ${configPath}. Place it next to index.js.`);
    } else {
      logger.error(`config.json is invalid JSON: ${e.message}`);
    }
    process.exit(1);
  }
  if (!config.nodes || !config.nodes.length) {
    logger.error("config.json must contain a non-empty 'nodes' list.");
    process.exit(1);
  }
  return config;
}

function loadTokens() {
  const tokensPath = path.join(__dirname, 'tokens.txt');
  let tokens;
  try {
    tokens = fs.readFileSync(tokensPath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
  } catch (e) {
    logger.error('tokens.txt not found. Create it with one token per line.');
    process.exit(1);
  }
  if (!tokens.length) {
    logger.error('No tokens found in tokens.txt.');
    process.exit(1);
  }
  return tokens;
}

function removeInvalidToken(token) {
  try {
    const tokensPath = path.join(__dirname, 'tokens.txt');
    const lines = fs.readFileSync(tokensPath, 'utf8').split('\n');
    const filtered = lines.filter(l => l.trim() !== token);
    fs.writeFileSync(tokensPath, filtered.join('\n'));
    logger.warning(`Removed invalid token ...${truncateToken(token)} from tokens.txt`);
  } catch (e) {
    logger.error(`Failed to remove token: ${e.message}`);
  }
}

function setTitle(text) {
  if (process.platform === 'win32') {
    process.title = text;
  } else {
    process.stdout.write(`\x1b]0;${text}\x07`);
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

const CONFIG = loadConfig();

const clients = [];
const playerManagers = [];
let readyCount = 0;
let totalClients = 0;
let cliStarted = false;

async function startCLI() {
  if (cliStarted) return;
  cliStarted = true;
  setTitle(`Nova Music | ${clients.length} bot(s)`);
  const cli = new CLI(playerManagers, clients);
  await cli.start();
}

async function runClient(token, index) {
  const client = new Client({ checkUpdate: false });

  const lavalink = new Lavalink({
    client,
    nodes: CONFIG.nodes.map(n => ({
      id: n.name,
      host: n.host,
      port: n.port,
      authorization: n.auth,
      secure: n.secure || false,
    })),
    sendToShard: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild) guild.shard.send(payload);
    },
  });

  client.on('raw', d => lavalink.sendRawData(d));

  const pm = new PlayerManager(client, CONFIG);

  client.once('ready', async () => {
    logger.success(`Bot #${index + 1} logged in as ${client.user.tag}`, {
      token: `...${truncateToken(token)}`,
    });

    await lavalink.init(client.user);
    pm.setupLavalink(lavalink);

    clients.push(client);
    playerManagers.push(pm);
    readyCount++;

    if (readyCount >= totalClients) {
      await startCLI();
    }
  });

  try {
    await client.login(token);
  } catch (e) {
    if (e.message?.includes('TOKEN_INVALID') || e.message?.includes('401')) {
      logger.error(`Bot #${index + 1} failed to login: Invalid token`);
      removeInvalidToken(token);
      totalClients = Math.max(totalClients - 1, 0);
      if (totalClients === 0) {
        logger.error('All tokens failed. Exiting.');
        process.exit(1);
      }
      if (readyCount >= totalClients && totalClients > 0) await startCLI();
    } else {
      logger.error(`Bot #${index + 1} error: ${e.message}`);
      totalClients = Math.max(totalClients - 1, 0);
      if (totalClients === 0) { logger.error('All tokens failed. Exiting.'); process.exit(1); }
      if (readyCount >= totalClients && totalClients > 0) await startCLI();
    }
  }
}

async function main() {
  setTitle('Nova Music Selfbot');

  const tokens = loadTokens();
  totalClients = tokens.length;

  logger.separator();
  logger.info(`Found ${tokens.length} token(s)`);
  tokens.forEach((t, i) => logger.info(`  Bot #${i + 1}: ...${truncateToken(t)}`));
  logger.separator();

  await Promise.allSettled(tokens.map((t, i) => runClient(t, i)));
}

process.on('SIGINT', () => {
  logger.warning('Shutting down...');
  process.exit(0);
});

main().catch(e => {
  logger.error(`Fatal: ${e.message}`);
  process.exit(1);
});
