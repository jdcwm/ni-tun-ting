import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

export const imageUtils = {
  async pickImageFromGallery(): Promise<string | null> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error('选择图片失败:', error);
      return null;
    }
  },

  /** 封面选择：系统自由裁剪，不压画质 */
  async pickCoverFromGallery(): Promise<string | null> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled && result.assets.length > 0) {
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error('选择封面失败:', error);
      return null;
    }
  },

  /** 头像选择：强制正方形裁剪（1:1），保证裁剪 UI 实际生效。 */
  async pickAvatarFromGallery(): Promise<string | null> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1] as [number, number],
        quality: 0.85,
      });

      if (!result.canceled && result.assets.length > 0) {
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error('选择头像失败:', error);
      return null;
    }
  },

  /** 选择任意图片/动图（PNG/JPG/GIF/WebP 等），不裁剪，不压缩。 */
  async pickAnyMediaFromGallery(): Promise<string | null> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0,
      });
      if (!result.canceled && result.assets.length > 0) {
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error('选择媒体失败:', error);
      return null;
    }
  },

  /** 保存任意媒体（尽量保留原扩展名），用于按钮自定义图/GIF */
  async saveMediaToAppDir(uri: string, folder: string = 'media'): Promise<string> {
    try {
      const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const dir = `${documentDir}${folder}`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      let ext = (uri.split('?')[0].split('.').pop() || '').toLowerCase();
      if (!ext || ext.length > 6 || !/^[a-z0-9]+$/.test(ext)) ext = 'img';
      if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'img'].includes(ext)) ext = 'img';

      const fileName = `m_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
      const newUri = `${dir}/${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: newUri });
      return newUri;
    } catch (error) {
      console.error('保存媒体失败:', error);
      return uri;
    }
  },

  async takePhoto(): Promise<string | null> {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        alert('需要相机权限');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error('拍照失败:', error);
      return null;
    }
  },

  async pickMultipleImages(maxCount: number = 9): Promise<string[]> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: maxCount,
        quality: 0.8,
      });

      if (!result.canceled) {
        return result.assets.map((asset) => asset.uri);
      }
      return [];
    } catch (error) {
      console.error('选择多张图片失败:', error);
      return [];
    }
  },

  async saveImageToAppDir(uri: string, folder: string = 'images'): Promise<string> {
    try {
      const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const dir = `${documentDir}${folder}`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      const fileName = `img_${Date.now()}.jpg`;
      const newUri = `${dir}/${fileName}`;
      await FileSystem.copyAsync({ from: uri, to: newUri });
      return newUri;
    } catch (error) {
      console.error('保存图片失败:', error);
      return uri;
    }
  },

  async getImageBase64(uri: string): Promise<string | null> {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      return base64;
    } catch (error) {
      console.error('图片转base64失败:', error);
      return null;
    }
  },

  async deleteImage(uri: string): Promise<void> {
    try {
      if (uri.startsWith('file://')) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (error) {
      console.error('删除图片失败:', error);
    }
  },
};

/** 图片打包 bundle：单个资源条目 */
export type AssetBundleItem = {
  id: string;
  origin: string;
  fieldPath: string;   // 例如 'character.avatar' 'entries[3].image'
  mime?: string;
  data?: string;       // base64 dataURL，仅 pack 时可能赋值
};

/** 简易字符串 hash，用于生成资源 id（无需引入 crypto） */
function md5Hash(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + (s.length % 9973).toString(36);
}

function inferMime(url = ''): string {
  const u = url.toLowerCase().split('?')[0];
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.gif')) return 'image/gif';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

function extFromMime(m: string): string {
  if (m.includes('png')) return 'png';
  if (m.includes('gif')) return 'gif';
  if (m.includes('webp')) return 'webp';
  if (m.includes('svg')) return 'svg';
  return 'jpg';
}

/** 辅助：从 uri 读取 base64 dataURL。Native 优先，Web 兜底。 */
async function readAsDataURL(uri: string): Promise<string> {
  try {
    // native：expo-file-system readAsStringAsync base64
    const path = uri.startsWith('file://') ? uri : (uri.startsWith('/') ? 'file://' + uri : uri);
    const EncodingType = (FileSystem as any).EncodingType;
    const b64 = await FileSystem.readAsStringAsync(path as any, {
      encoding: EncodingType?.Base64 ?? 'base64',
    } as any);
    const mime = inferMime(uri);
    return `data:${mime};base64,${b64}`;
  } catch (nativeErr) {
    // fallback: fetch + Blob + FileReader（web）
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onloadend = () => resolve(String(fr.result));
      fr.readAsDataURL(blob);
    });
  }
}

