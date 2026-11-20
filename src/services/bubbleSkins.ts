// 聊天气泡皮肤系统 —— 基于 9-patch 切片拉伸原理
// 原理：将气泡切成九宫格 —— 四角固定不拉伸，四边单向拉伸，中心双向拉伸
// 实现方式：React Native 中通过 borderRadius 模拟四角固定
// 数据驱动：所有视觉属性存为配置对象，客户端解析后本地绘制，无需传输字体文件或图片资源

export interface BubbleFontConfig {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  lineHeight?: number;
  letterSpacing?: number;
}

export interface BubbleNinePatch {
  backgroundColor: string;
  backgroundImage?: string;
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  marginTop?: number;
  marginBottom?: number;
  // 四角圆角（9-patch 四角固定区）
  cornerRadiusTL: number;
  cornerRadiusTR: number;
  cornerRadiusBL: number;
  cornerRadiusBR: number;
  // 边框
  borderWidth: number;
  borderColor: string;
  // 阴影
  shadow: {
    enabled: boolean;
    offsetX: number;
    offsetY: number;
    opacity: number;
    radius: number;
    color?: string;
  };
}

export interface BubbleSkinConfig {
  id: string;
  name: string;
  description?: string;
  user: BubbleNinePatch;
  ai: BubbleNinePatch;
  font: BubbleFontConfig;
  avatarFrame: {
    enabled: boolean;
    borderWidth: number;
    borderColor: string;
    shape: 'circle' | 'rounded' | 'square';
    borderRadius?: number;
    shadowEnabled?: boolean;
    shadowColor?: string;
  };
}

// --- 预设皮肤 ---

export const defaultBubbleSkin: BubbleSkinConfig = {
  id: 'default',
  name: '默认',
  description: '简洁纯色气泡，沉浸阅读',
  user: {
    backgroundColor: '',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    shadow: { enabled: false, offsetX: 0, offsetY: 0, opacity: 0, radius: 0 },
  },
  ai: {
    backgroundColor: '',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    shadow: { enabled: false, offsetX: 0, offsetY: 0, opacity: 0, radius: 0 },
  },
  font: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  avatarFrame: {
    enabled: false,
    borderWidth: 0,
    borderColor: 'transparent',
    shape: 'circle',
  },
};

export const freshGreenSkin: BubbleSkinConfig = {
  id: 'fresh_green',
  name: '清新绿',
  description: '绿色系气泡，清新自然',
  user: {
    backgroundColor: '#95EC69',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    shadow: { enabled: false, offsetX: 0, offsetY: 0, opacity: 0, radius: 0 },
  },
  ai: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    shadow: { enabled: true, offsetX: 0, offsetY: 1, opacity: 0.06, radius: 2, color: '#000000' },
  },
  font: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  avatarFrame: {
    enabled: true,
    borderWidth: 2,
    borderColor: '#95EC69',
    shape: 'circle',
  },
};

export const bubbleTransparentSkin: BubbleSkinConfig = {
  id: 'transparent',
  name: '透明',
  description: '完全透明背景，极简风格',
  user: {
    backgroundColor: 'transparent',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 1,
    borderColor: '#99999940',
    shadow: { enabled: false, offsetX: 0, offsetY: 0, opacity: 0, radius: 0 },
  },
  ai: {
    backgroundColor: 'transparent',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 1,
    borderColor: '#99999940',
    shadow: { enabled: false, offsetX: 0, offsetY: 0, opacity: 0, radius: 0 },
  },
  font: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  avatarFrame: {
    enabled: false,
    borderWidth: 0,
    borderColor: 'transparent',
    shape: 'circle',
  },
};

export const warmCherrySkin: BubbleSkinConfig = {
  id: 'warm_cherry',
  name: '暖樱粉',
  description: '暖调樱花粉，温柔少女系',
  user: {
    backgroundColor: '#ffd6e7',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    shadow: { enabled: true, offsetX: 0, offsetY: 2, opacity: 0.08, radius: 4, color: '#ffb3cc' },
  },
  ai: {
    backgroundColor: '#fff5f6',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 1,
    borderColor: '#ffd6e7',
    shadow: { enabled: true, offsetX: 0, offsetY: 2, opacity: 0.08, radius: 4, color: '#000000' },
  },
  font: {
    fontFamily: undefined,
    fontSize: 15,
    color: '#5a2a3c',
    fontWeight: '400',
    lineHeight: 22,
  },
  avatarFrame: {
    enabled: true,
    borderWidth: 2,
    borderColor: '#ff8fb1',
    shape: 'circle',
    shadowEnabled: true,
    shadowColor: '#ff8fb1',
  },
};

