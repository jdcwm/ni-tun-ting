/**
 * 自定义用户界面（方案B）的配置与内置默认模板。
 *
 * 设计取舍：默认模板刻意保持朴素（深色、气泡、输入栏），因为它的作用是
 * 「证明桥是通的、给你一个能改的起点」，而不是替你做美术。
 * 你把它整段替换掉就是完全自己的界面。
 *
 * 可用 API 见项目根目录《自定义界面书写规则.md》。
 */

export interface CustomInterfaceConfig {
  /** 是否启用；关闭时用 App 原生界面 */
  enabled: boolean;
  /** 界面 HTML 片段（不含 <!DOCTYPE>/<html>，外壳由 App 补） */
  html: string;
  css: string;
  js: string;
  /** 启动页（可选，显示在主界面之上） */
  splashHtml?: string;
  splashCss?: string;
  /** 侧边栏（可选） */
  sidebarHtml?: string;
  sidebarCss?: string;
  /** 悬浮窗（可选） */
  floatingHtml?: string;
  floatingCss?: string;
  /** 启动页显示时长（ms），0 表示不自动消失 */
  splashDuration?: number;
  updatedAt?: number;
}

export const DEFAULT_CUSTOM_INTERFACE_HTML = `
<div id="app">
  <div id="header">
    <span id="title">聊天</span>
    <button class="hbtn" onclick="Aurora.toggleSidebar()">菜单</button>
    <button class="hbtn" onclick="Aurora.openRightMenu()">设置</button>
  </div>

  <div id="aurora-chat-flow"></div>

  <div id="aurora-status-bar"></div>

  <div class="input-panel">
    <textarea id="aurora-input" placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"></textarea>
    <div class="bar">
      <button class="ghost" onclick="Aurora.openPanel('mediaLibrary')">素材</button>
      <button class="ghost" onclick="Aurora.injectCss('','')">清样式</button>
      <button id="aurora-send">发送</button>
    </div>
  </div>
</div>
`;

export const DEFAULT_CUSTOM_INTERFACE_CSS = `
#app { display: flex; flex-direction: column; height: 100%; }
#header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--aurora-border);
  background: var(--aurora-menu-bg);
}
#title { flex: 1; font-size: 16px; font-weight: 600; color: var(--aurora-text); }
.hbtn, .ghost {
  padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--aurora-border);
  background: transparent; color: var(--aurora-text);
}
.ghost { color: var(--aurora-subtext); }
#aurora-send {
  padding: 9px 20px; border: none; border-radius: 10px; cursor: pointer;
  background: var(--aurora-button); color: var(--aurora-button-text);
  font-size: 14px; font-weight: 600;
}
#aurora-chat-flow { flex: 1; overflow-y: auto; padding: 6px 0; }
#aurora-status-bar:empty { display: none; }
.aurora-msg { margin: 8px 14px; }
.aurora-msg .aurora-bubble {
  display: inline-block; max-width: 86%; padding: 10px 14px;
  border-radius: var(--aurora-radius, 14px);
  background: var(--aurora-secondary); color: var(--aurora-text);
  white-space: pre-wrap; word-break: break-word; line-height: 1.7;
}
.aurora-msg.user { text-align: right; }
.aurora-msg.user .aurora-bubble { background: var(--aurora-accent); color: var(--aurora-button-text); }
.input-panel { padding: 10px 14px; border-top: 1px solid var(--aurora-border); background: var(--aurora-menu-bg); }
#aurora-input {
  width: 100%; min-height: 46px; max-height: 180px; resize: none; outline: none;
  padding: 12px 14px; border-radius: 12px;
  border: 1px solid var(--aurora-border);
  background: var(--aurora-input-bg); color: var(--aurora-text);
  font-size: var(--aurora-font-size); font-family: inherit;
}
.bar { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.bar .ghost:last-of-type { margin-right: auto; }
`;

