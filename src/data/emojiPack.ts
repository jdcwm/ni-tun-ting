/**
 * 表情包清单。
 *
 * 公开版本移除了内置的 434 张官方表情包（体积 86MB + 版权原因），
 * 所以这里是**空清单**。App 仍支持自定义表情包：
 * 「设置 → 素材库」里导入自己的图片，之后就能用 {{ui:img=名字}} 让 AI 调用。
 */
export interface EmojiPackEntry {
  name: string;
  module: number;
  ext: string;
}

export const EMOJI_PACK: EmojiPackEntry[] = [];
export const EMOJI_NAMES: string[] = EMOJI_PACK.map((e) => e.name);
