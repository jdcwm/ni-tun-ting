// 把「官方表情包」里命名可用、体积合理的表情挑出来内置到 App：
//  1) 复制到 assets/emojis/
//  2) 生成 src/data/emojiPack.ts（名字 → require 模块）
// 用法：node scripts/build-emoji-pack.js "C:\...\碧蓝档案角色资料\官方表情包"
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
if (!SRC) { console.error('用法: node build-emoji-pack.js <官方表情包目录>'); process.exit(1); }

const ASSET_DIR = path.join(__dirname, '..', 'assets', 'emojis');
const OUT_TS = path.join(__dirname, '..', 'src', 'data', 'emojiPack.ts');
const MAX_BYTES = 1500 * 1024; // 单个文件上限 1.5MB（排除少数 2.5-3.7MB 的巨型 gif）

fs.rmSync(ASSET_DIR, { recursive: true, force: true });
fs.mkdirSync(ASSET_DIR, { recursive: true });

const EXT_OK = new Set(['.png', '.gif', '.jpg', '.jpeg', '.webp']);
/** 只排除纯 hash / uuid / 超长数字名（这些名字 AI 没法用，也占提示词） */
function usableName(base) {
  const b = String(base).trim();
  if (!b) return false;
  if (/^[0-9a-f]{16,}$/i.test(b)) return false;          // hash
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(b)) return false; // uuid
  return true;
}
/** 把文件名清理成素材库友好的名字（保留中文，去掉序号后缀/空格） */
function cleanName(base) {
  return base
    .replace(/\(\d+\)/g, '')             // 去掉 (1)
    .replace(/[\s"'<>#?&\\/@]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || base.slice(0, 30);
}

const picked = [];
const seen = new Set();
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    const ext = path.extname(e.name).toLowerCase();
    if (!EXT_OK.has(ext)) continue;
    const base = path.basename(e.name, ext);
    if (!usableName(base)) continue;
    const size = fs.statSync(p).size;
    if (size > MAX_BYTES) continue;
    let name = cleanName(base);
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    picked.push({ src: p, name, ext, size });
  }
}
walk(SRC);

// 复制 + 生成 TS
const assetName = (i, ext) => `emoji_${i}${ext}`;
let total = 0;
const L = [];
L.push(`// 内置表情包清单（由 scripts/build-emoji-pack.js 生成，共 ${picked.length} 个）`);
L.push(`// 名字是「发给 AI 用」的规范名；首次启动会释放到素材库（media://名字）。`);
L.push(`export interface EmojiPackEntry { name: string; module: number; ext: string; }`);
L.push(``);
L.push(`export const EMOJI_PACK: EmojiPackEntry[] = [`);

picked.forEach((it, i) => {
  const an = assetName(i, it.ext);
  fs.copyFileSync(it.src, path.join(ASSET_DIR, an));
  total += it.size;
  L.push(`  { name: ${JSON.stringify(it.name)}, ext: ${JSON.stringify(it.ext)}, module: require('../../assets/emojis/${an}') as unknown as number },`);
});
L.push(`];`);
L.push(``);
L.push(`/** 全部可用的表情名（用于注入提示词，让 AI 只能从中选） */`);
L.push(`export const EMOJI_NAMES: string[] = EMOJI_PACK.map((e) => e.name);`);
L.push(``);

fs.writeFileSync(OUT_TS, L.join('\n'), 'utf8');
console.log(`已内置 ${picked.length} 个表情，共 ${(total / 1024 / 1024).toFixed(1)} MB -> assets/emojis/`);
console.log(`清单 -> ${OUT_TS}`);
console.log(`示例名字：${picked.slice(0, 12).map((p) => p.name).join('、')}`);
