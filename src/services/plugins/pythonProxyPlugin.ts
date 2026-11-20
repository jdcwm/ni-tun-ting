import { AIProvider, ChatMessage } from '../../types';
import { AIPlugin, ChatOptions, ApiFormat } from './types';
import { pluginRegistry } from './registry';

/**
 * Python Proxy 插件
 * 
 * 当用户选择 python_proxy 格式时，有两种模式：
 * 1. 远程模式：用户自建的 Python HTTP 服务已在本地/远程运行，本插件作为普通 OpenAI 兼容客户端
 * 2. 内嵌模式：用户在 PythonEditorScreen 中编写 Python 代码，由 PythonRuntime（Skulpt）在 WebView 中执行
 * 
 * 当前实现：优先使用远程模式（因为移动设备上启动 Python 服务不现实）
 * 用户的 Python 脚本应该暴露一个 OpenAI 兼容的 /v1/chat/completions 接口
 */

export const pythonProxyPlugin: AIPlugin = {
  id: 'python-proxy',
  name: 'Python 中转',
  format: 'python_proxy',
  description: '用户自建 Python HTTP 中转服务',
  capabilities: {
    text: true,
    streaming: true,
    functionCalling: true,
    image: true,
    vision: true,
    summary: true,
  },

  async chat(
    provider: AIProvider,
    messages: ChatMessage[],
    systemPrompt: string,
    streamCallback?: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<string> {
    // python_proxy 格式的供应商自建 HTTP 服务应该暴露 OpenAI 兼容接口
    // 因此这里直接委托给 openai 插件处理
    const openaiPlugin = pluginRegistry.getByFormat('openai');
    if (!openaiPlugin) {
      throw new Error('OpenAI 插件未注册');
    }

    // 将 provider 转换为 openai 格式
    const normalizedProvider: AIProvider = {
      ...provider,
      format: 'openai',
      baseUrl: provider.baseUrl || 'http://127.0.0.1:5000/v1',
    };

    return openaiPlugin.chat(normalizedProvider, messages, systemPrompt, streamCallback, options);
  },

  async generateImage(
    provider: AIProvider,
    prompt: string,
    size?: string,
    options?: ChatOptions
  ): Promise<string[]> {
    const openaiPlugin = pluginRegistry.getByFormat('openai');
    if (!openaiPlugin || !openaiPlugin.generateImage) {
      throw new Error('OpenAI 插件未注册或不支持图片生成');
    }

    const normalizedProvider: AIProvider = {
      ...provider,
      format: 'openai',
      baseUrl: provider.baseUrl || 'http://127.0.0.1:5000/v1',
    };

    return openaiPlugin.generateImage(normalizedProvider, prompt, size, options);
  },

  async testConnection(
    baseUrl: string,
    apiKey: string
  ): Promise<{ ok: boolean; latency?: number; error?: string }> {
    try {
      const startTime = Date.now();
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        return { ok: true, latency };
      }
      return { ok: false, error: `HTTP ${response.status}` };
    } catch (e: any) {
      return { ok: false, error: e?.message || '连接失败' };
    }
  },

  async fetchModels(
    baseUrl: string,
    apiKey: string,
    options?: ChatOptions
  ): Promise<{ models: string[]; error?: string }> {
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return { models: [], error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      const models = (data.data || []).map((m: any) => m.id || m.name).filter(Boolean);
      return { models };
    } catch (e: any) {
      return { models: [], error: e?.message || '获取模型列表失败' };
    }
  },

  detectCapabilities(models: string[]) {
    const caps: string[] = ['text'];
    const hasVision = models.some((m) => /vision|vl|multimodal|image/i.test(m));
    const hasImage = models.some((m) => /dall|image|sd|flux/i.test(m));
    if (hasVision) caps.push('vision');
    if (hasImage) caps.push('image');
    return caps as any;
  },
};
