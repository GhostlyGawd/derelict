const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const colour = process.stdout.isTTY ? (c, s) => `${c}${s}${RESET}` : (_c, s) => s;

export const log = {
  stage(name) {
    process.stdout.write(`\n${colour(BOLD, `── ${name} `.padEnd(72, '─'))}\n`);
  },
  step(message) {
    process.stdout.write(`  ${message}\n`);
  },
  done(message) {
    process.stdout.write(`  ${colour(GREEN, '✓')} ${message}\n`);
  },
  warn(message) {
    process.stdout.write(`  ${colour(YELLOW, '!')} ${message}\n`);
  },
  fail(message) {
    process.stdout.write(`  ${colour(RED, '✗')} ${message}\n`);
  },
  note(message) {
    process.stdout.write(`    ${colour(DIM, message)}\n`);
  },
};
