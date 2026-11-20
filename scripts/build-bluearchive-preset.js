// 生成碧蓝档案「默认对话」的内置角色（全部角色）+ 复制头像到 assets/bluearchive/
// 用法：node scripts/build-bluearchive-preset.js "C:\...\碧蓝档案角色资料"
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.argv[2];
if (!DATA_DIR) { console.error('用法: node build-bluearchive-preset.js <碧蓝档案角色资料目录>'); process.exit(1); }

const ASSET_DIR = path.join(__dirname, '..', 'assets', 'bluearchive');
const OUT_TS = path.join(__dirname, '..', 'src', 'data', 'blueArchiveData.ts');
fs.rmSync(ASSET_DIR, { recursive: true, force: true });
fs.mkdirSync(ASSET_DIR, { recursive: true });

// 默认群聊里「默认发言」的精选角色（其余角色也在群里，但默认静音，可手动开启）
const FEATURED = new Set(['砂狼白子', '圣园未花', '空崎日奈', '小鸟游星野', '白洲梓', '早濑优香']);

const schoolNames = {
  Abydos: '阿拜多斯高中', Trinity: '三一综合学园', Gehenna: '格黑娜学园', Millennium: '千年科学学园',
  SRT: 'SRT特殊学园', Arius: '阿里乌斯分校', Hyakkiyako: '百鬼夜行联合学园', Shanhaijing: '山海经高级中学',
  RedWinter: '赤冬联邦学园', Valkyrie: '女武神警察学园', Tokiwadai: '常盘台中学', SH: '山海经',
};
function schoolName(code) { return schoolNames[code] || code || ''; }

function findAvatar(dir) {
  const avDir = path.join(dir, '头像');
  if (!fs.existsSync(avDir)) return null;
  const cands = [];
  for (const form of fs.readdirSync(avDir)) {
    const p = path.join(avDir, form, '头像.png');
    if (fs.existsSync(p)) cands.push(p);
  }
  return cands.find((p) => p.includes('原始')) || cands[0] || null;
}

function sanitizeAssetName(s) {
  const a = String(s || '').replace(/[^\w.-]/g, '_').replace(/_{2,}/g, '_');
  return a || 'char';
}