/** 写 dataURL 到 app 目录，返回本地 file:// uri。复用 saveImageToAppDir 逻辑。 */
async function saveDataURLToAppDir(
  dataURL: string,
  subDir: string,
  filename: string
): Promise<string> {
  try {
    const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const dirUri = `${documentDir}${subDir}/`;
    const dirInfo = await FileSystem.getInfoAsync(dirUri as any);
    if (!dirInfo.exists) {
      try {
        await FileSystem.makeDirectoryAsync(dirUri as any, { intermediates: true });
      } catch (_e) { /* exists */ }
    }
    const targetUri = `${dirUri}${filename}`;
    const comma = dataURL.indexOf(',');
    const b64 = comma >= 0 ? dataURL.slice(comma + 1) : dataURL;
    const EncodingType = (FileSystem as any).EncodingType;
    await FileSystem.writeAsStringAsync(targetUri as any, b64, {
      encoding: EncodingType?.Base64 ?? 'base64',
    } as any);
    return targetUri;
  } catch (e) {
    // fallback（web / unsupported）：不报错
    return dataURL;
  }
}

/** CSS url('xxx') 扫描正则 */
const CSS_URL_RE = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g;

/** 扫描 + base64 bundle。
 *  只扫描字段名匹配 avatar / background / coverImage / cover / image / images / imageSrc / expressions / emojiMap 的值；
 *  对包含 url(...) 的字符串（CSS 常见）也会尝试抽出 url 打包，替换回 asset://id 形式。
 */
export async function packAssets(
  root: any,
  label = 'resource'
): Promise<{ plain: any; assets: AssetBundleItem[] }> {
  const assets: AssetBundleItem[] = [];
  const IMG_KEY_RE =
    /(avatar|background|cover.?image|cover|image|images|image.?src|expressions|emojiMap)/i;
  const URL_RE = /^(https?:\/\/|file:\/\/|\/|content:\/\/|assets-library:\/\/)/;

  const readOne = async (url: string, path: string): Promise<string> => {
    const id = `img_${md5Hash(url)}`;
    if (assets.find((a) => a.id === id)) return `asset://${id}`;
    try {
      const data = await readAsDataURL(url);
      assets.push({ id, origin: url, fieldPath: path, mime: inferMime(url), data });
      return `asset://${id}`;
    } catch (e) {
      return url;
    }
  };

  const visit = async (node: any, path: string): Promise<any> => {
    if (node == null) return node;
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) {
      return Promise.all(node.map((it, i) => visit(it, `${path}[${i}]`)));
    }
    if (typeof node !== 'object') return node;
    const copy: any = {};
    for (const k of Object.keys(node)) {
      const cur = node[k];
      const curPath = path ? `${path}.${k}` : k;
      if (IMG_KEY_RE.test(k)) {
        copy[k] = await processImgValue(cur, curPath);
      } else {
        if (typeof cur === 'string' && cur.indexOf('url(') >= 0) {
          copy[k] = await replaceCssUrls(cur, curPath);
        } else {
          copy[k] = await visit(cur, curPath);
        }
      }
    }
    return copy;
  };

  const processImgValue = async (v: any, path: string): Promise<any> => {
    if (v == null) return v;
    if (typeof v === 'string') {
      if (!URL_RE.test(v)) {
        if (v.indexOf('url(') >= 0) return replaceCssUrls(v, path);
        return v;
      }
      return readOne(v, path);
    }
    if (Array.isArray(v)) {
      return Promise.all(v.map((item, i) => processImgValue(item, `${path}[${i}]`)));
    }
    if (typeof v === 'object') {
      const out: any = {};
      for (const ek of Object.keys(v)) {
        out[ek] = await processImgValue(v[ek], `${path}.${ek}`);
      }
      return out;
    }
    return v;
  };

  const replaceCssUrls = async (css: string, path: string): Promise<string> => {
    const matches: Array<{ u: string; idx: number }> = [];
    CSS_URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CSS_URL_RE.exec(css)) !== null) {
      const u = m[2].trim();
      if (u) matches.push({ u, idx: matches.length });
    }
    if (matches.length === 0) return css;
    const map: Record<string, string> = {};
    for (const mm of matches) {
      if (!URL_RE.test(mm.u)) {
        map[mm.u] = mm.u;
        continue;
      }
      map[mm.u] = await readOne(mm.u, `${path}.url_${mm.idx}`);
    }
    CSS_URL_RE.lastIndex = 0;
    return css.replace(CSS_URL_RE, (_all, q, u) => {
      const r = map[u];
      return r ? `url(${q || ''}${r}${q || ''})` : _all;
    });
  };

  const plain = await visit(root, label);
  return { plain, assets };
}

