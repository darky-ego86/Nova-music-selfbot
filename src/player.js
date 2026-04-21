// Nova Music Selfbot
// Credit: Darky

const chalk = require('chalk');
const { logger } = require('./logger');
const { formatTime, createProgressBar } = require('./utils');
const { applyFilter, clearFilters, listFilters } = require('./filters');
const { TTSManager } = require('./tts');

const MAX_SEARCH_RETRIES = 2;
const AUTO_SKIP_DELAY = 1500;

const URL_RX = /https?:\/\/(?:www\.)?.+/;

const SOURCE_PREFIXES = {
  'sp ': 'spsearch',
  'yt ': 'ytsearch',
  'sc ': 'scsearch',
  'js ': 'jssearch',
  'am ': 'amsearch',
  'dz ': 'dzsearch',
};

const SOURCE_NAMES = {
  spsearch: 'Spotify',
  ytsearch: 'YouTube',
  scsearch: 'SoundCloud',
  jssearch: 'JioSaavn',
  amsearch: 'Apple Music',
  dzsearch: 'Deezer',
};

const URL_PATTERNS = [
  [/https?:\/\/(open\.spotify\.com|spotify\.com)\//, 'Spotify'],
  [/https?:\/\/(www\.youtube\.com|youtu\.be|music\.youtube\.com)\//, 'YouTube'],
  [/https?:\/\/music\.apple\.com\//, 'Apple Music'],
  [/https?:\/\/(www\.)?jiosaavn\.com\//, 'JioSaavn'],
  [/https?:\/\/(www\.)?soundcloud\.com\//, 'SoundCloud'],
  [/https?:\/\/(www\.)?deezer\.com\//, 'Deezer'],
];

const MULTI_SEARCH_SOURCES = ['ytsearch', 'spsearch', 'scsearch', 'jssearch'];

function scoreResult(query, track, sourceKey) {
  const ql = query.toLowerCase();
  const tl = (track.info?.title || '').toLowerCase();
  const al = (track.info?.author || '').toLowerCase();
  let score = 0;
  if (tl.includes(ql)) score += 50;
  if (ql === tl) score += 100;
  const qw = new Set(ql.split(' '));
  const tw = new Set(tl.split(' '));
  const aw = new Set(al.split(' '));
  for (const w of qw) { if (tw.has(w)) score += 20; if (aw.has(w)) score += 15; }
  if ((track.info?.length || 0) > 0) score += 10;
  if (sourceKey === 'spsearch') score += 8;
  else if (sourceKey === 'ytsearch') score += 5;
  return score;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class PlayerManager {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.activeFilter = {};
    this.contextGuild = null;
    this.contextVoice = null;
    this.tts = new TTSManager(this);
  }

  setupLavalink(lavalink) {
    this.lavalink = lavalink;

    lavalink.on('trackStart', (player, track) => {
      const ttsCnt = player.get('tts_count') || 0;
      if (ttsCnt > 0) return;
      logger.music(`Now playing: ${track.info.title}`, {
        author: track.info.author,
        duration: formatTime(track.info.length),
      });
    });

    lavalink.on('trackEnd', (player, track) => {
      if (track.pluginInfo?.tts) {
        const cnt = player.get('tts_count') || 0;
        player.set('tts_count', Math.max(0, cnt - 1));
      }
    });

    lavalink.on('queueEnd', () => {
      logger.info('Queue ended. Staying in voice channel.');
    });

    lavalink.on('trackStuck', async (player, track) => {
      if (track.pluginInfo?.tts) {
        const cnt = player.get('tts_count') || 0;
        player.set('tts_count', Math.max(0, cnt - 1));
        if (player.queue.size) await player.skip();
        else await player.stopPlaying();
        return;
      }
      logger.warning(`Track stuck: ${track.info.title} — auto-skipping in ${AUTO_SKIP_DELAY / 1000}s`);
      await sleep(AUTO_SKIP_DELAY);
      if (player.queue.size) await player.skip();
      else await player.stopPlaying();
    });

    lavalink.on('trackError', async (player, track) => {
      if (track.pluginInfo?.tts) {
        const cnt = player.get('tts_count') || 0;
        player.set('tts_count', Math.max(0, cnt - 1));
        if (player.queue.size) await player.skip();
        else await player.stopPlaying();
        return;
      }
      logger.warning(`Track error: ${track.info.title} — auto-skipping in ${AUTO_SKIP_DELAY / 1000}s`);
      await sleep(AUTO_SKIP_DELAY);
      if (player.queue.size) await player.skip();
      else await player.stopPlaying();
    });
  }

  setContext(guildId, voiceId = null) {
    this.contextGuild = guildId;
    if (voiceId) this.contextVoice = voiceId;
  }

  _detectUrlSource(query) {
    for (const [pattern, name] of URL_PATTERNS) {
      if (pattern.test(query)) return name;
    }
    return null;
  }

  _detectPrefixSource(query) {
    for (const [prefix, sourceKey] of Object.entries(SOURCE_PREFIXES)) {
      if (query.toLowerCase().startsWith(prefix)) {
        return [sourceKey, query.slice(prefix.length)];
      }
    }
    return [null, query];
  }

  async _multiSourceSearch(player, query) {
    for (let attempt = 1; attempt <= MAX_SEARCH_RETRIES; attempt++) {
      logger.info(`Searching across ${MULTI_SEARCH_SOURCES.length} sources (attempt ${attempt})...`);
      const results = await Promise.allSettled(
        MULTI_SEARCH_SOURCES.map(src => player.search(`${src}:${query}`, this.client.user))
      );

      let bestResult = null;
      let bestScore = 0;
      let bestSource = null;

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'rejected') continue;
        const res = r.value;
        if (!res || res.loadType === 'empty' || !res.tracks.length) continue;
        const track = res.tracks[0];
        const srcKey = MULTI_SEARCH_SOURCES[i];
        const score = scoreResult(query, track, srcKey);
        if (score > bestScore) {
          bestScore = score;
          bestResult = res;
          bestSource = SOURCE_NAMES[srcKey] || srcKey;
        }
      }

      if (bestResult) return [bestResult, bestSource];
      if (attempt < MAX_SEARCH_RETRIES) await sleep(500 * attempt);
    }
    return [null, null];
  }

  async join(guildId, voiceChannelId) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return logger.error('Guild not found.');
    const channel = guild.channels.cache.get(voiceChannelId);
    if (!channel) return logger.error('Voice channel not found.');
    const player = this.lavalink.createPlayer({ guildId, voiceChannelId });
    if (player.connected) return logger.info(`Already connected to ${channel.name}.`);
    await player.connect();
    logger.success(`Joined: ${channel.name}`);
  }

  async play(guildId, voiceChannelId, query, autoPlay = true) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return logger.error('Guild not found.');
    const channel = guild.channels.cache.get(voiceChannelId);
    if (!channel) return logger.error('Voice channel not found.');

    let player = this.lavalink.players.get(guildId);
    if (!player) {
      player = this.lavalink.createPlayer({ guildId, voiceChannelId });
      await player.connect();
    } else if (!player.connected) {
      await player.connect();
    }

    const isUrl = URL_RX.test(query);
    const urlSource = isUrl ? this._detectUrlSource(query) : null;
    const [prefixSource, strippedQuery] = this._detectPrefixSource(query);

    let finalQuery, sourceLabel;

    if (isUrl) {
      finalQuery = query;
      sourceLabel = urlSource || 'URL';
    } else if (prefixSource) {
      finalQuery = `${prefixSource}:${strippedQuery}`;
      sourceLabel = SOURCE_NAMES[prefixSource] || prefixSource;
      logger.info(`Searching ${sourceLabel}: ${strippedQuery}`);
    } else {
      const [results, src] = await this._multiSourceSearch(player, query);
      if (results && results.tracks.length) {
        return await this._handleResults(player, results, query, src || 'Best Match', autoPlay);
      }
      return logger.error('No results found across any source.');
    }

    const results = await player.search(finalQuery, this.client.user);
    if (!results || results.loadType === 'empty' || !results.tracks.length) {
      return logger.error('No results found.');
    }

    await this._handleResults(player, results, query, sourceLabel, autoPlay);
  }

  async _handleResults(player, results, query, sourceLabel, autoPlay = true) {
    if (results.loadType === 'playlist') {
      for (const track of results.tracks) player.queue.add(track);
      logger.success(`Added playlist: ${results.playlistInfo?.name || 'Unknown'}`, {
        tracks: results.tracks.length, source: sourceLabel,
      });
    } else {
      const track = results.tracks[0];
      player.queue.add(track);
      logger.success(`Queued: ${track.info.title}`, {
        author: track.info.author,
        duration: formatTime(track.info.length),
        source: sourceLabel,
        position: player.queue.size,
      });
    }
    if (autoPlay && !player.playing) await player.play();
  }

  async startPlayback(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (player && !player.playing && player.queue.size) await player.play();
  }

  async skip(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player || !player.playing) return logger.error('Nothing is playing.');
    const title = player.queue.current?.info?.title || 'current track';
    await player.skip();
    logger.success(`Skipped: ${title}`);
  }

  async stop(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Nothing is playing.');
    player.queue.clear();
    await player.stopPlaying(true, true);
    delete this.activeFilter[guildId];
    logger.success('Stopped and cleared queue.');
  }

  async disconnect(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Not connected to any voice channel.');
    player.queue.clear();
    await player.destroy();
    delete this.activeFilter[guildId];
    logger.success('Disconnected from voice channel.');
  }

  nowPlaying(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player || !player.queue.current) return logger.error('Nothing is playing.');
    const track = player.queue.current;
    const position = player.position;
    const duration = track.info.length;
    const bar = createProgressBar(position, duration);
    const timeStr = duration > 0
      ? `${formatTime(position)} / ${formatTime(duration)}`
      : formatTime(position);
    const state = player.paused ? chalk.redBright('Paused') : chalk.greenBright('Playing');
    const currentFilter = this.activeFilter[guildId] || 'none';
    const vol = player.volume;
    let loopMode = 'off';
    if (player.repeatMode === 'track') loopMode = 'track';
    else if (player.repeatMode === 'queue') loopMode = 'queue';

    logger.separator();
    console.log(`  ${chalk.whiteBright.bold(track.info.title)}`);
    console.log(`  ${chalk.gray(track.info.author)}`);
    console.log();
    console.log(`  ${bar}`);
    console.log(`  ${chalk.gray(timeStr)}`);
    console.log();
    console.log(
      `  ${chalk.gray('State:')} ${state}    ` +
      `${chalk.gray('Vol:')} ${chalk.cyan(vol)}    ` +
      `${chalk.gray('Loop:')} ${chalk.cyan(loopMode)}    ` +
      `${chalk.gray('Filter:')} ${chalk.magenta(currentFilter)}`
    );
    logger.separator();
  }

  getQueue(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Nothing is playing.');

    logger.separator();
    console.log(chalk.redBright('  QUEUE'.padStart(22)));
    logger.separator();

    if (player.queue.current) {
      console.log(`  ${chalk.greenBright('Now:')} ${chalk.bold(player.queue.current.info.title)} ${chalk.gray(`[${formatTime(player.queue.current.info.length)}]`)}`);
      console.log();
    }

    const tracks = player.queue.tracks.slice(0, 20);
    if (tracks.length) {
      tracks.forEach((t, i) => {
        console.log(`  ${chalk.cyan(`${String(i + 1).padStart(3)}.`)} ${t.info.title} ${chalk.gray(`[${formatTime(t.info.length)}]`)}`);
      });
      if (player.queue.size > 20) {
        console.log(`  ${chalk.gray(`... and ${player.queue.size - 20} more`)}`);
      }
    } else {
      console.log(`  ${chalk.gray('Queue is empty.')}`);
    }

    console.log(`\n  ${chalk.gray(`Total: ${player.queue.size} track(s)`)}`);
    logger.separator();
  }

  async setVolume(guildId, volume = null) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Nothing is playing.');
    if (volume === null) return logger.info(`Current volume: ${player.volume}`);
    if (volume < 1 || volume > 1000) return logger.error('Volume must be between 1 and 1000.');
    await player.setVolume(volume);
    const barLen = Math.min(Math.floor(volume / 20), 50);
    const bar = chalk.greenBright('|'.repeat(barLen)) + chalk.gray('|'.repeat(50 - barLen));
    console.log(`  ${bar} ${chalk.cyan(volume)}`);
  }

  async applyFilterCmd(guildId, filterName) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Nothing is playing.');
    if (filterName === 'clear') {
      await clearFilters(player);
      delete this.activeFilter[guildId];
      return logger.success('Cleared all filters.');
    }
    const applied = await applyFilter(player, filterName);
    if (applied) {
      this.activeFilter[guildId] = filterName;
      logger.success(`Applied filter: ${filterName}`);
    } else {
      logger.error(`Unknown filter. Available: ${listFilters().join(', ')}`);
    }
  }

  async seek(guildId, positionSeconds) {
    const player = this.lavalink.players.get(guildId);
    if (!player || !player.queue.current) return logger.error('Nothing is playing.');
    await player.seek(positionSeconds * 1000);
    logger.success(`Seeked to ${formatTime(positionSeconds * 1000)}`);
  }

  async pause(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Nothing is playing.');
    if (player.paused) await player.resume();
    else await player.pause();
    logger.info(`Playback: ${player.paused ? 'Paused' : 'Resumed'}`);
  }

  async shuffle(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Nothing is playing.');
    if (player.queue.size <= 1) return logger.warning('Need more than 1 track in queue to shuffle.');
    player.queue.shuffle();
    logger.success(`Shuffled ${player.queue.size} tracks.`);
  }

  async loop(guildId, mode) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Nothing is playing.');
    mode = mode.toLowerCase();
    if (mode === 'track') { player.setRepeatMode('track'); logger.success('Looping: current track'); }
    else if (mode === 'queue') { player.setRepeatMode('queue'); logger.success('Looping: entire queue'); }
    else if (['off', 'disable', 'none'].includes(mode)) { player.setRepeatMode('off'); logger.success('Looping disabled.'); }
    else logger.error('Invalid mode. Use: track, queue, or off');
  }

  async clearQueue(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player) return logger.error('Nothing is playing.');
    const count = player.queue.size;
    player.queue.clear();
    logger.success(`Cleared ${count} track(s) from queue.`);
  }

  async replay(guildId) {
    const player = this.lavalink.players.get(guildId);
    if (!player || !player.queue.current) return logger.error('Nothing is playing.');
    const track = player.queue.current;
    player.queue.tracks.unshift(track);
    logger.success(`Pushed ${track.info.title} to queue #1.`);
  }

  listGuilds() {
    const guilds = this.client.guilds.cache;
    if (!guilds.size) return logger.error('Not in any guilds.');
    logger.separator();
    console.log(chalk.redBright('  GUILDS'.padStart(23)));
    logger.separator();
    for (const [, g] of guilds) {
      console.log(`  ${chalk.cyan('*')} ${g.name} ${chalk.gray(`(${g.id}) - ${g.memberCount} members`)}`);
    }
    console.log(`\n  ${chalk.gray(`Total: ${guilds.size} guild(s)`)}`);
    logger.separator();
  }

  showNodes() {
    logger.separator();
    console.log(chalk.redBright('  LAVALINK NODES'.padStart(27)));
    logger.separator();
    for (const node of this.lavalink.nodeManager.nodes.values()) {
      const status = node.connected ? chalk.greenBright('Connected') : chalk.redBright('Offline');
      console.log(`  ${chalk.cyan('*')} ${node.id} ${chalk.gray(`(${node.options.host}:${node.options.port})`)} [${status}]`);
    }
    logger.separator();
  }
}

module.exports = { PlayerManager };
