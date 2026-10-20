import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import {
  ROOT, SNAPSHOT_DIR, formatTime, loadConfig, readJson, writeJsonAtomic,
} from './lib/util.js';
import { StatusStore } from './lib/store.js';
import { collectPc } from './lib/pc.js';
import { refreshWeather, resolveLocationForIp } from './lib/weather.js';
import { inferActivity, scheduleState } from './lib/infer.js';
import { classifyForeground } from './lib/classify.js';
import { renderHtml, renderPng } from './lib/render.js';
import {
  wecomConfigured, verifyUrl, verifySignature, decryptMessage, parseEncryptedXml,
  sendText as sendWecomText, sendImage as sendWecomImage,
} from './lib/wecom.js';

const config = loadConfig();
const store = new StatusStore();
const startedAt = Date.now();
let weather = readJson(path.join(ROOT, 'data', 'weather-cache.json'), null);
let phoneLocation = readJson(path.join(ROOT, 'data', 'phone-geo-cache.json'), null);
let renderInFlight = null;
let lastSnapshot = null;

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return (forwarded || req.socket.remoteAddress || '').replace(/^::ffff:/i, '');
}

async function updatePhoneLocation(ip) {
  const location = await resolveLocationForIp(ip);
  if (!location) return null;
  phoneLocation = location;
  try {
    await writeJsonAtomic(path.join(ROOT, 'data', 'phone-geo-cache.json'), location);
  } catch {
    // cache is best-effort
  }
  const fresh = await refreshWeather(config, location);
  if (fresh) weather = fresh;
  return location;
}

function makeSnapshot({ pc, now = new Date() } = {}) {
  const devices = store.devices(config, now.getTime());
  const health = store.healthSummary(2, now.getTime());
  const schedule = scheduleState(config, now);
  const inference = inferActivity({
    pc, devices, health, weather, schedule, config, now,
  });
  return {
    config,
    now,
    nowIso: now.toISOString(),
    devices,
    health,
    schedule,
    weather,
    pc,
    inference,
    stepsToday: store.stepsToday(config, now.getTime()),
    generatedAt: new Date().toISOString(),
  };
}

function publicConfig() {
  const { token, ...safe } = config;
  return safe;
}

function isLocal(req) {
  const address = req.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function tokenFrom(req, url) {
  const header = req.headers['x-xt-token'];
  if (typeof header === 'string' && header) return header;
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return url.searchParams.get('token') ?? '';
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function authorized(req, url) {
  if (isLocal(req)) return true;
  return Boolean(config.token) && safeEqual(tokenFrom(req, url), config.token);
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

async function readBody(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('invalid JSON body');
  }
}

async function readRawBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleWecomText(config, fromUser, content) {
  const text = String(content || '').trim();
  if (!/查hanser|查一下hanser|hanser在干嘛/i.test(text)) {
    await sendWecomText(config, fromUser, '现在支持发送「查hanser」查看状态卡。');
    return;
  }
  const pc = await ensurePc({ force: true });
  const result = await generateSnapshot({ pc, now: new Date() });
  const summary = result.snapshot?.inference?.sentence || '状态已更新';
  await sendWecomText(config, fromUser, summary);
  await sendWecomImage(config, fromUser, result.imagePath);
}

function lanAddresses() {
  const result = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|Loopback|Radmin|Tailscale|ZeroTier|VPN/i.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) result.push({ name, address: entry.address });
    }
  }
  return result;
}

