import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = process.env.XT_DATA_DIR
  ? path.resolve(process.env.XT_DATA_DIR)
  : path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'server', 'public');
export const SNAPSHOT_DIR = process.env.XT_SNAPSHOT_DIR
  ? path.resolve(process.env.XT_SNAPSHOT_DIR)
  : path.join(ROOT, 'dist');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');

for (const dir of [DATA_DIR, PUBLIC_DIR, SNAPSHOT_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export function loadConfig() {
  const file = process.env.XT_CONFIG
    ? path.resolve(process.env.XT_CONFIG)
    : path.join(ROOT, 'config.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.name ||= '我的状态';
  raw.port = Number(raw.port) || 17890;
  raw.bind ||= '0.0.0.0';
  raw.timezone ||= 'Asia/Shanghai';
  raw.secondaryTimezone ||= 'Asia/Hong_Kong';
  raw.secondaryTimeLabel ||= '中国时间';
  raw.snapshot ||= { width: 440, scale: 2, chromePath: '' };
  raw.snapshot.width = Number(raw.snapshot.width) || 440;
  raw.snapshot.scale = Number(raw.snapshot.scale) || 2;
  raw.privacy ||= { showCity: true, showWindowTitle: true };
  raw.schedule ||= [];
  raw.localPc = raw.localPc !== false;
  return raw;
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function median(values) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

export function average(values) {
  const list = values.filter(Number.isFinite);
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

export function round(value, digits = 0) {
  if (!Number.isFinite(value)) return null;
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

export function ageMs(iso, now = Date.now()) {
  const ts = typeof iso === 'number' ? iso : Date.parse(iso ?? '');
  return Number.isFinite(ts) ? Math.max(0, now - ts) : Infinity;
}

export function isFresh(iso, maxAgeMs, now = Date.now()) {
  return ageMs(iso, now) <= maxAgeMs;
}

export function formatRelative(iso, now = Date.now()) {
  const age = ageMs(iso, now);
  if (!Number.isFinite(age)) return '未上报';
  if (age < 45_000) return '刚刚';
  const minutes = Math.floor(age / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

const partsFormatterCache = new Map();

function partsFormatter(timeZone) {
  if (!partsFormatterCache.has(timeZone)) {
    partsFormatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    }));
  }
  return partsFormatterCache.get(timeZone);
}

export function zonedParts(date, timeZone) {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'),
  };
}

export function formatTime(date, timeZone, withSeconds = false) {
  const p = zonedParts(date, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    + (withSeconds ? `:${String(p.second).padStart(2, '0')}` : '');
}

export function formatDate(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.month}月${p.day}日`;
}

export function formatFullDate(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const weekdays = { Mon: '周一', Tue: '周二', Wed: '周三', Thu: '周四', Fri: '周五', Sat: '周六', Sun: '周日' };
  return `${p.year}年${p.month}月${p.day}日 ${weekdays[p.weekday] ?? p.weekday}`;
}

export function weekdayIndex(date, timeZone) {
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[zonedParts(date, timeZone).weekday] ?? 1;
}

export function minutesOfDay(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

export function dayKey(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function parseClock(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function timezoneOffsetLabel(timeZone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(date);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function svgText(value) {
  return escapeHtml(value);
}
