param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$startup = [Environment]::GetFolderPath('Startup')
$link = Join-Path $startup 'XiaotianStatus.lnk'

if ($Remove) {
    if (Test-Path $link) { Remove-Item $link -Force }
    Write-Host "已移除开机启动快捷方式：$link"
    exit 0
}

$launcher = Join-Path $root 'launch-hidden.vbs'
if (-not (Test-Path $launcher)) { throw "找不到隐藏启动器：$launcher" }
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
if (-not (Test-Path $wscript)) { throw "找不到 wscript.exe" }

if (Test-Path $link) { Remove-Item $link -Force }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $wscript
$shortcut.Arguments = "`"$launcher`""
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Description = '我的状态服务（本机多设备状态汇总）'
$shortcut.Save()

if (-not (Test-Path $link)) { throw "创建快捷方式失败：$link" }
Write-Host "已设置开机自启动（当前用户登录后自动运行，无窗口）"
Write-Host "快捷方式：$link"
Write-Host "启动器：$launcher"
