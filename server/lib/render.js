import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  ROOT, TMP_DIR, SNAPSHOT_DIR, escapeHtml, formatRelative,
  formatTime, formatFullDate, round, timezoneOffsetLabel,
} from './util.js';
import { scheduleState } from './infer.js';
import { screenshotWithCdp } from './screenshot.js';

const execFileAsync = promisify(execFile);
const CSS = fs.readFileSync(path.join(ROOT, 'server', 'templates', 'card.css'), 'utf8');

const ICONS = {
  sparkle: '<path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z"/>',
  pin: '<path d="M12 21s7-6.1 7-11a7 7 0 10-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><path d="M10 18.5h4"/>',
  tablet: '<rect x="4.5" y="2.5" width="15" height="19" rx="2.2"/><path d="M11.5 18.5h1"/>',
  laptop: '<rect x="4" y="4.5" width="16" height="11.5" rx="1.6"/><path d="M2.5 18.5h19l-1.2 2H3.7l-1.2-2z"/>',
  watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l.6-3.2h4.8L15 6M9 18l.6 3.2h4.8L15 18"/>',
  heart: '<path d="M20.4 4.6a5.5 5.5 0 00-7.8 0L12 5.2l-.6-.6a5.5 5.5 0 00-7.8 7.8L12 21l8.4-8.6a5.5 5.5 0 000-7.8z"/>',
  drop: '<path d="M12 2.5c3.6 4.4 6.5 7.9 6.5 11.5a6.5 6.5 0 11-13 0C5.5 10.4 8.4 6.9 12 2.5z"/>',
  footsteps: '<path d="M8.5 3.5c1.7 0 2.7 1.7 2.7 3.9 0 1.8-.9 3.2-2.3 3.2S6 9.2 6 7.4c0-2.2.8-3.9 2.5-3.9zM15.8 12c1.7 0 2.7 1.6 2.7 3.9 0 1.8-.9 3.2-2.3 3.2s-2.9-1.4-2.9-3.2c0-2.3.8-3.9 2.5-3.9z"/><path d="M6.2 12.6c.8.5 1.2 1.3 1.2 2.2M13.2 5.2c.7.4 1.1 1 1.1 1.8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.2"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.5 2"/>',
  battery: '<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M21.5 10v4"/><path d="M5.5 10h5v4h-5z" fill="currentColor" stroke="none"/>',
  wifi: '<path d="M2.5 8.5a14 14 0 0119 0M5.5 11.5a9.5 9.5 0 0113 0M8.5 14.5a5 5 0 017 0"/><circle cx="12" cy="18" r="1" fill="currentColor" stroke="none"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  code: '<path d="M8.5 7l-5 5 5 5M15.5 7l5 5-5 5M13.5 4l-3 16"/>',
  gamepad: '<rect x="3" y="8" width="18" height="9" rx="4.5"/><path d="M8 11v3M6.5 12.5h3M15.5 12.5h1M18 11.5h.01"/>',
  video: '<rect x="3" y="5.5" width="18" height="13" rx="2.4"/><path d="M10 9l5 3-5 3V9z"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  book: '<path d="M4 4.5h6a2.5 2.5 0 012.5 2.5v13A2.5 2.5 0 0010 17.5H4v-13zM20 4.5h-6A2.5 2.5 0 0011.5 7v13a2.5 2.5 0 012.5-2.5h6v-13z"/>',
  coffee: '<path d="M4 8h13v5a5 5 0 01-5 5H9a5 5 0 01-5-5V8zM17 9h2.5a2.5 2.5 0 010 5H17M6 3v2M10 3v2M14 3v2"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 019.5 3.5a8.5 8.5 0 1011 11z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  'cloud-sun': '<path d="M15 4.5a4 4 0 00-3.8 2.8A4.5 4.5 0 1013 16h4a4 4 0 000-8 4 4 0 00-2-3.5z"/>',
  cloud: '<path d="M6.5 18a4.5 4.5 0 01-.4-9A6 6 0 0117.8 11a3.5 3.5 0 01-.3 7H6.5z"/>',
  rain: '<path d="M6.5 15a4.5 4.5 0 01-.4-9A6 6 0 0117.8 8a3.5 3.5 0 01-.3 7H6.5zM8 18l-1 2M12 18l-1 2M16 18l-1 2"/>',
  storm: '<path d="M6.5 14a4.5 4.5 0 01-.4-9A6 6 0 0117.8 7a3.5 3.5 0 01-.3 7H6.5z"/><path d="M13 12l-3 5h3l-1 4 4-6h-3l2-3"/>',
  snow: '<path d="M6.5 14a4.5 4.5 0 01-.4-9A6 6 0 0117.8 7a3.5 3.5 0 01-.3 7H6.5z"/><path d="M8 18h.01M12 19h.01M16 18h.01M10 21h.01M14 21h.01"/>',
  fog: '<path d="M5 9h14M4 13h16M6 17h12"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  refresh: '<path d="M20 12a8 8 0 10-2.3 5.7M20 5v5h-5"/>',
};

