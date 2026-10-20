import { loadConfig } from '../server/lib/util.js';

const config = loadConfig();
const base = `http://127.0.0.1:${config.port}`;
const token = config.token;

async function post(path, body) {
  const response = await fetch(`${base}${path}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} -> HTTP ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const schedule = [
  { day: 1, start: '10:00', end: '11:00', title: '程序设计导论 1', type: '答疑课', location: 'Kilburn 2.25' },
  { day: 1, start: '14:00', end: '15:00', title: '一年级团队项目', type: '实验课', location: 'Kilburn 1.8' },
  { day: 1, start: '16:00', end: '17:00', title: '计算机体系结构基础', type: '答疑课', location: 'Kilburn 1.10' },
];

console.log('seeding demo devices and schedule...');
await post('/api/demo', { schedule });
const result = await post('/api/snapshot', { refresh: true });
console.log(`summary: ${result.summary}`);
console.log(`image:   ${result.imagePath}`);
console.log(`size:    ${result.width}x${result.height} (${Math.round(result.bytes / 1024)} KB)`);
