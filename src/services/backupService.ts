import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { AppSettings, Chat, AIProvider, WorldBook, Character, FancyWork, Preset } from '../types';

/**
 * 自动备份与恢复服务（双存储架构：FileSystem 为主，AsyncStorage 兜底）
 * - 本地备份与恢复 UI 展示两者合并的列表（去重）
 * - 文件系统备份 /backups/backup_full_*.json 包含全量数据（settings/chats/providers/worldBooks/characters/fancyWorks/presets）
 * - AsyncStorage backup_full_* 兜底；chats-only 备份仅用于自动快照
 */

const BACKUP_KEYS = {
  CHATS_PREFIX: 'backup_chats_',
  FULL_PREFIX: 'backup_full_',
  TIMESTAMP: 'backup_last_timestamp',
};
const MAX_BACKUPS = 5;
const FILE_BACKUP_DIR = `${FileSystem.documentDirectory}backups/`;
const MAX_FILE_BACKUPS = 5;

interface FullBackup {
  version: number;
  backupTime: number;
  settings?: AppSettings;
  chats: Chat[];
  providers?: AIProvider[];
  worldBooks?: WorldBook[];
  characters?: Character[];
  fancyWorks?: FancyWork[];
  presets?: Preset[];
  source?: 'file' | 'asyncstorage';
}

const normalizeChatMessages = (parsed: any[]): Chat[] =>
  parsed.map((chat: any) => ({
    ...chat,
    settings: chat.settings,
    worldBookIds: Array.isArray(chat.worldBookIds) ? chat.worldBookIds : [],
    statusVars: chat.statusVars || {},
    messages: Array.isArray(chat.messages)
      ? chat.messages.map((msg: any) => ({
          id: msg.id || Date.now().toString(36) + Math.random().toString(36).substr(2),
          role: (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') ? msg.role : 'assistant',
          content: msg.content || '',
          images: Array.isArray(msg.images) ? msg.images : [],
          timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
          providerId: msg.providerId,
          type: msg.type,
          isFavorite: msg.isFavorite || false,
          isError: msg.isError || false,
          errorDetail: msg.errorDetail,
          versions: Array.isArray(msg.versions) ? msg.versions : undefined,
          currentVersionIndex: msg.currentVersionIndex,
          tokenUsage: msg.tokenUsage,
          firstTokenTime: msg.firstTokenTime,
          totalElapsedTime: msg.totalElapsedTime,
          aijsCode: msg.aijsCode,
          aijsResult: msg.aijsResult,
          senderMemberId: msg.senderMemberId,
        }))
      : [],
  }));

/** 原子写：tmp → move + 读回验证 */
const writeAtomicFile = async (filePath: string, json: string): Promise<void> => {
  const tmpPath = `${filePath}.tmp`;
  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    try {
      await FileSystem.writeAsStringAsync(tmpPath, json, { encoding: FileSystem.EncodingType.UTF8 });
      try {
        const v = await FileSystem.readAsStringAsync(tmpPath);
        if (v !== json) {
          await FileSystem.writeAsStringAsync(tmpPath, json, { encoding: FileSystem.EncodingType.UTF8 });
        }
      } catch {}
      await FileSystem.moveAsync({ from: tmpPath, to: filePath });
      try {
        const finalV = await FileSystem.readAsStringAsync(filePath);
        if (finalV === json) return;
      } catch {}
    } catch (e) {
      try { await FileSystem.writeAsStringAsync(filePath, json, { encoding: FileSystem.EncodingType.UTF8 }); } catch {}
      try { await FileSystem.deleteAsync(tmpPath, { idempotent: true }); } catch {}
    }
  }
};

/** 自动备份 chats（在每次保存 chats 时调用，chats-only 快照） */
export const autoBackupChats = async (chats: Chat[]): Promise<void> => {
  if (!chats || chats.length === 0) return;
  try {
    const timestamp = Date.now();
    const key = `${BACKUP_KEYS.CHATS_PREFIX}${timestamp}`;
    await AsyncStorage.setItem(key, JSON.stringify(chats));
    const allKeys = await AsyncStorage.getAllKeys();
    const backupKeys = (allKeys || [])
      .filter((k) => k.startsWith(BACKUP_KEYS.CHATS_PREFIX))
      .sort();
    if (backupKeys.length > MAX_BACKUPS) {
      const toRemove = backupKeys.slice(0, backupKeys.length - MAX_BACKUPS);
      await AsyncStorage.multiRemove(toRemove);
    }
    await AsyncStorage.setItem(BACKUP_KEYS.TIMESTAMP, String(timestamp));
  } catch (e) {
    console.warn('[backup] autoBackupChats failed:', e);
  }
};

