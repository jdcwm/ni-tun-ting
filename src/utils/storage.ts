import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { AppSettings, Chat, AIProvider, WorldBook, Character, FancyWork, Preset, CommunityResourceType, CommunityResourceEntry, UserLogEntry } from '../types';
import { defaultAppSettings } from '../constants/defaults';
import { debounce } from './performance';

const STORAGE_KEYS = {
  SETTINGS: 'ai_tavern_settings',
  CHATS: 'ai_tavern_chats',
  PROVIDERS: 'ai_tavern_providers',
  WORLD_BOOKS: 'ai_tavern_world_books',
  CHARACTERS: 'ai_tavern_characters',
  FANCY_WORKS: 'ai_tavern_fancy_works',
  PRESETS: 'ai_tavern_presets',
  CACHE_MESSAGES: 'ai_tavern_cache_messages',
  CURRENT_CHAT_ID: 'ai_tavern_current_chat_id',
};

// 文件系统存储路径 — 双目录 × 3 份独立物理副本 (main / backup / stable) = 6 份
// Android page cache 丢失 / 进程被杀导致某一份数据未刷盘时，其他目录/副本仍能兜底
type TriplePaths = { main: string; backup: string; stable: string };
type DualPaths = { doc: TriplePaths; cache: TriplePaths };
const tripleFor = (dir: string, name: string): TriplePaths => ({
  main: `${dir}${name}.json`,
  backup: `${dir}${name}_backup.json`,
  stable: `${dir}${name}_stable.json`,
});
const fsDual = (name: string): DualPaths => ({
  doc: tripleFor(FileSystem.documentDirectory || '', name),
  cache: tripleFor(FileSystem.cacheDirectory || `${FileSystem.documentDirectory}cache/`, name),
});
const allPathsOf = (d: DualPaths): string[] => [d.doc.main, d.doc.backup, d.doc.stable, d.cache.main, d.cache.backup, d.cache.stable];

const SETTINGS_FILES = fsDual('settings_data');
const CHATS_FILES = fsDual('chats_data');
const PROVIDERS_FILES = fsDual('providers_data');
const WORLD_BOOKS_FILES = fsDual('worldbooks_data');
const CHARACTERS_FILES = fsDual('characters_data');
const FANCY_WORKS_FILES = fsDual('fancyworks_data');
const PRESETS_FILES = fsDual('presets_data');

const COMMUNITY_RESOURCES_KEY = 'aitavern_community_resources';
const USER_LOGS_KEY = 'aitavern_user_logs';
const COMMUNITY_RESOURCES_FILES = fsDual('internal/community_resources_v1');
const USER_LOGS_FILES = fsDual('internal/user_logs_v1');
const COMMUNITY_RESOURCE_TYPES: CommunityResourceType[] = ['character', 'worldbook', 'regex', 'css'];
const random6 = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

const memoryCache: Record<string, any> = {};

/**
 * 电脑版 / 网页版兼容。
 *
 * expo-file-system 在 web 上基本不可用（写文件必然失败，日志里全是
 * `[storage] atomic write failed`，结果就是「什么都存不住」）。
 * 所以 web 平台改走 AsyncStorage —— 它在浏览器里就是 localStorage。
 */
const IS_WEB = Platform.OS === 'web';
const webKeyFor = (files: DualPaths): string => {
  const raw = String(files?.doc?.main || '');
  const m = raw.match(/([^/\\]+)\.json$/);
  return `aitavern_file_${m ? m[1] : raw || 'unknown'}`;
};

/**
 * 网页/电脑版的键值存储。
 *
 * 不能只用 AsyncStorage —— 它在浏览器里落到 localStorage，**配额只有 ~5MB**，
 * 这个 App 的角色卡 + 世界书 + 素材库远超这个量，会直接 `QuotaExceededError`
 * 导致「什么都存不下来」。所以优先用 IndexedDB（配额是几百 MB 级）。
 */
