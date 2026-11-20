/**
 * 发布包安全校验。
 *
 *   node scripts/verify-release-safety.js
 *
 * 背景：src/services/authApi.ts 里有一个本地测试账号 111/0000，
 * 它直接给出 isAdmin=true 且不联系服务器 —— 相当于发布版里的管理员后门。
 * 现在用 __DEV__ 把它限制在开发构建里。这个脚本负责确认：
 * 「release bundle 里真的找不到这个后门」。
 *
 * 之所以要单独校验：__DEV__ 的消除依赖 Metro 的 dead-code elimination，
 * 改打包配置、换 bundler 版本都可能让消除失效，而这是安全属性，值得有回归测试。
 *
 * 会临时生成一份 release bundle（约 4MB，几十秒），校验完即删。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-safety-'));

/** 后门特征：只要这些字符串出现在产物里，就说明 __DEV__ 分支没被消除 */
const FORBIDDEN = [
  'local-fake-token-111',
  'local://fake-server',
  '测试账号（开发）',
];

let failures = 0;
const check = (label, fn) => {
  try {
    fn();
    console.log(`  OK   ${label}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${label}: ${e.message}`);
  }
};

console.log('=== 生成 release bundle（--dev false）===');
const bundlePath = path.join(outDir, 'index.bundle');
let bundle = '';
try {
  // 直接用 node 跑 react-native 的 cli.js。
  // 不用 npx：Node 24 + Windows 下 spawnSync('npx.cmd') 会 EINVAL（需要 shell，
  // 而 shell 又会引入引号转义问题）。
  const cli = path.join(projectRoot, 'node_modules', 'react-native', 'cli.js');
  execFileSync(
    process.execPath,
    [
      cli,
      'bundle',
      '--platform', 'android',
      '--dev', 'false',
      '--entry-file', 'index.ts',
      '--bundle-output', bundlePath,
      '--assets-dest', path.join(outDir, 'assets'),
    ],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
    },
  );
  bundle = fs.readFileSync(bundlePath, 'utf8');
  console.log(`  OK   bundle 生成成功 (${(bundle.length / 1024 / 1024).toFixed(2)} MB)`);
} catch (e) {
  const stderr = e.stderr ? String(e.stderr) : '';
  console.error('  FAIL 生成 bundle 失败：', e.message);
  if (stderr) console.error(stderr.split('\n').slice(-15).join('\n'));
  process.exit(1);
}

console.log('=== 校验 ===');

check('release bundle 里不存在后门凭据/会话标记', () => {
  const hit = FORBIDDEN.filter((s) => bundle.includes(s));
  if (hit.length) {
    throw new Error('__DEV__ 分支未被消除，产物里仍有: ' + hit.join(' | '));
  }
});

check('确认 authApi 源码里确实用了 __DEV__ 守卫（防止有人把守卫删掉）', () => {
  const src = fs.readFileSync(
    path.join(projectRoot, 'src', 'services', 'authApi.ts'),
    'utf8',
  );
  if (!/__DEV__\s*&&[^\n]*'111'/.test(src)) {
    throw new Error('authApi.ts 里的 111/0000 分支没有 __DEV__ 守卫');
  }
});

check('release bundle 数量级正常（没被异常缩小/截断）', () => {
  const mb = bundle.length / 1024 / 1024;
  if (mb < 2) throw new Error(`bundle 只有 ${mb.toFixed(2)} MB，可能打包不完整`);
});

// 清理
try {
  fs.rmSync(outDir, { recursive: true, force: true });
} catch {
  /* 临时目录清不掉不影响结论 */
}

console.log('');
if (failures === 0) {
  console.log('全部通过：发布包中不含本地测试账号后门。');
} else {
  console.log(`失败 ${failures} 项。`);
  process.exit(1);
}
