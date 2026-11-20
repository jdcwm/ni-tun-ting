import { Character, TavernAIV2Card, TavernAIV2CardData } from '../types';
import { characterCardService } from './characterCardService';
import { generateId } from '../constants/defaults';

// PNG签名
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

// @ts-ignore - React Native global
declare const global: any;

// Base64编解码（React Native内置）
const base64Encode = (str: string): string => {
  // 使用React Native内置的base64
  return global.btoa(unescape(encodeURIComponent(str)));
};

const base64Decode = (str: string): string => {
  return decodeURIComponent(escape(global.atob(str)));
};

// 将base64字符串转为字节数组
const base64ToBytes = (base64: string): Uint8Array => {
  const binary = global.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// 将字节数组转为base64字符串
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return global.btoa(binary);
};

// 读取4字节大端整数
const readUInt32BE = (bytes: Uint8Array, offset: number): number => {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
};

// 写入4字节大端整数
const writeUInt32BE = (bytes: Uint8Array, value: number, offset: number): void => {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
};

// CRC32计算
const crcTable: number[] = (() => {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

// 字符串转字节数组（UTF-8）
const stringToBytes = (str: string): Uint8Array => {
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    bytes[i] = utf8.charCodeAt(i);
  }
  return bytes;
};

// 字节数组转字符串（UTF-8）
const bytesToString = (bytes: Uint8Array): string => {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(str));
};

