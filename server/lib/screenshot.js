import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(file, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await delay(100);
  }
  throw new Error(`等待 Chrome 调试端口超时：${file}`);
}

class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
        else pending.resolve(message.result);
        return;
      }
      const handlers = this.listeners.get(message.method);
      if (handlers) {
        for (const handler of [...handlers]) handler(message.params);
      }
    });
  }

  static async connect(url, timeoutMs = 10_000) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket 连接超时')), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', (event) => { clearTimeout(timer); reject(new Error(`WebSocket 连接失败: ${event.message ?? 'unknown'}`)); }, { once: true });
    });
    return new CdpSession(ws);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  waitEvent(method, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const handler = (params) => {
        clearTimeout(timer);
        this.listeners.get(method)?.delete(handler);
        resolve(params);
      };
      const timer = setTimeout(() => {
        this.listeners.get(method)?.delete(handler);
        reject(new Error(`等待页面事件 ${method} 超时`));
      }, timeoutMs);
      if (!this.listeners.has(method)) this.listeners.set(method, new Set());
      this.listeners.get(method).add(handler);
    });
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

export async function screenshotWithCdp({
  chrome,
  htmlPath,
  outPath,
  profileDir,
  width = 440,
  scale = 2,
}) {
  await fsp.mkdir(profileDir, { recursive: true });
  const child = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], {
    stdio: 'ignore',
    windowsHide: true,
  });

  let session;
  try {
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    await waitForFile(portFile, 12_000);
    const [port] = (await fsp.readFile(portFile, 'utf8')).trim().split(/\r?\n/);
    if (!port) throw new Error('Chrome 未写入调试端口');

    let targets = null;
    for (let i = 0; i < 40; i += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
        targets = await response.json();
        if (Array.isArray(targets) && targets.length) break;
      } catch {
        // retry
      }
      await delay(150);
    }
    const page = targets?.find((target) => target.type === 'page');
    if (!page?.webSocketDebuggerUrl) throw new Error('找不到 Chrome 页面目标');

    session = await CdpSession.connect(page.webSocketDebuggerUrl);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: scale,
      mobile: false,
      screenWidth: width,
      screenHeight: 900,
    });

    const loaded = session.waitEvent('Page.loadEventFired', 20_000);
    await session.send('Page.navigate', { url: `file:///${htmlPath.replaceAll('\\', '/').replace(/^\/+/, '')}` });
    await loaded;
    await delay(350);

    const measured = await session.send('Runtime.evaluate', {
      expression: 'Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 900))',
      returnByValue: true,
    });
    const height = Math.max(900, Math.min(4000, Number(measured?.result?.value) || 1360));

    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    });
    await delay(220);

    const shot = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
    });
    if (!shot?.data) throw new Error('Chrome 没有返回截图数据');
    await fsp.writeFile(outPath, Buffer.from(shot.data, 'base64'));
    return { height };
  } finally {
    if (session) {
      try { await session.send('Browser.close'); } catch { /* ignore */ }
      session.close();
    }
    try { child.kill(); } catch { /* ignore */ }
    if (process.platform === 'win32' && child.pid) {
      try {
        const { execFile } = await import('node:child_process');
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      } catch { /* ignore */ }
    }
  }
}
