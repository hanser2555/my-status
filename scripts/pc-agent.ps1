param(
    [string]$Server = '',
    [string]$Token = '',
    [string]$Name = '电脑'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$configPath = Join-Path $root 'config.json'
$config = if (Test-Path $configPath) {
    Get-Content $configPath -Raw | ConvertFrom-Json
} else { $null }
if (-not $Server) {
    $Server = if ($config -and $config.cloudServer) { $config.cloudServer } else { "http://127.0.0.1:$($config.port)" }
}
if (-not $Token) {
    $Token = if ($config -and $config.cloudToken) { $config.cloudToken } else { $config.token }
}
$Server = $Server.TrimEnd('/')

$status = & (Join-Path $PSScriptRoot 'collect-pc.ps1') | ConvertFrom-Json
if (-not $status -or $status.ok -ne $true) { throw '电脑状态采集失败' }

$status | Add-Member -NotePropertyName id -NotePropertyValue 'pc' -Force
$status | Add-Member -NotePropertyName kind -NotePropertyValue 'pc' -Force
$status | Add-Member -NotePropertyName name -NotePropertyValue $Name -Force
$status | Add-Member -NotePropertyName online -NotePropertyValue $true -Force
$status | Add-Member -NotePropertyName source -NotePropertyValue 'Windows agent' -Force

$json = $status | ConvertTo-Json -Depth 8 -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
try {
    $result = Invoke-RestMethod -Method Post -Uri "$Server/api/report" `
        -Headers @{ 'x-xt-token' = $Token } -ContentType 'application/json; charset=utf-8' `
        -Body $bytes -TimeoutSec 20
    Write-Host "已上报电脑状态：$($result.inference.label)"
} catch {
    Write-Host "上报失败：$($_.Exception.Message)"
    exit 1
}
