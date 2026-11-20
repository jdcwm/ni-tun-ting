// 给 blueArchiveData.ts 里所有「地点悬浮窗」的 cssEntries 加上 widget 尺寸声明
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'src', 'data', 'blueArchiveData.ts');

let s = fs.readFileSync(F, 'utf8');
const WIDGET = "widget: { width: 172, height: 430, anchor: 'top-right' as const }";

// 形如：cssEntries: [{ id: 'css_ba_map_sidebar', ... enabled: true, scope: 'global' as const }],
const re = /(\{ id: 'css_ba_map_sidebar'[^}]*scope: 'global' as const)( \}\])/g;
let n = 0;
s = s.replace(re, (m, head, tail) => {
  n++;
  return `${head}, ${WIDGET}${tail}`;
});

fs.writeFileSync(F, s, 'utf8');
console.log('已给地点悬浮窗条目加 widget 尺寸:', n, '处');
