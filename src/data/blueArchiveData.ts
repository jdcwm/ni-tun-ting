/**
 * 碧蓝档案「默认群聊」构建器。
 *
 * 公开版本移除了内置的 **193 张碧蓝档案角色卡**（22.9MB 立绘 + 版权原因），
 * 所以这里不预置任何角色，返回一个空群聊占位。
 *
 * 想恢复：本仓库的 `backup-before-publish` 分支保留着完整资料；
 * 或者自己导入角色卡后手动建群。
 */
import { Character, Chat } from '../types';
import { defaultChatSettings } from '../constants/defaults';

/** 内置碧蓝档案角色（公开版本为空） */
export const blueArchivePresetCharacters: Character[] = [];

/** 构建默认碧蓝档案群聊（公开版本返回空群聊） */
export function buildDefaultBlueArchiveGroupChat(): Chat {
  const now = Date.now();
  return {
    id: 'group_ba_default_' + now,
    title: '碧蓝档案 AI 模拟',
    messages: [],
    createdAt: now,
    updatedAt: now,
    worldBookIds: [],
    settings: { ...defaultChatSettings, systemPrompt: '' },
    conversationType: 'group',
    groupMembers: [],
    isPinned: false,
  } as Chat;
}
