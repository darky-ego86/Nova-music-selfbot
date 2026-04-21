// Nova Music Selfbot
// Credit: Darky

const crypto = require('crypto');
const { logger } = require('./logger');

const MAX_TEXT = 400;
const CACHE_TTL = 1800;
const CACHE_MAX = 500;

const HINDI_VOICES = {
  swara:  { id: 'hi-IN-SwaraNeural',  gender: '♀' },
  madhur: { id: 'hi-IN-MadhurNeural', gender: '♂' },
};

const DEFAULT_VOICE = 'swara';

let edgeTTS = null;
try {
  edgeTTS = require('edge-tts');
} catch {
  // edge-tts not installed
}

class TTSManager {
  constructor(playerManager) {
    this.pm = playerManager;
    this.client = playerManager.client;
    this._voice = {};
    this._urlCache = {};
    this._locks = {};
    this._ttsConns = new Set();
  }

  _cacheKey(text, vid) {
    return crypto.createHash('md5').update(`${text}:${vid}`).digest('hex');
  }

  _getCachedUrl(text, vid) {
    const k = this._cacheKey(text, vid);
    const entry = this._urlCache[k];
    if (entry && (Date.now() / 1000 - entry.time) < CACHE_TTL) return entry.url;
    return null;
  }

  _storeUrl(text, vid, url) {
    const keys = Object.keys(this._urlCache);
    if (keys.length >= CACHE_MAX) {
      const oldest = keys.reduce((a, b) => this._urlCache[a].time < this._urlCache[b].time ? a : b);
      delete this._urlCache[oldest];
    }
    this._urlCache[this._cacheKey(text, vid)] = { url, time: Date.now() / 1000 };
  }

  getVoiceKey(guildId) {
    const k = this._voice[guildId] || DEFAULT_VOICE;
    return HINDI_VOICES[k] ? k : DEFAULT_VOICE;
  }

  getVoiceId(guildId) {
    return HINDI_VOICES[this.getVoiceKey(guildId)].id;
  }

  setVoice(guildId, key) {
    if (!HINDI_VOICES[key]) return false;
    this._voice[guildId] = key;
    return true;
  }

  async _generateBytes(text, vid) {
    try {
      const chunks = [];
      const communicate = new edgeTTS.Communicate(text, vid);
      for await (const chunk of communicate.stream()) {
        if (chunk.type === 'audio') chunks.push(chunk.data);
      }
      const data = Buffer.concat(chunks);
      return data.length ? data : null;
    } catch (e) {
      logger.error(`[TTS] edge-tts error: ${e.message}`);
      return null;
    }
  }

  async _uploadBytes(data) {
    try {
      const { default: fetch } = await import('node-fetch');
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('time', '1h');
      form.append('fileToUpload', data, { filename: 'tts.mp3', contentType: 'audio/mpeg' });
      const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
        method: 'POST', body: form,
      });
      if (res.ok) {
        const text = (await res.text()).trim();
        return text.startsWith('http') ? text : null;
      }
    } catch (e) {
      logger.error(`[TTS] Upload error: ${e.message}`);
    }
    return null;
  }

  async _resolve(text, vid) {
    const cached = this._getCachedUrl(text, vid);
    if (cached) return cached;
    const data = await this._generateBytes(text, vid);
    if (!data) return null;
    const url = await this._uploadBytes(data);
    if (url) this._storeUrl(text, vid, url);
    return url;
  }

  async _queue(guildId, url) {
    const manager = this.client.lavalink;
    let player = manager.players.get(guildId);
    if (!player) player = manager.createPlayer({ guildId, voiceChannelId: null });

    const ttsCnt = player.get('tts_count') || 0;
    if (!player.playing && ttsCnt === 0) player.queue.clear();

    let res = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await player.search(url, this.client.user);
        if (res && res.loadType !== 'empty' && res.loadType !== 'error' && res.tracks.length) break;
        res = null;
      } catch {}
      if (attempt < 2) await sleep(500);
    }

    if (!res || !res.tracks.length) return false;
    const track = res.tracks[0];
    track.pluginInfo = { ...(track.pluginInfo || {}), tts: true };
    player.queue.add(track);
    player.set('tts_count', ttsCnt + 1);
    if (!player.playing) await player.play();
    return true;
  }

  async resolveUrl(guildId, text) {
    if (!edgeTTS) { logger.error('[TTS] edge-tts not installed. Run: npm install edge-tts'); return null; }
    if (text.length > MAX_TEXT) { logger.error(`[TTS] Text too long — max ${MAX_TEXT} chars`); return null; }
    const vkey = this.getVoiceKey(guildId);
    const { id: vid, gender } = HINDI_VOICES[vkey];
    logger.info(`[TTS] Generating audio (${gender} ${vkey})...`);
    const url = await this._resolve(text, vid);
    if (!url) logger.error('[TTS] Failed to generate TTS audio.');
    return url;
  }

  async playUrl(guildId, voiceChannelId, url) {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return logger.error('[TTS] Guild not found.');
    const ok = await this._queue(guildId, url);
    if (!ok) return logger.error('[TTS] Failed to load audio into player.');
    logger.success('[TTS] Queued TTS audio.');
  }

  async stop(guildId) {
    const player = this.client.lavalink?.players?.get(guildId);
    if (!player) return logger.error('[TTS] Not connected to any voice channel.');
    await player.stopPlaying(true, true);
    player.set('tts_count', 0);
    this._ttsConns.delete(guildId);
    logger.success('[TTS] Stopped and disconnected.');
  }

  listVoices() {
    const chalk = require('chalk');
    logger.separator();
    console.log(chalk.redBright('  HINDI TTS VOICES'.padStart(28)));
    logger.separator();
    for (const [key, { id, gender }] of Object.entries(HINDI_VOICES)) {
      const marker = key === DEFAULT_VOICE ? chalk.greenBright('(default)') : '';
      console.log(`  ${chalk.cyan('*')} ${gender} ${key} ${chalk.gray(`(${id})`)} ${marker}`);
    }
    logger.separator();
  }

  showVoice(guildId) {
    const vkey = this.getVoiceKey(guildId);
    const { gender } = HINDI_VOICES[vkey];
    logger.info(`[TTS] Current voice: ${gender} ${vkey}`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { TTSManager };
