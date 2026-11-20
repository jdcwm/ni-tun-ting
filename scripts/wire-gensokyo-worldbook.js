// 把 gensokyoData.ts 里内联的 gensokyoWorldBookEntries 换成引用生成的数据文件
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'src', 'data', 'gensokyoData.ts');

let src = fs.readFileSync(F, 'utf8');

const START = 'export const gensokyoWorldBookEntries: WorldBookEntry[] = [';
const i = src.indexOf(START);
if (i < 0) {
  console.log('已经是引用形式，或找不到数组起点；未修改。');
  process.exit(0);
}
const j = src.indexOf('\n];', i);
if (j < 0) {
  console.error('找不到数组结尾');
  process.exit(1);
}

const replacement =
  'export const gensokyoWorldBookEntries: WorldBookEntry[] = gensokyoGeneratedEntries;';
src = src.slice(0, i) + replacement + src.slice(j + 3);

// 顶部加 import（放在第一条 import 之后，没有 import 就放最前面）
const IMPORT_LINE =
  "import { gensokyoWorldBookEntries as gensokyoGeneratedEntries } from './gensokyoWorldBookData';\n";
if (!src.includes('gensokyoWorldBookData')) {
  const m = src.match(/^import[\s\S]*?;\n/m);
  if (m) {
    src = src.slice(0, m.index + m[0].length) + IMPORT_LINE + src.slice(m.index + m[0].length);
  } else {
    src = IMPORT_LINE + src;
  }
}

fs.writeFileSync(F, src, 'utf8');
console.log('已替换。新文件行数:', src.split('\n').length);
