// Nova Music Selfbot
// Credit: Darky

const readline = require('readline');
const chalk = require('chalk');
const { logger } = require('./logger');
const { banner, menuBox } = require('./utils');
const { listFilters } = require('./filters');

const HELP_SECTIONS = [
  ['MUSIC', [
    '[join]                         - Join voice channel',
    '[play]    <query/url>          - Play a song or playlist',
    '[skip]                         - Skip current track',
    '[stop]                         - Stop and clear queue',
    '[dc]                           - Disconnect from voice',
    '[np]                           - Now playing details',
    '[queue]                        - Show current queue',
    '[volume]  [1-1000]             - Get/set volume',
    '[seek]    <seconds>            - Seek to position',
    '[pause]                        - Toggle pause/resume',
  ]],
  ['QUEUE', [
    '[shuffle]                      - Shuffle the queue',
    '[loop]    <track/queue/off>    - Set loop mode',
    '[clear]                        - Clear the queue',
    '[replay]                       - Push current to #1',
  ]],
  ['FILTERS', [
    '[filter]  <name>               - Apply an audio filter',
    '[filter]  clear                - Remove all filters',
    '[filters]                      - List available filters',
  ]],
  ['SOURCES (use with play)', [
    '[yt] YouTube   [sp] Spotify   [sc] SoundCloud',
    '[js] JioSaavn  [am] Apple     [dz] Deezer',
    'Example: play sp shape of you',
    'No prefix = auto-searches all sources',
  ]],
  ['HINDI TTS', [
    '[tts]      <text>              - Speak Hindi text in voice',
    '[ttsvoice] <swara/madhur>      - Switch Hindi TTS voice',
    '[ttsstop]                      - Stop TTS and disconnect',
    '[ttsvoices]                    - List available Hindi voices',
  ]],
  ['SESSION', [
    '[use]     <guild_id> [vc_id]   - Set active guild (all bots)',
    '[bots]                         - List all bots',
    '[guilds]                       - List all guilds',
    '[nodes]                        - Lavalink node status',
    '[status]  <online/idle/dnd>    - Change presence',
  ]],
  ['SYSTEM', [
    '[help]                         - Show this help',
    '[exit]                         - Shut down',
  ]],
];

function showHelp() {
  for (const [title, items] of HELP_SECTIONS) {
    menuBox(title, items);
  }
}

class CLI {
  constructor(playerManagers, clients) {
    this.allPm = playerManagers;
    this.allClients = clients;
    this.running = true;
  }

