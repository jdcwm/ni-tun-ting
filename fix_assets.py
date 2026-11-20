from PIL import Image
import os

project = r"c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern"
icon_src = r"c:\Users\jdcwm\Desktop\425bd477576b73d4cb8e00c03fce098e.png"
splash_src = r"c:\Users\jdcwm\Desktop\251c1b9c4656bdc825372b6189945577.jpg"
res = os.path.join(project, "android", "app", "src", "main", "res")
assets = os.path.join(project, "assets")

# 开屏动画图片 (SplashScreen.tsx 使用) -> Q版鲨鱼少女
icon = Image.open(icon_src).convert("RGBA")
icon.save(os.path.join(assets, "splash-icon.png"), "PNG")

# Android 原生启动屏 -> 酒馆场景 (fill 模式)
splash = Image.open(splash_src).convert("RGBA")
splash_sizes = {
    "mdpi": (320, 480),
    "hdpi": (480, 800),
    "xhdpi": (720, 1280),
    "xxhdpi": (1080, 1920),
    "xxxhdpi": (1440, 2560),
}
for d, (w, h) in splash_sizes.items():
    dpath = os.path.join(res, f"drawable-{d}")
    os.makedirs(dpath, exist_ok=True)
    src_w, src_h = splash.size
    target_ratio = w / h
    src_ratio = src_w / src_h
    if src_ratio > target_ratio:
        new_w = int(src_h * target_ratio)
        left = (src_w - new_w) // 2
        cropped = splash.crop((left, 0, left + new_w, src_h))
    else:
        new_h = int(src_w / target_ratio)
        top = (src_h - new_h) // 2
        cropped = splash.crop((0, top, src_w, top + new_h))
    resized = cropped.resize((w, h), Image.LANCZOS)
    resized.save(os.path.join(dpath, "splashscreen_logo_image.png"), "PNG")
    print(f"Generated {d}: {w}x{h}")

print("Done.")
