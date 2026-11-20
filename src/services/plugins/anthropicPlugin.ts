import { AIProvider, ChatMessage, AIType } from '../../types';
import { safeFetch, ApiError, getErrorMessage, normalizeUrl } from '../../utils/networkUtils';
import { AIPlugin, ChatOptions } from './types';

const ANTHROPIC_VERSION = '2023-06-01';

const getApiBase = (provider: AIProvider): string => {
  const url = normalizeUrl(provider.baseUrl);
  if (!url) return '';
  return url
    .replace(/\/v1\/messages\/?$/i, '')
    .replace(/\/v1\/?$/i, '')
    .replace(/\/messages\/?$/i, '');
};

const buildHeaders = (provider: AIProvider) => ({
  'Content-Type': 'application/json',
  'x-api-key': provider.apiKey,
  'anthropic-version': ANTHROPIC_VERSION,
  'anthropic-dangerous-direct-browser-access': 'true',
  'User-Agent': 'AI-Tavern/2.0 (Plugin: Anthropic)',
});

async function parseAnthropicStream(
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
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
            const text = data.delta.text;
            if (text) {
              fullText += text;
              try {
                onStream(text);
              } catch (e) {
                console.warn('onStream callback error:', e);
              }
            }
          }
        } catch {
          // 忽略不完整的 JSON
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return fullText;
    throw new ApiError('parse', '解析流式响应失败：' + (err?.message || '未知错误'));
  }

  return fullText;
}

export const anthropicPlugin: AIPlugin = {
  id: 'anthropic',
  name: 'Anthropic Claude',
  format: 'anthropic',
  description: 'Anthropic 官方 Claude API 格式，支持 Claude 3/3.5/4 系列模型',
  capabilities: {
    text: true,
    vision: true,
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
    if (!baseUrl) throw new ApiError('no_base_url', '请先配置 Base URL');
    if (!provider.apiKey) throw new ApiError('no_api_key', '请先配置 API 密钥');

    const formattedMessages: any[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') continue;

      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      const imgs = (msg.images || []).filter(Boolean);
      // assistant 消息不能带图（API 会报 Image in assistant message is not supported），
      // 退回成文字说明保住上下文
      if (imgs.length > 0 && role === 'assistant') {
        const note = `（发送了 ${imgs.length} 张图片/表情包）`;
        formattedMessages.push({ role, content: msg.content ? `${msg.content}\n${note}` : note });
        continue;
      }
      if (imgs.length > 0) {
        const content: any[] = [{ type: 'text', text: msg.content }];
        for (const img of imgs) {
          if (img.startsWith('data:image')) {
            const match = img.match(/^data:image\/(\w+);base64,(.+)$/);
            if (match) {
              content.push({
                type: 'image',
                source: { type: 'base64', media_type: `image/${match[1]}`, data: match[2] },
              });
            }
          } else {
            content.push({ type: 'image', source: { type: 'url', url: img } });
          }
        }
        formattedMessages.push({ role, content });
      } else {
        formattedMessages.push({ role, content: msg.content });
      }
    }

    const body: any = {
      model: provider.model,
      max_tokens: 4096,
      messages: formattedMessages,
      stream: streamCallback ? true : false,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const fetchWithRetry = async (attempt = 0): Promise<Response> => {
      try {
        return await safeFetch(
          `${baseUrl}/v1/messages`,
          {
            method: 'POST',
            headers: buildHeaders(provider),
            body: JSON.stringify(body),
          },
          { retries: 0, timeout: 0, signal: options.signal }
        );
      } catch (err: any) {
        if (err?.retryable && attempt < (options.retries ?? 2)) {
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
      return parseAnthropicStream(response, streamCallback);
    }

    try {
      const data = await response.json();
      const text = data.content?.map((c: any) => c.text).join('') || data.content?.[0]?.text || '';
      return text;
    } catch (err: any) {
      throw new ApiError('parse', '解析响应失败：' + (err?.message || 'JSON 错误'));
    }
  },

  async fetchModels(
    baseUrl: string,
    apiKey: string
  ): Promise<{ models: string[]; error?: string }> {
    const knownModels = [
      'claude-4-opus-20250514',
      'claude-4-sonnet-20250514',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-sonnet-20240620',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];

    try {
      const normalized = getApiBase({ baseUrl } as AIProvider);
      const response = await fetch(`${normalized}/v1/models`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          const models = data.data.map((m: any) => m.id || m.name).filter(Boolean);
          if (models.length > 0) return { models };
        }
      }
    } catch {}

    return { models: knownModels };
  },

  detectCapabilities(models: string[]): AIType[] {
    const caps: AIType[] = ['text', 'summary'];
    const all = models.join(' ').toLowerCase();
    if (all.includes('claude-3') || all.includes('claude-4') || all.includes('sonnet') || all.includes('opus')) {
      caps.push('vision');
    }
    return caps;
  },

  async testConnection(
    baseUrl: string,
    apiKey: string
  ): Promise<{ ok: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      const root = getApiBase({ baseUrl } as AIProvider);
      if (!root) return { ok: false, error: '请先填写 API 主机' };
      const response = await fetch(`${root}/v1/models`, {
        method: 'GET',
        headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      });
      if (response.ok || response.status === 401 || response.status === 403) {
        return { ok: true, latency: Date.now() - start };
      }
      return { ok: false, latency: Date.now() - start, error: `HTTP ${response.status}` };
    } catch (error: any) {
      return { ok: false, latency: Date.now() - start, error: getErrorMessage(error) };
    }
  },
};
