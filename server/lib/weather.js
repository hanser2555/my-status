import path from 'node:path';
import { DATA_DIR, readJson, writeJsonAtomic } from './util.js';

const GEO_CACHE = path.join(DATA_DIR, 'geo-cache.json');
const PHONE_GEO_CACHE = path.join(DATA_DIR, 'phone-geo-cache.json');
const WEATHER_CACHE = path.join(DATA_DIR, 'weather-cache.json');
const GEO_TTL = 12 * 60 * 60 * 1000;
const WEATHER_TTL = 10 * 60 * 1000;

const REGION_ZH = {
  Zhejiang: '浙江', Jiangsu: '江苏', Shanghai: '上海', Beijing: '北京', Tianjin: '天津',
  Chongqing: '重庆', Guangdong: '广东', Fujian: '福建', Shandong: '山东', Henan: '河南',
  Hebei: '河北', Shanxi: '山西', Shaanxi: '陕西', Hubei: '湖北', Hunan: '湖南',
  Anhui: '安徽', Jiangxi: '江西', Sichuan: '四川', Yunnan: '云南', Guizhou: '贵州',
  Guangxi: '广西', Hainan: '海南', Liaoning: '辽宁', Jilin: '吉林', Heilongjiang: '黑龙江',
  'Inner Mongolia': '内蒙古', Gansu: '甘肃', Qinghai: '青海', Ningxia: '宁夏',
  Xinjiang: '新疆', Tibet: '西藏', 'Hong Kong': '香港', Macau: '澳门', Taiwan: '台湾',
};

const CITY_ZH = {
  Jiaxing: '嘉兴', Shaoxing: '绍兴', Hangzhou: '杭州', Ningbo: '宁波', Wenzhou: '温州',
  Huzhou: '湖州', Jinhua: '金华', Taizhou: '台州', Shanghai: '上海', Beijing: '北京',
  Shenzhen: '深圳', Guangzhou: '广州', Chengdu: '成都', Wuhan: '武汉', Nanjing: '南京',
  Suzhou: '苏州', Xiamen: '厦门', Fuzhou: '福州', Qingdao: '青岛', "Xi'an": '西安',
  Changsha: '长沙', Zhengzhou: '郑州', Hefei: '合肥', Kunming: '昆明', Dalian: '大连',
  'Hong Kong': '香港', Macau: '澳门', Taipei: '台北',
};

function localizePlace(city, region) {
  return {
    city: CITY_ZH[city] ?? city ?? '',
    region: REGION_ZH[region] ?? region ?? '',
  };
}

async function fetchJson(url, timeoutMs = 8000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'xiaotian-status/1.0 (personal dashboard)' },
  });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

function isPrivateIp(ip) {
  const value = String(ip ?? '').replace(/^::ffff:/i, '');
  if (!value) return true;
  if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(value)) return true;
  if (/^(fc|fd|fe80):/i.test(value)) return true;
  return false;
}

export async function resolveLocationForIp(ip) {
  const value = String(ip ?? '').replace(/^::ffff:/i, '').trim();
  if (isPrivateIp(value)) return null;
  const cached = readJson(PHONE_GEO_CACHE, null);
  if (cached?.ip === value && Date.now() - Date.parse(cached.fetchedAt) < GEO_TTL) return cached;

  const providers = [
    async () => {
      const data = await fetchJson(`http://ip-api.com/json/${encodeURIComponent(value)}?lang=zh-CN`, 6500);
      if (data.status !== 'success') throw new Error('ip-api: failed');
      const place = localizePlace(data.city, data.regionName);
      return {
        lat: Number(data.lat), lon: Number(data.lon),
        city: place.city,
        region: place.region,
        country: data.country || '',
        ip: data.query || value,
        source: 'phone-ip-api',
      };
    },
    async () => {
      const data = await fetchJson(`https://ipinfo.io/${encodeURIComponent(value)}/json`, 6500);
      if (!data.loc) throw new Error('ipinfo: no loc');
      const [lat, lon] = String(data.loc).split(',').map(Number);
      const place = localizePlace(data.city, data.region);
      return {
        lat, lon,
        city: place.city,
        region: place.region,
        country: data.country || '',
        ip: data.ip || value,
        source: 'phone-ipinfo',
      };
    },
  ];

  for (const provider of providers) {
    try {
      const location = await provider();
      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) continue;
      location.fetchedAt = new Date().toISOString();
      await writeJsonAtomic(PHONE_GEO_CACHE, location);
      return location;
    } catch {
      // try next provider
    }
  }
  return null;
}

