/**
 * AI 界面指令（UI Directives）
 *
 * 目的：让 AI 只用「文字」就能操控界面 —— 换色、加装饰、切背景、发图片。
 * 这是 MMD 那套「AI 输出触发词 → 界面变化」在本 App 的对应物，但不需要正则。
 *
 * 语法（两种都支持，写在 AI 回复任意位置）：
 *
 *   {{ui:bg=背景图}}            切背景（素材库名字 / 颜色 / 图片地址）
 *   {{ui:bgm=视频名}}           切背景视频
 *   {{ui:img=插图A}}            往这条回复里塞图片（可直接用素材库名字）
 *   {{ui:color-accent=#ff0066}} 改强调色（主题色随之变化）
 *   {{ui:color-bubble=#101020}} 改 AI 气泡背景色
 *   {{ui:color-user=#002fa7}}   改用户气泡背景色
 *   {{ui:decor=雪花}}           加装饰层（内置几种，见 DECORATIONS）
 *   {{ui:theme=暗黑金}}         套一个预设配色
 *   {{ui:clear}}                清除本条对话的所有界面指令效果
 *
 * 也支持方括号写法：`[UI:bg=背景图]`，方便 AI 少打两个花括号。
 *
 * 处理流程：AI 回复 → parseUiDirectives 解析 → 指令从正文里剔除（用户看不到）
 *          → 通过回调应用到 App（背景/主题/气泡色/装饰/图片）。
 */

/** 内置装饰层。每个装饰是一段纯 CSS（用伪元素/动画做，不依赖外部图片）。 */
export const DECORATIONS: Record<string, { name: string; css: string }> = {
  无: { name: '无', css: '' },
  雪花: {
    name: '雪花',
    css: `
      .aurora-decor-layer::before {
        content: '❄ ❅ ❆ ❄ ❅';
        position: absolute; inset: 0;
        font-size: 22px; letter-spacing: 28px; line-height: 90px;
        color: rgba(255,255,255,0.35);
        pointer-events: none;
        animation: auroraSnow 14s linear infinite;
      }
      @keyframes auroraSnow {
        0% { transform: translateY(-100%); }
        100% { transform: translateY(100%); }
      }`,
  },
  樱花: {
    name: '樱花',
    css: `
      .aurora-decor-layer::before {
        content: '🌸 🌸 🌸 🌸';
        position: absolute; inset: 0;
        font-size: 20px; letter-spacing: 34px; line-height: 110px;
        opacity: 0.45; pointer-events: none;
        animation: auroraPetal 18s linear infinite;
      }
      @keyframes auroraPetal {
        0% { transform: translate(0,-100%) rotate(0deg); }
        100% { transform: translate(-30px,100%) rotate(40deg); }
      }`,
  },
  星光: {
    name: '星光',
    css: `
      .aurora-decor-layer::before {
        content: '✦ ✧ ✦ ✧';
        position: absolute; inset: 0;
        font-size: 18px; letter-spacing: 40px; line-height: 120px;
        color: rgba(255, 226, 130, 0.5);
        pointer-events: none;
        animation: auroraTwinkle 3s ease-in-out infinite alternate;
      }
      @keyframes auroraTwinkle { 0% { opacity: 0.25; } 100% { opacity: 0.85; } }`,
  },
  扫描线: {
    name: '扫描线',
    css: `
      .aurora-decor-layer::before {
        content: ''; position: absolute; inset: 0; pointer-events: none;
        background: repeating-linear-gradient(
          to bottom,
          rgba(255,255,255,0.05) 0px,
          rgba(255,255,255,0.05) 1px,
          transparent 1px,
          transparent 3px
        );
        animation: auroraScan 8s linear infinite;
      }
      @keyframes auroraScan { 0% { background-position-y: 0; } 100% { background-position-y: 100px; } }`,
  },
  边框: {
    name: '边框',
    css: `
      .aurora-decor-layer::before {
        content: ''; position: absolute; inset: 6px; pointer-events: none;
        border: 2px solid var(--aurora-accent);
        border-radius: 12px;
        opacity: 0.55;
      }`,
  },
};

