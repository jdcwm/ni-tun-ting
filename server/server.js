const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('请通过环境变量提供 JWT_SECRET（随便一串足够长的随机字符）');
  process.exit(1);
}

// 数据文件路径
const USERS_FILE = path.join(DATA_DIR, 'users.json');        // { username: { username, password, uid, createdAt, isAdmin } }
const USER_DATA_DIR = path.join(DATA_DIR, 'users');           // per-user JSON 文件（用户数据导出）
const POSTS_FILE = path.join(DATA_DIR, 'community-posts.json');
const LIKES_FILE = path.join(DATA_DIR, 'community-likes.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'community-comments.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');           // 好友关系
const FRIEND_REQ_FILE = path.join(DATA_DIR, 'friend-requests.json'); // 好友申请
const UID_COUNTER_FILE = path.join(DATA_DIR, 'uid-counter.json');    // UID 自增计数器
const CHECKINS_FILE = path.join(DATA_DIR, 'checkins.json');          // { [uid]: { 'YYYY-MM-DD': true, streak, lastDate } }
const FOLLOWS_FILE = path.join(DATA_DIR, 'follows.json');            // [{ followerUid, followeeUid, createdAt }]
const CARD_PURCHASES_FILE = path.join(DATA_DIR, 'card-purchases.json'); // [{ buyerUid, cardId, price, paidAt }]
const CARDS_INDEX_FILE = path.join(DATA_DIR, 'cards-index.json');    // 所有角色卡索引（含价格、下载量、作者UID）

// 确保目录存在
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir(DATA_DIR);
ensureDir(path.join(DATA_DIR, 'uploads'));
ensureDir(path.join(DATA_DIR, 'cards'));
ensureDir(USER_DATA_DIR);

// 初始化数据文件（如果不存在）
const initFile = (file, defaultVal) => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaultVal));
};
initFile(POSTS_FILE, '[]');
initFile(LIKES_FILE, '[]');
initFile(COMMENTS_FILE, '[]');
initFile(FRIENDS_FILE, '[]');
initFile(FRIEND_REQ_FILE, '[]');
initFile(CHECKINS_FILE, JSON.stringify({}));
initFile(FOLLOWS_FILE, '[]');
initFile(CARD_PURCHASES_FILE, '[]');
initFile(CARDS_INDEX_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) { fs.writeFileSync(USERS_FILE, JSON.stringify({})); }

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads')));

// Multer 配置（用户数据文件上传）
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, USER_DATA_DIR),
  filename: (req, file, cb) => cb(null, `${req.username}.json`),
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.json')) {
      return cb(new Error('仅支持 .json 文件'));
    }
    cb(null, true);
  },
});

// 辅助函数
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ============ UID 系统 ============
const allocUid = () => {
  const counter = readJSON(UID_COUNTER_FILE);
  const uid = counter.nextUid;
  counter.nextUid = uid + 1;
  writeJSON(UID_COUNTER_FILE, counter);
  return uid;
};

// 用户表是对象 { username: userObj }，转为数组方便查找
const getUsersArray = () => {
  const usersMap = readJSON(USERS_FILE);
  return Object.entries(usersMap).map(([username, data]) => ({
    id: data.id || `u_${username}`,
    uid: data.uid,
    username,
    ...data,
  }));
};

const findUserByUsername = (username) => {
  const usersMap = readJSON(USERS_FILE);
  return usersMap[username] || null;
};

const findUserById = (userId) => {
  const users = getUsersArray();
  return users.find((u) => u.id === userId);
};

const findUserByUid = (uid) => {
  const users = getUsersArray();
  return users.find((u) => Number(u.uid) === Number(uid));
};

const saveUser = (username, userData) => {
  const usersMap = readJSON(USERS_FILE);
  usersMap[username] = { ...usersMap[username], ...userData };
  writeJSON(USERS_FILE, usersMap);
};

// 返回去掉密码的用户对象（含 username/uid/points）。老用户没 points 字段时默认 0
const publicUser = (user, username) => {
  if (!user) return null;
  const { password, ...rest } = user;
  return {
    ...rest,
    username: username || user.username,
    password: undefined,
    points: typeof rest.points === 'number' ? rest.points : 0,
  };
};

