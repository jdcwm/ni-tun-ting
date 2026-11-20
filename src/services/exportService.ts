import * as FileSystem from 'expo-file-system/legacy';
import { Chat, ChatExportOptions, Character, WorldBook } from '../types';
import { characterCardService } from './characterCardService';
import { generateId } from '../constants/defaults';
import { mergeChatSettings } from '../utils/chatSettingsMerge';

const APP_VERSION = '3.0.0';
const EXPORT_VERSION = '2.0';
const MAX_IMAGE_SIZE_MB = 5;
const IMPORTED_IMAGES_FOLDER = 'imported_images';

export interface ExportImageOptions {
  embedImages?: boolean;
  imageQuality?: number;
}

async function imageToBase64(uri: string, maxSizeMB: number = MAX_IMAGE_SIZE_MB): Promise<string | null> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      console.warn(`[exportService] File not found: ${uri}`);
      return null;
    }
    const fileSizeMB = (fileInfo.size || 0) / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      console.warn(`[exportService] Image too large (${fileSizeMB.toFixed(2)}MB > ${maxSizeMB}MB): ${uri}`);
      return null;
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    return base64;
  } catch (error) {
    console.error(`[exportService] imageToBase64 error for ${uri}:`, error);
    return null;
  }
}

async function saveBase64ToFile(base64: string, folder: string = IMPORTED_IMAGES_FOLDER): Promise<string | null> {
  try {
    const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const dir = `${documentDir}${folder}`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const newUri = `${dir}/${fileName}`;
    await FileSystem.writeAsStringAsync(newUri, base64, { encoding: 'base64' });
    return newUri;
  } catch (error) {
    console.error('[exportService] saveBase64ToFile error:', error);
    return null;
  }
}

function isBase64String(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  if (str.length < 20) return false;
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  const sample = str.substring(0, 100);
  return base64Regex.test(sample);
}

function isBase64Image(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  if (str.startsWith('data:image')) return true;
  if (isBase64String(str)) return true;
  return false;
}

function stripDataPrefix(base64: string): string {
  const commaIndex = base64.indexOf(',');
  if (commaIndex !== -1) {
    return base64.substring(commaIndex + 1);
  }
  return base64;
}

function getMimeTypeFromBase64(base64: string): string {
  const match = base64.match(/^data:([^;]+);base64,/);
  if (match) return match[1];
  return 'image/jpeg';
}

async function processImageForExport(
  uri: string,
  options: ExportImageOptions
): Promise<string> {
  if (!options.embedImages) return uri;
  if (!uri || uri.startsWith('data:')) return uri;
  if (isBase64String(uri)) return uri;
  const base64 = await imageToBase64(uri);
  if (base64) {
    return `data:image/jpeg;base64,${base64}`;
  }
  return uri;
}

async function processImagesArray(
  images: string[] | undefined,
  options: ExportImageOptions
): Promise<string[]> {
  if (!images || images.length === 0) return [];
  if (!options.embedImages) return [...images];
  const processed = await Promise.all(
    images.map((uri) => processImageForExport(uri, options))
  );
  return processed;
}

async function processChatMediaForExport(
  chat: Chat,
  options: ExportImageOptions
): Promise<Chat> {
  if (!options.embedImages) return chat;

  const processedMessages = await Promise.all(
    chat.messages.map(async (msg) => ({
      ...msg,
      images: await processImagesArray(msg.images, options),
    }))
  );

  const processedWallpaper = chat.wallpaper
    ? await processImageForExport(chat.wallpaper, options)
    : undefined;

  const processedCoverImage = chat.coverImage
    ? await processImageForExport(chat.coverImage, options)
    : undefined;

  const processedUserAvatar = chat.userAvatar
    ? await processImageForExport(chat.userAvatar, options)
    : undefined;

  const processedAssistantAvatar = chat.assistantAvatar
    ? await processImageForExport(chat.assistantAvatar, options)
    : undefined;

  return {
    ...chat,
    messages: processedMessages,
    wallpaper: processedWallpaper,
    coverImage: processedCoverImage,
    userAvatar: processedUserAvatar,
    assistantAvatar: processedAssistantAvatar,
  };
}

