import {
  formatRelative, formatTime, minutesOfDay, parseClock, weekdayIndex, zonedParts,
} from './util.js';
import { appLabelForDevice, categoryLabel } from './classify.js';

const WEEKDAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function weekNumberFor(date, timeZone, semesterStart) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(semesterStart ?? ''));
  if (!match) return null;
  const startUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const p = zonedParts(date, timeZone);
  const nowUtc = Date.UTC(p.year, p.month - 1, p.day);
  const days = Math.floor((nowUtc - startUtc) / 86_400_000);
  if (days < 0) return 0;
  return Math.floor(days / 7) + 1;
}

function entryWeeks(entry) {
  if (Array.isArray(entry.weeks) && entry.weeks.length === 2) {
    return { from: Number(entry.weeks[0]), to: Number(entry.weeks[1]) };
  }
  if (Array.isArray(entry.weeks) && entry.weeks.length) {
    const values = entry.weeks.map(Number).filter(Number.isFinite);
    return { from: Math.min(...values), to: Math.max(...values) };
  }
  if (entry.startWeek != null || entry.endWeek != null) {
    return {
      from: Number(entry.startWeek ?? 1),
      to: Number(entry.endWeek ?? 999),
    };
  }
  return null;
}

export function scheduleState(config, now = new Date()) {
  const timeZone = config.timezone;
  const weekday = weekdayIndex(now, timeZone);
  const minutes = minutesOfDay(now, timeZone);
  const week = weekNumberFor(now, timeZone, config.semesterStart);
  const entries = (config.schedule ?? [])
    .map((entry, index) => {
      const days = Array.isArray(entry.days) ? entry.days.map(Number)
        : entry.day ? [Number(entry.day)] : [1, 2, 3, 4, 5, 6, 7];
      const start = parseClock(entry.start);
      const end = parseClock(entry.end);
      if (start == null || end == null || end <= start) return null;
      const weeks = entryWeeks(entry);
      if (week != null && weeks && (week < weeks.from || week > weeks.to)) return null;
      return {
        index,
        days,
        weeks,
        start,
        end,
        startText: entry.start,
        endText: entry.end,
        title: String(entry.title ?? '未命名安排'),
        location: entry.location ? String(entry.location) : '',
        type: entry.type ? String(entry.type) : '',
      };
    })
    .filter(Boolean);

  const today = entries.filter((entry) => entry.days.includes(weekday))
    .sort((a, b) => a.start - b.start);
  const current = today.find((entry) => minutes >= entry.start && minutes < entry.end) ?? null;
  const next = today.find((entry) => entry.start > minutes) ?? null;
  return {
    current,
    next,
    today,
    week,
    weekText: week != null ? `第${week}周` : '',
    weekday,
    weekdayName: WEEKDAY_NAMES[weekday],
  };
}

function statusOf(device, now) {
  if (!device) return { state: 'missing', online: false, active: false };
  const online = device.online !== false;
  const active = Boolean(device.screenOn) && online;
  return { state: online ? (active ? 'active' : 'idle') : 'offline', online, active };
}

function pickForeground(device) {
  if (!device?.foreground) return '';
  return appLabelForDevice(device.foreground) || '';
}

function pct(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : '—';
}

function buildEvidence({ pc, phone, tablet, watch, health, weather, schedule, config, now }) {
  const evidence = [];
  const pcOnline = Boolean(pc && pc.online !== false && pc.ok !== false);
  const idleSec = Number(pc?.idleSec ?? 0);

  if (pcOnline) {
    if (idleSec < 120 && pc?.active?.display) {
      const appText = Array.from(pc.active.display).slice(0, 22).join('');
      evidence.push({ icon: 'laptop', text: `电脑 · ${appText}`, tone: 'accent' });
    } else if (idleSec >= 120) {
      evidence.push({ icon: 'laptop', text: `电脑闲置 ${Math.floor(idleSec / 60)} 分钟`, tone: 'muted' });
    }
  }

  if (phone?.online) {
    evidence.push({
      icon: 'phone',
      text: `手机 ${pct(phone.battery?.percent)}${phone.screenOn ? ` · ${pickForeground(phone) || '亮屏'}` : ' · 熄屏'}`,
      tone: phone.screenOn ? 'accent' : 'muted',
    });
  }

  if (watch?.online && Number.isFinite(health?.hr?.latest)) {
    evidence.push({ icon: 'heart', text: `心率 ${Math.round(health.hr.latest)} BPM`, tone: 'pink' });
  } else if (watch?.online && watch.health?.hr) {
    evidence.push({ icon: 'heart', text: `心率 ${Math.round(watch.health.hr)} BPM`, tone: 'pink' });
  }

  if (schedule?.current) {
    evidence.push({ icon: 'calendar', text: `${schedule.current.startText} ${schedule.current.title}`, tone: 'cyan' });
  } else if (config.privacy?.showCity !== false && weather?.city) {
    evidence.push({ icon: 'pin', text: `${weather.city} · ${Number.isFinite(weather.temperature) ? `${Math.round(weather.temperature)}°C` : '天气'}` });
  }

  return evidence.slice(0, 4);
}

