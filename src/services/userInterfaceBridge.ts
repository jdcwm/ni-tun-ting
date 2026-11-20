/**
 * 用户界面桥（User Interface Bridge）
 *
 * 这是「方案B：可被用户 HTML/CSS/JS 深度定制界面」的地基。
 *
 * 解决的问题：消息气泡各自是独立 WebView（MarkdownRenderer），它碰不到输入框、背景、
 * 主题、消息列表。用户按 MMD 那套写的 JS（document.querySelector('.chat-input-scope textarea')、
 * dispatchEvent、window.xxx 全局函数）在这个 App 里全部落空。
 *
 * 本模块提供两样东西：
 *  1. buildUserInterfaceDocument()：把一个用户界面模板（HTML/CSS/JS）包装成完整文档，
 *     并注入一段运行时 window.Aurora —— 它提供 DOM 操作 + 与 RN 通信的 API，
 *     同时给宿主元素挂上 MMD 风格的选择器别名，让老代码尽量能直接跑。
 *  2. RN 侧辅助：boot / update / callRuntime 的载荷与片段构造，配合 WebView 的
 *     onMessage / injectJavaScript 使用。
 */

export const BRIDGE_VERSION = 1;

/**
 * 启动页自动淡出脚本。默认启动页带 .fade-out 过渡，这里到点加上该 class 再隐藏。
 * 用户把 splashDuration 设为 0 就不会自动消失，可自己用 JS 控制。
 */
export const buildSplashAutoHideJs = (durationMs: number): string =>
  durationMs > 0
    ? `
(function () {
  var el = document.getElementById('aurora-splash');
  if (!el) return;
  setTimeout(function () {
    el.classList.add('fade-out');
    setTimeout(function () { el.style.display = 'none'; }, 520);
  }, ${durationMs});
})();
`
    : '';

/** 宿主元素：用户 JS 通过这些 id / 类名拿到可操作的对象 */
export const HOST_IDS = {
  root: 'aurora-root',
  chatFlow: 'aurora-chat-flow',
  input: 'aurora-input',
  sendBtn: 'aurora-send',
  sidebar: 'aurora-sidebar',
  statusBar: 'aurora-status-bar',
  floating: 'aurora-floating',
  background: 'aurora-background',
};

/**
 * MMD 风格选择器别名。
 * 用户代码里常写 `.chat-input-scope textarea` 之类，RN 里不存在这些 DOM；
 * 这里把别名一起挂到宿主元素上，使 `document.querySelector('.chat-input-scope textarea')` 之类
 * 的老写法能命中我们真正的输入框。
 */
export const SELECTOR_ALIASES: Record<string, string[]> = {
  input: ['chat-input-scope', 'chatMsgTextarea', 'input-panel', 'uni-textarea'],
  chatFlow: ['chat-scope-box', 'chat', 'chat-body', 'chat-history-flow'],
  sendBtn: ['send-msg', 'send-btn', 'teapot-button'],
  sidebar: ['chat-top-tabbar'],
  statusBar: ['status-bar'],
};

/** 把主题配置转成 CSS 变量，供用户 CSS 直接 var(--aurora-accent) 使用 */
export const buildThemeCssVars = (theme: Record<string, any> = {}): Record<string, string> => {
  const t = theme || {};
  return {
    '--aurora-bg': t.backgroundColor || '#0a0f1d',
    '--aurora-primary': t.primaryColor || '#151525',
    '--aurora-secondary': t.secondaryColor || '#1c1c30',
    '--aurora-accent': t.accentColor || '#ff6b9d',
    '--aurora-text': t.textColor || '#f3f4f6',
    '--aurora-subtext': t.subTextColor || '#9ca3af',
    '--aurora-input-bg': t.inputBgColor || 'rgba(255,255,255,0.06)',
    '--aurora-button': t.buttonColor || t.accentColor || '#ff6b9d',
    '--aurora-button-text': t.buttonTextColor || '#ffffff',
    '--aurora-menu-bg': t.menuBgColor || '#151525',
    '--aurora-border': t.borderColor || 'rgba(255,255,255,0.08)',
    '--aurora-font-size': `${t.fontSize || 16}px`,
  };
};

