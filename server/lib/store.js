import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_DIR, dayKey, isFresh, median, readJson, round, writeJsonAtomic,
} from './util.js';

const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_HEALTH_SAMPLES = 6000;
const HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;

function emptyState() {
  return {
    version: 1,
    devices: {},
    health: [],
    weather: null,
    updatedAt: null,
  };
}

function normalizeId(value, kind) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text) return text.replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'device';
  if (kind) return kind;
  return 'device';
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function booleanOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function normalizeBattery(value) {
  if (value == null) return null;
  if (typeof value === 'number') return { percent: Math.round(value), charging: null };
  const percent = numberOrNull(value.percent ?? value.level);
  return {
    percent: percent == null ? null : Math.round(percent),
    charging: booleanOrNull(value.charging ?? value.isCharging),
    temperatureC: numberOrNull(value.temperatureC),
    present: booleanOrNull(value.present),
  };
}

function normalizeHealth(input = {}) {
  let hr = numberOrNull(input.hr ?? input.heartRate ?? input.bpm);
  let spo2 = numberOrNull(input.spo2 ?? input.oxygenSaturation ?? input.bloodOxygen);
  if (hr != null && (hr < 20 || hr > 240)) hr = null;
  if (spo2 != null && (spo2 < 50 || spo2 > 100)) spo2 = null;
  if (hr == null && spo2 == null) return null;
  return {
    hr: hr == null ? null : Math.round(hr),
    spo2: spo2 == null ? null : Math.round(spo2 * 10) / 10,
    source: input.source ? String(input.source).slice(0, 80) : undefined,
  };
}

export class StatusStore {
  constructor() {
    this.state = emptyState();
    this.load();
  }

  load() {
    const saved = readJson(STATE_FILE, null);
    if (!saved || typeof saved !== 'object') return;
    const devices = saved.devices && typeof saved.devices === 'object' ? saved.devices : {};
    for (const device of Object.values(devices)) {
      if (!device || typeof device !== 'object') continue;
      const health = normalizeHealth(device.health ?? {});
      if (health) device.health = { ...device.health, ...health };
      else delete device.health;
    }
    this.state = {
      ...emptyState(),
      ...saved,
      devices,
      health: Array.isArray(saved.health)
        ? saved.health.filter((sample) => {
          const hrOk = sample.hr == null || (sample.hr >= 20 && sample.hr <= 240);
          const spo2Ok = sample.spo2 == null || (sample.spo2 >= 50 && sample.spo2 <= 100);
          return hrOk && spo2Ok;
        })
        : [],
    };
  }

  async save() {
    this.state.updatedAt = new Date().toISOString();
    await writeJsonAtomic(STATE_FILE, this.state);
  }

  getDevice(id) {
    return this.state.devices[id] ?? null;
  }

