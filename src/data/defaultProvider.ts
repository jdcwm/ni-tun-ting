import { AIProvider, AIModel } from '../types';

/**
 * 首次启动时预置的 AI 提供商（DeepSeek 官方）。
 *
 * ⚠️ 安全说明：**这里不要写真实 API Key。**
 * 仓库一旦公开，密钥会在几分钟内被爬取机器人抓走盗刷。
 * 首次使用请在「设置 → AI 模型设置」里填入自己的 Key（会保存在本地，之后一直可用）。
 *
 * 如果你是在**自己电脑上本地构建**、且希望开箱即用：
 * 把 Key 填在下面这一行再打包即可 —— 但提交代码前务必改回空字符串。
 */
const LOCAL_DEFAULT_API_KEY = '';

/** 允许构建时通过环境变量注入（例如 EXPO_PUBLIC_DEFAULT_API_KEY），避免把 Key 写进源码 */
export const DEFAULT_PROVIDER_API_KEY: string =
  (typeof process !== 'undefined' && (process as any)?.env?.EXPO_PUBLIC_DEFAULT_API_KEY) ||
  LOCAL_DEFAULT_API_KEY ||
  '';

const DEEPSEEK_MODELS: Array<{ id: string; name: string; ctx: number }> = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', ctx: 65536 },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', ctx: 65536 },
];

export const buildDefaultProvider = (): AIProvider => {
  const providerId = 'provider_default_deepseek';
  const models: AIModel[] = DEEPSEEK_MODELS.map((m, i) => ({
    id: `${providerId}_${m.id}`,
    name: m.name,
    providerId,
    modelId: m.id,
    capabilities: ['text'] as any,
    isFavorite: i === 0,
    order: i,
    contextLength: m.ctx,
  }));
  return {
    id: providerId,
    name: 'DeepSeek',
    format: 'custom' as any,
    capabilities: ['text'],
    apiKey: DEFAULT_PROVIDER_API_KEY,
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models,
    isFavorite: true,
    order: 0,
    presetId: 'preset-deepseek',
  };
};