export const DEFAULT_CUSTOM_INTERFACE_JS = `
// === 渲染消息 ===
// 用 Aurora.md() 而不是自己转义：它会保留 AI 输出里的 HTML 标签，
// 这样 AI 写的界面代码（触发词 → 正则替换产物）才能真的渲染出来。
function renderMessages(list) {
  var flow = document.getElementById('aurora-chat-flow');
  if (!flow) return;
  var atBottom = flow.scrollHeight - flow.scrollTop - flow.clientHeight < 60;
  flow.innerHTML = (list || []).map(function (m) {
    var cls = m.role === 'user' ? 'aurora-msg user' : 'aurora-msg';
    return '<div class="' + cls + '" data-id="' + (m.id || '') + '">' +
           '<div class="aurora-bubble">' + Aurora.md(m.content) + '</div></div>';
  }).join('');
  if (atBottom) flow.scrollTop = flow.scrollHeight;
}

Aurora.onState(function (s) {
  var t = document.getElementById('title');
  if (t) t.textContent = (s.chat && s.chat.title) || '聊天';
  if (s.messages) renderMessages(s.messages);
});
Aurora.onMessage(function () { renderMessages(Aurora.getMessages()); });

// === 输入与发送 ===
var ta = document.getElementById('aurora-input');
var sendBtn = document.getElementById('aurora-send');

function doSend() {
  var v = (ta.value || '').trim();
  if (!v) return;
  Aurora.send(v);
  ta.value = '';
  ta.style.height = '46px';
}

if (sendBtn) sendBtn.onclick = function (e) { e.stopPropagation(); doSend(); };
if (ta) {
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  ta.addEventListener('input', function () {
    ta.style.height = '46px';
    ta.style.height = Math.min(180, ta.scrollHeight) + 'px';
  });
}

// === 流式：边收边重渲染最后一条（用 Aurora.md 保持渲染一致） ===
Aurora.onChunk(function (e) {
  var flow = document.getElementById('aurora-chat-flow');
  if (!flow) return;
  var last = flow.lastElementChild;
  var bubble = last && last.querySelector('.aurora-bubble');
  if (!bubble) { renderMessages(Aurora.getMessages()); return; }
  bubble.innerHTML = Aurora.md(e.chunk || '');
  flow.scrollTop = flow.scrollHeight;
});

// === 初始渲染 ===
renderMessages(Aurora.getMessages());
`;

export const DEFAULT_CUSTOM_INTERFACE_SPLASH_HTML = `
<div id="aurora-splash">
  <div class="logo">鲵</div>
  <div class="title">鲵吞亭</div>
  <div class="sub">少女开张中~</div>
</div>
`;

export const DEFAULT_CUSTOM_INTERFACE_SPLASH_CSS = `
#aurora-splash {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  background: radial-gradient(circle at center, #1b1b2e 0%, #07070f 100%);
  transition: opacity .5s ease;
}
#aurora-splash.fade-out { opacity: 0; pointer-events: none; }
#aurora-splash .logo {
  width: 84px; height: 84px; border-radius: 22px;
  display: flex; align-items: center; justify-content: center;
  font-size: 40px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--aurora-accent), #8a2be2);
  box-shadow: 0 0 40px rgba(138, 43, 226, .45);
  margin-bottom: 20px;
  animation: auroraPulse 2s infinite alternate;
}
@keyframes auroraPulse {
  0% { transform: scale(1); }
  100% { transform: scale(1.06); }
}
#aurora-splash .title { font-size: 26px; font-weight: 800; color: #fff; letter-spacing: 6px; }
#aurora-splash .sub { margin-top: 10px; font-size: 13px; color: var(--aurora-subtext); }
`;

