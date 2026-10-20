$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = $PSScriptRoot
$app = Join-Path $root 'app'
$build = Join-Path $root 'build'
$dist = Join-Path $root '..\dist'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $root '..\tools\android-sdk' }
$javaHome = if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) { $env:JAVA_HOME } else { 'C:\Program Files\Java\jdk-21.0.10' }

$androidJar = Join-Path $sdk 'platforms\android-34\android.jar'
$buildTools = Join-Path $sdk 'build-tools\35.0.0'
$aapt2 = Join-Path $buildTools 'aapt2.exe'
$d8 = Join-Path $buildTools 'd8.bat'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
$javac = Join-Path $javaHome 'bin\javac.exe'
$keytool = Join-Path $javaHome 'bin\keytool.exe'

foreach ($tool in @($aapt2, $d8, $zipalign, $apksigner, $javac, $keytool, $androidJar)) {
    if (-not (Test-Path $tool)) { throw "缺少构建工具：$tool" }
}

New-Item -ItemType Directory -Force $dist, $build | Out-Null
Remove-Item (Join-Path $build '*') -Recurse -Force -ErrorAction SilentlyContinue

$compiled = Join-Path $build 'compiled.zip'
$baseApk = Join-Path $build 'base.apk'
$aligned = Join-Path $build 'aligned.apk'
$gen = Join-Path $build 'gen'
$classes = Join-Path $build 'classes'
$dex = Join-Path $build 'dex'
New-Item -ItemType Directory -Force $gen, $classes, $dex | Out-Null

Write-Host '1/7 aapt2 compile resources'
& $aapt2 compile --dir (Join-Path $app 'res') -o $compiled
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

Write-Host '2/7 aapt2 link'
& $aapt2 link -o $baseApk -I $androidJar --manifest (Join-Path $app 'AndroidManifest.xml') `
    -R $compiled --java $gen --min-sdk-version 26 --target-sdk-version 30 `
    --version-code 2 --version-name '1.1' --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

Write-Host '3/7 javac'
$sources = @(Get-ChildItem (Join-Path $app 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$sources += @(Get-ChildItem $gen -Recurse -Filter *.java | ForEach-Object { $_.FullName })
& $javac -encoding UTF-8 --release 8 -g:none -classpath $androidJar -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'javac failed' }

Write-Host '4/7 d8 dex'
$classFiles = @(Get-ChildItem $classes -Recurse -Filter *.class | ForEach-Object { $_.FullName })
& $d8 --release --lib $androidJar --min-api 26 --output $dex $classFiles
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

Write-Host '5/7 package classes.dex'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($baseApk, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    $entry = $zip.GetEntry('classes.dex')
    if ($entry) { $entry.Delete() }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, (Join-Path $dex 'classes.dex'), 'classes.dex') | Out-Null
} finally {
    $zip.Dispose()
}

Write-Host '6/7 zipalign'
& $zipalign -f 4 $baseApk $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

Write-Host '7/7 sign'
$keystore = Join-Path $root 'debug.keystore'
if (-not (Test-Path $keystore)) {
    & $keytool -genkeypair -v -keystore $keystore -storepass android -alias androiddebugkey `
        -keypass android -keyalg RSA -keysize 2048 -validity 10000 `
        -dname 'CN=Android Debug,O=Android,C=US'
    if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}
$outApk = Join-Path $dist '我的状态.apk'
if (Test-Path $outApk) { Remove-Item $outApk -Force }
& $apksigner sign --ks $keystore --ks-pass pass:android --key-pass pass:android --out $outApk $aligned
if ($LASTEXITCODE -ne 0) { throw 'apksigner sign failed' }
& $apksigner verify --verbose $outApk
if ($LASTEXITCODE -ne 0) { throw 'apksigner verify failed' }

$file = Get-Item $outApk
Write-Host ("APK: {0} ({1:N1} MB)" -f $file.FullName, ($file.Length / 1MB))