/** 预设配色主题，供 {{ui:theme=名字}} 使用 */
export const UI_THEMES: Record<string, { name: string; colors: Record<string, string> }> = {
  默认: { name: '默认', colors: {} },
  暗黑金: {
    name: '暗黑金',
    colors: {
      'color-bg': '#14161c',
      'color-bubble': 'rgba(26,30,38,0.92)',
      'color-text': '#e0d8c8',
      'color-accent': '#c8a040',
      'color-border': 'rgba(200,160,64,0.35)',
    },
  },
  克莱因蓝: {
    name: '克莱因蓝',
    colors: {
      'color-bg': '#0a0f1d',
      'color-bubble': 'rgba(13,20,38,0.92)',
      'color-text': '#f3f4f6',
      'color-accent': '#002fa7',
      'color-border': 'rgba(0,47,167,0.45)',
    },
  },
  极光紫: {
    name: '极光紫',
    colors: {
      'color-bg': '#0d0b1a',
      'color-bubble': 'rgba(24,18,44,0.92)',
      'color-text': '#efe9ff',
      'color-accent': '#8a2be2',
      'color-border': 'rgba(138,43,226,0.45)',
    },
  },
  樱花粉: {
    name: '樱花粉',
    colors: {
      'color-bg': '#fff5f7',
      'color-bubble': 'rgba(255,228,236,0.95)',
      'color-text': '#3a2b30',
      'color-accent': '#ff6b9d',
      'color-border': 'rgba(255,107,157,0.4)',
    },
  },
};

/** 指令里允许的键 */
export const UI_DIRECTIVE_KEYS = [
  'bg',
  'bgm',
  'img',
  'decor',
  'theme',
  'color-bg',
  'color-bubble',
  'color-user',
  'color-text',
  'color-accent',
  'color-border',
  'clear',
] as const;

export type UiDirectiveKey = (typeof UI_DIRECTIVE_KEYS)[number];

export interface UiDirective {
  key: UiDirectiveKey;
  value: string;
}

export interface ParsedUiDirectives {
  /** 已剔除指令后的正文 */
  content: string;
  directives: UiDirective[];
}

const KEY_ALIASES: Record<string, UiDirectiveKey> = {
  bg: 'bg',
  background: 'bg',
  背景: 'bg',
  bgm: 'bgm',
  video: 'bgm',
  视频: 'bgm',
  img: 'img',
  image: 'img',
  图: 'img',
  图片: 'img',
  decor: 'decor',
  decoration: 'decor',
  装饰: 'decor',
  theme: 'theme',
  主题: 'theme',
  'color-bg': 'color-bg',
  底色: 'color-bg',
  'color-bubble': 'color-bubble',
  气泡: 'color-bubble',
  'color-user': 'color-user',
  用户气泡: 'color-user',
  'color-text': 'color-text',
  文字: 'color-text',
  'color-accent': 'color-accent',
  accent: 'color-accent',
  强调色: 'color-accent',
  'color-border': 'color-border',
  边框: 'color-border',
  clear: 'clear',
  清除: 'clear',
};

const normalizeKey = (raw: string): UiDirectiveKey | null => {
  const k = String(raw || '').trim().toLowerCase();
  if (!k) return null;
  if (KEY_ALIASES[k]) return KEY_ALIASES[k];
  if ((UI_DIRECTIVE_KEYS as readonly string[]).includes(k)) return k as UiDirectiveKey;
  return null;
};

/**
 * 解析并剔除界面指令。
 *
 * 支持：
 *   {{ui:key=value}}
 *   {{ui:key:value}}
 *   [UI:key=value]
 *   [ui:key=value]
 */
export const parseUiDirectives = (text: string): ParsedUiDirectives => {
  const directives: UiDirective[] = [];
  if (!text || typeof text !== 'string') return { content: text || '', directives };

  const pushDirective = (rawKey: string, rawValue: string) => {
    const key = normalizeKey(rawKey);
    if (!key) return false;
    const value = String(rawValue == null ? '' : rawValue).trim();
    if (key !== 'clear' && !value) return false;
    directives.push({ key, value });
    return true;
  };

  // {{ui:...}} —— 花括号写法
  let content = text.replace(/\{\{\s*ui\s*[:：]\s*([^}]+?)\s*\}\}/gi, (whole, body: string) => {
    const m = String(body).match(/^([^=:：]+)\s*[=:：]\s*([\s\S]*)$/);
    if (!m) {
      // 允许 {{ui:clear}} 这种无值写法
      return pushDirective(String(body).trim(), '') ? '' : whole;
    }
    return pushDirective(m[1], m[2]) ? '' : whole;
  });

  // [UI:...] —— 方括号写法
  content = content.replace(/\[\s*(?:ui|UI)\s*[:：]\s*([^\[\]]+?)\s*\]/g, (whole, body: string) => {
    const m = String(body).match(/^([^=:：]+)\s*[=:：]\s*([\s\S]*)$/);
    if (!m) return pushDirective(String(body).trim(), '') ? '' : whole;
    return pushDirective(m[1], m[2]) ? '' : whole;
  });

  return { content: content.replace(/\n{3,}/g, '\n\n').trim(), directives };
};

