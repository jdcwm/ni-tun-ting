Add-Type -AssemblyName System.Drawing

$projectDir = "C:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern"
$iconSource = "C:\Users\jdcwm\Desktop\4eb77586945ee73e965ed0e1bb4bab86.png"
$splashSource = "C:\Users\jdcwm\Desktop\b_eb3dd506d2014cc29b2af05b5b727ca2.jpg"

function Resize-Image {
    param(
        [string]$sourcePath,
        [string]$destPath,
        [int]$width,
        [int]$height
    )
    
    $srcImg = [System.Drawing.Image]::FromFile($sourcePath)
    $destImg = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($destImg)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    $srcRatio = $srcImg.Width / $srcImg.Height
    $destRatio = $width / $height
    
    if ($srcRatio -gt $destRatio) {
        $newHeight = $height
        $newWidth = [int]($height * $srcRatio)
        $x = [int](($width - $newWidth) / 2)
        $y = 0
    } else {
        $newWidth = $width
        $newHeight = [int]($width / $srcRatio)
        $x = 0
        $y = [int](($height - $newHeight) / 2)
    }
    
    $graphics.DrawImage($srcImg, $x, $y, $newWidth, $newHeight)
    $destImg.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $srcImg.Dispose()
    $destImg.Dispose()
    $graphics.Dispose()
    
    Write-Host "  Generated: $destPath ($width x $height)"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Update App Icons and Splash Images" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Update assets directory..." -ForegroundColor Yellow
Copy-Item $iconSource "$projectDir\assets\icon.png" -Force
Write-Host "  icon.png updated"
Copy-Item $splashSource "$projectDir\assets\splash-icon.png" -Force
Write-Host "  splash-icon.png updated"

Write-Host ""
Write-Host "[2/4] Update Android splash images (splashscreen_logo.png)..." -ForegroundColor Yellow

$splashSizes = @{
    "drawable-mdpi" = 480
    "drawable-hdpi" = 720
    "drawable-xhdpi" = 960
    "drawable-xxhdpi" = 1440
    "drawable-xxxhdpi" = 1920
}

foreach ($dir in $splashSizes.Keys) {
    $size = $splashSizes[$dir]
    $destPath = "$projectDir\android\app\src\main\res\$dir\splashscreen_logo.png"
    Resize-Image $splashSource $destPath $size ([int]($size * 1.5))
}

Write-Host ""
Write-Host "[3/4] Update Android app icons (mipmap)..." -ForegroundColor Yellow

$iconSizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

$pink = [System.Drawing.Color]::FromArgb(255, 107, 157)

foreach ($dir in $iconSizes.Keys) {
    $size = $iconSizes[$dir]
    $destDir = "$projectDir\android\app\src\main\res\$dir"
    
    $foregroundPath = "$destDir\ic_launcher_foreground.png"
    Resize-Image $iconSource $foregroundPath $size $size
    
    $launcherPath = "$destDir\ic_launcher.png"
    Resize-Image $iconSource $launcherPath $size $size
    
    $roundPath = "$destDir\ic_launcher_round.png"
    Resize-Image $iconSource $roundPath $size $size
    
    $bgPath = "$destDir\ic_launcher_background.png"
    $bgImg = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bgImg)
    $brush = New-Object System.Drawing.SolidBrush($pink)
    $graphics.FillRectangle($brush, 0, 0, $size, $size)
    $bgImg.Save($bgPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bgImg.Dispose()
    $graphics.Dispose()
    $brush.Dispose()
    Write-Host "  Generated: $bgPath ($size x $size) - pink background"
    
    Remove-Item "$destDir\ic_launcher.webp" -ErrorAction SilentlyContinue
    Remove-Item "$destDir\ic_launcher_round.webp" -ErrorAction SilentlyContinue
    Remove-Item "$destDir\ic_launcher_foreground.webp" -ErrorAction SilentlyContinue
    Remove-Item "$destDir\ic_launcher_background.webp" -ErrorAction SilentlyContinue
    Remove-Item "$destDir\ic_launcher_monochrome.webp" -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "[4/4] Update adaptive icon config..." -ForegroundColor Yellow

$xmlContent = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n"
$xmlContent += "<adaptive-icon xmlns:android=`"http://schemas.android.com/apk/res/android`">`n"
$xmlContent += "    <background android:drawable=`"@mipmap/ic_launcher_background`"/>`n"
$xmlContent += "    <foreground android:drawable=`"@mipmap/ic_launcher_foreground`"/>`n"
$xmlContent += "</adaptive-icon>"

$xmlContent | Out-File "$projectDir\android\app\src\main\res\mipmap-anydpi-v26\ic_launcher.xml" -Encoding utf8
$xmlContent | Out-File "$projectDir\android\app\src\main\res\mipmap-anydpi-v26\ic_launcher_round.xml" -Encoding utf8
Write-Host "  Adaptive icon config updated"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Assets update complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