export function inferActivity({
  pc, devices = [], health, weather, schedule, config, now = new Date(),
}) {
  const subject = config.subject || '他';
  const phone = devices.find((device) => device.kind === 'phone') ?? null;
  const tablet = devices.find((device) => device.kind === 'tablet') ?? null;
  const watch = devices.find((device) => device.kind === 'watch') ?? null;
  const phoneStatus = statusOf(phone, now);
  const tabletStatus = statusOf(tablet, now);
  const watchStatus = statusOf(watch, now);
  const pcOnline = Boolean(pc && pc.online !== false && pc.ok !== false);
  const idleSec = Number(pc?.idleSec ?? 0);
  const pcActive = pcOnline && idleSec < 120;
  const pcCategory = pc?.active?.category ?? 'other';
  const pcDisplay = pc?.active?.display ?? pc?.active?.label ?? '';
  const phoneApp = pickForeground(phone);
  const tabletApp = pickForeground(tablet);
  const hour = zonedParts(now, config.timezone).hour;
  const lateNight = hour >= 23 || hour < 6;
  const hrLatest = Number.isFinite(health?.hr?.latest) ? health.hr.latest : null;
  const hrResting = Number.isFinite(health?.hr?.resting) ? health.hr.resting : null;
  const hrHigh = hrLatest != null && hrLatest >= 105;
  const hrRaised = hrLatest != null && hrResting != null && hrLatest - hrResting >= 18;
  const steps = watch?.stepsToday ?? phone?.stepsToday ?? null;

  let category = 'rest';
  let label = '休息';
  let sentence = `${subject}现在在休息`;
  let detail = '设备都很安静，暂时没有明显活动。';
  let confidence = 0.55;
  const factors = [];

  const allIdle = (!phoneStatus.online || !phone.screenOn)
    && (!tabletStatus.online || !tablet.screenOn)
    && (!pcOnline || idleSec >= 900);
  const someOnline = phoneStatus.online || tabletStatus.online || pcOnline || watchStatus.online;

  if (schedule?.current) {
    const item = schedule.current;
    const isClass = /课|实验|答疑|讲座|seminar|lecture/i.test(item.type + item.title);
    category = isClass ? 'class' : 'schedule';
    label = isClass ? '上课' : item.title.slice(0, 8);
    sentence = isClass
      ? `${subject}正在上「${item.title}」`
      : `${subject}正在「${item.title}」`;
    detail = `${item.startText}–${item.endText}${item.location ? ` · ${item.location}` : ''}，按今天的日程推断。`;
    confidence = 0.9;
    factors.push('日程进行中');
  } else if (lateNight && allIdle && (hrLatest == null || hrLatest < 80)) {
    category = 'sleep';
    label = '睡觉';
    sentence = `${subject}应该已经睡了`;
    detail = `${formatTime(now, config.timezone)}，电脑与手机都已安静下来${hrLatest != null ? `，心率 ${Math.round(hrLatest)} BPM` : ''}。`;
    confidence = 0.86;
    factors.push('深夜', '设备静止');
  } else if (hrHigh && (phoneStatus.active || tabletStatus.active || watchStatus.active)) {
    category = 'workout';
    label = '运动';
    sentence = `${subject}可能正在运动`;
    detail = `手表心率 ${Math.round(hrLatest)} BPM，明显高于近期静息${hrResting != null ? `（${Math.round(hrResting)}）` : ''}。`;
    confidence = 0.78;
    factors.push('心率升高');
  } else if (pcActive && ['code', 'agent'].includes(pcCategory)) {
    category = 'code';
    label = pcCategory === 'agent' ? '和 AI 写代码' : '写代码';
    if (label.length > 8) label = '做项目';
    sentence = pcCategory === 'agent'
      ? `${subject}正在电脑前和 AI 一起写代码`
      : `${subject}正在电脑前写代码`;
    detail = pcDisplay ? `电脑前台是「${Array.from(pcDisplay).slice(0, 30).join('')}」，键鼠刚刚还在动。` : '电脑处于活跃状态。';
    confidence = 0.9;
    factors.push('电脑活跃', '编程应用');
  } else if (pcActive && pcCategory === 'game') {
    category = 'game';
    label = '打游戏';
    sentence = `${subject}正在打游戏`;
    detail = pcDisplay ? `电脑前台是「${pcDisplay}」。` : '电脑上有游戏正在运行。';
    confidence = 0.88;
    factors.push('游戏前台');
  } else if (pcActive && ['video', 'media'].includes(pcCategory)) {
    category = 'video';
    label = '看视频';
    sentence = `${subject}正在看视频`;
    detail = pcDisplay ? `电脑前台是「${pcDisplay}」。` : '视频窗口处于前台。';
    confidence = 0.84;
    factors.push('视频前台');
  } else if (pcActive && ['office', 'design', 'browser'].includes(pcCategory)) {
    category = pcCategory === 'browser' ? 'browse' : 'office';
    label = pcCategory === 'browser' ? '上网' : '办公';
    sentence = pcCategory === 'browser'
      ? `${subject}正在电脑前浏览网页`
      : `${subject}正在电脑前${pcCategory === 'design' ? '做设计' : '办公'}`;
    detail = pcDisplay ? `电脑前台是「${pcDisplay}」。` : '键鼠仍在活跃。';
    confidence = 0.8;
    factors.push('电脑活跃');
  } else if (phoneStatus.active && !tabletStatus.active) {
    category = ['video', 'music'].includes(phone?.foreground?.category) ? 'phone-media' : 'phone';
    label = phoneApp ? `刷${phoneApp}`.slice(0, 8) : '玩手机';
    sentence = phoneApp
      ? `${subject}正在用手机看「${phoneApp}」`
      : `${subject}正在玩手机`;
    detail = `手机亮屏，电量 ${pct(phone?.battery?.percent)}${phone?.battery?.charging ? '，正在充电' : ''}。`;
    confidence = 0.74;
    factors.push('手机亮屏');
  } else if (tabletStatus.active) {
    category = 'tablet';
    label = tabletApp ? `平板 · ${tabletApp}`.slice(0, 8) : '用平板';
    sentence = tabletApp
      ? `${subject}正在用平板看「${tabletApp}」`
      : `${subject}正在用平板`;
    detail = `平板亮屏，电量 ${pct(tablet?.battery?.percent)}。`;
    confidence = 0.72;
    factors.push('平板亮屏');
  } else if (!someOnline) {
    category = 'offline';
    label = '失联';
    sentence = `暂时联系不到${subject}`;
    detail = '手机、平板、电脑和手表都没有新的上报。';
    confidence = 0.35;
    factors.push('全部离线');
  } else if (pcOnline && idleSec < 900) {
    category = 'near-pc';
    label = '在电脑旁';
    sentence = `${subject}在电脑前，暂时没有操作`;
    detail = `电脑还开着，键鼠已经安静 ${Math.max(1, Math.floor(idleSec / 60))} 分钟，可能在看资料或想事情。`;
    confidence = 0.64;
    factors.push('电脑在线', '键鼠闲置');
  } else if (allIdle) {
    category = 'away';
    label = '不在设备旁';
    sentence = `${subject}现在不在设备旁`;
    detail = '电脑、手机和平板都已闲置，可能在外面忙。';
    confidence = 0.62;
    factors.push('设备全闲置');
  } else if (phoneStatus.active && tabletStatus.active) {
    category = 'phone';
    label = '玩手机';
    sentence = `${subject}正在用手机`;
    detail = `手机亮屏${phoneApp ? `，前台是「${phoneApp}」` : ''}。`;
    confidence = 0.7;
    factors.push('手机亮屏');
  } else if (!someOnline) {
    category = 'offline';
    label = '失联';
    sentence = `暂时联系不到${subject}`;
    detail = '手机、平板、电脑和手表都没有新的上报。';
    confidence = 0.35;
    factors.push('全部离线');
  }

  if (pcActive) confidence += 0.02;
  if (schedule?.current) confidence += 0.02;
  if (hrLatest != null) confidence += 0.02;
  confidence = Math.min(0.96, confidence);

  const evidence = buildEvidence({
    pc, phone, tablet, watch, health, weather, schedule, config, now,
  });
  if (!evidence.length) {
    evidence.push({ icon: 'pin', text: '等待设备上报', tone: 'muted' });
  }

  const deviceLine = [
    phone?.online ? `手机 ${pct(phone.battery?.percent)}` : null,
    tablet?.online ? `平板 ${pct(tablet.battery?.percent)}` : null,
    pcOnline ? '电脑在线' : null,
    hrLatest != null ? `心率 ${Math.round(hrLatest)}` : null,
  ].filter(Boolean).join(' · ');

  return {
    category,
    label,
    sentence,
    detail,
    confidence,
    confidenceText: `${Math.round(confidence * 100)}%`,
    factors,
    evidence,
    deviceLine,
    appCategory: phone?.foreground?.category ?? null,
    updatedText: formatRelative(now.toISOString(), now.getTime()),
    updatedAt: now.toISOString(),
    hr: hrLatest,
    steps,
    schedule,
    activityLabel: categoryLabel(pcCategory),
  };
}

export function upcomingText(schedule) {
  if (!schedule?.next) return '今天没有更多安排';
  return `${schedule.next.startText} · ${schedule.next.title}`;
}