export const DEFAULT_CUSTOM_INTERFACE_SIDEBAR_HTML = `
<div id="aurora-side-handle" onclick="document.getElementById('aurora-side').classList.toggle('open')">☰</div>
<div id="aurora-side">
  <div class="side-title">快捷</div>
  <button class="side-item" onclick="Aurora.openPanel('characterBrowser')">角色卡库</button>
  <button class="side-item" onclick="Aurora.openPanel('worldbookEditor')">世界书</button>
  <button class="side-item" onclick="Aurora.openPanel('mediaLibrary')">素材库</button>
  <button class="side-item" onclick="Aurora.openPanel('aiProvider')">AI 模型</button>
  <button class="side-item" onclick="Aurora.openPanel('settings')">设置</button>
  <button class="side-item" onclick="document.getElementById('aurora-side').classList.remove('open')">收起</button>
</div>
`;

/**
 * 侧边栏默认**收起**。
 *
 * 之前是 `position: fixed; left:0; width:148px` 且背景不透明，而它是覆盖层、
 * 不占布局空间 —— 于是直接盖住聊天正文左侧 148px，消息文字被裁掉半截。
 * 现在默认 translateX(-100%) 移出屏幕，只留一个左侧小把手，点开才展开。
 */
export const DEFAULT_CUSTOM_INTERFACE_SIDEBAR_CSS = `
#aurora-side {
  position: fixed; left: 0; top: 0; bottom: 0; width: 148px; z-index: 200;
  padding: 14px 10px; overflow-y: auto;
  background: var(--aurora-menu-bg);
  border-right: 1px solid var(--aurora-border);
  transform: translateX(-100%);
  transition: transform .22s ease;
  box-shadow: 2px 0 12px rgba(0, 0, 0, .25);
}
#aurora-side.open { transform: translateX(0); }
#aurora-side-handle {
  position: fixed; left: 0; top: 50%; transform: translateY(-50%);
  width: 22px; height: 56px; z-index: 201;
  display: flex; align-items: center; justify-content: center;
  border-radius: 0 8px 8px 0;
  background: var(--aurora-menu-bg);
  border: 1px solid var(--aurora-border); border-left: none;
  color: var(--aurora-text); font-size: 13px; cursor: pointer;
  opacity: .85;
}
#aurora-side .side-title {
  font-size: 11px; letter-spacing: 2px; margin-bottom: 10px;
  color: var(--aurora-subtext); text-transform: uppercase;
}
#aurora-side .side-item {
  display: block; width: 100%; text-align: left; margin-bottom: 6px;
  padding: 9px 10px; border-radius: 8px; cursor: pointer; font-size: 13px;
  border: 1px solid var(--aurora-border);
  background: transparent; color: var(--aurora-text);
}
#aurora-side .side-item:hover { background: var(--aurora-secondary); }
`;

export const DEFAULT_CUSTOM_INTERFACE_FLOATING_HTML = `
<div id="aurora-float">
  <div class="fab" onclick="document.getElementById('aurora-float-panel').classList.toggle('show')">⚙</div>
  <div id="aurora-float-panel">
    <div class="fp-title">快捷调整</div>
    <button class="fp-btn" onclick="Aurora.setBackgroundMuted(true);Aurora.toast('已静音')">背景静音</button>
    <button class="fp-btn" onclick="Aurora.toggleBackgroundPlay()">背景播放/暂停</button>
    <button class="fp-btn" onclick="Aurora.scrollToTop()">回到顶部</button>
    <button class="fp-btn" onclick="Aurora.scrollToBottom()">回到底部</button>
  </div>
</div>
`;

export const DEFAULT_CUSTOM_INTERFACE_FLOATING_CSS = `
#aurora-float { position: fixed; right: 16px; bottom: 96px; z-index: 300; }
#aurora-float .fab {
  width: 46px; height: 46px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; color: #fff;
  background: linear-gradient(135deg, var(--aurora-accent), #8a2be2);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .35);
}
#aurora-float-panel {
  display: none; position: absolute; right: 0; bottom: 56px; width: 190px;
  padding: 12px; border-radius: 12px;
  background: var(--aurora-menu-bg);
  border: 1px solid var(--aurora-border);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .35);
}
#aurora-float-panel.show { display: block; }
#aurora-float-panel .fp-title { font-size: 12px; font-weight: 700; margin-bottom: 8px; color: var(--aurora-text); }
#aurora-float-panel .fp-btn {
  display: block; width: 100%; margin-bottom: 6px; padding: 8px 10px;
  border-radius: 8px; cursor: pointer; font-size: 12px; text-align: left;
  border: 1px solid var(--aurora-border);
  background: transparent; color: var(--aurora-text);
}
#aurora-float-panel .fp-btn:hover { background: var(--aurora-secondary); }
`;

