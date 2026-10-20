<div align="center">

<h1>他在干嘛 · 我的状态</h1>

<p>把 <strong>手机、平板、电脑、手表</strong> 的实时状态，汇总成一张暗紫色状态卡。</p>

<p>在 DeepSeek Harness 里输入 <strong>查hanser</strong>，调用 <code>chahanser</code> 工具，生成一张可保存、可转发的 PNG。</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&amp;logoColor=white&amp;style=flat-square" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/Android-8.0%2B-3DDC84?logo=android&amp;logoColor=white&amp;style=flat-square" alt="Android 8.0+">
  <img src="https://img.shields.io/badge/DeepSeek%20Harness-plugin-6C5CE7?style=flat-square" alt="DSH plugin">
  <img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&amp;logoColor=white&amp;style=flat-square" alt="Docker">
</p>

<p>
  <a href="#2-三步用起来">快速开始</a> ·
  <a href="#1-它是怎么工作的">工作原理</a> ·
  <a href="#4-dsh-插件">DSH 插件</a> ·
  <a href="#11-别人使用时可能遇到的-bug-与解决">常见问题</a>
</p>

</div>

<p align="center">
  <img src="dist/preview-demo.png" width="360" alt="状态卡预览">
</p>

> 预览使用演示设备数据和示例日程；安装 APK 后会自动替换成真实数据，`dist/status.png` 始终是最新状态卡。

<details>
<summary><b>GitHub 版本说明</b>：已移除真实令牌、服务器 IP、个人日程和设备数据</summary>

首次运行：

```powershell
Copy-Item config.example.json config.json
# 修改 config.json 里的 token
```

APK 需要用 `android/build.ps1` 自行构建，输出 `dist/我的状态.apk`。

</details>

---

## 目录

**开始使用**

