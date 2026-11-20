Write-Host "Fixing incomplete expo packages..." -ForegroundColor Cyan

$packagesToFix = @(
    "@expo/config@57.0.3",
    "@expo/config-plugins@57.0.3",
    "@expo/config-types@57.0.3",
    "@expo/package-manager@1000.0.0",
    "@expo/prebuild-config@57.0.3",
    "@expo/json-file@11.0.0",
    "@expo/require-utils@57.0.1"
)

$tempDir = Join-Path $PSScriptRoot "temp-expo-fix"
if (Test-Path $tempDir) {
    Remove-Item -Recurse -Force $tempDir
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

Push-Location $tempDir

try {
    foreach ($pkg in $packagesToFix) {
        Write-Host "Downloading $pkg..." -ForegroundColor Yellow
        
        $result = npm pack $pkg 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to download $pkg" -ForegroundColor Red
            continue
        }
        
        $tgzFile = Get-ChildItem -Filter "*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $tgzFile) {
            Write-Host "No tgz file found for $pkg" -ForegroundColor Red
            continue
        }
        
        tar -xzf $tgzFile.FullName
        
        $pkgName = $pkg -replace '@', '' -replace '/', '-' -replace '@.*$', ''
        
        if ($pkg -match '^(@[^/]+/[^@]+)') {
            $fullPkgName = $matches[1]
            $targetPath = Join-Path $PSScriptRoot "node_modules\$fullPkgName"
            
            if (Test-Path $targetPath) {
                Write-Host "Replacing $fullPkgName..." -ForegroundColor Green
                Get-ChildItem -Path "package" -Recurse | ForEach-Object {
                    $dest = $_.FullName -replace [regex]::Escape((Join-Path $tempDir "package")), $targetPath
                    if (-not (Test-Path (Split-Path $dest -Parent))) {
                        New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
                    }
                    Copy-Item -Path $_.FullName -Destination $dest -Force
                }
            }
        }
        
        Remove-Item -Recurse -Force "package" -ErrorAction SilentlyContinue
        Remove-Item -Force $tgzFile.FullName -ErrorAction SilentlyContinue
    }
    
    Write-Host "Done fixing expo packages!" -ForegroundColor Green
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
}
