// 把「碧蓝档案角色资料」目录生成可导入鲵吞亭的角色卡 JSON。
// 用法：node scripts/build-bluearchive-cards.js "C:\...\碧蓝档案角色资料" [输出.json]
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.argv[2];
const OUT_FILE = process.argv[3] || path.join(__dirname, '..', 'bluearchive-cards.json');
if (!DATA_DIR) {
  console.error('用法: node build-bluearchive-cards.js <碧蓝档案角色资料目录> [输出文件]');
  process.exit(1);
}

function findAvatar(dir) {
  // 优先 头像/原始/头像.png，其次任意 头像/*/头像.png
  const candidates = [];
  const avDir = path.join(dir, '头像');
  if (fs.existsSync(avDir)) {
    for (const form of fs.readdirSync(avDir)) {
      const p = path.join(avDir, form, '头像.png');
      if (fs.existsSync(p)) candidates.push(p);
    }
    // 原始优先
    const orig = candidates.find((p) => p.includes('原始'));
    if (orig) return orig;
    if (candidates[0]) return candidates[0];
  }
  return null;
}

function fileToBase64(file) {
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase().slice(1) || 'png';
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`;
}

const BASE_PROMPT = `你是基沃托斯（Kivotos）学园都市里的一名学生，正在和老师（用户）进行即时通讯聊天。

【货币】货币单位是「信用点」。你的角色卡里记录着当前持有的信用点，互动中涉及金钱时请合理增减信用点。

【好感度】你对老师有一个「好感度」数值（-500 ~ 500），分级如下：
死敌(-451~-500) / 敌对(-351~-450) / 讨厌(-251~-350) / 疏远(-151~-250) / 平淡(-150~50) / 靠近(51~150) / 喜欢(151~250) / 亲近(251~350) / 暧昧(351~450) / 热恋(451~500)。
对话中根据老师的言行，自然地、合理地上调或下调好感度（每次小幅变化，不要剧烈跳变）。

【状态栏】每次回复开头，用下面这个格式输出一次状态（一行，简洁）：
[信用点：X] [好感度：X（分级）] [当前场景：简短地点]

【发送表情包/图片】你可以随时在回复里插入 {{ui:img=表情名}} 来给老师发送一张图片/表情包（比如 {{ui:img=白子_微笑}}）。表情名要写素材库里真实存在的名字，指令本身不会显示给用户。想发图时就自然地在合适的位置插入。

【角色】严格按照你的角色卡设定扮演，不要暴露自己是 AI。使用简体中文，像真实学生聊即时通讯一样自然回复，可以简短、口语化、带表情。`;

const STATUS_BAR = {
  enabled: true,
  position: 'top',
  style: 'bar',
  animation: 'none',
  vars: [
    { name: 'credit', label: '信用点', value: 1000, min: 0, max: 999999, type: 'number', color: '#ffd700' },
    { name: 'favorability', label: '好感度', value: 0, min: -500, max: 500, type: 'number', color: '#ff6b9d' },
  ],
};

const cards = [];
const media = [];
const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
for (const e of entries) {
  if (!e.isDirectory()) continue;
  const dir = path.join(DATA_DIR, e.name);
  const dataFile = path.join(dir, '数据.json');
  const mdFile = path.join(dir, '人物设定.md');
  if (!fs.existsSync(dataFile)) continue;

  let d;
  try { d = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { continue; }

  const unit = d.units && d.units[0] ? d.units[0] : {};
  const name = d.character || e.name;
  const gameName = unit.Name || name;
  const school = unit.School || '';
  const age = unit.CharacterAge || '';
  const hobby = unit.Hobby || '';
  const voice = unit.CharacterVoice || unit.CharacterVoice || '';
  const greeting = unit.CharacterSSRNew || '你好，老师。';
  const intro = unit.ProfileIntroduction || '';

  // 从人物设定.md 取「人物简介」段落作为人设补充
  let persona = intro;
  if (fs.existsSync(mdFile)) {
    try {
      const md = fs.readFileSync(mdFile, 'utf8');
      const m = md.match(/###\s*1\.3\s*人物简介\s*\n([\s\S]*?)(?=\n###|\n##|\n---)/);
      if (m) {
        const seg = m[1].replace(/^[\s>]*/g, '').trim();
        if (seg && seg.length > persona.length) persona = seg;
      }
    } catch {}
  }

  const avatarFile = findAvatar(dir);
  const avatar = avatarFile ? fileToBase64(avatarFile) : undefined;

  cards.push({
    name: gameName,
    fullName: name,
    description: persona || `${name}，${school}的学生。`,
    personality: '',
    scenario: `基沃托斯学园都市，${school}。`,
    greeting,
    avatar,
    systemPrompt: BASE_PROMPT,
    statusBar: STATUS_BAR,
    tags: [school, `年龄${age}`, `声优${voice}`].filter(Boolean),
    school,
    age,
    hobby,
    voice,
  });

  // 表情差分 → 素材库清单（供 {{ui:img=名字}} 引用）
  const exprDir = path.join(dir, '表情差分');
  if (fs.existsSync(exprDir)) {
    const walk = (d, out) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p, out);
        else if (/\.(png|jpg|jpeg|webp|gif)$/i.test(f.name)) out.push(p);
      }
      return out;
    };
    for (const ef of walk(exprDir, [])) {
      // 名字：角色名_表情名（去掉扩展名和编号前缀 00_ 01_ 等）
      const rel = path.relative(exprDir, ef);
      const seg = rel.split(path.sep);
      const form = seg[0] && seg[0] !== '原始' ? `_${seg[0]}` : '';
      const emote = path.basename(seg[seg.length - 1], path.extname(seg[seg.length - 1])).replace(/^\d+_/, '');
      media.push({ name: `${gameName}${form}_${emote}`, base64: fileToBase64(ef) });
    }
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(cards, null, 2), 'utf8');
console.log(`已生成 ${cards.length} 张角色卡 -> ${OUT_FILE}`);
if (media.length) {
  const mediaFile = OUT_FILE.replace(/\.json$/, '-media.json');
  fs.writeFileSync(mediaFile, JSON.stringify(media, null, 2), 'utf8');
  console.log(`已生成 ${media.length} 个表情素材 -> ${mediaFile}`);
}
console.log(`示例:`, cards.slice(0, 2).map((c) => c.name).join(', '));