/**
 * 桥的运行时脚本。注入到用户界面文档里，暴露 window.Aurora。
 * 用户 JS 可以用它操控界面、读写变量、发消息、切背景。
 */
export const buildBridgeRuntime = (): string => `
(function () {
  if (window.Aurora && window.Aurora.__v === ${BRIDGE_VERSION}) return;

  // 内置 Markdown/HTML 渲染器（保留 HTML 标签透传，让 AI 写的界面能真渲染）
  var __auroraMd = ${renderInlineMarkdown.toString()};

  var HOST = ${JSON.stringify(HOST_IDS)};
  var ALIAS = ${JSON.stringify(SELECTOR_ALIASES)};
  var state = { settings: {}, chat: null, messages: [], characters: [], media: {}, vars: {} };
  var listeners = { state: [], message: [], chunk: [] };

  function post(payload) {
    try {
      var s = JSON.stringify(payload);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(s);
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(s, '*');
      }
    } catch (e) {}
  }

  function byId(id) { return document.getElementById(id); }

  // 给宿主元素补挂别名 class，让 MMD 风格选择器能命中
  function applyAliases() {
    var map = [
      [HOST.input, ALIAS.input],
      [HOST.chatFlow, ALIAS.chatFlow],
      [HOST.sendBtn, ALIAS.sendBtn],
      [HOST.statusBar, ALIAS.statusBar],
    ];
    for (var i = 0; i < map.length; i++) {
      var el = byId(map[i][0]);
      if (!el || !map[i][1]) continue;
      for (var j = 0; j < map[i][1].length; j++) {
        try { el.classList.add(map[i][1][j]); } catch (e) {}
      }
    }
  }

  // 输入框：真实宿主优先，找不到就退化成页面里第一个 textarea（模板自带输入框的情况）
  function findInput() {
    return byId(HOST.input) || document.querySelector('textarea');
  }

  function emit(name, arg) {
    var ls = listeners[name] || [];
    for (var i = 0; i < ls.length; i++) {
      try { ls[i](arg); } catch (e) { console.warn('[Aurora] listener error', e); }
    }
  }

  var Aurora = {
    __v: ${BRIDGE_VERSION},
    HOST: HOST,

    // ---------- 事件 ----------
    on: function (name, fn) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(fn);
      return function () {
        var ls = listeners[name];
        var i = ls.indexOf(fn);
        if (i >= 0) ls.splice(i, 1);
      };
    },
    onState: function (fn) { return Aurora.on('state', fn); },
    onMessage: function (fn) { return Aurora.on('message', fn); },
    onChunk: function (fn) { return Aurora.on('chunk', fn); },

    // ---------- 状态读取 ----------
    getState: function () { return state; },
    getMessages: function () { return state.messages || []; },
    getSettings: function () { return state.settings || {}; },
    getChat: function () { return state.chat; },
    getCharacters: function () { return state.characters || []; },
    getVars: function () { return state.vars || {}; },
    getVar: function (k) { return (state.vars || {})[k]; },
    setVar: function (k, v) {
      state.vars[k] = v;
      post({ type: 'action', action: 'setVar', key: k, value: v });
    },

    /** media://名字 → 真实 uri（RN 侧已解析好的映射） */
    media: function (name) {
      return (state.media || {})[name] || '';
    },
    /** media://名字 → data URL（内嵌素材时可用） */
    mediaUrl: function (name) {
      return (state.media || {})[name] || '';
    },

    // ---------- 输入框操作（MMD 老代码的等价物） ----------
    appendToInput: function (text) {
      var ta = findInput();
      if (!ta) return false;
      var cur = ta.value == null ? '' : String(ta.value);
      ta.value = cur + (cur && text && text.charAt(0) !== '\\n' ? '' : '') + text;
      try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      post({ type: 'action', action: 'inputChanged', value: ta.value });
      return true;
    },
    setInput: function (text) {
      var ta = findInput();
      if (!ta) return false;
      ta.value = text == null ? '' : String(text);
      try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      post({ type: 'action', action: 'inputChanged', value: ta.value });
      return true;
    },
    getInput: function () {
      var ta = findInput();
      return ta ? String(ta.value || '') : '';
    },
    clearInput: function () { return Aurora.setInput(''); },

    // ---------- 消息 ----------
    send: function (text) {
      var t = text == null ? Aurora.getInput() : String(text);
      if (!t) return false;
      post({ type: 'action', action: 'send', text: t });
      return true;
    },
    stop: function () { post({ type: 'action', action: 'stop' }); },
    regenerate: function () { post({ type: 'action', action: 'regenerate' }); },

    // ---------- 界面 ----------
    setBackground: function (value, opts) {
      opts = opts || {};
      post({ type: 'action', action: 'setBackground', value: value, kind: opts.kind || 'auto',
             muted: opts.muted !== false, loop: opts.loop !== false });
      var bg = byId(HOST.background);
      if (bg) {
        var url = Aurora.media(value) || value;
        if ((opts.kind || 'auto') === 'color') {
          bg.style.background = value;
          bg.innerHTML = '';
        } else {
          var isVideo = /\\.(mp4|webm|mov|m4v)(\\?|$)/i.test(url) || (opts.kind === 'video');
          bg.innerHTML = isVideo
            ? '<video src="' + url + '" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover"></video>'
            : '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover">';
        }
      }
    },
    /** 给整个界面追加一段 CSS（美化开关的等价物） */
    injectCss: function (css, id) {
      var key = id || 'aurora-user-css';
      var el = document.getElementById(key);
      if (!el) {
        el = document.createElement('style');
        el.id = key;
        document.head.appendChild(el);
      }
      el.textContent = css || '';
      post({ type: 'action', action: 'injectCss', css: css, id: key });
    },
    scrollToBottom: function () {
      var flow = byId(HOST.chatFlow) || document.scrollingElement;
      if (flow) flow.scrollTop = flow.scrollHeight;
    },
    scrollToTop: function () {
      var flow = byId(HOST.chatFlow) || document.scrollingElement;
      if (flow) flow.scrollTop = 0;
    },
    /** 打开/关闭宿主侧边栏（RN 抽屉） */
    toggleSidebar: function () { post({ type: 'action', action: 'toggleSidebar' }); },
    /**
     * 把文字插入 **App 自己的聊天输入框**（不是本 WebView 里的输入框）。
     *
     * 和 appendToInput 的区别：appendToInput 找的是当前文档里的 <input>/<textarea>，
     * 只在「自定义界面模式」（界面自己画输入框）下有效；
     * 而内置 CSS 覆盖层里根本没有输入框，所以需要一个专门通往 RN 输入框的动作。
     */
    insertToChatInput: function (text) {
      post({ type: 'action', action: 'insertToChatInput', text: String(text == null ? '' : text) });
    },
    /**
     * 悬浮窗内拖动时上报位移（dx/dy，单位与页面 CSS 像素一致）。
     * RN 侧据此移动承载这块悬浮窗的 View —— 页面本身不做定位，
     * 否则窗口会盖住整个聊天区。
     */
    moveWidget: function (dx, dy) {
      post({ type: 'action', action: 'moveWidget', dx: Number(dx) || 0, dy: Number(dy) || 0 });
    },
    openRightMenu: function () { post({ type: 'action', action: 'openRightMenu' }); },
    toast: function (text) { post({ type: 'action', action: 'toast', text: String(text || '') }); },
    /** 打开一个 App 内置面板（按 MainNavigator 的 screen key） */
    openPanel: function (screen, section) {
      post({ type: 'action', action: 'openPanel', screen: screen, section: section });
    },
    /** 播放/暂停背景视频 */
    toggleBackgroundPlay: function () { post({ type: 'action', action: 'toggleBackgroundPlay' }); },
    setBackgroundMuted: function (muted) {
      post({ type: 'action', action: 'setBackgroundMuted', muted: !!muted });
    },

    __receive: function (payload) {
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'state') {
        state = Object.assign({}, state, payload.data || {});
        emit('state', state);
      } else if (payload.type === 'message') {
        state.messages = payload.messages || state.messages;
        emit('message', payload.message || null);
      } else if (payload.type === 'chunk') {
        emit('chunk', payload);
      } else if (payload.type === 'boot-done') {
        applyAliases();
        emit('state', state);
      }
    },

    /**
     * 把 AI 输出的 Markdown / HTML 转成可渲染的 HTML。
     * 关键：**不转义已有 HTML 标签**，这样 AI 写的界面代码（MMD 那套触发词替换产物）
     * 才能真的渲染成界面，而不是显示成一堆源码。
     */
    md: function (text) {
      try { return __auroraMd(text); } catch (e) { return String(text == null ? '' : text); }
    },
  };

  window.Aurora = Aurora;
  // 兼容：老代码常写这些全局函数
  window.auroraAppend = Aurora.appendToInput;
  window.auroraSetInput = Aurora.setInput;
  window.auroraSend = Aurora.send;
  window.auroraInjectCss = Aurora.injectCss;

  function ready() {
    applyAliases();
    post({ type: 'action', action: 'ready' });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
`;

