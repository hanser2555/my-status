# 部署到腾讯云

目标：把电脑上的 Node 服务搬到腾讯云，让手机、平板、手表 App 在任何网络下都能上报；电脑端只保留一个轻量 Agent。

> 重要：心率/血氧目前仍依赖「OPPO 健康 + 手机 ADB」这条本机链路。云服务器无法直接访问你家里的手机 ADB，所以手表健康数据要么继续由家里的电脑同步上云，要么改成手机端自动化推送。详见第 8 节。

---

## 1. 部署后的架构

```text
Android 手机 / 平板 ─┐
手表 App ────────────┤  HTTPS POST
Windows PC Agent ────┤──────────────► 腾讯云 Lighthouse / CVM
OPPO 健康 ADB 桥接 ──┘                   Caddy (443)
                                            │
                                            ▼
                                      Node 状态服务
                                            │
                                            ▼
                                  Chromium 截图 → status.png
                                            │
                                            ▼
                                   https://你的域名/?token=...
```

云上只跑聚合、推断、截图；电脑状态由 PC Agent 主动上报。

---

## 2. 先选服务器和地域

推荐：

| 项目 | 建议 |
|---|---|
| 产品 | 腾讯云 **轻量应用服务器 Lighthouse** |
| 配置 | 2 核 2G / 40GB SSD 起 |
| 系统 | Ubuntu 22.04 LTS 或 24.04 LTS |
| 地域 | 香港 / 新加坡（不需要备案），或广州/上海（域名需 ICP 备案） |
| 带宽 | 3Mbps 以上即可 |
| 端口 | 只开 22、80、443 |

注意：

- 用**中国大陆地域 + 域名**，必须先完成 **ICP 备案**，否则 80/443 会被拦截。
- 不想备案就选**香港/新加坡**，延迟稍高，但可直接用域名 + HTTPS。
- 不要买 Windows 云服务器来跑这套服务：Chrome 截图和中文成本更高，而且仍然读不到你家电脑的 PowerShell 状态。

---

## 3. 初始化服务器

用 SSH 登录：

```bash
ssh ubuntu@你的公网IP
```

安装 Docker：

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

腾讯云安全组 / 防火墙放行：

```text
22/tcp    SSH
80/tcp    HTTP（Caddy 申请证书）
443/tcp   HTTPS
```

**不要**放行 17890。

---

## 4. 上传项目

在 Windows 本机项目目录：

```powershell
scp -r .\* ubuntu@你的公网IP:~/my-status
```

或者把项目传到 GitHub，再在服务器 `git clone`。

服务器上进入目录：

```bash
cd ~/my-status
```

---

## 5. 配置域名和令牌

### 5.1 配置 DNS

在腾讯云 DNSPod 添加 A 记录：

```text
status.你的域名.com  →  服务器公网 IP
```

### 5.2 生成强令牌

```bash
openssl rand -hex 24
```

### 5.3 创建云配置

```bash
cp config.cloud.example.json config.json
nano config.json
```

至少要改：

```json
{
  "token": "刚才生成的长令牌",
  "localPc": false,
  "snapshot": {
    "chromePath": "/usr/bin/chromium"
  }
}
```

`localPc: false` 表示云服务器不自己采集 Windows 状态，改由 PC Agent 上报。

### 5.4 配置域名

```bash
cp .env.example .env
nano .env
```

```env
DOMAIN=status.你的域名.com
```

### 5.5 启动

```bash
docker compose up -d --build
docker compose logs -f app
```

首次构建会下载 Chromium 和 CJK 字体，约几分钟。

检查：

```bash
curl http://127.0.0.1:17890/healthz
```

Caddy 会自动申请 HTTPS 证书。打开：

```text
https://status.你的域名.com/?token=你的令牌
```

---

## 6. 电脑端安装 PC Agent

云服务器读不到你本机的前台窗口，所以要在 Windows 上跑一个上报脚本。

先测试：

```powershell
cd C:\path\to\my-status
.\scripts\pc-agent.ps1 -Server https://status.你的域名.com -Token 你的令牌
```

