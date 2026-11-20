// 恢复自定义启动屏 / 图标到 android 原生工程。
//
// 为什么需要它：android/ 是 `expo prebuild` 生成的（.gitignore 忽略），
// 每次 prebuild 都会清空重建，把自定义启动屏（Theme.SplashScreen + 竖屏整屏图）冲掉。
// 本脚本从项目内 android-custom/splash/ 还原全部文件，并补上 core-splashscreen 依赖。
//
// 用法：node scripts/restore-android-splash.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'android-custom', 'splash');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const GRADLE = path.join(ROOT, 'android', 'app', 'build.gradle');

if (!fs.existsSync(RES)) {
  console.error('未找到 android/app/src/main/res，请先执行 npx expo prebuild --platform android');
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.error('未找到 android-custom/splash');
  process.exit(1);
}

let n = 0;
const copy = (from, to) => {
  const dst = path.join(RES, to);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(SRC, from), dst);
  n++;
};

copy('splashscreen_logo.png', 'drawable/splashscreen_logo.png');
copy('splashscreen_layer.xml', 'drawable/splashscreen_layer.xml');
copy('ic_launcher_background.xml', 'drawable/ic_launcher_background.xml');
copy('ic_launcher.xml', 'mipmap-anydpi-v26/ic_launcher.xml');
copy('ic_launcher_round.xml', 'mipmap-anydpi-v26/ic_launcher_round.xml');
copy('values-night_colors.xml', 'values-night/colors.xml');

// 密度图标（webp）
for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  for (const f of ['ic_launcher.webp', 'ic_launcher_foreground.webp', 'ic_launcher_round.webp']) {
    const s = `mipmap-${d}_${f}`;
    if (fs.existsSync(path.join(SRC, s))) copy(s, `mipmap-${d}/${f}`);
  }
}

// 启动图源（Expo 侧）
const splashIcon = path.join(SRC, 'assets_splashicon.png');
if (fs.existsSync(splashIcon)) {
  fs.copyFileSync(splashIcon, path.join(ROOT, 'assets', 'splash-icon.png'));
  n++;
}

// 删掉 prebuild 生成的「方形」密度启动图，否则高密度设备会优先用方形图
for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const p = path.join(RES, `drawable-${d}`, 'splashscreen_logo.png');
  if (fs.existsSync(p)) { fs.rmSync(p); n++; }
}

// styles.xml：保留 prebuild 生成的 AppTheme，替换 Theme.App.SplashScreen 为自定义版
const stylesPath = path.join(RES, 'values', 'styles.xml');
const base = fs.existsSync(stylesPath) ? fs.readFileSync(stylesPath, 'utf8') : '<resources></resources>';
const appTheme = (base.match(/<style name="AppTheme"[\s\S]*?<\/style>/) || [])[0] || '';
fs.writeFileSync(stylesPath, `<resources xmlns:tools="http://schemas.android.com/tools">
${appTheme}
  <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">@android:color/transparent</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/splashscreen_logo</item>
    <item name="windowSplashScreenAnimationDuration">200</item>
    <item name="postSplashScreenTheme">@style/AppTheme</item>
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:navigationBarColor">@android:color/transparent</item>
    <item name="android:windowIsTranslucent">true</item>
  </style>
</resources>
`, 'utf8');
n++;

// core-splashscreen 依赖（Theme.SplashScreen 父主题需要）
if (fs.existsSync(GRADLE)) {
  let g = fs.readFileSync(GRADLE, 'utf8');
  if (!g.includes('core-splashscreen')) {
    g = g.replace(
      /(dependencies \{\s*\n)/,
      `$1    implementation("androidx.core:core-splashscreen:1.0.1")\n`,
    );
    fs.writeFileSync(GRADLE, g, 'utf8');
    n++;
  }
}

console.log(`已恢复 ${n} 项自定义启动屏/图标资源`);
console.log('提示：需要重新构建 APK 才会生效（gradlew assembleRelease）');