/** 用户界面模板的类型 */
export interface UserInterfaceTemplate {
  /** 完整 HTML 片段（不含 <!DOCTYPE>/<html>，由构建器补） */
  html: string;
  css: string;
  js: string;
  /** 启动页等附加片段 */
  splashHtml?: string;
  splashCss?: string;
  /** 启动页显示时长（ms），0 = 不自动消失 */
  splashDuration?: number;
  sidebarHtml?: string;
  sidebarCss?: string;
  floatingHtml?: string;
  floatingCss?: string;
}

const DEFAULT_SHELL_CSS = `
:root { --aurora-radius: 14px; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%;
  background: var(--aurora-bg);
  color: var(--aurora-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-text-size-adjust: 100%;
}
body { overflow: hidden; }
#${HOST_IDS.root} { position: relative; display: flex; flex-direction: column; height: 100%; z-index: 1; }
#${HOST_IDS.background} { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
#${HOST_IDS.background} > * { width: 100%; height: 100%; object-fit: cover; display: block; }
#${HOST_IDS.chatFlow} { flex: 1; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; }
.aurora-msg { margin: 10px 14px; line-height: 1.7; word-break: break-word; }
.aurora-msg.user { text-align: right; }
.aurora-msg .aurora-bubble {
  display: inline-block; max-width: 86%; padding: 10px 14px; border-radius: var(--aurora-radius);
  background: var(--aurora-secondary); text-align: left; white-space: pre-wrap;
}
.aurora-msg.user .aurora-bubble { background: var(--aurora-accent); color: var(--aurora-button-text); }
.aurora-input-wrap { padding: 10px 14px; border-top: 1px solid var(--aurora-border); background: var(--aurora-menu-bg); }
#${HOST_IDS.input} {
  width: 100%; min-height: 44px; max-height: 200px; resize: none; outline: none;
  padding: 12px 14px; border-radius: 12px; border: 1px solid var(--aurora-border);
  background: var(--aurora-input-bg); color: var(--aurora-text); font-size: var(--aurora-font-size);
  font-family: inherit;
}
.aurora-toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
#${HOST_IDS.sendBtn} {
  padding: 8px 18px; border: none; border-radius: 10px; cursor: pointer;
  background: var(--aurora-button); color: var(--aurora-button-text); font-size: 14px; font-weight: 600;
}
`;

