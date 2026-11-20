/**
 * 自定义界面（方案B）校验脚本。
 *
 *   node scripts/verify-ui.js
 *
 * 为什么要单独有这个东西：自定义界面的核心是**运行时拼出来的 JS 字符串**
 * （buildBridgeRuntime 把函数内联进 WebView）。
 * 这类代码 tsc 检查不出来 —— 类型全对，但生成的字符串可能在 WebView 里直接抛错白屏。
 * 所以这里用 Babel 真正转译、在模拟 DOM 里真正执行，验证：
 *   1. 桥运行时是合法 JS 且 API 齐全
 *   2. 内联的 Markdown 渲染器能真的跑（不能引用模块级变量，否则 ReferenceError）
 *   3. 默认模板语法正确且用的是 Aurora.md（否则 AI 输出的界面不会渲染）
 *   4. 组装出的完整文档里每一段内联脚本都能被解析
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..');
const servicesDir = path.join(projectRoot, 'src', 'services');
const compiledDir = path.join(__dirname, '.compiled');

let babel;
try {
  babel = require(path.join(projectRoot, 'node_modules', '@babel', 'core'));
} catch (e) {
  console.error('需要 @babel/core（应在 node_modules 里）：', e.message);
  process.exit(1);
}

const tsPlugin = require.resolve(
  path.join(projectRoot, 'node_modules', '@babel', 'plugin-transform-typescript'),
);
const cjsPlugin = require.resolve(
  path.join(projectRoot, 'node_modules', '@babel', 'plugin-transform-modules-commonjs'),
);

fs.mkdirSync(compiledDir, { recursive: true });

/** 用 Babel 把 TS 转成 CommonJS 落盘，返回可 require 的绝对路径 */
function transpile(fileName) {
  const abs = path.join(servicesDir, fileName);
  const code = fs.readFileSync(abs, 'utf8');
  const res = babel.transformSync(code, {
    filename: abs,
    babelrc: false,
    configFile: false,
    presets: [],
    plugins: [[tsPlugin, { isTSX: false, allowDeclareFields: true }], [cjsPlugin]],
    sourceMaps: false,
  });
  const outPath = path.join(compiledDir, fileName.replace(/\.tsx?$/, '.js'));
  fs.writeFileSync(outPath, res.code, 'utf8');
  return outPath;
}

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

