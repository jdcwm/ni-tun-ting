// 从「东方Project」资料生成幻想入界世界书条目（地点 + 角色）。
// 用法：node scripts/build-gensokyo-worldbook.js "C:\Users\jdcwm\Desktop\东方Project"
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.argv[2];
if (!DATA_DIR) {
  console.error('用法: node build-gensokyo-worldbook.js <东方Project目录>');
  process.exit(1);
}
const OUT_TS = path.join(__dirname, '..', 'src', 'data', 'gensokyoWorldBookData.ts');

/* ---------------------------------- 工具 ---------------------------------- */

/** 清掉 THBWiki 的行内引用标记（史纪 / 妖妖梦Manual / 醉蝶华3话 …），它们混在正文里很碍读 */
function stripCitations(t) {
  return String(t || '')
    .replace(/\s*(?:[^\s，。；、]{0,12}\d+\s*话|妖妖梦Manual|永夜抄Manual|红魔乡设定文档|[^\s，。；、]{0,10}Manual|[^\s，。；、]{0,10}设定文档|[^\s，。；、]{0,8}采访|[^\s，。；、]{0,8}座谈会|人气投票记录)\s*/g, ' ')
    .replace(/(?:^|[\s、])(?:史纪|求闻史纪|文文\.新闻)(?=[\s，。；、]|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 压成一行干净文本：去掉外链、THBWiki 引用方括号、强调符 */
function clean(text, maxLen) {
  let t = String(text || '')
    .replace(/\r/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]{0,60})\]/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^[\s>|-]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  t = stripCitations(t);
  if (maxLen && t.length > maxLen) t = t.slice(0, maxLen).replace(/[，、；,;]$/, '') + '…';
  return t;
}

/** 取 ## 级章节（到下一个 ## 为止） */
function chapter(md, title) {
  const re = new RegExp(`\\n##\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const m = md.match(re);
  return m ? m[1] : '';
}

/** 取 ### 级小节（到下一个任意级标题为止，#### 也算） */
function section(md, title) {
  const re = new RegExp(`\\n#{3,}\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n#{2,}\\s|$)`);
  const m = md.match(re);
  return m ? m[1] : '';
}

/** 解析「## 基本信息」表格 → { 项目: 内容 } */
function parseTable(md) {
  const sec = md.match(/\n##\s*基本信息\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!sec) return {};
  const map = {};
  for (const line of sec[1].split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!m) continue;
    const k = m[1].trim();
    if (!k || k === '项目' || /^:?-{2,}/.test(k)) continue;
    const v = clean(m[2]);
    if (v) map[k] = v;
  }
  return map;
}

/* -------------------------------- 地点抽取 -------------------------------- */

const locationSrc = fs.readFileSync(path.join(DATA_DIR, '00_世界观与地点.md'), 'utf8');

// 目录里带层级：- [名称](#锚点)　（所属）
const parentOf = {};
const tocMatch = locationSrc.match(/\n##\s*目录\s*\n([\s\S]*?)\n---/);
if (tocMatch) {
  for (const line of tocMatch[1].split('\n')) {
    const m = line.match(/^-\s*\[([^\]]+)\][^（]*（([^）]+)）/);
    if (m) parentOf[m[1].trim()] = m[2].trim();
  }
}

const locationEntries = [];
{
  const chunks = locationSrc.split(/\n##\s+/).slice(1);
  for (const chunk of chunks) {
    const nl = chunk.indexOf('\n');
    if (nl < 0) continue;
    const name = chunk.slice(0, nl).trim();
    if (!name || name === '目录') continue;
    const body = chunk.slice(nl);

    const basicRaw = clean(section(body, '基本信息'));
    const settings = clean(section(body, '相关设定'), 700);
    const analysis = clean(section(body, '分析考据'), 260);

    // 基本信息是「标签 值 标签 值」的平铺文本，按已知标签切
    const grab = (label, nextLabels) => {
      // 注意：nextLabels 为空时不能用空的分支，否则 lookahead 恒成立、永远匹配空串
      const tail = nextLabels.length ? `(?=${nextLabels.join('|')}|$)` : '(?=$)';
      const m = basicRaw.match(new RegExp(`${label}\\s*([\\s\\S]*?)${tail}`));
      return m && m[1] ? m[1].replace(/\s+/g, ' ').trim() : '';
    };
    const kind = grab('类别', ['出现作品', '所在地', '相关角色', '日文名', '英文名']);
    const place = grab('所在地', ['相关角色', '出现作品', '类别']);
    const related = grab('相关角色', []);

    const parent = parentOf[name] || '';
    const head = parent ? `【地点】${name}（${parent}）` : `【地点】${name}`;
    const lines = [head];
    const meta = [kind && `类别：${kind}`, place && `所在地：${place}`].filter(Boolean);
    if (meta.length) lines.push(meta.join(' | '));
    if (related) lines.push(`相关角色：${clean(related, 320)}`);
    if (settings) lines.push(`\n相关设定：${settings}`);
    if (analysis) lines.push(`\n考据：${analysis}`);

    const keys = [name];
    if (parent && parent !== '总览' && parent !== '其他异界') keys.push(parent);
    locationEntries.push({ name, parent, keys, content: lines.join('\n') });
  }
}

/* -------------------------------- 角色抽取 -------------------------------- */

const SEEN = new Set();
const characterEntries = [];

for (const sub of ['新作', '旧作']) {
  const dir = path.join(DATA_DIR, sub, '角色');
  if (!fs.existsSync(dir)) continue;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory) continue;
    const f = path.join(dir, e.name, '人物设定.md');
    if (!fs.existsSync(f)) continue;
    let md;
    try {
      md = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const b = parseTable(md);
    const name = b['人物名'] || e.name;
    if (!name || SEEN.has(name)) continue;
    SEEN.add(name);

    const title = b['称号'] || '';
    const lines = [`【${name}】${title ? ' - ' + title : ''}`];

    const meta = [
      b['种族'] && `种族：${b['种族']}`,
      b['职业'] && `职业：${b['职业']}`,
      b['初登场'] && `初登场：${b['初登场']}`,
      sub === '旧作' ? '系列：旧作' : '',
    ].filter(Boolean);
    if (meta.length) lines.push(meta.join(' | '));
    if (b['能力']) lines.push(`能力：${clean(b['能力'], 260)}`);

    // 顺序按「扮演时最有用」排：人际关系 → 核心描述 → 外观 → 生活状况。
    // 这样即使被总长度截断，最重要的信息也不会丢。
    const rel = clean(section(md, '人际关系'), 300);
    if (rel) lines.push(`\n人际关系：${rel}`);

    const intro = clean(chapter(md, '角色介绍'), 380);
    if (intro) lines.push(`\n核心描述：${intro}`);

    const look = clean(section(md, '外貌特征'), 170);
    if (look) lines.push(`外观：${look}`);

    const lifeRaw = clean(section(md, '生活状况'), 160);
    if (lifeRaw) lines.push(`生活状况：${lifeRaw}`);

    const ability = clean(section(md, '角色能力'), 150);
    if (ability) lines.push(`能力补充：${ability}`);

    const keys = [name];
    if (title) keys.push(title);
    const alias = clean(b['人物名']);
    if (alias && alias !== name) keys.push(alias);

    // 单个词条封顶，避免命中时一次注入太多 token
    let content = lines.join('\n');

    // 一设资料很少的角色（只有表格几行）：用二次设定补一点，并明确标注非官方
    if (content.length < 220) {
      const fan = clean(section(md, '二次设定'), 300);
      if (fan) content += `\n二设（非官方，仅供参考）：${fan}`;
    }

    if (content.length > 1100) content = content.slice(0, 1100).replace(/[，、；,;]$/, '') + '…';
    // 资料实在太少（连称号都没有）的不值得单独成条
    if (content.length < 50) continue;

    characterEntries.push({ name, keys, content });
  }
}

/* --------------------------------- 输出 TS -------------------------------- */

const esc = (s) => JSON.stringify(s);
const L = [];
L.push(`// 幻想入界世界书条目（由 scripts/build-gensokyo-worldbook.js 从「东方Project」资料生成）`);
L.push(`// 地点 ${locationEntries.length} 个 + 角色 ${characterEntries.length} 人`);
L.push(`import { WorldBookEntry } from '../types';`);
L.push(``);
L.push(`/** 地点条目 */`);
L.push(`export const gensokyoLocationEntries: WorldBookEntry[] = [`);
locationEntries.forEach((l, i) => {
  L.push(`  {`);
  L.push(`    id: 'wb_gensokyo_loc_${i + 1}',`);
  L.push(`    keys: ${esc(l.keys)},`);
  L.push(`    content: ${esc(l.content)},`);
  L.push(`    images: [],`);
  L.push(`    enabled: true,`);
  L.push(`  },`);
});
L.push(`];`);
L.push(``);
L.push(`/** 角色条目 */`);
L.push(`export const gensokyoCharacterEntries: WorldBookEntry[] = [`);
characterEntries.forEach((c, i) => {
  L.push(`  {`);
  L.push(`    id: 'wb_gensokyo_char_${i + 1}',`);
  L.push(`    keys: ${esc(c.keys)},`);
  L.push(`    content: ${esc(c.content)},`);
  L.push(`    images: [],`);
  L.push(`    enabled: true,`);
  L.push(`  },`);
});
L.push(`];`);
L.push(``);
L.push(`export const gensokyoWorldBookEntries: WorldBookEntry[] = [`);
L.push(`  ...gensokyoLocationEntries,`);
L.push(`  ...gensokyoCharacterEntries,`);
L.push(`];`);
L.push(``);

fs.writeFileSync(OUT_TS, L.join('\n'), 'utf8');

console.log(`地点 ${locationEntries.length} 个，角色 ${characterEntries.length} 人 -> ${OUT_TS}`);
console.log(`地点示例：${locationEntries.slice(0, 8).map((l) => l.name).join('、')}`);
console.log(`角色示例：${characterEntries.slice(0, 8).map((c) => c.name).join('、')}`);