export async function resolveLocation(config) {
  const configured = config.location ?? {};
  if (configured.mode === 'manual' && Number.isFinite(Number(configured.lat)) && Number.isFinite(Number(configured.lon))) {
    return {
      lat: Number(configured.lat),
      lon: Number(configured.lon),
      city: configured.city || configured.label || '当前位置',
      region: configured.region || '',
      country: configured.country || '',
      source: 'manual',
      fetchedAt: new Date().toISOString(),
    };
  }

  const cached = readJson(GEO_CACHE, null);
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < GEO_TTL) return cached;

  const providers = [
    async () => {
      const data = await fetchJson('http://ip-api.com/json/?lang=zh-CN', 6500);
      if (data.status !== 'success') throw new Error('ip-api: failed');
      const place = localizePlace(data.city, data.regionName);
      return {
        lat: Number(data.lat), lon: Number(data.lon),
        city: place.city,
        region: place.region,
        country: data.country || '',
        ip: data.query,
        source: 'ip-api.com',
      };
    },
    async () => {
      const data = await fetchJson('https://ipinfo.io/json', 6500);
      if (!data.loc) throw new Error('ipinfo: no loc');
      const [lat, lon] = String(data.loc).split(',').map(Number);
      const place = localizePlace(data.city, data.region);
      return {
        lat, lon,
        city: place.city,
        region: place.region,
        country: data.country || '',
        ip: data.ip,
        source: 'ipinfo.io',
      };
    },
  ];

  for (const provider of providers) {
    try {
      const location = await provider();
      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) continue;
      location.fetchedAt = new Date().toISOString();
      await writeJsonAtomic(GEO_CACHE, location);
      return location;
    } catch {
      // try next provider
    }
  }

  return cached ?? {
    lat: 30.2741, lon: 120.1551, city: '杭州', region: '浙江', country: '中国',
    source: 'fallback', fetchedAt: new Date().toISOString(),
  };
}

const WEATHER_CODES = {
  0: ['晴', 'sun'],
  1: ['大部晴朗', 'sun'],
  2: ['多云', 'cloud-sun'],
  3: ['阴', 'cloud'],
  45: ['有雾', 'fog'],
  48: ['雾凇', 'fog'],
  51: ['小毛毛雨', 'rain'],
  53: ['毛毛雨', 'rain'],
  55: ['大毛毛雨', 'rain'],
  56: ['冻毛毛雨', 'rain'],
  57: ['强冻毛毛雨', 'rain'],
  61: ['小雨', 'rain'],
  63: ['中雨', 'rain'],
  65: ['大雨', 'rain'],
  66: ['冻雨', 'rain'],
  67: ['强冻雨', 'rain'],
  71: ['小雪', 'snow'],
  73: ['中雪', 'snow'],
  75: ['大雪', 'snow'],
  77: ['雪粒', 'snow'],
  80: ['阵雨', 'rain'],
  81: ['强阵雨', 'rain'],
  82: ['暴雨', 'storm'],
  85: ['阵雪', 'snow'],
  86: ['强阵雪', 'snow'],
  95: ['雷阵雨', 'storm'],
  96: ['雷雨冰雹', 'storm'],
  99: ['强雷雨冰雹', 'storm'],
};

function windLevel(kmh) {
  const speed = Number(kmh);
  if (!Number.isFinite(speed)) return null;
  const thresholds = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  for (let i = 0; i < thresholds.length; i += 1) {
    if (speed < thresholds[i]) return i;
  }
  return 12;
}

export async function refreshWeather(config, locationOverride = null) {
  if (config.weather?.enabled === false) return null;
  const cached = readJson(WEATHER_CACHE, null);
  const sameAsOverride = locationOverride
    && cached
    && Number(cached.lat) === Number(locationOverride.lat)
    && Number(cached.lon) === Number(locationOverride.lon);
  if (cached && Date.now() - Date.parse(cached.updatedAt) < WEATHER_TTL && cached.city
      && (!locationOverride || sameAsOverride)) return cached;

  try {
    const location = locationOverride ?? await resolveLocation(config);
    const params = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lon),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
      timezone: 'auto',
      forecast_days: '1',
    });
    const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`, 9000);
    const current = data.current ?? {};
    const daily = data.daily ?? {};
    const code = Number(current.weather_code);
    const [text, icon] = WEATHER_CODES[code] ?? ['天气未知', 'cloud'];
    const weather = {
      city: location.city || '当前位置',
      region: location.region || '',
      country: location.country || '',
      lat: location.lat,
      lon: location.lon,
      locationSource: location.source,
      temperature: Number(current.temperature_2m),
      feelsLike: Number(current.apparent_temperature),
      humidity: Number(current.relative_humidity_2m),
      wind: Number(current.wind_speed_10m),
      windLevel: windLevel(current.wind_speed_10m),
      precipitation: Number(current.precipitation ?? 0),
      isDay: current.is_day === 1,
      code,
      text,
      icon,
      high: Number(daily.temperature_2m_max?.[0]),
      low: Number(daily.temperature_2m_min?.[0]),
      rainChance: Number(daily.precipitation_probability_max?.[0]),
      sunrise: daily.sunrise?.[0],
      sunset: daily.sunset?.[0],
      observedAt: current.time,
      updatedAt: new Date().toISOString(),
      stale: false,
    };
    await writeJsonAtomic(WEATHER_CACHE, weather);
    return weather;
  } catch (error) {
    if (cached) return { ...cached, stale: true, error: String(error.message) };
    return null;
  }
}
