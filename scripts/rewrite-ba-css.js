// 一次性脚本：把 BLUE_ARCHIVE_CSS_SIDEBAR 换成「内置 CSS 做的悬浮地点窗」
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'src', 'data', 'blueArchive.ts');

const src = fs.readFileSync(F, 'utf8');
const START = 'export const BLUE_ARCHIVE_CSS_SIDEBAR = `';
const i = src.indexOf(START);
if (i < 0) {
  console.error('找不到 BLUE_ARCHIVE_CSS_SIDEBAR');
  process.exit(1);
}
const end = src.indexOf('`;', i + START.length);
if (end < 0) {
  console.error('找不到结尾');
  process.exit(1);
}

const NEW = `/**
 * 碧蓝档案「地点悬浮窗」——**纯内置 CSS 实现**（body::after 伪元素，不需要任何原生组件）。
 *
 * 之前用 RN 组件画的悬浮球已经删掉，改回这里：
 * 用 content 把基沃托斯的地点列表写进伪元素，配 white-space:pre-line + overflow:auto，
 * 就是一个可滚动、可悬浮在聊天界面右上角的地点窗。
 */
const cssEscape = (s: string): string =>
  String(s).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'").replace(/\\r?\\n/g, '\\\\A ');

const locationListText = ((): string => {
  const academies = KIVOTOS_LOCATIONS.filter((l) => l.kind === '学园');
  const world = KIVOTOS_LOCATIONS.filter((l) => l.kind !== '学园');
  const lines: string[] = ['◇ 基沃托斯地点 ◇'];
  lines.push('【学园】');
  for (const l of academies) lines.push('· ' + l.name);
  if (world.length) {
    lines.push('', '【世界观】');
    for (const l of world) lines.push('· ' + l.name);
  }
  return lines.join('\\n');
})();

export const BLUE_ARCHIVE_CSS_SIDEBAR = \`
/* 右上角地点悬浮窗：纯 CSS，用伪元素画出来 */
body::after {
  content: '\${cssEscape(locationListText)}';
  position: fixed;
  right: 8px;
  top: 96px;
  width: 148px;
  max-height: 46vh;
  overflow-y: auto;
  overflow-x: hidden;
  white-space: pre-line;
  padding: 8px 10px;
  border-radius: 10px;
  background: linear-gradient(160deg, rgba(30, 42, 74, 0.94), rgba(16, 22, 38, 0.94));
  border: 1px solid rgba(150, 190, 255, 0.45);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.45);
  color: #cfe0ff;
  font-size: 10px;
  line-height: 1.55;
  letter-spacing: 0.2px;
  text-align: left;
  z-index: 9991;
  pointer-events: auto;
  scrollbar-width: thin;
}
body::after::-webkit-scrollbar { width: 4px; }
body::after::-webkit-scrollbar-thumb { background: rgba(150, 190, 255, 0.4); border-radius: 2px; }
\`;`;

const out = src.slice(0, i) + NEW + src.slice(end + 2);
fs.writeFileSync(F, out, 'utf8');
console.log('已替换 BLUE_ARCHIVE_CSS_SIDEBAR');