  async ingestReport(payload, config) {
    const now = Date.now();
    const kind = String(payload.kind ?? payload.type ?? 'device').toLowerCase();
    const id = normalizeId(payload.id ?? payload.deviceId, kind);
    const previous = this.state.devices[id] ?? {};
    const battery = normalizeBattery(payload.battery);
    const health = normalizeHealth(payload.health);
    const nowIso = new Date(now).toISOString();

    const device = {
      ...previous,
      id,
      kind,
      name: String(payload.name ?? previous.name ?? kindLabel(kind)).slice(0, 60),
      model: String(payload.model ?? previous.model ?? '').slice(0, 80),
      os: String(payload.os ?? payload.androidVersion ?? previous.os ?? '').slice(0, 80),
      battery: battery ?? previous.battery ?? null,
      screenOn: booleanOrNull(payload.screenOn) ?? previous.screenOn ?? null,
      unlocked: booleanOrNull(payload.unlocked) ?? previous.unlocked ?? null,
      charging: battery?.charging ?? previous.charging ?? null,
      foreground: normalizeForeground(payload.foreground ?? payload.app) ?? previous.foreground ?? null,
      network: normalizeNetwork(payload.network) ?? previous.network ?? null,
      stepsToday: numberOrNull(payload.stepsToday ?? payload.steps) ?? previous.stepsToday ?? null,
      stepsDate: String(payload.stepsDate ?? previous.stepsDate ?? dayKey(new Date(now), config.timezone)),
      storageFreePercent: numberOrNull(payload.storageFreePercent) ?? previous.storageFreePercent ?? null,
      hostname: payload.hostname ? String(payload.hostname).slice(0, 100) : previous.hostname ?? null,
      active: payload.active && typeof payload.active === 'object'
        ? payload.active
        : previous.active ?? null,
      idleSec: numberOrNull(payload.idleSec) ?? previous.idleSec ?? null,
      locked: booleanOrNull(payload.locked) ?? previous.locked ?? null,
      cpu: numberOrNull(payload.cpu) ?? previous.cpu ?? null,
      memory: payload.memory && typeof payload.memory === 'object' ? payload.memory : previous.memory ?? null,
      uptimeSec: numberOrNull(payload.uptimeSec) ?? previous.uptimeSec ?? null,
      health: health ? { ...health, updatedAt: nowIso } : previous.health ?? null,
      connected: booleanOrNull(payload.connected) ?? previous.connected ?? null,
      source: String(payload.source ?? previous.source ?? 'device').slice(0, 60),
      reportedAt: payload.updatedAt ? String(payload.updatedAt).slice(0, 40) : previous.reportedAt ?? null,
      updatedAt: nowIso,
      receivedAt: now,
    };

    this.state.devices[id] = device;
    if (health) this.appendHealth({ ...health, ts: now }, id);
    if (kind === 'watch' && health) {
      this.state.devices[id].kind = 'watch';
    }

    const watchInput = payload.watch && typeof payload.watch === 'object' ? payload.watch : null;
    const watchBattery = watchInput ? normalizeBattery(watchInput.battery) : null;
    const watchHealth = watchInput ? normalizeHealth(watchInput.health) : null;
    const watchHasData = Boolean(watchInput)
      && (watchHealth != null || (watchBattery?.percent ?? 0) > 0 || watchInput.connected === true);
    if (watchInput && watchHasData) {
      const watchId = normalizeId(watchInput.id ?? 'watch', 'watch');
      const previousWatch = this.state.devices[watchId] ?? {};
      const previousHealth = normalizeHealth(previousWatch.health ?? {});
      this.state.devices[watchId] = {
        ...previousWatch,
        id: watchId,
        kind: 'watch',
        name: String(watchInput.name ?? previousWatch.name ?? '手表').slice(0, 60),
        model: String(watchInput.model ?? previousWatch.model ?? 'OPPO Watch').slice(0, 80),
        os: String(watchInput.os ?? previousWatch.os ?? 'ColorOS Watch').slice(0, 80),
        battery: watchBattery ?? previousWatch.battery ?? null,
        connected: booleanOrNull(watchInput.connected) ?? previousWatch.connected ?? null,
        stepsToday: numberOrNull(watchInput.stepsToday ?? watchInput.steps) ?? previousWatch.stepsToday ?? null,
        stepsDate: String(watchInput.stepsDate ?? previousWatch.stepsDate ?? dayKey(new Date(now), config.timezone)),
        health: watchHealth
          ? { ...watchHealth, updatedAt: nowIso }
          : previousHealth
            ? { ...previousHealth, updatedAt: previousWatch.health?.updatedAt ?? nowIso }
            : null,
        source: String(watchInput.source ?? 'OPPO Watch via phone').slice(0, 60),
        updatedAt: nowIso,
        receivedAt: now,
      };
      if (watchHealth) this.appendHealth({ ...watchHealth, ts: now }, watchId);
    }

    await this.save();
    return this.describeDevice(device, config, now);
  }

