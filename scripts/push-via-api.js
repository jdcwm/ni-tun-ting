/**
 * 通过 GitHub REST API 上传整个仓库（绕过 github.com 被墙的问题）。
 *
 * github.com 的 git 协议不可达，但 api.github.com 通，
 * 所以用 Git Data API：逐个文件建 blob → 建 tree → 建 commit → 更新 ref。
 *
 * 用法：
 *   $env:GH_TOKEN="github_pat_xxx"; node scripts/push-via-api.js <owner/repo>
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error('缺少环境变量 GH_TOKEN');
  process.exit(1);
}
const REPO = process.argv[2] || 'jdcwm/ni-tun-ting';
const BRANCH = 'main';
const ROOT = path.join(__dirname, '..');

const api = async (method, url, body) => {
  const res = await fetch(`https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ai-tavern-uploader',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.message || text.slice(0, 300);
    throw new Error(`${method} ${url} → HTTP ${res.status}: ${msg}`);
  }
  return json;
};

(async () => {
  console.log(`仓库: ${REPO}  分支: ${BRANCH}`);

  // 1) 取被 git 跟踪的文件（含模式，用来区分可执行文件）
  const ls = execSync('git ls-files -s', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\n')
    .filter(Boolean);

  const entries = [];
  let totalBytes = 0;
  let done = 0;
  const startedAt = Date.now();

  for (const line of ls) {
    // 100644 <sha> 0\t<path>
    const m = line.match(/^(\d{6})\s+[0-9a-f]+\s+\d+\t(.+)$/);
    if (!m) continue;
    const [, mode, rel] = m;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;

    const buf = fs.readFileSync(abs);
    totalBytes += buf.length;

    const blob = await api('POST', `/repos/${REPO}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    });

    entries.push({
      path: rel.split(path.sep).join('/'),
      mode,
      type: 'blob',
      sha: blob.sha,
    });

    done++;
    if (done % 20 === 0 || done === ls.length) {
      process.stdout.write(`  已上传 ${done} 个文件…\n`);
    }
  }

  console.log(`共 ${entries.length} 个文件，${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

  // 2) 建 tree
  const tree = await api('POST', `/repos/${REPO}/git/trees`, { tree: entries });
  console.log('tree:', tree.sha);

  // 3) 建 commit（根提交，无父）
  const msg = execSync('git log -1 --pretty=%B', { cwd: ROOT }).toString('utf8').trim();
  const commit = await api('POST', `/repos/${REPO}/git/commits`, {
    message: msg || '鲵吞亭 v3.9.15',
    tree: tree.sha,
    parents: [],
  });
  console.log('commit:', commit.sha);

  // 4) 更新分支
  try {
    await api('POST', `/repos/${REPO}/git/refs`, {
      ref: `refs/heads/${BRANCH}`,
      sha: commit.sha,
    });
    console.log(`已创建分支 ${BRANCH}`);
  } catch (e) {
    await api('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
    console.log(`已更新分支 ${BRANCH}`);
  }

  const sec = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n✓ 完成，用时 ${sec}s`);
  console.log(`  https://github.com/${REPO}`);
})().catch((e) => {
  console.error('\n✗ 失败:', e.message);
  process.exit(1);
});