export const pngCardService = {
  /**
   * 从PNG文件中提取角色卡片数据
   * 兼容TavernAI/SillyTavern的PNG卡片格式
   * PNG的tEXt chunk中，keyword为"chara"，value为base64编码的JSON
   */
  extractCardFromPNG(base64Data: string): Character | null {
    try {
      const pngBytes = base64ToBytes(base64Data);

      // 验证PNG签名
      for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (pngBytes[i] !== PNG_SIGNATURE[i]) {
          return null;
        }
      }

      let offset = PNG_SIGNATURE.length;

      while (offset < pngBytes.length) {
        const chunkLength = readUInt32BE(pngBytes, offset);
        const chunkType = bytesToString(pngBytes.subarray(offset + 4, offset + 8));

        // 找到tEXt chunk
        if (chunkType === 'tEXt') {
          const chunkData = pngBytes.subarray(offset + 8, offset + 8 + chunkLength);
          // 查找null分隔符
          let nullIndex = -1;
          for (let i = 0; i < chunkData.length; i++) {
            if (chunkData[i] === 0) {
              nullIndex = i;
              break;
            }
          }

          if (nullIndex > 0) {
            const keyword = bytesToString(chunkData.subarray(0, nullIndex));

            // 检查是否是角色卡片数据
            if (keyword === 'chara' || keyword === 'chara_card_v2' || keyword === 'chara_card_v3') {
              const textData = bytesToString(chunkData.subarray(nullIndex + 1));

              try {
                // 尝试base64解码
                const jsonStr = base64Decode(textData);
                const cardData = JSON.parse(jsonStr);
                return characterCardService.importFromJSON(cardData);
              } catch {
                // 可能不是base64，直接尝试JSON解析
                try {
                  const cardData = JSON.parse(textData);
                  return characterCardService.importFromJSON(cardData);
                } catch {
                  // 忽略解析错误
                }
              }
            }
          }
        }

        // 跳到下一个chunk: length(4) + type(4) + data(length) + crc(4)
        offset += 12 + chunkLength;
      }

      return null;
    } catch (e) {
      console.error('PNG卡片解析失败:', e);
      return null;
    }
  },

  /**
   * 将角色卡片数据嵌入PNG图片
   * 在IHDR之后插入tEXt chunk，keyword为"chara"，value为base64编码的JSON
   */
  embedCardIntoPNG(base64Data: string, character: Character): string {
    try {
      const pngBytes = base64ToBytes(base64Data);

      // 验证PNG签名
      let isValidPNG = true;
      for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (pngBytes[i] !== PNG_SIGNATURE[i]) {
          isValidPNG = false;
          break;
        }
      }
      if (!isValidPNG) {
        throw new Error('无效的PNG文件');
      }

      // 导出角色为TavernAI V2格式
      const card = characterCardService.exportToTavernV2(character);
      const jsonStr = JSON.stringify(card);
      const base64Json = base64Encode(jsonStr);

      // 构建tEXt chunk数据: "chara" + 0x00 + base64Json
      const keywordBytes = stringToBytes('chara');
      const valueBytes = stringToBytes(base64Json);
      const textChunkData = new Uint8Array(keywordBytes.length + 1 + valueBytes.length);
      textChunkData.set(keywordBytes, 0);
      textChunkData[keywordBytes.length] = 0; // null分隔符
      textChunkData.set(valueBytes, keywordBytes.length + 1);

      // 构建完整的tEXt chunk: length + "tEXt" + data + crc
      const chunkTypeBytes = stringToBytes('tEXt');
      const crcBytes = new Uint8Array(4 + textChunkData.length);
      crcBytes.set(chunkTypeBytes, 0);
      crcBytes.set(textChunkData, 4);
      const crc = crc32(crcBytes);

      const textChunk = new Uint8Array(4 + 4 + textChunkData.length + 4);
      writeUInt32BE(textChunk, textChunkData.length, 0);
      textChunk.set(chunkTypeBytes, 4);
      textChunk.set(textChunkData, 8);
      writeUInt32BE(textChunk, crc, 8 + textChunkData.length);

      // 找到IHDR chunk的结束位置，在其后插入tEXt
      const ihdrLength = readUInt32BE(pngBytes, PNG_SIGNATURE.length);
      const insertPosition = PNG_SIGNATURE.length + 4 + 4 + ihdrLength + 4; // sig + length + type + data + crc

      // 移除已有的tEXt chunk（避免重复）
      const chunks: Uint8Array[] = [];
      chunks.push(pngBytes.subarray(0, insertPosition)); // 签名 + IHDR
      chunks.push(textChunk); // 新的tEXt chunk

      // 添加剩余的chunks，跳过已有的chara tEXt
      let offset = insertPosition;
      while (offset < pngBytes.length) {
        const chunkLength = readUInt32BE(pngBytes, offset);
        const chunkType = bytesToString(pngBytes.subarray(offset + 4, offset + 8));

        if (chunkType === 'tEXt') {
          const chunkData = pngBytes.subarray(offset + 8, offset + 8 + chunkLength);
          let nullIndex = -1;
          for (let i = 0; i < chunkData.length; i++) {
            if (chunkData[i] === 0) {
              nullIndex = i;
              break;
            }
          }
          if (nullIndex > 0) {
            const keyword = bytesToString(chunkData.subarray(0, nullIndex));
            if (keyword === 'chara' || keyword === 'chara_card_v2' || keyword === 'chara_card_v3') {
              // 跳过已有的角色卡片tEXt
              offset += 12 + chunkLength;
              continue;
            }
          }
        }

        chunks.push(pngBytes.subarray(offset, offset + 12 + chunkLength));
        offset += 12 + chunkLength;
      }

      // 合并所有chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const result = new Uint8Array(totalLength);
      let pos = 0;
      for (const chunk of chunks) {
        result.set(chunk, pos);
        pos += chunk.length;
      }

      return bytesToBase64(result);
    } catch (e) {
      console.error('PNG卡片嵌入失败:', e);
      throw e;
    }
  },

  /**
   * 检查文件是否为PNG格式
   */
  isPNG(base64Data: string): boolean {
    try {
      const bytes = base64ToBytes(base64Data);
      if (bytes.length < PNG_SIGNATURE.length) return false;
      for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (bytes[i] !== PNG_SIGNATURE[i]) return false;
      }
      return true;
    } catch {
      return false;
    }
  },
};