/** 极简 DOM 桩，够跑 bridge runtime */
function makeSandbox() {
  const el = (id) => ({
    id,
    value: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    textContent: '',
    innerHTML: '',
    appendChild() {},
    insertBefore() {},
    dispatchEvent() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute() {},
    getAttribute: () => null,
    remove() {},
  });
  const sandbox = {
    console,
    JSON,
    Math,
    Date,
    String,
    Number,
    Object,
    Array,
    RegExp,
    Error,
    Event: function () {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    prompt: () => null,
  };
  sandbox.document = {
    readyState: 'complete',
    head: el('head'),
    body: el('body'),
    documentElement: el('html'),
    getElementById: (id) => el(id),
    querySelector: () => el('q'),
    querySelectorAll: () => [],
    createElement: () => el('new'),
    addEventListener: () => {},
    scrollingElement: el('scroll'),
  };
  sandbox.window = sandbox;
  sandbox.window.ReactNativeWebView = { postMessage: () => {} };
  sandbox.parent = sandbox;
  return sandbox;
}

console.log('=== 1. 桥运行时语法与 API ===');
let bridge;
try {
  bridge = require(transpile('userInterfaceBridge.ts'));
  console.log('  OK   userInterfaceBridge.ts 转译并加载');
} catch (e) {
  console.error('  FAIL 加载 userInterfaceBridge.ts:', e.message);
  process.exit(1);
}

let runtimeSrc = '';
check('buildBridgeRuntime 可调用且内容充实', () => {
  runtimeSrc = bridge.buildBridgeRuntime();
  if (typeof runtimeSrc !== 'string' || runtimeSrc.length < 800) throw new Error('内容过短');
});

check('运行时是合法 JS', () => {
  new vm.Script(runtimeSrc, { filename: 'bridge-runtime.js' });
});

check('运行时包含全部关键 API', () => {
  const apis = [
    'appendToInput', 'setInput', 'getInput', 'clearInput',
    'send', 'stop', 'regenerate',
    'setVar', 'getVar', 'media',
    'setBackground', 'injectCss', 'scrollToBottom', 'scrollToTop',
    'toggleSidebar', 'openRightMenu', 'openPanel', 'toast',
    'toggleBackgroundPlay', 'setBackgroundMuted',
    'onState', 'onMessage', 'onChunk', '__receive', 'md',
  ];
  const missing = apis.filter((a) => runtimeSrc.indexOf(a) === -1);
  if (missing.length) throw new Error('缺少 API: ' + missing.join(', '));
});

check('Markdown 渲染器被真正内联', () => {
  if (!/__auroraMd\s*=\s*(text|function|\(|\w+\s*=>)/.test(runtimeSrc)) {
    throw new Error('__auroraMd 未被赋值，Aurora.md 会是空实现');
  }
  if (runtimeSrc.indexOf('aurora-code') === -1) {
    throw new Error('内联内容里没有代码块处理，可能内联的不是渲染器');
  }
});

check('MMD 风格选择器别名已写入运行时', () => {
  for (const alias of ['chat-input-scope', 'chatMsgTextarea', 'chat-scope-box', 'send-msg']) {
    if (runtimeSrc.indexOf(alias) === -1) throw new Error('缺少别名: ' + alias);
  }
});

console.log('=== 2. 运行时在模拟 DOM 中实际执行 ===');
check('初始化并暴露 window.Aurora，且内联渲染器可执行', () => {
  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  vm.runInContext(runtimeSrc, sandbox, { filename: 'bridge-runtime.js' });

  const A = sandbox.window.Aurora;
  if (!A) throw new Error('window.Aurora 未定义');
  if (typeof A.appendToInput !== 'function') throw new Error('appendToInput 不是函数');
  if (typeof A.md !== 'function') throw new Error('md 不是函数');

  // 关键：真正执行内联渲染器。只查字符串会漏掉「引用了模块级变量 -> ReferenceError」
  const fence = A.md('```js\nconst a = 1 < 2;\n```');
  if (fence.indexOf('&lt;') === -1) {
    throw new Error('代码块内 < 未转义（可能引用了外部变量）: ' + fence);
  }
  if (fence.indexOf('aurora-code') === -1) throw new Error('代码块结构缺失');
  const inline = A.md('**x** and `y`');
  if (inline.indexOf('<strong>x</strong>') === -1) throw new Error('粗体失败');
  if (inline.indexOf('<code>y</code>') === -1) throw new Error('行内代码失败');
  const kept = A.md('<div class="p">z</div>');
  if (kept.indexOf('<div class="p">') === -1) {
    throw new Error('HTML 被转义，AI 写的界面不会渲染');
  }

  A.__receive({
    type: 'state',
    data: { chat: { title: 'T' }, messages: [{ id: '1', role: 'user', content: 'hi' }] },
  });
  if (A.getMessages().length !== 1) throw new Error('状态注入失败');
  A.setVar('hp', 5);
  if (A.getVar('hp') !== 5) throw new Error('setVar 失败');
});

console.log('=== 3. 渲染器边界情况 ===');
check('保留 HTML 标签', () => {
  if (bridge.renderInlineMarkdown('<div class="panel">hi</div>').indexOf('<div class="panel">') === -1) {
    throw new Error('被转义');
  }
});
check('标题 / 列表 / 引用', () => {
  const out = bridge.renderInlineMarkdown('# H\n\n- a\n- b\n\n> q');
  if (out.indexOf('<h1>H</h1>') === -1) throw new Error('标题失败');
  if (out.indexOf('<li>a</li>') === -1) throw new Error('列表失败');
  if (out.indexOf('<blockquote>') === -1) throw new Error('引用失败');
});
check('空值不抛错', () => {
  bridge.renderInlineMarkdown('');
  bridge.renderInlineMarkdown(null);
  bridge.renderInlineMarkdown(undefined);
});

console.log('=== 4. 默认模板 ===');
let ci;
try {
  ci = require(transpile('customInterface.ts'));
  console.log('  OK   customInterface.ts 转译并加载');
} catch (e) {
  failures++;
  console.error('  FAIL 加载 customInterface.ts:', e.message);
}
if (ci) {
  check('默认模板 JS 语法合法', () => {
    new vm.Script(ci.DEFAULT_CUSTOM_INTERFACE_JS, { filename: 'default-ui.js' });
  });
  check('默认模板用 Aurora.md 渲染（否则 AI 输出的界面不显示）', () => {
    if (ci.DEFAULT_CUSTOM_INTERFACE_JS.indexOf('Aurora.md(') === -1) {
      throw new Error('仍是纯文本转义');
    }
  });
  check('默认配置九个部分都非空', () => {
    const d = ci.buildDefaultCustomInterface();
    for (const k of [
      'html', 'css', 'js',
      'splashHtml', 'splashCss',
      'sidebarHtml', 'sidebarCss',
      'floatingHtml', 'floatingCss',
    ]) {
      if (!d[k] || String(d[k]).length < 20) throw new Error(`${k} 为空`);
    }
    if (!(d.splashDuration > 0)) throw new Error('splashDuration 未设置');
  });
  check('normalizeCustomInterface(null) 返回完整默认', () => {
    const n = ci.normalizeCustomInterface(null);
    if (!n.html || !n.css || !n.js) throw new Error('归一化后为空');
  });
}

console.log('=== 5. 完整文档组装 ===');
check('产出合法文档且每段内联脚本都能解析', () => {
  const doc = bridge.buildUserInterfaceDocument(
    {
      html: '<div id="aurora-chat-flow"></div><textarea id="aurora-input"></textarea>',
      css: '.aurora-msg{color:red}',
      js: 'Aurora.onState(function(s){});',
      splashHtml: '<div id="aurora-splash"></div>',
      splashCss: '#aurora-splash{opacity:1}',
      splashDuration: 1800,
    },
    { backgroundColor: '#000000', accentColor: '#ff00ff' },
    { chat: { title: 't' }, messages: [], splashDuration: 1800 },
  );
  if (doc.indexOf('<!DOCTYPE html>') !== 0) throw new Error('缺少文档头');
  if (doc.indexOf('--aurora-accent') === -1) throw new Error('主题变量未注入');
  if (doc.indexOf('aurora-splash') === -1) throw new Error('启动页未注入');
  if (doc.indexOf('aurora-chat-flow') === -1) throw new Error('用户 HTML 未注入');
  const scripts = [...doc.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length === 0) throw new Error('无内联脚本');
  scripts.forEach((m, i) => new vm.Script(m[1], { filename: `doc-script-${i}.js` }));
  console.log(`       （共校验 ${scripts.length} 段内联脚本）`);
});

check('buildSplashAutoHideJs：有时长合法，为 0 时返回空', () => {
  new vm.Script(bridge.buildSplashAutoHideJs(1800), { filename: 'splash.js' });
  if (bridge.buildSplashAutoHideJs(0) !== '') throw new Error('0 时应返回空串');
});

check('state / chunk / message 注入脚本合法', () => {
  new vm.Script(bridge.buildStateUpdateScript({ a: 1 }));
  new vm.Script(bridge.buildChunkScript('m1', 'chunk'));
  new vm.Script(bridge.buildMessageScript([{ id: '1', role: 'user', content: 'x' }]));
});

console.log('=== 6. 「内置 CSS」全局作用域的判定与覆盖层 ===');
check('纯 CSS 不触发渲染层（走 GlobalCSSRenderer）', () => {
  const cases = [
    '.aurora-bubble { font-weight: bold }',
    'body { font-size: 16px; }',
    '<style>.x { color: red }</style>',
    ':root { --aurora-accent: #f0f }',
  ];
  for (const c of cases) {
    if (bridge.contentNeedsRenderLayer(c)) throw new Error('纯 CSS 被误判为需要渲染层: ' + c);
  }
});

check('含 HTML 或 JS 才触发渲染层', () => {
  const cases = [
    '<div class="fab">↓</div>',
    '<style>.a{}</style><button onclick="Aurora.send(1)">x</button>',
    '<script>Aurora.toast("hi")</script>',
    '<img src="media://bg">',
    '<video src="media://x" autoplay muted></video>',
    '<canvas id="c"></canvas>',
  ];
  for (const c of cases) {
    if (!bridge.contentNeedsRenderLayer(c)) throw new Error('应触发渲染层但没触发: ' + c);
  }
});

check('空输入 / null 不触发', () => {
  if (bridge.contentNeedsRenderLayer('')) throw new Error('空串不应触发');
  if (bridge.contentNeedsRenderLayer(null)) throw new Error('null 不应触发');
});

check('cover 层（bare）文档：仍是合法文档且脚本可解析、无默认外壳', () => {
  const doc = bridge.buildUserInterfaceDocument(
    { html: '<div class="fab" onclick="Aurora.scrollToBottom()">↓</div>', css: '', js: '' },
    { accentColor: '#ff00ff' },
    { chat: { title: 't' }, messages: [] },
    { bare: true },
  );
  const scripts = [...doc.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)];
  scripts.forEach((m, i) => new vm.Script(m[1], { filename: `bare-script-${i}.js` }));
  if (scripts.length === 0) throw new Error('覆盖层文档没有内联脚本');
  if (doc.indexOf('aurora-bare') === -1) throw new Error('缺少 bare 标记');
  if (doc.indexOf('--aurora-accent') === -1) throw new Error('主题变量未注入');
  // 默认外壳里的输入框骨架不应该出现
  if (doc.indexOf('aurora-input-wrap') !== -1) throw new Error('bare 模式仍注入了默认界面骨架');
});

check('覆盖层文档里的运行时同样能初始化 Aurora', () => {
  const doc = bridge.buildUserInterfaceDocument(
    { html: '<div id="x"></div>', css: '', js: '' },
    {},
    { messages: [] },
    { bare: true },
  );
  const m = [...doc.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)];
  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  m.forEach((mm) => vm.runInContext(mm[1], sandbox, { filename: 'bare.js' }));
  if (!sandbox.window.Aurora) throw new Error('覆盖层里没有 window.Aurora');
});

