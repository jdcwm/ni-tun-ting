// 主机侧验证解压管线：直接调用 App 里的 zipUtils（同一份实现）。
// 用法: node scripts/test-era-archives.js <压缩包路径> [...]
const fs = require('fs');
const path = require('path');
const {
  detectArchiveFormat,
  parseZip,
  parseTar,
  gunzip,
} = require('../.tmp-eratest/zipUtils.js');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('用法: node scripts/test-era-archives.js <压缩包> [...]');
  process.exit(1);
}

const fmtMB = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;

let pass = 0;
let fail = 0;

for (const f of files) {
  const name = path.basename(f);
  console.log(`\n════════ ${name} ════════`);
  if (!fs.existsSync(f)) {
    console.log('  ✗ 文件不存在');
    fail++;
    continue;
  }

  const buf = new Uint8Array(fs.readFileSync(f));
  const format = detectArchiveFormat(buf);
  console.log(`  大小 ${fmtMB(buf.length)}  魔数识别: ${format}`);

  try {
    let entries;
    let label = format;
    if (format === 'zip') {
      entries = parseZip(buf);
    } else if (format === 'tar') {
      entries = parseTar(buf);
    } else if (format === 'gzip') {
      const inner = gunzip(buf);
      const innerFmt = detectArchiveFormat(inner);
      console.log(`  解压后 ${fmtMB(inner.length)}  内层: ${innerFmt}`);
      if (innerFmt === 'tar') {
        entries = parseTar(inner);
        label = 'tar.gz';
      } else {
        console.log('  ✓ gzip 解压成功（单文件）');
        pass++;
        continue;
      }
    } else {
      console.log(`  ✗ 不支持的格式: ${format}`);
      fail++;
      continue;
    }

    const dirs = entries.filter((e) => e.isDirectory).length;
    const filesOnly = entries.filter((e) => !e.isDirectory);
    console.log(`  条目 ${entries.length}（目录 ${dirs} / 文件 ${filesOnly.length}）`);

    // 关键文件抽样：验证 getData() 真能解出内容（deflate 实现正确性）
    const samples = filesOnly.slice(0, 3).concat(filesOnly.slice(-2));
    let okSamples = 0;
    for (const e of samples) {
      try {
        const data = e.getData();
        if (data && data.length > 0) okSamples++;
      } catch (err) {
        console.log(`    ✗ ${e.name}: ${err.message}`);
      }
    }
    console.log(`  抽样解压 ${okSamples}/${samples.length} 成功`);

    // era 游戏判定：找 ERB / CSV / .ERB 目录结构
    const erbCount = filesOnly.filter((e) => /\.erb$/i.test(e.name)).length;
    const csvCount = filesOnly.filter((e) => /\.csv$/i.test(e.name)).length;
    const hasEra = filesOnly.some((e) => /(^|\/)ERB\//i.test(e.name)) || erbCount > 0;
    console.log(`  ERB ${erbCount} 个 / CSV ${csvCount} 个  →  ${hasEra ? '✓ 像 era 游戏' : '? 未发现 ERB'}`);

    const top = Array.from(new Set(entries.map((e) => e.name.split('/')[0]))).slice(0, 6);
    console.log(`  顶层: ${top.join(', ')}`);

    if (okSamples === samples.length && entries.length > 0) {
      console.log(`  ✓ ${label} 解析通过`);
      pass++;
    } else {
      console.log(`  ✗ ${label} 解析有问题`);
      fail++;
    }
  } catch (err) {
    console.log(`  ✗ 异常: ${err.message}`);
    fail++;
  }
}

console.log(`\n════════ 汇总：通过 ${pass} / 失败 ${fail} ════════`);
