export interface AIJSResult {
  success: boolean;
  html?: string;
  statusVarUpdates?: Record<string, number | string>;
  errors?: string[];
  type?: 'statusBar' | 'floating' | 'sidebar' | 'greeting' | 'modal' | 'inline' | 'none';
  height?: number;
}

const AIJS_CODE_REGEX = /```(?:js|javascript|typescript|ts|jsx|tsx)\s*([\s\S]*?)```/gi;
const AIJS_SCRIPT_REGEX = /<script[^>]*>([\s\S]*?)<\/script>/gi;
const AIJS_HTML_REGEX = /```(?:html|htm|xml)\s*([\s\S]*?)```/gi;
const AIJS_CSS_REGEX = /```(?:css|scss|style)\s*([\s\S]*?)```/gi;

export const aiJSService = {
  hasAIJSCode: (text: string): boolean => {
    const has = AIJS_CODE_REGEX.test(text) || AIJS_SCRIPT_REGEX.test(text) || AIJS_HTML_REGEX.test(text) || AIJS_CSS_REGEX.test(text);
    AIJS_CODE_REGEX.lastIndex = 0;
    AIJS_SCRIPT_REGEX.lastIndex = 0;
    AIJS_HTML_REGEX.lastIndex = 0;
    AIJS_CSS_REGEX.lastIndex = 0;
    return has;
  },

  extractAIJSCode: (text: string): string[] => {
    const codes: string[] = [];
    let match;
    let cssStyles = '';

    AIJS_CSS_REGEX.lastIndex = 0;
    while ((match = AIJS_CSS_REGEX.exec(text)) !== null) {
      cssStyles += match[1].trim() + '\n';
    }

    AIJS_CODE_REGEX.lastIndex = 0;
    while ((match = AIJS_CODE_REGEX.exec(text)) !== null) {
      let code = match[1].trim();
      if (cssStyles && !code.includes('ui.inline.render') && !code.includes('ui.statusBar.render') && !code.includes('ui.floating.render') && !code.includes('ui.sidebar.render') && !code.includes('ui.greeting.render') && !code.includes('ui.modal.show')) {
        code = `ui.inline.render(\`<style>${cssStyles}</style><div id="root"></div>\`);\n${code}`;
      }
      codes.push(code);
    }

    AIJS_HTML_REGEX.lastIndex = 0;
    while ((match = AIJS_HTML_REGEX.exec(text)) !== null) {
      const html = match[1].trim();
      if (cssStyles) {
        codes.push(`ui.inline.render(\`<style>${cssStyles}</style>${html}\`);`);
      } else {
        codes.push(`ui.inline.render(\`${html}\`);`);
      }
    }

    AIJS_SCRIPT_REGEX.lastIndex = 0;
    while ((match = AIJS_SCRIPT_REGEX.exec(text)) !== null) {
      codes.push(match[1].trim());
    }

    return codes;
  },

  stripAIJSCode: (text: string): string => {
    let result = text;
    result = result.replace(AIJS_CODE_REGEX, '');
    result = result.replace(AIJS_SCRIPT_REGEX, '');
    result = result.replace(AIJS_HTML_REGEX, '');
    result = result.replace(AIJS_CSS_REGEX, '');
    return result.trim();
  },

  buildRuntimeLibrary: (): string => {
    return `
// ═══════════════════════════════════════════════
// AI Tavern Runtime Library v3.0
// ═══════════════════════════════════════════════

const __RN = window.ReactNativeWebView;
let __outputHtml = '';
let __outputType = 'inline';
let __varUpdates = {};
let __height = 0;

// ── 变量系统 ──
const __vars = {};
function setVar(name, value) {
  __vars[name] = value;
  __varUpdates[name] = value;
}
function getVar(name, fallback) {
  return __vars[name] !== undefined ? __vars[name] : fallback;
}
function addVar(name, delta) {
  const cur = Number(__vars[name]) || 0;
  __vars[name] = cur + delta;
  __varUpdates[name] = __vars[name];
  return __vars[name];
}
function incVar(name) { return addVar(name, 1); }
function decVar(name) { return addVar(name, -1); }
function deleteVar(name) { delete __vars[name]; __varUpdates[name] = null; }

// ── DOM 工具 ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style' && typeof v === 'object') {
        Object.assign(node.style, v);
      } else if (k === 'class' || k === 'className') {
        node.className = v;
      } else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'html') {
        node.innerHTML = v;
      } else {
        node.setAttribute(k, v);
      }
    }
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

// ── 组件库 ──
const Components = {
  progressBar: (opts) => {
    const { value = 50, max = 100, label, color = '#4CAF50', trackColor = '#333', height = 8, showText = true, animated = true } = opts;
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    const id = 'pb_' + Math.random().toString(36).slice(2, 9);
    const html = \`
      <div class="ai-comp-progress" data-id="\${id}">
        \${label ? \`<div class="ai-comp-progress-label">\${label}</div>\` : ''}
        <div class="ai-comp-progress-track" style="height:\${height}px;background:\${trackColor};border-radius:\${height/2}px;overflow:hidden;position:relative;">
          <div class="ai-comp-progress-fill \${animated ? 'ai-comp-animated' : ''}" style="width:\${pct}%;height:100%;background:\${color};border-radius:\${height/2}px;transition:width 0.5s ease;"></div>
        </div>
        \${showText ? \`<div class="ai-comp-progress-text">\${value}/\${max} (\${Math.round(pct)}%)</div>\` : ''}
      </div>
    \`;
    return html;
  },

  statCard: (opts) => {
    const { icon = '📊', label = '', value = '', color = '#fff', bgGradient = 'linear-gradient(135deg,#1a1a2e,#16213e)', borderColor = 'transparent' } = opts;
    return \`
      <div class="ai-comp-stat-card" style="background:\${bgGradient};border:1px solid \${borderColor};border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;min-width:0;">
        <div style="font-size:28px;line-height:1;flex-shrink:0;">\${icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="color:rgba(255,255,255,0.6);font-size:11px;text-transform:uppercase;letter-spacing:1px;">\${label}</div>
          <div style="color:\${color};font-size:20px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${value}</div>
        </div>
      </div>
    \`;
  },

  badge: (opts) => {
    const { text = '', color = '#fff', bg = '#333', icon = '' } = opts;
    return \`<span class="ai-comp-badge" style="display:inline-flex;align-items:center;gap:4px;background:\${bg};color:\${color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">\${icon ? icon + ' ' : ''}\${text}</span>\`;
  },

  divider: (opts = {}) => {
    const { color = 'rgba(255,255,255,0.1)', margin = 8 } = opts;
    return \`<div style="height:1px;background:\${color};margin:\${margin}px 0;"></div>\`;
  },

  avatar: (opts) => {
    const { src = '', size = 48, ring = false, ringColor = '#4CAF50' } = opts;
    const ringStyle = ring ? \`box-shadow:0 0 0 3px \${ringColor};\` : '';
    if (src) {
      return \`<img src="\${src}" style="width:\${size}px;height:\${size}px;border-radius:50%;object-fit:cover;\${ringStyle}" />\`;
    }
    return \`<div style="width:\${size}px;height:\${size}px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;font-size:\${size*0.4}px;\${ringStyle}">🎭</div>\`;
  },

  tooltip: (opts) => {
    const { text = '', tip = '' } = opts;
    return \`<span class="ai-comp-tooltip" style="position:relative;cursor:help;border-bottom:1px dotted rgba(255,255,255,0.3);">\${text}<span style="position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:#000;color:#fff;padding:4px 8px;border-radius:4px;font-size:11px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 0.2s;z-index:100;">\${tip}</span></span>\`;
  },

  chip: (opts) => {
    const { label = '', value = '', color = '#4CAF50', active = false } = opts;
    return \`<div class="ai-comp-chip" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:\${active ? color : 'rgba(255,255,255,0.05)'};color:\${active ? '#fff' : 'rgba(255,255,255,0.7)'};border:1px solid \${active ? color : 'rgba(255,255,255,0.1)'};font-size:13px;cursor:pointer;transition:all 0.2s;">\${label}\${value ? ': <strong>' + value + '</strong>' : ''}</div>\`;
  },

  gauge: (opts) => {
    const { value = 50, max = 100, label = '', size = 80, color = '#4CAF50', unit = '%' } = opts;
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    const r = size / 2 - 8;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    return \`
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
        <svg width="\${size}" height="\${size}" style="transform:rotate(-90deg);">
          <circle cx="\${size/2}" cy="\${size/2}" r="\${r}" fill="none" stroke="#333" stroke-width="6"/>
          <circle cx="\${size/2}" cy="\${size/2}" r="\${r}" fill="none" stroke="\${color}" stroke-width="6" stroke-dasharray="\${circ}" stroke-dashoffset="\${offset}" stroke-linecap="round" style="transition:stroke-dashoffset 0.5s ease;"/>
        </svg>
        <div style="margin-top:-\${size*0.65}px;margin-bottom:\${size*0.35}px;font-size:\${size*0.22}px;font-weight:700;color:\${color};">\${Math.round(pct)}\${unit}</div>
        \${label ? \`<div style="font-size:11px;color:rgba(255,255,255,0.6);">\${label}</div>\` : ''}
      </div>
    \`;
  },

  card: (opts) => {
    const { title = '', subtitle = '', content = '', footer = '', gradient = 'linear-gradient(135deg,#1a1a2e,#16213e)', borderColor = 'rgba(255,255,255,0.1)', glow = false } = opts;
    const glowStyle = glow ? \`box-shadow:0 0 20px rgba(76,175,80,0.3);\` : '';
    return \`
      <div class="ai-comp-card" style="background:\${gradient};border:1px solid \${borderColor};border-radius:16px;padding:16px;\${glowStyle}">
        \${title ? \`<div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px;">\${title}</div>\` : ''}
        \${subtitle ? \`<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-bottom:12px;">\${subtitle}</div>\` : ''}
        <div style="color:rgba(255,255,255,0.85);font-size:14px;line-height:1.6;">\${content}</div>
        \${footer ? \`<div style="margin-top:12px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);font-size:12px;color:rgba(255,255,255,0.5);">\${footer}</div>\` : ''}
      </div>
    \`;
  },

  tabs: (opts) => {
    const { tabs = [], active = 0 } = opts;
    const tabsHtml = tabs.map((t, i) => 
      \`<div class="ai-comp-tab \${i === active ? 'active' : ''}" data-tab="\${i}" style="flex:1;padding:8px 12px;text-align:center;font-size:13px;cursor:pointer;color:\${i === active ? '#fff' : 'rgba(255,255,255,0.5)'};border-bottom:\${i === active ? '2px solid #4CAF50' : '2px solid transparent'};transition:all 0.2s;">\${t.label || t}</div>\`
    ).join('');
    const contentHtml = tabs[active] ? (tabs[active].content || '') : '';
    return \`<div class="ai-comp-tabs"><div style="display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,0.1);">\${tabsHtml}</div><div class="ai-comp-tab-content" style="padding:12px 0;">\${contentHtml}</div></div>\`;
  },

  log: (msg) => {
    console.log('[AIJS]', msg);
  },
};

// ── CSS 动画工具 ──
const Animations = {
  shimmer: \`
    @keyframes ai-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .ai-anim-shimmer {
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      background-size: 200% 100%;
      animation: ai-shimmer 2s infinite;
    }
  \`,
  pulse: \`
    @keyframes ai-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.05); }
    }
    .ai-anim-pulse { animation: ai-pulse 1.5s ease-in-out infinite; }
  \`,
  glow: \`
    @keyframes ai-glow {
      0%, 100% { box-shadow: 0 0 5px rgba(76,175,80,0.3); }
      50% { box-shadow: 0 0 20px rgba(76,175,80,0.7); }
    }
    .ai-anim-glow { animation: ai-glow 2s ease-in-out infinite; }
  \`,
  slideUp: \`
    @keyframes ai-slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ai-anim-slide-up { animation: ai-slideUp 0.4s ease-out; }
  \`,
  fadeIn: \`
    @keyframes ai-fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .ai-anim-fade-in { animation: ai-fadeIn 0.5s ease-out; }
  \`,
  bounce: \`
    @keyframes ai-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    .ai-anim-bounce { animation: ai-bounce 1s ease-in-out infinite; }
  \`,
  rotate: \`
    @keyframes ai-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .ai-anim-rotate { animation: ai-rotate 2s linear infinite; }
  \`,
  flash: \`
    @keyframes ai-flash {
      0%, 100% { background-color: transparent; }
      50% { background-color: rgba(255,255,255,0.15); }
    }
    .ai-anim-flash { animation: ai-flash 0.8s ease-in-out infinite; }
  \`,
  all: function() {
    return [this.shimmer, this.pulse, this.glow, this.slideUp, this.fadeIn, this.bounce, this.rotate, this.flash].join('\\n');
  },
};

// ── 事件工具 ──
function emit(eventName, data) {
  if (__RN) {
    __RN.postMessage(JSON.stringify({ type: 'aijs_event', eventName, data }));
  }
}

function onUpdate(callback) {
  window.__aijsUpdate = callback;
}

// ── 渲染 API ──
function __renderToRoot(html) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = html;
  }
  __outputHtml = html;
  __notifyHeight();
}

function __notifyHeight() {
  setTimeout(() => {
    const h = document.body ? document.body.scrollHeight : 0;
    if (h !== __height) {
      __height = h;
      if (__RN) {
        __RN.postMessage(JSON.stringify({
          type: 'aijs_height',
          height: h,
        }));
      }
    }
  }, 10);
}

let __heightObserver = null;
function __startHeightObserver() {
  if (__heightObserver) return;
  if (typeof ResizeObserver !== 'undefined') {
    __heightObserver = new ResizeObserver(() => __notifyHeight());
    __heightObserver.observe(document.body);
  } else {
    setInterval(__notifyHeight, 500);
  }
}

const ui = {
  inline: {
    render: (html) => {
      __outputType = 'inline';
      __renderToRoot(html);
    },
    mount: (element) => {
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML = '';
        root.appendChild(element);
      }
      __outputType = 'inline';
      __outputHtml = root ? root.innerHTML : '';
      __notifyHeight();
    },
  },
  statusBar: {
    render: (html) => { __outputHtml = html; __outputType = 'statusBar'; __renderToRoot(html); },
    setVar, getVar, addVar, incVar, decVar,
  },
  floating: {
    render: (html) => { __outputHtml = html; __outputType = 'floating'; __renderToRoot(html); },
  },
  sidebar: {
    render: (html) => { __outputHtml = html; __outputType = 'sidebar'; __renderToRoot(html); },
  },
  greeting: {
    render: (html) => { __outputHtml = html; __outputType = 'greeting'; __renderToRoot(html); },
  },
  modal: {
    show: (html) => { __outputHtml = html; __outputType = 'modal'; __renderToRoot(html); },
  },
  components: Components,
  animations: Animations,
  log: (msg) => console.log('[AIJS]', msg),
  notifyHeight: __notifyHeight,
  ready: () => {
    if (__RN) {
      __RN.postMessage(JSON.stringify({
        type: 'aijs_ready',
      }));
    }
  },
};

// 兼容旧写法：直接操作 document.getElementById('root').innerHTML 的，也能捕获
function __observeRoot() {
  const root = document.getElementById('root');
  if (!root) return;
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (!__outputHtml || root.children.length > 0) {
        __outputHtml = root.innerHTML;
        if (!__outputType || __outputType === 'none') {
          __outputType = 'inline';
        }
        __notifyHeight();
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }
}

// ── 完成信号 ──
function __finish() {
  __height = document.body ? document.body.scrollHeight : 0;
  __startHeightObserver();
  __observeRoot();
  if (__RN) {
    __RN.postMessage(JSON.stringify({
      type: 'aijs_result',
      html: __outputHtml,
      outputType: __outputType,
      vars: __varUpdates,
      height: __height,
      success: true,
    }));
  }
}

// 确保 DOMContentLoaded 事件能被用户代码捕获
// 脚本在 body 末尾执行时，DOMContentLoaded 尚未触发
// 如果用户代码用了 DOMContentLoaded 监听，会正常执行
// 我们在 DOMContentLoaded 之后再通知完成
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // DOMContentLoaded 已触发或即将触发，用 setTimeout 等用户代码先执行
  setTimeout(() => setTimeout(__finish, 50), 0);
} else {
  document.addEventListener('DOMContentLoaded', () => setTimeout(__finish, 50));
}
    `.trim();
  },

  buildSandboxEnvironment: (
    statusVars: Record<string, number | string>,
    chatTitle: string,
    messageCount: number
  ): string => {
    return `
const __initVars = ${JSON.stringify(statusVars)};
const __chatTitle = ${JSON.stringify(chatTitle || '')};
const __messageCount = ${messageCount || 0};
Object.assign(__vars, __initVars);
const chatTitle = __chatTitle;
const messageCount = __messageCount;
    `.trim();
  },

  buildAIJSWebViewHtml: (
    code: string,
    statusVars: Record<string, number | string>,
    chatTitle: string,
    messageCount: number,
  ): string => {
    const runtime = aiJSService.buildRuntimeLibrary();
    const sandbox = aiJSService.buildSandboxEnvironment(statusVars, chatTitle, messageCount);

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
html, body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: transparent;
  overflow: hidden;
  width: 100%;
  -webkit-user-select: none;
  user-select: none;
}
body { padding: 2px; }
#root { width: 100%; }
.ai-comp-progress-label { color: rgba(255,255,255,0.7); font-size: 12px; margin-bottom: 4px; }
.ai-comp-progress-text { color: rgba(255,255,255,0.5); font-size: 11px; margin-top: 2px; text-align: right; }
.ai-comp-animated {
  background-size: 200% 100% !important;
  background-image: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent) !important;
  animation: ai-progress-shimmer 2s infinite;
}
@keyframes ai-progress-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.ai-comp-tooltip:hover span { opacity: 1 !important; }
.ai-comp-tab:hover { color: rgba(255,255,255,0.8) !important; }
${'/* runtime animations will be injected by Animations.all() */'}
</style>
<style id="ai-animations"></style>
</head>
<body>
<div id="root"></div>
<script>
// Web 环境兼容：如果没有 ReactNativeWebView，则通过 parent.postMessage 通信
if (typeof window.ReactNativeWebView === 'undefined') {
  window.ReactNativeWebView = {
    postMessage: function(data) {
      try { window.parent.postMessage(data, '*'); } catch(e) {}
    }
  };
}

