import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMOJI_PACK } from '../data/emojiPack';
import { mediaLibraryService } from './mediaLibraryService';

/**
 * 内置表情包 → 素材库。
 *
 * 为什么要落进素材库：AI 发图走的是 `{{ui:img=名字}}` → `mediaLibraryService.resolveToUri(名字)`
 * → 必须在素材库里存在同名 asset。所以内置表情必须在首次启动时释放到素材库，
 * 并且**显式传 name**（用打包时定好的规范名），不能依赖文件名。
 *
 * 性能注意：
 * - 必须用 `importFromUris` 批量导入（整批只写一次索引）。逐条 `importFromUri`
 *   每条都重写整个索引，400+ 张会变成 O(n²)，首启直接卡死。
 * - 分块处理，每块之间让出主线程，避免长时间阻塞 UI。
 * - 由调用方在**启动完成之后**再触发，不要和首屏抢时间。
 */
const SEED_FLAG = 'emojiPackSeededV1';
const CHUNK = 60;

export const emojiPackService = {
  /** 首次启动把内置表情释放进素材库；已做过则直接跳过 */
  async ensureSeeded(
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ imported: number; skipped: boolean }> {
    try {
      const done = await AsyncStorage.getItem(SEED_FLAG);
      if (done === '1') return { imported: 0, skipped: true };

      const total = EMOJI_PACK.length;
      let imported = 0;

      for (let start = 0; start < total; start += CHUNK) {
        const slice = EMOJI_PACK.slice(start, start + CHUNK);
        const ready: Array<{ uri: string; name: string; fileName: string; mimeType?: string }> = [];

        for (const entry of slice) {
          try {
            const asset = Asset.fromModule(entry.module as any);
            if (!asset.downloaded) await asset.downloadAsync();
            const uri = asset.localUri || asset.uri;
            if (!uri) continue;
            ready.push({
              uri,
              name: entry.name,
              fileName: entry.name + entry.ext,
              mimeType:
                entry.ext === '.gif'
                  ? 'image/gif'
                  : entry.ext === '.png'
                    ? 'image/png'
                    : entry.ext === '.jpg' || entry.ext === '.jpeg'
                      ? 'image/jpeg'
                      : undefined,
            });
          } catch {
            /* 单个资源取不到就跳过 */
          }
        }

        if (ready.length > 0) {
          imported += await mediaLibraryService.importFromUris(
            ready.map((r) => ({ ...r, note: '内置表情包' })),
          );
        }
        if (onProgress) onProgress(Math.min(start + CHUNK, total), total);

        // 让出主线程，别把首屏卡住
        await new Promise((r) => setTimeout(r, 0));
      }

      await AsyncStorage.setItem(SEED_FLAG, '1');
      return { imported, skipped: false };
    } catch {
      return { imported: 0, skipped: false };
    }
  },
};
