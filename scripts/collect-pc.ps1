$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class XtWin32
{
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [DllImport("kernel32.dll")]
    public static extern ulong GetTickCount64();
}
'@

function Get-IdleSeconds {
    $info = New-Object XtWin32+LASTINPUTINFO
    $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
    if ([XtWin32]::GetLastInputInfo([ref]$info)) {
        $tick = [XtWin32]::GetTickCount64()
        return [math]::Floor(($tick - [uint64]$info.dwTime) / 1000.0)
    }
    return 0
}

$now = Get-Date
$active = [ordered]@{
    title = ''
    process = ''
    app = ''
    pid = 0
}
$hwnd = [XtWin32]::GetForegroundWindow()
if ($hwnd -ne [IntPtr]::Zero) {
    $sb = New-Object System.Text.StringBuilder 1024
    [void][XtWin32]::GetWindowText($hwnd, $sb, $sb.Capacity)
    $active.title = $sb.ToString()
    [uint32]$procId = 0
    [void][XtWin32]::GetWindowThreadProcessId($hwnd, [ref]$procId)
    $active.pid = [int]$procId
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc) {
        $active.process = $proc.ProcessName
        $active.app = $proc.Description
        if ([string]::IsNullOrWhiteSpace($active.app)) { $active.app = $proc.ProcessName }
    }
}

$battery = $null
$batteryObj = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
if ($batteryObj) {
    $battery = [ordered]@{
        percent = [int]$batteryObj.EstimatedChargeRemaining
        charging = ($batteryObj.BatteryStatus -eq 2 -or $batteryObj.BatteryStatus -eq 6 -or $batteryObj.BatteryStatus -eq 7)
        present = $true
    }
} else {
    $battery = [ordered]@{ percent = 100; charging = $true; present = $false }
}

$os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
$cpuObj = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
$excludedAdapter = 'VPN|Radmin|Tailscale|ZeroTier|vEthernet|Loopback|WSL|Hyper-V|VMware|VirtualBox'
$net = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPv4DefaultGateway -ne $null -and
        $_.NetAdapter.Status -eq 'Up' -and
        $_.InterfaceAlias -notmatch $excludedAdapter
    } |
    Select-Object -First 1
if (-not $net) {
    $net = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } |
        Select-Object -First 1
}
$ip = ''
$adapter = ''
if ($net) {
    $ip = ($net.IPv4Address | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
    $adapter = $net.InterfaceAlias
}
$locked = [bool](Get-Process -Name LogonUI -ErrorAction SilentlyContinue)
$uptimeSec = 0
if ($os) { $uptimeSec = [math]::Floor(((Get-Date) - $os.LastBootUpTime).TotalSeconds) }

[ordered]@{
    ok = $true
    hostname = $env:COMPUTERNAME
    user = $env:USERNAME
    os = if ($os) { $os.Caption -replace 'Microsoft ', '' } else { 'Windows' }
    uptimeSec = $uptimeSec
    idleSec = Get-IdleSeconds
    locked = $locked
    active = $active
    battery = $battery
    cpu = if ($cpuObj) { [int]$cpuObj.LoadPercentage } else { $null }
    memory = if ($os) {
        [ordered]@{
            usedPercent = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 0)
            totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
        }
    } else { $null }
    network = [ordered]@{ ip = $ip; adapter = $adapter; connected = [bool]$net }
    timestamp = $now.ToString('o')
} | ConvertTo-Json -Depth 8 -Compress
