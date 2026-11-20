// 一次性初始化脚本：重置 jdcwm 管理员账号
// - 密码由环境变量 ADMIN_PASSWORD 指定（必填）
// - 确认 isAdmin = true
// - 分配 UID 10000（首个管理员固定 UID）
// - 初始化所有数据文件（uid 计数器、好友、社区数据）
//
// 用法：在 server 目录下运行 node setup-admin.js
// 注意：运行前请先关闭服务器，避免文件写入冲突。

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USER_DATA_DIR = path.join(DATA_DIR, 'users');
const POSTS_FILE = path.join(DATA_DIR, 'community-posts.json');
const LIKES_FILE = path.join(DATA_DIR, 'community-likes.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'community-comments.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');
const FRIEND_REQ_FILE = path.join(DATA_DIR, 'friend-requests.json');
const UID_COUNTER_FILE = path.join(DATA_DIR, 'uid-counter.json');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'jdcwm';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('请通过环境变量提供管理员密码：ADMIN_PASSWORD=xxx node setup-admin.js');
  process.exit(1);
}
const ADMIN_UID = Number(process.env.ADMIN_UID) || 10000;

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
const initFile = (file, defaultVal) => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultVal, null, 2));
};
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

const main = async () => {
  console.log('===== 鲵吞亭 初始化管理员脚本 =====');
  console.log(`数据目录: ${DATA_DIR}`);

  ensureDir(DATA_DIR);
  ensureDir(path.join(DATA_DIR, 'uploads'));
  ensureDir(path.join(DATA_DIR, 'cards'));
  ensureDir(USER_DATA_DIR);
  initFile(POSTS_FILE, []);
  initFile(LIKES_FILE, []);
  initFile(COMMENTS_FILE, []);
  initFile(FRIENDS_FILE, []);
  initFile(FRIEND_REQ_FILE, []);

  // 初始化 UID 计数器
  if (!fs.existsSync(UID_COUNTER_FILE)) {
    writeJSON(UID_COUNTER_FILE, { nextUid: 10001 });
    console.log('已创建 uid-counter.json (nextUid=10001)');
  } else {
    const counter = readJSON(UID_COUNTER_FILE);
    if (!counter.nextUid || counter.nextUid <= ADMIN_UID) {
      counter.nextUid = ADMIN_UID + 1;
      writeJSON(UID_COUNTER_FILE, counter);
      console.log(`已修正 uid-counter.nextUid = ${counter.nextUid}`);
    }
  }

  let usersMap;
  if (!fs.existsSync(USERS_FILE)) {
    usersMap = {};
  } else {
    usersMap = readJSON(USERS_FILE);
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  console.log(`新密码哈希: ${hashedPassword}`);

  const existing = usersMap[ADMIN_USERNAME] || {};
  usersMap[ADMIN_USERNAME] = {
    id: existing.id || `u_${ADMIN_USERNAME}`,
    uid: ADMIN_UID,
    username: ADMIN_USERNAME,
    password: hashedPassword,
    nickname: existing.nickname || ADMIN_USERNAME,
    avatar: existing.avatar || null,
    bio: existing.bio || '鲵吞亭社区管理员',
    createdAt: existing.createdAt || Date.now(),
    isAdmin: true,
  };
  writeJSON(USERS_FILE, usersMap);

  const userDataFile = path.join(USER_DATA_DIR, `${ADMIN_USERNAME}.json`);
  if (!fs.existsSync(userDataFile)) {
    writeJSON(userDataFile, { version: 1, exportTime: Date.now(), settings: {}, chats: [], characters: [] });
    console.log(`已创建用户数据文件: ${userDataFile}`);
  } else {
    console.log(`用户数据文件已存在: ${userDataFile} (${fs.statSync(userDataFile).size} 字节)`);
  }

  console.log('\n----- 初始化结果 -----');
  console.log(`管理员账号: ${ADMIN_USERNAME}`);
  console.log(`密码: ${ADMIN_PASSWORD}`);
  console.log(`UID: ${ADMIN_UID}`);
  console.log(`isAdmin: true`);
  console.log(`id: ${usersMap[ADMIN_USERNAME].id}`);
  console.log('----------------------');
  console.log('\n完成。现在可运行「打开服务器.bat」启动服务。');
};

main().catch((err) => {
  console.error('初始化失败:', err);
  process.exit(1);
});
