// Nova Music Selfbot
// Credit: Darky

const FILTERS = {
  lofi:       { timescale: { speed: 0.75, pitch: 0.8,   rate: 1.0  } },
  nightcore:  { timescale: { speed: 1.165, pitch: 1.125, rate: 1.05 } },
  slowmo:     { timescale: { speed: 0.5,  pitch: 1.0,   rate: 0.8  } },
  chipmunk:   { timescale: { speed: 1.05, pitch: 1.35,  rate: 1.25 } },
  darthvader: { timescale: { speed: 0.975,pitch: 0.5,   rate: 0.8  } },
  daycore:    { timescale: { speed: 0.9,  pitch: 1.0,   rate: 1.0  } },
  damon:      { timescale: { speed: 0.69, pitch: 0.8,   rate: 1.0  } },
};

async function applyFilter(player, name) {
  name = name.toLowerCase();

  if (name === '8d') {
    await player.filters.setRotation({ rotationHz: 0.3 });
    await player.filters.commit();
    return true;
  }

  if (name === 'tremolo') {
    await player.filters.setTremolo({ frequency: 4.0, depth: 0.75 });
    await player.filters.commit();
    return true;
  }

  if (name === 'vibrate') {
    await player.filters.setTremolo({ frequency: 4.0, depth: 0.75 });
    await player.filters.setVibrato({ frequency: 4.0, depth: 0.75 });
    await player.filters.commit();
    return true;
  }

  if (name === 'bassboost') {
    await player.filters.setEqualizer([
      { band: 0, gain: 0.2  }, { band: 1, gain: 0.15 }, { band: 2, gain: 0.1  },
      { band: 3, gain: 0.05 }, { band: 4, gain: 0.0  }, { band: 5, gain: -0.05 },
      { band: 6, gain: -0.1 }, { band: 7, gain: -0.1 }, { band: 8, gain: -0.1  },
      { band: 9, gain: -0.1 }, { band: 10, gain: -0.1 }, { band: 11, gain: -0.1 },
      { band: 12, gain: -0.1 }, { band: 13, gain: -0.1 }, { band: 14, gain: -0.1 },
    ]);
    await player.filters.commit();
    return true;
  }

  if (name === 'earrape') {
    await player.filters.reset();
    await player.filters.setEqualizer(Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 0.25 })));
    await player.filters.setVolume(5.0);
    await player.filters.setDistortion({ sinOffset: 0.5, sinScale: 2.0, cosOffset: 0.5, cosScale: 2.0, tanOffset: 0.5, tanScale: 2.0, offset: 0.5, scale: 2.0 });
    await player.filters.setChannelMix({ leftToLeft: 1.0, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 1.0 });
    await player.filters.setRotation({ rotationHz: 0.15 });
    await player.filters.commit();
    await player.setVolume(1000);
    return true;
  }

  if (name === '121') {
    await player.filters.reset();
    await player.filters.setEqualizer([
      { band: 0, gain: 1.0 }, { band: 1, gain: 1.0 }, { band: 2, gain: 1.0 },
      { band: 3, gain: 0.85 }, { band: 4, gain: 0.75 }, { band: 5, gain: 0.75 },
      { band: 6, gain: 0.7 }, { band: 7, gain: 0.65 }, { band: 8, gain: 0.6 },
      { band: 9, gain: 0.6 }, { band: 10, gain: 0.55 }, { band: 11, gain: 0.5 },
      { band: 12, gain: 0.5 }, { band: 13, gain: 0.5 }, { band: 14, gain: 0.5 },
    ]);
    await player.filters.setVolume(5.0);
    await player.filters.setChannelMix({ leftToLeft: 1.0, leftToRight: 1.0, rightToLeft: 1.0, rightToRight: 1.0 });
    await player.filters.setRotation({ rotationHz: 0.20 });
    await player.filters.commit();
    await player.setVolume(1000);
    return true;
  }

  if (name === 'dis') {
    await player.filters.reset();
    await player.filters.setEqualizer(Array.from({ length: 15 }, (_, i) => ({ band: i, gain: 1.0 })));
    await player.filters.setVolume(5.0);
    await player.filters.setDistortion({ sinOffset: 0.05, sinScale: 1.1, cosOffset: 0.05, cosScale: 1.1, tanOffset: 0.03, tanScale: 1.05, offset: 0.05, scale: 1.1 });
    await player.filters.setChannelMix({ leftToLeft: 1.0, leftToRight: 1.0, rightToLeft: 1.0, rightToRight: 1.0 });
    await player.filters.setRotation({ rotationHz: 0.5 });
    await player.filters.commit();
    await player.setVolume(1000);
    return true;
  }

  if (name === 'loud') {
    await player.filters.reset();
    await player.filters.setEqualizer([
      { band: 0, gain: 1.0 }, { band: 1, gain: 1.0 }, { band: 2, gain: 1.0 },
      { band: 3, gain: 1.0 }, { band: 4, gain: 0.9 }, { band: 5, gain: 0.85 },
      { band: 6, gain: 0.8 }, { band: 7, gain: 0.8 }, { band: 8, gain: 0.85 },
      { band: 9, gain: 0.9 }, { band: 10, gain: 0.95 }, { band: 11, gain: 1.0 },
      { band: 12, gain: 1.0 }, { band: 13, gain: 1.0 }, { band: 14, gain: 1.0 },
    ]);
    await player.filters.setVolume(5.0);
    await player.filters.setChannelMix({ leftToLeft: 1.0, leftToRight: 1.0, rightToLeft: 1.0, rightToRight: 1.0 });
    await player.filters.setRotation({ rotationHz: 0.15 });
    await player.filters.commit();
    await player.setVolume(1000);
    return true;
  }

  if (FILTERS[name]) {
    const cfg = FILTERS[name];
    if (cfg.timescale) {
      await player.filters.setTimescale(cfg.timescale);
      await player.filters.commit();
    }
    return true;
  }

  return false;
}

async function clearFilters(player) {
  await player.filters.reset();
  await player.filters.commit();
}

function listFilters() {
  return ['lofi', 'nightcore', 'slowmo', 'chipmunk', 'darthvader',
          'daycore', 'damon', '8d', 'tremolo', 'vibrate', 'bassboost',
          'earrape', '121', 'dis', 'loud'];
}

module.exports = { applyFilter, clearFilters, listFilters };