const ensureBackupDir = async (): Promise<string> => {
  const info = await FileSystem.getInfoAsync(FILE_BACKUP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(FILE_BACKUP_DIR, { intermediates: true });
  }
  return FILE_BACKUP_DIR;
};

/** 创建完整备份（AsyncStorage 兜底 + FileSystem 文件主存，全部字段） */
export const createFullBackup = async (data: {
  settings?: AppSettings;
  chats: Chat[];
  providers?: AIProvider[];
  worldBooks?: WorldBook[];
  characters?: Character[];
  fancyWorks?: FancyWork[];
  presets?: Preset[];
}): Promise<void> => {
  if (!data.chats || data.chats.length === 0) return;
  const timestamp = Date.now();
  const backup: FullBackup = { version: 1, backupTime: timestamp, ...data };
  const json = JSON.stringify(backup);

  // 1) FileSystem 主存 — 包含完整字段
  try {
    const dir = await ensureBackupDir();
    const filePath = `${dir}backup_full_${timestamp}.json`;
    await writeAtomicFile(filePath, json);
    // 清理旧文件（按前缀区分：full / chats 独立，上限各一份容量池）
    try {
      const files = await FileSystem.readDirectoryAsync(dir);
      const fullFiles = files.filter((f) => f.startsWith('backup_full_') && f.endsWith('.json')).sort();
      if (fullFiles.length > MAX_FILE_BACKUPS) {
        const toRemove = fullFiles.slice(0, fullFiles.length - MAX_FILE_BACKUPS);
        for (const f of toRemove) {
          await FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true });
        }
      }
      // chats-only 文件（旧版）也在同目录，一并做数量限制
      const chatFiles = files.filter((f) => f.startsWith('backup_') && !f.startsWith('backup_full_') && f.endsWith('.json')).sort();
      if (chatFiles.length > MAX_FILE_BACKUPS) {
        const toRemove = chatFiles.slice(0, chatFiles.length - MAX_FILE_BACKUPS);
        for (const f of toRemove) {
          await FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true });
        }
      }
    } catch {}
  } catch (e) {
    console.warn('[backup] createFullBackup (file) failed:', e);
  }

  // 2) AsyncStorage 兜底（仅当 JSON 不太大时，避免 6MB 报错）
  try {
    if (json.length < 5 * 1024 * 1024) {
      const key = `${BACKUP_KEYS.FULL_PREFIX}${timestamp}`;
      await AsyncStorage.setItem(key, json);
      const allKeys = await AsyncStorage.getAllKeys();
      const fullBackupKeys = (allKeys || [])
        .filter((k) => k.startsWith(BACKUP_KEYS.FULL_PREFIX))
        .sort();
      if (fullBackupKeys.length > MAX_BACKUPS) {
        const toRemove = fullBackupKeys.slice(0, fullBackupKeys.length - MAX_BACKUPS);
        await AsyncStorage.multiRemove(toRemove);
      }
    }
  } catch (e) {
    console.warn('[backup] createFullBackup (AsyncStorage) failed:', e);
  }
};

/** AsyncStorage: chats-only 备份列表 */
export const getChatsBackups = async (): Promise<{ timestamp: number; chatCount: number }[]> => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const backupKeys = (allKeys || [])
      .filter((k) => k.startsWith(BACKUP_KEYS.CHATS_PREFIX))
      .sort()
      .reverse();
    const result: { timestamp: number; chatCount: number }[] = [];
    for (const key of backupKeys) {
      const ts = parseInt(key.replace(BACKUP_KEYS.CHATS_PREFIX, ''), 10);
      const data = await AsyncStorage.getItem(key);
      const chats = data ? JSON.parse(data) : [];
      result.push({ timestamp: ts, chatCount: Array.isArray(chats) ? chats.length : 0 });
    }
    return result;
  } catch {
    return [];
  }
};

