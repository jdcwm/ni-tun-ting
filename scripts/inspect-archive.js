const fs = require('fs');
const path = require('path');
const { parseZip, detectArchiveFormat, gunzip, parseTar } = require('../.tmp-eratest/zipUtils.js');

const f = process.argv[2];
const limit = Number(process.argv[3] || 40);
const buf = new Uint8Array(fs.readFileSync(f));
const fmt = detectArchiveFormat(buf);
const entries = fmt === 'zip' ? parseZip(buf) : fmt === 'tar' ? parseTar(buf) : parseTar(gunzip(buf));

console.log(`格式 ${fmt}  条目 ${entries.length}`);
const names = entries.map((e) => e.name);
const tops = {};
for (const n of names) {
  const p = n.split('/');
  const key = p.length > 1 ? p[0] : '(根)';
  tops[key] = (tops[key] || 0) + 1;
}
console.log('顶层分布:');
Object.entries(tops)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([k, v]) => console.log(`  ${k}  ${v}`));

console.log('\n前若干条目:');
names.slice(0, limit).forEach((n) => console.log('  ' + n));

const exts = {};
for (const n of names) {
  const m = n.match(/\.([A-Za-z0-9_]+)$/);
  const ext = m ? m[1].toLowerCase() : '(无)';
  exts[ext] = (exts[ext] || 0) + 1;
}
console.log('\n扩展名分布:');
Object.entries(exts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
  .forEach(([k, v]) => console.log(`  .${k}  ${v}`));

// 关键文件
const key = names.filter((n) => /(^|\/)(ERB|CSV|erb|emu|gamebase)/i.test(n)).slice(0, 10);
console.log('\n关键文件:', key.join(', ') || '(无)');
