// Nova Music Selfbot
// Credit: Darky

const chalk = require('chalk');

const ICONS = {
  INFO: 'i',
  SUCCESS: '+',
  WARNING: '!',
  ERROR: 'x',
  DEBUG: '*',
  MUSIC: '~',
};

function timestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return chalk.gray(`${h}:${m}:${s}.${ms}`);
}

function brand() {
  return `${chalk.white('[')}${chalk.greenBright.bold('NOVA')}${chalk.white(']')}`;
}

function formatLine(message, level = 'INFO', extras = {}) {
  const ts = timestamp();
  const br = brand();
  const icon = ICONS[level.toUpperCase()] || '.';

  const colorMap = {
    INFO: chalk.blueBright.bold,
    SUCCESS: chalk.greenBright.bold,
    WARNING: chalk.yellowBright.bold,
    ERROR: chalk.redBright.bold,
    DEBUG: chalk.magentaBright.bold,
    MUSIC: chalk.cyanBright.bold,
  };
  const color = colorMap[level.toUpperCase()] || chalk.white;

  const iconPart = color(icon);
  const msgPart = chalk.white(message);

  let extra = '';
  const keys = Object.keys(extras);
  if (keys.length > 0) {
    const items = keys.map(k => `${chalk.cyan(k)}=${chalk.whiteBright.bold(extras[k])}`);
    extra = ' ' + chalk.gray(`(${items.join(', ')})`);
  }

  return `${ts} ${br} ${iconPart} ${msgPart}${extra}`;
}

const logger = {
  info(message, extras = {}) { console.log(formatLine(message, 'INFO', extras)); },
  success(message, extras = {}) { console.log(formatLine(message, 'SUCCESS', extras)); },
  warning(message, extras = {}) { console.warn(formatLine(message, 'WARNING', extras)); },
  error(message, extras = {}) { console.error(formatLine(message, 'ERROR', extras)); },
  debug(message, extras = {}) { console.log(formatLine(message, 'DEBUG', extras)); },
  music(message, extras = {}) { console.log(formatLine(message, 'MUSIC', extras)); },
  separator() {
    console.log(chalk.blueBright.bold('-'.repeat(80)));
  },
};

module.exports = { logger };