/**
 * 覆盖层（bare）模式的基础样式。
 *
 * 和默认外壳的区别：不预设任何界面骨架，只保证「整页透明、可交互」，
 * 让用户粘进来的 HTML/CSS/JS 自己决定长什么样。用于「内置 CSS（全局）」这类
 * 二次渲染层 —— 那里用户往往只写 CSS + 一小段 HTML，不该被默认骨架干扰。
 */
const BARE_SHELL_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; height: 100%;
  background: transparent;
  color: var(--aurora-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-text-size-adjust: 100%;
}
body { overflow: hidden; }
`;

/**
 * 构建完整的用户界面文档。
 * @param tpl 用户模板
 * @param theme 主题配置（转成 CSS 变量）
 * @param boot 初始状态
 * @param options.bare 覆盖层模式：不注入默认界面外壳，整页透明可交互
 */
export const buildUserInterfaceDocument = (
  tpl: UserInterfaceTemplate,
  theme: Record<string, any>,
  boot: Record<string, any>,
  options: { bare?: boolean } = {},
): string => {
  const bare = !!options.bare;
  const vars = buildThemeCssVars(theme);
  const rootVars = Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('');

  const splashPart =
    tpl.splashHtml || tpl.splashCss
      ? `<style>${tpl.splashCss || ''}</style><div id="aurora-splash-host">${tpl.splashHtml || ''}</div>`
      : '';
  const sidebarPart =
    tpl.sidebarHtml || tpl.sidebarCss
      ? `<style>${tpl.sidebarCss || ''}</style><div id="aurora-sidebar-host">${tpl.sidebarHtml || ''}</div>`
      : '';
  const floatingPart =
    tpl.floatingHtml || tpl.floatingCss
      ? `<style>${tpl.floatingCss || ''}</style><div id="aurora-floating-host">${tpl.floatingHtml || ''}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<style>:root{${rootVars}}</style>
