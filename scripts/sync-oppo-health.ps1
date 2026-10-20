param(
    [string]$Server = '',
    [string]$Token = '',
    [string]$Serial = '',
    [switch]$NoPost
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$adb = Join-Path $root 'tools\android-sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) {
    $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
    if (-not $adbCommand) { throw '找不到 adb.exe' }
    $adb = $adbCommand.Source
}

$config = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
if (-not $Server) { $Server = "http://127.0.0.1:$($config.port)" }
if (-not $Token) { $Token = $config.token }

function Invoke-Adb {
    param([string[]]$Arguments)
    $prefix = @()
    if ($Serial) { $prefix = @('-s', $Serial) }
    $output = & $adb @prefix @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "adb $($Arguments -join ' ') 失败：$output"
    }
    return $output
}

$devicePrefix = @()
if ($Serial) { $devicePrefix = @('-s', $Serial) }
$devices = (& $adb @devicePrefix devices) | Select-String -Pattern '\sdevice$'
if (-not $devices) { throw '没有已授权的 ADB 设备。请确认 USB 调试已打开并允许本电脑调试。' }

Invoke-Adb @('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP') | Out-Null
Invoke-Adb @('shell', 'wm', 'dismiss-keyguard') | Out-Null
Invoke-Adb @('shell', 'am', 'start', '-n', 'com.heytap.health/.oobe.LaunchActivity') | Out-Null
Start-Sleep -Seconds 4

$sizeText = (Invoke-Adb @('shell', 'wm', 'size')) -join ' '
$sizeMatch = [regex]::Match($sizeText, '(\d+)x(\d+)')
if (-not $sizeMatch.Success) { throw "无法读取屏幕尺寸：$sizeText" }
$screenWidth = [int]$sizeMatch.Groups[1].Value
$screenHeight = [int]$sizeMatch.Groups[2].Value
$centerX = [int]($screenWidth / 2)
$tabY = [int]($screenHeight * 0.95)
$healthTabX = [int]($screenWidth * 0.18)
$deviceTabX = [int]($screenWidth * 0.61)

# OPPO Health 的底部“健康”页签
Invoke-Adb @('shell', 'input', 'tap', "$healthTabX", "$tabY") | Out-Null
Start-Sleep -Seconds 2

# 回到顶部：健康首页的心率、血氧卡片在顶部
for ($i = 0; $i -lt 2; $i++) {
    Invoke-Adb @('shell', 'input', 'swipe', "$centerX", "$([int]($screenHeight * 0.28))",
        "$centerX", "$([int]($screenHeight * 0.84))", '350') | Out-Null
    Start-Sleep -Milliseconds 700
}
Start-Sleep -Seconds 1

Invoke-Adb @('shell', 'uiautomator', 'dump', '/sdcard/xt-health.xml') | Out-Null
$raw = ((Invoke-Adb @('shell', 'cat', '/sdcard/xt-health.xml')) -join "`n")

$hrMatch = [regex]::Match($raw, 'text="心率".*?text="(\d{2,3})".*?text="次/分"', 'Singleline')
$spo2Match = [regex]::Match($raw, 'text="血氧".*?text="(\d{1,3})".*?text="%"', 'Singleline')
$stepsMatch = [regex]::Match($raw, 'text="步数".*?text="(\d+)"', 'Singleline')

$hr = if ($hrMatch.Success) { [int]$hrMatch.Groups[1].Value } else { 0 }
$spo2 = if ($spo2Match.Success) { [int]$spo2Match.Groups[1].Value } else { 0 }
$steps = if ($stepsMatch.Success) { [int]$stepsMatch.Groups[1].Value } else { 0 }

if ($hr -le 0 -and $spo2 -le 0) {
    throw '没有从 OPPO 健康首页读到心率/血氧。请确认手机已解锁、OPPO 健康已登录并连着手表。'
}

# 切到“设备”页读手表电量和型号
$battery = -1
$model = 'OPPO Watch'
Invoke-Adb @('shell', 'input', 'tap', "$deviceTabX", "$tabY") | Out-Null
Start-Sleep -Seconds 2
Invoke-Adb @('shell', 'uiautomator', 'dump', '/sdcard/xt-watch-device.xml') | Out-Null
$deviceRaw = ((Invoke-Adb @('shell', 'cat', '/sdcard/xt-watch-device.xml')) -join "`n")
try {
    [xml]$deviceXml = $deviceRaw
    $batteryNode = $deviceXml.SelectSingleNode('//node[contains(@resource-id,"tv_device_tip_battery")]')
    $modelNode = $deviceXml.SelectSingleNode('//node[contains(@resource-id,"tv_device_tip_device_name")]')
    if ($batteryNode -and $batteryNode.text -match '(\d{1,3})') { $battery = [int]$Matches[1] }
    if ($modelNode -and $modelNode.text) { $model = $modelNode.text }
} catch {
    # 设备页结构变化时保留默认值，不阻断健康数据推送
}

# 回到健康页，方便下一次读取
Invoke-Adb @('shell', 'input', 'tap', "$healthTabX", "$tabY") | Out-Null

$body = @{
    hr = $hr
    spo2 = $spo2
    source = 'OPPO Health / ADB'
    model = $model
}
if ($hr -gt 0) { $body.hr = $hr }
if ($spo2 -gt 0) { $body.spo2 = $spo2 }
if ($steps -gt 0) { $body.stepsToday = $steps }
if ($battery -ge 0) { $body.battery = $battery }

Write-Host "读取到：心率 $hr BPM · 血氧 $spo2% · 步数 $steps"

if (-not $NoPost) {
    $json = $body | ConvertTo-Json -Compress
    $result = Invoke-RestMethod -Method Post -Uri "$Server/api/report/health" `
        -Headers @{ 'x-xt-token' = $Token } -ContentType 'application/json' -Body $json
    Write-Host "已推送：$Server/api/report/health"
    $result | ConvertTo-Json -Depth 5
}
