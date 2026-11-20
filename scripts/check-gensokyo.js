const fs = require('fs');
const s = fs.readFileSync('src/data/gensokyoWorldBookData.ts', 'utf8');
const entries = [...s.matchAll(/id: '(wb_gensokyo_(?:loc|char)_\d+)',\n\s*keys: (\[[^\]]*\]),\n\s*content: "((?:[^"\\]|\\.)*)"/g)].map((m) => ({
  id: m[1],
  keys: JSON.parse(m[2]),
  content: JSON.parse('"' + m[3] + '"'),
}));

const want = process.argv.slice(2);
if (want.length) {
  for (const w of want) {
    const e =
      entries.find((x) => x.content.startsWith(`【${w}】`)) ||
      entries.find((x) => x.content.startsWith(`【地点】${w}`)) ||
      entries.find((x) => x.content.includes(`【地点】${w}（`)) ||
      entries.find((x) => x.id.includes(w));
    console.log(`\n════════ ${w} ════════`);
    console.log(e ? `keys: ${e.keys.join(' / ')}\n${e.content}` : '未找到');
  }
} else {
  const e = entries.find((x) => x.content.includes('鲵吞亭'));
  console.log(e ? e.content : '未找到');
}

console.log('\n===== 统计 =====');
const locs = entries.filter((e) => e.id.includes('_loc_'));
const chars = entries.filter((e) => e.id.includes('_char_'));
console.log('地点:', locs.length, ' 角色:', chars.length);
const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1));
console.log('地点平均字数:', avg(locs.map((e) => e.content.length)), ' 角色平均字数:', avg(chars.map((e) => e.content.length)));
for (const tag of ['相关设定', '相关角色', '核心描述', '外观', '人际关系', '能力']) {
  console.log(`含「${tag}」的角色条目:`, chars.filter((e) => e.content.includes(tag)).length);
}
console.log('含「相关设定」的地点条目:', locs.filter((e) => e.content.includes('相关设定')).length);
console.log('内容过短(<60字)的条目:', entries.filter((e) => e.content.length < 60).length);
