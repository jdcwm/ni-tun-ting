import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, Alert, KeyboardAvoidingView, useWindowDimensions,
  Modal, FlatList, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { EraEngine, EraOutputLine, EraButton } from '../services/eraEngine';
import { extractArchiveToDir, detectArchiveFormat } from '../utils/zipUtils';

// ============================================================
// Constants
// ============================================================
const GAMES_ROOT = 'era_games';
const GAMES_JSON = '_games.json';
const SETTINGS_KEY = 'era_display_settings';
const POLL_INTERVAL = 200;

const ERA_BG = '#1a1a1a';
const ERA_TEXT = '#c0c0c0';
const ERA_SELECTED = '#ffff00';
const MONO_FONT = Platform.select<string>({
  ios: 'Menlo',
  android: 'monospace',
  web: 'monospace',
  default: 'monospace',
});

// ============================================================
// Interfaces
// ============================================================
interface DisplaySettings {
  fontSize: number;
  zoom: number;
  forceLandscape: boolean;
}

interface EraGameMeta {
  id: string;
  name: string;
  title: string;
  version: string;
  folderName: string;
  sizeBytes: number;
  addedAt: number;
  lastPlayedAt?: number;
}

type Phase = 'library' | 'importing' | 'loading_game' | 'running' | 'error';

type RenderLine = EraOutputLine & { type?: string };
type RenderButton = EraButton & { color?: unknown; selected?: boolean };

interface EraGameScreenProps {
  navigation: {
    goBack: () => void;
  };
}

interface ImportProgress {
  fileName: string;
  percent: number;
  step: string;
}

// ============================================================
// Helpers
// ============================================================
const DEFAULT_SETTINGS: DisplaySettings = {
  fontSize: 15,
  zoom: 100,
  forceLandscape: false,
};

function toHexByte(n: unknown): string {
  const v = typeof n === 'number' ? Math.max(0, Math.min(255, Math.round(n))) : 0;
  return v.toString(16).padStart(2, '0');
}

function normalizeColor(c: unknown, fallback: string): string {
  if (c == null) return fallback;
  if (typeof c === 'number') {
    return `#${toHexByte((c >> 16) & 255)}${toHexByte((c >> 8) & 255)}${toHexByte(c & 255)}`;
  }
  if (typeof c === 'string') {
    const s = c.trim();
    if (!s) return fallback;
    return s.startsWith('#') || s.startsWith('rgb') ? s : `#${s}`;
  }
  if (Array.isArray(c) && c.length >= 3) {
    return `#${toHexByte(c[0])}${toHexByte(c[1])}${toHexByte(c[2])}`;
  }
  return fallback;
}

