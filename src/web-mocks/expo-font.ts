/**
 * 网页 / 电脑版的 expo-font 替身。
 *
 * ⚠️ 之前这里是空实现（`loadAsync` 什么都不做），于是 `@expo/vector-icons`
 * 的图标字体在网页里**从来没有被注册**，界面上所有图标都渲染成 □（豆腐块）。
 *
 * 现在真的把字体注入 `@font-face` 并等它加载完：
 *  · fonts 的 value 可能是 webpack/metro 给的 url 字符串，也可能是资源 module id（数字）
 *  · 都统一解析成 url 再交给 FontFace
 */

const resolveFontUrl = (src: any): string | null => {
  if (!src) return null;
  if (typeof src === 'string') {
    // 有时形如 "url(...)"
    const m = src.match(/url\((['"]?)(.*?)\1\)/);
    return m ? m[2] : src;
  }
  // 资源 module id：从 AssetRegistry 里查
  try {
    const reg: any = require('react-native/Libraries/Image/AssetRegistry');
    const asset = reg?.getAssetByID ? reg.getAssetByID(src) : null;
    if (asset) {
      if (asset.uri) return asset.uri;
      if (asset.httpServerLocation && asset.name) {
        return `${asset.httpServerLocation}/${asset.name}.${asset.type || 'ttf'}`;
      }
    }
  } catch {
    /* 忽略 */
  }
  if (typeof src === 'object' && (src as any).uri) return String((src as any).uri);
  return null;
};

export const loadAsync = async (fonts: Record<string, any> = {}): Promise<void> => {
  if (typeof document === 'undefined') return;
  console.log('[webfont] loadAsync 被调用，字体数:', Object.keys(fonts || {}).length, Object.keys(fonts || {}));
  const anyDoc = document as any;
  const tasks: Promise<any>[] = [];

  for (const [family, srcRaw] of Object.entries(fonts || {})) {
    const url = resolveFontUrl(srcRaw);
    if (!url) continue;
    // 已注册过就跳过
    try {
      if (anyDoc.fonts && anyDoc.fonts.check && anyDoc.fonts.check(`12px "${family}"`)) continue;
    } catch {
      /* 忽略 */
    }
    if (typeof (globalThis as any).FontFace === 'undefined') break;
    try {
      const face = new (globalThis as any).FontFace(family, `url(${url})`);
      tasks.push(
        face
          .load()
          .then((f: any) => {
            anyDoc.fonts.add(f);
          })
          .catch(() => {
            /* 单个字体失败不影响其它 */
          }),
      );
    } catch {
      /* 忽略 */
    }
  }

  if (tasks.length) await Promise.all(tasks);
};

const loadedFamilies = new Set<string>();

export const isLoaded = (family?: string): boolean => {
  if (!family) return true;
  if (loadedFamilies.has(family)) return true;
  try {
    return !!(document as any)?.fonts?.check?.(`12px "${family}"`);
  } catch {
    return true;
  }
};

export const useFonts = (fonts: any): [boolean, Error | null] => {
  // 简化实现：不做 React hook 依赖（图标组件自己会 await loadAsync），
  // 直接返回「已就绪」，避免把调用方卡在未加载状态。
  void loadAsync(fonts);
  if (fonts && typeof fonts === 'object') {
    for (const k of Object.keys(fonts)) loadedFamilies.add(k);
  }
  return [true, null];
};

export const getLoadedFonts = () => Array.from(loadedFamilies);
export const unloadAsync = async (family?: string) => {
  if (family) loadedFamilies.delete(family);
};

export default { loadAsync, isLoaded, useFonts, getLoadedFonts, unloadAsync };