- [能做什么](#能做什么)
- [1. 它是怎么工作的](#1-它是怎么工作的)
- [2. 三步用起来](#2-三步用起来)
- [3. 手表数据怎么接](#3-手表数据怎么接)
- [4. DSH 插件](#4-dsh-插件)

**进阶**

- [5. 电脑端状态](#5-电脑端状态)
- [6. 日程](#6-日程)
- [7. 命令与 API](#7-命令与-api)
- [8. 隐私与安全](#8-隐私与安全)

**参考**

- [9. 目录结构](#9-目录结构)
- [10. 已知限制](#10-已知限制)
- [11. 别人使用时可能遇到的 Bug 与解决](#11-别人使用时可能遇到的-bug-与解决)

---

## 能做什么

| 设备 | 采集内容 |
|---|---|
| 手机 / 平板 | 前台应用、电量、充电状态、步数、网络、存储 |
| Windows 电脑 | 前台窗口、键鼠活跃、CPU / 内存、在线状态 |
| OPPO Watch | 心率、血氧、电量、步数；支持 ADB 健康桥 |
| 云端 | 多设备汇总、IP 属地 / 天气、周课表、状态卡截图 |

核心能力：

- **规则推断**：根据设备状态、前台应用、时间、课表和心率推断“他现在在干什么”
- **一张图分享**：暗紫色卡片，手机 / 平板 / 电脑 / 手表状态一屏展示
- **多种入口**：本机网页、手机浏览器、DSH 的 `chahanser` 工具、微信客服（可选）
- **本地优先**：默认数据只保存在本机 `data/`，不依赖第三方云

<details>
<summary><b>自定义触发词</b>（默认 <code>查hanser</code>）</summary>

在 DSH profile 的 `my-status` 配置里修改：

```yaml
- id: my-status
  name: '@local/my-status'
  config:
    triggerName: 小明
```

默认：

```text
查hanser
```

改成 `triggerName: 小明` 后：

```text
查小明
```

工具名仍然是 `chahanser`，不需要改代码。修改后重载插件或重启 DSH。

</details>

---

## 1. 它是怎么工作的

```text
手机 / 平板 ─┐
OPPO Watch ──┼── HTTP POST /api/report ──┐
Windows PC ──┘                          │
                                        ▼
                                  Node 状态服务
                                   ├─ 设备数据
                                   ├─ 天气 / IP 属地
                                   ├─ 周课表
                                   └─ 规则推断
                                        │
                                        ▼
                                  HTML 状态卡
                                        │
                                        ▼
                               Chromium → PNG
                                        │
                        网页 / 手机 / DSH / 微信客服
```

- 默认数据保存在本机 `data/`。
- 手机与电脑需要处于同一 WiFi / 局域网。
- 服务默认监听 `0.0.0.0:17890`，用 token 保护。
- 外网访问建议用 Caddy / 反向代理，不要直接暴露 17890。

---

## 2. 三步用起来

### 第一步：启动电脑端服务

```powershell
Copy-Item config.example.json config.json
# 编辑 config.json，至少修改 token
.\start.ps1
```

看到 `我的状态服务已启动` 即可。

也可以直接运行：

```powershell
node server/server.js
```

开机自启：

```powershell
.\install-autostart.ps1
# 取消：.\install-autostart.ps1 -Remove
```

### 第二步：给手机 / 平板安装 APK

APK 位置：

```text
dist\我的状态.apk
```

构建方式：

```powershell
cd android
.\build.ps1
```

安装方式：

```powershell
adb install -r ..\dist\我的状态.apk
```

也可以把 APK 发到手机（微信文件传输 / 数据线 / 网盘）点击安装。

打开 App 后填写：

| 字段 | 手机 | 平板 |
|---|---|---|
| 电脑地址 | `http://192.168.1.100:17890` | 同左 |
| 访问令牌 | `CHANGE_ME_TOKEN` | 同左 |
| 设备 ID | `phone` | `tablet` |
| 设备类型 | 手机 | 平板 |

点 **保存并启动自动上报**，再授权：

1. **使用情况访问**：读取前台 App（不授权也能上报电量）。
2. **通知 / 活动识别 / 蓝牙**：常驻通知、计步、手表连接。
3. 如果系统提示“忽略电池优化”，建议允许。

> 电脑 IP 变了怎么办？在电脑运行 `ipconfig`，找到“以太网 / WLAN”的 IPv4 地址，改 App 里的地址即可。令牌在 `config.json` 的 `token` 字段。

### 第三步：在 DSH 里输入触发词

插件安装为 `@local/my-status`。

默认触发词是 **查hanser**；如果 profile 里改了 `triggerName`，就发送对应的 **查<触发词>**。

```text
查hanser
```

DSH 会调用 `chahanser` 工具，返回推断结果 + 状态卡图片。

---

## 3. 手表数据怎么接

### A. 标准 BLE 心率 / 血氧

App 会尝试连接标准 GATT 心率服务。适合开放标准服务的手表。

> 很多 ColorOS Watch 连接 OPPO 健康后不会广播标准 GATT，这时扫描不到是正常的，继续用 B / C / D。

### B. 自动化广播

MacroDroid、Tasker 或自写脚本可以发送：

```bash
adb shell am broadcast \
  -a com.kayi.mystatus.HEALTH \
  --es token CHANGE_ME_TOKEN \
  --ei hr 72 --ei spo2 98 --ei battery 76
```

收到广播后，App 会更新手表卡片并立即上报。`battery` 可省略。

### C. HTTP 直推

```http
POST http://192.168.1.100:17890/api/report/health
x-xt-token: CHANGE_ME_TOKEN
Content-Type: application/json

{"hr":72,"spo2":98,"battery":76,"source":"OPPO Health"}
```

适合用 Tasker / MacroDroid / 快捷指令读取 OPPO 健康通知后转发。

电脑上也可以手动测试：

```powershell
.\scripts\push-health.ps1 -Hr 72 -Spo2 98 -Battery 76
```

### D. ADB 读取 OPPO 健康

OPPO Watch 4 Pro 在 `dumpsys bluetooth_manager` 里是经典蓝牙 HEADSET/SPP，不对外广播标准 BLE 心率服务。

```powershell
# 手机解锁、USB 调试已授权、OPPO 健康已登录并连着手表
.\scripts\sync-oppo-health.ps1
```

脚本会：

1. 打开 OPPO 健康；
2. 切到“健康”页，读取心率、血氧、步数；
3. 切到“设备”页，读取手表电量和型号；
4. POST 到 `/api/report/health`。

限制：需要手机保持 ADB 连接且解锁；每次同步会短暂切到 OPPO 健康，不是后台无感同步。

### E. 手表端 APK（实验）

OPPO Watch 4 Pro（OWW221，Android 11）可以通过 ADB 安装同一个 APK：

```powershell
adb install -r dist\我的状态.apk
```

手表端只能稳定上报：

- 电量
- 在线状态
- 网络状态
- 步数

心率 / 血氧**不能**由第三方 App 直接读取：即使 `BODY_SENSORS` 显示已授权，SensorService 仍会拒绝。OPPO 的 `HealthKitProvider` 有签名白名单，第三方签名不在表里，`READ_RECORDS` 会返回 `authorized failed`。

因此推荐混合方案：

```text
手表 APK  → 电量 / 在线 / 网络 / 步数
手机 ADB  → 心率 / 血氧 / 步数
```

---

## 4. DSH 插件

插件目录：

```text
plugin/
```

- 工具名：`chahanser`
- 触发：系统提示词里的 `<hanser-status>` 段
- 输出：推断摘要 + 已保存为 DSH attachment 的 PNG

插件配置在 `plugin/cordis.patch.yml`：

```yaml
serverUrl: http://127.0.0.1:17890
token: CHANGE_ME_TOKEN
autoStart: true
triggerName: hanser
serverScript: C:/path/to/my-status/server/server.js
```

- `autoStart: true`：DSH 发现服务没启动时自动拉起 Node。
- 云端部署建议 `autoStart: false`，服务由 Docker / Caddy 管理。
- `triggerName` 控制触发词，默认 `hanser`。

重新安装插件：

```text
plugin_manager install_bundle
target: C:\path\to\my-status\plugin
```

修改插件代码后，重载插件或重启 DSH。

---

## 5. 电脑端状态

每次生成状态卡时，`scripts/collect-pc.ps1` 会读取：

- 前台窗口标题 / 进程名（VS Code、Edge、游戏、Office…）
- 键鼠空闲秒数
- 电池电量 / 充电状态
- CPU、内存、开机时长、网卡、本机 IP
- 是否锁屏

如果前台是 DSH，会推断为“和 AI 写代码”；如果是浏览器视频页，会推断为“看视频”。

云端模式：

```json
"localPc": false
```

电脑状态由 `scripts/pc-agent.ps1` 每分钟上报到云端。不要在云端把 `localPc` 设为 `true`，否则服务器会把自己的虚拟机当成你的电脑。

---

## 6. 日程

`config.json` 的 `schedule` 是数组：

```json
[
  {
    "day": 1,
    "start": "10:00",
    "end": "11:00",
    "title": "程序设计导论",
    "type": "答疑课",
    "location": "教学楼 A101"
  },
  {
    "days": [2, 4],
    "start": "14:00",
    "end": "15:00",
    "title": "团队项目",
    "type": "实验课",
    "location": "实验楼 302",
    "weeks": [1, 19]
  }
]
```

- `day`：1=周一 … 7=周日；也可以写 `days: [1,3,5]`。
- `weeks`：`[开始周, 结束周]`，需要配合 `config.semesterStart`（第 1 周周一）。
- 当前时间落在某节课内，会优先推断为“上课”。
- 没有日程时显示“今天没有排课或日程 / 自由时间”。
- 跨午夜暂不支持。

修改 `config.json` 后重启服务。

---

## 7. 命令与 API

```powershell
# 启动 / 检查服务
.\start.ps1

# 手动生成一张（真实数据）
node scripts/snapshot.js

# 生成演示卡（会写入演示设备数据，正式使用前建议 /api/clear）
node scripts/demo.js

# 只启动服务
node server/server.js
```

开发调试接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 健康检查 |
| GET | `/api/status?token=` | 聚合后的 JSON |
| POST | `/api/report?token=` | 手机 / 平板上报 |
| POST | `/api/report/health?token=` | 手表 / 自动化上报 |
| POST | `/api/snapshot?token=` | 生成 PNG |
| GET | `/status.png?token=` | 最新 PNG |
| POST | `/api/demo?token=` | 写入演示设备 |
| POST | `/api/clear?token=` | 清空设备数据 |

> 本机 `127.0.0.1` 访问免令牌；局域网其他设备必须带 `token`。

---

## 8. 隐私与安全

- 服务默认只监听局域网，所有上报需要 token。
- `data/state.json` 保存设备状态与最近 24 小时健康采样。
- 图片生成在本机 Chromium 完成，不经过第三方服务。
- 天气使用 Open-Meteo；IP 属地使用 ip-api / ipinfo。
- token 会出现在 APK 默认值、插件配置和二维码链接里，不要公开转发。
- 换 token：修改 `config.json`，同步改 App 和插件，重启服务并重新安装插件。

---

## 9. 目录结构

```text
my-status/
├─ server/
│  ├─ server.js              HTTP 服务 + 路由
│  ├─ lib/
│  │  ├─ store.js            设备 / 健康数据存储
│  │  ├─ pc.js               Windows 状态采集
│  │  ├─ infer.js            活动推断规则
│  │  ├─ classify.js         前台应用分类
│  │  ├─ weather.js          IP 属地 + 天气
│  │  ├─ render.js           HTML 状态卡 + 截图
│  │  └─ screenshot.js       Chrome CDP 动态高度截图
│  └─ templates/card.css     卡片视觉样式
├─ scripts/
│  ├─ collect-pc.ps1         Windows 采集脚本
│  ├─ demo.js                演示数据 + 出图
│  └─ snapshot.js            真实数据出图
├─ android/                  Android 设备端源码 + build.ps1
├─ plugin/                   DSH 插件（chahanser 工具）
├─ docs/                     腾讯云 / 微信客服文档
├─ dist/
│  ├─ 我的状态.apk           手机 / 平板安装包
│  └─ status.png             最新状态卡
├─ config.json               端口、令牌、日程、时区
└─ start.ps1                 启动服务
```

---

## 10. 已知限制

- Windows 端已在当前环境验证；Android APK 已编译、签名并在手机上测试，部分厂商 ROM 仍需实测。
- OPPO Watch 是否能直连标准 BLE 心率服务，取决于固件是否开放 GATT。
- Android 后台常驻受厂商省电策略影响；建议允许自启动、后台运行、关闭电池优化。
- 平板需要单独安装 APK 并把设备 ID 改为 `tablet`，否则会和手机互相覆盖。
- 图片里的位置是 IP 属地（城市级），不是 GPS 精确定位。
- 日程需要手动写进 `config.json`；没有接学校课表系统。

---

## 11. 别人使用时可能遇到的 Bug 与解决

### 11.1 服务启动失败

| 现象 | 原因 | 解决 |
|---|---|---|
| `EADDRINUSE` | 17890 被占用 | 改 `config.json` 的 `port`，同时改 App / PC Agent / 插件地址 |
| 双击 `start.ps1` 一闪而过 | PowerShell 执行策略 | 用 `powershell -ExecutionPolicy Bypass -File start.ps1` |
| `node` 不是内部命令 | 未装 Node 或 PATH 未生效 | 安装 Node.js 22+，重开终端 |
| 启动后立刻退出 | `config.json` JSON 写错 | 用 JSON 校验器检查；恢复备份 |

### 11.2 页面 401 / 403

- 局域网访问必须带 `?token=`，不能只打开 `http://电脑IP:17890`。
- 改过 `config.json` 的 `token` 后，手机、平板、PC Agent、DSH 插件都要同步改。
- 反向代理如果改写了 `Authorization` 或查询串，令牌会丢失。
- 不要把 `token` 放在公开网页、截图或 GitHub 仓库里。

### 11.3 手机 / 平板显示“未连接”或前台应用不对

- App 里地址必须是完整地址，例如 `http://192.168.1.100:17890`，不能只填 IP。
- 手机和电脑要在同一 Wi-Fi；电脑防火墙要放行 17890。
- 必须授予“使用情况访问”，否则只能看电量，前台应用会显示“系统桌面”或旧应用。
- Android 11+ 需要应用可见性；本项目已加 `<queries>`。如果自行改包，注意不要删掉。
- vivo / OPPO / 小米的省电策略会杀后台：允许自启动、后台运行、关闭电池优化。
- 手机和平板必须使用不同的设备 ID（`phone` / `tablet`），否则会互相覆盖。
- 旧版 Android 包名是 `com.kayi.xiaotianstatus`，新版是 `com.kayi.mystatus`，不能覆盖安装；需要卸载旧版再装新版，旧数据会丢失。

### 11.4 手表没有数据

- 手表没有独立公网时，需要手机蓝牙网络代理或 Wi-Fi；否则上报会一直失败。
- OPPO Watch 的 `BODY_SENSORS` 可能被固件限制，第三方 App 读不到心率/血氧；这种情况只能走 OPPO 健康 ADB 桥。
- 手表 App 没有服务器地址输入框，地址是编译进 APK 的；换服务器要重新构建/安装。
- 手表只保证上报电量、步数、在线状态；HR/SpO2 需要额外桥接。
- 手表时间、时区不正确会导致“今天”的步数和日程错位。

### 11.5 电脑一直显示“在电脑旁”或前台是 PowerShell

- PC Agent 以计划任务运行时可能短暂抢焦点；使用项目里的隐藏 VBS 启动器。
- 不要以 SYSTEM 运行 Edge/Chrome 截图；Windows 上截图任务要用 Administrator 的 S4U/交互任务。
- 云端部署时 `localPc` 必须是 `false`，否则服务器会把自己的虚拟机当成你的电脑。
- PC Agent 的 `Server` / `Token` 必须和当前服务一致。
- 电脑休眠、锁屏、断网时，在线状态会延迟。

### 11.6 状态卡空白、中文方框、截图失败

- 确认 Chrome / Edge 路径正确；Linux 需要 `chromium` 和 `fonts-noto-cjk`。
- Windows Server 默认可能没有微软雅黑，安装 Noto Sans CJK 或确认 SimSun 可用。
- Docker 里 Chromium 需要 `--no-sandbox`，并保证字体包已安装。
- Chrome 用户数据目录必须可写；不要放到只读目录。
- 截图超时通常是首次启动 Chrome 太慢，重试一次；持续失败看 `data/server.log`。

### 11.7 日程不显示 / 周次不对

- `day` 是 1=周一 … 7=周日；不要写成 0。
- 时间必须是 `HH:MM`，且 `end` 要大于 `start`；跨午夜暂不支持。
- 周次需要 `semesterStart`（第 1 周周一）和每条日程的 `weeks`，否则会按每周重复。
- 日程最多显示 3 条，更多会显示“还有 N 项安排”。
- 时区默认 `Asia/Shanghai`；设备时区不同会错位。

### 11.8 IP 属地 / 天气不对

- 默认取云服务器 IP；云端部署后应使用手机上报 IP 定位。
- 手机走 VPN / 代理时，IP 属地会变成代理所在地。
- 手机长时间不上报时，会保留最后一次位置；这不是实时 GPS。
- ip-api / ipinfo 有限流；失败时会退回缓存或默认位置。

### 11.9 云端 / HTTPS 问题

- 云端 `config.json` 必须 `localPc: false`，电脑状态由 PC Agent 上报。
- 腾讯云安全组要放行 80/443；Windows 防火墙也要放行。
- Caddy 的 `DOMAIN` 未设置时只会走 HTTP；域名需要 DNS 和备案（大陆服务器）。
- 只开 HTTP 时不要公开发布令牌；HTTP 下数据不加密。
- Caddy 反代要保留 `X-Forwarded-For`，否则手机 IP 定位会拿到 127.0.0.1。

### 11.10 DSH 插件问题

- 新版插件 ID 是 `@local/my-status`，不是旧的 `@local/xiaotian-status`；旧 profile 要重装插件。
- `serverUrl` / `token` 是占位符，必须改成自己的地址和令牌。
- 改 `triggerName` 后要重载插件或重启 DSH；默认仍是 `查hanser`。
- 服务器 headless 缺 `DEEPSEEK_API_KEY` 会报 `MISSING_CREDENTIAL`。
- Windows PowerShell 5.1 读取无 BOM 的 UTF-8 脚本会把中文变乱码；包含中文的脚本保存为 UTF-8 BOM。
- 插件现在从云端下载 `/status.png`，不再假设图片在本机路径。

### 11.11 升级 / 数据

- `config.json`、`data/`、`dist/status.png` 不应提交到 GitHub。
- 升级前备份 `data/state.json` 和 `data/health`。
- 卸载 Android App 会清掉 SharedPreferences（服务器地址、令牌、设备 ID）。
- 换包名（`com.kayi.xiaotianstatus` → `com.kayi.mystatus`）不能热升级，需要卸载重装。
- 换令牌后旧 APK / 旧插件会 403，需要同步更新。

### 11.12 安全底线

- 不要把 17890 直接暴露公网；用 Caddy / 反向代理和 HTTPS。
- 不要把带 token 的链接发到公开群；token 在 URL 中会进入浏览器历史和日志。
- 不要提交 `.env`、`config.json`、APK、签名文件或真实服务器 IP。
- 生产环境建议给 `/api/*` 加访问频率限制，并定期轮换 token。