function collectCurrentButtons(lines: EraOutputLine[]): RenderButton[] {
  const out: RenderButton[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] as RenderLine;
    if (line.buttons && line.buttons.length > 0) {
      out.unshift(...(line.buttons as RenderButton[]));
    } else {
      break;
    }
  }
  return out;
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 64) || `game_${Date.now()}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ============================================================
// Component
// ============================================================
export const EraGameScreen: React.FC<EraGameScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const accent = theme.accentColor;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Refs
  const engineRef = useRef<EraEngine | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const contentHeightRef = useRef(0);
  const currentMetaRef = useRef<EraGameMeta | null>(null);

  // Core state
  const [phase, setPhase] = useState<Phase>('library');
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<EraGameMeta[]>([]);
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);

  // Running state
  const [currentMeta, setCurrentMeta] = useState<EraGameMeta | null>(null);
  /** 进入游戏的观感进度（0~1） */
  const [loadProgress, setLoadProgress] = useState(0);

  // 加载中：进度条缓慢爬升到 90%，加载完成后再补满（引擎没提供真实进度回调）
  useEffect(() => {
    if (phase !== 'loading_game') {
      if (phase === 'running') {
        setLoadProgress(1);
        const t = setTimeout(() => setLoadProgress(0), 400);
        return () => clearTimeout(t);
      }
      setLoadProgress(0);
      return;
    }
    setLoadProgress(0.06);
    const timer = setInterval(() => {
      setLoadProgress((p) => (p >= 0.9 ? 0.9 : Math.min(0.9, p + Math.max(0.012, (0.9 - p) * 0.18))));
    }, 180);
    return () => clearInterval(timer);
  }, [phase]);
  const [lines, setLines] = useState<EraOutputLine[]>([]);
  const [waitingInput, setWaitingInput] = useState(false);
  const [waitingKey, setWaitingKey] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [gameTitle, setGameTitle] = useState('ERA');

  // Paths
  const docDir = (FileSystem as any).documentDirectory as string | undefined;
  const gamesRoot = useMemo(() => docDir ? `${docDir}${GAMES_ROOT}/` : null, [docDir]);

  // Settings persistence
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setDisplay({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const saveDisplay = useCallback(async (next: DisplaySettings) => {
    setDisplay(next);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  // Games JSON load / save
  const loadGamesList = useCallback(async (): Promise<EraGameMeta[]> => {
    if (!gamesRoot) return [];
    try {
      const path = `${gamesRoot}${GAMES_JSON}`;
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) return [];
      const raw = await FileSystem.readAsStringAsync(path);
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [gamesRoot]);

  const saveGamesList = useCallback(async (list: EraGameMeta[]) => {
    if (!gamesRoot) return;
    try {
      await FileSystem.makeDirectoryAsync(gamesRoot, { intermediates: true });
      await FileSystem.writeAsStringAsync(`${gamesRoot}${GAMES_JSON}`, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }, [gamesRoot]);

  const refreshGames = useCallback(async () => {
    const list = await loadGamesList();
    setGames(list);
  }, [loadGamesList]);

  // On mount: ensure games root exists and load list
  useEffect(() => {
    (async () => {
      if (!gamesRoot) return;
      try {
        await FileSystem.makeDirectoryAsync(gamesRoot, { intermediates: true });
      } catch {
        /* ignore */
      }
      await refreshGames();
    })();
  }, [gamesRoot, refreshGames]);

  // Recursive directory size
  const computeDirSize = useCallback(async (dir: string): Promise<number> => {
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) return 0;
      if (!info.isDirectory) {
        return (info as any).size || 0;
      }
      let total = 0;
      const entries = await FileSystem.readDirectoryAsync(dir);
      for (const name of entries) {
        const sub = dir.endsWith('/') ? `${dir}${encodeURIComponent(name)}` : `${dir}/${encodeURIComponent(name)}`;
        total += await computeDirSize(sub);
      }
      return total;
    } catch {
      return 0;
    }
  }, []);

  // Read GameBase.csv
  const parseGameBase = useCallback(async (gameRoot: string): Promise<{ title: string; version: string }> => {
    const candidates = [
      `${gameRoot}CSV/GameBase.csv`,
      `${gameRoot}/CSV/GameBase.csv`,
      `${gameRoot}GameBase.csv`,
      `${gameRoot}/GameBase.csv`,
    ];
    for (const p of candidates) {
      try {
        const info = await FileSystem.getInfoAsync(p);
        if (!info.exists) continue;
        const raw = await FileSystem.readAsStringAsync(p, { encoding: 'utf8' });
        const rawLines = raw.split(/\r?\n/);
        let title = '';
        let version = '';
        for (const ln of rawLines) {
          const trimmed = ln.trim();
          if (!trimmed || trimmed.startsWith(';')) continue;
          const parts = parseCsvLine(trimmed);
          if (parts.length < 2) continue;
          const key = parts[0].trim().toUpperCase();
          const val = parts[1].trim().replace(/^"(.*)"$/, '$1');
          if (key === 'TITLE' || key === 'タイトル') title = val || title;
          else if (key === 'VERSION' || key === 'バージョン') version = val || version;
        }
        if (title || version) return { title, version };
      } catch {
        /* try next */
      }
    }
    return { title: '', version: '' };
  }, []);

  // Check ERA game root (has ERB + CSV)
  const isEraGameRoot = useCallback(async (dir: string): Promise<boolean> => {
    try {
      const entries = await FileSystem.readDirectoryAsync(dir);
      const lower = new Set(entries.map(e => e.toLowerCase()));
      return lower.has('erb') && lower.has('csv');
    } catch {
      return false;
    }
  }, []);

  // Import zip flow
  const handleImportZip = useCallback(async () => {
    if (!gamesRoot) {
      Alert.alert('错误', '无法访问文件系统目录');
      return;
    }

    let pickResult: any;
    try {
      pickResult = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        // 放宽到 */*：不同机型/文件管理器给的 MIME 五花八门，
        // 只按扩展名或 MIME 过滤会把 .tar.gz / .tgz / .gz 挡在外面。
        // 真正的格式判断在解压时按魔数做（detectArchiveFormat）。
        type: '*/*',
        multiple: false,
      });
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || String(e));
      return;
    }

    if (!pickResult || pickResult.canceled || pickResult.type === 'cancel') {
      return;
    }

    const file = pickResult.assets ? pickResult.assets[0] : pickResult.output
      ? pickResult.output[0]
      : pickResult;
    const uri = file?.uri;
    const originalName = file?.name || `import_${Date.now()}`;

    if (!uri) {
      Alert.alert('导入失败', '未能获取文件路径');
      return;
    }

    const now = Date.now();
    const tempRoot = `${gamesRoot}_temp/${now}/`;

    try {
      setPhase('importing');
      setImportProgress({
        fileName: originalName,
        percent: 0,
        step: '读取压缩包...',
      });

      // Copy to internal cache first, then read in 4MB chunks to avoid OOM
      const cachePath = `${(FileSystem as any).cacheDirectory}era_import_${now}.zip`;
      try {
        await FileSystem.copyAsync({ from: uri, to: cachePath });
      } catch (copyErr) {
        // content:// URI may already be readable, fall back to original
      }
      const readablePath = cachePath;

      let fileSize = 0;
      try {
        const info: any = await FileSystem.getInfoAsync(readablePath);
        fileSize = info?.size || 0;
      } catch {}

      setImportProgress({
        fileName: originalName,
        percent: 5,
        step: '解码数据...',
      });

      const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB per chunk
      const parts: Uint8Array[] = [];
      let totalRead = 0;
      const EncType = (FileSystem as any).EncodingType;
      const enc = EncType?.Base64 || 'base64';
      while (true) {
        const remaining = fileSize > 0 ? fileSize - totalRead : CHUNK_SIZE;
        if (fileSize > 0 && remaining <= 0) break;
        const len = fileSize > 0 ? Math.min(CHUNK_SIZE, remaining) : CHUNK_SIZE;
        const b64Chunk = await FileSystem.readAsStringAsync(readablePath, {
          encoding: enc,
          position: totalRead,
          length: len,
        } as any);
        const chunkBytes = base64ToUint8(b64Chunk);
        parts.push(chunkBytes);
        totalRead += chunkBytes.length;
        if (fileSize > 0 && totalRead >= fileSize) break;
        if (chunkBytes.length < len) break;
        setImportProgress({
          fileName: originalName,
          percent: 5 + Math.floor((totalRead / Math.max(fileSize, 1)) * 5),
          step: '读取数据中...',
        });
      }

      let totalLen = 0;
      for (const p of parts) totalLen += p.length;
      const buffer = new Uint8Array(totalLen);
      let offset = 0;
      for (const p of parts) {
        buffer.set(p, offset);
        offset += p.length;
      }

      FileSystem.deleteAsync(cachePath, { idempotent: true }).catch(() => {});

      setImportProgress({
        fileName: originalName,
        percent: 10,
        step: '解压文件中...',
      });

      const extractionResult = await extractArchiveToDir(
        buffer,
        tempRoot,
        (done, total, fileName) => {
          const pct = 10 + Math.floor((done / Math.max(total, 1)) * 70);
          setImportProgress({
            fileName: originalName,
            percent: pct,
            step: `解压: ${fileName}`,
          });
        },
        originalName,
      );

      setImportProgress({
        fileName: originalName,
        percent: 82,
        step: '识别游戏目录结构...',
      });

      const topDirs = extractionResult.topLevelDirs;
      let gameSourceRoot = tempRoot;
      let folderNameForMeta = originalName.replace(/\.zip$/i, '');

      if (topDirs.length === 1) {
        const candidate = `${tempRoot}${encodeURIComponent(topDirs[0])}/`;
        const isEra = await isEraGameRoot(candidate);
        if (isEra) {
          gameSourceRoot = candidate;
          folderNameForMeta = topDirs[0];
        } else {
          try {
            const subEntries = await FileSystem.readDirectoryAsync(candidate);
            let found = false;
            for (const sub of subEntries) {
              const subPath = `${candidate}${encodeURIComponent(sub)}/`;
              if (await isEraGameRoot(subPath)) {
                gameSourceRoot = subPath;
                folderNameForMeta = sub;
                found = true;
                break;
              }
            }
            if (!found) {
              gameSourceRoot = candidate;
              folderNameForMeta = topDirs[0];
            }
          } catch {
            gameSourceRoot = candidate;
            folderNameForMeta = topDirs[0];
          }
        }
      } else {
        const atRoot = await isEraGameRoot(tempRoot);
        if (!atRoot) {
          for (const td of topDirs) {
            const cand = `${tempRoot}${encodeURIComponent(td)}/`;
            if (await isEraGameRoot(cand)) {
              gameSourceRoot = cand;
              folderNameForMeta = td;
              break;
            }
          }
        }
      }

      setImportProgress({
        fileName: originalName,
        percent: 86,
        step: '读取游戏元数据...',
      });

      const { title, version } = await parseGameBase(gameSourceRoot);

      setImportProgress({
        fileName: originalName,
        percent: 90,
        step: '复制到游戏库...',
      });

      const sanitized = sanitizeFolderName(folderNameForMeta);
      const existing = await loadGamesList();
      const usedNames = new Set(existing.map(g => g.folderName));
      let finalFolderName = sanitized;
      let counter = 2;
      while (usedNames.has(finalFolderName)) {
        finalFolderName = `${sanitized}_${counter}`;
        counter++;
      }
      const finalDest = `${gamesRoot}${finalFolderName}/`;

      await FileSystem.makeDirectoryAsync(finalDest, { intermediates: true });
      const sourceEntries = await FileSystem.readDirectoryAsync(gameSourceRoot);
      for (const entryName of sourceEntries) {
        const encName = encodeURIComponent(entryName);
        const src = gameSourceRoot.endsWith('/')
          ? `${gameSourceRoot}${encName}`
          : `${gameSourceRoot}/${encName}`;
        const dst = `${finalDest}${encName}`;
        try {
          await (FileSystem as any).copyAsync({ from: src, to: dst });
        } catch {
          /* ignore */
        }
      }

      setImportProgress({
        fileName: originalName,
        percent: 96,
        step: '计算大小并保存列表...',
      });

      const sizeBytes = await computeDirSize(finalDest);

      const id = `game_${now}_${Math.floor(Math.random() * 1000000)}`;
      const meta: EraGameMeta = {
        id,
        name: title || folderNameForMeta,
        title: title || folderNameForMeta,
        version: version || '1.0',
        folderName: finalFolderName,
        sizeBytes,
        addedAt: now,
      };

      const newList = [...existing, meta];
      await saveGamesList(newList);

      setImportProgress({
        fileName: originalName,
        percent: 100,
        step: '完成！',
      });

      try {
        await FileSystem.deleteAsync(`${gamesRoot}_temp/`, { idempotent: true });
      } catch {
        /* ignore */
      }

      await refreshGames();
      setPhase('library');
      setImportProgress(null);
    } catch (e: any) {
      try {
        await FileSystem.deleteAsync(`${gamesRoot}_temp/`, { idempotent: true });
      } catch {
        /* ignore */
      }
      setImportProgress(null);
      setPhase('library');
      Alert.alert('导入失败', e?.message || String(e));
    }
  }, [
    gamesRoot,
    isEraGameRoot,
    parseGameBase,
    loadGamesList,
    saveGamesList,
    computeDirSize,
    refreshGames,
  ]);

  // Delete game
  const handleDeleteGame = useCallback((meta: EraGameMeta) => {
    Alert.alert(
      '确认删除',
      `确定要删除《${meta.name}》吗？所有游戏文件和存档将被永久删除。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            if (!gamesRoot) return;
            try {
              const folder = `${gamesRoot}${meta.folderName}/`;
              await FileSystem.deleteAsync(folder, { idempotent: true });
              const list = await loadGamesList();
              const next = list.filter(g => g.id !== meta.id);
              await saveGamesList(next);
              await refreshGames();
            } catch (e: any) {
              Alert.alert('删除失败', e?.message || String(e));
            }
          },
        },
      ],
    );
  }, [gamesRoot, loadGamesList, saveGamesList, refreshGames]);

  // Launch game
  const handleLaunchGame = useCallback(async (meta: EraGameMeta) => {
    if (!gamesRoot) return;
    const folder = `${gamesRoot}${meta.folderName}/`;

    setPhase('loading_game');
    setCurrentMeta(meta);
    currentMetaRef.current = meta;
    setError(null);
    setLines([]);
    setWaitingInput(false);
    setWaitingKey(false);
    setInputValue('');

    try {
      try {
        engineRef.current?.dispose();
      } catch {
        /* ignore */
      }
      engineRef.current = null;

      const engine = new EraEngine();
      engineRef.current = engine;
      await engine.loadGame(folder);

      // start() is a blocking main loop: it suspends at every INPUT/ONEINPUT/WAIT until
      // provideInput() resumes it (the button/input handlers below do that). Awaiting it
      // here would deadlock the screen on 'loading_game' forever. Launch it in the
      // background and let the 200ms poller render its output.
      engine.start().catch((err: any) => {
        setError(err?.message || String(err));
        setPhase('error');
      });

      try {
        setGameTitle(engine.getGameTitle() || meta.title || meta.name);
      } catch {
        setGameTitle(meta.title || meta.name);
      }

      try {
        const list = await loadGamesList();
        const idx = list.findIndex(g => g.id === meta.id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], lastPlayedAt: Date.now() };
          await saveGamesList(list);
          setGames(list);
        }
      } catch {
        /* ignore */
      }

      try {
        const next = engine.getOutputLines() || [];
        setLines(next);
        setWaitingInput(engine.isWaitingForInput());
        setWaitingKey(engine.isWaitingForKey());
      } catch {
        /* ignore */
      }

      setPhase('running');
    } catch (e: any) {
      setError(e?.message || String(e));
      setPhase('error');
    }
  }, [gamesRoot, loadGamesList, saveGamesList]);

  // Return to library
  const returnToLibrary = useCallback(() => {
    try {
      engineRef.current?.dispose();
    } catch {
      /* ignore */
    }
    engineRef.current = null;
    currentMetaRef.current = null;
    setCurrentMeta(null);
    setLines([]);
    setWaitingInput(false);
    setWaitingKey(false);
    setInputValue('');
    setPhase('library');
  }, []);

  // Engine cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        engineRef.current?.dispose();
      } catch {
        /* ignore */
      }
      engineRef.current = null;
    };
  }, []);

  // Poll engine output
  const refresh = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const next = engine.getOutputLines() || [];
      const wi = engine.isWaitingForInput();
      const wk = engine.isWaitingForKey();
      setLines(prev => {
        if (prev.length === next.length && prev.length > 0) {
          if (prev[prev.length - 1] === next[next.length - 1]) {
            return prev;
          }
        }
        return next;
      });
      setWaitingInput(wi);
      setWaitingKey(wk);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [phase, refresh]);

  // Auto-scroll
  const onContentSizeChange = useCallback((_w: number, h: number) => {
    if (h > contentHeightRef.current) {
      contentHeightRef.current = h;
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      });
    } else {
      contentHeightRef.current = h;
    }
  }, []);

  // Input handlers
  const handleSendInput = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const raw = inputValue.trim();
    let value: string | number = raw;
    if (raw !== '' && /^-?\d+(\.\d+)?$/.test(raw)) {
      const num = Number(raw);
      if (Number.isFinite(num)) value = num;
    }
    try {
      engine.provideInput(value);
    } catch {
      /* ignore */
    }
    setInputValue('');
    refresh();
  }, [inputValue, refresh]);

  const handleButtonClick = useCallback(
    (btn: RenderButton) => {
      const engine = engineRef.current;
      if (!engine) return;
      try {
        engine.provideInput(btn.value);
      } catch {
        /* ignore */
      }
      refresh();
    },
    [refresh],
  );

  const handleContinue = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.provideInput('');
    } catch {
      /* ignore */
    }
    refresh();
  }, [refresh]);

  const handleRestart = useCallback(() => {
    const meta = currentMetaRef.current;
    if (!meta) return;
    Alert.alert('重新开始', '确定要重新开始游戏吗？当前进度将丢失。', [
      { text: '取消', style: 'cancel' },
      {
        text: '重新开始',
        style: 'destructive',
        onPress: () => {
          handleLaunchGame(meta);
        },
      },
    ]);
  }, [handleLaunchGame]);

  // Render line
  const renderLine = useCallback(
    (rawLine: EraOutputLine, index: number) => {
      const line = rawLine as RenderLine;
      const fontSize = display.fontSize;
      const lineHeight = fontSize * 1.45;

      if (line.type === 'drawline' || line.isLine) {
        const color = normalizeColor(line.color, '#555555');
        return <View key={index} style={[styles.drawline, { backgroundColor: color }]} />;
      }

      const text = line.text ?? '';
      const color = normalizeColor(line.color, ERA_TEXT);
      const bg = normalizeColor(line.bgColor, 'transparent');
      const align = line.alignment || 'left';
      const alignItems =
        align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
      const buttons = line.buttons as RenderButton[] | undefined;

      if (buttons && buttons.length > 0) {
        return (
          <View key={index} style={[styles.lineRow, { backgroundColor: bg, alignItems }]}>
            {text !== '' ? (
              <Text style={[styles.lineText, { color, fontSize, lineHeight }]}>{text}</Text>
            ) : null}
            <View style={styles.buttonWrap}>
              {buttons.map((b, bi) => {
                const bc = normalizeColor(b.color, accent);
                const textColor = b.selected === true ? ERA_SELECTED : bc;
                return (
                  <TouchableOpacity
                    key={bi}
                    style={[styles.optionBtn, { borderColor: bc }]}
                    onPress={() => handleButtonClick(b)}
                  >
                    <Text
                      style={[
                        styles.optionBtnText,
                        { color: textColor, fontSize: fontSize - 1 },
                      ]}
                    >
                      {b.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      }

      if (text === '') {
        return (
          <View
            key={index}
            style={[styles.blankLine, { backgroundColor: bg, height: lineHeight }]}
          />
        );
      }

      return (
        <View key={index} style={[styles.lineRow, { backgroundColor: bg, alignItems }]}>
          <Text style={[styles.lineText, { color, fontSize, lineHeight }]}>{text}</Text>
        </View>
      );
    },
    [handleButtonClick, accent, display.fontSize],
  );

  // Render input area
  const renderInputArea = () => {
    const bottomPad = insets.bottom + 8;
    const fontSize = display.fontSize;

    if (waitingKey) {
      return (
        <View style={[styles.inputArea, { paddingBottom: bottomPad }]}>
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: accent }]}
            onPress={handleContinue}
          >
            <Text style={[styles.continueBtnText, { fontSize: fontSize + 1 }]}>
              点击继续
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (waitingInput) {
      const buttons = collectCurrentButtons(lines);
      return (
        <View style={[styles.inputArea, { paddingBottom: bottomPad }]}>
          {buttons.length > 0 && (
            <ScrollView
              style={[styles.buttonScroller, { maxHeight: windowHeight * 0.3 }]}
              contentContainerStyle={styles.buttonWrap}
              keyboardShouldPersistTaps="handled"
              alwaysBounceVertical={false}
            >
              {buttons.map((b, i) => {
                const bc = normalizeColor(b.color, accent);
                const textColor = b.selected === true ? ERA_SELECTED : bc;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.optionBtn, { borderColor: bc }]}
                    onPress={() => handleButtonClick(b)}
                  >
                    <Text
                      style={[
                        styles.optionBtnText,
                        { color: textColor, fontSize: fontSize - 1 },
                      ]}
                    >
                      {b.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.textInput, { fontSize }]}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="输入数字或文字"
              placeholderTextColor="#666666"
              returnKeyType="done"
              onSubmitEditing={handleSendInput}
              selectTextOnFocus
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: accent }]}
              onPress={handleSendInput}
            >
              <Text style={[styles.sendBtnText, { fontSize }]}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.inputArea, { paddingBottom: bottomPad }]}>
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color={accent} />
          <Text style={[styles.processingText, { fontSize }]}>处理中...</Text>
        </View>
      </View>
    );
  };

  // Settings Modal
  const renderSettingsModal = () => (
    <Modal
      visible={showSettings}
      transparent
      animationType="slide"
      onRequestClose={() => setShowSettings(false)}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={() => setShowSettings(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[
            styles.settingsPanel,
            {
              paddingBottom: insets.bottom + 20,
              backgroundColor: theme.backgroundColor || '#222222',
            },
          ]}
          onPress={e => e.stopPropagation()}
        >
          <View style={styles.settingsHeader}>
            <Text style={[styles.settingsTitle, { color: ERA_TEXT }]}>显示设置</Text>
            <TouchableOpacity
              onPress={() => setShowSettings(false)}
              style={styles.settingsCloseBtn}
            >
              <Ionicons name="close" size={24} color={ERA_TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsScroll}>

            <View style={styles.settingRow}>
              <View style={styles.settingLabelRow}>
                <Text style={[styles.settingLabel, { color: ERA_TEXT }]}>横屏显示</Text>
                <Switch
                  value={display.forceLandscape}
                  onValueChange={v => saveDisplay({ ...display, forceLandscape: v })}
                  trackColor={{ false: '#555', true: accent }}
                  thumbColor={display.forceLandscape ? '#fff' : '#f4f3f4'}
                />
              </View>
              <Text style={styles.settingHint}>
                开启后游戏界面会旋转 90° 模拟横屏显示
              </Text>
            </View>

            <View style={styles.settingsButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.settingsBtn,
                  { borderColor: '#666', borderWidth: 1 },
                ]}
                onPress={() => saveDisplay(DEFAULT_SETTINGS)}
              >
                <Text style={[styles.settingsBtnText, { color: '#bbb' }]}>恢复默认</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.settingsBtn, { backgroundColor: accent }]}
                onPress={() => setShowSettings(false)}
              >
                <Text style={[styles.settingsBtnText, { color: '#fff' }]}>关闭</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // Landscape hint overlay visibility

  // Game Library Card
  const renderGameCard = useCallback(
    ({ item }: { item: EraGameMeta }) => (
      <TouchableOpacity
        style={[
          styles.gameCard,
          {
            backgroundColor: theme.backgroundColor || '#2a2a2a',
            borderLeftColor: accent,
          },
        ]}
        activeOpacity={0.8}
        onPress={() => handleLaunchGame(item)}
      >
        <View style={styles.gameCardHeader}>
          <Text style={[styles.gameCardName, { flex: 1 }]} numberOfLines={1}>
            {item.name || item.folderName}
          </Text>
          {!!item.version && (
            <View style={[styles.versionBadge, { borderColor: accent }]}>
              <Text style={[styles.versionBadgeText, { color: accent }]}>
                v{item.version}
              </Text>
            </View>
          )}
        </View>
        {!!item.title && item.title !== item.name && (
          <Text style={styles.gameCardTitle} numberOfLines={1}>
            {item.title}
          </Text>
        )}
        <View style={styles.gameCardMeta}>
          <Text style={styles.gameCardMetaText}>
            导入：{formatDate(item.addedAt)}
          </Text>
          <Text style={styles.gameCardMetaText}>
            {formatBytes(item.sizeBytes)}
          </Text>
          {!!item.lastPlayedAt && (
            <Text style={styles.gameCardMetaText}>
              上次游玩：{formatDate(item.lastPlayedAt)}
            </Text>
          )}
        </View>
        <View style={styles.gameCardButtons}>
          <TouchableOpacity
            style={[styles.cardBtnPrimary, { backgroundColor: accent }]}
            onPress={() => handleLaunchGame(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="play" size={16} color="#fff" />
            <Text style={styles.cardBtnPrimaryText}>启动</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardBtnDanger}
            onPress={() => handleDeleteGame(item)}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={16} color="#e57373" />
            <Text style={styles.cardBtnDangerText}>删除</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    ),
    [theme.backgroundColor, accent, handleLaunchGame, handleDeleteGame],
  );

  // Render: Library
  const renderLibrary = () => (
    <View style={[styles.container, { backgroundColor: ERA_BG }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: '#000',
          },
        ]}
      >
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={26} color={accent} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          ERA 游戏库
        </Text>
        <TouchableOpacity style={styles.topBtn} onPress={handleImportZip}>
          <Ionicons name="cloud-upload-outline" size={24} color={accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {games.length === 0 ? (
          <View style={styles.centerWrap}>
            <Ionicons name="game-controller-outline" size={72} color="#666666" />
            <Text style={styles.emptyTitle}>暂无游戏</Text>
            <Text style={styles.emptySubtitle}>
              支持 Emuera 引擎的 ERA 游戏 .zip 包，导入后即可游玩
            </Text>
            <TouchableOpacity
              style={[styles.bigImportBtn, { backgroundColor: accent }]}
              onPress={handleImportZip}
              activeOpacity={0.8}
            >
              <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
              <Text style={styles.bigImportBtnText}>导入游戏压缩包</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={games}
            keyExtractor={item => item.id}
            renderItem={renderGameCard}
            contentContainerStyle={[
              styles.gameListContent,
              { paddingBottom: insets.bottom + 24 },
            ]}
          />
        )}
      </View>
    </View>
  );

  // Render: Importing
  const renderImporting = () => (
    <View style={[styles.container, { backgroundColor: ERA_BG }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: '#000',
          },
        ]}
      >
        <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={accent} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          正在导入...
        </Text>
        <View style={styles.topBtn} />
      </View>

      <View style={styles.body}>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={accent} style={{ marginBottom: 20 }} />
          <Text style={styles.importFileName} numberOfLines={1}>
            {importProgress?.fileName || ''}
          </Text>
          <View style={styles.progressBarOuter}>
            <View
              style={[
                styles.progressBarInner,
                {
                  width: `${importProgress?.percent || 0}%`,
                  backgroundColor: accent,
                },
              ]}
            />
          </View>
          <Text style={styles.importPercent}>
            {importProgress?.percent || 0}%
          </Text>
          <Text style={styles.importStep} numberOfLines={2}>
            {importProgress?.step || ''}
          </Text>
        </View>
      </View>
    </View>
  );

  // Render: Loading game
  const renderLoadingGame = () => (
    <View style={[styles.container, { backgroundColor: ERA_BG }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: '#000',
          },
        ]}
      >
        <TouchableOpacity style={styles.topBtn} onPress={returnToLibrary}>
          <Ionicons name="chevron-back" size={26} color={accent} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {currentMeta?.name || '加载游戏...'}
        </Text>
        <View style={styles.topBtn} />
      </View>

      <View style={styles.body}>
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.statusText}>正在加载游戏...</Text>
        </View>
      </View>
      {renderSettingsModal()}
    </View>
  );

  // Render: Running
  const renderRunning = () => {
    const displayTitle =
      gameTitle && gameTitle !== 'ERA'
        ? gameTitle
        : currentMeta?.title || currentMeta?.name || 'ERA';

    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled
      >
        <View style={styles.container}>
          {display.forceLandscape ? (
            <View
              style={{
                flex: 1,
                width: windowHeight,
                height: windowWidth,
                transform: [{ rotate: '-90deg' }],
                transformOrigin: 'center',
                position: 'absolute',
                left: (windowWidth - windowHeight) / 2,
                top: (windowHeight - windowWidth) / 2,
              }}
            >
              {renderGameContent(displayTitle)}
            </View>
          ) : (
            <View style={[styles.container, { backgroundColor: ERA_BG }]}>
              {renderGameContent(displayTitle)}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    );
  };

  const renderGameContent = (displayTitle: string) => (
    <>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: '#000',
          },
        ]}
      >
        <TouchableOpacity style={styles.topBtn} onPress={returnToLibrary}>
          <Ionicons name="chevron-back" size={26} color={accent} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBtn} onPress={returnToLibrary}>
          <Ionicons name="list-outline" size={22} color={accent} />
        </TouchableOpacity>
        <Text
          style={[styles.topTitle, { flex: 1 }]}
          numberOfLines={1}
        >
          {displayTitle}
        </Text>
        <TouchableOpacity
          style={styles.topBtn}
          onPress={handleRestart}
        >
          <Ionicons name="refresh-outline" size={22} color={accent} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.topBtn}
          onPress={() => setShowSettings(true)}
        >
          <Ionicons name="settings-outline" size={22} color={accent} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {phase === 'loading_game' ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.statusText}>正在加载游戏...</Text>
            {/* 加载进度条：引擎没有真实进度回调，这里做「渐进到 90% 再补满」的观感进度 */}
            <View style={styles.loadBarTrack}>
              <View
                style={[
                  styles.loadBarFill,
                  { width: `${Math.round(loadProgress * 100)}%`, backgroundColor: accent },
                ]}
              />
            </View>
            <Text style={styles.loadBarPct}>
              加载中 {Math.round(loadProgress * 100)}%
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollViewRef}
              style={styles.output}
              contentContainerStyle={[
                styles.outputContent,
                {
                  transform: [{ scale: display.zoom / 100 }],
                },
              ]}
              onContentSizeChange={onContentSizeChange}
              keyboardShouldPersistTaps="handled"
            >
              {lines.map(renderLine)}
            </ScrollView>
            {renderInputArea()}
          </>
        )}
      </View>

      {renderSettingsModal()}
    </>
  );

  // Render: Error
  const renderError = () => (
    <View style={[styles.container, { backgroundColor: ERA_BG }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 6,
            borderBottomColor: '#000',
          },
        ]}
      >
        <TouchableOpacity style={styles.topBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={accent} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>出错了</Text>
        <View style={styles.topBtn} />
      </View>

      <View style={styles.body}>
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={56} color="#a03a3a" />
          <Text style={styles.noticeTitle}>操作失败</Text>
          <Text style={styles.errorText}>{error || '未知错误'}</Text>
          <View style={styles.errorBtnRow}>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: accent }]}
              onPress={returnToLibrary}
            >
              <Text style={[styles.retryBtnText, { color: accent }]}>返回游戏库</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: accent, marginLeft: 12 }]}
              onPress={async () => {
                try {
                  await Clipboard.setStringAsync(error || '未知错误');
                  Alert.alert('已复制', '错误信息已复制到剪贴板');
                } catch {
                  Alert.alert('复制失败', '无法访问剪贴板');
                }
              }}
            >
              <Text style={[styles.retryBtnText, { color: accent }]}>复制错误</Text>
            </TouchableOpacity>
            {currentMeta && (
              <TouchableOpacity
                style={[styles.retryBtn, { borderColor: accent, marginLeft: 12 }]}
                onPress={() => handleLaunchGame(currentMeta)}
              >
                <Text style={[styles.retryBtnText, { color: accent }]}>重试</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );

  // Final render switch
  switch (phase) {
    case 'library':
      return renderLibrary();
    case 'importing':
      return renderImporting();
    case 'loading_game':
      return renderLoadingGame();
    case 'running':
      return renderRunning();
    case 'error':
      return renderError();
    default:
      return renderLibrary();
  }
};

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 8,
    backgroundColor: '#111111',
    borderBottomWidth: 1,
  },
  topBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topTitle: {
    marginHorizontal: 8,
    color: ERA_TEXT,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: MONO_FONT,
  },

  // Library
  gameListContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  gameCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  gameCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gameCardName: {
    color: ERA_TEXT,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  versionBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  versionBadgeText: {
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  gameCardTitle: {
    color: '#999',
    fontSize: 13,
    fontFamily: MONO_FONT,
    marginBottom: 6,
  },
  gameCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  gameCardMetaText: {
    color: '#777',
    fontSize: 12,
    fontFamily: MONO_FONT,
    marginRight: 12,
    marginTop: 2,
  },
  gameCardButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  cardBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  cardBtnPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 5,
    fontFamily: MONO_FONT,
  },
  cardBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardBtnDangerText: {
    color: '#e57373',
    fontSize: 14,
    marginLeft: 5,
    fontFamily: MONO_FONT,
  },

  // Empty
  emptyTitle: {
    color: ERA_TEXT,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
    fontFamily: MONO_FONT,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 24,
    marginBottom: 28,
    fontFamily: MONO_FONT,
  },
  bigImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  bigImportBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
    fontFamily: MONO_FONT,
  },

  // Center wrap
  centerWrap: {
    flex: 1,
    backgroundColor: ERA_BG,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  statusText: {
    color: '#888888',
    fontSize: 15,
    marginTop: 12,
    fontFamily: MONO_FONT,
  },
  loadBarTrack: {
    width: '80%',
    maxWidth: 320,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3a3a46',
    borderWidth: 1,
    borderColor: '#52525f',
    marginTop: 20,
    overflow: 'hidden',
  },
  loadBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  loadBarPct: {
    color: '#b9b9c6',
    fontSize: 13,
    marginTop: 8,
    fontFamily: MONO_FONT,
  },
  noticeTitle: {
    color: ERA_TEXT,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
    fontFamily: MONO_FONT,
  },
  errorText: {
    color: '#c98888',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: MONO_FONT,
    lineHeight: 22,
  },
  errorBtnRow: {
    flexDirection: 'row',
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },

  // Import progress
  importFileName: {
    color: ERA_TEXT,
    fontSize: 15,
    fontFamily: MONO_FONT,
    marginBottom: 16,
    textAlign: 'center',
    maxWidth: '90%',
  },
  progressBarOuter: {
    width: '80%',
    height: 10,
    backgroundColor: '#333',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarInner: {
    height: '100%',
    borderRadius: 5,
  },
  importPercent: {
    color: ERA_TEXT,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: MONO_FONT,
    marginBottom: 14,
  },
  importStep: {
    color: '#999',
    fontSize: 13,
    fontFamily: MONO_FONT,
    textAlign: 'center',
    maxWidth: '85%',
  },

  // Output
  output: {
    flex: 1,
    backgroundColor: ERA_BG,
  },
  outputContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 16,
  },
  lineRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  lineText: {
    fontFamily: MONO_FONT,
    color: ERA_TEXT,
  },
  blankLine: {
    width: '100%',
  },
  drawline: {
    width: '100%',
    height: 1,
    marginVertical: 4,
    opacity: 0.6,
  },
  buttonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionBtn: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  optionBtnText: {
    fontFamily: MONO_FONT,
    color: ERA_TEXT,
  },

  // Input area
  inputArea: {
    backgroundColor: '#111111',
    borderTopWidth: 1,
    borderTopColor: '#000',
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  buttonScroller: {
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 6,
    paddingHorizontal: 12,
    color: ERA_TEXT,
    backgroundColor: '#222222',
    fontFamily: MONO_FONT,
  },
  sendBtn: {
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  continueBtn: {
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    gap: 8,
  },
  processingText: {
    color: '#888888',
    fontFamily: MONO_FONT,
  },

  // Settings Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  settingsPanel: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    maxHeight: '70%',
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },
  settingsCloseBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  settingsScroll: {
    maxHeight: 500,
  },
  settingRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  settingLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: MONO_FONT,
    fontWeight: '600',
  },
  settingValue: {
    fontSize: 15,
    fontFamily: MONO_FONT,
    fontWeight: '700',
  },
  settingHint: {
    color: '#777',
    fontSize: 12,
    fontFamily: MONO_FONT,
    marginTop: 8,
    lineHeight: 18,
  },
  sliderControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adjustBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#444',
    borderRadius: 3,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 3,
  },
  previewRow: {
    marginTop: 12,
    padding: 12,
    backgroundColor: ERA_BG,
    borderRadius: 8,
  },
  settingsButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
    gap: 12,
  },
  settingsBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: MONO_FONT,
  },

  // Landscape overlay
});
