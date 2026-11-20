from PIL import Image
import os

source = r"c:\Users\jdcwm\Desktop\251c1b9c4656bdc825372b6189945577.jpg"
base_android = r"c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern\android\app\src\main\res"
assets_dir = r"c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern\assets"

img = Image.open(source)

sizes = {
    "drawable-mdpi": (480, 800),
    "drawable-hdpi": (720, 1280),
    "drawable-xhdpi": (960, 1600),
    "drawable-xxhdpi": (1440, 2560),
    "drawable-xxxhdpi": (1920, 3200),
}

for folder, (w, h) in sizes.items():
    target_dir = os.path.join(base_android, folder)
    os.makedirs(target_dir, exist_ok=True)
    
    resized = img.copy()
    resized.thumbnail((w, h), Image.LANCZOS)
    
    canvas = Image.new("RGB", (w, h), (255, 245, 247))
    x = (w - resized.width) // 2
    y = (h - resized.height) // 2
    canvas.paste(resized, (x, y))
    
    out_path = os.path.join(target_dir, "splashscreen_logo.png")
    canvas.save(out_path, "PNG")
    print(f"Saved: {out_path} ({canvas.size})")

assets_out = os.path.join(assets_dir, "splash-icon.png")
resized = img.copy()
resized.thumbnail((1242, 2436), Image.LANCZOS)
resized.save(assets_out, "PNG")
print(f"Saved: {assets_out} ({resized.size})")

print("Done!")