export const buildDefaultCustomInterface = (): CustomInterfaceConfig => ({
  enabled: false,
  html: DEFAULT_CUSTOM_INTERFACE_HTML,
  css: DEFAULT_CUSTOM_INTERFACE_CSS,
  js: DEFAULT_CUSTOM_INTERFACE_JS,
  splashHtml: DEFAULT_CUSTOM_INTERFACE_SPLASH_HTML,
  splashCss: DEFAULT_CUSTOM_INTERFACE_SPLASH_CSS,
  sidebarHtml: DEFAULT_CUSTOM_INTERFACE_SIDEBAR_HTML,
  sidebarCss: DEFAULT_CUSTOM_INTERFACE_SIDEBAR_CSS,
  floatingHtml: DEFAULT_CUSTOM_INTERFACE_FLOATING_HTML,
  floatingCss: DEFAULT_CUSTOM_INTERFACE_FLOATING_CSS,
  splashDuration: 1800,
  updatedAt: Date.now(),
});

/**
 * 老版默认侧边栏是「固定左侧 148px + 不透明背景」，作为覆盖层会盖住聊天正文。
 * 如果用户存的是这一版（或没存），就换成新的「默认收起」版本；
 * 用户自己改过的（没有这些特征）则原样保留。
 */
const LEGACY_SIDEBAR_CSS_MARK = 'width: 148px; z-index: 200';
const LEGACY_SIDEBAR_HTML_MARK = 'aurora.toggleSidebar()';

const upgradeLegacySidebarCss = (css: string | undefined, fallback: string): string => {
  if (!css) return fallback;
  // 已是新版（带 .open 折叠）就别动
  if (css.includes('#aurora-side.open')) return css;
  if (css.includes(LEGACY_SIDEBAR_CSS_MARK) || css.includes('#aurora-side')) return fallback;
  return css;
};

const upgradeLegacySidebarHtml = (html: string | undefined, fallback: string): string => {
  if (!html) return fallback;
  if (html.includes('aurora-side-handle')) return html;
  if (html.includes('aurora-side') || html.includes('side-item')) return fallback;
  return html;
};

/** 把配置补全成可用配置（老数据缺字段时） */
export const normalizeCustomInterface = (  cfg?: Partial<CustomInterfaceConfig> | null,
): CustomInterfaceConfig => {
  const base = buildDefaultCustomInterface();
  if (!cfg) return base;
  return {
    enabled: cfg.enabled ?? base.enabled,
    html: typeof cfg.html === 'string' ? cfg.html : base.html,
    css: typeof cfg.css === 'string' ? cfg.css : base.css,
    js: typeof cfg.js === 'string' ? cfg.js : base.js,
    splashHtml: cfg.splashHtml,
    splashCss: cfg.splashCss,
    sidebarHtml: upgradeLegacySidebarHtml(cfg.sidebarHtml, base.sidebarHtml || DEFAULT_CUSTOM_INTERFACE_SIDEBAR_HTML),
    sidebarCss: upgradeLegacySidebarCss(cfg.sidebarCss, base.sidebarCss || DEFAULT_CUSTOM_INTERFACE_SIDEBAR_CSS),
    floatingHtml: cfg.floatingHtml,
    floatingCss: cfg.floatingCss,
    splashDuration: cfg.splashDuration,
    updatedAt: cfg.updatedAt,
  };
};