function icon(name, size = 14, stroke = 1.6) {
  const body = ICONS[name] ?? ICONS.sparkle;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function pct(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : '—';
}

function fmtNumber(value) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat('zh-CN').format(Number(value)) : '—';
}

function truncate(text, length = 34) {
  const chars = Array.from(String(text ?? ''));
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : chars.join('');
}

function deviceDot(device) {
  if (!device?.online) return 'dot-state';
  if (device.battery?.charging) return 'dot-state charging';
  return 'dot-state on';
}

function batteryBar(device) {
  const percent = Number(device?.battery?.percent);
  if (!Number.isFinite(percent)) return '';
  return `<span class="battery-bar"><i style="width:${Math.max(3, Math.min(100, percent))}%"></i></span>`;
}

function deviceCard(kind, device, health = null) {
  const configMeta = {
    phone: { title: '手机', icon: 'phone' },
    tablet: { title: '平板', icon: 'tablet' },
    pc: { title: '电脑', icon: 'laptop' },
    watch: { title: '手表', icon: 'watch' },
  }[kind];
  const name = device?.name || configMeta.title;
  const offlineClass = device?.online === false ? ' offline' : '';

  let value = '未连接';
  let unit = '';
  let sub = '安装设备端后自动上报';
  let meta = '';
  let footLeft = '等待首次上报';

  if (device) {
    if (kind === 'watch') {
      const hr = device.health?.hr ?? health?.hr?.latest;
      const spo2 = device.health?.spo2 ?? health?.spo2?.latest;
      value = Number.isFinite(Number(hr)) ? String(Math.round(hr)) : '—';
      unit = Number.isFinite(Number(hr)) ? 'BPM' : '';
      sub = Number.isFinite(Number(spo2))
        ? `血氧 ${Math.round(spo2)}% · 电量 ${pct(device.battery?.percent)}`
        : `电量 ${pct(device.battery?.percent)}`;
      meta = [device.model, device.connected === false ? '未连接手机' : '已连接'].filter(Boolean).join(' · ');
      footLeft = device.online ? '手表数据已同步' : '最近一次手表数据';
    } else if (kind === 'pc') {
      if (device.online === false || device.ok === false) {
        value = '离线';
        unit = '';
        sub = device.error ? '无法读取电脑状态' : '电脑未开机或采集器未运行';
        meta = device.hostname || '';
        footLeft = '等待恢复';
      } else {
        value = '在线';
        unit = '';
        sub = device.active?.display || device.active?.label || '桌面空闲';
        meta = [device.os, device.battery?.present ? `${pct(device.battery.percent)} · ${device.battery.charging ? '充电中' : '电池'}`
          : '台式机 · 插电', device.network?.adapter].filter(Boolean).join(' · ');
        footLeft = Number(device.idleSec) < 120 ? '键鼠活跃' : `闲置 ${Math.floor(Number(device.idleSec) / 60)} 分钟`;
      }
    } else {
      value = pct(device.battery?.percent);
      unit = '';
      sub = device.screenOn
        ? (device.foreground?.app || device.foreground?.package || '屏幕亮起')
        : (device.online ? '屏幕已熄灭' : '设备离线');
      meta = [device.model, device.os].filter(Boolean).join(' · ');
      footLeft = device.battery?.charging ? '正在充电' : '电池供电';
    }
  }

  return `<div class="device${offlineClass}">
    <div class="device-head">
      <span class="device-ico">${icon(configMeta.icon, 13)}</span>
      <span class="device-name">${escapeHtml(name)}</span>
      <span class="${deviceDot(device)}"></span>
    </div>
    <div class="device-value">
      <span class="num">${escapeHtml(value)}</span>
      ${unit ? `<span class="unit">${escapeHtml(unit)}</span>` : ''}
    </div>
    <div class="device-sub">${escapeHtml(truncate(sub, 30))}</div>
    <div class="device-meta">${escapeHtml(truncate(meta, 34))}</div>
    <div class="device-foot">
      <span>${escapeHtml(footLeft)}</span>
      <span>${device?.updatedAt ? `${batteryBar(device)} ${formatRelative(device.updatedAt)}` : '—'}</span>
    </div>
  </div>`;
}