async function ensurePc({ force = false } = {}) {
  if (config.localPc === false) {
    const device = store.getDevice('pc');
    return device ? store.describeDevice(device, config) : null;
  }
  return collectPc({ force });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return sendJson(res, 200, {
        ok: true,
        name: config.name,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        devices: Object.keys(store.state.devices).length,
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === '/wecom/kf') {
      if (!wecomConfigured(config)) {
        return sendText(res, 404, 'wecom kf is not configured');
      }
      const timestamp = url.searchParams.get('timestamp') ?? '';
      const nonce = url.searchParams.get('nonce') ?? '';
      const msgSignature = url.searchParams.get('msg_signature') ?? '';
      if (req.method === 'GET') {
        try {
          const echo = verifyUrl({
            config,
            msgSignature,
            timestamp,
            nonce,
            echostr: url.searchParams.get('echostr') ?? '',
          });
          return sendText(res, 200, echo, 'text/plain; charset=utf-8');
        } catch (error) {
          return sendText(res, 403, `wecom verify failed: ${error.message}`);
        }
      }
      if (req.method === 'POST') {
        const raw = await readRawBody(req);
        const outer = parseEncryptedXml(raw);
        if (!verifySignature({
          token: config.wecomKf.token,
          timestamp,
          nonce,
          encrypt: outer.encrypt,
          msgSignature,
        })) {
          return sendText(res, 403, 'invalid signature');
        }
        let inner;
        try {
          inner = decryptMessage(config.wecomKf.encodingAESKey, outer.encrypt, config.wecomKf.corpId);
        } catch (error) {
          return sendText(res, 403, `decrypt failed: ${error.message}`);
        }
        const message = parseEncryptedXml(inner.message);
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('success');
        const allow = Array.isArray(config.wecomKf.allowUsers)
          ? config.wecomKf.allowUsers.map(String)
          : String(config.wecomKf.allowUsers || '').split(',').map((value) => value.trim()).filter(Boolean);
        if (allow.length && !allow.includes(message.fromUserName)) {
          console.warn('[wecom] ignored user', message.fromUserName);
          return;
        }
        if (message.msgType === 'text') {
          handleWecomText(config, message.fromUserName, message.content).catch((error) => {
            console.warn('[wecom] reply failed:', error.message);
          });
        }
        return;
      }
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/card')) {
      if (!authorized(req, url)) {
        return sendText(res, 401, '需要访问令牌。请使用带 ?token=... 的链接打开。', 'text/plain; charset=utf-8');
      }
      const pc = await ensurePc();
      const snapshot = makeSnapshot({ pc });
      const html = renderHtml(snapshot, { live: true });
      return sendText(res, 200, html, 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/status.png') {
      if (!authorized(req, url)) return sendText(res, 403, 'forbidden');
      const file = path.join(SNAPSHOT_DIR, 'status.png');
      if (!fs.existsSync(file)) {
        const pc = await ensurePc({ force: true });
        await generateSnapshot({ pc, now: new Date() });
      }
      const data = fs.readFileSync(file);
      res.writeHead(200, {
        'content-type': 'image/png',
        'content-length': data.length,
        'cache-control': 'no-store',
      });
      return res.end(data);
    }

    if (req.method === 'GET' && url.pathname === '/download/我的状态.apk') {
      if (!authorized(req, url)) return sendText(res, 403, 'forbidden');
      const file = path.join(ROOT, 'server', 'public', '我的状态.apk');
      if (!fs.existsSync(file)) return sendText(res, 404, 'apk not found');
      const stat = fs.statSync(file);
      res.writeHead(200, {
        'content-type': 'application/vnd.android.package-archive',
        'content-length': stat.size,
        'content-disposition': 'attachment; filename="我的状态.apk"',
        'cache-control': 'no-store',
      });
      return fs.createReadStream(file).pipe(res);
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      if (!authorized(req, url)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      const pc = await ensurePc();
      const snapshot = makeSnapshot({ pc });
      return sendJson(res, 200, {
        ok: true,
        config: publicConfig(),
        inference: snapshot.inference,
        devices: snapshot.devices,
        health: snapshot.health,
        weather: snapshot.weather,
        pc: snapshot.pc,
        schedule: snapshot.schedule,
        stepsToday: snapshot.stepsToday,
        generatedAt: snapshot.generatedAt,
        imageUrl: `/status.png?token=${encodeURIComponent(config.token)}`,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/report') {
      if (!authorized(req, url)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      const payload = await readBody(req);
      if (String(payload.kind ?? payload.type ?? '').toLowerCase() === 'pc') {
        const active = payload.active && typeof payload.active === 'object' ? payload.active : {};
        const classification = classifyForeground(active);
        payload.active = {
          ...active,
          category: classification.category,
          display: classification.label,
          label: classification.label,
        };
        payload.id ||= 'pc';
        payload.name ||= '电脑';
        payload.online = true;
      }
      const reportKind = String(payload.kind ?? payload.type ?? '').toLowerCase();
      if (reportKind === 'phone') {
        try {
          await updatePhoneLocation(clientIp(req));
        } catch (error) {
          console.warn('[my-status] phone location unavailable:', error.message);
        }
      }
      const device = await store.ingestReport(payload, config);
      const pc = await ensurePc();
      const snapshot = makeSnapshot({ pc });
      return sendJson(res, 200, {
        ok: true,
        device,
        inference: snapshot.inference,
        serverTime: new Date().toISOString(),
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/report/health') {
      if (!authorized(req, url)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      const payload = await readBody(req);
      const hr = payload.hr ?? payload.heartRate;
      const spo2 = payload.spo2;
      if (hr == null && spo2 == null && payload.battery == null) {
        return sendJson(res, 400, { ok: false, error: 'need hr, spo2 or battery' });
      }
      const device = await store.ingestReport({
        id: payload.deviceId ?? 'watch',
        kind: 'watch',
        name: payload.name ?? '手表',
        model: payload.model ?? 'OPPO Watch',
        connected: true,
        battery: payload.battery != null ? { percent: payload.battery, charging: false } : undefined,
        stepsToday: payload.stepsToday ?? payload.steps,
        health: {
          hr,
          spo2,
          source: payload.source ?? 'watch',
        },
        source: payload.source ?? 'watch',
      }, config);
      const pc = await ensurePc();
      const snapshot = makeSnapshot({ pc });
      return sendJson(res, 200, { ok: true, device, inference: snapshot.inference });
    }

    if (req.method === 'POST' && url.pathname === '/api/snapshot') {
      if (!authorized(req, url)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      let body = {};
      try { body = await readBody(req); } catch { body = {}; }
      if (renderInFlight) {
        const result = await renderInFlight;
        return sendJson(res, 200, { ok: true, ...publicResult(result), deduped: true });
      }
      const pc = await ensurePc({ force: body.refresh !== false });
      const snapshot = makeSnapshot({ pc });
      renderInFlight = generateSnapshot({
        pc,
        now: snapshot.now,
        height: Number(body.height) || Number(config.snapshot?.height) || 1360,
      }).finally(() => { renderInFlight = null; });
      const result = await renderInFlight;
      lastSnapshot = result.snapshot;
      return sendJson(res, 200, { ok: true, ...publicResult(result) });
    }

    if (req.method === 'POST' && url.pathname === '/api/demo') {
      if (!authorized(req, url)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      let demoBody = {};
      try { demoBody = await readBody(req); } catch { demoBody = {}; }
      await store.seedDemo(config);
      if (Array.isArray(demoBody.schedule)) config.schedule = demoBody.schedule;
      const pc = await ensurePc({ force: true });
      const snapshot = makeSnapshot({ pc });
      return sendJson(res, 200, {
        ok: true,
        inference: snapshot.inference,
        imageUrl: `/status.png?token=${encodeURIComponent(config.token)}`,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/clear') {
      if (!authorized(req, url)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
      let clearBody = {};
      try { clearBody = await readBody(req); } catch { clearBody = {}; }
      await store.clearDevices(clearBody.kind ? String(clearBody.kind) : null);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }

    return sendText(res, 404, 'not found');
  } catch (error) {
    console.error('[my-status]', error);
    return sendJson(res, 500, { ok: false, error: String(error.message) });
  }
});

function publicResult(result) {
  return {
    imagePath: result.imagePath,
    latestPath: result.latestPath,
    imageUrl: result.imageUrl,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    summary: result.snapshot?.inference?.sentence ?? '',
    inference: result.snapshot?.inference ?? null,
    generatedAt: result.snapshot?.generatedAt,
  };
}

async function generateSnapshot({ pc, now, height = 1360 }) {
  const snapshot = makeSnapshot({ pc, now });
  const rendered = await renderPng(snapshot, { config, height });
  return {
    imagePath: rendered.path,
    latestPath: rendered.latestPath,
    imageUrl: rendered.url,
    bytes: rendered.bytes,
    width: rendered.width,
    height: rendered.height,
    snapshot,
  };
}

async function bootstrap() {
  try {
    const fresh = await refreshWeather(config, phoneLocation);
    if (fresh) weather = fresh;
  } catch (error) {
    console.warn('[my-status] weather unavailable:', error.message);
  }
  if (config.localPc) {
    try {
      await collectPc({ force: true });
    } catch (error) {
      console.warn('[my-status] pc collector unavailable:', error.message);
    }
  }

  server.listen(config.port, config.bind, () => {
    const lan = lanAddresses();
    console.log(`[my-status] ${config.name}在干嘛`);
    console.log(`[my-status] local:  http://127.0.0.1:${config.port}/?token=${config.token}`);
    for (const entry of lan) {
      console.log(`[my-status] LAN:    http://${entry.address}:${config.port}/?token=${config.token}  (${entry.name})`);
    }
    console.log(`[my-status] device report endpoint: http://<this-pc>:${config.port}/api/report`);
    console.log(`[my-status] token: ${config.token}`);
  });

  if (config.localPc) {
    setInterval(() => {
      collectPc({ force: true }).catch(() => {});
    }, 30_000).unref();
  }

  setInterval(() => {
    refreshWeather(config, phoneLocation).then((fresh) => { if (fresh) weather = fresh; }).catch(() => {});
  }, 10 * 60_000).unref();
}

bootstrap();

function shutdown() {
  console.log('[my-status] shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
