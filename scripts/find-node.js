// 从 uiautomator dump 里按文字找控件中心点：node scripts/find-node.js <xml> <正则>
const fs = require('fs');
const [, , file, pattern] = process.argv;
const xml = fs.readFileSync(file, 'utf8');
const re = /<node\b[^>]*?>/g;
const rx = new RegExp(pattern);
let m;
while ((m = re.exec(xml))) {
  const tag = m[0];
  const t = ((tag.match(/text="([^"]*)"/) || [])[1] || '');
  if (!t || !rx.test(t)) continue;
  const b = (tag.match(/bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"/) || []).slice(1).map(Number);
  if (b.length < 4) continue;
  console.log(`${t}\t${Math.round((b[0] + b[2]) / 2)}\t${Math.round((b[1] + b[3]) / 2)}`);
}
