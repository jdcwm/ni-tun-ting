const fs = require('fs');
const s = fs.readFileSync('src/data/blueArchiveData.ts', 'utf8');
const entries = [...s.matchAll(/name: "((?:[^"\\]|\\.)*)",\n\s*description: "((?:[^"\\]|\\.)*)"/g)].map((m) => ({
  name: JSON.parse('"' + m[1] + '"'),
  desc: JSON.parse('"' + m[2] + '"'),
}));

const targets = process.argv.slice(2);
if (targets.length) {
  for (const n of targets) {
    const e = entries.find((x) => x.name === n);
    console.log(`\n=== ${n} ===`);
    console.log(e ? e.desc : '未找到');
  }
} else {
  const e = entries.find((x) => x.name === '白子');
  console.log(e ? e.desc : '未找到');
}

console.log('\n===== 统计 =====');
console.log('角色数:', entries.length);
const lens = entries.map((e) => e.desc.length);
console.log('平均人设长度:', Math.round(lens.reduce((a, b) => a + b, 0) / lens.length), '字');
console.log('最短:', Math.min(...lens), ' 最长:', Math.max(...lens));
for (const tag of ['【基本信息】', '【所属】', '【外貌】', '【兴趣】', '【别号】', '【萌点】', '【人物简介】', '【性格与设定】', '【人物经历】', '【特殊形态】', '【人际关系】', '【人际圈】']) {
  console.log(tag, entries.filter((e) => e.desc.includes(tag)).length);
}
console.log('残留 CV/绘师:', entries.filter((e) => e.desc.includes('【CV')).length);