  async _runAll(fn) {
    const results = await Promise.allSettled(
      this.allPm.map((pm, i) => fn(pm, this.allClients[i]))
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') logger.error(`Bot #${i + 1}: ${r.reason}`);
    });
  }

  async start() {
    banner();
    showHelp();
    if (this.allClients.length > 1) {
      logger.info(`${this.allClients.length} bots loaded. All commands apply to all bots simultaneously.`);
    }
    logger.info("Type 'help' for commands or 'use <guild_id> <voice_id>' to set context.");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

    const prompt = () => {
      process.stdout.write(chalk.redBright(' nova > '));
    };

    prompt();
    rl.on('line', async (line) => {
      line = line.trim();
      if (!line) { prompt(); return; }
      await this.handle(line);
      if (this.running) prompt();
    });

    rl.on('close', () => { this.running = false; });
  }

  async handle(line) {
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      if (cmd === 'help') {
        showHelp();

      } else if (cmd === 'exit') {
        logger.warning('Shutting down...');
        this.running = false;
        await this._runAll(async (pm) => { try { await pm.disconnect(pm.contextGuild); } catch {} });
        process.exit(0);

      } else if (cmd === 'bots') {
        logger.separator();
        console.log(chalk.redBright('  BOTS'.padStart(22)));
        logger.separator();
        this.allClients.forEach((c, i) => {
          const pm = this.allPm[i];
          let guildName = '';
          if (pm.contextGuild) {
            const g = c.guilds.cache.get(pm.contextGuild);
            guildName = g ? ` -> ${g.name}` : '';
          }
          console.log(`  ${chalk.cyan(`#${i + 1}`)} ${c.user.tag} ${chalk.gray(`(${c.guilds.cache.size} guilds)${guildName}`)}`);
        });
        logger.separator();

      } else if (cmd === 'use') {
        if (!args[0]) return logger.error('Usage: use <guild_id> [voice_channel_id]');
        const guildId = args[0];
        const voiceId = args[1] || null;
        this.allPm.forEach((pm, i) => {
          const client = this.allClients[i];
          const guild = client.guilds.cache.get(guildId);
          if (guild) {
            pm.setContext(guildId, voiceId);
            const ch = voiceId ? guild.channels.cache.get(voiceId) : null;
            logger.success(`Bot #${i + 1} context set: ${guild.name}`, { channel: ch?.name || 'none' });
          } else {
            logger.warning(`Bot #${i + 1}: Guild ${guildId} not found, skipped.`);
          }
        });

      } else if (cmd === 'join') {
        await this._runAll(async (pm) => {
          if (pm.contextGuild && pm.contextVoice) await pm.join(pm.contextGuild, pm.contextVoice);
        });

      } else if (cmd === 'play') {
        if (!args.length) return logger.error('Usage: play <query/url>');
        const query = args.join(' ');
        await this._runAll(async (pm) => {
          if (pm.contextGuild && pm.contextVoice) await pm.play(pm.contextGuild, pm.contextVoice, query, false);
        });
        await this._runAll(async (pm) => {
          if (pm.contextGuild) await pm.startPlayback(pm.contextGuild);
        });

      } else if (cmd === 'skip') {
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.skip(pm.contextGuild); });

      } else if (cmd === 'stop') {
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.stop(pm.contextGuild); });

      } else if (['dc', 'disconnect', 'leave'].includes(cmd)) {
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.disconnect(pm.contextGuild); });

      } else if (['np', 'nowplaying', 'now'].includes(cmd)) {
        this.allPm.forEach((pm, i) => {
          if (pm.contextGuild) {
            if (this.allPm.length > 1) logger.info(`Bot #${i + 1}:`);
            pm.nowPlaying(pm.contextGuild);
          }
        });

      } else if (['queue', 'q'].includes(cmd)) {
        this.allPm.forEach((pm, i) => {
          if (pm.contextGuild) {
            if (this.allPm.length > 1) logger.info(`Bot #${i + 1}:`);
            pm.getQueue(pm.contextGuild);
          }
        });

      } else if (['volume', 'vol'].includes(cmd)) {
        const vol = args[0] ? parseInt(args[0]) : null;
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.setVolume(pm.contextGuild, vol); });

      } else if (cmd === 'seek') {
        if (!args[0]) return logger.error('Usage: seek <seconds>');
        const secs = parseInt(args[0]);
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.seek(pm.contextGuild, secs); });

      } else if (cmd === 'pause') {
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.pause(pm.contextGuild); });

      } else if (cmd === 'shuffle') {
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.shuffle(pm.contextGuild); });

      } else if (cmd === 'loop') {
        if (!args[0]) return logger.error('Usage: loop <track/queue/off>');
        const mode = args[0];
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.loop(pm.contextGuild, mode); });

      } else if (['clear', 'clearqueue'].includes(cmd)) {
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.clearQueue(pm.contextGuild); });

      } else if (['replay', 'pushfirst'].includes(cmd)) {
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.replay(pm.contextGuild); });

      } else if (cmd === 'filter') {
        if (!args[0]) return logger.error('Usage: filter <name> or filter clear');
        const fname = args[0].toLowerCase();
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.applyFilterCmd(pm.contextGuild, fname); });

      } else if (cmd === 'filters') {
        const available = listFilters();
        logger.separator();
        console.log(chalk.redBright('  AVAILABLE FILTERS'.padStart(29)));
        logger.separator();
        for (const f of available) {
          console.log(`  ${chalk.magenta('*')} ${f}`);
        }
        logger.separator();

      } else if (cmd === 'guilds') {
        this.allPm.forEach((pm, i) => {
          if (this.allPm.length > 1) logger.info(`Bot #${i + 1}:`);
          pm.listGuilds();
        });

      } else if (cmd === 'nodes') {
        this.allPm[0].showNodes();

      } else if (cmd === 'tts') {
        if (!args.length) return logger.error('Usage: tts <text>');
        const text = args.join(' ');
        const firstPm = this.allPm.find(pm => pm.contextGuild);
        if (!firstPm) return logger.error("No context set. Use 'use <guild_id> <vc_id>' first.");
        const url = await firstPm.tts.resolveUrl(firstPm.contextGuild, text);
        if (!url) return;
        await this._runAll(async (pm) => {
          if (pm.contextGuild && pm.contextVoice) await pm.tts.playUrl(pm.contextGuild, pm.contextVoice, url);
        });

      } else if (cmd === 'ttsvoice') {
        if (!args[0]) {
          const pm = this.allPm.find(p => p.contextGuild);
          if (pm) pm.tts.showVoice(pm.contextGuild);
          return;
        }
        const key = args[0].toLowerCase();
        this.allPm.forEach((pm, i) => {
          if (pm.contextGuild) {
            if (pm.tts.setVoice(pm.contextGuild, key)) logger.success(`Bot #${i + 1} TTS voice set to: ${key}`);
            else logger.error(`Unknown voice '${key}'. Available: swara, madhur`);
          }
        });

      } else if (cmd === 'ttsstop') {
        await this._runAll(async (pm) => { if (pm.contextGuild) await pm.tts.stop(pm.contextGuild); });

      } else if (cmd === 'ttsvoices') {
        this.allPm[0].tts.listVoices();

      } else if (cmd === 'status') {
        if (!args[0]) return logger.error('Usage: status <online|idle|dnd|invisible>');
        const s = args[0].toLowerCase();
        const valid = ['online', 'idle', 'dnd', 'invisible'];
        if (!valid.includes(s)) return logger.error(`Invalid. Choose: ${valid.join(', ')}`);
        for (const c of this.allClients) {
          await c.user.setStatus(s);
        }
        logger.success(`Status: ${s} (all bots)`);

      } else {
        logger.error(`Unknown command: ${cmd}. Type 'help' for commands.`);
      }
    } catch (e) {
      logger.error(e.message || String(e));
    }
  }
}

module.exports = { CLI };