看到“已上报电脑状态”即可。

设置每分钟自动上报：

```powershell
.\install-pc-agent.ps1 -Server https://status.你的域名.com -Token 你的令牌
```

卸载：

```powershell
.\install-pc-agent.ps1 -Server https://status.你的域名.com -Token 你的令牌 -Remove
```

---

## 7. 改手机 / 平板 / 手表 App

在每台设备打开“我的状态”：

```text
电脑地址：https://status.你的域名.com
访问令牌：你的新令牌
```

手机 ID 用 `phone`，平板 ID 用 `tablet`，手表保持 `watch`。

> App 里的“电脑地址”字段虽然叫电脑地址，实际填云服务地址即可。
> 如果用 IP 直接访问，就只能 `http://IP`，没有 HTTPS，不建议长期用。

---

## 8. 手表健康数据怎么办

### 方案 A：继续用家里电脑做 ADB 桥

OPPO Watch 4 Pro 的原始传感器被固件限制，HealthKit 又有签名白名单，第三方 App 读不到心率/血氧。当前可用方式仍是：

```powershell
.\scripts\sync-oppo-health.ps1 `
  -Server https://status.你的域名.com `
  -Token 你的令牌 `
  -Serial 192.168.1.101:5555
```

这会通过无线 ADB 读取 OPPO 健康，然后直接推到云上。

要求：

- 家里电脑开着
- 手机和电脑在同一网络，无线 ADB 在线
- 手机解锁

可以把它做成 Windows 计划任务，每 10 分钟跑一次。

### 方案 B：手机端自动化

用 MacroDroid / Tasker 从 OPPO 健康通知或 Health Connect 取数据，直接 POST 到：

```text
https://status.你的域名.com/api/report/health
x-xt-token: 你的令牌
```

这样不需要家里电脑。

---

## 9. 改 DSH 插件

本机 DSH 的 `chaxiantian` / `chahanser` 工具默认调用 `http://127.0.0.1:17890`。上云后改：

`plugin/cordis.patch.yml`：

```yaml
serverUrl: https://status.你的域名.com
token: 你的新令牌
autoStart: false
```

然后重新安装插件：

```text
plugin_manager install_bundle
target: C:\path\to\my-status\plugin
```

`autoStart: false` 是因为云服务一直在，不需要本机再拉起 Node。

---

## 10. 安全清单

- 只开 22/80/443，**不要开 17890**
- 令牌至少 32 位随机字符，不要继续用旧令牌
- 域名必须 HTTPS；不要用裸 IP + HTTP 长期传输健康数据
- SSH 用密钥登录，禁用密码登录
- 定期备份 `data/state.json` 和 `dist/`（可选）
- 云厂商能看到你的数据；这是个人健康数据，介意就不要上公网
- 图片链接里带令牌，转发前确认可以公开
- 建议加 fail2ban / 腾讯云主机安全

---

## 11. 常见问题

**Caddy 申请证书失败**

- DNS 没生效
- 80/443 没放行
- 大陆地域域名没备案

**卡片里电脑一直离线**

- PC Agent 没运行
- `config.json` 没有 `"localPc": false`
- Agent 的 Server/Token 填错

**截图失败**

```bash
docker compose exec app chromium --version
docker compose logs app
```

应该使用 `/usr/bin/chromium`。

**中文变成方框**

镜像已安装 `fonts-noto-cjk`；如果自定义镜像，记得装中文字体。

**手机无法访问**

- 手机能打开 `https://status.你的域名.com/healthz` 吗？
- App 地址是否填了 `https://`
- 令牌是否和 `config.json` 一致

---

## 12. 最小上线顺序

1. 买 Lighthouse，装 Docker
2. 上传项目，配 `config.json` / `.env`
3. DNS 解析，`docker compose up -d --build`
4. 浏览器打开 `https://域名/?token=...`
5. 电脑跑 PC Agent
6. 手机/平板/手表改地址和令牌
7. DSH 插件改 `serverUrl`
8. 手表健康用 ADB 桥或手机自动化补上
