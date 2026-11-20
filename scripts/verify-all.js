/**
 * 跑全部本地校验。
 *
 *   node scripts/verify-all.js
 *
 * 这三件事都不需要真机、不需要 Gradle：
 *   1. tsc 类型检查
 *   2. verify-ui.js        桥运行时/模板组装/界面指令（会真正执行生成的 JS）
 *   3. verify-release-safety.js  发布包不含测试账号后门
 *
 * 真机上还需要确认的项见《真机验证清单.md》。
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const node = process.execPath;

/** 直接跑 node_modules 里的 tsc，避免 shell/npx 在 Windows 上的引号与弃用警告问题 */
const tscBin = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');

const steps = [
  {
    name: 'TypeScript 类型检查',
    run: () => {
      if (!fs.existsSync(tscBin)) {
        console.error('  找不到 node_modules/typescript/bin/tsc，请先 npm install');
        return { status: 1 };
      }
      return spawnSync(node, [tscBin, '--noEmit'], { cwd: projectRoot, stdio: 'inherit' });
    },
  },
  {
    name: '界面/指令校验 (verify-ui)',
    run: () => spawnSync(node, [path.join(__dirname, 'verify-ui.js')], { cwd: projectRoot, stdio: 'inherit' }),
  },
  {
    name: '发布包安全校验 (verify-release-safety)',
    run: () =>
      spawnSync(node, [path.join(__dirname, 'verify-release-safety.js')], {
        cwd: projectRoot,
        stdio: 'inherit',
      }),
  },
];

const results = [];
for (const step of steps) {
  console.log('\n' + '='.repeat(56));
  console.log('  ' + step.name);
  console.log('='.repeat(56));
  const r = step.run();
  results.push({ name: step.name, code: r.status == null ? 1 : r.status });
}

console.log('\n' + '='.repeat(56));
console.log('  汇总');
console.log('='.repeat(56));
let failed = 0;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}   ${r.name}`);
}

if (failed === 0) {
  console.log('\n全部通过。真机项见《真机验证清单.md》。');
} else {
  console.log(`\n${failed} 项失败。`);
  process.exit(1);
}