${runtime}
${sandbox}

// 注入动画 CSS
document.getElementById('ai-animations').textContent = Animations.all();

try {
  ${code}
} catch(e) {
  document.getElementById('root').innerHTML = '<div style="color:#ff6b6b;padding:12px;font-size:13px;border:1px solid #ff6b6b33;border-radius:8px;margin:8px;">⚠️ 渲染错误: ' + e.message + '</div>';
  __outputHtml = document.getElementById('root').innerHTML;
  if (__RN) {
    __RN.postMessage(JSON.stringify({
      type: 'aijs_result',
      html: __outputHtml,
      outputType: 'inline',
      vars: __varUpdates,
      height: 0,
      success: false,
      errors: [e.message],
    }));
  }
}

// 如果代码没有调用 ui.*.render()，但修改了 DOM，则自动捕获
setTimeout(() => {
  if (!__outputHtml && document.getElementById('root').children.length > 0) {
    __outputHtml = document.getElementById('root').innerHTML;
    __outputType = 'inline';
  }
  __finish();
}, 200);
</script>
</body>
</html>`;
  },

  executeAIJS: async (
    _code: string,
    statusVars: Record<string, number | string>,
    _chatTitle?: string,
    _messageCount?: number
  ): Promise<AIJSResult> => {
    return {
      success: true,
      html: '',
      type: 'none',
      statusVarUpdates: statusVars,
    };
  },
};
