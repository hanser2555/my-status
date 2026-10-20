param(
    [string]$Server = '',
    [string]$Token = '',
    [string]$Name = '电脑',
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$taskName = 'MyStatusPcAgent'
$launcher = Join-Path $PSScriptRoot 'scripts\pc-agent-hidden.vbs'
$configPath = Join-Path $PSScriptRoot 'config.json'

if ($Remove) {
    schtasks /Delete /TN $taskName /F 2>$null | Out-Null
    Write-Host "已移除计划任务 $taskName"
    exit 0
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
if ($Server) { $config | Add-Member -NotePropertyName cloudServer -NotePropertyValue $Server -Force }
if ($Token) { $config | Add-Member -NotePropertyName cloudToken -NotePropertyValue $Token -Force }
$config | Add-Member -NotePropertyName cloudName -NotePropertyValue $Name -Force
$config | ConvertTo-Json -Depth 8 | Set-Content $configPath -Encoding utf8

if (-not (Test-Path $launcher)) { throw "找不到隐藏启动器：$launcher" }
$command = "`"$env:SystemRoot\System32\wscript.exe`" `"$launcher`""
schtasks /Delete /TN $taskName /F 2>$null | Out-Null
schtasks /Create /SC MINUTE /MO 1 /TN $taskName /TR $command /RL LIMITED /F
if ($LASTEXITCODE -ne 0) { throw '创建计划任务失败' }
Write-Host "已创建计划任务：$taskName（每分钟上报一次）"
Write-Host "云地址：$($config.cloudServer)"
