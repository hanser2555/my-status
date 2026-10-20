const PROCESS_RULES = [
  { re: /deepseek harness/i, category: 'agent', label: 'DeepSeek Harness', fixedLabel: true },
  { re: /^(code|cursor|devenv|idea64|pycharm64|webstorm64|goland64|clion64|rider64|sublime_text|notepad\+\+|windowsterminal|wt|powershell|pwsh|cmd|node|python|pythonw|java|javaw|vim|neovide)$/i, category: 'code', label: '代码编辑器' },
  { re: /^(msedge|chrome|firefox|brave|opera|vivaldi|arc|safari)$/i, category: 'browser', label: '浏览器' },
  { re: /^(steam|epicgameslauncher|battle\.net|riotclientservices|wegame|genshinimpact|starrail|yuanshen|leagueclient|valorant|cs2|overwatch|minecraft|javaw)$/i, category: 'game', label: '游戏' },
  { re: /^(winword|excel|powerpnt|wps|et|wpp|acrobat|acrord32|foxitreader|notion|obsidian|typora)$/i, category: 'office', label: '文档' },
  { re: /^(potplayermini64|potplayermini|vlc|mpv|mpc-hc64|spotify|cloudmusic|qqmusic|foobar2000|aimp)$/i, category: 'media', label: '影音' },
  { re: /^(wechat|weixin|qq|telegram|discord|feishu|lark|dingtalk|slack|whatsapp|teams)$/i, category: 'social', label: '聊天' },
  { re: /^(photoshop|illustrator|figma|blender|aftereffects|premiere|audition|krita)$/i, category: 'design', label: '创作' },
  { re: /^(explorer|dolphin|finder)$/i, category: 'files', label: '文件管理' },
];

const TITLE_RULES = [
  { re: /(bilibili|哔哩哔哩|youtube|netflix|爱奇艺|腾讯视频|优酷|芒果tv|直播|视频|番剧|电影)/i, category: 'video' },
  { re: /(github|gitlab|stack overflow|csdn|掘金|segmentfault|leetcode|力扣|文档|api|developer|mdn)/i, category: 'code' },
  { re: /(王者荣耀|原神|崩坏|星穹铁道|英雄联盟|无畏契约|cs2|overwatch|minecraft|steam)/i, category: 'game' },
  { re: /(微信|qq|telegram|discord|飞书|钉钉|slack|聊天)/i, category: 'social' },
  { re: /(word|excel|powerpoint|ppt|wps|文档|表格|演示)/i, category: 'office' },
  { re: /(网易云音乐|qq音乐|spotify|音乐|播放器)/i, category: 'music' },
];

const PACKAGE_RULES = [
  { re: /com\.tencent\.mm|com\.tencent\.mobileqq|com\.tencent\.wework|com\.ss\.android\.lark|com\.alibaba\.android\.rimet/i, category: 'social', label: '聊天' },
  { re: /tv\.danmaku\.bili|com\.ss\.android\.ugc\.aweme|com\.qiyi\.vip|com\.tencent\.qqlive|com\.youku\.hd/i, category: 'video', label: '视频' },
  { re: /com\.netease\.cloudmusic|com\.tencent\.qqmusic|com\.spotify\.music/i, category: 'music', label: '音乐' },
  { re: /com\.tencent\.tmgp|com\.miHoYo|com\.netease\.gph/i, category: 'game', label: '游戏' },
  { re: /com\.xingin\.xhs|com\.zhihu\.android|com\.sina\.weibo/i, category: 'social', label: '社交' },
  { re: /com\.android\.chrome|com\.microsoft\.emmx|org\.mozilla\.firefox/i, category: 'browser', label: '浏览器' },
  { re: /com\.coloros\.|com\.oppo\.|com\.heytap\./i, category: 'system', label: '系统' },
];

