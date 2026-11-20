// 给 blueArchiveData.ts 里所有「碧蓝档案角色」补上地点悬浮窗的 cssEntries
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'src', 'data', 'blueArchiveData.ts');

let s = fs.readFileSync(F, 'utf8');

const ENTRY =
  "cssEntries: [{ id: 'css_ba_map_sidebar', name: '碧蓝档案地点悬浮窗', css: BLUE_ARCHIVE_CSS_SIDEBAR, enabled: true, scope: 'global' as const }],";

// 角色块：4 空格缩进的 statusBar 行，紧跟 '  },' 收尾（群成员的 statusBar 是 6 空格且后面是 predictionConfig）
const re =
  /(\n {4}statusBar: \{ enabled: true, vars: BLUE_ARCHIVE_STATUS_VARS, position: 'top', style: 'inline', animation: 'none' \},\n {2}\},)/g;

let n = 0;
s = s.replace(re, (m) => {
  n++;
  return m.replace(/\n {2}\},$/, `\n    ${ENTRY}\n  },`);
});

fs.writeFileSync(F, s, 'utf8');
console.log('已给角色补 cssEntries:', n, '个');