  appendHealth(sample, deviceId = 'watch') {
    let hr = numberOrNull(sample.hr);
    let spo2 = numberOrNull(sample.spo2);
    if (hr != null && (hr < 20 || hr > 240)) hr = null;
    if (spo2 != null && (spo2 < 50 || spo2 > 100)) spo2 = null;
    if (hr == null && spo2 == null) return;
    const ts = Number.isFinite(Number(sample.ts)) ? Number(sample.ts) : Date.now();
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 12 * 60 * 60 * 1000) return;
    const last = this.state.health[this.state.health.length - 1];
    if (last && Math.abs(last.ts - ts) < 20_000 && last.source === (sample.source ?? deviceId)) return;
    this.state.health.push({
      ts,
      hr: hr == null ? null : Math.round(hr),
      spo2: spo2 == null ? null : Math.round(spo2 * 10) / 10,
      source: String(sample.source ?? deviceId).slice(0, 80),
    });
    const cutoff = Date.now() - HEALTH_WINDOW_MS;
    this.state.health = this.state.health.filter((entry) => entry.ts >= cutoff).slice(-MAX_HEALTH_SAMPLES);
  }

  describeDevice(device, config, now = Date.now()) {
    const maxAge = device.kind === 'watch' ? 10 * 60_000
      : device.kind === 'tablet' ? 10 * 60_000
        : 5 * 60_000;
    return {
      ...device,
      online: isFresh(device.updatedAt, maxAge, now),
      ageSeconds: Math.max(0, Math.round((now - Date.parse(device.updatedAt)) / 1000)),
    };
  }

  devices(config, now = Date.now()) {
    return Object.values(this.state.devices)
      .map((device) => this.describeDevice(device, config, now))
      .sort((a, b) => deviceRank(a.kind) - deviceRank(b.kind));
  }

  getHealth(hours = 2, now = Date.now()) {
    const cutoff = now - hours * 60 * 60_000;
    return this.state.health.filter((sample) => sample.ts >= cutoff);
  }

  healthSummary(hours = 2, now = Date.now()) {
    const samples = this.getHealth(hours, now);
    const hr = samples.map((s) => s.hr).filter((value) => Number.isFinite(value) && value >= 20 && value <= 240);
    const spo2 = samples.map((s) => s.spo2).filter((value) => Number.isFinite(value) && value >= 50 && value <= 100);
    return {
      samples,
      hr: {
        count: hr.length,
        latest: hr.at(-1) ?? null,
        average: hr.length ? round(hr.reduce((a, b) => a + b, 0) / hr.length, 0) : null,
        min: hr.length ? Math.min(...hr) : null,
        max: hr.length ? Math.max(...hr) : null,
        resting: median(hr),
      },
      spo2: {
        count: spo2.length,
        latest: spo2.at(-1) ?? null,
        average: spo2.length ? round(spo2.reduce((a, b) => a + b, 0) / spo2.length, 1) : null,
        min: spo2.length ? Math.min(...spo2) : null,
        max: spo2.length ? Math.max(...spo2) : null,
      },
    };
  }

  stepsToday(config, now = Date.now()) {
    const today = dayKey(new Date(now), config.timezone);
    const values = Object.values(this.state.devices)
      .filter((device) => device.stepsToday != null && (!device.stepsDate || device.stepsDate === today))
      .map((device) => Number(device.stepsToday))
      .filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  }

  watch(config, now = Date.now()) {
    const devices = this.devices(config, now);
    return devices.find((device) => device.kind === 'watch') ?? null;
  }

  async setWeather(weather) {
    this.state.weather = weather;
    await this.save();
  }

  async seedDemo(config) {
    const now = Date.now();
    const iso = new Date(now).toISOString();
    const samples = [];
    const values = [
      [62, 99], [69, 99], [71, 99], [68, 99], [72, 99], [70, 99], [66, 99], [63, 99],
    ];
    for (let i = 0; i < values.length; i += 1) {
      samples.push({
        ts: now - (values.length - 1 - i) * 7 * 60_000,
        hr: values[i][0],
        spo2: values[i][1],
        source: 'OPPO Watch (演示)',
      });
    }
    this.state.health = samples;
    this.state.devices = {
      phone: {
        id: 'phone', kind: 'phone', name: '手机', model: 'OPPO Find X8', os: 'Android 15',
        battery: { percent: 92, charging: false }, screenOn: false, unlocked: false,
        foreground: { app: '网易云音乐', package: 'com.netease.cloudmusic', title: '正在播放 · 夜航星' },
        network: { type: 'wifi', ssid: 'Home' }, stepsToday: 3240, stepsDate: dayKey(new Date(now), config.timezone),
        storageFreePercent: 34, source: 'Android (演示)', updatedAt: iso, receivedAt: now,
      },
      tablet: {
        id: 'tablet', kind: 'tablet', name: '平板', model: 'OPPO Pad 3', os: 'Android 15',
        battery: { percent: 68, charging: false }, screenOn: true, unlocked: true,
        foreground: { app: '哔哩哔哩', package: 'tv.danmaku.bili', title: '视频播放' },
        network: { type: 'wifi', ssid: 'Home' }, stepsToday: 0, stepsDate: dayKey(new Date(now), config.timezone),
        storageFreePercent: 51, source: 'Android (演示)', updatedAt: iso, receivedAt: now,
      },
      watch: {
        id: 'watch', kind: 'watch', name: '手表', model: 'OPPO Watch X2', os: 'ColorOS Watch',
        battery: { percent: 76, charging: false }, connected: true,
        health: { hr: 63, spo2: 99, source: 'OPPO Watch (演示)', updatedAt: iso },
        stepsToday: 3240, stepsDate: dayKey(new Date(now), config.timezone),
        source: 'OPPO Watch (演示)', updatedAt: iso, receivedAt: now,
      },
    };
    await this.save();
  }

  async clearDevices(kind = null) {
    if (kind) {
      for (const [id, device] of Object.entries(this.state.devices)) {
        if (device.kind === kind) delete this.state.devices[id];
      }
    } else {
      this.state.devices = {};
      this.state.health = [];
    }
    await this.save();
  }

  resetAll() {
    this.state = emptyState();
    if (fs.existsSync(STATE_FILE)) fs.rmSync(STATE_FILE, { force: true });
  }
}