/** 解包：把 JSON 里 asset://xxx 替换成本地存储 uri */
export async function unpackAssets(
  plain: any,
  assets: AssetBundleItem[] | undefined,
  subDir = 'resourceImages'
): Promise<{ data: any; map: Record<string, string> }> {
  const map: Record<string, string> = {};
  if (Array.isArray(assets)) {
    for (const a of assets) {
      if (a?.data) {
        try {
          const localUri = await saveDataURLToAppDir(
            a.data,
            subDir,
            `${a.id}.${extFromMime(a.mime || inferMime(a.origin))}`
          );
          map[`asset://${a.id}`] = localUri;
        } catch (e) { /* ignore */ }
      }
    }
  }
  const rewrite = (node: any): any => {
    if (node == null) return node;
    if (typeof node === 'string') {
      if (node.indexOf('asset://') >= 0) {
        return node.replace(/asset:\/\/[A-Za-z0-9_]+/g, (m) => map[m] ?? m);
      }
      return node;
    }
    if (Array.isArray(node)) return node.map(rewrite);
    if (typeof node !== 'object') return node;
    const out: any = {};
    for (const k of Object.keys(node)) out[k] = rewrite(node[k]);
    return out;
  };
  return { data: rewrite(plain), map };
}

/** 便利封装：对 Character 打包/解包，用于导出导入携带头像/背景图 */
export async function packCharacter(character: any) {
  return packAssets(character, 'character');
}
export async function unpackCharacterAssets(plain: any, assets: AssetBundleItem[]) {
  return unpackAssets(plain, assets, 'characterImages');
}

/** Task4 用：给定一张社区卡，把 avatar/background 等存到本地，返回 origin -> localUri 的 map */
export async function unpackCharacterImages(card: any): Promise<Record<string, string>> {
  const { plain, assets } = await packAssets(card, 'character');
  const { data, map } = await unpackAssets(plain, assets, 'characterImages');
  void data;
  const originToLocal: Record<string, string> = {};
  assets.forEach((a) => {
    const key = `asset://${a.id}`;
    if (map[key]) originToLocal[a.origin] = map[key];
  });
  return originToLocal;
}

/** 按 map 重写对象所有字符串。用于把已经本地保存过的 origin 映射批量替换到任何对象上。 */
export function applyAssetsMap<T>(obj: T, map: Record<string, string>): T {
  const walk = (node: any): any => {
    if (node == null) return node;
    if (typeof node === 'string') {
      if (node.indexOf('url(') >= 0) {
        return node.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g, (_m, q, u) => {
          const r = map[u];
          return r ? `url(${q || ''}${r}${q || ''})` : _m;
        });
      }
      return map[node] ?? node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node !== 'object') return node;
    const out: any = {};
    for (const k of Object.keys(node)) out[k] = walk(node[k]);
    return out;
  };
  return walk(obj);
}