<style>${bare ? BARE_SHELL_CSS : DEFAULT_SHELL_CSS}</style>
<style id="aurora-theme-css">${tpl.css || ''}</style>
${tpl.splashCss ? `<style>${tpl.splashCss}</style>` : ''}
${tpl.sidebarCss ? `<style>${tpl.sidebarCss}</style>` : ''}
${tpl.floatingCss ? `<style>${tpl.floatingCss}</style>` : ''}
</head>
<body>
${bare ? '' : `<div id="${HOST_IDS.background}"></div>`}
${sidebarPart}
${floatingPart}
${splashPart}
<div id="${HOST_IDS.root}"${bare ? ' class="aurora-bare"' : ''}>
  ${tpl.html || ''}
</div>
<script id="aurora-boot" type="application/json">${JSON.stringify(boot).replace(
    /</g,
    '\\u003c',
  )}</script>
<script>${buildBridgeRuntime()}</script>
<script>
(function () {
  var boot = {};
  try { boot = JSON.parse(document.getElementById('aurora-boot').textContent || '{}'); } catch (e) {}
  if (window.Aurora) {
    window.Aurora.__receive({ type: 'state', data: boot });
    window.Aurora.__receive({ type: 'boot-done' });
  }
})();
${tpl.js || ''}
${buildSplashAutoHideJs(Number(boot.splashDuration) || 0)}
</script>
</body>
</html>`;
};

/**
 * 判断一段内容是否只在「覆盖层里注入 CSS」就够了，还是需要真正的 HTML/JS 渲染层。
 *
 * 背景：对话设置里的「内置 CSS」有两个作用域。message 作用域会被注入每个气泡的 WebView，
 * 能生效；但 global 作用域原先被塞进一个 body 为空的独立 WebView —— CSS 出不去那个沙箱，
 * 等于完全没作用。所以 global 作用域里如果出现了 HTML 或 JS，就应该交给覆盖层渲染，
 * 而不是丢进那个空壳 WebView。
 */
export const contentNeedsRenderLayer = (content: string): boolean => {
  if (!content) return false;
  const s = String(content);
  // <style> 单独出现不算（只写 CSS 的人通常也包一层 style）
  const stripped = s.replace(/<style[\s\S]*?<\/style>/gi, '');
  if (/<(div|span|button|input|textarea|img|video|audio|canvas|svg|iframe|section|header|footer|nav|aside|a|p|ul|ol|li|table|details|script)\b/i.test(stripped)) {
    return true;
  }
  return /<script\b/i.test(s);
};

/** 渲染一条消息成 HTML（用户界面层用的默认气泡结构） */export const renderMessageHtml = (
  msg: { id: string; role: string; content: string; images?: string[] },
): string => {
  const cls = msg.role === 'user' ? 'aurora-msg user' : 'aurora-msg';
  const body = (msg.content || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div class="${cls}" data-id="${msg.id}"><div class="aurora-bubble">${body}</div></div>`;
};

