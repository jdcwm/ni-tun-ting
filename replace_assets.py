from PIL import Image
import os

project = r"c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern"
icon_src = r"c:\Users\jdcwm\Desktop\425bd477576b73d4cb8e00c03fce098e.png"
splash_src = r"c:\Users\jdcwm\Desktop\251c1b9c4656bdc825372b6189945577.jpg"
assets = os.path.join(project, "assets")
res = os.path.join(project, "android", "app", "src", "main", "res")

def fit_square(img, size, bg=(255, 255, 255, 0)):
    img = img.convert("RGBA")
    img.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg)
    x = (size - img.width) // 2
    y = (size - img.height) // 2
    canvas.paste(img, (x, y), img)
    return canvas

def fit_center(img, width, height, bg):
    img = img.convert("RGBA")
    img.thumbnail((width, height), Image.LANCZOS)
    canvas = Image.new("RGBA", (width, height), bg)
    x = (width - img.width) // 2
    y = (height - img.height) // 2
    canvas.paste(img, (x, y), img)
    return canvas

# 读取原图
icon = Image.open(icon_src)
splash = Image.open(splash_src)

# assets 替换
icon.save(os.path.join(assets, "icon.png"), "PNG")
fit_square(icon, 1024, (0, 0, 0, 0)).save(os.path.join(assets, "android-icon-foreground.png"), "PNG")
Image.new("RGBA", (1024, 1024), (255, 107, 157, 255)).save(os.path.join(assets, "android-icon-background.png"), "PNG")
fit_square(icon, 1024, (0, 0, 0, 0)).convert("L").convert("RGBA").save(os.path.join(assets, "android-icon-monochrome.png"), "PNG")

# splash-icon 等比缩小到最大 1152，避免 APK 过大
splash.thumbnail((1152, 1152), Image.LANCZOS)
splash.save(os.path.join(assets, "splash-icon.png"), "PNG")

# 标准图标 / round
sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for d, s in sizes.items():
    dpath = os.path.join(res, f"mipmap-{d}")
    fit_square(icon, s, (255, 107, 157, 255)).convert("RGB").save(os.path.join(dpath, "ic_launcher.webp"), "WEBP", quality=95, method=6)
    fit_square(icon, s, (255, 107, 157, 255)).convert("RGB").save(os.path.join(dpath, "ic_launcher_round.webp"), "WEBP", quality=95, method=6)

# 自适应图标前景 / 背景 / 单色
fg_sizes = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
for d, s in fg_sizes.items():
    dpath = os.path.join(res, f"mipmap-{d}")
    fit_square(icon, s, (0, 0, 0, 0)).save(os.path.join(dpath, "ic_launcher_foreground.webp"), "WEBP", quality=95, method=6)
    Image.new("RGBA", (s, s), (255, 107, 157, 255)).save(os.path.join(dpath, "ic_launcher_background.webp"), "WEBP", quality=95, method=6)
    fit_square(icon, s, (0, 0, 0, 0)).convert("L").convert("RGBA").save(os.path.join(dpath, "ic_launcher_monochrome.webp"), "WEBP", quality=95, method=6)

# 启动图 splashscreen_logo_image
splash_bg = (255, 245, 247, 255)
splash_sizes = {"mdpi": 288, "hdpi": 432, "xhdpi": 576, "xxhdpi": 864, "xxxhdpi": 1152}
for d, s in splash_sizes.items():
    dpath = os.path.join(res, f"drawable-{d}")
    os.makedirs(dpath, exist_ok=True)
    fit_center(splash, s, s, splash_bg).save(os.path.join(dpath, "splashscreen_logo_image.png"), "PNG")

# 删除旧的 assets_splashicon.png
old = os.path.join(res, "drawable-mdpi", "assets_splashicon.png")
if os.path.exists(old):
    os.remove(old)

print("Done replacing assets.")