/**
 * 抽出正文里的 {{ui:img=名字}}，同时返回：
 *  · content —— 去掉所有指令后的干净正文（编辑界面看到的就是这个）
 *  · images  —— 每张图的名字，以及它应该插入到干净正文的第几个字符处
 *
 * 这样表情会显示在「指令原本写的位置」，而不是统统一堆到气泡下面。
 */
export const extractInlineImages = (
  text: string,
): { content: string; images: Array<{ name: string; at: number }> } => {
  const images: Array<{ name: string; at: number }> = [];
  if (!text || typeof text !== 'string') return { content: text || '', images };

  let out = '';
  let i = 0;
  const re = /\{\{\s*ui\s*[:：]\s*([^}]+?)\s*\}\}|\[\s*ui\s*[:：]\s*([^\[\]]+?)\s*\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out += text.slice(i, m.index);
    i = m.index + m[0].length;
    const body = String(m[1] ?? m[2] ?? '').trim();
    const kv = body.match(/^([^=:：]+)\s*[=:：]\s*([\s\S]*)$/);
    const val = kv ? kv[2].trim() : '';
    if (kv && normalizeKey(kv[1]) === 'img' && val) {
      images.push({ name: val, at: out.length });
    }
    // 非 img 指令：这里直接丢弃（视觉状态由 parseUiDirectives 负责）
  }
  out += text.slice(i);
  return { content: out.replace(/\n{3,}/g, '\n\n').trim(), images };
};

/** 把指令列表归并成界面状态（后者覆盖前者） */export interface UiState {
  bg?: string;
  bgm?: string;
  images: string[];
  decor?: string;
  theme?: string;
  colors: Record<string, string>;
}

export const emptyUiState = (): UiState => ({ images: [], colors: {} });

/** 应用一条指令到状态 */
export const applyDirective = (state: UiState, d: UiDirective): UiState => {
  switch (d.key) {
    case 'clear':
      return emptyUiState();
    case 'bg':
      return { ...state, bg: d.value };
    case 'bgm':
      return { ...state, bgm: d.value };
    case 'img':
      return { ...state, images: state.images.includes(d.value) ? state.images : [...state.images, d.value] };
    case 'decor':
      return { ...state, decor: d.value };
    case 'theme': {
      const preset = UI_THEMES[d.value];
      return { ...state, theme: d.value, colors: preset ? { ...state.colors, ...preset.colors } : state.colors };
    }
    default:
      if (d.key.startsWith('color-')) {
        return { ...state, colors: { ...state.colors, [d.key]: d.value } };
      }
      return state;
  }
};

/** 依次应用多条指令 */
export const applyDirectives = (state: UiState, list: UiDirective[]): UiState =>
  list.reduce((acc, d) => applyDirective(acc, d), state);

/**
 * 只读取指令、不改动正文。用于需要「正文已经处理过、但还要拿指令」的场景。
 */
export const extractUiDirectives = (text: string): UiDirective[] => parseUiDirectives(text).directives;

/**
 * 预设「触发词 → 界面指令」正则。
 *
 * 为什么要这个：让 AI 输出 {{ui:...}} 依赖模型配合，弱模型可能完全不照格式写。
 * 这套预设让用户只写一个好打的触发词（如 【夜】），由正则替换成对应指令 ——
 * 不看模型脸色，稳定生效。
 *
 * 用法：在对话设置的「正则规则」里一键导入（或手动复制），scope 设为「输出」。
 */
