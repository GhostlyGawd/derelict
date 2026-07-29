import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ASSETS = path.join(ROOT, 'public', 'assets');
export const CACHE = path.join(ROOT, 'pipeline', '.cache');

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function write(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, data);
  return file;
}

export async function writeJson(file, value) {
  return write(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function exists(file) {
  try {
    await fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

export async function size(file) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

export function sha1(input) {
  return createHash('sha1').update(input).digest('hex').slice(0, 12);
}

export function rel(file) {
  return path.relative(ROOT, file);
}

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
