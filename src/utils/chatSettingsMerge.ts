import { ChatSettings } from '../types';
import { defaultChatSettings } from '../constants/defaults';

export const mergeChatSettings = (savedSettings?: Partial<ChatSettings>): ChatSettings => {
  const s = savedSettings || {};
  return {
    ...defaultChatSettings,
    ...s,
    statusBar: {
      ...defaultChatSettings.statusBar,
      ...s.statusBar,
    } as ChatSettings['statusBar'],
    regexRules: Array.isArray(s.regexRules) ? s.regexRules : defaultChatSettings.regexRules,
    cssEntries: Array.isArray(s.cssEntries) ? s.cssEntries : defaultChatSettings.cssEntries,
    blockWords: Array.isArray(s.blockWords) ? s.blockWords : defaultChatSettings.blockWords,
  };
};