export const buildDirectiveRegexPresets = (): Array<{
  name: string;
  pattern: string;
  replacement: string;
  scope: 'output';
}> => [
  { name: '界面·夜间', pattern: '【夜】', replacement: '{{ui:theme=暗黑金}}', scope: 'output' },
  { name: '界面·白昼', pattern: '【昼】', replacement: '{{ui:theme=樱花粉}}', scope: 'output' },
  { name: '界面·克莱因蓝', pattern: '【蓝】', replacement: '{{ui:theme=克莱因蓝}}', scope: 'output' },
  { name: '界面·极光紫', pattern: '【紫】', replacement: '{{ui:theme=极光紫}}', scope: 'output' },
  { name: '装饰·雪花', pattern: '【雪】', replacement: '{{ui:decor=雪花}}', scope: 'output' },
  { name: '装饰·樱花', pattern: '【樱】', replacement: '{{ui:decor=樱花}}', scope: 'output' },
  { name: '装饰·星光', pattern: '【星】', replacement: '{{ui:decor=星光}}', scope: 'output' },
  { name: '装饰·扫描线', pattern: '【扫描】', replacement: '{{ui:decor=扫描线}}', scope: 'output' },
  { name: '装饰·边框', pattern: '【框】', replacement: '{{ui:decor=边框}}', scope: 'output' },
  { name: '界面·清除', pattern: '【还原】', replacement: '{{ui:clear}}', scope: 'output' },
  {
    name: '界面·强调色',
    pattern: '\\{\\{色:([^}]+)\\}\\}',
    replacement: '{{ui:color-accent=$1}}',
    scope: 'output',
  },
  {
    name: '界面·气泡色',
    pattern: '\\{\\{泡:([^}]+)\\}\\}',
    replacement: '{{ui:color-bubble=$1}}',
    scope: 'output',
  },
  {
    name: '界面·背景',
    pattern: '\\{\\{景:([^}]+)\\}\\}',
    replacement: '{{ui:bg=$1}}',
    scope: 'output',
  },
  {
    name: '界面·插图',
    pattern: '\\{\\{图:([^}]+)\\}\\}',
    replacement: '{{ui:img=$1}}',
    scope: 'output',
  },
];

/**
 * 把界面状态翻译成注入消息渲染区的 CSS。
 *
 * 为什么放在这里而不是留在 ChatScreen：这段转换原本内联在 5000 行的 ChatScreen 里，
 * 没法单独测；而它正是「{{ui:color-bubble=...}} 到底改没改到东西」的关键一步。
 * 抽出来后可测，也让 ChatScreen 少一块。
 *
 * 选择器说明：气泡里的 Markdown 渲染是独立 WebView，类名用 .aurora-msg / .aurora-bubble；
 * 同时保留 .message-bubble-* 以兼容旧样式。
 */
export const buildUiStateCss = (state: {
  colors?: Record<string, string>;
  decor?: string;
}): string => {
  const colors = state.colors || {};
  const colorRules = Object.entries(colors)
    .filter(([, v]) => !!v)
    .map(([k, v]) => {
      switch (k) {
        case 'color-bubble':
          return `.aurora-msg .aurora-bubble, .message-bubble-ai { background: ${v} !important; }`;
        case 'color-user':
          return `.aurora-msg.user .aurora-bubble, .message-bubble-user { background: ${v} !important; }`;
        case 'color-text':
          return `body, .aurora-bubble { color: ${v} !important; }`;
        case 'color-accent':
          return `a, strong { color: ${v} !important; }`;
        case 'color-border':
          return `.aurora-msg .aurora-bubble { border: 1px solid ${v} !important; }`;
        case 'color-bg':
          return `body { background: ${v} !important; }`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n');

  const decorRule = state.decor ? DECORATIONS[state.decor]?.css || '' : '';

  return [colorRules, decorRule].filter(Boolean).join('\n');
};

/**
 * 给 AI 的指令说明（可注入系统提示，让 AI 知道能用哪些指令）。
 * 只在用户开启了「允许 AI 操控界面」时才建议注入。
 */
export const buildUiDirectivePrompt = (): string => {
  const decorNames = Object.keys(DECORATIONS).join('、');
  const themeNames = Object.keys(UI_THEMES).join('、');
  return [
    '【界面指令】你可以在回复中插入下列指令来改变界面外观，指令本身不会显示给用户：',
    '{{ui:bg=背景名}} 切换对话背景（背景名来自素材库，也可以直接写 #颜色 或图片网址）',
    '{{ui:bgm=视频名}} 切换背景视频（默认静音）',
    '{{ui:img=图片名}} 在本次回复中显示一张图片（图片名来自素材库）',
    `{{ui:decor=装饰名}} 叠加装饰效果，可选：${decorNames}`,
    `{{ui:theme=主题名}} 套用整套配色，可选：${themeNames}`,
    '改颜色的指令（值写 #rrggbb 或 rgba(...)）：',
    '  {{ui:color-accent=#ff0066}} 强调色（链接/加粗）',
    '  {{ui:color-bubble=#101020}} AI 气泡底色',
    '  {{ui:color-user=#002fa7}} 用户气泡底色',
    '  {{ui:color-text=#e0d8c8}} 正文文字色',
    '  {{ui:color-bg=#14161c}} 消息区底色',
    '  {{ui:color-border=rgba(200,160,64,0.35)}} 气泡描边',
    '{{ui:clear}} 清除以上所有效果',
    '按剧情需要自然使用，不要每句都用。',
  ].join('\n');
};
