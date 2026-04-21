// Nova Music Selfbot
// Credit: Darky

const chalk = require('chalk');

const ASCII_ART = `
  _   _                   
 | \\ | | _____   ____ _   
 |  \\| |/ _ \\ \\ / / _\` |  
 | |\\  | (_) \\ V / (_| |  
 |_| \\_|\\___/ \\_/ \\__,_|  
`;

function banner() {
  process.stdout.write('\x1Bc'); // clear terminal
  const lines = ASCII_ART.split('\n');
  for (const line of lines) {
    console.log(chalk.redBright.bold(line));
  }
  console.log(chalk.cyanBright('-'.repeat(60)));
  console.log(chalk.yellowBright('           Nova Music Selfbot — Credit: Darky'));
  console.log(chalk.cyanBright('-'.repeat(60)) + '\n');
}

function menuBox(title, items) {
  const boxWidth = Math.max(title.length + 6, ...items.map(i => i.length + 6), 40);
  const top = '-'.repeat(boxWidth - 2);
  console.log(chalk.redBright(`\n+${top}+`));
  console.log(chalk.redBright(`|${title.padStart((boxWidth - 2 + title.length) / 2).padEnd(boxWidth - 2)}|`));
  console.log(chalk.redBright(`+${top}+\n`));
  for (const item of items) {
    console.log(chalk.cyanBright(`  ${item}`));
  }
  console.log();
}

function formatTime(ms) {
  if (!ms || ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function createProgressBar(current, total, size = 30) {
  if (!total || total <= 0) return chalk.gray('-'.repeat(size));
  const progress = Math.round((current / total) * size);
  const filled = chalk.cyan('='.repeat(progress));
  const empty = chalk.gray('-'.repeat(size - progress));
  return `${filled}${chalk.white('o')}${empty}`;
}

function truncateToken(token) {
  return token.length >= 5 ? token.slice(-5) : token;
}

module.exports = { banner, menuBox, formatTime, createProgressBar, truncateToken };
