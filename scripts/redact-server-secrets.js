// 把 server/ 里写死的默认账号密码 / JWT 密钥清理掉，改为必须由环境变量提供
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'server');

const edits = [
  {
    file: 'setup-admin.js',
    pairs: [
      ['// - 密码重置为 12qwaszx', '// - 密码由环境变量 ADMIN_PASSWORD 指定（必填）'],
      [
        "const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12qwaszx';",
        "const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;\nif (!ADMIN_PASSWORD) {\n  console.error('请通过环境变量提供管理员密码：ADMIN_PASSWORD=xxx node setup-admin.js');\n  process.exit(1);\n}",
      ],
    ],
  },
  {
    file: 'deploy.sh',
    pairs: [
      ['#     ADMIN_PASSWORD 管理员密码，默认 12qwaszx', '#     ADMIN_PASSWORD 管理员密码（必填，不再提供默认值）'],
      [
        'ADMIN_PASSWORD="${ADMIN_PASSWORD:-12qwaszx}"',
        'ADMIN_PASSWORD="${ADMIN_PASSWORD:?请设置 ADMIN_PASSWORD（管理员密码）}"',
      ],
    ],
  },
  {
    file: 'deploy.bat',
    pairs: [
      ['REM     ADMIN_PASSWORD 管理员密码，默认 12qwaszx', 'REM     ADMIN_PASSWORD 管理员密码（必填，不再提供默认值）'],
      [
        'if "%ADMIN_PASSWORD%"=="" set "ADMIN_PASSWORD=12qwaszx"',
        'if "%ADMIN_PASSWORD%"=="" (\n  echo [错误] 请先设置管理员密码: set ADMIN_PASSWORD=你的密码\n  exit /b 1\n)',
      ],
    ],
  },
  {
    file: 'server.js',
    pairs: [
      [
        "const JWT_SECRET = process.env.JWT_SECRET || 'aitavern-secret-key-2024';",
        "const JWT_SECRET = process.env.JWT_SECRET;\nif (!JWT_SECRET) {\n  console.error('请通过环境变量提供 JWT_SECRET（随便一串足够长的随机字符）');\n  process.exit(1);\n}",
      ],
    ],
  },
];

for (const { file, pairs } of edits) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    console.log('跳过（不存在）:', file);
    continue;
  }
  let s = fs.readFileSync(p, 'utf8');
  let n = 0;
  for (const [from, to] of pairs) {
    if (s.includes(from)) {
      s = s.split(from).join(to);
      n++;
    }
  }
  fs.writeFileSync(p, s, 'utf8');
  console.log(`${file}: 替换 ${n} 处`);
}
