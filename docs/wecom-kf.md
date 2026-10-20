# 接入企业微信「微信客服」

目标：个人微信用户添加你的微信客服账号后，发送 **查hanser**，就能收到状态摘要和状态卡图片。

> 本方案使用企业微信官方的「微信客服」API，不是个人微信 Hook，不会因为协议登录被封号。

---

## 1. 创建微信客服账号

1. 登录 [企业微信管理后台](https://work.weixin.qq.com/)
2. 进入 **微信客服**
3. 创建一个客服账号，例如：`hanser 状态`
4. 记下客服账号 ID：`open_kfid`（通常以 `kf` 开头）
5. 在 **开发配置** 里获取：
   - 企业 ID：`corpId`
   - 微信客服 Secret：`secret`
6. 在 **开发配置 → 接收消息服务器配置** 里设置：
   - URL：`http://YOUR_SERVER_IP/wecom/kf`（先用 HTTP 测试）
   - Token：自己生成一个随机串
   - EncodingAESKey：随机 43 位

正式使用建议换成 HTTPS 域名：

```text
https://你的域名/wecom/kf
```

---

## 2. 填写云服务器配置

SSH 登录服务器：

```bash
ssh ubuntu@YOUR_SERVER_IP
nano ~/my-status/config.json
```

找到 `wecomKf`，改成：

```json
"wecomKf": {
  "enabled": true,
  "corpId": "ww你的企业ID",
  "secret": "微信客服Secret",
  "token": "你自己设置的Token",
  "encodingAESKey": "43位EncodingAESKey",
  "openKfId": "kf你的客服账号ID",
  "allowUsers": []
}
```

重启：

```bash
cd ~/my-status
sudo docker compose up -d app
sudo docker compose logs -f app
```

---

## 3. 保存回调并验证

在企业微信后台点“保存”，企业微信会向：

```text
http://YOUR_SERVER_IP/wecom/kf
```

发一个 GET 验证请求。

服务器返回解密后的 `echostr` 就算通过。日志里会看到：

```text
[wecom] ...
```

如果失败：

- URL 是否公网可访问
- Token / EncodingAESKey 是否和配置一致
- 云服务器 80 端口是否放行
- 企业微信后台是否要求 HTTPS（那就需要域名证书）

---

## 4. 添加客服并测试

1. 在微信客服后台生成客服账号二维码
2. 用个人微信扫码添加
3. 发送：

```text
查hanser
```

流程：

```text
微信 → 微信客服 → /wecom/kf 回调
                         │
                         ├─ 生成状态卡
                         ├─ 发送文字摘要
                         └─ 上传图片并发送图片消息
```

第一次收到消息后，日志里会打印：

```text
[wecom] ignored user ...
```

或者客服消息里能看到你的 `external_userid`。把它加进：

```json
"allowUsers": ["你的external_userid"]
```

这样只有你能触发，别人发消息不会回复。

---

## 5. 当前限制

- 微信客服回调最好用 HTTPS；当前先用 HTTP 测试，正式使用建议域名 + 证书。
- 微信客服发送消息受会话窗口限制：用户主动发消息后的一段时间内才能回复。
- 图片需要先上传到企业微信素材接口，再发送 `media_id`。
- 状态卡里的心率/血氧仍依赖 OPPO 健康 ADB 桥或手机自动化，微信客服只负责收发消息。

---

## 6. 本地验证接口

不经过微信，也可以直接验证签名和加解密：

```powershell
# 只测试 GET 验证和 POST 解密，不会真的发微信消息
node --input-type=module
```

核心代码在：

```text
server/lib/wecom.js
server/server.js  →  /wecom/kf
```

已通过本地加解密往返测试和 GET/POST 回调测试。
