import { Chat } from '../types';

/**
 * 是否应出现在「对话历史」列表里。
 * 群聊（group）和群聊里的成员私聊（group_private）统一由「群聊」界面管理，
 * 不再进对话历史，避免同一段记录在两个地方重复出现。
 */
export const isConversationHistoryChat = (c: Chat): boolean =>
  c.conversationType !== 'group' && c.conversationType !== 'group_private';