console.log('=== 7. AI 界面指令 ===');
let dir;
try {
  dir = require(transpile('uiDirectiveService.ts'));
  console.log('  OK   uiDirectiveService.ts 转译并加载');
} catch (e) {
  failures++;
  console.error('  FAIL 加载 uiDirectiveService.ts:', e.message);
}
if (dir) {
  check('解析花括号指令并从正文剔除', () => {
    const r = dir.parseUiDirectives('你好{{ui:bg=背景图}}世界');
    if (r.directives.length !== 1) throw new Error('应解析出 1 条，得到 ' + r.directives.length);
    if (r.directives[0].key !== 'bg' || r.directives[0].value !== '背景图') {
      throw new Error('解析结果不对: ' + JSON.stringify(r.directives));
    }
    if (r.content.indexOf('{{ui') !== -1) throw new Error('指令没被剔除: ' + r.content);
    if (r.content.indexOf('你好') === -1 || r.content.indexOf('世界') === -1) {
      throw new Error('正文被误删: ' + r.content);
    }
  });

  check('解析方括号指令 [UI:...]', () => {
    const r = dir.parseUiDirectives('正文[UI:img=插图A]结尾');
    if (r.directives.length !== 1) throw new Error('应解析出 1 条');
    if (r.directives[0].key !== 'img' || r.directives[0].value !== '插图A') {
      throw new Error('解析不对: ' + JSON.stringify(r.directives));
    }
  });

  check('中文别名可用', () => {
    const r = dir.parseUiDirectives('{{ui:背景=夜色}}{{ui:装饰=雪花}}');
    const keys = r.directives.map((d) => d.key).sort();
    if (keys.join(',') !== 'bg,decor') throw new Error('中文别名未生效: ' + keys.join(','));
  });

  check('冒号分隔也支持', () => {
    const r = dir.parseUiDirectives('{{ui:color-accent:#ff0066}}');
    if (r.directives[0]?.key !== 'color-accent') throw new Error('冒号分隔失败');
    if (r.directives[0]?.value !== '#ff0066') throw new Error('值解析失败: ' + r.directives[0]?.value);
  });

  check('未知键被忽略、且不破坏原文', () => {
    const r = dir.parseUiDirectives('{{ui:不存在的键=值}}');
    if (r.directives.length !== 0) throw new Error('未知键不应解析');
    if (r.content.indexOf('{{ui') === -1) throw new Error('未知键不应被剔除');
  });

  check('不影响普通文本（性能守卫）', () => {
    const r = dir.parseUiDirectives('这是一段没有任何指令的普通回复，包含 ui 两个字母。');
    if (r.directives.length !== 0) throw new Error('误判为指令');
    if (r.content !== '这是一段没有任何指令的普通回复，包含 ui 两个字母。') {
      throw new Error('正文被改动');
    }
  });

  check('applyDirectives 累积、clear 清零', () => {
    let s = dir.emptyUiState();
    s = dir.applyDirectives(s, [
      { key: 'color-accent', value: '#f00' },
      { key: 'decor', value: '雪花' },
      { key: 'bg', value: '夜景' },
    ]);
    if (s.colors['color-accent'] !== '#f00') throw new Error('颜色未累积');
    if (s.decor !== '雪花') throw new Error('装饰未累积');
    if (s.bg !== '夜景') throw new Error('背景未累积');
    s = dir.applyDirectives(s, [{ key: 'clear', value: '' }]);
    if (s.decor || s.bg || Object.keys(s.colors).length !== 0) throw new Error('clear 未清零');
  });

  check('theme 预设展开成颜色', () => {
    let s = dir.emptyUiState();
    s = dir.applyDirectives(s, [{ key: 'theme', value: '暗黑金' }]);
    if (!s.colors['color-accent']) throw new Error('预设颜色未展开');
    if (s.theme !== '暗黑金') throw new Error('主题名未记录');
  });

  check('img 指令累积且去重', () => {
    let s = dir.emptyUiState();
    s = dir.applyDirectives(s, [
      { key: 'img', value: 'A' },
      { key: 'img', value: 'A' },
      { key: 'img', value: 'B' },
    ]);
    if (s.images.length !== 2) throw new Error('去重失败: ' + JSON.stringify(s.images));
  });

  check('每个内置装饰都有 CSS，且 names 与 DECORATIONS 一致', () => {
    for (const [k, v] of Object.entries(dir.DECORATIONS)) {
      if (!v || typeof v.css !== 'string') throw new Error(`装饰 ${k} 缺少 css`);
      if (v.name !== k) throw new Error(`装饰 ${k} 的 name 不一致: ${v.name}`);
    }
    if (!dir.DECORATIONS['雪花'] || !dir.DECORATIONS['雪花'].css) {
      throw new Error('缺少雪花装饰');
    }
  });

  check('给 AI 的指令说明包含全部键', () => {
    const p = dir.buildUiDirectivePrompt();
    for (const k of dir.UI_DIRECTIVE_KEYS) {
      if (p.indexOf(`ui:${k}`) === -1 && k !== 'clear') {
        throw new Error('说明里缺少键: ' + k);
      }
    }
  });

  check('预设触发词正则：pattern 都是合法正则、replacement 都是合法指令', () => {
    const presets = dir.buildDirectiveRegexPresets();
    if (!Array.isArray(presets) || presets.length === 0) throw new Error('没有预设');
    for (const p of presets) {
      // 1) pattern 必须是合法正则
      let re;
      try {
        re = new RegExp(p.pattern);
      } catch (e) {
        throw new Error(`pattern 不是合法正则: ${p.name} -> ${p.pattern}`);
      }
      // 2) scope 必须是 output（要替换 AI 的输出）
      if (p.scope !== 'output') throw new Error(`${p.name} 的 scope 不是 output`);
      // 3) 替换结果必须能被指令解析器认出至少一条指令；
      //    带 $1 捕获组的用样例值填充后再验
      const sample = p.replacement.replace(/\$1/g, '#ff0000');
      const parsed = dir.parseUiDirectives(sample);
      if (parsed.directives.length === 0) {
        throw new Error(`${p.name} 的替换结果不是有效指令: ${p.replacement}`);
      }
      // 4) 替换后正文里不该残留触发词本身（固定词条的简单检查）
      if (!p.pattern.includes('$') && !p.pattern.includes('\\')) {
        const replaced = 'pre ' + p.pattern + ' post';
        const out = replaced.replace(re, p.replacement);
        if (out.includes(p.pattern)) throw new Error(`${p.name} 替换后仍残留触发词`);
      }
    }
  });

  check('预设触发词互不重复', () => {
    const presets = dir.buildDirectiveRegexPresets();
    const seen = new Set();
    for (const p of presets) {
      if (seen.has(p.pattern)) throw new Error('重复的 pattern: ' + p.pattern);
      seen.add(p.pattern);
    }
  });

  console.log('=== 8. 指令 → CSS 渲染（集成）===');

  check('buildUiStateCss 对每个颜色键都产出对应规则', () => {
    const expectSel = {
      'color-bubble': '.aurora-bubble',
      'color-user': '.aurora-msg.user',
      'color-text': 'body',
      'color-accent': 'a, strong',
      'color-border': 'border: 1px solid',
      'color-bg': 'body { background',
    };
    for (const [key, needle] of Object.entries(expectSel)) {
      const css = dir.buildUiStateCss({ colors: { [key]: '#123456' } });
      if (!css.includes(needle)) {
        throw new Error(`${key} 没产出预期选择器（找 ${needle}）：${css}`);
      }
      if (!css.includes('#123456')) throw new Error(`${key} 的颜色值丢了：${css}`);
      if (!css.includes('!important')) throw new Error(`${key} 缺少 !important，会被平台样式盖掉`);
    }
  });

  check('未知颜色键被忽略、空值被跳过', () => {
    const css = dir.buildUiStateCss({ colors: { 'color-unknown': '#fff' } });
    if (css !== '') throw new Error('未知键应被忽略，得到: ' + css);
    const css2 = dir.buildUiStateCss({ colors: { 'color-bubble': '' } });
    if (css2 !== '') throw new Error('空值应被跳过，得到: ' + css2);
  });

  check('装饰与颜色能同时产出', () => {
    const css = dir.buildUiStateCss({ colors: { 'color-bubble': '#101020' }, decor: '雪花' });
    if (!css.includes('#101020')) throw new Error('颜色丢失');
    if (!css.includes('auroraSnow')) throw new Error('装饰动画丢失');
  });

  check('未知装饰名不产出 CSS（不报错）', () => {
    const css = dir.buildUiStateCss({ decor: '不存在的装饰' });
    if (css !== '') throw new Error('未知装饰应产出空串，得到: ' + css);
  });

  check('端到端：指令 → 状态 → CSS → 塞进气泡文档后文档仍合法', () => {
    // 完整走一遍：AI 输出 → 解析 → 累积 → 生成 CSS
    let s = dir.emptyUiState();
    const parsed = dir.parseUiDirectives(
      '剧情文本{{ui:color-bubble=#101020}}{{ui:decor=雪花}}{{ui:color-accent=#c8a040}}',
    );
    if (parsed.content.indexOf('剧情文本') === -1) throw new Error('正文丢失');
    if (parsed.content.indexOf('{{ui') !== -1) throw new Error('指令未被剔除');
    s = dir.applyDirectives(s, parsed.directives);

    const uiCss = dir.buildUiStateCss(s);
    if (!uiCss) throw new Error('没有产出 CSS');

    // 用真实的文档构建器把它当作 customCSS 注入，确认文档依然合法
    const doc = bridge.buildUserInterfaceDocument(
      { html: '<div id="aurora-chat-flow"></div>', css: uiCss, js: '' },
      { accentColor: '#ff00ff' },
      { messages: [] },
      { bare: true },
    );
    if (doc.indexOf('auroraSnow') === -1) throw new Error('装饰 CSS 没进文档');
    if (doc.indexOf('#101020') === -1) throw new Error('颜色 CSS 没进文档');
    const scripts = [...doc.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)];
    scripts.forEach((m, i) => new vm.Script(m[1], { filename: `e2e-${i}.js` }));
  });

  check('端到端：clear 之后 CSS 归零', () => {
    let s = dir.applyDirectives(dir.emptyUiState(), [
      { key: 'color-bubble', value: '#101020' },
      { key: 'decor', value: '雪花' },
    ]);
    if (!dir.buildUiStateCss(s)) throw new Error('前置条件失败');
    s = dir.applyDirectives(s, [{ key: 'clear', value: '' }]);
    if (dir.buildUiStateCss(s) !== '') throw new Error('clear 后仍有 CSS 残留');
  });
}

console.log('');
if (failures === 0) {
  console.log('全部通过：桥运行时与文档语法正确、API 齐全、渲染器可执行、默认模板可用。');
} else {
  console.log(`失败 ${failures} 项。`);
  process.exit(1);
}
