$ErrorActionPreference = "Stop"

$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
$env:NODE_ENV = 'production'
$env:GRADLE_OPTS = '-Dorg.gradle.daemon=false -Dkotlin.compiler.execution.strategy=in-process'
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI酒馆 APK 本地构建脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "[1/5] 检查构建环境..." -ForegroundColor Yellow

if (-not (Test-Path $env:ANDROID_HOME)) {
    Write-Error "Android SDK 未找到: $env:ANDROID_HOME"
    exit 1
}
Write-Host "  Android SDK: $env:ANDROID_HOME" -ForegroundColor Green

if (-not (Test-Path $env:JAVA_HOME)) {
    Write-Error "JDK 未找到: $env:JAVA_HOME"
    exit 1
}
Write-Host "  JDK: $env:JAVA_HOME" -ForegroundColor Green

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir
Write-Host "  项目目录: $projectDir" -ForegroundColor Green

Write-Host "[2/5] 生成 JS bundle..." -ForegroundColor Yellow

$bundlePath = "$projectDir\android\app\src\main\assets\index.android.bundle"
$resPath = "$projectDir\android\app\src\main\res"
if (Test-Path $bundlePath) {
    Remove-Item $bundlePath -Force
    Write-Host "  已删除旧 bundle" -ForegroundColor Gray
}

& npx react-native bundle --platform android --dev false --entry-file index.ts --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res --reset-cache 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "JS bundle 生成失败!"
    exit 1
}

if (-not (Test-Path $bundlePath)) {
    Write-Error "Bundle 文件未生成: $bundlePath"
    exit 1
}

$bundleSize = (Get-Item $bundlePath).Length
Write-Host "  Bundle 生成完成 ($([math]::Round($bundleSize / 1KB, 2)) KB)" -ForegroundColor Green

Write-Host "[3/5] 清理旧构建..." -ForegroundColor Yellow
Set-Location "$projectDir\android"
& .\gradlew.bat clean --no-daemon 2>&1 | Out-Null
Write-Host "  清理完成" -ForegroundColor Green

Write-Host "[4/5] 开始构建 Release APK..." -ForegroundColor Yellow

& .\gradlew.bat assembleRelease --no-daemon --console=plain 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Error "构建失败！"
    exit 1
}

Write-Host "[5/5] 查找构建产物..." -ForegroundColor Yellow

$apkPath = "$projectDir\android\app\build\outputs\apk\release\app-release.apk"
$unsignedApkPath = "$projectDir\android\app\build\outputs\apk\release\app-release-unsigned.apk"

if (Test-Path $apkPath) {
    $apkFile = Get-Item $apkPath
    $destPath = "$projectDir\ni-tun-ting-v3.3.0.apk"
    Copy-Item $apkPath $destPath -Force
    Write-Host "构建成功!" -ForegroundColor Green
    Write-Host "APK 文件: $destPath" -ForegroundColor Cyan
    Write-Host "文件大小: $([math]::Round($apkFile.Length / 1MB, 2)) MB" -ForegroundColor Cyan
} elseif (Test-Path $unsignedApkPath) {
    Write-Host "警告: 只找到了未签名的 APK" -ForegroundColor Yellow
    Write-Host "未签名 APK: $unsignedApkPath" -ForegroundColor Cyan
} else {
    Write-Error "未找到 APK 文件"
    exit 1
}

Set-Location $projectDir
Write-Host "Build complete!" -ForegroundColor Green