/** FileSystem: 完整备份列表（最新在前） */
const getFileFullBackups = async (): Promise<({ timestamp: number; chatCount: number; source: 'file'; fileName: string; size: number })[]> => {
  try {
    const info = await FileSystem.getInfoAsync(FILE_BACKUP_DIR);
    if (!info.exists) return [];
    const files = await FileSystem.readDirectoryAsync(FILE_BACKUP_DIR);
    const fullFiles = files
      .filter((f) => f.startsWith('backup_full_') && f.endsWith('.json'))
      .sort()
      .reverse();
    const out: any[] = [];
    for (const f of fullFiles) {
      const ts = parseInt(f.replace('backup_full_', '').replace('.json', ''), 10);
      try {
        const stat = await FileSystem.getInfoAsync(`${FILE_BACKUP_DIR}${f}`);
        const content = await FileSystem.readAsStringAsync(`${FILE_BACKUP_DIR}${f}`);
        const parsed = JSON.parse(content);
        out.push({
          timestamp: ts,
          chatCount: parsed.chats?.length || 0,
          source: 'file' as const,
          fileName: f,
          size: (stat as any)?.size || content.length,
        });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
};

/** AsyncStorage: 完整备份列表 */
const getAsyncStorageFullBackups = async (): Promise<({ timestamp: number; chatCount: number; source: 'asyncstorage' })[]> => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const backupKeys = (allKeys || [])
      .filter((k) => k.startsWith(BACKUP_KEYS.FULL_PREFIX))
      .sort()
      .reverse();
    const out: any[] = [];
    for (const key of backupKeys) {
      const ts = parseInt(key.replace(BACKUP_KEYS.FULL_PREFIX, ''), 10);
      const data = await AsyncStorage.getItem(key);
      const backup: FullBackup = data ? JSON.parse(data) : null;
      if (backup) {
        out.push({
          timestamp: ts,
          chatCount: backup.chats?.length || 0,
          source: 'asyncstorage' as const,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
};

/** 合并双来源完整备份列表（按时间倒序、1 秒时间窗内 file 覆盖 asyncstorage） */
export const getFullBackups = async (): Promise<{ timestamp: number; chatCount: number; source?: 'file' | 'asyncstorage'; fileName?: string; size?: number }[]> => {
  const [fileBackups, asyncBackups] = await Promise.all([getFileFullBackups(), getAsyncStorageFullBackups()]);
  const merged: any[] = [...fileBackups];
  for (const a of asyncBackups) {
    if (!fileBackups.some((f) => Math.abs(f.timestamp - a.timestamp) < 2000)) {
      merged.push(a);
    }
  }
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged;
};

/** 从 AsyncStorage chats-only 备份恢复对话 */
export const restoreChatsFromBackup = async (timestamp: number): Promise<Chat[] | null> => {
  try {
    const data = await AsyncStorage.getItem(`${BACKUP_KEYS.CHATS_PREFIX}${timestamp}`);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return null;
    return normalizeChatMessages(parsed);
  } catch {
    return null;
  }
};

/** 从 FileSystem 完整备份恢复 */
const restoreFullFromFile = async (fileName: string): Promise<FullBackup | null> => {
  try {
    const content = await FileSystem.readAsStringAsync(`${FILE_BACKUP_DIR}${fileName}`);
    const parsed = JSON.parse(content) as FullBackup;
    if (!parsed.chats || !Array.isArray(parsed.chats)) return null;
    parsed.chats = normalizeChatMessages(parsed.chats);
    return parsed;
  } catch {
    return null;
  }
};

/** 从 AsyncStorage 完整备份恢复 */
const restoreFullFromAsyncStorage = async (timestamp: number): Promise<FullBackup | null> => {
  try {
    const data = await AsyncStorage.getItem(`${BACKUP_KEYS.FULL_PREFIX}${timestamp}`);
    if (!data) return null;
    const parsed = JSON.parse(data) as FullBackup;
    if (!parsed.chats || !Array.isArray(parsed.chats)) return null;
    parsed.chats = normalizeChatMessages(parsed.chats);
    return parsed;
  } catch {
    return null;
  }
};

/** 从完整备份恢复（自动选择来源：优先 file） */
export const restoreFullFromBackup = async (timestamp: number): Promise<FullBackup | null> => {
  try {
    const dir = await ensureBackupDir();
    const files = await FileSystem.readDirectoryAsync(dir);
    const matchedFile = files
      .filter((f) => f.startsWith('backup_full_') && f.endsWith('.json'))
      .find((f) => {
        const ts = parseInt(f.replace('backup_full_', '').replace('.json', ''), 10);
        return Math.abs(ts - timestamp) < 1500;
      });
    if (matchedFile) {
      const r = await restoreFullFromFile(matchedFile);
      if (r) return r;
    }
    return await restoreFullFromAsyncStorage(timestamp);
  } catch {
    return await restoreFullFromAsyncStorage(timestamp);
  }
};

/** 检测是否有可恢复的备份（chats 空时调用），返回完整备份优先结果 */
export const checkAvailableBackup = async (): Promise<{ hasBackup: boolean; latestTimestamp: number; chatCount: number }> => {
  try {
    const fileBackups = await getFileFullBackups();
    if (fileBackups.length > 0) {
      return {
        hasBackup: true,
        latestTimestamp: fileBackups[0].timestamp,
        chatCount: fileBackups[0].chatCount,
      };
    }
    const allKeys = await AsyncStorage.getAllKeys();
    const fullKeys = (allKeys || [])
      .filter((k) => k.startsWith(BACKUP_KEYS.FULL_PREFIX))
      .sort()
      .reverse();
    if (fullKeys.length > 0) {
      const ts = parseInt(fullKeys[0].replace(BACKUP_KEYS.FULL_PREFIX, ''), 10);
      const data = await AsyncStorage.getItem(fullKeys[0]);
      const backup: FullBackup = data ? JSON.parse(data) : null;
      return { hasBackup: true, latestTimestamp: ts, chatCount: backup?.chats?.length || 0 };
    }
    const chatKeys = (allKeys || [])
      .filter((k) => k.startsWith(BACKUP_KEYS.CHATS_PREFIX))
      .sort()
      .reverse();
    if (chatKeys.length === 0) return { hasBackup: false, latestTimestamp: 0, chatCount: 0 };
    const ts = parseInt(chatKeys[0].replace(BACKUP_KEYS.CHATS_PREFIX, ''), 10);
    const data = await AsyncStorage.getItem(chatKeys[0]);
    const chats = data ? JSON.parse(data) : [];
    return {
      hasBackup: true,
      latestTimestamp: ts,
      chatCount: Array.isArray(chats) ? chats.length : 0,
    };
  } catch {
    return { hasBackup: false, latestTimestamp: 0, chatCount: 0 };
  }
};

/** 文件系统 chats-only 备份（旧接口，兼容 importAllData 调用）*/
export const createFileBackup = async (data: {
  settings?: any;
  chats: Chat[];
  providers?: any[];
  worldBooks?: any[];
  characters?: any[];
  fancyWorks?: any[];
  presets?: any[];
}): Promise<string | null> => {
  if (!data.chats || data.chats.length === 0) return null;
  try {
    const dir = await ensureBackupDir();
    const timestamp = Date.now();
    // chats-only 旧接口，也写完整字段到 backup_full_ 下，供启动恢复/UI 使用
    const fullBackup: FullBackup = { version: 1, backupTime: timestamp, ...data };
    const json = JSON.stringify(fullBackup);
    const fullPath = `${dir}backup_full_${timestamp}.json`;
    await writeAtomicFile(fullPath, json);
    // 兼容旧文件名（同步再写一份 chats-only）
    const legacyPath = `${dir}backup_${timestamp}.json`;
    try { await writeAtomicFile(legacyPath, json); } catch {}
    // 清理数量
    try {
      const files = await FileSystem.readDirectoryAsync(dir);
      const fullFiles = files.filter((f) => f.startsWith('backup_full_') && f.endsWith('.json')).sort();
      if (fullFiles.length > MAX_FILE_BACKUPS) {
        const toRemove = fullFiles.slice(0, fullFiles.length - MAX_FILE_BACKUPS);
        for (const f of toRemove) await FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true });
      }
      const chatFiles = files.filter((f) => f.startsWith('backup_') && !f.startsWith('backup_full_') && f.endsWith('.json')).sort();
      if (chatFiles.length > MAX_FILE_BACKUPS) {
        const toRemove = chatFiles.slice(0, chatFiles.length - MAX_FILE_BACKUPS);
        for (const f of toRemove) await FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true });
      }
    } catch {}
    return fullPath;
  } catch (e) {
    console.warn('[backup] createFileBackup failed:', e);
    return null;
  }
};

/** 文件系统备份列表（chats-only 旧接口，最新在前，同时也包含 full） */
export const getFileBackups = async (): Promise<{ timestamp: number; fileName: string; chatCount: number }[]> => {
  try {
    const info = await FileSystem.getInfoAsync(FILE_BACKUP_DIR);
    if (!info.exists) return [];
    const files = await FileSystem.readDirectoryAsync(FILE_BACKUP_DIR);
    const backupFiles = files
      .filter((f) => (f.startsWith('backup_') && f.endsWith('.json')) && !f.endsWith('.tmp'))
      .map((f) => {
        const tsStr = f.startsWith('backup_full_')
          ? f.replace('backup_full_', '').replace('.json', '')
          : f.replace('backup_', '').replace('.json', '');
        const ts = parseInt(tsStr, 10);
        return { f, ts };
      })
      .filter((x) => !Number.isNaN(x.ts))
      .sort((a, b) => b.ts - a.ts);
    const result: { timestamp: number; fileName: string; chatCount: number }[] = [];
    for (const { f, ts } of backupFiles) {
      try {
        const content = await FileSystem.readAsStringAsync(`${FILE_BACKUP_DIR}${f}`);
        const parsed = JSON.parse(content);
        result.push({ timestamp: ts, fileName: f, chatCount: parsed.chats?.length || 0 });
      } catch {}
    }
    return result;
  } catch {
    return [];
  }
};

/** 从文件系统备份恢复（chats-only / full 兼容；返回 FullBackup 完整字段） */
export const restoreFromFileBackup = async (fileName: string): Promise<FullBackup | null> => {
  try {
    const filePath = `${FILE_BACKUP_DIR}${fileName}`;
    const content = await FileSystem.readAsStringAsync(filePath);
    const parsed = JSON.parse(content) as FullBackup;
    if (!parsed.chats || !Array.isArray(parsed.chats)) return null;
    parsed.chats = normalizeChatMessages(parsed.chats);
    return parsed;
  } catch (e) {
    console.warn('[backup] restoreFromFileBackup failed:', e);
    return null;
  }
};

// ===== Task 6: 云同步分层过滤 =====

export type CloudSnapshot = {
  version?: number;
  exportTime?: number;
  settings?: any;
  chats?: any[];
  providers?: any[];
  worldBooks?: any[];
  characters?: any[];
  fancyWorks?: any[];
  presets?: any[];
  userLogs?: any[];
  communityResources?: any[];
  _meta?: any;
  [k: string]: any;
};

export type FilterCloudOpts = {
  communityResourceIds?: string[];
  communityResourceMap?: Map<string, { source: string; userModified?: boolean }>;
};

export function filterCloudSnapshot(snap: CloudSnapshot, opts: FilterCloudOpts = {}): CloudSnapshot {
  const blockedIds = new Set<string>(opts.communityResourceIds ?? []);
  const crMap = opts.communityResourceMap ?? new Map();
  const derivedAllowed = new Set<string>();
  crMap.forEach((info, rid) => {
    if (info.userModified === true) derivedAllowed.add(rid);
  });
  const strictlyBlocked = new Set<string>();
  blockedIds.forEach((rid) => {
    if (!derivedAllowed.has(rid)) strictlyBlocked.add(rid);
  });
  const skippedCount = strictlyBlocked.size;
  if (skippedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(`[cloud-sync] 跳过 ${skippedCount} 条社区副本`);
  }
  const pickById = <T extends { id?: string }>(arr?: T[]): T[] =>
    (arr ?? []).filter((x) => !strictlyBlocked.has(String(x.id ?? '')));

  const stripped: CloudSnapshot = {
    ...snap,
    characters: pickById(snap.characters),
    worldBooks: pickById(snap.worldBooks),
  };
  delete stripped.userLogs;
  delete stripped.communityResources;

  if (stripped.settings && typeof stripped.settings === 'object') {
    const s: any = { ...stripped.settings };
    delete s.token;
    delete s.serverUrl;
    delete s.session;
    delete s.password;
    delete s.communityToken;
    delete s.SESSION_KEY;
    if (Array.isArray(s.regexRules)) {
      s.regexRules = pickById(s.regexRules);
    }
    if (Array.isArray(s.cssEntries)) {
      s.cssEntries = pickById(s.cssEntries);
    }
    stripped.settings = s;
  }
  if ((stripped as any).userProfile && typeof (stripped as any).userProfile === 'object') {
    const up: any = { ...(stripped as any).userProfile };
    delete up.token;
    delete up.password;
    delete up.serverUrl;
    delete up.session;
    (stripped as any).userProfile = up;
  }
  stripped._meta = {
    ...(stripped._meta && typeof stripped._meta === 'object' ? stripped._meta : {}),
    skippedCommunityResourceCount: skippedCount,
    cloudFiltered: true,
    cloudFilterTime: Date.now(),
  };
  return stripped;
}

export const backupService = {
  autoBackupChats,
  createFullBackup,
  getChatsBackups,
  getFullBackups,
  restoreChatsFromBackup,
  restoreFullFromBackup,
  checkAvailableBackup,
  createFileBackup,
  getFileBackups,
  restoreFromFileBackup,
  filterCloudSnapshot,
};
