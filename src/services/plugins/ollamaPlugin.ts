import { AIProvider, ChatMessage, AIType } from '../../types';
import { safeFetch, ApiError, getErrorMessage, normalizeUrl } from '../../utils/networkUtils';
import { AIPlugin, ChatOptions } from './types';

const getApiBase = (provider: AIProvider): string => {
  const url = normalizeUrl(provider.baseUrl);
  if (!url) return '';
  return url
    .replace(/\/api\/chat\/?$/i, '')
    .replace(/\/api\/?$/i, '');
};

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'User-Agent': 'AI-Tavern/2.0 (Plugin: Ollama)',
  Accept: 'application/json',
});

async function parseOllamaStream(
  response: Response,
  onStream: (chunk: string) => void
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed);
          if (data.message?.content) {
            const chunk = data.message.content;
            fullText += chunk;
            try {
              onStream(chunk);
            } catch (e) {
              console.warn('onStream callback error:', e);
            }
          }
        } catch {
          // 忽略不完整的 JSON 行
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return fullText;
    throw new ApiError('parse', '解析流式响应失败：' + (err?.message || '未知错误'));
  }

  return fullText;
}

export const ollamaPlugin: AIPlugin = {
  id: 'ollama',
  name: 'Ollama (本地模型)',
  format: 'ollama',
  description: '支持 Ollama 本地部署的开源大模型，完全离线运行，保护隐私',
  capabilities: {
    text: true,
    summary: true,
    streaming: true,
  },

  async chat(
    provider: AIProvider,
    messages: ChatMessage[],
    systemPrompt: string,
    streamCallback?: (chunk: string) => void,
    options: ChatOptions = {}
  ): Promise<string> {
    const baseUrl = getApiBase(provider);
    if (!baseUrl) throw new ApiError('no_base_url', '请先配置 Ollama 地址');

    const formattedMessages: any[] = [];
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of messages) {
      if (msg.role === 'system') continue;
      const entry: any = { role: msg.role, content: msg.content };
      if (msg.images && msg.images.length > 0) {
        entry.images = msg.images
          .filter((img) => img && img.startsWith('data:image'))
          .map((img) => {
            const match = img.match(/^data:image\/\w+;base64,(.+)$/);
            return match ? match[1] : null;
          })
          .filter(Boolean);
      }
      formattedMessages.push(entry);
    }

    const body: any = {
      model: provider.model,
      messages: formattedMessages,
      stream: streamCallback ? true : false,
    };

    const fetchWithRetry = async (attempt = 0): Promise<Response> => {
      try {
        return await safeFetch(
          `${baseUrl}/api/chat`,
          {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify(body),
          },
          { retries: 0, timeout: 0, signal: options.signal }
        );
      } catch (err: any) {
        if (err?.retryable && attempt < (options.retries ?? 1)) {
          options.onRetry?.(attempt + 1, err);
          const delay = 1000 * (attempt + 1);
          await new Promise((r) => setTimeout(r, delay));
          return fetchWithRetry(attempt + 1);
        }
        throw err;
      }
    };

    let response: Response;
    try {
      response = await fetchWithRetry();
    } catch (err: any) {
      throw new ApiError(err?.kind || 'unknown', getErrorMessage(err), err?.status, false);
    }

    if (streamCallback && response.body) {
      return parseOllamaStream(response, streamCallback);
    }

    try {
      const data = await response.json();
      return data.message?.content || '';
    } catch (err: any) {
      throw new ApiError('parse', '解析响应失败：' + (err?.message || 'JSON 错误'));
    }
  },

  async fetchModels(
    baseUrl: string,
    _apiKey: string
  ): Promise<{ models: string[]; error?: string }> {
    try {
      const normalized = getApiBase({ baseUrl } as AIProvider);
      if (!normalized) return { models: [], error: '请填写 Ollama 地址' };
      const response = await fetch(`${normalized}/api/tags`, { method: 'GET' });
      if (!response.ok) {
        return { models: [], error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        const models = data.models.map((m: any) => m.name).filter(Boolean);
        return { models };
      }
      return { models: [], error: '未获取到模型列表' };
    } catch (err: any) {
      return { models: [], error: getErrorMessage(err) };
    }
  },

  detectCapabilities(models: string[]): AIType[] {
    const caps: AIType[] = ['text', 'summary'];
    const all = models.join(' ').toLowerCase();
    if (all.includes('llava') || all.includes('vision') || all.includes('qwen-vl') || all.includes('bakllava')) {
      caps.push('vision');
    }
    return caps;
  },

  async testConnection(
    baseUrl: string,
    _apiKey: string
  ): Promise<{ ok: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      const root = getApiBase({ baseUrl } as AIProvider);
      if (!root) return { ok: false, error: '请先填写 Ollama 地址' };
      const response = await fetch(`${root}/api/tags`, { method: 'GET' });
      if (response.ok) {
        return { ok: true, latency: Date.now() - start };
      }
      return { ok: false, latency: Date.now() - start, error: `HTTP ${response.status}` };
    } catch (error: any) {
      return { ok: false, latency: Date.now() - start, error: getErrorMessage(error) };
    }
  },
};
