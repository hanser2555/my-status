$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$configPath = Join-Path $root 'config.json'
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$port = if ($config.port) { [int]$config.port } else { 17890 }
$logDir = Join-Path $root 'data'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Test-Server {
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/healthz" -TimeoutSec 2
        return $r.ok -eq $true
    } catch {
        return $false
    }
}

if (Test-Server) {
    Write-Host "我的状态服务已经在运行：http://127.0.0.1:$port"
    exit 0
}

$nodeCandidates = @()
if ($env:NODE_EXE) { $nodeCandidates += $env:NODE_EXE }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodeCandidates += $nodeCommand.Source }
$nodeCandidates += @(
    'C:\nvm4w\nodejs\node.exe',
    'C:\Program Files\nodejs\node.exe',
    'C:\Program Files (x86)\nodejs\node.exe'
)
$node = $nodeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $node) {
    Write-Host "找不到 Node.js。请安装 Node.js 或把 node.exe 路径写入环境变量 NODE_EXE。"
    exit 1
}

$out = Join-Path $logDir 'server.log'
$err = Join-Path $logDir 'server.err.log'
$process = Start-Process -FilePath $node -ArgumentList 'server/server.js' `
    -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err -PassThru

$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    if (Test-Server) {
        Write-Host "我的状态服务已启动（PID $($process.Id)）"
        Write-Host "本机：http://127.0.0.1:$port"
        Write-Host "令牌：$($config.token)"
        exit 0
    }
}

Write-Host "服务启动超时，请查看日志：$err"
exit 1
