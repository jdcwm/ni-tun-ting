// 从「碧蓝档案角色资料」抽取基沃托斯的地点，生成内置地点数据。
// 用法：node scripts/build-kivotos-locations.js "C:\...\碧蓝档案角色资料"
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.argv[2];
if (!DATA_DIR) { console.error('用法: node build-kivotos-locations.js <碧蓝档案角色资料目录>'); process.exit(1); }

const OUT_TS = path.join(__dirname, '..', 'src', 'data', 'kivotosLocations.ts');

/** 取 markdown 里某段（## 标题）的正文 */
function section(md, titles) {
  for (const t of titles) {
    const re = new RegExp(`##\\s*${t}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
    const m = md.match(re);
    if (m) return m[1].replace(/\r/g, '').trim();
  }
  return '';
}

/** 压成一段干净文字：去掉表格行、链接、markdown 标记 */
function clean(text, maxLen = 260) {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('|') && !l.startsWith('>') && !l.startsWith('---') && !l.startsWith('#'));
  let out = lines.join(' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#]/g, '').replace(/\s{2,}/g, ' ').trim();
  if (out.length > maxLen) out = out.slice(0, maxLen) + '…';
  return out;
}

const locations = [];

// 1) 学院
const academyDir = path.join(DATA_DIR, '学院');
if (fs.existsSync(academyDir)) {
  for (const e of fs.readdirSync(academyDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const mdFile = path.join(academyDir, e.name, '学院资料.md');
    if (!fs.existsSync(mdFile)) continue;
    const md = fs.readFileSync(mdFile, 'utf8').replace(/\r/g, '');
    const title = (md.match(/^#\s*(.+)$/m) || [])[1]?.trim() || e.name;
    const desc = clean(section(md, ['简介', '介绍', '学园概况', '概况', '概述', '描述']) || md);
    if (!desc) continue;
    // 校内设施：本身就是一批具体地点
    const facRaw = section(md, ['校内设施', '学院设施', '设施', '校区设施', '主要设施']);
    const facilities = facRaw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-*·]\s+/.test(l))
      .map((l) => l.replace(/^[-*·]\s+/, '').replace(/\*\*/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim())
      .filter((l) => l.length >= 2 && l.length <= 60)
      .slice(0, 20);
    locations.push({ name: title, kind: '学园', desc, facilities });
  }
}

// 2) 世界观实体
const wvDir = path.join(DATA_DIR, '世界观');
if (fs.existsSync(wvDir)) {
  for (const e of fs.readdirSync(wvDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const f = path.join(wvDir, e.name, '资料.md');
    if (!fs.existsSync(f)) continue;
    const md = fs.readFileSync(f, 'utf8').replace(/\r/g, '');
    const title = (md.match(/^#\s*(.+)$/m) || [])[1]?.trim() || e.name;
    const desc = clean(section(md, ['简介', '概况', '概述', '介绍']) || md);
    if (!desc) continue;
    locations.push({ name: title, kind: '世界观', desc, facilities: [] });
  }
}

const L = [];
L.push(`// 基沃托斯地点（由 scripts/build-kivotos-locations.js 从「碧蓝档案角色资料」生成，共 ${locations.length} 条）`);
L.push(`export interface KivotosLocation { name: string; kind: string; desc: string; facilities: string[]; }`);
L.push(``);
L.push(`export const KIVOTOS_LOCATIONS: KivotosLocation[] = [`);
for (const l of locations) {
  L.push(`  { name: ${JSON.stringify(l.name)}, kind: ${JSON.stringify(l.kind)}, desc: ${JSON.stringify(l.desc)}, facilities: ${JSON.stringify(l.facilities || [])} },`);
}
L.push(`];`);
L.push(``);
fs.writeFileSync(OUT_TS, L.join('\n'), 'utf8');
console.log(`已生成 ${locations.length} 个地点 -> ${OUT_TS}`);
console.log(`示例：${locations.slice(0, 5).map((l) => l.name).join('、')}`);