const APP_NAMES = new Map(Object.entries({
  'com.tencent.mm': '微信',
  'com.tencent.mobileqq': 'QQ',
  'com.tencent.wework': '企业微信',
  'com.ss.android.lark': '飞书',
  'com.alibaba.android.rimet': '钉钉',
  'com.netease.cloudmusic': '网易云音乐',
  'com.tencent.qqmusic': 'QQ音乐',
  'tv.danmaku.bili': '哔哩哔哩',
  'com.ss.android.ugc.aweme': '抖音',
  'com.xingin.xhs': '小红书',
  'com.zhihu.android': '知乎',
  'com.sina.weibo': '微博',
  'com.tencent.tmgp.sgame': '王者荣耀',
  'com.miHoYo.Yuanshen': '原神',
  'com.miHoYo.hkrpg': '崩坏：星穹铁道',
  'com.android.chrome': 'Chrome',
  'com.microsoft.emmx': 'Edge',
  'com.tencent.qqlive': '腾讯视频',
  'com.qiyi.vip': '爱奇艺',
  'com.youku.hd': '优酷',
  'com.coloros.gallery': '相册',
  'com.oplus.camera': '相机',
  'com.oplus.notes': '便签',
  'com.android.settings': '设置',
}));

const PROCESS_NAMES = new Map(Object.entries({
  code: 'VS Code',
  cursor: 'Cursor',
  devenv: 'Visual Studio',
  idea64: 'IntelliJ IDEA',
  pycharm64: 'PyCharm',
  webstorm64: 'WebStorm',
  goland64: 'GoLand',
  clion64: 'CLion',
  rider64: 'Rider',
  sublime_text: 'Sublime Text',
  windowsterminal: 'Windows Terminal',
  wt: 'Windows Terminal',
  pwsh: 'PowerShell',
  powershell: 'PowerShell',
  cmd: '命令提示符',
  node: 'Node.js',
  python: 'Python',
  msedge: 'Edge',
  chrome: 'Chrome',
  firefox: 'Firefox',
  brave: 'Brave',
  explorer: '文件资源管理器',
  winword: 'Word',
  excel: 'Excel',
  powerpnt: 'PowerPoint',
  wps: 'WPS',
  spotify: 'Spotify',
  cloudmusic: '网易云音乐',
  qqmusic: 'QQ音乐',
  potplayermini64: 'PotPlayer',
  vlc: 'VLC',
  steam: 'Steam',
  wechat: '微信',
  weixin: '微信',
  qq: 'QQ',
  telegram: 'Telegram',
  discord: 'Discord',
  feishu: '飞书',
  dingtalk: '钉钉',
}));

export function friendlyProcess(processName) {
  const key = String(processName ?? '').toLowerCase();
  return PROCESS_NAMES.get(key) ?? processName ?? '';
}

export function friendlyPackage(packageName) {
  const key = String(packageName ?? '');
  for (const [pkg, name] of APP_NAMES) {
    if (key === pkg) return name;
  }
  return '';
}

export function classifyForeground(input = {}) {
  const process = String(input.process ?? input.package ?? '').toLowerCase();
  const title = String(input.title ?? '');
  const app = String(input.app ?? '');
  const packageName = String(input.package ?? '');

  for (const rule of TITLE_RULES) {
    if (rule.re.test(title)) {
      return {
        category: rule.category,
        label: app || title.slice(0, 28) || friendlyProcess(process),
        process,
        title,
      };
    }
  }

  for (const rule of PROCESS_RULES) {
    if (rule.re.test(process)) {
      return {
        category: rule.category,
        label: rule.fixedLabel ? rule.label : (title ? title.slice(0, 42) : (friendlyProcess(process) || rule.label)),
        process,
        title,
      };
    }
  }

  for (const rule of PACKAGE_RULES) {
    if (rule.re.test(packageName)) {
      return {
        category: rule.category,
        label: friendlyPackage(packageName) || rule.label,
        process: packageName,
        title,
      };
    }
  }

  return {
    category: 'other',
    label: app || friendlyPackage(packageName) || friendlyProcess(process) || title.slice(0, 32) || '未知应用',
    process: process || packageName,
    title,
  };
}

export function appLabelForDevice(foreground) {
  if (!foreground) return '';
  const packageName = foreground.package ?? foreground.process ?? '';
  return foreground.app
    || friendlyPackage(packageName)
    || foreground.label
    || friendlyProcess(packageName)
    || packageName;
}

export function categoryLabel(category) {
  return {
    agent: 'AI 助手',
    code: '编程',
    browser: '浏览网页',
    video: '看视频',
    game: '游戏',
    office: '办公',
    media: '影音',
    music: '听音乐',
    social: '聊天',
    design: '创作',
    files: '文件',
    system: '系统',
    other: '使用中',
  }[category] ?? '使用中';
}