const webStore = {
  db: null as IDBDatabase | null,
  async open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return null;
    if (this.db) return this.db;
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('aitavern_store', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        };
        req.onsuccess = () => {
          this.db = req.result;
          resolve(req.result);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },
  async get(key: string): Promise<string | null> {
    const db = await this.open();
    if (!db) {
      try {
        return await AsyncStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('kv', 'readonly');
        const req = tx.objectStore('kv').get(key);
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },
  async set(key: string, value: string): Promise<void> {
    const db = await this.open();
    if (!db) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch {
        /* 配额不够就放弃，至少不崩 */
      }
      return;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  },
};

// ===== 全局写入队列：串行化对同一目标的写入，避免并发覆盖 =====
const writeQueue: Record<string, Promise<any>> = {};
const enqueueWrite = (key: string, fn: () => Promise<void>): Promise<void> => {
  const prev = writeQueue[key] || Promise.resolve();
  const next = prev.then(fn, () => fn().catch(() => {}));
  writeQueue[key] = next;
  return next;
};

// ===== 通用：文件系统读取（doc + cache 双目录 × 3 份 = 6 份，取最完整的一份）=====
async function readJsonFromFiles<T>(files: DualPaths): Promise<T | null> {
  // web：没有文件系统，直接从 AsyncStorage（localStorage）读
  if (IS_WEB) {
    try {
      const content = await webStore.get(webKeyFor(files));
      if (!content) return null;
      const trimmed = content.trim();
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
      return JSON.parse(trimmed) as T;
    } catch {
      return null;
    }
  }
  // 先读 document，再读 cache；两个目录独立，page cache 丢失场景下另一个可能完整
  const paths = allPathsOf(files);
  let lastValid: T | null = null;
  let lastValidCount = -1;
  for (const path of paths) {
    try {
      const content = await FileSystem.readAsStringAsync(path);
      if (!content || content.trim().length === 0) continue;
      const trimmed = content.trim();
      if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') continue;
      const parsed = JSON.parse(trimmed) as T;
      // 选择数组元素最多的一份（最完整）
      if (Array.isArray(parsed)) {
        if (parsed.length > lastValidCount) {
          lastValid = parsed;
          lastValidCount = parsed.length;
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        const keyCount = Object.keys(parsed).length;
        if (keyCount > lastValidCount) {
          lastValid = parsed;
          lastValidCount = keyCount;
        }
      } else {
        return parsed;
      }
    } catch {
      // 继续下一个路径
    }
  }
  return lastValid;
}

// ===== 通用：写入单个文件 — 原子 write（tmp → move）+ 读回验证，最多重试 2 次 =====
async function writeAtomic(targetPath: string, finalJson: string): Promise<void> {
  const tmpPath = `${targetPath}.tmp`;
  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    try {
      await FileSystem.writeAsStringAsync(tmpPath, finalJson, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      // 读回临时文件验证
      try {
        const ver = await FileSystem.readAsStringAsync(tmpPath);
        if (ver !== finalJson) {
          // 临时文件内容不一致，重写临时文件
          await FileSystem.writeAsStringAsync(tmpPath, finalJson, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        }
      } catch {
        // 读回失败不阻塞 move
      }
      // 原子替换（inode-level swap）
      await FileSystem.moveAsync({ from: tmpPath, to: targetPath });
      // 再读回目标文件，确认内容真正落地
      try {
        const finalVer = await FileSystem.readAsStringAsync(targetPath);
        if (finalVer === finalJson) return; // 成功
        console.warn(`[storage] atomic write mismatch on retry ${attempts} for ${targetPath}`);
      } catch (readErr) {
        console.warn(`[storage] atomic write post-verify read failed on retry ${attempts} for ${targetPath}:`, readErr);
      }
    } catch (writeErr) {
      console.error(`[storage] atomic write failed attempt ${attempts} for ${targetPath}:`, writeErr);
      // 回退：直接写
      try {
        await FileSystem.writeAsStringAsync(targetPath, finalJson, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch {}
      try { await FileSystem.deleteAsync(tmpPath, { idempotent: true }); } catch {}
    }
  }
}

// ===== 通用：写 DualPaths（doc 3 份 + cache 3 份串行写，共 6 份物理副本）+ 可选 validate 检查 =====
async function writeJsonToFiles(
  files: DualPaths,
  data: any,
  dataName: string = 'data',
  validate?: (written: any) => boolean,
): Promise<void> {
  let json: string;
  try {
    json = JSON.stringify(data);
  } catch (err1) {
    console.error(`[storage] JSON.stringify ${dataName} failed, try fallback:`, err1);
    json = JSON.stringify(data, (_k: string, v: any) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Date) return v.toISOString();
      return v;
    });
  }
  if (json === '{}' && data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0) {
    console.error(`[storage] CRITICAL: ${dataName} serialized to {}!`);
  }
  const finalJson = json || (Array.isArray(data) ? '[]' : '{}');

  // web：没有文件系统，写进 AsyncStorage（localStorage）即可
  if (IS_WEB) {
    try {
      await webStore.set(webKeyFor(files), finalJson);
    } catch (e) {
      console.error(`[storage] web 写入 ${dataName} 失败:`, e);
    }
    return;
  }

  // 6 份副本串行写入 — 保证每一份都走完原子写+验证
  const paths = allPathsOf(files);
  for (const p of paths) {
    try {
      await writeAtomic(p, finalJson);
    } catch {
      // 单个副本失败不影响其他副本
    }
  }

  // 回读验证：必须至少有 1 份副本通过 validate；失败直接再写 6 份兜底
  if (validate) {
    try {
      const v = await readJsonFromFiles<any>(files);
      if (!validate(v)) {
        console.error(`[storage] VERIFY FAILED for ${dataName}, 强制再写一遍 6 份`);
        for (const p of paths) {
          try {
            await FileSystem.writeAsStringAsync(p, finalJson, {
              encoding: FileSystem.EncodingType.UTF8,
            });
          } catch {}
        }
      }
    } catch (verr) {
      console.error(`[storage] verify ${dataName} failed:`, verr);
    }
  }
}

const safeStringify = (obj: any): string => {
  try {
    const result = JSON.stringify(obj);
    if (result === '{}' && obj && typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length > 0) {
      console.warn('[storage] stringify returned {} for non-empty object');
    }
    return result;
  } catch (e) {
    console.warn('[storage] stringify failed:', e);
    return '{}';
  }
};

const safeParse = <T>(data: string | null, fallback: T): T => {
  if (!data) return fallback;
  try {
    return JSON.parse(data) as T;
  } catch (e) {
    console.warn('[storage] parse failed:', e);
    return fallback;
  }
};

const debouncedSave = (key: string, delay = 800) =>
  debounce(async (value: any) => {
    try {
      memoryCache[key] = value;
      let json: string;
      try {
        json = JSON.stringify(value);
      } catch {
        json = safeStringify(value);
      }
      await AsyncStorage.setItem(key, json);
    } catch (e) {
      console.warn(`[storage] save ${key} failed:`, e);
    }
  }, delay);

const debouncedSaves: Record<string, ReturnType<typeof debouncedSave>> = {};

const getDebouncedSave = (key: string) => {
  if (!debouncedSaves[key]) {
    debouncedSaves[key] = debouncedSave(key);
  }
  return debouncedSaves[key];
};

const immediateSave = async (key: string, value: any) => {
  try {
    memoryCache[key] = value;
    let json: string;
    try {
      json = JSON.stringify(value);
    } catch {
      json = safeStringify(value);
    }
    // 即使 AsyncStorage 满（6MB 限制）失败，也不抛错；文件系统已经作为主存储兜底
    try {
      await AsyncStorage.setItem(key, json);
    } catch (e: any) {
      console.warn(`[storage] immediateSave AsyncStorage failed for ${key}:`, e?.message || e);
    }
  } catch (e) {
    console.warn(`[storage] immediateSave wrapper failed for ${key}:`, e);
  }
};

const cachedGet = async <T>(key: string, fallback: T): Promise<T> => {
  const cached = memoryCache[key];
  if (cached !== undefined && (Array.isArray(cached) ? cached.length > 0 : true)) {
    return cached as T;
  }
  try {
    const data = await AsyncStorage.getItem(key);
    if (!data) {
      return fallback;
    }
    const parsed = safeParse<T>(data, fallback);
    if (Array.isArray(parsed) ? parsed.length > 0 : parsed !== null) {
      memoryCache[key] = parsed;
    }
    return parsed;
  } catch {
    return fallback;
  }
};

export const storage = {
  clearCache() {
    Object.keys(memoryCache).forEach((k) => {
      delete memoryCache[k];
    });
  },

  async flushAll() {
    const pending = Object.values(debouncedSaves);
    for (const fn of pending) {
      try { await (fn as any).flush?.(); } catch {}
    }
    for (const key of Object.keys(debouncedSaves)) {
      if (memoryCache[key] !== undefined) {
        try { await AsyncStorage.setItem(key, safeStringify(memoryCache[key])); } catch {}
      }
    }
  },

  async getSettings(): Promise<AppSettings> {
    const fileData = await readJsonFromFiles<any>(SETTINGS_FILES);
    if (fileData && typeof fileData === 'object') {
      memoryCache[STORAGE_KEYS.SETTINGS] = fileData;
      return { ...defaultAppSettings, ...fileData };
    }
    const result = await cachedGet<AppSettings>(STORAGE_KEYS.SETTINGS, defaultAppSettings);
    return { ...defaultAppSettings, ...(result || {}) };
  },

  async saveSettings(settings: AppSettings, immediate = false): Promise<void> {
    memoryCache[STORAGE_KEYS.SETTINGS] = settings;
    const p = enqueueWrite('settings', async () => {
      await writeJsonToFiles(SETTINGS_FILES, settings, 'settings',
        (v) => v && typeof v === 'object' && (Object.keys(v).length > 0 || (settings && Object.keys(settings).length === 0)));
    });
    if (immediate) {
      await immediateSave(STORAGE_KEYS.SETTINGS, settings);
    } else {
      getDebouncedSave(STORAGE_KEYS.SETTINGS)(settings);
    }
    await p;
  },

  async getChats(): Promise<Chat[]> {
    const fileData = await readJsonFromFiles<Chat[]>(CHATS_FILES);
    if (Array.isArray(fileData) && fileData.length > 0) {
      memoryCache[STORAGE_KEYS.CHATS] = fileData;
      return fileData;
    }
    try {
      const result = await cachedGet<Chat[]>(STORAGE_KEYS.CHATS, []);
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  },

  async saveChats(chats: Chat[], immediate = false): Promise<void> {
    memoryCache[STORAGE_KEYS.CHATS] = chats;
    const p = enqueueWrite('chats', async () => {
      await writeJsonToFiles(CHATS_FILES, chats, 'chats',
        (v) => Array.isArray(v) && v.length === chats.length);
    });
    if (immediate) {
      await immediateSave(STORAGE_KEYS.CHATS, chats);
    } else {
      getDebouncedSave(STORAGE_KEYS.CHATS)(chats);
    }
    await p;
  },

  async getProviders(): Promise<AIProvider[]> {
    const fileData = await readJsonFromFiles<any[]>(PROVIDERS_FILES);
    if (Array.isArray(fileData)) {
      memoryCache[STORAGE_KEYS.PROVIDERS] = fileData;
      return fileData.map((p: any) => ({
        ...p,
        format: p.format || 'openai',
        capabilities: p.capabilities || (p.type ? [p.type] : ['text']),
      }));
    }
    const raw = await cachedGet<any[]>(STORAGE_KEYS.PROVIDERS, []);
    return (raw || []).map((p: any) => ({
      ...p,
      format: p.format || 'openai',
      capabilities: p.capabilities || (p.type ? [p.type] : ['text']),
    }));
  },

  async saveProviders(providers: AIProvider[], immediate = false): Promise<void> {
    memoryCache[STORAGE_KEYS.PROVIDERS] = providers;
    const p = enqueueWrite('providers', async () => {
      await writeJsonToFiles(PROVIDERS_FILES, providers, 'providers',
        (v) => Array.isArray(v) && v.length === providers.length);
    });
    if (immediate) {
      await immediateSave(STORAGE_KEYS.PROVIDERS, providers);
    } else {
      getDebouncedSave(STORAGE_KEYS.PROVIDERS)(providers);
    }
    await p;
  },

  async getWorldBooks(): Promise<WorldBook[]> {
    const fileData = await readJsonFromFiles<WorldBook[]>(WORLD_BOOKS_FILES);
    if (Array.isArray(fileData)) {
      memoryCache[STORAGE_KEYS.WORLD_BOOKS] = fileData;
      return fileData;
    }
    return await cachedGet<WorldBook[]>(STORAGE_KEYS.WORLD_BOOKS, []);
  },

  async saveWorldBooks(worldBooks: WorldBook[], immediate = false): Promise<void> {
    memoryCache[STORAGE_KEYS.WORLD_BOOKS] = worldBooks;
    const p = enqueueWrite('worldBooks', async () => {
      await writeJsonToFiles(WORLD_BOOKS_FILES, worldBooks, 'worldbooks',
        (v) => Array.isArray(v) && v.length === worldBooks.length);
    });
    if (immediate) {
      await immediateSave(STORAGE_KEYS.WORLD_BOOKS, worldBooks);
    } else {
      getDebouncedSave(STORAGE_KEYS.WORLD_BOOKS)(worldBooks);
    }
    await p;
  },

  async getCharacters(): Promise<Character[]> {
    const fileData = await readJsonFromFiles<Character[]>(CHARACTERS_FILES);
    if (Array.isArray(fileData)) {
      memoryCache[STORAGE_KEYS.CHARACTERS] = fileData;
      return fileData;
    }
    return await cachedGet<Character[]>(STORAGE_KEYS.CHARACTERS, []);
  },

  async saveCharacters(characters: Character[], immediate = false): Promise<void> {
    memoryCache[STORAGE_KEYS.CHARACTERS] = characters;
    const p = enqueueWrite('characters', async () => {
      await writeJsonToFiles(CHARACTERS_FILES, characters, 'characters',
        (v) => Array.isArray(v) && v.length === characters.length);
    });
    if (immediate) {
      await immediateSave(STORAGE_KEYS.CHARACTERS, characters);
    } else {
      getDebouncedSave(STORAGE_KEYS.CHARACTERS)(characters);
    }
    await p;
  },

  async getFancyWorks(): Promise<FancyWork[]> {
    const fileData = await readJsonFromFiles<FancyWork[]>(FANCY_WORKS_FILES);
    if (Array.isArray(fileData)) {
      memoryCache[STORAGE_KEYS.FANCY_WORKS] = fileData;
      return fileData;
    }
    return await cachedGet<FancyWork[]>(STORAGE_KEYS.FANCY_WORKS, []);
  },

  async saveFancyWorks(works: FancyWork[], immediate = false): Promise<void> {
    memoryCache[STORAGE_KEYS.FANCY_WORKS] = works;
    const p = enqueueWrite('fancyWorks', async () => {
      await writeJsonToFiles(FANCY_WORKS_FILES, works, 'fancyWorks',
        (v) => Array.isArray(v) && v.length === works.length);
    });
    if (immediate) {
      await immediateSave(STORAGE_KEYS.FANCY_WORKS, works);
    } else {
      getDebouncedSave(STORAGE_KEYS.FANCY_WORKS)(works);
    }
    await p;
  },

  async getPresets(): Promise<Preset[]> {
    const fileData = await readJsonFromFiles<Preset[]>(PRESETS_FILES);
    if (Array.isArray(fileData)) {
      memoryCache[STORAGE_KEYS.PRESETS] = fileData;
      return fileData;
    }
    return await cachedGet<Preset[]>(STORAGE_KEYS.PRESETS, []);
  },

  async savePresets(presets: Preset[], immediate = false): Promise<void> {
    memoryCache[STORAGE_KEYS.PRESETS] = presets;
    const p = enqueueWrite('presets', async () => {
      await writeJsonToFiles(PRESETS_FILES, presets, 'presets',
        (v) => Array.isArray(v) && v.length === presets.length);
    });
    if (immediate) {
      await immediateSave(STORAGE_KEYS.PRESETS, presets);
    } else {
      getDebouncedSave(STORAGE_KEYS.PRESETS)(presets);
    }
    await p;
  },

  async getCurrentChatId(): Promise<string | null> {
    const result = await cachedGet<string | null>(STORAGE_KEYS.CURRENT_CHAT_ID, null);
    return result || null;
  },

  saveCurrentChatId(chatId: string | null): Promise<void> {
    return immediateSave(STORAGE_KEYS.CURRENT_CHAT_ID, chatId);
  },

  async saveMessageCache(chatId: string, messages: any[]): Promise<void> {
    const key = `${STORAGE_KEYS.CACHE_MESSAGES}_${chatId}`;
    try {
      await immediateSave(key, messages);
    } catch (e) {
      console.warn(`[storage] saveMessageCache failed for chat ${chatId}:`, e);
    }
  },

  async loadMessageCache(chatId: string): Promise<any[] | null> {
    const key = `${STORAGE_KEYS.CACHE_MESSAGES}_${chatId}`;
    try {
      const data = await AsyncStorage.getItem(key);
      if (!data) return null;
      return safeParse<any[]>(data, []);
    } catch (e) {
      console.warn(`[storage] loadMessageCache failed for chat ${chatId}:`, e);
      return null;
    }
  },

  async clearMessageCache(chatId: string): Promise<void> {
    const key = `${STORAGE_KEYS.CACHE_MESSAGES}_${chatId}`;
    try {
      delete memoryCache[key];
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn(`[storage] clearMessageCache failed for chat ${chatId}:`, e);
    }
  },

  async clearAll(): Promise<void> {
    this.clearCache();
    const allKeys = Object.values(STORAGE_KEYS);
    try {
      const cacheKeys = await AsyncStorage.getAllKeys();
      const messageCacheKeys = cacheKeys.filter((k) => k.startsWith(STORAGE_KEYS.CACHE_MESSAGES));
      allKeys.push(...messageCacheKeys);
    } catch {}
    await AsyncStorage.multiRemove(allKeys);
  },

  // === 紧急备份：导入数据时保存原始 JSON 字符串，防止杀进程后数据丢失（双目录+双文件+AsyncStorage=5 份兜底）===
  async saveEmergencyBackup(dataStr: string): Promise<void> {
    try {
      const docDir = FileSystem.documentDirectory || '';
      const cacheDir = FileSystem.cacheDirectory || `${docDir}cache/`;
      const paths = [
        `${docDir}emergency_import.json`,
        `${docDir}emergency_import_backup.json`,
        `${cacheDir}emergency_import.json`,
        `${cacheDir}emergency_import_backup.json`,
      ];
      for (const p of paths) {
        try { await writeAtomic(p, dataStr); } catch {}
      }
      // 额外写入 AsyncStorage，再兜底一层
      try {
        await AsyncStorage.setItem('ai_tavern_emergency_backup', dataStr);
      } catch {}
      console.log('[storage] Emergency backup saved, bytes:', dataStr.length, ' copies:', paths.length + 1);
    } catch (e) {
      console.error('[storage] Emergency backup failed:', e);
    }
  },

  async getEmergencyBackup(): Promise<string | null> {
    const docDir = FileSystem.documentDirectory || '';
    const cacheDir = FileSystem.cacheDirectory || `${docDir}cache/`;
    const paths = [
      `${docDir}emergency_import.json`,
      `${docDir}emergency_import_backup.json`,
      `${cacheDir}emergency_import.json`,
      `${cacheDir}emergency_import_backup.json`,
    ];
    for (const path of paths) {
      try {
        const content = await FileSystem.readAsStringAsync(path);
        if (content && content.trim().length > 0) {
          return content;
        }
      } catch {}
    }
    try {
      const data = await AsyncStorage.getItem('ai_tavern_emergency_backup');
      if (data && data.trim().length > 0) return data;
    } catch {}
    return null;
  },

  async clearEmergencyBackup(): Promise<void> {
    const docDir = FileSystem.documentDirectory || '';
    const cacheDir = FileSystem.cacheDirectory || `${docDir}cache/`;
    const paths = [
      `${docDir}emergency_import.json`,
      `${docDir}emergency_import_backup.json`,
      `${cacheDir}emergency_import.json`,
      `${cacheDir}emergency_import_backup.json`,
    ];
    for (const p of paths) {
      try { await FileSystem.deleteAsync(p, { idempotent: true }); } catch {}
    }
    try {
      await AsyncStorage.removeItem('ai_tavern_emergency_backup');
    } catch {}
  },

  /** 强制等待一段时间（刷盘窗口），给 Android 内核把 page cache 刷到闪存争取时间 */
  async waitForFlush(ms: number = 500): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  },
  // ====== Task 2: Community Resource Library (R6) ======
  async getCommunityResources(type?: CommunityResourceType): Promise<CommunityResourceEntry[]> {
    let list: CommunityResourceEntry[] = [];
    try {
      const fileData = await readJsonFromFiles<CommunityResourceEntry[]>(COMMUNITY_RESOURCES_FILES);
      if (Array.isArray(fileData)) {
        list = fileData;
      } else {
        try {
          const raw = await cachedGet<CommunityResourceEntry[]>(COMMUNITY_RESOURCES_KEY, [] as any);
          list = Array.isArray(raw) ? raw : [];
        } catch (e) {
          console.error('[storage] getCommunityResources cachedGet corrupted, reset to []:', e);
          list = [];
        }
      }
    } catch (e) {
      console.error('[storage] getCommunityResources corrupted JSON, reset to []:', e);
      list = [];
      try {
        await immediateSave(COMMUNITY_RESOURCES_KEY, list);
        await enqueueWrite('communityResources', async () => {
          await writeJsonToFiles(COMMUNITY_RESOURCES_FILES, list, 'communityResources',
            (v) => Array.isArray(v) && v.length === list.length);
        });
      } catch {}
    }
    memoryCache[COMMUNITY_RESOURCES_KEY] = list;
    if (type === undefined) return list;
    return list.filter((r) => r.type === type);
  },

  async saveCommunityResource(
    type: CommunityResourceType,
    payload: Omit<CommunityResourceEntry, 'id' | 'type' | 'createdAt' | 'isCommunityOwned'> & { id?: string; createdAt?: number },
  ): Promise<CommunityResourceEntry> {
    if (!COMMUNITY_RESOURCE_TYPES.includes(type)) {
      throw new Error(`[storage] saveCommunityResource invalid type: ${type}; must be one of ${COMMUNITY_RESOURCE_TYPES.join(', ')}`);
    }
    const entry: CommunityResourceEntry = {
      id: payload.id ?? `cr_${Date.now()}_${random6()}`,
      type,
      resourceId: payload.resourceId,
      source: payload.source,
      ownerUid: payload.ownerUid,
      metadata: payload.metadata,
      createdAt: payload.createdAt ?? Date.now(),
      isCommunityOwned: true,
      userModified: payload.userModified,
    };
    const list = await this.getCommunityResources();
    list.push(entry);
    memoryCache[COMMUNITY_RESOURCES_KEY] = list;
    const p = enqueueWrite('communityResources', async () => {
      await writeJsonToFiles(COMMUNITY_RESOURCES_FILES, list, 'communityResources',
        (v) => Array.isArray(v) && v.length === list.length);
    });
    getDebouncedSave(COMMUNITY_RESOURCES_KEY)(list);
    await p;
    return entry;
  },

  async deleteCommunityResource(id: string): Promise<boolean> {
    const list = await this.getCommunityResources();
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    list.splice(idx, 1);
    memoryCache[COMMUNITY_RESOURCES_KEY] = list;
    const p = enqueueWrite('communityResources', async () => {
      await writeJsonToFiles(COMMUNITY_RESOURCES_FILES, list, 'communityResources',
        (v) => Array.isArray(v) && v.length === list.length);
    });
    getDebouncedSave(COMMUNITY_RESOURCES_KEY)(list);
    await p;
    return true;
  },

  async markCommunityResourceUserModified(resourceId: string, userModified: boolean = true): Promise<void> {
    const list = await this.getCommunityResources();
    let changed = false;
    for (const r of list) {
      if (r.resourceId === resourceId && r.userModified !== userModified) {
        r.userModified = userModified;
        changed = true;
      }
    }
    if (!changed) return;
    memoryCache[COMMUNITY_RESOURCES_KEY] = list;
    const p = enqueueWrite('communityResources', async () => {
      await writeJsonToFiles(COMMUNITY_RESOURCES_FILES, list, 'communityResources',
        (v) => Array.isArray(v) && v.length === list.length);
    });
    getDebouncedSave(COMMUNITY_RESOURCES_KEY)(list);
    await p;
  },

  // ====== Task 2: User Operation Logs (R9) ======
  async appendUserLog(entry: Omit<UserLogEntry, 'ts'> & { ts?: number }): Promise<UserLogEntry> {
    let logs: UserLogEntry[] = [];
    try {
      const fileData = await readJsonFromFiles<UserLogEntry[]>(USER_LOGS_FILES);
      if (Array.isArray(fileData)) {
        logs = fileData;
      } else {
        try {
          const raw = await cachedGet<UserLogEntry[]>(USER_LOGS_KEY, [] as any);
          logs = Array.isArray(raw) ? raw : [];
        } catch (e) {
          console.error('[storage] appendUserLog cachedGet corrupted, reset to []:', e);
          logs = [];
        }
      }
    } catch (e) {
      console.error('[storage] appendUserLog corrupted JSON, reset to []:', e);
      logs = [];
    }
    const full: UserLogEntry = {
      ts: entry.ts ?? Date.now(),
      type: entry.type,
      target: entry.target,
      meta: entry.meta,
    };
    logs.push(full);
    // 限制最近 5000 条，避免无限膨胀
    if (logs.length > 5000) {
      logs = logs.slice(logs.length - 5000);
    }
    memoryCache[USER_LOGS_KEY] = logs;
    const p = enqueueWrite('userLogs', async () => {
      await writeJsonToFiles(USER_LOGS_FILES, logs, 'userLogs',
        (v) => Array.isArray(v) && v.length === logs.length);
    });
    getDebouncedSave(USER_LOGS_KEY)(logs);
    await p;
    return full;
  },

  async listUserLogs(limit?: number): Promise<UserLogEntry[]> {
    let logs: UserLogEntry[] = [];
    try {
      const fileData = await readJsonFromFiles<UserLogEntry[]>(USER_LOGS_FILES);
      if (Array.isArray(fileData)) {
        logs = fileData;
      } else {
        try {
          const raw = await cachedGet<UserLogEntry[]>(USER_LOGS_KEY, [] as any);
          logs = Array.isArray(raw) ? raw : [];
        } catch (e) {
          console.error('[storage] listUserLogs cachedGet corrupted, reset to []:', e);
          logs = [];
        }
      }
    } catch (e) {
      console.error('[storage] listUserLogs corrupted JSON, reset to []:', e);
      logs = [];
    }
    const reversed = logs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (typeof limit === 'number' && limit > 0) return reversed.slice(0, limit);
    return reversed;
  },
};