export const deepOceanSkin: BubbleSkinConfig = {
  id: 'deep_ocean',
  name: '深海蓝',
  description: '沉稳深海蓝，深邃商务风',
  user: {
    backgroundColor: '#3a7bd5',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    shadow: { enabled: true, offsetX: 0, offsetY: 2, opacity: 0.12, radius: 4, color: '#2a5ea8' },
  },
  ai: {
    backgroundColor: '#eef4ff',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    cornerRadiusTL: 18,
    cornerRadiusTR: 18,
    cornerRadiusBL: 18,
    cornerRadiusBR: 18,
    borderWidth: 1,
    borderColor: '#c3d7ff',
    shadow: { enabled: true, offsetX: 0, offsetY: 2, opacity: 0.08, radius: 4, color: '#000000' },
  },
  font: {
    fontFamily: undefined,
    fontSize: 15,
    color: '#1a2a4a',
    fontWeight: '400',
    lineHeight: 22,
  },
  avatarFrame: {
    enabled: true,
    borderWidth: 2,
    borderColor: '#3a7bd5',
    shape: 'rounded',
    borderRadius: 10,
    shadowEnabled: true,
    shadowColor: '#3a7bd5',
  },
};

export const bubbleSkinsList: BubbleSkinConfig[] = [
  defaultBubbleSkin,
  freshGreenSkin,
  bubbleTransparentSkin,
  warmCherrySkin,
  deepOceanSkin,
];

export function getSkinById(id: string): BubbleSkinConfig {
  // 向后兼容：旧版 'classic' 映射到 'default'，'qq' 和 'classic_tail' 映射到 'default'
  const compatId = id === 'classic' || id === 'qq' || id === 'classic_tail' ? 'default' : id;
  return bubbleSkinsList.find((s) => s.id === compatId) || defaultBubbleSkin;
}

export function applyFontConfig(style: any, font: BubbleFontConfig, theme: any) {
  const result: any = { ...style };
  if (font.fontFamily) result.fontFamily = font.fontFamily;
  if (font.fontSize) result.fontSize = font.fontSize;
  else if (theme.fontSize) result.fontSize = theme.fontSize;
  if (font.color) result.color = font.color;
  else if (theme.fontColor) result.color = theme.fontColor;
  if (font.fontWeight) result.fontWeight = font.fontWeight;
  if (font.lineHeight) result.lineHeight = font.lineHeight;
  if (font.letterSpacing) result.letterSpacing = font.letterSpacing;
  return result;
}

export function resolveBubbleColor(skinColor: string | undefined, themeColor: string): string {
  if (!skinColor || skinColor === 'transparent') return themeColor;
  return skinColor;
}

export function bubbleBodyStyle(np: BubbleNinePatch, isUser: boolean): any {
  const bgColor = resolveBubbleColor(np.backgroundColor, isUser ? '' : '');
  return {
    backgroundColor: bgColor,
    paddingTop: np.paddingTop,
    paddingBottom: np.paddingBottom,
    paddingLeft: np.paddingLeft,
    paddingRight: np.paddingRight,
    borderTopLeftRadius: np.cornerRadiusTL,
    borderTopRightRadius: np.cornerRadiusTR,
    borderBottomLeftRadius: np.cornerRadiusBL,
    borderBottomRightRadius: np.cornerRadiusBR,
    borderWidth: np.borderWidth,
    borderColor: np.borderColor,
    ...(np.marginTop !== undefined && { marginTop: np.marginTop }),
    ...(np.marginBottom !== undefined && { marginBottom: np.marginBottom }),
    ...(np.shadow.enabled && {
      shadowColor: np.shadow.color || '#000',
      shadowOffset: { width: np.shadow.offsetX, height: np.shadow.offsetY },
      shadowOpacity: np.shadow.opacity,
      shadowRadius: np.shadow.radius,
      elevation: 2,
    }),
  };
}
