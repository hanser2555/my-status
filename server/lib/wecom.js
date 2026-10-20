import crypto from 'node:crypto';
import fsp from 'node:fs/promises';

const API = 'https://qyapi.weixin.qq.com';
let tokenCache = new Map();

export function wecomConfigured(config) {
  const c = config?.wecomKf;
  return Boolean(c && c.enabled && c.corpId && c.secret && c.token && c.encodingAESKey && c.openKfId);
}

function aesKey(encodingAESKey) {
  return Buffer.from(`${encodingAESKey}=`, 'base64');
}

function signature(token, timestamp, nonce, encrypt) {
  return crypto.createHash('sha1')
    .update([token, timestamp, nonce, encrypt].sort().join(''))
    .digest('hex');
}

export function verifySignature({ token, timestamp, nonce, encrypt, msgSignature }) {
  if (!token || !timestamp || !nonce || !encrypt || !msgSignature) return false;
  const expected = signature(token, timestamp, nonce, encrypt);
  const left = Buffer.from(expected);
  const right = Buffer.from(String(msgSignature));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function unpad(buffer) {
  const pad = buffer[buffer.length - 1];
  if (!pad || pad < 1 || pad > 32) return buffer;
  return buffer.subarray(0, buffer.length - pad);
}

export function decryptMessage(encodingAESKey, encrypt, corpId) {
  const key = aesKey(encodingAESKey);
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  let plain = Buffer.concat([decipher.update(Buffer.from(encrypt, 'base64')), decipher.final()]);
  plain = unpad(plain);
  if (plain.length < 20) throw new Error('wecom: decrypted message too short');
  const length = plain.readUInt32BE(16);
  const message = plain.subarray(20, 20 + length).toString('utf8');
  const receiveId = plain.subarray(20 + length).toString('utf8');
  if (corpId && receiveId && receiveId !== corpId) {
    throw new Error('wecom: corpId mismatch');
  }
  return { message, receiveId };
}

export function encryptMessage(encodingAESKey, message, corpId) {
  const key = aesKey(encodingAESKey);
  const iv = key.subarray(0, 16);
  const random = crypto.randomBytes(16);
  const msg = Buffer.from(message, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(msg.length, 0);
  const raw = Buffer.concat([random, length, msg, Buffer.from(corpId, 'utf8')]);
  const pad = 32 - (raw.length % 32 || 32);
  const padByte = pad === 0 ? 32 : pad;
  const padded = Buffer.concat([raw, Buffer.alloc(padByte, padByte)]);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

export function verifyUrl({ config, msgSignature, timestamp, nonce, echostr }) {
  const c = config.wecomKf;
  if (!verifySignature({ token: c.token, timestamp, nonce, encrypt: echostr, msgSignature })) {
    throw new Error('wecom: invalid signature');
  }
  return decryptMessage(c.encodingAESKey, echostr, c.corpId).message;
}

export function xmlValue(xml, tag) {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i');
  const match = re.exec(xml ?? '');
  return match ? match[1] : '';
}

export function parseEncryptedXml(xml) {
  return {
    encrypt: xmlValue(xml, 'Encrypt'),
    toUserName: xmlValue(xml, 'ToUserName'),
    fromUserName: xmlValue(xml, 'FromUserName'),
    createTime: xmlValue(xml, 'CreateTime'),
    msgType: xmlValue(xml, 'MsgType'),
    content: xmlValue(xml, 'Content'),
    msgId: xmlValue(xml, 'MsgId'),
    event: xmlValue(xml, 'Event'),
  };
}

async function getAccessToken(config) {
  const c = config.wecomKf;
  const cacheKey = `${c.corpId}:${c.secret}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const url = `${API}/cgi-bin/gettoken?corpid=${encodeURIComponent(c.corpId)}&corpsecret=${encodeURIComponent(c.secret)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const data = await response.json();
  if (!data.access_token) throw new Error(`wecom token: ${data.errmsg ?? response.status}`);
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 7200) * 1000,
  });
  return data.access_token;
}

async function apiPost(config, path, body) {
  const token = await getAccessToken(config);
  const response = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  if (data.errcode && data.errcode !== 0) throw new Error(`wecom api ${path}: ${data.errcode} ${data.errmsg}`);
  return data;
}

export async function sendText(config, externalUserId, content) {
  return apiPost(config, '/cgi-bin/kf/send_msg', {
    touser: externalUserId,
    open_kfid: config.wecomKf.openKfId,
    msgtype: 'text',
    text: { content: String(content).slice(0, 2000) },
  });
}

async function uploadImage(config, imagePath) {
  const token = await getAccessToken(config);
  const data = await fsp.readFile(imagePath);
  const form = new FormData();
  form.append('media', new Blob([data], { type: 'image/png' }), 'status.png');
  const response = await fetch(`${API}/cgi-bin/media/upload?access_token=${encodeURIComponent(token)}&type=image`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!result.media_id) throw new Error(`wecom media: ${result.errmsg ?? response.status}`);
  return result.media_id;
}

export async function sendImage(config, externalUserId, imagePath) {
  const mediaId = await uploadImage(config, imagePath);
  return apiPost(config, '/cgi-bin/kf/send_msg', {
    touser: externalUserId,
    open_kfid: config.wecomKf.openKfId,
    msgtype: 'image',
    image: { media_id: mediaId },
  });
}
