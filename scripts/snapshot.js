import { loadConfig } from '../server/lib/util.js';

const config = loadConfig();
const base = `http://127.0.0.1:${config.port}`;
const token = config.token;

const response = await fetch(`${base}/api/snapshot?token=${encodeURIComponent(token)}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ refresh: true }),
});
const text = await response.text();
if (!response.ok) {
  console.error(text);
  process.exit(1);
}
const result = JSON.parse(text);
console.log(result.summary);
console.log(result.imagePath);
