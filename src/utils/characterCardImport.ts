/**
 * 角色卡/对话导入工具 - 支持 PNG（tEXt/zTXt/iTXt）、JSON、JPG/GIF/WebP 全格式
 * 参考 SillyTavern/TavernAI 的角色卡解析原理
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { generateId } from '../constants/defaults';
import { Character, Chat, ChatMessage } from '../types';
import { createChatFromCharacter } from '../context/AppContext';

// ============ Base64 编解码 ============
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const b64Decode = (s: string): Uint8Array => {
  const idx = new Uint8Array(256);
  for (let i = 0; i < ABC.length; i++) idx[ABC.charCodeAt(i)] = i;
  const str = s.replace(/\s+/g, '').replace(/=+$/, '');
  const out: number[] = [];
  for (let i = 0; i < str.length; i += 4) {
    const a = idx[str.charCodeAt(i)] || 0;
    const b = i + 1 < str.length ? (idx[str.charCodeAt(i + 1)] || 0) : 0;
    const c = i + 2 < str.length ? (idx[str.charCodeAt(i + 2)] || 0) : 0;
    const d = i + 3 < str.length ? (idx[str.charCodeAt(i + 3)] || 0) : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out.push((n >> 16) & 0xff);
    if (i + 2 < str.length) out.push((n >> 8) & 0xff);
    if (i + 3 < str.length) out.push(n & 0xff);
  }
  return new Uint8Array(out);
};

export const b64Encode = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    out += ABC[(n >> 18) & 63] + ABC[(n >> 12) & 63] + (i + 1 < bytes.length ? ABC[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? ABC[n & 63] : '=');
  }
  return out;
};

// ============ 字节↔字符串 ============
const bytesToStr = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  try { return decodeURIComponent(escape(s)); } catch { return s; }
};

// ============ 完整 DEFLATE/zlib 解压（支持 Stored/Fixed/Dynamic Huffman）============
// 参考 RFC 1951，按位读取：数据值 LSB-first，Huffman 码 MSB-first 累加
const inflate = (data: Uint8Array): Uint8Array => {
  // 处理 zlib 包装：2字节头 + 数据 + 4字节 adler32
  let start = 0;
  let end = data.length;
  if (data.length >= 6 && (data[0] & 0x0f) === 0x08) {
    // zlib 头：CM=8(deflate), CINFO<=7；跳过头(2)和尾(adler32 4)
    start = 2;
    end = data.length - 4;
  }
  const src = data.subarray(start, end);

  // 位读取器：LSB-first
  let bytePos = 0;
  let bitPos = 0;
  const readBit = (): number => {
    if (bytePos >= src.length) return 0;
    const bit = (src[bytePos] >> bitPos) & 1;
    bitPos++;
    if (bitPos === 8) { bitPos = 0; bytePos++; }
    return bit;
  };
  // 多位读取（LSB-first，用于长度/距离等数值字段）
  const readBits = (n: number): number => {
    let r = 0;
    for (let i = 0; i < n; i++) r |= readBit() << i;
    return r;
  };
  const alignByte = () => {
    if (bitPos > 0) { bitPos = 0; bytePos++; }
  };

  // 构建 Huffman 解码器：返回一个函数，调用时从流中读取并返回符号
  const buildHuffman = (codeLengths: number[]): (() => number) => {
    const MAX_BITS = 15;
    const blCount = new Array(MAX_BITS + 2).fill(0);
    for (const len of codeLengths) if (len > 0) blCount[len]++;
    const nextCode = new Array(MAX_BITS + 2).fill(0);
    let code = 0;
    for (let bits = 1; bits <= MAX_BITS; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    // lookup: key = length * 65536 + code → symbol
    const lookup = new Map<number, number>();
    for (let sym = 0; sym < codeLengths.length; sym++) {
      const len = codeLengths[sym];
      if (len > 0) {
        lookup.set(len * 65536 + nextCode[len], sym);
        nextCode[len]++;
      }
    }
    return () => {
      let cur = 0;
      for (let len = 1; len <= MAX_BITS; len++) {
        cur = (cur << 1) | readBit(); // MSB-first 累加
        const sym = lookup.get(len * 65536 + cur);
        if (sym !== undefined) return sym;
      }
      return -1;
    };
  };

  // Fixed Huffman 码长表（RFC 1951 §3.2.6）
  const fixedLitLens = new Array(288);
  for (let i = 0; i < 144; i++) fixedLitLens[i] = 8;
  for (let i = 144; i < 256; i++) fixedLitLens[i] = 9;
  for (let i = 256; i < 280; i++) fixedLitLens[i] = 7;
  for (let i = 280; i < 288; i++) fixedLitLens[i] = 8;
  const fixedDistLens = new Array(30).fill(5);

  // 长度/距离基值与额外位（RFC 1951 §3.2.5）
  const lenBase = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const lenExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const distBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const distExtra = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

  // 动态表码长顺序（RFC 1951 §3.2.7）
  const clOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

  const output: number[] = [];
  let bFinal = 0;

  do {
    bFinal = readBit();
    const bType = readBits(2);

    if (bType === 0) {
      // Stored（无压缩）
      alignByte();
      if (bytePos + 4 > src.length) break;
      const len = src[bytePos] | (src[bytePos + 1] << 8);
      bytePos += 4; // 跳过 len + nlen
      for (let i = 0; i < len && bytePos < src.length; i++, bytePos++) output.push(src[bytePos]);
    } else if (bType === 1 || bType === 2) {
      let litDec: () => number;
      let distDec: () => number;

      if (bType === 1) {
        litDec = buildHuffman(fixedLitLens);
        distDec = buildHuffman(fixedDistLens);
      } else {
        // Dynamic Huffman
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;
        const clLens = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) clLens[clOrder[i]] = readBits(3);
        const clDec = buildHuffman(clLens);

        const total = hlit + hdist;
        const allLens: number[] = [];
        while (allLens.length < total) {
          const sym = clDec();
          if (sym < 16) {
            allLens.push(sym);
          } else if (sym === 16) {
            const rep = readBits(2) + 3;
            const prev = allLens[allLens.length - 1] || 0;
            for (let j = 0; j < rep && allLens.length < total; j++) allLens.push(prev);
          } else if (sym === 17) {
            const rep = readBits(3) + 3;
            for (let j = 0; j < rep && allLens.length < total; j++) allLens.push(0);
          } else if (sym === 18) {
            const rep = readBits(7) + 11;
            for (let j = 0; j < rep && allLens.length < total; j++) allLens.push(0);
          } else {
            break;
          }
        }
        litDec = buildHuffman(allLens.slice(0, hlit));
        distDec = buildHuffman(allLens.slice(hlit));
      }

      // 解码数据
      while (true) {
        const sym = litDec();
        if (sym < 0) break;
        if (sym < 256) {
          output.push(sym);
        } else if (sym === 256) {
          break; // 块结束
        } else if (sym <= 285) {
          const li = sym - 257;
          const length = lenBase[li] + (lenExtra[li] ? readBits(lenExtra[li]) : 0);
          const dsym = distDec();
          if (dsym < 0 || dsym > 29) break;
          const dist = distBase[dsym] + (distExtra[dsym] ? readBits(distExtra[dsym]) : 0);
          const si = output.length - dist;
          for (let i = 0; i < length; i++) output.push(output[si + i] || 0);
        } else {
          break;
        }
      }
    } else {
      break; // 非法 bType=3
    }
  } while (bFinal === 0);

  return new Uint8Array(output);
};

// ============ PNG 角色卡解析 ============
type TextChunk = { keyword: string; data: string; compressed: boolean; rawData?: Uint8Array };

export const parsePngCharacterCard = async (uri: string): Promise<any> => {
  try {
    // 读取文件为 base64
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    if (!b64) return null;
    const bytes = b64Decode(b64);

    if (bytes.length < 8 || bytes[0] !== 0x89) return null;

    // 解析 PNG chunk
    const chunks: { type: string; data: Uint8Array }[] = [];
    let offset = 8; // 跳过 PNG 签名
    while (offset + 12 <= bytes.length) {
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const start = offset + 8;
      const dataBytes = bytes.slice(start, start + length);
      chunks.push({ type, data: dataBytes });
      if (type === 'IEND') break;
      offset += 12 + length; // length(4) + type(4) + data(length) + crc(4)
    }

    // 提取文本块
    const textChunks: TextChunk[] = [];
    for (const c of chunks) {
      if (c.type === 'tEXt') {
        const arr = c.data;
        let nul = -1;
        for (let i = 0; i < arr.length; i++) if (arr[i] === 0) { nul = i; break; }
        if (nul > 0) textChunks.push({ keyword: bytesToStr(arr.slice(0, nul)), data: bytesToStr(arr.slice(nul + 1)), compressed: false });
      } else if (c.type === 'zTXt') {
        const arr = c.data;
        let nul = -1;
        for (let i = 0; i < arr.length; i++) if (arr[i] === 0) { nul = i; break; }
        if (nul >= 0 && nul + 2 < arr.length) {
          // keyword\0 compressionMethod(1byte) compressedData
          textChunks.push({ keyword: bytesToStr(arr.slice(0, nul)), data: '', compressed: true, rawData: arr.slice(nul + 2) });
        }
      } else if (c.type === 'iTXt') {
        // iTXt: keyword\0 compFlag(1) compMethod(1) langTag\0 transKeyword\0 text
        const arr = c.data;
        let p = 0;
        let nul1 = -1; for (let i = 0; i < arr.length; i++) if (arr[i] === 0) { nul1 = i; break; }
        if (nul1 < 0) continue;
        const keyword = bytesToStr(arr.slice(0, nul1));
        p = nul1 + 1;
        if (p + 2 > arr.length) continue;
        const compFlag = arr[p];
        const compMethod = arr[p + 1];
        p += 2;
        let nul2 = -1; for (let i = p; i < arr.length; i++) if (arr[i] === 0) { nul2 = i; break; }
        if (nul2 < 0) continue;
        p = nul2 + 1; // 跳过 language tag
        let nul3 = -1; for (let i = p; i < arr.length; i++) if (arr[i] === 0) { nul3 = i; break; }
        if (nul3 < 0) continue;
        const textBytes = arr.slice(nul3 + 1);
        if (compFlag === 1 && compMethod === 0) {
          try {
            const inflated = inflate(textBytes);
            textChunks.push({ keyword, data: bytesToStr(inflated), compressed: false });
          } catch {
            textChunks.push({ keyword, data: '', compressed: true, rawData: textBytes });
          }
        } else {
          textChunks.push({ keyword, data: bytesToStr(textBytes), compressed: false });
        }
      }
    }

    // 解压 zTXt 块
    for (const tc of textChunks) {
      if (tc.compressed && tc.rawData) {
        try { tc.data = bytesToStr(inflate(tc.rawData)); } catch {}
      }
    }

    // 提取角色卡 JSON
    const extractCard = (p: any): any => {
      if (!p) return null;
      // V3 spec: { spec: "chara_card_v3", spec_version: "3.0", data: {...} }
      if (p.spec === 'chara_card_v3' && p.data) return p.data;
      // V2 spec: { spec: "chara_card_v2", spec_version: "2.0", data: {...} }
      if (p.spec === 'chara_card_v2' && p.data) return p.data;
      // V1 或其他扁平格式
      if (p.name || p.description || p.personality || p.first_mes || p.firstMessage || p.greeting || p.system_prompt || p.systemPrompt) {
        return p;
      }
      return null;
    };

    const tryParse = (text: string): any => {
      if (!text) return null;
      try {
        const p = JSON.parse(text);
        const card = extractCard(p);
        if (card) return card;
      } catch {}
      return null;
    };

    // 按优先级搜索各关键字的文本块
    // SillyTavern V3: keyword "ccv3"（base64编码的JSON），优先级最高
    // SillyTavern V2/V1: keyword "chara"（base64编码的JSON）
    // 注意：chara_card_v2 / chara_card_v3 是 JSON 内 spec 字段的值，不是 PNG chunk keyword
    const keywords = ['ccv3', 'chara'];

    for (const kw of keywords) {
      const chunk = textChunks.find(c => c.keyword === kw);
      if (chunk && chunk.data) {
        // 先尝试直接 JSON 解析
        let result = tryParse(chunk.data);
        if (result) return result;
        // 再尝试 base64 解码后 JSON 解析
        try {
          const decoded = bytesToStr(b64Decode(chunk.data));
          result = tryParse(decoded);
          if (result) return result;
        } catch {}
      }
    }

    // 最后扫描所有文本块
    for (const tc of textChunks) {
      if (!tc.data) continue;
      const result = tryParse(tc.data);
      if (result) return result;
    }

    return null;
  } catch (e) {
    console.warn('parsePngCharacterCard error:', e);
    return null;
  }
};

// ============ 角色卡字段 → Character 对象 ============
export const normalizeCharacterCard = (srcRaw: any, fallbackName?: string, fallbackAvatar?: string): Character => {
  let src = srcRaw || {};
  // 解包 V2/V3 spec（data 字段内含角色信息）
  if ((src.spec === 'chara_card_v2' || src.spec === 'chara_card_v3') && src.data) src = src.data;

  const name = (src.name as string) || fallbackName || '未命名角色';
  const description = (src.description as string) || (src.desc as string) || '';
  const personality = (src.personality as string) || '';
  const scenario = (src.scenario as string) || '';
  const greeting = (src.first_mes as string) || (src.firstMessage as string) || (src.greeting as string) || '';
  const mesExample = (src.mes_example as string) || (src.messageExample as string) || (src.exampleDialogue as string) || '';
  const systemPrompt = (src.system_prompt as string) || (src.systemPrompt as string) || (src.system as string) || '';
  const postHistoryInstructions = (src.post_history_instructions as string) || (src.postHistoryInstructions as string) || '';
  const alternateGreetings = (src.alternate_greetings as string[]) || (src.alternateGreetings as string[]) || [];
  const tags = Array.isArray(src.tags) ? src.tags : (Array.isArray(src.tag_list) ? src.tag_list : []);
  const creator = (src.creator as string) || (src.author as string) || '';
  const characterVersion = (src.character_version as string) || '';
  const creatorNotes = (src.creator_notes as string) || (src.creatorNotes as string) || (src.creator_comment as string) || '';
  const userPersona = (src.user_persona as string) || (src.userPersona as string) || '';
  const summaryPrompt = (src.summary_prompt as string) || (src.summaryPrompt as string) || '';
  const avatar = fallbackAvatar || (src.avatar as string) || (src.image as string) || '';

  return {
    id: generateId(),
    name,
    description: description || personality || systemPrompt?.substring(0, 100) || '',
    tags,
    avatar,
    isFavorite: false,
    createdAt: Date.now(),
    systemPrompt: systemPrompt || personality || '',
    greeting: greeting || `你好，我是${name}，很高兴见到你。`,
    messageExample: mesExample,
    personality,
    scenario,
    creator,
    characterVersion,
    creatorNotes,
    alternateGreetings: Array.isArray(alternateGreetings) ? alternateGreetings : [],
    userPersona,
    summaryPrompt,
    prePrompt: '',
    postPrompt: '',
    firstMessage: greeting,
    mesExample,
    functionBar: postHistoryInstructions,
    statusBar: (src.statusBar as any) || undefined,
  };
};

// ============ 统一导入入口 ============
export interface ImportResult {
  characters: Character[];
  chats: Chat[];
  chatImported?: { chat: Chat; worldBookCount: number };
}

export const importCharacterCardFile = async (): Promise<ImportResult | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const file = result.assets[0];
  const isPng = file.uri.toLowerCase().endsWith('.png') || file.mimeType === 'image/png';
  const isImage = isPng || file.mimeType?.startsWith('image/') || /\.(jpg|jpeg|gif|webp|bmp)$/i.test(file.uri);

  let cards: any[] = [];

  if (isPng) {
    const parsed = await parsePngCharacterCard(file.uri);
    if (parsed) {
      cards = [{ ...parsed, avatar: file.uri }];
    } else {
      // PNG 没有嵌入角色数据，创建图片角色卡
      cards = [{ name: file.name?.replace(/\.[^.]+$/, '') || '图片角色卡', description: '从图片导入的角色卡', avatar: file.uri }];
    }
  } else if (isImage) {
    cards = [{ name: file.name?.replace(/\.[^.]+$/, '') || '图片角色卡', description: '从图片导入的角色卡', avatar: file.uri }];
  } else {
    // JSON 文件
    const content = await FileSystem.readAsStringAsync(file.uri);
    try {
      const data = JSON.parse(content);
      // 如果是对话 JSON 格式（有 messages 字段）
      if (data && !Array.isArray(data) && (data.messages || (data.chat && data.chat.messages))) {
        const importedChat: Chat = data.chat ? data.chat : data;
        return {
          characters: [],
          chats: [],
          chatImported: { chat: importedChat, worldBookCount: 0 },
        };
      }
      // 角色卡 JSON（单个或数组）
      const arr = Array.isArray(data) ? data : [data];
      // JSON 文件本身不是图片，avatar 只取角色卡内嵌的 avatar/image 字段
      cards = arr.map((c: any) => ({ ...c, avatar: c.avatar || c.image || '' }));
    } catch {
      throw new Error('文件格式不正确，请提供角色卡 JSON/PNG 或对话 JSON');
    }
  }

  const importedChars: Character[] = [];
  const createdChats: Chat[] = [];
  // 仅图片文件可用作头像回退；JSON 文件路径不能当头像
  const avatarFallback = isImage ? file.uri : undefined;
  for (const c of cards) {
    const char = normalizeCharacterCard(c, undefined, avatarFallback);
    importedChars.push(char);
    const newChat = createChatFromCharacter(char);
    newChat.title = char.name;
    createdChats.push(newChat);
  }

  return { characters: importedChars, chats: createdChats };
};