function normalizeForeground(value) {
  if (!value) return null;
  if (typeof value === 'string') return { app: value.slice(0, 100) };
  const app = String(value.app ?? value.label ?? value.package ?? '').slice(0, 100);
  const packageName = String(value.package ?? value.packageName ?? '').slice(0, 160);
  if (!app && !packageName) return null;
  return {
    app: app || packageName,
    package: packageName || undefined,
    title: value.title ? String(value.title).slice(0, 180) : undefined,
  };
}

function normalizeNetwork(value) {
  if (!value) return null;
  if (typeof value === 'string') return { type: value };
  const type = String(value.type ?? value.transport ?? '').slice(0, 30);
  const ssid = value.ssid ? String(value.ssid).slice(0, 60) : undefined;
  const ip = value.ip ? String(value.ip).slice(0, 60) : undefined;
  const adapter = value.adapter ? String(value.adapter).slice(0, 80) : undefined;
  const connected = booleanOrNull(value.connected);
  if (!type && !ssid && !ip && !adapter) return null;
  return { type: type || undefined, ssid, ip, adapter, connected };
}

function deviceRank(kind) {
  return { phone: 0, tablet: 1, pc: 2, watch: 3 }[kind] ?? 9;
}

function kindLabel(kind) {
  return { phone: '手机', tablet: '平板', watch: '手表', pc: '电脑' }[kind] ?? '设备';
}