// JWT 验证中间件
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: '未登录' });
  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
};

// 管理员中间件
const adminMiddleware = (req, res, next) => {
  const user = findUserById(req.userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};

// ============ 用户认证 ============

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (username.length < 3) return res.status(400).json({ error: '用户名至少3位' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });

    const usersMap = readJSON(USERS_FILE);
    if (usersMap[username]) return res.status(400).json({ error: '用户名已存在' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = `u_${Date.now()}`;
    const uid = allocUid();
    const userData = {
      id: userId,
      uid,
      password: hashedPassword,
      nickname: nickname || username,
      avatar: null,
      bio: '',
      createdAt: Date.now(),
      isAdmin: false,
      points: 200,
    };

    usersMap[username] = userData;
    writeJSON(USERS_FILE, usersMap);

    // 创建用户数据文件
    const userDataFile = path.join(USER_DATA_DIR, `${username}.json`);
    if (!fs.existsSync(userDataFile)) {
      writeJSON(userDataFile, { version: 1, exportTime: Date.now(), settings: {}, chats: [], characters: [] });
    }

    const token = jwt.sign({ userId, username, uid }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: publicUser(userData, username) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });

    const userData = findUserByUsername(username);
    if (!userData) return res.status(400).json({ error: '用户不存在' });

    const valid = await bcrypt.compare(password, userData.password);
    if (!valid) return res.status(400).json({ error: '密码错误' });

    const userId = userData.id || `u_${username}`;
    const uid = userData.uid;
    const token = jwt.sign({ userId, username, uid }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: publicUser(userData, username) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 修改密码
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: '旧密码和新密码必填' });
    if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });

    const userData = findUserByUsername(req.username);
    if (!userData) return res.status(404).json({ error: '用户不存在' });

    const valid = await bcrypt.compare(oldPassword, userData.password);
    if (!valid) return res.status(400).json({ error: '旧密码错误' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    saveUser(req.username, { password: hashedPassword });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取个人资料
app.get('/api/user/profile', authMiddleware, (req, res) => {
  const user = findUserById(req.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(publicUser(user, req.username));
});

// 更新个人资料
app.put('/api/user/profile', authMiddleware, (req, res) => {
  try {
    const { nickname, bio, avatar } = req.body;
    const userData = findUserByUsername(req.username);
    if (!userData) return res.status(404).json({ error: '用户不存在' });

    if (nickname !== undefined) userData.nickname = nickname;
    if (bio !== undefined) userData.bio = bio;
    if (avatar !== undefined) userData.avatar = avatar;

    saveUser(req.username, userData);
    res.json(publicUser(userData, req.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取用户完整数据（settings/chats/characters）
app.get('/api/user/data', authMiddleware, (req, res) => {
  try {
    const userDataFile = path.join(USER_DATA_DIR, `${req.username}.json`);
    if (!fs.existsSync(userDataFile)) {
      return res.json({ version: 1, settings: {}, chats: [], characters: [] });
    }
    const data = readJSON(userDataFile);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 保存用户完整数据（JSON body）
app.put('/api/user/data', authMiddleware, (req, res) => {
  try {
    const { settings, chats, characters } = req.body;
    const userDataFile = path.join(USER_DATA_DIR, `${req.username}.json`);
    const existing = fs.existsSync(userDataFile) ? readJSON(userDataFile) : { version: 1 };
    const updated = {
      ...existing,
      version: 1,
      exportTime: Date.now(),
      settings: settings || existing.settings || {},
      chats: chats || existing.chats || [],
      characters: characters || existing.characters || [],
    };
    writeJSON(userDataFile, updated);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 上传用户数据文件（multipart .json 文件，整体覆盖）
app.post('/api/user/upload-data', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    try {
      const filePath = req.file.path;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const normalized = {
        version: 1,
        exportTime: Date.now(),
        settings: parsed.settings || {},
        chats: parsed.chats || [],
        characters: parsed.characters || [],
      };
      writeJSON(filePath, normalized);
      res.json({ success: true, size: req.file.size, path: req.file.path });
    } catch (e) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: '文件不是有效的 JSON: ' + e.message });
    }
  });
});

// ============ 好友系统 ============

// 按 UID 查询用户公开信息（用于添加好友）
app.get('/api/users/:uid', (req, res) => {
  try {
    const user = findUserByUid(req.params.uid);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json(publicUser(user, user.username));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 发送好友申请
app.post('/api/friends/requests', authMiddleware, (req, res) => {
  try {
    const { toUid, message } = req.body;
    if (!toUid) return res.status(400).json({ error: '目标 UID 必填' });

    const target = findUserByUid(toUid);
    if (!target) return res.status(404).json({ error: '目标用户不存在' });

    const fromUid = Number(req.uid);
    const toUidNum = Number(toUid);
    if (fromUid === toUidNum) return res.status(400).json({ error: '不能添加自己为好友' });

    const requests = readJSON(FRIEND_REQ_FILE);
    const friends = readJSON(FRIENDS_FILE);

    const alreadyFriend = friends.some(
      (f) => (Number(f.userA) === fromUid && Number(f.userB) === toUidNum) ||
             (Number(f.userA) === toUidNum && Number(f.userB) === fromUid)
    );
    if (alreadyFriend) return res.status(400).json({ error: '你们已经是好友了' });

    const pending = requests.some(
      (r) => r.status === 'pending' &&
        Number(r.fromUid) === fromUid && Number(r.toUid) === toUidNum
    );
    if (pending) return res.status(400).json({ error: '已发送过好友申请，等待对方确认' });

    // 若对方曾向我发过申请，自动互加好友
    const reversePending = requests.find(
      (r) => r.status === 'pending' &&
        Number(r.fromUid) === toUidNum && Number(r.toUid) === fromUid
    );
    if (reversePending) {
      reversePending.status = 'accepted';
      writeJSON(FRIEND_REQ_FILE, requests);
      friends.push({ id: `f_${Date.now()}`, userA: fromUid, userB: toUidNum, since: Date.now() });
      writeJSON(FRIENDS_FILE, friends);
      return res.json({ success: true, autoAccepted: true, message: '已自动互加为好友' });
    }

    const request = {
      id: `fr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      fromUid,
      toUid: toUidNum,
      fromUsername: req.username,
      toUsername: target.username,
      message: message || '',
      createdAt: Date.now(),
      status: 'pending',
    };
    requests.push(request);
    writeJSON(FRIEND_REQ_FILE, requests);
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取我的好友申请（收到的 + 发出的）
app.get('/api/friends/requests', authMiddleware, (req, res) => {
  try {
    const requests = readJSON(FRIEND_REQ_FILE);
    const myUid = Number(req.uid);
    const incoming = requests.filter((r) => Number(r.toUid) === myUid && r.status === 'pending');
    const outgoing = requests.filter((r) => Number(r.fromUid) === myUid && r.status === 'pending');
    res.json({ incoming, outgoing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 接受好友申请
app.post('/api/friends/requests/:id/accept', authMiddleware, (req, res) => {
  try {
    const requests = readJSON(FRIEND_REQ_FILE);
    const reqItem = requests.find((r) => r.id === req.params.id);
    if (!reqItem) return res.status(404).json({ error: '申请不存在' });
    if (Number(reqItem.toUid) !== Number(req.uid)) return res.status(403).json({ error: '无权处理此申请' });
    if (reqItem.status !== 'pending') return res.status(400).json({ error: '申请已处理' });

    reqItem.status = 'accepted';
    writeJSON(FRIEND_REQ_FILE, requests);

    const friends = readJSON(FRIENDS_FILE);
    const exists = friends.some(
      (f) => (Number(f.userA) === Number(reqItem.fromUid) && Number(f.userB) === Number(reqItem.toUid)) ||
             (Number(f.userA) === Number(reqItem.toUid) && Number(f.userB) === Number(reqItem.fromUid))
    );
    if (!exists) {
      friends.push({ id: `f_${Date.now()}`, userA: Number(reqItem.fromUid), userB: Number(reqItem.toUid), since: Date.now() });
      writeJSON(FRIENDS_FILE, friends);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 拒绝好友申请
app.post('/api/friends/requests/:id/reject', authMiddleware, (req, res) => {
  try {
    const requests = readJSON(FRIEND_REQ_FILE);
    const reqItem = requests.find((r) => r.id === req.params.id);
    if (!reqItem) return res.status(404).json({ error: '申请不存在' });
    if (Number(reqItem.toUid) !== Number(req.uid)) return res.status(403).json({ error: '无权处理此申请' });

    reqItem.status = 'rejected';
    writeJSON(FRIEND_REQ_FILE, requests);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取我的好友列表
app.get('/api/friends', authMiddleware, (req, res) => {
  try {
    const friends = readJSON(FRIENDS_FILE);
    const myUid = Number(req.uid);
    const friendUids = friends
      .filter((f) => Number(f.userA) === myUid || Number(f.userB) === myUid)
      .map((f) => {
        const otherUid = Number(f.userA) === myUid ? Number(f.userB) : Number(f.userA);
        const other = findUserByUid(otherUid);
        return {
          uid: otherUid,
          username: other?.username || '',
          nickname: other?.nickname || other?.username || '',
          avatar: other?.avatar || null,
          bio: other?.bio || '',
          since: f.since,
        };
      });
    res.json(friendUids);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除好友
app.delete('/api/friends/:uid', authMiddleware, (req, res) => {
  try {
    const friends = readJSON(FRIENDS_FILE);
    const myUid = Number(req.uid);
    const targetUid = Number(req.params.uid);
    const filtered = friends.filter(
      (f) => !((Number(f.userA) === myUid && Number(f.userB) === targetUid) ||
               (Number(f.userA) === targetUid && Number(f.userB) === myUid))
    );
    writeJSON(FRIENDS_FILE, filtered);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 社区功能 ============

// 发布帖子
app.post('/api/posts', authMiddleware, (req, res) => {
  try {
    const { title, content, type = 'discussion', tags = [], cardData } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容必填' });

    const user = findUserById(req.userId);

    const post = {
      id: `p_${Date.now()}`,
      authorId: req.userId,
      authorUid: req.uid,
      authorName: user?.nickname || req.username,
      authorAvatar: user?.avatar || null,
      title,
      content,
      type,
      tags,
      cardData: cardData || null,
      likes: 0,
      commentsCount: 0,
      createdAt: Date.now(),
    };

    const posts = readJSON(POSTS_FILE);
    posts.unshift(post);
    writeJSON(POSTS_FILE, posts);
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取帖子列表
app.get('/api/posts', (req, res) => {
  try {
    const { type, tag, authorId, sort = 'latest', userId } = req.query;
    let posts = readJSON(POSTS_FILE);

    if (type) posts = posts.filter((p) => p.type === type);
    if (tag) posts = posts.filter((p) => p.tags && p.tags.includes(tag));
    if (authorId) posts = posts.filter((p) => p.authorId === authorId);

    if (sort === 'hot') {
      posts.sort((a, b) => (b.likes + b.commentsCount * 2) - (a.likes + a.commentsCount * 2));
    } else if (sort === 'recommended') {
      posts.sort((a, b) => b.likes - a.likes);
    }

    const likes = readJSON(LIKES_FILE);
    const postsWithLike = posts.slice(0, 100).map((p) => ({
      ...p,
      liked: likes.some((l) => l.postId === p.id && l.userId === userId),
    }));

    res.json(postsWithLike);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个帖子
app.get('/api/posts/:id', (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const post = posts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const comments = readJSON(COMMENTS_FILE).filter((c) => c.postId === req.params.id);
    res.json({ ...post, comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 点赞/取消点赞
app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const idx = posts.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '帖子不存在' });

    const likes = readJSON(LIKES_FILE);
    const existingIdx = likes.findIndex((l) => l.postId === req.params.id && l.userId === req.userId);

    if (existingIdx >= 0) {
      likes.splice(existingIdx, 1);
      posts[idx].likes = Math.max(0, posts[idx].likes - 1);
    } else {
      likes.push({ postId: req.params.id, userId: req.userId, createdAt: Date.now() });
      posts[idx].likes += 1;
    }

    writeJSON(LIKES_FILE, likes);
    writeJSON(POSTS_FILE, posts);
    res.json({ likes: posts[idx].likes, liked: existingIdx === -1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 评论
app.post('/api/posts/:id/comments', authMiddleware, (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: '评论内容必填' });

    const posts = readJSON(POSTS_FILE);
    const post = posts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });

    const user = findUserById(req.userId);

    const comment = {
      id: `c_${Date.now()}`,
      postId: req.params.id,
      authorId: req.userId,
      authorUid: req.uid,
      authorName: user?.nickname || req.username,
      authorAvatar: user?.avatar || null,
      content,
      createdAt: Date.now(),
    };

    const comments = readJSON(COMMENTS_FILE);
    comments.push(comment);
    writeJSON(COMMENTS_FILE, comments);

    post.commentsCount += 1;
    writeJSON(POSTS_FILE, posts);

    res.json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除帖子
app.delete('/api/posts/:id', authMiddleware, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    const post = posts.find((p) => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    if (post.authorId !== req.userId) return res.status(403).json({ error: '无权限删除' });

    writeJSON(POSTS_FILE, posts.filter((p) => p.id !== req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 排行榜 ============

app.get('/api/rankings', (req, res) => {
  try {
    const users = getUsersArray();
    const posts = readJSON(POSTS_FILE);
    const likes = readJSON(LIKES_FILE);

    const userStats = users.map((user) => {
      const userPosts = posts.filter((p) => p.authorId === user.id);
      const userLikes = likes.filter((l) => {
        const post = posts.find((p) => p.id === l.postId);
        return post && post.authorId === user.id;
      });
      return {
        id: user.id,
        uid: user.uid,
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar,
        postCount: userPosts.length,
        likeCount: userLikes.length,
        score: userPosts.length * 10 + userLikes.length * 5,
      };
    });

    const sortBy = req.query.sortBy || 'score';
    const ranked = userStats.sort((a, b) => b[sortBy] - a[sortBy]).slice(0, 50);
    res.json(ranked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 分享对话卡片 ============

app.post('/api/cards', authMiddleware, (req, res) => {
  try {
    const { title, content, author, hideWorldBook = false, hideSystemPrompt = false, cardData } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容必填' });

    const user = findUserById(req.userId);

    const card = {
      id: `card_${Date.now()}`,
      title,
      content,
      authorId: req.userId,
      authorUid: req.uid,
      authorName: author || user?.nickname || req.username,
      authorAvatar: user?.avatar || null,
      hideWorldBook,
      hideSystemPrompt,
      exportedAt: Date.now(),
      version: '1.0',
      // 完整可导入数据：角色 + 预览消息 + 设置（供下载后直接导入角色列表/对话）
      cardData: cardData || null,
    };

    const cardFile = path.join(DATA_DIR, 'cards', `${card.id}.json`);
    fs.writeFileSync(cardFile, JSON.stringify(card, null, 2));

    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 积分系统 ============

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// 签到：每日一次，首日+10，连续签到多+1（封顶+30），并送积分
app.post('/api/user/checkin', authMiddleware, (req, res) => {
  try {
    const all = readJSON(CHECKINS_FILE);
    const uid = Number(req.uid);
    const today = todayStr();
    let record = all[uid] || { days: {}, streak: 0, lastDate: null, total: 0 };
    if (record.days && record.days[today]) {
      return res.status(400).json({ error: '今日已签到', record });
    }
    if (!record.days) record.days = {};
    const isConsecutive = record.lastDate === yesterdayStr();
    record.streak = isConsecutive ? (record.streak || 0) + 1 : 1;
    record.lastDate = today;
    record.days[today] = true;
    record.total = (record.total || 0) + 1;

    const bonus = Math.min(10 + (record.streak - 1) * 1, 30);

    // 给用户加积分（老用户没有 points 字段默认 0）
    const usersMap = readJSON(USERS_FILE);
    const username = req.username;
    if (usersMap[username]) {
      const cur = typeof usersMap[username].points === 'number' ? usersMap[username].points : 0;
      usersMap[username].points = cur + bonus;
      writeJSON(USERS_FILE, usersMap);
    }
    all[uid] = record;
    writeJSON(CHECKINS_FILE, all);
    const user = findUserByUsername(username);
    res.json({ record, bonusPoints: bonus, points: user ? (user.points ?? 0) : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 查询我的签到状态
app.get('/api/user/checkin', authMiddleware, (req, res) => {
  try {
    const all = readJSON(CHECKINS_FILE);
    const record = all[Number(req.uid)] || { days: {}, streak: 0, lastDate: null, total: 0 };
    record.todayChecked = !!record.days && !!record.days[todayStr()];
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 查询我的积分
app.get('/api/user/points', authMiddleware, (req, res) => {
  try {
    const user = findUserByUsername(req.username);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ points: typeof user.points === 'number' ? user.points : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 关注系统 ============

// 关注 / 取消关注作者 (followeeUid)
app.post('/api/follows/:followeeUid', authMiddleware, (req, res) => {
  try {
    const followerUid = Number(req.uid);
    const followeeUid = Number(req.params.followeeUid);
    if (followerUid === followeeUid) return res.status(400).json({ error: '不能关注自己' });
    if (!findUserByUid(followeeUid)) return res.status(404).json({ error: '用户不存在' });
    const { action = 'follow' } = req.body || {};
    const all = readJSON(FOLLOWS_FILE);
    const exists = all.findIndex((r) => Number(r.followerUid) === followerUid && Number(r.followeeUid) === followeeUid);
    if (action === 'unfollow') {
      if (exists >= 0) all.splice(exists, 1);
      writeJSON(FOLLOWS_FILE, all);
      return res.json({ followed: false });
    }
    if (exists < 0) {
      all.push({ followerUid, followeeUid, createdAt: Date.now() });
      writeJSON(FOLLOWS_FILE, all);
    }
    res.json({ followed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 我关注的列表
app.get('/api/follows/following', authMiddleware, (req, res) => {
  try {
    const me = Number(req.uid);
    const all = readJSON(FOLLOWS_FILE).filter((r) => Number(r.followerUid) === me);
    const enriched = all.map((r) => {
      const u = findUserByUid(r.followeeUid);
      return { uid: r.followeeUid, username: u?.username, nickname: u?.nickname, avatar: u?.avatar, followedAt: r.createdAt };
    }).filter((r) => r.username);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 我的粉丝列表
app.get('/api/follows/followers', authMiddleware, (req, res) => {
  try {
    const me = Number(req.uid);
    const all = readJSON(FOLLOWS_FILE).filter((r) => Number(r.followeeUid) === me);
    const enriched = all.map((r) => {
      const u = findUserByUid(r.followerUid);
      return { uid: r.followerUid, username: u?.username, nickname: u?.nickname, avatar: u?.avatar, followedAt: r.createdAt };
    }).filter((r) => r.username);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 查询我是否关注了某作者
app.get('/api/follows/:followeeUid/is-following', authMiddleware, (req, res) => {
  try {
    const me = Number(req.uid);
    const target = Number(req.params.followeeUid);
    const all = readJSON(FOLLOWS_FILE);
    const ok = all.some((r) => Number(r.followerUid) === me && Number(r.followeeUid) === target);
    res.json({ isFollowing: ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 角色卡（作者/下载量/价格/购买/直接返回卡片用于导入） ============

// 发布/更新角色卡索引（调用 /api/cards 写磁盘后，再调这个保存索引带价格）
app.post('/api/cards/:cardId/index', authMiddleware, (req, res) => {
  try {
    const { price = 0, name, summary, tags = [], cover = null } = req.body;
    const cardFile = path.join(DATA_DIR, 'cards', `${req.params.cardId}.json`);
    if (!fs.existsSync(cardFile)) return res.status(404).json({ error: '卡片文件不存在，请先创建卡片' });
    const card = JSON.parse(fs.readFileSync(cardFile, 'utf-8'));
    const idx = readJSON(CARDS_INDEX_FILE);
    const authorUid = Number(req.uid);
    let item = idx.find((x) => x.id === req.params.cardId);
    if (item && Number(item.authorUid) !== authorUid) return res.status(403).json({ error: '只能管理自己的卡片' });
    if (item) {
      item.price = Number(price) || 0;
      item.name = name || item.name || card.title;
      item.summary = summary ?? item.summary ?? '';
      item.tags = tags || item.tags || [];
      item.cover = cover || item.cover || null;
      item.updatedAt = Date.now();
    } else {
      const user = findUserByUsername(req.username);
      item = {
        id: req.params.cardId,
        authorId: req.userId,
        authorUid,
        authorName: user?.nickname || req.username,
        authorAvatar: user?.avatar || null,
        price: Number(price) || 0,
        downloads: 0,
        name: name || card.title,
        summary: summary || '',
        tags: tags || [],
        cover,
        createdAt: card.exportedAt || Date.now(),
        updatedAt: Date.now(),
      };
      idx.unshift(item);
    }
    writeJSON(CARDS_INDEX_FILE, idx);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 角色卡列表（带作者、下载量、价格、是否已购）
app.get('/api/cards', authMiddleware, (req, res) => {
  try {
    const me = Number(req.uid);
    const idx = readJSON(CARDS_INDEX_FILE);
    const purchases = readJSON(CARD_PURCHASES_FILE);
    const list = idx.map((card) => {
      const bought = purchases.some((p) => Number(p.buyerUid) === me && p.cardId === card.id);
      return { ...card, purchased: bought, isFree: Number(card.price) === 0 };
    });
    const { sort = 'newest' } = req.query;
    if (sort === 'hot') list.sort((a, b) => Number(b.downloads) - Number(a.downloads));
    else if (sort === 'priceAsc') list.sort((a, b) => Number(a.price) - Number(b.price));
    else list.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 购买角色卡（免费也走这个接口，记录"已购买"）
app.post('/api/cards/:cardId/purchase', authMiddleware, (req, res) => {
  try {
    const me = Number(req.uid);
    const username = req.username;
    const idx = readJSON(CARDS_INDEX_FILE);
    const card = idx.find((x) => x.id === req.params.cardId);
    if (!card) return res.status(404).json({ error: '角色卡不存在' });
    const price = Number(card.price) || 0;
    const purchases = readJSON(CARD_PURCHASES_FILE);
    const already = purchases.some((p) => Number(p.buyerUid) === me && p.cardId === card.id);
    if (already) return res.status(400).json({ error: '你已经拥有该角色卡' });

    if (price > 0) {
      // 扣积分
      const usersMap = readJSON(USERS_FILE);
      if (!usersMap[username]) return res.status(500).json({ error: '用户不存在' });
      const curPoints = typeof usersMap[username].points === 'number' ? usersMap[username].points : 0;
      if (curPoints < price) return res.status(400).json({ error: `积分不足（需${price}）` });
      usersMap[username].points = curPoints - price;

      // 作者分 80%
      const author = findUserByUid(card.authorUid);
      if (author && author.username && usersMap[author.username]) {
        const ap = typeof usersMap[author.username].points === 'number' ? usersMap[author.username].points : 0;
        usersMap[author.username].points = ap + Math.floor(price * 0.8);
      }
      writeJSON(USERS_FILE, usersMap);
    }

    purchases.push({ buyerUid: me, cardId: card.id, price, paidAt: Date.now() });
    writeJSON(CARD_PURCHASES_FILE, purchases);

    // + 下载量
    const cardPos = idx.findIndex((x) => x.id === card.id);
    if (cardPos >= 0) { idx[cardPos].downloads = Number(idx[cardPos].downloads || 0) + 1; writeJSON(CARDS_INDEX_FILE, idx); }

    const user = findUserByUsername(username);
    res.json({
      purchased: true,
      price,
      card: { ...card, downloads: Number(card.downloads || 0) + 1 },
      points: user ? (typeof user.points === 'number' ? user.points : 0) : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 下载/获取角色卡内容（已购买才可拉取完整内容）
app.get('/api/cards/:cardId/download', authMiddleware, (req, res) => {
  try {
    const me = Number(req.uid);
    const purchases = readJSON(CARD_PURCHASES_FILE);
    const idx = readJSON(CARDS_INDEX_FILE);
    const cardMeta = idx.find((x) => x.id === req.params.cardId);
    if (!cardMeta) return res.status(404).json({ error: '角色卡不存在' });
    const free = Number(cardMeta.price) === 0;
    const authorMe = Number(cardMeta.authorUid) === me;
    const bought = purchases.some((p) => Number(p.buyerUid) === me && p.cardId === cardMeta.id);
    if (!free && !authorMe && !bought) {
      return res.status(403).json({ error: '请先购买该角色卡' });
    }
    const cardFile = path.join(DATA_DIR, 'cards', `${req.params.cardId}.json`);
    if (!fs.existsSync(cardFile)) return res.status(404).json({ error: '卡片文件丢失' });
    const card = JSON.parse(fs.readFileSync(cardFile, 'utf-8'));
    // 免费或首次下载时 + 下载量
    if (!bought && (free || authorMe)) {
      const cardPos = idx.findIndex((x) => x.id === cardMeta.id);
      if (cardPos >= 0) {
        idx[cardPos].downloads = Number(idx[cardPos].downloads || 0) + 1;
        writeJSON(CARDS_INDEX_FILE, idx);
      }
      // 免费用户也登记为已购，避免反复下载记数
      purchases.push({ buyerUid: me, cardId: cardMeta.id, price: cardMeta.price, paidAt: Date.now() });
      writeJSON(CARD_PURCHASES_FILE, purchases);
    }
    res.json({ meta: cardMeta, card });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 健康检查 ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now(), dataDir: DATA_DIR, version: '3.9.2' });
});

// ============ 管理员接口 ============

// 获取所有用户列表
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = getUsersArray().map((u) => publicUser(u, u.username));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除用户
app.delete('/api/admin/users/:userId', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const usersMap = readJSON(USERS_FILE);
    let targetUsername = null;
    for (const [uname, data] of Object.entries(usersMap)) {
      if ((data.id || `u_${uname}`) === req.params.userId) {
        targetUsername = uname;
        delete usersMap[uname];
        break;
      }
    }
    if (!targetUsername) return res.status(404).json({ error: '用户不存在' });
    writeJSON(USERS_FILE, usersMap);

    const userDataFile = path.join(USER_DATA_DIR, `${targetUsername}.json`);
    if (fs.existsSync(userDataFile)) fs.unlinkSync(userDataFile);

    const posts = readJSON(POSTS_FILE);
    writeJSON(POSTS_FILE, posts.filter((p) => p.authorId !== req.params.userId));
    const likes = readJSON(LIKES_FILE);
    writeJSON(LIKES_FILE, likes.filter((l) => l.userId !== req.params.userId));
    const comments = readJSON(COMMENTS_FILE);
    writeJSON(COMMENTS_FILE, comments.filter((c) => c.authorId !== req.params.userId));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 设置/取消管理员
app.patch('/api/admin/users/:userId/role', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { isAdmin } = req.body;
    const usersMap = readJSON(USERS_FILE);
    let targetUsername = null;
    for (const [uname, data] of Object.entries(usersMap)) {
      if ((data.id || `u_${uname}`) === req.params.userId) {
        targetUsername = uname;
        data.isAdmin = !!isAdmin;
        break;
      }
    }
    if (!targetUsername) return res.status(404).json({ error: '用户不存在' });
    writeJSON(USERS_FILE, usersMap);

    const updated = usersMap[targetUsername];
    res.json({ success: true, user: publicUser(updated, targetUsername) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取所有帖子
app.get('/api/admin/posts', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 管理员删除任意帖子
app.delete('/api/admin/posts/:postId', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const posts = readJSON(POSTS_FILE);
    writeJSON(POSTS_FILE, posts.filter((p) => p.id !== req.params.postId));
    const comments = readJSON(COMMENTS_FILE);
    writeJSON(COMMENTS_FILE, comments.filter((c) => c.postId !== req.params.postId));
    const likes = readJSON(LIKES_FILE);
    writeJSON(LIKES_FILE, likes.filter((l) => l.postId === req.params.postId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取系统统计
app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = getUsersArray();
    const posts = readJSON(POSTS_FILE);
    const likes = readJSON(LIKES_FILE);
    const comments = readJSON(COMMENTS_FILE);
    res.json({
      totalUsers: users.length,
      totalPosts: posts.length,
      totalLikes: likes.length,
      totalComments: comments.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`鲵吞亭社区服务器已启动: http://0.0.0.0:${PORT}`);
  console.log(`数据目录: ${DATA_DIR}`);
  console.log(`版本: 3.9.2 (UID + 好友系统 + 数据上传)`);
});