function extractMdPersona(md) {
  // 剧情人物/配角用「## 简介」；学生用「### 1.3 人物简介」
  let m = md.match(/##\s*简介\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/);
  if (m) {
    const seg = m[1].replace(/\r/g, '').trim().split('\n')
      .filter((l) => l.trim() && !/^[>|]/.test(l.trim()) && !/^\d+\.\s/.test(l.trim()))
      .slice(0, 3).join(' ');
    if (seg) return seg;
  }
  m = md.match(/###\s*1\.3\s*人物简介\s*\n([\s\S]*?)(?=\n###|\n##)/);
  if (m) return m[1].replace(/\r/g, '').replace(/^[\s>]*/g, '').trim();
  return '';
}

// ───────── 详细人设抽取 ─────────

/** 去掉日文假名注音、markdown 链接与强调符 */
function cleanInline(s) {
  return String(s || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    // 中文全角括号里的纯假名注音：砂狼 （ すなおおかみ ） → 砂狼
    .replace(/（\s*[\u3040-\u30ff\u30fc\s]*\s*）/g, '')
    .replace(/\s*（\s*([^）]{0,6})\s*）/g, (mm, inner) => (/[\u3040-\u30ff]/.test(inner) ? '' : `（${inner}）`))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 解析「### 1.1 基本资料」表格 → { 项目: 内容 } */
function parseBasicsTable(md) {
  const sec = md.match(/###\s*1\.1\s*基本资料\s*\n([\s\S]*?)(?=\n###|\n##)/);
  if (!sec) return {};
  const map = {};
  for (const line of sec[1].split('\n')) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!m) continue;
    const k = m[1].trim();
    if (!k || k === '项目' || /^:?-{2,}/.test(k)) continue;
    const v = cleanInline(m[2]);
    if (!v) continue;
    map[k] = v;
  }
  return map;
}

/** 取 markdown 某个「### x.y 标题」下的正文 */
function mdSection(md, titleKeyword, maxLen) {
  const re = new RegExp(`###\\s*[\\d.]*\\s*${titleKeyword}\\s*\\n([\\s\\S]*?)(?=\\n###|\\n##|$)`);
  const m = md.match(re);
  if (!m) return '';
  let t = m[1]
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('|') && !l.startsWith('>') && !l.startsWith('-') && !l.startsWith('---') && !l.startsWith('#'))
    .join(' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/获得台词[\s\S]*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (maxLen && t.length > maxLen) t = t.slice(0, maxLen) + '…';
  return t;
}

/** 过滤掉完全没有信息量的字段值 */
function useful(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s.length > 80) return '';
  if (/^(无|未知|不明|待补|—|-|\/|暂无|对照表.*)$/.test(s)) return '';
  return s;
}

/** 剧情/简介/考据全文（用于推导人际关系） */
function relationSources(md) {
  const b = parseBasicsTable(md);
  const club = useful(b['所属社团']) || useful(b['所属团体']) || '';
  const story = [
    mdSection(md, '人物经历', 8000),
    mdSection(md, '人物简介', 2000),
    mdSection(md, '人物设定与考据', 8000),
    extractMdPersona(md),
  ].join(' ');
  // 剧情人物/配角用的是「## 简介」，上面都取不到时直接扫全文
  const storyFull = story.replace(/\s/g, '').length > 20 ? story : md.replace(/[|#>*-]/g, ' ');
  // 少数角色有现成的「人物关系 / 人际关系」小节
  const m = md.match(/###\s*(?:人物关系|人际关系)\s*\n([\s\S]*?)(?=\n###|\n##|$)/);
  let explicit = '';
  if (m) {
    explicit = m[1]
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('|') && !l.startsWith('>') && !l.startsWith('#'))
      .map((l) => l.replace(/^[-*·]\s*/, ''))
      .join('；')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/以下内容含有剧透[^。]*。/g, '')
      .replace(/^人际关系\s*|^人物关系\s*/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[；;、,，\s]+/, '')
      .trim();
  }
  return { club, story: storyFull, explicit };
}

/** 组装详细人设：把「1.1 基本资料」的所有字段 + 简介 + 性格设定 拼成结构化文本。 */
function buildDetailedPersona(md, fallback) {
  const b = parseBasicsTable(md);
  const g = (k) => useful(b[k]);
  // 表格里的「游戏内名」可能带形态后缀（优香（体操服）），展示名去掉括号部分
  const rawName = g('游戏内名') || fallback.name;
  const name = rawName.replace(/（[^）]*）|\([^)]*\)/g, '').trim() || rawName;
  const fullName = g('全名');
  const out = [];

  const head = [
    fullName && fullName !== name ? `${name}（${fullName}）` : name,
    g('所属学校') || fallback.school,
    g('年级'),
    g('年龄'),
    g('生日') ? `生日 ${g('生日')}` : '',
    g('星座'),
    g('身高') ? `身高 ${g('身高')}` : '',
    g('体重') ? `体重 ${g('体重')}` : '',
  ].filter(Boolean);
  out.push(`【基本信息】${head.join(' · ')}`);

  const org = [g('所属学校') || fallback.school, g('所属社团') ? `社团：${g('所属社团')}` : '', g('所属团体') ? `团体：${g('所属团体')}` : ''].filter(Boolean);
  if (org.length) out.push(`【所属】${org.join(' ｜ ')}`);

  const look = [g('发色') ? `发色：${g('发色')}` : '', g('瞳色') ? `瞳色：${g('瞳色')}` : '', g('光环') ? `光环：${g('光环')}` : ''].filter(Boolean);
  if (look.length) out.push(`【外貌】${look.join(' · ')}`);

  const hobby = g('兴趣') || fallback.hobby;
  if (hobby) out.push(`【兴趣】${hobby}`);
  if (g('别号')) out.push(`【别号】${g('别号')}`);
  if (g('萌点')) out.push(`【萌点】${g('萌点')}`);

  // 人物简介（尽量完整）
  const intro = mdSection(md, '人物简介', 1600) || g('人物简介');
  if (intro) out.push(`【人物简介】${intro}`);

  // 性格与设定（保留性格／关系／说话习惯，剥掉立绘与武器考据）
  const lore = loreOnly(mdSection(md, '人物设定与考据', 6000));
  if (lore) out.push(`【性格与设定】${lore}`);

  // 人物经历（剧情梗概，含剧透）
  const story = mdSection(md, '人物经历', 1600);
  if (story) out.push(`【人物经历】${story}`);

  // 特殊形态（换装／异世界线等）
  const forms = mdSection(md, '特殊形态说明', 400);
  if (forms) out.push(`【特殊形态】${forms}`);

  return out.join('\n');
}

/**
 * 从「人物设定与考据」里保留性格/关系/习惯，去掉立绘、光环配色、武器考据这类设计向内容。
 * 用户要求「越详细越好」，所以这里放宽：只砍明显无关的句子。
 */function loreOnly(text) {
  if (!text) return '';
  const t = text.split(/相关考据|专武考据|武器相关|人设相关|杂谈|具体考证|参见：/)[0];
  const KILL = /(光环(为|是|的)?|立绘|贺图|记忆大厅|概念设计|SD机型|设定集|画风|发夹|蝴蝶结|过膝袜|长靴|包臀裙|和服|泳装立绘|图片|CG)/;
  // 性格/关系信号词：用来跳过前面的外貌描写，从真正讲性格的地方开始
  const GOOD = /(性格|为人|待人|说话|口癖|语气|关系|朋友|伙伴|好友|青梅竹马|喜欢|讨厌|害怕|认真|温柔|暴躁|开朗|内向|沉默|慵懒|努力|天才|笨蛋|要强|傲娇|可靠|冷静|活泼|胆小|冒失|责任感|正义感|敌对|上司|部下|照顾|尊敬)/;
  const sentences = t
    .split(/[。；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10 && s.length <= 180)
    .filter((s) => !KILL.test(s));
  const start = sentences.findIndex((s) => GOOD.test(s));
  const picked = start > 0 ? sentences.slice(start) : sentences;
  let joined = picked.join('。');
  if (joined.length < 12) return '';
  if (joined.length > 900) joined = joined.slice(0, 900) + '…';
  return joined;
}

const chars = [];
const dirs = fs.readdirSync(DATA_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
let idx = 0;
for (const e of dirs) {
  const dir = path.join(DATA_DIR, e.name);
  const dataFile = path.join(dir, '数据.json');
  if (!fs.existsSync(dataFile)) continue;
  let j;
  try { j = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { continue; }
  const units = Array.isArray(j.units) ? j.units : [];
  // 优先取基础形态（名字不含括号「（」），变体如「XX（体操服）」会带括号）
  const u = units.find((x) => x.Name && !String(x.Name).includes('（')) || units[0] || {};
  const name = u.Name || e.name;
  const school = schoolName(u.School);
  const hobby = u.Hobby || '';
  // 用「人物设定.md」的完整资料（基本资料表 + 简介 + 性格考据）组装详细人设
  let persona = '';
  const mdFile = path.join(dir, '人物设定.md');
  if (fs.existsSync(mdFile)) {
    try {
      persona = buildDetailedPersona(fs.readFileSync(mdFile, 'utf8').replace(/\r/g, ''), {
        name,
        school,
        hobby,
      });
    } catch {}
  }
  if (!persona) {
    // 没有 md 时退回 数据.json
    const basics = [name, school, u.CharacterAge, u.Birthday ? `生日 ${u.Birthday}` : '', hobby ? `兴趣：${hobby}` : ''].filter(Boolean);
    persona = [`【基本信息】${basics.join(' · ')}`, u.ProfileIntroduction ? `【人物简介】${String(u.ProfileIntroduction).trim()}` : '']
      .filter(Boolean)
      .join('\n');
  }
  // 按要求：去掉每个角色的开场白
  const greeting = '';
  const pathName = sanitizeAssetName(u.PathName || u.DevName || `char_${idx}`);

  const avatarSrc = findAvatar(dir);
  let avatarAsset = null;
  if (avatarSrc) {
    const dst = path.join(ASSET_DIR, `${pathName}.png`);
    fs.copyFileSync(avatarSrc, dst);
    avatarAsset = pathName;
  }

  const rel = fs.existsSync(mdFile)
    ? relationSources(fs.readFileSync(mdFile, 'utf8').replace(/\r/g, ''))
    : { club: '', story: '', explicit: '' };

  chars.push({
    id: `char_ba_${idx}`,
    name, school, persona, greeting, hobby, asset: avatarAsset, key: pathName,
    rel,
    featured: FEATURED.has(e.name),
    folder: e.name,
  });
  idx++;
}

// 2) 剧情人物 + 当代配角学生（只有 人物设定.md + 头像，无 数据.json）
for (const sub of ['剧情人物', '当代配角学生']) {
  const subDir = path.join(DATA_DIR, sub);
  if (!fs.existsSync(subDir)) continue;
  for (const e of fs.readdirSync(subDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(subDir, e.name);
    const mdFile = path.join(dir, '人物设定.md');
    let name = e.name;
    let persona = '';
    if (fs.existsSync(mdFile)) {
      const md = fs.readFileSync(mdFile, 'utf8').replace(/\r/g, '');
      const t = md.match(/^#\s*(.+)$/m);
      if (t) name = t[1].trim();
      persona = buildDetailedPersona(md, { name, school: sub === '剧情人物' ? '剧情人物' : '当代配角学生', hobby: '' });
      if (!persona) persona = extractMdPersona(md);
    }
    const tag = sub === '剧情人物' ? '剧情人物' : '当代配角学生';
    if (!persona) persona = `${name}，基沃托斯${tag}。`;
    const pathName = sanitizeAssetName(`${sub}_${idx}`);
    const avatarSrc = findAvatar(dir);
    let avatarAsset = null;
    if (avatarSrc) {
      const dst = path.join(ASSET_DIR, `${pathName}.png`);
      fs.copyFileSync(avatarSrc, dst);
      avatarAsset = pathName;
    }
    const mdPath2 = path.join(dir, '人物设定.md');
    const rel2 = fs.existsSync(mdPath2)
      ? relationSources(fs.readFileSync(mdPath2, 'utf8').replace(/\r/g, ''))
      : { club: '', story: '', explicit: '' };
    chars.push({
      id: `char_ba_${idx}`,
      name, school: tag, persona, greeting: '', hobby: '',
      asset: avatarAsset, key: pathName, rel: rel2, featured: false, folder: e.name,
    });
    idx++;
  }
}

// 3) 推导并追加「人际关系」
(function buildRelations() {
  const allNames = chars.map((c) => c.name).filter((n) => n && n.length >= 2);
  const isSpecial = (s) => !s || s.length < 2 || /剧情人物|当代配角/.test(s);

  for (const c of chars) {
    const r = c.rel || { club: '', story: '', explicit: '' };
    const story = r.story || '';

    // 剧情共现：自己的剧情/简介/考据里提到的其他角色名
    const related = allNames.filter((n) => n !== c.name && story.includes(n)).slice(0, 14);
    // 同社团
    const sameClub = r.club
      ? chars.filter((x) => x !== c && x.rel && x.rel.club === r.club).map((x) => x.name).slice(0, 10)
      : [];
    // 同校
    const sameSchool = isSpecial(c.school)
      ? []
      : chars.filter((x) => x !== c && x.school === c.school).map((x) => x.name).slice(0, 12);

    const blocks = [];
    if (r.explicit) blocks.push(`【人际关系】${r.explicit.slice(0, 700)}`);

    const circle = [];
    if (sameClub.length) circle.push(`同社团（${r.club}）：${sameClub.join('、')}`);
    if (related.length) circle.push(`剧情相关：${related.join('、')}`);
    if (sameSchool.length) circle.push(`同校（${c.school}）：${sameSchool.join('、')}`);
    if (circle.length) blocks.push(`【人际圈】${circle.join(' ｜ ')}`);

    if (blocks.length) {
      c.persona = `${c.persona}\n${blocks.join('\n')}`;
    }
  }
})();

// 生成 TS 数据文件
const L = [];
L.push(`// 碧蓝档案「默认对话」内置角色（全部 ${chars.length} 个，由 scripts/build-bluearchive-preset.js 生成）`);
L.push(`import { Character, Chat, GroupMember } from '../types';`);
L.push(`import { Image } from 'react-native';`);
L.push(`import { BLUE_ARCHIVE_BASE_PROMPT, BLUE_ARCHIVE_STATUS_VARS, BLUE_ARCHIVE_CSS_SIDEBAR } from './blueArchive';`);
L.push(``);
L.push(`const assetUri = (m: number): string => Image.resolveAssetSource(m as any).uri;`);
L.push(``);
L.push(`export const blueArchivePresetCharacters: Character[] = [`);

for (const c of chars) {
  const avatarExpr = c.asset ? `assetUri(require('../../assets/bluearchive/${c.asset}.png'))` : `''`;
  L.push(`  {`);
  L.push(`    id: '${c.id}',`);
  L.push(`    name: ${JSON.stringify(c.name)},`);
  L.push(`    description: ${JSON.stringify(c.persona || `${c.name}，${c.school}的学生。`)},`);
  L.push(`    personality: '',`);
  L.push(`    scenario: ${JSON.stringify(`基沃托斯学园都市，${c.school}。`)},`);
  L.push(`    greeting: ${JSON.stringify(c.greeting)},`);
  L.push(`    avatar: ${avatarExpr},`);
  L.push(`    systemPrompt: BLUE_ARCHIVE_BASE_PROMPT,`);
  L.push(`    tags: [${JSON.stringify(c.school)}, '碧蓝档案'],`);
  L.push(`    isPreset: true, isFavorite: false, createdAt: Date.now(), updatedAt: Date.now(),`);
  L.push(`    statusBar: { enabled: true, vars: BLUE_ARCHIVE_STATUS_VARS, position: 'top', style: 'inline', animation: 'none' },`);
  L.push(`  },`);
}
L.push(`];`);
L.push(``);
const featuredIds = chars.filter((c) => c.featured).map((c) => c.id);
L.push(`const featuredIds = new Set(${JSON.stringify(featuredIds)});`);
L.push(``);

L.push(`/** 默认碧蓝档案群聊（首次启动时创建；全部角色都在群里，精选角色默认发言，其余默认静音） */`);
L.push(`export function buildDefaultBlueArchiveGroupChat(): Chat {`);
L.push(`  const now = Date.now();`);
L.push(`  const members: GroupMember[] = blueArchivePresetCharacters.map((ch, i) => ({`);
L.push(`    id: 'm_ba_' + i + '_' + now,`);
L.push(`    characterId: ch.id,`);
L.push(`    name: ch.name,`);
L.push(`    avatar: ch.avatar,`);
L.push(`    settings: {`);
L.push(`      memoryLength: 20, autoSummarize: false, autoSummarizeThreshold: 10, streamOutput: true,`);
L.push(`      maxImagesPerMessage: 3, sendImagesInContext: true, imageHistoryCount: 10,`);
L.push(`      systemPrompt: ch.description, userPersona: '', prePrompt: '', postPrompt: '',`);
L.push(`      summaryPrompt: '请总结以上对话的要点。', imageGenerationPrompt: '', autoImageGeneration: false,`);
L.push(`      regexRules: [], customCSS: '', globalCSS: '', cssEntries: [], blockWords: [],`);
L.push(`      suggestedQuestionsEnabled: true, greeting: '', greetingEnabled: false,`);
L.push(`      statusBar: { enabled: true, vars: BLUE_ARCHIVE_STATUS_VARS, position: 'top', style: 'inline', animation: 'none' },`);
L.push(`      predictionConfig: { enabled: true, mode: 'per_turn', maxMessages: 2, prompt: '' },`);
L.push(`    },`);
L.push(`    isActive: featuredIds.has(ch.id), autoRespond: true, joinOrder: i,`);
L.push(`  }));`);
L.push(`  return {`);
L.push(`    id: 'group_ba_default_' + now,`);
L.push(`    title: '碧蓝档案 AI 模拟',`);
L.push(`    messages: [{`);
L.push(`      id: 'group_ba_msg_' + now,`);
L.push(`      role: 'assistant',`);
L.push(`      content: '基沃托斯学园都市的同学们已经上线啦！老师，今天想和谁聊聊呢？',`);
L.push(`      images: [], timestamp: now,`);
L.push(`    }],`);
L.push(`    createdAt: now, updatedAt: now, worldBookIds: [],`);
L.push(`    settings: {`);
L.push(`      memoryLength: 30, autoSummarize: false, autoSummarizeThreshold: 10, streamOutput: true,`);
L.push(`      maxImagesPerMessage: 3, sendImagesInContext: true, imageHistoryCount: 10,`);
L.push(`      systemPrompt: BLUE_ARCHIVE_BASE_PROMPT, userPersona: '', prePrompt: '', postPrompt: '',`);
L.push(`      summaryPrompt: '请总结以上对话的要点。', imageGenerationPrompt: '', autoImageGeneration: false,`);
L.push(`      regexRules: [], customCSS: '', globalCSS: '',`);
L.push(`      cssEntries: [{ id: 'css_ba_map_sidebar', name: '碧蓝档案地图侧边栏', css: BLUE_ARCHIVE_CSS_SIDEBAR, enabled: true, scope: 'global' as const }], blockWords: [],`);
L.push(`      suggestedQuestionsEnabled: true, greeting: '', greetingEnabled: false,`);
L.push(`      statusBar: { enabled: true, vars: BLUE_ARCHIVE_STATUS_VARS, position: 'top', style: 'inline', animation: 'none' },`);
L.push(`      predictionConfig: { enabled: true, mode: 'per_turn', maxMessages: 2, prompt: '' },`);
L.push(`    },`);
L.push(`    conversationType: 'group',`);
L.push(`    groupMembers: members,`);
L.push(`    isPinned: false,`);
L.push(`  };`);
L.push(`}`);
L.push(``);

fs.writeFileSync(OUT_TS, L.join('\n'), 'utf8');
console.log(`已生成 ${chars.length} 个内置角色 -> ${OUT_TS}`);
console.log(`其中默认发言（精选）: ${chars.filter((c) => c.featured).map((c) => c.name).join('、')}`);
