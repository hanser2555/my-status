param(
    [int]$Hr = 0,
    [int]$Spo2 = 0,
    [int]$Battery = -1,
    [string]$Source = 'OPPO Watch',
    [string]$Server = '',
    [string]$Token = ''
)

$ErrorActionPreference = 'Stop'
if ($Hr -le 0 -and $Spo2 -le 0) {
    throw '至少提供 -Hr 或 -Spo2，例如：.\push-health.ps1 -Hr 72 -Spo2 98 -Battery 76'
}

$root = Split-Path $PSScriptRoot -Parent
$config = Get-Content (Join-Path $root 'config.json') -Raw | ConvertFrom-Json
if (-not $Server) { $Server = "http://127.0.0.1:$($config.port)" }
if (-not $Token) { $Token = $config.token }

$body = @{ source = $Source }
if ($Hr -gt 0) { $body.hr = $Hr }
if ($Spo2 -gt 0) { $body.spo2 = $Spo2 }
if ($Battery -ge 0) { $body.battery = $Battery }

$json = $body | ConvertTo-Json -Compress
Write-Host "POST $Server/api/report/health"
Write-Host $json
$result = Invoke-RestMethod -Method Post -Uri "$Server/api/report/health" `
    -Headers @{ 'x-xt-token' = $Token } -ContentType 'application/json' -Body $json
$result | ConvertTo-Json -Depth 5