function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function chart(health, config) {
  const width = 396;
  const height = 158;
  const left = 25;
  const right = 30;
  const top = 11;
  const bottom = 20;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const samples = health.samples ?? [];
  const hrSamples = samples.filter((sample) => Number.isFinite(sample.hr));
  const spo2Samples = samples.filter((sample) => Number.isFinite(sample.spo2));

  let minTs = samples[0]?.ts ?? Date.now() - 60 * 60_000;
  let maxTs = samples.at(-1)?.ts ?? Date.now();
  if (maxTs - minTs < 10 * 60_000) minTs = maxTs - 60 * 60_000;

  const hrValues = hrSamples.map((sample) => sample.hr);
  let hrMin = hrValues.length ? Math.floor((Math.min(...hrValues) - 6) / 5) * 5 : 55;
  let hrMax = hrValues.length ? Math.ceil((Math.max(...hrValues) + 6) / 5) * 5 : 100;
  if (hrMax - hrMin < 20) { hrMin -= 10; hrMax += 10; }
  hrMin = Math.max(30, hrMin);
  hrMax = Math.min(190, hrMax);

  const spo2Min = 93;
  const spo2Max = 100;

  const xFor = (ts) => left + ((ts - minTs) / (maxTs - minTs || 1)) * innerW;
  const yHr = (value) => top + (1 - (value - hrMin) / (hrMax - hrMin)) * innerH;
  const ySpo2 = (value) => top + (1 - (value - spo2Min) / (spo2Max - spo2Min)) * innerH;

  const gridCount = 4;
  const grid = Array.from({ length: gridCount + 1 }, (_, i) => {
    const y = top + (innerH / gridCount) * i;
    const hrValue = Math.round(hrMax - ((hrMax - hrMin) / gridCount) * i);
    const spo2Value = round(spo2Max - ((spo2Max - spo2Min) / gridCount) * i, 0);
    return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.055)" stroke-width="1"/>
      <text x="${left - 6}" y="${(y + 2).toFixed(1)}" text-anchor="end" font-size="6.2" fill="#766a8e">${hrValue}</text>
      <text x="${width - right + 6}" y="${(y + 2).toFixed(1)}" text-anchor="start" font-size="6.2" fill="#5f7c8e">${spo2Value}</text>`;
  }).join('');

  const xTicks = 3;
  const xLabels = Array.from({ length: xTicks }, (_, i) => {
    const ts = minTs + ((maxTs - minTs) / (xTicks - 1)) * i;
    const x = left + (innerW / (xTicks - 1)) * i;
    return `<text x="${x.toFixed(1)}" y="${height - 5}" text-anchor="${i === 0 ? 'start' : i === xTicks - 1 ? 'end' : 'middle'}" font-size="6.2" fill="#6f6388">${formatTime(new Date(ts), config.timezone)}</text>`;
  }).join('');

  const hrPoints = hrSamples.map((sample) => ({ x: xFor(sample.ts), y: yHr(sample.hr), value: sample.hr }));
  const spo2Points = spo2Samples.map((sample) => ({ x: xFor(sample.ts), y: ySpo2(sample.spo2), value: sample.spo2 }));

  let hrLine = '';
  let hrArea = '';
  if (hrPoints.length > 1) {
    const d = smoothPath(hrPoints);
    hrLine = `<path d="${d}" fill="none" stroke="url(#hrLine)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`;
    hrArea = `<path d="${d} L ${hrPoints.at(-1).x.toFixed(2)} ${(top + innerH).toFixed(2)} L ${hrPoints[0].x.toFixed(2)} ${(top + innerH).toFixed(2)} Z" fill="url(#hrArea)"/>`;
  }
  let spo2Line = '';
  if (spo2Points.length > 1) {
    spo2Line = `<path d="${smoothPath(spo2Points)}" fill="none" stroke="url(#spo2Line)" stroke-width="1.8" stroke-dasharray="3 2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  const lastHr = hrPoints.at(-1);
  const lastSpo2 = spo2Points.at(-1);
  const dots = [
    lastHr ? `<circle cx="${lastHr.x.toFixed(2)}" cy="${lastHr.y.toFixed(2)}" r="6" fill="rgba(255,119,168,.16)"/><circle cx="${lastHr.x.toFixed(2)}" cy="${lastHr.y.toFixed(2)}" r="2.4" fill="#ff8eb7" stroke="#1a1024" stroke-width="1"/>` : '',
    lastSpo2 ? `<circle cx="${lastSpo2.x.toFixed(2)}" cy="${lastSpo2.y.toFixed(2)}" r="2.1" fill="#72d8ff" stroke="#10151d" stroke-width="1"/>` : '',
    lastHr ? `<text x="${Math.min(width - right + 2, lastHr.x + 7).toFixed(1)}" y="${(lastHr.y - 5).toFixed(1)}" font-size="6.4" fill="#ff9dbf" font-weight="600">${Math.round(lastHr.value)} BPM</text>` : '',
    lastSpo2 ? `<text x="${Math.min(width - right + 2, lastSpo2.x + 2).toFixed(1)}" y="${(lastSpo2.y - 5).toFixed(1)}" font-size="6.2" fill="#8be3ff">${Math.round(lastSpo2.value)}%</text>` : '',
  ].join('');

  const defs = `<defs>
    <linearGradient id="hrLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ff8eb7"/><stop offset="1" stop-color="#ff6fa3"/>
    </linearGradient>
    <linearGradient id="hrArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,119,168,.22)"/><stop offset="1" stop-color="rgba(255,119,168,0)"/>
    </linearGradient>
    <linearGradient id="spo2Line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5bcfee"/><stop offset="1" stop-color="#9be8ff"/>
    </linearGradient>
  </defs>`;

  return `<div class="chart-wrap">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="心率和血氧趋势">
      ${defs}
      ${grid}
      ${xLabels}
      ${hrArea}
      ${spo2Line}
      ${hrLine}
      ${dots}
    </svg>
    ${samples.length < 2 ? '<div class="chart-empty">等待更多手表采样 · 每小时自动记录</div>' : ''}
  </div>`;
}

function metricCard(kind, metric, source) {
  const isHr = kind === 'hr';
  const count = metric?.count ?? 0;
  const latest = metric?.latest;
  const avg = metric?.average;
  const min = metric?.min;
  const max = metric?.max;
  const title = isHr ? '心率' : '血氧';
  const unit = isHr ? 'BPM' : '%';
  const range = min != null && max != null ? `${Math.round(min)}-${Math.round(max)}` : '—';
  return `<div class="metric ${isHr ? 'hr' : 'spo2'}">
    <div class="metric-head">
      <span class="metric-title">${icon(isHr ? 'heart' : 'drop', 10)} ${title}</span>
      <span class="metric-count">${count} 个有效采样</span>
    </div>
    <div class="metric-grid">
      <div><div class="k">最新</div><div class="v">${latest == null ? '—' : Math.round(latest)}<small>${unit}</small></div></div>
      <div><div class="k">平均</div><div class="v">${avg == null ? '—' : Math.round(avg)}<small>${unit}</small></div></div>
      <div><div class="k">范围</div><div class="v range">${range}</div></div>
    </div>
  </div>`;
}

function scheduleBlock(schedule) {
  if (!schedule?.today?.length) {
    return `<div class="schedule-empty">
      <div>
        <div class="main">今天没有排课或日程</div>
        <div class="sub">${schedule?.weekdayName ?? ''} · 时间留给自己</div>
      </div>
      <span class="badge">自由时间</span>
    </div>`;
  }
  const items = schedule.today.slice(0, 3).map((entry) => {
    const active = schedule.current?.index === entry.index;
    return `<div class="schedule-item${active ? ' current' : ''}">
      <div class="schedule-time">${escapeHtml(entry.startText)}–${escapeHtml(entry.endText)}</div>
      <div class="schedule-body">
        <div class="schedule-title">${escapeHtml(entry.title)}</div>
        <div class="schedule-meta">${escapeHtml([entry.type, entry.location].filter(Boolean).join(' · ') || '日程')}</div>
      </div>
      ${active ? `<span class="badge" style="font-size:6.5px;color:#c8b8ef;border:1px solid rgba(185,162,255,.18);background:rgba(185,162,255,.08);padding:3px 6px;border-radius:999px">进行中</span>` : ''}
    </div>`;
  }).join('');
  const more = schedule.today.length > 3
    ? `<div style="padding:6px 0 2px;font-size:6.8px;color:#6f6588;text-align:right">还有 ${schedule.today.length - 3} 项安排</div>`
    : '';
  return items + more;
}

function weatherIcon(name) {
  return icon(name || 'sun', 26, 1.5);
}

export function buildSnapshot({ store, config, pc, weather, now = new Date() }) {
  const devices = store.devices(config, now.getTime());
  const health = store.healthSummary(2, now.getTime());
  const schedule = scheduleState(config, now);
  return {
    config,
    now,
    nowIso: now.toISOString(),
    devices,
    health,
    schedule,
    weather,
    pc,
    stepsToday: store.stepsToday(config, now.getTime()),
    generatedAt: new Date().toISOString(),
  };
}

export function renderHtml(snapshot, { live = false } = {}) {
  const { config, now, devices, health, schedule, weather, pc, stepsToday } = snapshot;
  const phone = devices.find((device) => device.kind === 'phone') ?? null;
  const tablet = devices.find((device) => device.kind === 'tablet') ?? null;
  const watch = devices.find((device) => device.kind === 'watch') ?? null;
  const primaryTimeZone = config.timezone;
  const secondaryTimeZone = config.secondaryTimezone;
  const subject = config.subject || '他';
  const inference = snapshot.inference ?? {
    label: '状态整理中',
    sentence: `${subject}的状态正在汇总`,
    detail: '设备数据刚刚接入。',
    confidence: 0.5,
    evidence: [],
    deviceLine: '',
  };
  const labelLength = Array.from(inference.label ?? '').length;
  const titleClass = labelLength > 11 ? ' tiny' : labelLength > 6 ? ' small' : '';
  const city = weather?.city
    ? (config.privacy?.showCity === false
      ? '位置已隐藏'
      : `${weather.city}${weather.region
        && weather.region !== weather.city
        && !weather.region.startsWith(weather.city)
        && !weather.city.startsWith(weather.region)
        ? ` · ${weather.region}` : ''}`)
    : '等待定位';
  const weatherReportTime = weather?.observedAt ? String(weather.observedAt).slice(11, 16) : null;
  const onlineCount = devices.filter((device) => device.kind !== 'pc' && device.online).length
    + (pc?.online !== false && pc?.ok !== false && pc ? 1 : 0);
  const updatedTime = formatTime(now, primaryTimeZone);
  const secondaryTime = formatTime(now, secondaryTimeZone);
  const localSeconds = formatTime(now, primaryTimeZone, true);
  const offset = timezoneOffsetLabel(primaryTimeZone, now);
  const steps = stepsToday ?? watch?.stepsToday ?? phone?.stepsToday;
  const confidence = Math.max(0, Math.min(1, Number(inference.confidence) || 0.5));
  const evidence = inference.evidence?.length ? inference.evidence : [{ icon: 'pin', text: '等待设备上报' }];

  const deviceCards = [
    deviceCard('phone', phone),
    deviceCard('tablet', tablet),
    deviceCard('pc', pc),
    deviceCard('watch', watch, health),
  ].join('');

  const scheduleItems = schedule?.today?.length ? scheduleBlock(schedule) : `<div class="schedule-empty">
      <div>
        <div class="main">今天没有排课或日程</div>
        <div class="sub">${schedule?.weekdayName ?? ''} · 时间留给自己</div>
      </div>
      <span class="badge">自由时间</span>
    </div>`;

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>他在干嘛</title>
  <style>${CSS}</style>
</head>
<body>
  <main class="page" id="page">
    <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
    <span class="star s1">✦</span><span class="star s2">✦</span><span class="star s3">✧</span><span class="star s4">✦</span><span class="star s5">✧</span>

    <h1>他在干嘛</h1>

    <section class="hero">
      <div class="hero-top">
        <span class="kicker">CURRENT STATUS</span>
        <span class="pill"><span class="dot"></span> ${config.privacy?.showCity === false ? '位置已隐藏' : `IP 属地：${escapeHtml(city)}`}</span>
      </div>
      <div class="hero-body">
        <div class="hero-copy">
          <div class="hero-prefix">${escapeHtml(subject)}正在</div>
          <div class="hero-title${titleClass}">${escapeHtml(inference.label)}</div>
          <p class="hero-sentence">${escapeHtml(inference.sentence)}</p>
          <span class="confidence"><span class="bar"><i style="width:${Math.round(confidence * 100)}%"></i></span> 推断置信度 ${Math.round(confidence * 100)}%</span>
        </div>
        <div class="steps-box">
          <div class="label">今日步数</div>
          <div class="num">${fmtNumber(steps)}<span class="unit">步</span></div>
          <div class="hint">来自手机 / 手表</div>
        </div>
      </div>
      <div class="weather">
        <div class="weather-icon">${weather ? weatherIcon(weather.icon) : icon('cloud', 26)}</div>
        <div class="weather-main">
          <div class="text">${escapeHtml(weather?.text ?? '天气 —')}</div>
          <div class="city">${escapeHtml(city)}</div>
        </div>
        <div class="weather-stats">
          <div><div class="k">温度</div><div class="v">${Number.isFinite(weather?.temperature) ? round(weather.temperature, 1) : '—'}<small>°C</small></div></div>
          <div><div class="k">湿度</div><div class="v">${Number.isFinite(weather?.humidity) ? Math.round(weather.humidity) : '—'}<small>%</small></div></div>
          <div><div class="k">风力</div><div class="v">${Number.isFinite(weather?.windLevel) ? weather.windLevel : '—'}<small>级</small></div></div>
        </div>
      </div>
      <div class="times">
        <div class="time-box"><div class="k">状态更新</div><div class="v">${updatedTime}</div></div>
        <div class="time-box"><div class="k">本地时间</div><div class="v">${localSeconds}</div></div>
        <div class="time-box"><div class="k">${escapeHtml(config.secondaryTimeLabel)}</div><div class="v">${secondaryTime}</div></div>
      </div>
      <div class="times-note"><span>${escapeHtml(primaryTimeZone)} · ${escapeHtml(offset)}</span><span>${weatherReportTime ? `天气 ${weatherReportTime} 更新` : '天气待更新'} · 60 秒汇总</span></div>
    </section>

    <div class="section-head">
      <span class="mark">${icon('cpu', 12)}</span>
      <h2>设备活动</h2>
      <span class="line"></span>
      <span class="extra">${onlineCount} / 4 在线</span>
    </div>
    <section class="devices">${deviceCards}</section>

    <div class="section-head">
      <span class="mark">${icon('heart', 12)}</span>
      <h2>心率 / 血氧趋势</h2>
      <span class="line"></span>
      <span class="extra">近 2 小时</span>
    </div>
    <section>
      <div class="health-summary">
        ${metricCard('hr', health.hr)}
        ${metricCard('spo2', health.spo2)}
      </div>
      <div class="chart-card">
        ${chart(health, config)}
        <div class="chart-legend">
          <div class="legend-left">
            <span class="legend-key"><i></i> 心率</span>
            <span class="legend-key spo2"><i></i> 血氧</span>
          </div>
          <span>${escapeHtml(watch?.model || 'OPPO Watch')} · ${watch?.online ? '已同步' : '等待同步'}</span>
        </div>
      </div>
    </section>

    <div class="section-head">
      <span class="mark">${icon('calendar', 12)}</span>
      <h2>今日安排</h2>
      <span class="line"></span>
      <span class="extra">${schedule?.weekText ? `${escapeHtml(schedule.weekText)} · ` : ''}${escapeHtml(formatFullDate(now, primaryTimeZone))}</span>
    </div>
    <section class="schedule">${scheduleItems}</section>

    <div class="section-head" style="margin-top:14px">
      <span class="mark">${icon('sparkle', 12)}</span>
      <h2>推断依据</h2>
      <span class="line"></span>
      <span class="extra">${escapeHtml(inference.confidenceText ?? `${Math.round(confidence * 100)}%`)}</span>
    </div>
    <section style="display:flex;flex-wrap:wrap;gap:5px">
      ${evidence.map((item) => `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.025);font-size:7px;color:#a397ba">${icon(item.icon ?? 'pin', 9)}${escapeHtml(item.text)}</span>`).join('')}
    </section>

    <footer class="footer">
      <span class="brandline">${icon('shield', 9)} <b>powerd by hanser</b></span>
    </footer>
  </main>
  ${live ? `<script>setTimeout(() => location.reload(), 60000);</script>` : ''}
</body>
</html>`;
  return html;
}

function detectChrome(config) {
  const candidates = [];
  if (config.snapshot?.chromePath) candidates.push(config.snapshot.chromePath);
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  candidates.push(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  );
  try {
    const base = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
    if (fs.existsSync(base)) {
      const dirs = fs.readdirSync(base)
        .filter((name) => name.startsWith('chromium-') && !name.includes('headless'))
        .sort()
        .reverse();
      for (const dir of dirs) {
        candidates.push(
          path.join(base, dir, 'chrome-win64', 'chrome.exe'),
          path.join(base, dir, 'chrome-win', 'chrome.exe'),
        );
      }
    }
  } catch {
    // ignore
  }
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;
}

export async function renderPng(snapshot, { config, height = 1360 } = {}) {
  const chrome = detectChrome(config);
  if (!chrome) throw new Error('找不到 Chromium / Chrome。请在 config.json 的 snapshot.chromePath 指定 chrome.exe 路径。');

  const html = renderHtml(snapshot);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const htmlPath = path.join(TMP_DIR, `card-${stamp}.html`);
  const outPath = path.join(SNAPSHOT_DIR, `status-${stamp}.png`);
  const profileDir = path.join(TMP_DIR, `chrome-${process.pid}-${Date.now()}`);
  await fsp.writeFile(htmlPath, html, 'utf8');
  await fsp.mkdir(profileDir, { recursive: true });

  const width = Number(config.snapshot?.width) || 440;
  const scale = Number(config.snapshot?.scale) || 2;
  let actualHeight = height;

  try {
    try {
      const shot = await screenshotWithCdp({
        chrome,
        htmlPath,
        outPath,
        profileDir,
        width,
        scale,
      });
      actualHeight = shot.height;
    } catch (cdpError) {
      const args = [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--force-device-scale-factor=' + scale,
        `--window-size=${width},${height}`,
        '--virtual-time-budget=1500',
        '--run-all-compositor-stages-before-draw',
        `--user-data-dir=${profileDir}`,
        `--screenshot=${outPath}`,
        pathToFileURL(htmlPath).href,
      ];
      const result = await execFileAsync(chrome, args, {
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      });
      const stat = await fsp.stat(outPath).catch(() => null);
      if (!stat || stat.size < 8_000) {
        throw new Error(`Chrome 未生成有效截图：${String(result.stderr || '').slice(-600)}；CDP: ${cdpError.message}`);
      }
    }

    const stat = await fsp.stat(outPath).catch(() => null);
    if (!stat || stat.size < 8_000) throw new Error('Chrome 未生成有效截图');
    const latest = path.join(SNAPSHOT_DIR, 'status.png');
    await fsp.copyFile(outPath, latest);
    const buffer = await fsp.readFile(outPath);
    return {
      path: outPath,
      latestPath: latest,
      url: '/status.png',
      buffer,
      bytes: buffer.length,
      width: width * scale,
      height: actualHeight * scale,
      chrome,
    };
  } finally {
    await fsp.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(htmlPath, { force: true }).catch(() => {});
  }
}
