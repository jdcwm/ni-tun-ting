/**
 * 幻想入界（东方 Project）预设。
 *
 * 公开版本移除了内置的「幻想入界」角色卡、系统指令与世界观资料
 * （体积 + 版权原因），所以这里都是空占位。
 *
 * App 的完整能力（角色扮演、世界书、状态栏、群聊…）都在代码里，
 * 自己导入角色卡 / 世界书即可获得同等体验。
 */
import { Character, WorldBook, WorldBookEntry } from '../types';

export const gensokyoSystemPrompt = '';
export const gensokyoSummaryPrompt = '';

export const gensokyoWorldBookEntries: WorldBookEntry[] = [];

export const gensokyoWorldBook: WorldBook = {
  id: 'worldbook_gensokyo',
  name: '幻想入界 - 幻想乡世界书',
  description: '（公开版本未内置世界书，请自行导入）',
  entries: gensokyoWorldBookEntries,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const gensokyoCharacter: Character = {
  id: 'char_gensokyo',
  name: '幻想入界',
  description: '（公开版本未内置角色卡，请自行导入）',
  greeting: '',
  avatar: '',
  systemPrompt: '',
  summaryPrompt: '',
  worldBookIds: [],
  tags: [],
  isFavorite: false,
  isPreset: false,
  createdAt: Date.now(),
};
