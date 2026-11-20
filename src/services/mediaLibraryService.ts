/**
 * 本地素材库（Media Library）
 *
 * 目的：让用户的自定义界面代码（HTML/CSS/JS）能"按名字"调用图片 / GIF / 视频，
 * 而不用去记一长串 file:// 路径。用户代码里写：
 *
 *   <img src="media://背景图">
 *   <div style="background-image:url('media://bg_aurora')"></div>
 *   <video src="media://开场动画" autoplay muted loop></video>
 *
 * 渲染前由 resolveRefsInHtml() 把这些引用替换成真实可访问的 data: URL（WebView 里
 * file:// 在很多情况下被拦，data: 最稳），或由 resolveToUri() 给 RN 的 <Image>/<Video> 用。
 *
 * 素材本体存在 app 文档目录 media_library/ 下，索引存在 media_library.json。
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

export type MediaKind = 'image' | 'gif' | 'video' | 'audio' | 'file';

export interface MediaAsset {
  id: string;
  /** 用户在代码里引用用的名字（唯一） */
  name: string;
  kind: MediaKind;
  /** 本地文件 uri */
  uri: string;
  /** 原始文件名 */
  fileName?: string;
  mimeType?: string;
  size?: number;
  createdAt: number;
  updatedAt: number;
  /** 备注 */
  note?: string;
}

const DIR_NAME = 'media_library';
const INDEX_FILE = 'media_library.json';
const REF_SCHEME = 'media://';

const docDir = (): string =>
  (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';

const libDir = (): string => `${docDir()}${DIR_NAME}`;
const indexPath = (): string => `${docDir()}${INDEX_FILE}`;

const ensureDir = async (): Promise<void> => {
  const dir = libDir();
  if (!dir) return;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
};

const extOf = (nameOrUri: string): string => {
  const clean = nameOrUri.split('?')[0].split('#')[0];
  const m = clean.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
};

/** 由扩展名/MIME 推断素材类型 */
export const detectKind = (nameOrUri: string, mimeType?: string): MediaKind => {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return mime.includes('gif') ? 'gif' : 'image';
  const ext = extOf(nameOrUri);
  if (['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  if (ext === 'gif') return 'gif';
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'avif', 'heic'].includes(ext)) return 'image';
  return 'file';
};

const mimeForExt = (ext: string): string => {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
  };
  return map[ext] || 'application/octet-stream';
};

let cache: MediaAsset[] | null = null;