async function restoreBase64ImagesInChat(chat: Chat): Promise<Chat> {
  const processedMessages = await Promise.all(
    chat.messages.map(async (msg) => {
      let newImages: string[] = [];
      if (msg.images && msg.images.length > 0) {
        newImages = await Promise.all(
          msg.images.map(async (img) => {
            if (isBase64Image(img)) {
              const base64Data = stripDataPrefix(img);
              const savedUri = await saveBase64ToFile(base64Data);
              return savedUri || img;
            }
            return img;
          })
        );
      }
      return { ...msg, images: newImages };
    })
  );

  const processSingle = async (img: string | undefined): Promise<string | undefined> => {
    if (img && isBase64Image(img)) {
      const base64Data = stripDataPrefix(img);
      const savedUri = await saveBase64ToFile(base64Data);
      return savedUri || img;
    }
    return img;
  };

  return {
    ...chat,
    messages: processedMessages,
    wallpaper: await processSingle(chat.wallpaper),
    coverImage: await processSingle(chat.coverImage),
    userAvatar: await processSingle(chat.userAvatar),
    assistantAvatar: await processSingle(chat.assistantAvatar),
  };
}

function buildExportMetadata(character?: Character, worldBooks?: WorldBook[]): Record<string, any> {
  const meta: Record<string, any> = {
    exportVersion: EXPORT_VERSION,
    exportedAt: Date.now(),
    appVersion: APP_VERSION,
  };

  if (character) {
    meta.character = {
      id: character.id,
      name: character.name,
      description: character.description,
      avatar: character.avatar,
      tags: character.tags,
    };
  }

  if (worldBooks && worldBooks.length > 0) {
    meta.worldBooks = worldBooks.map((wb) => ({
      id: wb.id,
      name: wb.name,
      description: wb.description,
    }));
  }

  return meta;
}

