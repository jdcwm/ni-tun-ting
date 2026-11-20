import { WorldBook, WorldBookEntry, WorldBookImage } from '../types';
import { generateId } from '../constants/defaults';

/**
 * 「角色见闻」世界书。
 *
 * 需求：群聊里 A 提到关于 B 的内容时，把这条信息记进 **B 自己的一本世界书**。
 * 特点是——B「知道这件事」，但**不知道 A 跟用户说过**，所以词条只客观陈述事实、不写出处。
 * 注入方式为**关键词命中**（keys 里放这个角色的名字等），不是常驻。
 */
const BOOK_ID_PREFIX = 'charmem_';
export const CHARACTER_MEMORY_BOOK_SUFFIX = '·见闻';

export interface MentionHit {
  characterId: string;
  characterName: string;
  entry: WorldBookEntry;
}

const splitSentences = (text: string): string[] =>
  text
    .replace(/\{\{[^}]*\}\}/g, '') // 去掉 {{ui:...}} / {{addvar:...}} 等指令
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && s.length <= 120);

const emptyImages = (): WorldBookImage[] => [];

export const characterMemoryService = {
  bookIdFor(characterId: string): string {
    return `${BOOK_ID_PREFIX}${characterId}`;
  },

  isMemoryBook: (wb: WorldBook): boolean => wb.id.startsWith(BOOK_ID_PREFIX),

  /** 该角色是否已经有自己的见闻世界书 */
  findBook(worldBooks: WorldBook[], characterId: string): WorldBook | undefined {
    return worldBooks.find((wb) => wb.id === characterMemoryService.bookIdFor(characterId));
  },

  /** 新建一本该角色的见闻世界书（调用方负责塞进 worldBooks） */
  createBook(characterId: string, characterName: string): WorldBook {
    const now = Date.now();
    return {
      id: characterMemoryService.bookIdFor(characterId),
      name: `${characterName}${CHARACTER_MEMORY_BOOK_SUFFIX}`,
      description: `「${characterName}」在群聊里知道的事（关键词命中才注入）`,
      entries: [],
      createdAt: now,
      updatedAt: now,
    };
  },

  /**
   * 从一条群聊回复里，找出「关于其他角色」的句子。
   * 纯函数：只计算结果，不写任何状态。
   */
  collectMentions(params: {
    text: string;
    speakerCharacterId?: string;
    members: { characterId?: string; name: string }[];
  }): MentionHit[] {
    const { text, speakerCharacterId, members } = params;
    const sentences = splitSentences(text);
    if (sentences.length === 0) return [];

    const hits: MentionHit[] = [];
    const seen = new Set<string>();

    for (const sentence of sentences) {
      for (const m of members) {
        if (!m.characterId || !m.name) continue;
        // 单字名（如「时」「惠」）在中文里几乎必然误命中，直接跳过，避免污染世界书
        if (m.name.length < 2) continue;
        // 不记录「自己说自己」和「说话人自己」
        if (m.characterId === speakerCharacterId) continue;
        if (!sentence.includes(m.name)) continue;

        const dedupeKey = `${m.characterId}|${sentence}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        hits.push({
          characterId: m.characterId,
          characterName: m.name,
          entry: {
            id: generateId(),
            // 关键词命中才注入：以该角色名字为主关键词
            keys: [m.name],
            content: `【已知信息】${sentence}。（这是你所知道的事，不必说明你是从哪听来的）`,
            images: emptyImages(),
            enabled: true,
            constant: false,
            injectWhen: 'on_keyword',
            matchMode: 'any',
            position: 'after_char',
            order: 100,
            comment: '群聊见闻（自动记录）',
            category: '见闻',
          },
        });
      }
    }
    return hits;
  },

  /** 把命中项合并进世界书列表（不存在就新建），返回新的列表 */
  applyMentions(worldBooks: WorldBook[], hits: MentionHit[]): WorldBook[] {
    if (hits.length === 0) return worldBooks;
    let next = [...worldBooks];
    for (const hit of hits) {
      const idx = next.findIndex((wb) => wb.id === characterMemoryService.bookIdFor(hit.characterId));
      if (idx >= 0) {
        const book = next[idx];
        // 同一句话不重复记
        if (book.entries.some((e) => e.content === hit.entry.content)) continue;
        next[idx] = {
          ...book,
          entries: [...book.entries, hit.entry],
          updatedAt: Date.now(),
        };
      } else {
        const book = characterMemoryService.createBook(hit.characterId, hit.characterName);
        next = [...next, { ...book, entries: [hit.entry] }];
      }
    }
    return next;
  },
};