/**
 * 轻量 Markdown → HTML。
 *
 * 为什么必须有：AI 的输出里经常夹着自己写的 HTML/CSS/JS（MMD 那套「触发词 → 正则替换成代码」），
 * 如果一律当纯文本转义，用户看到的就是一堆源码而不是渲染后的界面。
 * 这里做最小可用的转换：代码围栏、行内代码、粗斜体、标题、列表、引用、链接，
 * 并**保留 HTML 标签透传**（不转义已有标签），让 AI 输出的结构能真正渲染。
 */
export const renderInlineMarkdown = (text: string): string => {
  // 注意：这个函数会被 toString() 内联进 WebView 的运行时，
  // 所以**不能引用任何模块级变量/函数**（否则在 WebView 里是 ReferenceError）。
  // 所有依赖必须写在函数内部。
  const esc = (s: any): string =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  let s = String(text == null ? '' : text);

  // 先把代码块挖出来占位，避免里面的内容被后续规则改写
  const blocks: string[] = [];
  s = s.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const i = blocks.length;
    blocks.push(
      `<pre class="aurora-code" data-lang="${esc(lang || '')}"><code>${esc(code)}</code></pre>`,
    );
    return `\u0000BLOCK${i}\u0000`;
  });

  // 行内代码
  const inlines: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const i = inlines.length;
    inlines.push(`<code>${esc(code)}</code>`);
    return `\u0000INLINE${i}\u0000`;
  });

  // 标题
  s = s.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  s = s.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  s = s.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  s = s.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 引用、分隔线
  s = s.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
  s = s.replace(/^>\s?(.+)$/gm, '<blockquote>$1</blockquote>');
  s = s.replace(/^(-{3,}|\*{3,})$/gm, '<hr>');

  // 列表
  s = s.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  s = s.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');

  // 强调与删除线
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  // 链接
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );

  // 段落：连续非块级行包成 <p>
  s = s
    .split(/\n{2,}/)
    .map((chunk) => {
      const t = chunk.trim();
      if (!t) return '';
      if (/^\s*<(h[1-6]|ul|ol|li|pre|blockquote|hr|div|table|style|script|section|details)/i.test(t)) return t;
      if (/^\u0000BLOCK\d+\u0000$/.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  // 还原占位
  s = s.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)] || '');
  s = s.replace(/\u0000INLINE(\d+)\u0000/g, (_m, i: string) => inlines[Number(i)] || '');
  return s;
};

/** RN → 用户界面：构造一次状态更新（用 injectJavaScript 调 __receive） */
export const buildStateUpdateScript = (data: Record<string, any>): string => {
  const json = JSON.stringify({ type: 'state', data }).replace(/</g, '\\u003c');
  return `(function(){try{window.Aurora&&window.Aurora.__receive(${json})}catch(e){}})();true;`;
};

/** RN → 用户界面：推送流式分块 */
export const buildChunkScript = (messageId: string, chunk: string): string => {
  const json = JSON.stringify({ type: 'chunk', messageId, chunk }).replace(/</g, '\\u003c');
  return `(function(){try{window.Aurora&&window.Aurora.__receive(${json})}catch(e){}})();true;`;
};

/** RN → 用户界面：整体替换消息列表 */
export const buildMessageScript = (
  messages: Array<{ id: string; role: string; content: string; images?: string[] }>,
  last?: { id: string; role: string; content: string; images?: string[] },
): string => {
  const json = JSON.stringify({ type: 'message', messages, message: last || null }).replace(/</g, '\\u003c');
  return `(function(){try{window.Aurora&&window.Aurora.__receive(${json})}catch(e){}})();true;`;
};