export const exportService = {
  async exportChatToJSON(
    chat: Chat,
    worldBooks: WorldBook[] = [],
    character?: Character,
    options: ExportImageOptions = {}
  ): Promise<string> {
    const processedChat = await processChatMediaForExport(chat, options);
    const attachedWorldBooks = worldBooks.filter((wb) => chat.worldBookIds?.includes(wb.id));
    const metadata = buildExportMetadata(character, attachedWorldBooks);

    const exportData = {
      ...processedChat,
      ...metadata,
      attachedWorldBooks,
    };
    return JSON.stringify(exportData, null, 2);
  },

  async importChatFromJSON(json: string): Promise<{ chat: Chat; worldBooks: WorldBook[] } | null> {
    try {
      const parsed = JSON.parse(json);
      if (!parsed.messages || !Array.isArray(parsed.messages)) {
        return null;
      }

      const validatedMessages = parsed.messages.map((msg: any) => ({
        id: msg.id || generateId(),
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
      }));

      const chat: Chat = {
        id: parsed.id || generateId(),
        title: parsed.title || '导入的对话',
        messages: validatedMessages,
        settings: mergeChatSettings(parsed.settings),
        worldBookIds: Array.isArray(parsed.worldBookIds) ? parsed.worldBookIds : [],
        wallpaper: parsed.wallpaper,
        conversationType: parsed.conversationType,
        parentId: parsed.parentId,
        isPinned: parsed.isPinned || false,
        characterId: parsed.characterId,
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        statusVars: parsed.statusVars,
        userAvatar: parsed.userAvatar,
        assistantAvatar: parsed.assistantAvatar,
        groupMembers: Array.isArray(parsed.groupMembers) ? parsed.groupMembers : undefined,
        activeMemberId: parsed.activeMemberId,
        summaries: Array.isArray(parsed.summaries) ? parsed.summaries : undefined,
        coverImage: parsed.coverImage,
      };

      const worldBooks: WorldBook[] = Array.isArray(parsed.attachedWorldBooks) ? parsed.attachedWorldBooks : [];

      const restoredChat = await restoreBase64ImagesInChat(chat);

      return { chat: restoredChat, worldBooks };
    } catch {
      return null;
    }
  },

  exportChatToMarkdown(chat: Chat, options?: Partial<ChatExportOptions> & { embedImagesAsBase64?: boolean }): string {
    const lines: string[] = [];
    const opts = {
      includeTimestamps: true,
      includeSystemMessages: true,
      includeMetadata: true,
      includeCharacterInfo: false,
      embedImagesAsBase64: false,
      ...options,
    };

    lines.push(`# ${chat.title}`);
    lines.push('');

    if (opts.includeMetadata) {
      lines.push(`**创建时间**: ${new Date(chat.createdAt).toLocaleString()}`);
      lines.push(`**更新时间**: ${new Date(chat.updatedAt).toLocaleString()}`);
      lines.push(`**消息数**: ${chat.messages.length}`);
      if (chat.characterId) {
        lines.push(`**角色ID**: ${chat.characterId}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    let messages = chat.messages;
    if (!opts.includeSystemMessages) {
      messages = messages.filter((m) => m.role !== 'system');
    }

    if (opts.messageRange === 'last_n' && opts.lastNCount) {
      messages = messages.slice(-opts.lastNCount);
    } else if (opts.messageRange === 'selected' && opts.selectedMessageIds) {
      messages = messages.filter((m) => opts.selectedMessageIds?.includes(m.id));
    }

    for (const msg of messages) {
      const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统';
      const timeStr = opts.includeTimestamps ? ` (${new Date(msg.timestamp).toLocaleTimeString()})` : '';
      lines.push(`**${role}**${timeStr}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');

      if (msg.images && msg.images.length > 0) {
        for (let i = 0; i < msg.images.length; i++) {
          const imgUri = msg.images[i];
          const altText = `图片${i + 1}`;
          if (opts.embedImagesAsBase64 && isBase64Image(imgUri)) {
            lines.push(`![${altText}](${imgUri})`);
          } else if (imgUri.startsWith('data:')) {
            lines.push(`![${altText}](${imgUri})`);
          } else {
            lines.push(`![${altText}](${imgUri})`);
          }
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  },

  exportChatToTxt(chat: Chat, options?: Partial<ChatExportOptions>): string {
    const lines: string[] = [];
    const opts = {
      includeTimestamps: true,
      includeSystemMessages: true,
      ...options,
    };

    let messages = chat.messages;
    if (!opts.includeSystemMessages) {
      messages = messages.filter((m) => m.role !== 'system');
    }

    if (opts.messageRange === 'last_n' && opts.lastNCount) {
      messages = messages.slice(-opts.lastNCount);
    } else if (opts.messageRange === 'selected' && opts.selectedMessageIds) {
      messages = messages.filter((m) => opts.selectedMessageIds?.includes(m.id));
    }

    for (const msg of messages) {
      const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统';
      const timeStr = opts.includeTimestamps ? ` [${new Date(msg.timestamp).toLocaleString()}]` : '';
      lines.push(`${role}${timeStr}:`);
      lines.push(msg.content);
      if (msg.images && msg.images.length > 0) {
        lines.push(`[包含${msg.images.length}张图片]`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  },

  exportChatToHtml(chat: Chat, options?: Partial<ChatExportOptions>): string {
    const opts = {
      includeTimestamps: true,
      includeSystemMessages: true,
      includeImages: true,
      ...options,
    };

    let messages = chat.messages;
    if (!opts.includeSystemMessages) {
      messages = messages.filter((m) => m.role !== 'system');
    }

    if (opts.messageRange === 'last_n' && opts.lastNCount) {
      messages = messages.slice(-opts.lastNCount);
    } else if (opts.messageRange === 'selected' && opts.selectedMessageIds) {
      messages = messages.filter((m) => opts.selectedMessageIds?.includes(m.id));
    }

    let messagesHtml = '';
    for (const msg of messages) {
      const roleClass = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system';
      const roleName = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : '系统';
      const timeStr = opts.includeTimestamps
        ? `<span class="timestamp">${new Date(msg.timestamp).toLocaleString()}</span>`
        : '';

      let contentHtml = msg.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      let imagesHtml = '';
      if (opts.includeImages && msg.images && msg.images.length > 0) {
        imagesHtml = '<div class="images">';
        for (const img of msg.images) {
          const src = img.startsWith('data:') ? img : img;
          imagesHtml += `<img src="${src}" alt="图片" />`;
        }
        imagesHtml += '</div>';
      }

      messagesHtml += `
        <div class="message ${roleClass}">
          <div class="message-header">
            <span class="role">${roleName}</span>
            ${timeStr}
          </div>
          <div class="message-content">${contentHtml}</div>
          ${imagesHtml}
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${chat.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #1a1a2e;
      color: #fff;
    }
    h1 {
      color: #e94560;
      text-align: center;
      margin-bottom: 30px;
    }
    .chat-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .message {
      padding: 16px;
      border-radius: 12px;
      max-width: 80%;
    }
    .message.user {
      background: #0f3460;
      align-self: flex-end;
      margin-left: auto;
    }
    .message.assistant {
      background: #16213e;
      align-self: flex-start;
    }
    .message.system {
      background: #2a2a4a;
      align-self: center;
      font-style: italic;
      opacity: 0.8;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 12px;
      opacity: 0.7;
    }
    .message-content {
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .images {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .images img {
      max-width: 200px;
      max-height: 200px;
      border-radius: 8px;
      object-fit: cover;
    }
    .timestamp {
      font-size: 11px;
    }
    .meta {
      text-align: center;
      color: #a0a0a0;
      margin-bottom: 20px;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <h1>${chat.title}</h1>
  <div class="meta">
    <p>创建时间: ${new Date(chat.createdAt).toLocaleString()}</p>
    <p>消息数: ${chat.messages.length}</p>
  </div>
  <div class="chat-container">
    ${messagesHtml}
  </div>
</body>
</html>`;
  },

  exportChatToTavernJSON(
    chat: Chat,
    character?: Character,
    worldBooks?: WorldBook[],
    options?: Partial<ChatExportOptions>
  ): string {
    const opts = {
      includeCharacterInfo: true,
      includeWorldBookInfo: true,
      ...options,
    };

    const tavernChat: any = {
      chat_name: chat.title,
      create_date: chat.createdAt,
      messages: chat.messages.map((msg) => ({
        name: msg.role === 'user' ? 'User' : character?.name || 'Character',
        is_user: msg.role === 'user',
        is_name: true,
        send_date: msg.timestamp,
        mes: msg.content,
        extra: {
          images: msg.images || [],
          ...(msg.providerId ? { provider_id: msg.providerId } : {}),
        },
      })),
    };

    if (opts.includeCharacterInfo && character) {
      tavernChat.character = characterCardService.exportToTavernV2(character);
    }

    if (opts.includeWorldBookInfo && worldBooks && worldBooks.length > 0) {
      tavernChat.world_books = worldBooks.map((wb) => ({
        name: wb.name,
        description: wb.description,
        entries: wb.entries.map((entry) => ({
          keys: entry.keys,
          content: entry.content,
          enabled: entry.enabled,
          ...(entry.caseSensitive !== undefined ? { case_sensitive: entry.caseSensitive } : {}),
          ...(entry.probability !== undefined ? { probability: entry.probability } : {}),
          ...(entry.position ? { position: entry.position } : {}),
          ...(entry.order !== undefined ? { order: entry.order } : {}),
          ...(entry.useRegex !== undefined ? { use_regex: entry.useRegex } : {}),
          ...(entry.scanDepth !== undefined ? { scan_depth: entry.scanDepth } : {}),
        })),
      }));
    }

    return JSON.stringify(tavernChat, null, 2);
  },

  async exportChatToPackage(
    chat: Chat,
    worldBooks: WorldBook[] = [],
    character?: Character
  ): Promise<string> {
    const processedChat = await processChatMediaForExport(chat, { embedImages: true });
    const attachedWorldBooks = worldBooks.filter((wb) => chat.worldBookIds?.includes(wb.id));
    const metadata = buildExportMetadata(character, attachedWorldBooks);

    const packageData = {
      _package: true,
      _packageType: 'ai-tavern-chat-package',
      ...metadata,
      chat: processedChat,
      attachedWorldBooks,
      character: character
        ? {
            id: character.id,
            name: character.name,
            description: character.description,
            systemPrompt: character.systemPrompt,
            greeting: character.greeting,
            avatar: character.avatar,
            tags: character.tags,
            personality: character.personality,
            scenario: character.scenario,
            firstMessage: character.firstMessage,
          }
        : undefined,
    };

    return JSON.stringify(packageData, null, 2);
  },

  async importChatFromPackage(json: string): Promise<{ chat: Chat; worldBooks: WorldBook[]; character?: Character } | null> {
    try {
      const parsed = JSON.parse(json);
      if (!parsed._package || !parsed.chat) {
        return null;
      }

      const chat = await restoreBase64ImagesInChat(parsed.chat);
      const worldBooks: WorldBook[] = Array.isArray(parsed.attachedWorldBooks)
        ? parsed.attachedWorldBooks
        : [];

      let character: Character | undefined;
      if (parsed.character) {
        character = {
          id: parsed.character.id || generateId(),
          name: parsed.character.name || '未知角色',
          description: parsed.character.description || '',
          systemPrompt: parsed.character.systemPrompt || '',
          greeting: parsed.character.greeting || '',
          avatar: parsed.character.avatar,
          tags: parsed.character.tags || [],
          isFavorite: false,
          createdAt: Date.now(),
          personality: parsed.character.personality,
          scenario: parsed.character.scenario,
          firstMessage: parsed.character.firstMessage,
        };
      }

      return { chat, worldBooks, character };
    } catch {
      return null;
    }
  },

  async exportChat(
    chat: Chat,
    options: ChatExportOptions & ExportImageOptions,
    character?: Character,
    worldBooks?: WorldBook[]
  ): Promise<string> {
    switch (options.format) {
      case 'json':
        return this.exportChatToJSON(chat, worldBooks || [], character, options);
      case 'markdown':
        return this.exportChatToMarkdown(chat, options);
      case 'txt':
        return this.exportChatToTxt(chat, options);
      case 'html':
        return this.exportChatToHtml(chat, options);
      case 'tavern_json':
        return this.exportChatToTavernJSON(chat, character, worldBooks, options);
      default:
        return this.exportChatToJSON(chat, worldBooks || [], character, options);
    }
  },

  exportChatsToJSON(chats: Chat[]): string {
    return JSON.stringify(chats, null, 2);
  },

  async importChatsFromJSON(json: string): Promise<Chat[] | null> {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        return null;
      }

      const chats = await Promise.all(
        parsed.map(async (item: any) => {
          const validatedMessages = Array.isArray(item.messages)
            ? item.messages.map((msg: any) => ({
                id: msg.id || generateId(),
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
            : [];

          const chat: Chat = {
            id: item.id || generateId(),
            title: item.title || '导入的对话',
            messages: validatedMessages,
            settings: mergeChatSettings(item.settings),
            worldBookIds: Array.isArray(item.worldBookIds) ? item.worldBookIds : [],
            wallpaper: item.wallpaper,
            conversationType: item.conversationType,
            parentId: item.parentId,
            isPinned: item.isPinned || false,
            characterId: item.characterId,
            createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
            statusVars: item.statusVars,
            userAvatar: item.userAvatar,
            assistantAvatar: item.assistantAvatar,
            groupMembers: Array.isArray(item.groupMembers) ? item.groupMembers : undefined,
            activeMemberId: item.activeMemberId,
            summaries: Array.isArray(item.summaries) ? item.summaries : undefined,
            coverImage: item.coverImage,
          };

          return restoreBase64ImagesInChat(chat);
        })
      );

      return chats;
    } catch {
      return null;
    }
  },

  getExportFileName(chat: Chat, format: string): string {
    const safeTitle = chat.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    const dateStr = new Date().toISOString().split('T')[0];
    const extMap: Record<string, string> = {
      json: 'json',
      markdown: 'md',
      txt: 'txt',
      html: 'html',
      tavern_json: 'json',
      package: 'json',
    };
    const ext = extMap[format] || 'json';
    return `${safeTitle}_${dateStr}.${ext}`;
  },

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },
};