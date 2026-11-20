$project = "c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern"
$iconSrc = "c:\Users\jdcwm\Desktop\425bd477576b73d4cb8e00c03fce098e.png"
$splashSrc = "c:\Users\jdcwm\Desktop\251c1b9c4656bdc825372b6189945577.jpg"

# 替换 assets
Copy-Item $iconSrc "$project\assets\icon.png" -Force
Copy-Item $iconSrc "$project\assets\android-icon-foreground.png" -Force
magick -size 1024x1024 xc:"#ff6b9d" "$project\assets\android-icon-background.png"
magick $iconSrc -colorspace Gray "$project\assets\android-icon-monochrome.png"
magick $splashSrc "$project\assets\splash-icon.png"

# 标准图标 / round
$sizes = @{mdpi=48;hdpi=72;xhdpi=96;xxhdpi=144;xxxhdpi=192}
foreach ($d in $sizes.GetEnumerator()) {
    $dir = "$project\android\app\src\main\res\mipmap-$($d.Key)"
    magick "$project\assets\icon.png" -resize "$($d.Value)x$($d.Value)" -quality 95 "$dir\ic_launcher.webp"
    magick "$project\assets\icon.png" -resize "$($d.Value)x$($d.Value)" -quality 95 "$dir\ic_launcher_round.webp"
}

# 自适应图标前景 / 背景 / 单色
$fgSizes = @{mdpi=108;hdpi=162;xhdpi=216;xxhdpi=324;xxxhdpi=432}
foreach ($d in $fgSizes.GetEnumerator()) {
    $dir = "$project\android\app\src\main\res\mipmap-$($d.Key)"
    magick "$project\assets\android-icon-foreground.png" -resize "$($d.Value)x$($d.Value)" -quality 95 "$dir\ic_launcher_foreground.webp"
    magick "$project\assets\android-icon-background.png" -resize "$($d.Value)x$($d.Value)" -quality 95 "$dir\ic_launcher_background.webp"
    magick "$project\assets\android-icon-monochrome.png" -resize "$($d.Value)x$($d.Value)" -quality 95 "$dir\ic_launcher_monochrome.webp"
}

# 启动图 splashscreen_logo（居中缩放，透明背景由启动背景色填充）
$splashSizes = @{mdpi=288;hdpi=432;xhdpi=576;xxhdpi=864;xxxhdpi=1152}
foreach ($d in $splashSizes.GetEnumerator()) {
    $dir = "$project\android\app\src\main\res\drawable-$($d.Key)"
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    magick "$project\assets\splash-icon.png" -resize "$($d.Value)x$($d.Value)" "$dir\splashscreen_logo.png"
}

# 删除旧资源
Remove-Item "$project\android\app\src\main\res\drawable-mdpi\assets_splashicon.png" -Force -ErrorAction SilentlyContinue

Write-Host "Done replacing assets."
