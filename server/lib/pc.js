import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.js';
import { classifyForeground, friendlyProcess } from './classify.js';

const execFileAsync = promisify(execFile);
const SCRIPT = path.join(ROOT, 'scripts', 'collect-pc.ps1');

function resolvePwsh() {
  const candidates = [];
  if (process.env.PWSH) candidates.push(process.env.PWSH);
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!entry) continue;
    candidates.push(path.join(entry, 'pwsh.exe'));
  }
  candidates.push(
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe',
    'C:\\Users\\20446\\.dsh\\profiles\\desktop\\node_modules\\@dsh-ops\\pwsh-win32-x64\\bin\\pwsh.exe',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  );
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  }) ?? 'pwsh';
}

const PWSH = resolvePwsh();

let inflight = null;
let lastGood = null;

export async function collectPc({ force = false } = {}) {
  if (!force && lastGood && Date.now() - Date.parse(lastGood.collectedAt) < 12_000) {
    return lastGood;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { stdout } = await execFileAsync(PWSH, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT,
      ], {
        timeout: 25_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      });
      const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
      const parsed = JSON.parse(line);
      const active = parsed.active ?? {};
      const classification = classifyForeground({
        process: active.process,
        app: active.app,
        title: active.title,
      });
      const pc = {
        ...parsed,
        active: {
          ...active,
          label: friendlyProcess(active.process) || active.app || active.process,
          category: classification.category,
          display: classification.label,
        },
        online: true,
        collectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        idleSec: Number(parsed.idleSec) || 0,
      };
      lastGood = pc;
      return pc;
    } catch (error) {
      if (lastGood) return { ...lastGood, online: false, stale: true, error: String(error.message) };
      return {
        ok: false,
        online: false,
        error: String(error.message),
        collectedAt: new Date().toISOString(),
        active: { process: '', title: '', label: '状态采集失败', category: 'other' },
        battery: null,
        idleSec: 0,
      };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function pcCached() {
  return lastGood;
}