const readIndex = async (): Promise<MediaAsset[]> => {
  if (cache) return cache;
  try {
    const p = indexPath();
    if (!p) return (cache = []);
    const info = await FileSystem.getInfoAsync(p);
    if (!info.exists) return (cache = []);
    const raw = await FileSystem.readAsStringAsync(p, { encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    const list: MediaAsset[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.assets) ? parsed.assets : [];
    cache = list.filter((a) => a && typeof a.name === 'string' && typeof a.uri === 'string');
    return cache;
  } catch (e) {
    console.warn('[media] 读取索引失败', e);
    return (cache = []);
  }
};

const writeIndex = async (list: MediaAsset[]): Promise<void> => {
  cache = list;
  try {
    const p = indexPath();
    if (!p) return;
    await FileSystem.writeAsStringAsync(p, JSON.stringify(list, null, 2), { encoding: 'utf8' });
  } catch (e) {
    console.warn('[media] 写入索引失败', e);
  }
};

const genId = (): string => `media_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** 名字规范化：去掉空白与危险字符，保证能安全放进 media:// 引用 */
const sanitizeName = (raw: string): string =>
  (raw || '')
    .trim()
    .replace(/[\s"'<>#?&\\/]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

/** 生成不与现有素材冲突的名字 */
const uniqueName = (list: MediaAsset[], base: string, selfId?: string): string => {
  const taken = new Set(list.filter((a) => a.id !== selfId).map((a) => a.name));
  let name = base || 'asset';
  if (!taken.has(name)) return name;
  let i = 2;
  while (taken.has(`${name}_${i}`)) i++;
  return `${name}_${i}`;
};

export const mediaLibraryService = {
  REF_SCHEME,

  /** 读取全部素材 */
  async list(): Promise<MediaAsset[]> {
    const list = await readIndex();
    return [...list].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  },

  /** 按名字查找（大小写不敏感，允许省略扩展名） */
  async findByName(name: string): Promise<MediaAsset | undefined> {
    const list = await readIndex();
    const key = (name || '').trim().toLowerCase();
    if (!key) return undefined;
    return (
      list.find((a) => a.name.toLowerCase() === key) ||
      list.find((a) => a.name.toLowerCase().replace(/\.[a-z0-9]+$/, '') === key.replace(/\.[a-z0-9]+$/, ''))
    );
  },

  async get(id: string): Promise<MediaAsset | undefined> {
    const list = await readIndex();
    return list.find((a) => a.id === id);
  },

  /** 把一个外部 uri 收进素材库 */
  async importFromUri(
    srcUri: string,
    opts: { name?: string; fileName?: string; mimeType?: string; note?: string } = {},
  ): Promise<MediaAsset | null> {
    try {
      await ensureDir();
      const list = await readIndex();
      const fileName = opts.fileName || srcUri.split('/').pop() || `asset_${Date.now()}`;
      const ext = extOf(fileName) || extOf(srcUri);
      const kind = detectKind(fileName, opts.mimeType);
      const baseName = sanitizeName(opts.name || fileName.replace(/\.[^.]+$/, '')) || 'asset';
      const name = uniqueName(list, baseName);
      const id = genId();
      const storedName = `${id}${ext ? '.' + ext : ''}`;
      const dest = `${libDir()}/${storedName}`;

      await FileSystem.copyAsync({ from: srcUri, to: dest });

      let size: number | undefined;
      try {
        const info: any = await FileSystem.getInfoAsync(dest, { size: true } as any);
        size = info?.size;
      } catch {
        /* size 拿不到就算了 */
      }

      const asset: MediaAsset = {
        id,
        name,
        kind,
        uri: dest,
        fileName,
        mimeType: opts.mimeType || mimeForExt(ext),
        size,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        note: opts.note,
      };
      await writeIndex([asset, ...list]);
      return asset;
    } catch (e) {
      console.warn('[media] 导入失败', e);
      return null;
    }
  },

  /** 从相册导入图片 / GIF / 视频（可多选） */
  async importFromGallery(allowMultiple = true): Promise<MediaAsset[]> {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: allowMultiple,
        selectionLimit: allowMultiple ? 20 : 1,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return [];
      const out: MediaAsset[] = [];
      for (const a of result.assets) {
        const fileName = (a as any).fileName || a.uri.split('/').pop() || 'asset';
        const asset = await this.importFromUri(a.uri, {
          fileName,
          mimeType: (a as any).mimeType,
        });
        if (asset) out.push(asset);
      }
      return out;
    } catch (e) {
      console.warn('[media] 相册导入失败', e);
      return [];
    }
  },

  /** 以文件方式导入（任意类型，用于字体/音频/压缩包等） */
  async importFromFiles(): Promise<MediaAsset[]> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled || !result.assets?.length) return [];
      const out: MediaAsset[] = [];
      for (const a of result.assets) {
        const asset = await this.importFromUri(a.uri, {
          fileName: a.name,
          mimeType: a.mimeType,
        });
        if (asset) out.push(asset);
      }
      return out;
    } catch (e) {
      console.warn('[media] 文件导入失败', e);
      return [];
    }
  },

  /** 重命名（用户代码里的 media:// 引用要跟着改） */
  async rename(id: string, newName: string): Promise<boolean> {
    const list = await readIndex();
    const target = list.find((a) => a.id === id);
    if (!target) return false;
    const base = sanitizeName(newName);
    if (!base) return false;
    const name = uniqueName(list, base, id);
    if (name === target.name) return true;
    const next = list.map((a) => (a.id === id ? { ...a, name, updatedAt: Date.now() } : a));
    await writeIndex(next);
    return true;
  },

  async updateNote(id: string, note: string): Promise<void> {
    const list = await readIndex();
    await writeIndex(list.map((a) => (a.id === id ? { ...a, note, updatedAt: Date.now() } : a)));
  },

  /** 删除素材（同时删文件） */
  async remove(id: string): Promise<boolean> {
    const list = await readIndex();
    const target = list.find((a) => a.id === id);
    if (!target) return false;
    try {
      await FileSystem.deleteAsync(target.uri, { idempotent: true });
    } catch {
      /* 文件可能已被清掉 */
    }
    await writeIndex(list.filter((a) => a.id !== id));
    return true;
  },

  /** 把 media://名字 解析成可直接给 RN <Image>/<Video> 用的 uri */
  async resolveToUri(ref: string): Promise<string | null> {
    if (!ref) return null;
    const trimmed = ref.trim();
    // 外部媒体：直接是 http(s)/data 地址时原样返回（AI 中途发图 / 外部 URL 拉图）
    if (/^(https?:\/\/|data:|blob:|file:)/i.test(trimmed)) return trimmed;
    const name = trimmed.startsWith(REF_SCHEME) ? trimmed.slice(REF_SCHEME.length) : trimmed;
    const decoded = decodeURIComponent(name);

    const exact = await this.findByName(decoded);
    if (exact?.uri) return exact.uri;

    // 模糊兜底：AI 很难 100% 复述名字，常见偏差是漏掉序号前缀、多了书名号/引号、
    // 或者只记得关键词。这里做一次宽松匹配，能命中就不至于把表情静默丢掉。
    const list = await readIndex();
    const norm = (s: string) =>
      String(s || '')
        .toLowerCase()
        .replace(/[\s"'“”‘’《》【】\[\]()（）·、,，.。!！?？~～_-]+/g, '')
        .replace(/^\d+/, ''); // 去掉开头的序号
    const target = norm(decoded);
    if (!target) return null;

    let hit = list.find((a) => norm(a.name) === target);
    if (!hit) hit = list.find((a) => norm(a.name).includes(target) || target.includes(norm(a.name)));
    return hit?.uri || null;
  },

  /** 把 media://名字 解析成 data: URL（WebView 里用，避免 file:// 被拦） */
  async resolveToDataUrl(ref: string): Promise<string | null> {
    const name = ref.startsWith(REF_SCHEME) ? ref.slice(REF_SCHEME.length) : ref;
    const asset = await this.findByName(decodeURIComponent(name));
    if (!asset) return null;
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
      const mime = asset.mimeType || mimeForExt(extOf(asset.uri));
      return `data:${mime};base64,${b64}`;
    } catch (e) {
      console.warn('[media] 转 dataURL 失败', asset.name, e);
      return null;
    }
  },

  /**
   * 把一段 HTML 里所有 media:// 引用替换成 data: URL。
   * 这是让用户代码能"通过代码调用各种图片/动图/视频"的关键一步。
   */
  async resolveRefsInHtml(html: string): Promise<string> {
    if (!html || html.indexOf(REF_SCHEME) === -1) return html;
    const list = await readIndex();

    // 先收集所有出现过的引用名，避免重复读盘
    const names = new Set<string>();
    const re = /media:\/\/([^"'()\s\\<>]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      names.add(decodeURIComponent(m[1]));
    }
    if (names.size === 0) return html;

    const resolved = new Map<string, string>();
    for (const raw of names) {
      const key = raw.trim().toLowerCase();
      const asset =
        list.find((a) => a.name.toLowerCase() === key) ||
        list.find((a) => a.name.toLowerCase().replace(/\.[a-z0-9]+$/, '') === key.replace(/\.[a-z0-9]+$/, ''));
      if (!asset) continue;
      try {
        const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
        const mime = asset.mimeType || mimeForExt(extOf(asset.uri));
        resolved.set(raw, `data:${mime};base64,${b64}`);
      } catch {
        /* 单个失败不影响其它 */
      }
    }

    let out = html;
    for (const [raw, dataUrl] of resolved) {
      // 同时替换带/不带 URI 编码的两种写法
      out = out.split(`${REF_SCHEME}${raw}`).join(dataUrl);
      out = out.split(`${REF_SCHEME}${encodeURIComponent(raw)}`).join(dataUrl);
      out = out.split(`${REF_SCHEME}${raw.replace(/ /g, '%20')}`).join(dataUrl);
    }
    return out;
  },

  /** 同步版：仅返回真实 uri 映射，供需要 uri 而非 dataURL 的场景（如 RN 背景） */
  async buildUriMap(): Promise<Record<string, string>> {
    const list = await readIndex();
    const map: Record<string, string> = {};
    for (const a of list) {
      map[a.name] = a.uri;
    }
    return map;
  },

  /** 导出：把素材打包成 { name, kind, mimeType, dataBase64 } 列表，供导出服务内嵌 */
  async exportAll(): Promise<Array<{ name: string; kind: MediaKind; mimeType?: string; note?: string; dataBase64: string }>> {
    const list = await readIndex();
    const out: Array<{ name: string; kind: MediaKind; mimeType?: string; note?: string; dataBase64: string }> = [];
    for (const a of list) {
      try {
        const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: 'base64' });
        out.push({ name: a.name, kind: a.kind, mimeType: a.mimeType, note: a.note, dataBase64: b64 });
      } catch {
        /* 跳过读不到的 */
      }
    }
    return out;
  },

  /**
   * 批量导入（性能版）：整批只读写一次索引。
   *
   * 逐条调 importFromUri 的话，每条都会重写整个索引 → O(n²)。
   * 内置表情包有 400+ 张，用逐条导入首启会卡到无法接受。
   */
  async importFromUris(
    items: Array<{ uri: string; name?: string; fileName?: string; mimeType?: string; note?: string }>,
  ): Promise<number> {
    if (!Array.isArray(items) || items.length === 0) return 0;
    await ensureDir();
    const list = await readIndex();
    const added: MediaAsset[] = [];

    for (const item of items) {
      try {
        if (!item?.uri) continue;
        const fileName = item.fileName || item.uri.split('/').pop() || `asset_${Date.now()}`;
        const ext = extOf(fileName) || extOf(item.uri);
        const kind = detectKind(fileName, item.mimeType);
        const baseName = sanitizeName(item.name || fileName.replace(/\.[^.]+$/, '')) || 'asset';
        const name = uniqueName([...list, ...added], baseName);
        const id = genId();
        const storedName = `${id}${ext ? '.' + ext : ''}`;
        const dest = `${libDir()}/${storedName}`;
        await FileSystem.copyAsync({ from: item.uri, to: dest });

        let size: number | undefined;
        try {
          const info: any = await FileSystem.getInfoAsync(dest, { size: true } as any);
          size = info?.size;
        } catch {
          /* size 拿不到就算了 */
        }

        added.push({
          id,
          name,
          kind,
          uri: dest,
          fileName,
          mimeType: item.mimeType || mimeForExt(ext),
          size,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          note: item.note,
        });
      } catch {
        /* 单条失败不影响整批 */
      }
    }

    if (added.length > 0) {
      await writeIndex([...added, ...list]);
    }
    return added.length;
  },

  /** 导入：从导出数据还原素材（同名则生成新名字，不覆盖） */
  async importAll(    items: Array<{ name: string; kind?: MediaKind; mimeType?: string; note?: string; dataBase64: string }>,
  ): Promise<{ imported: number; skipped: number }> {
    if (!Array.isArray(items) || items.length === 0) return { imported: 0, skipped: 0 };
    await ensureDir();
    let imported = 0;
    let skipped = 0;
    for (const item of items) {
      try {
        if (!item?.dataBase64) {
          skipped++;
          continue;
        }
        const list = await readIndex();
        const kind = item.kind || detectKind(item.name, item.mimeType);
        // 扩展名优先取文件名；没有就从 MIME 反推，避免存成无后缀文件
        let ext = extOf(item.name);
        if (!ext && item.mimeType) {
          const guess = Object.entries({
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'audio/mpeg': 'mp3',
          }).find(([k]) => item.mimeType!.toLowerCase().startsWith(k));
          ext = guess ? guess[1] : '';
        }
        const name = uniqueName(list, sanitizeName(item.name.replace(/\.[^.]+$/, '')) || 'asset');
        const id = genId();
        const dest = `${libDir()}/${id}${ext ? '.' + ext : ''}`;
        await FileSystem.writeAsStringAsync(dest, item.dataBase64, { encoding: 'base64' });
        const asset: MediaAsset = {
          id,
          name,
          kind,
          uri: dest,
          fileName: item.name,
          mimeType: item.mimeType || mimeForExt(ext),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          note: item.note,
        };
        await writeIndex([asset, ...list]);
        imported++;
      } catch {
        skipped++;
      }
    }
    return { imported, skipped };
  },

  /** 清空缓存（导入恢复后调用，强制重新读索引） */
  clearCache(): void {
    cache = null;
  },
};
