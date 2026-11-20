import { FancyWorkTemplate } from '../types';

export const fancyTemplates: FancyWorkTemplate[] = [
  {
    id: 'sidebar_music',
    name: '🎵 音乐播放器侧边栏',
    type: 'sidebar',
    description: '带播放控制的音乐侧边栏',
    html: `<div class="sidebar">
  <div class="sidebar-title">🎵 音乐</div>
  <div class="music-controls">
    <button class="btn" onclick="playMusic()">▶️ 播放</button>
    <button class="btn" onclick="pauseMusic()">⏸️ 暂停</button>
    <div class="track-info">当前曲目：无</div>
  </div>
  <div class="playlist">
    <div class="track" onclick="selectTrack(0)">1. 宁静之夜</div>
    <div class="track" onclick="selectTrack(1)">2. 冒险序曲</div>
    <div class="track" onclick="selectTrack(2)">3. 战斗进行曲</div>
  </div>
</div>`,
    css: `.sidebar {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
  color: #eee;
  padding: 16px;
  font-family: -apple-system, sans-serif;
}
.sidebar-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 16px;
  text-align: center;
  color: #e94560;
}
.music-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.btn {
  background: #e94560;
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
.track-info {
  font-size: 12px;
  color: #aaa;
  text-align: center;
  margin-top: 8px;
}
.playlist {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.track {
  background: rgba(255,255,255,0.1);
  padding: 10px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.track:hover {
  background: rgba(233,69,96,0.3);
}`,
    js: `function playMusic() {
  document.querySelector('.track-info').textContent = '当前曲目：播放中...';
}
function pauseMusic() {
  document.querySelector('.track-info').textContent = '当前曲目：已暂停';
}
function selectTrack(index) {
  const tracks = ['宁静之夜', '冒险序曲', '战斗进行曲'];
  document.querySelector('.track-info').textContent = '当前曲目：' + tracks[index];
}`,
  },
  {
    id: 'sidebar_dice',
    name: '🎲 骰子判定侧边栏',
    type: 'sidebar',
    description: 'TRPG风格的骰子判定工具',
    html: `<div class="sidebar">
  <div class="sidebar-title">🎲 判定</div>
  <div class="dice-controls">
    <button class="btn dice-btn" onclick="rollDice(6)">🎲 D6</button>
    <button class="btn dice-btn" onclick="rollDice(20)">🎲 D20</button>
    <button class="btn dice-btn" onclick="rollDice(100)">🎲 D100</button>
  </div>
  <div class="result-box">
    <div class="result-label">判定结果</div>
    <div class="result-value" id="result">-</div>
    <div class="result-detail" id="detail">点击上方骰子开始判定</div>
  </div>
</div>`,
    css: `.sidebar {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a3e 100%);
  color: #eee;
  padding: 16px;
  font-family: -apple-system, sans-serif;
}
.sidebar-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 16px;
  text-align: center;
  color: #ffd700;
}
.dice-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}
.dice-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 14px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}
.result-box {
  background: rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
}
.result-label {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 8px;
}
.result-value {
  font-size: 48px;
  font-weight: bold;
  color: #ffd700;
  margin-bottom: 8px;
}
.result-detail {
  font-size: 13px;
  color: #888;
}`,
    js: `function rollDice(sides) {
  const result = Math.floor(Math.random() * sides) + 1;
  document.getElementById('result').textContent = result;
  let detail = '';
  if (sides === 20) {
    if (result === 20) detail = '大成功！';
    else if (result === 1) detail = '大失败...';
    else if (result >= 15) detail = '成功';
    else if (result >= 10) detail = '普通';
    else detail = '失败';
  } else if (sides === 100) {
    if (result <= 5) detail = '大成功！';
    else if (result >= 96) detail = '大失败...';
    else if (result <= 50) detail = '成功';
    else detail = '失败';
  } else {
    detail = 'D' + sides + ' = ' + result;
  }
  document.getElementById('detail').textContent = detail;
}`,
  },
  {
    id: 'greeting_card',
    name: '✨ 花式开场白卡片',
    type: 'greeting',
    description: '带有动画效果的富媒体开场白',
    html: `<div class="greeting-card">
  <div class="glow"></div>
  <div class="content">
    <h1 class="title">🌟 欢迎来到新世界</h1>
    <p class="subtitle">一段奇妙的冒险即将开始</p>
    <div class="divider"></div>
    <p class="desc">
      在这里，你可以与AI角色自由对话，
      探索无限可能的故事情节。
    </p>
    <div class="tags">
      <span class="tag">🎭 角色扮演</span>
      <span class="tag">📖 故事创作</span>
      <span class="tag">🎮 互动冒险</span>
    </div>
  </div>
</div>`,
    css: `.greeting-card {
  position: relative;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  border-radius: 20px;
  padding: 24px;
  overflow: hidden;
  color: #fff;
  font-family: -apple-system, sans-serif;
}
.glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(233,69,96,0.15) 0%, transparent 70%);
  animation: pulse 4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 1; }
}
.content {
  position: relative;
  z-index: 1;
}
.title {
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 8px;
  text-align: center;
}
.subtitle {
  font-size: 14px;
  color: #aaa;
  text-align: center;
  margin-bottom: 16px;
}
.divider {
  height: 2px;
  background: linear-gradient(90deg, transparent, #e94560, transparent);
  margin: 16px 0;
}
.desc {
  font-size: 14px;
  line-height: 1.6;
  color: #ccc;
  text-align: center;
  margin-bottom: 16px;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.tag {
  background: rgba(233,69,96,0.2);
  border: 1px solid rgba(233,69,96,0.4);
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  color: #e94560;
}`,
    js: ``,
  },
  {
    id: 'floating_menu',
    name: '🎛️ 悬浮快捷菜单',
    type: 'floating',
    description: '可展开的浮动快捷操作按钮',
    html: `<div class="floating-container">
  <button class="fab" onclick="toggleMenu()" id="fab">+</button>
  <div class="menu" id="menu">
    <button class="menu-item" onclick="action('save')">💾 保存</button>
    <button class="menu-item" onclick="action('share')">📤 分享</button>
    <button class="menu-item" onclick="action('settings')">⚙️ 设置</button>
    <button class="menu-item" onclick="action('help')">❓ 帮助</button>
  </div>
</div>`,
    css: `.floating-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 20px;
}
.fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e94560, #ff6b6b);
  color: white;
  border: none;
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(233,69,96,0.4);
  transition: transform 0.3s;
  z-index: 10;
}
.fab.active {
  transform: rotate(45deg);
}
.menu {
  position: absolute;
  bottom: 80px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.3s;
  pointer-events: none;
}
.menu.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: all;
}
.menu-item {
  background: rgba(30,30,50,0.95);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.1);
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  backdrop-filter: blur(10px);
}`,
    js: `let menuOpen = false;
function toggleMenu() {
  menuOpen = !menuOpen;
  document.getElementById('fab').classList.toggle('active', menuOpen);
  document.getElementById('menu').classList.toggle('active', menuOpen);
}
function action(type) {
  toggleMenu();
  // 操作已触发，可通过 postMessage 通知 RN
}`,
  },
  {
    id: 'guide_welcome',
    name: '📖 新手引导页',
    type: 'guide',
    description: '首次进入时的引导介绍页面',
    html: `<div class="guide-page">
  <div class="step-indicator">
    <div class="dot active"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  </div>
  <div class="guide-content">
    <div class="icon">🎯</div>
    <h2 class="guide-title">快速开始</h2>
    <p class="guide-text">
      欢迎来到AI酒馆！这里是你的私人AI对话空间。
      你可以创建不同的角色，展开独特的对话体验。
    </p>
    <div class="feature-list">
      <div class="feature">💬 自由对话</div>
      <div class="feature">🎭 角色扮演</div>
      <div class="feature">📚 世界书</div>
      <div class="feature">🎨 自定义UI</div>
    </div>
  </div>
  <button class="next-btn" onclick="nextStep()">开始体验 →</button>
</div>`,
    css: `.guide-page {
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, #0f0f23 0%, #1a1a3e 100%);
  color: #fff;
  padding: 24px;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, sans-serif;
}
.step-indicator {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 32px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255,255,255,0.3);
}
.dot.active {
  background: #e94560;
  width: 24px;
  border-radius: 4px;
}
.guide-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.icon {
  font-size: 64px;
  margin-bottom: 16px;
}
.guide-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 12px;
}
.guide-text {
  font-size: 15px;
  color: #aaa;
  line-height: 1.6;
  margin-bottom: 24px;
}
.feature-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
}
.feature {
  background: rgba(255,255,255,0.08);
  padding: 12px;
  border-radius: 12px;
  font-size: 14px;
}
.next-btn {
  background: linear-gradient(135deg, #e94560, #ff6b6b);
  color: white;
  border: none;
  padding: 16px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: bold;
  margin-top: 16px;
  cursor: pointer;
}`,
    js: `function nextStep() {
  // 引导完成，通知RN关闭引导页
}`,
  },
  {
    id: 'status_rpg',
    name: '⚔️ RPG状态栏美化',
    type: 'statusBar',
    description: '游戏风格的状态栏，带血条、魔力条等',
    html: `<div class="status-bar">
  <div class="avatar-section">
    <div class="avatar">🧙‍♂️</div>
    <div class="name">冒险者</div>
  </div>
  <div class="bars">
    <div class="bar-row">
      <span class="bar-label">❤️ HP</span>
      <div class="bar"><div class="bar-fill hp" style="width:75%"></div></div>
      <span class="bar-value">75/100</span>
    </div>
    <div class="bar-row">
      <span class="bar-label">💙 MP</span>
      <div class="bar"><div class="bar-fill mp" style="width:60%"></div></div>
      <span class="bar-value">60/100</span>
    </div>
    <div class="bar-row">
      <span class="bar-label">💛 体力</span>
      <div class="bar"><div class="bar-fill stamina" style="width:90%"></div></div>
      <span class="bar-value">90/100</span>
    </div>
  </div>
  <div class="stats">
    <div class="stat">⚔️ 攻击: 25</div>
    <div class="stat">🛡️ 防御: 18</div>
    <div class="stat">💰 金币: 1200</div>
  </div>
</div>`,
    css: `.status-bar {
  width: 100%;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  padding: 16px;
  color: #fff;
  font-family: -apple-system, sans-serif;
}
.avatar-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.avatar {
  font-size: 40px;
}
.name {
  font-size: 18px;
  font-weight: bold;
}
.bars {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bar-label {
  font-size: 12px;
  width: 50px;
}
.bar {
  flex: 1;
  height: 10px;
  background: rgba(255,255,255,0.1);
  border-radius: 5px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.5s ease;
}
.bar-fill.hp { background: linear-gradient(90deg, #e74c3c, #c0392b); }
.bar-fill.mp { background: linear-gradient(90deg, #3498db, #2980b9); }
.bar-fill.stamina { background: linear-gradient(90deg, #f39c12, #e67e22); }
.bar-value {
  font-size: 11px;
  color: #aaa;
  width: 50px;
  text-align: right;
}
.stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.stat {
  background: rgba(255,255,255,0.08);
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
}`,
    js: ``,
  },
];
