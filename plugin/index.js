import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const name = 'xiaotian-status';
export const inject = ['tools', 'systemPrompt'];

const DEFAULTS = {
  serverUrl: 'http://YOUR_SERVER_IP',
  token: 'CHANGE_ME_TOKEN',
  autoStart: false,
  serverScript: 'C:/path/to/my-status/server/server.js',
};

export function apply(ctx, rawConfig = {}) {
  const config = {
    ...DEFAULTS,
    ...(rawConfig ?? {}),
    serverUrl: DEFAULTS.serverUrl,
    token: DEFAULTS.token,
    autoStart: false,
  };
  const base = String(config.serverUrl).replace(/\/+$/, '');
  let starting = null;

  function log(level, message) {
    const logger = ctx.logger;
    if (logger && typeof logger[level] === 'function') logger[level](message);
    else if (level === 'error') console.error('[xiaotian-status]', message);
  }

  async function healthy(timeoutMs = 1500) {
    try {
      const response = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) return false;
      const data = await response.json();
      return data?.ok === true;
    } catch {
      return false;
    }
  }

  async function ensureServer() {
    if (await healthy()) return;
    throw new Error(`云端状态服务不可用：${base}/healthz`);
  }

  async function snapshot() {
    await ensureServer();
    const response = await fetch(`${base}/api/snapshot?token=${encodeURIComponent(config.token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh: true }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`状态卡生成失败（HTTP ${response.status}）：${body.slice(0, 300)}`);
    let data;
    try { data = JSON.parse(body); } catch { throw new Error(`状态服务返回了无法解析的内容：${body.slice(0, 200)}`); }
    if (!data?.ok || !data.imagePath) throw new Error(data?.error ?? '状态服务没有返回图片路径');

    // 图片存在云端时，下载到本机临时目录，再作为附件展示。
    const imageResponse = await fetch(`${base}/status.png?token=${encodeURIComponent(config.token)}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!imageResponse.ok) throw new Error(`状态卡图片下载失败（HTTP ${imageResponse.status}）`);
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
      throw new Error('云端返回的不是有效的 PNG');
    }
    const localPath = path.join(os.tmpdir(), `hanser-status-${Date.now()}.png`);
    await fsp.writeFile(localPath, bytes);
    return { ...data, imagePath: localPath, remoteImagePath: data.imagePath };
  }

  async function persistImage(imagePath) {
    const attachments = ctx.get('attachments');
    if (!attachments || typeof attachments.saveImage !== 'function') return undefined;
    const data = await fsp.readFile(imagePath);
    if (data.length < 8 || data[0] !== 0x89 || data[1] !== 0x50) {
      throw new Error('生成的图片不是有效的 PNG');
    }
    return attachments.saveImage({
      data: new Uint8Array(data),
      mediaType: 'image/png',
      name: 'xiaotian-status.png',
    });
  }

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'xiaotian-status:trigger',
    order: 3300,
    interpolate: false,
    text: [
      '<hanser-status>',
      '“查hanser”是用户给自己状态卡设置的快捷口令。',
      '当用户只发送“查hanser”“查一下hanser”“hanser在干嘛”，或明确要求查看 hanser 当前在做什么、手机/平板/电脑/手表状态时：',
      '- 必须调用 chahanser 工具，不要先追问，也不要只用文字回答。',
      '- 工具会返回一张已经排版好的状态卡图片。回复时用 1–2 句话概括推断结果，并保留图片。',
      '- 如果工具报错，告诉用户状态服务没有启动，并给出启动命令。',
      '与 hanser 状态无关的请求不要调用此工具。',
      '</hanser-status>',
    ].join('\n'),
  }), 'xiaotian-status: trigger');

  ctx.effect(() => ctx.tools.register({
    name: 'chahanser',
    description: '查询 hanser 现在的手机、平板、电脑、手表状态，推断当前正在做什么，并生成一张可直接分享的状态卡片。用户发送“查hanser”时必须调用。',
    parameters: {
      type: 'object',
      properties: {
        refresh: {
          type: 'boolean',
          description: '是否强制重新采集电脑状态并重新渲染。默认 true。',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: '一句话推断结果。' },
          detail: { type: 'string', description: '推断依据。' },
          imagePath: { type: 'string', description: '本机 PNG 绝对路径。' },
          image: {
            type: 'object',
            properties: {
              attachmentId: { type: 'string' },
              mediaType: { type: 'string' },
              bytes: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              name: { type: 'string' },
            },
            required: ['attachmentId', 'mediaType', 'bytes', 'width', 'height'],
            additionalProperties: true,
          },
        },
        required: ['summary', 'imagePath'],
        additionalProperties: false,
      },
      render: (args, value) => {
        const text = [
          value.summary || '状态已更新。',
          value.detail || '',
          value.imagePath ? `图片：${value.imagePath}` : '',
        ].filter(Boolean).join('\n\n');
        const blocks = [{ type: 'text', text }];
        if (value.image) blocks.push({ type: 'image', attachment: value.image });
        return blocks;
      },
    },
    presentCall: () => ({ card: 'generic', title: '查hanser', kind: 'fetch' }),
    timeoutMs: 100_000,
    isConcurrencySafe: () => false,
    execute: async (args) => {
      const data = await snapshot();
      const image = await persistImage(data.imagePath);
      return {
        summary: data.summary || data.inference?.sentence || '状态已更新。',
        detail: data.inference?.detail || '',
        imagePath: data.imagePath,
        ...(image ? { image } : {}),
      };
    },
  }), 'xiaotian-status: tool');
}
