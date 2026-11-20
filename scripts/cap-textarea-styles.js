// 给「看起来是多行输入框」的共享样式补 maxHeight。
// 规则：样式名命中白名单，且样式体内有 minHeight、没有 maxHeight。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const NAME_RE = /^(textArea|textInput|inputBox|promptInput|contentInput|codeInput|editor|textarea|multilineInput|bigInput)$/i;
const MAX = 240;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

let files = 0;
let total = 0;

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const out = [];
  let n = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)([A-Za-z0-9_]+):\s*\{\s*$/);
    if (!m || !NAME_RE.test(m[2])) {
      out.push(line);
      continue;
    }
    // 找到这个样式体的结束（缩进相同的 }）
    let end = i + 1;
    while (end < lines.length && !new RegExp(`^${m[1]}\\}`).test(lines[end])) end++;
    const body = lines.slice(i + 1, end).join('\n');

    out.push(line);
    if (/minHeight/.test(body) && !/maxHeight/.test(body)) {
      out.push(`${m[1]}  maxHeight: ${MAX},`);
      n++;
    }
    for (let k = i + 1; k <= end && k < lines.length; k++) out.push(lines[k]);
    i = end;
  }

  if (n > 0) {
    fs.writeFileSync(file, out.join('\n'), 'utf8');
    console.log(`${path.relative(ROOT, file)}  +${n}`);
    files++;
    total += n;
  }
}

console.log(`\n共 ${files} 个文件，补了 ${total} 处`);
