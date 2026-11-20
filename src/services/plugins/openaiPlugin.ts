import { AIProvider, ChatMessage, AIType } from '../../types';
import { safeFetch, ApiError, getErrorMessage, normalizeUrl } from '../../utils/networkUtils';
import { AIPlugin, ChatOptions } from './types';

const getApiBase = (provider: AIProvider): string => {
  const url = normalizeUrl(provider.baseUrl);
  if (!url) return '';
  return url
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/images\/generations\/?$/i, '')
    .replace(/\/models\/?$/i, '');
};

const buildHeaders = (provider: AIProvider) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${provider.apiKey}`,
  'User-Agent': 'AI-Tavern/2.0 (Mobile; ReactNative; Plugin: OpenAI Compatible)',
  Accept: 'application/json',
});

function parseSSEText(text: string, onStream: (chunk: string) => void, options: { onTokenUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void; onThinkingChunk?: (thinking: string) => void; onChunkEvent?: (e: any) => void } = {}): string {
  let fullText = '';
  let buffer = '';
  let usageReceived = false;

  const emitThinking = (t: string) => {
    if (!t) return;
    try { options.onThinkingChunk?.(t); } catch (e) { console.warn('onThinkingChunk callback error:', e); }
    try { options.onChunkEvent?.({ type: 'thinking', thinking: t }); } catch {}
  };
  const emitContent = (t: string) => {
    if (!t) return;
    fullText += t;
    try { onStream(t); } catch (e) { console.warn('onStream callback error:', e); }
    try { options.onChunkEvent?.({ type: 'content', content: t }); } catch {}
  };

  const lines = text.split('\n');
  for (const line of lines) {
    buffer += line + '\n';
    if (line.trim() === '') {
      const block = buffer;
      buffer = '';
      const dataLines = block.split('\n').filter((l) => l.trim().startsWith('data:'));
      for (const dl of dataLines) {
        const data = dl.trim().slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.usage && !usageReceived) {
            usageReceived = true;
            const usage = {
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              totalTokens: parsed.usage.total_tokens || 0,
            };
            options.onTokenUsage?.(usage);
            try { options.onChunkEvent?.({ type: 'usage', usage }); } catch {}
          }
          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content ?? parsed.choices?.[0]?.message?.content;
          const thinking =
            delta?.reasoning_content ??
            delta?.thinking ??
            delta?.reasoning ??
            (delta as any)?.delta?.reasoning ??
            parsed.choices?.[0]?.message?.reasoning_content ??
            parsed.choices?.[0]?.message?.thinking;
          if (thinking) emitThinking(thinking);
          if (content) emitContent(content);
        } catch {
        }
      }
    }
  }
  return fullText;
}

async function streamWithXHR(
  url: string,
  headers: Record<string, string>,
  body: string,
  onStream: (chunk: string) => void,
  options: { signal?: AbortSignal; onTokenUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void; onThinkingChunk?: (thinking: string) => void; onChunkEvent?: (e: any) => void } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let fullText = '';
    let lastIndex = 0;
    let buffer = '';
    let usageReceived = false;
    let isSettled = false;

    const emitThinking = (t: string) => {
      if (!t) return;
      try { options.onThinkingChunk?.(t); } catch (e) { console.warn('onThinkingChunk callback error:', e); }
      try { options.onChunkEvent?.({ type: 'thinking', thinking: t }); } catch {}
    };
    const emitContent = (t: string) => {
      if (!t) return;
      fullText += t;
      try { onStream(t); } catch (e) { console.warn('onStream callback error:', e); }
      try { options.onChunkEvent?.({ type: 'content', content: t }); } catch {}
    };
    const extractAndEmit = (parsed: any) => {
      if (parsed.usage && !usageReceived) {
        usageReceived = true;
        const usage = {
          promptTokens: parsed.usage.prompt_tokens || 0,
          completionTokens: parsed.usage.completion_tokens || 0,
          totalTokens: parsed.usage.total_tokens || 0,
        };
        options.onTokenUsage?.(usage);
        try { options.onChunkEvent?.({ type: 'usage', usage }); } catch {}
      }
      const delta = parsed.choices?.[0]?.delta;
      const content = delta?.content ?? parsed.choices?.[0]?.message?.content;
      const thinking =
        delta?.reasoning_content ??
        delta?.thinking ??
        delta?.reasoning ??
        (delta as any)?.delta?.reasoning ??
        parsed.choices?.[0]?.message?.reasoning_content ??
        parsed.choices?.[0]?.message?.thinking;
      if (thinking) emitThinking(thinking);
      if (content) emitContent(content);
    };

    const settleResolve = () => {
      if (!isSettled) {
        isSettled = true;
        resolve(fullText);
      }
    };

    const settleReject = (err: Error) => {
      if (!isSettled) {
        isSettled = true;
        reject(err);
      }
    };

    const processBuffer = () => {
      if (!buffer) return;
      // SSE 数据以空行分隔事件
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // 保留最后一个不完整的事件到 buffer

      for (const event of events) {
        const dataLines = event.split('\n').filter((l) => l.trim().startsWith('data:'));
        for (const dl of dataLines) {
          const data = dl.trim().slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            extractAndEmit(parsed);
          } catch {
            // 忽略解析错误，继续处理下一个
          }
        }
      }
    };

    xhr.open('POST', url, true);
    Object.keys(headers).forEach((key) => {
      xhr.setRequestHeader(key, headers[key]);
    });

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        settleReject(new ApiError('timeout', '请求被取消', undefined, false));
        return;
      }
      options.signal.addEventListener('abort', () => {
        xhr.abort();
      });
    }

    xhr.onprogress = () => {
      if (xhr.readyState >= 3 && xhr.responseText) {
        const newText = xhr.responseText.substring(lastIndex);
        lastIndex = xhr.responseText.length;
        buffer += newText;
        processBuffer();
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // 使用 processBuffer 处理 buffer 中剩余的数据
        // processBuffer 会保留最后一个不完整的事件到 buffer
        processBuffer();
        // 如果还有未处理的数据（没有以\n\n结尾的事件），也尝试处理
        if (buffer.trim()) {
          const dataLines = buffer.split('\n').filter((l) => l.trim().startsWith('data:'));
          for (const dl of dataLines) {
            const data = dl.trim().slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              extractAndEmit(parsed);
            } catch {
              // 忽略解析错误
            }
          }
        }
        settleResolve();
      } else {
        let errorMsg = `HTTP ${xhr.status}`;
        try {
          const data = JSON.parse(xhr.responseText);
          errorMsg = data.error?.message || data.message || errorMsg;
        } catch {}
        const err = new ApiError(
          xhr.status === 401 || xhr.status === 403 ? 'auth' :
          xhr.status === 429 ? 'rate_limit' :
          xhr.status >= 500 ? 'server' : 'client',
          errorMsg,
          xhr.status,
          xhr.status >= 500
        );
        settleReject(err);
      }
    };

    xhr.onerror = () => {
      settleReject(new ApiError('network', '无法连接到服务器，请检查网络或地址', undefined, true));
    };

    xhr.onabort = () => {
      // 处理 buffer 中剩余的数据（强制停止时仍保存已接收的内容）
      processBuffer();
      if (buffer.trim()) {
        const dataLines = buffer.split('\n').filter((l) => l.trim().startsWith('data:'));
        for (const dl of dataLines) {
          const data = dl.trim().slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            extractAndEmit(parsed);
          } catch {}
        }
      }
      settleResolve();
    };

    try {
      xhr.send(body);
    } catch (e: any) {
      settleReject(new ApiError('unknown', e?.message || '请求失败', undefined, true));
    }
  });
}

async function parseOpenAIStream(
  response: Response,
  onStream: (chunk: string) => void,
  options: { onTokenUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void; onThinkingChunk?: (thinking: string) => void; onChunkEvent?: (e: any) => void } = {}
): Promise<string> {
  if (response.body && typeof (response.body as any).getReader === 'function') {
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let usageReceived = false;

      const emitThinking = (t: string) => {
        if (!t) return;
        try { options.onThinkingChunk?.(t); } catch (e) { console.warn('onThinkingChunk callback error:', e); }
        try { options.onChunkEvent?.({ type: 'thinking', thinking: t }); } catch {}
      };
      const emitContent = (t: string) => {
        if (!t) return;
        fullText += t;
        try { onStream(t); } catch (e) { console.warn('onStream callback error:', e); }
        try { options.onChunkEvent?.({ type: 'content', content: t }); } catch {}
      };
      const extractAndEmit = (parsed: any) => {
        if (parsed.usage && !usageReceived) {
          usageReceived = true;
          const usage = {
            promptTokens: parsed.usage.prompt_tokens || 0,
            completionTokens: parsed.usage.completion_tokens || 0,
            totalTokens: parsed.usage.total_tokens || 0,
          };
          options.onTokenUsage?.(usage);
          try { options.onChunkEvent?.({ type: 'usage', usage }); } catch {}
        }
        const delta = parsed.choices?.[0]?.delta;
        const content = delta?.content ?? parsed.choices?.[0]?.message?.content;
        const thinking =
          delta?.reasoning_content ??
          delta?.thinking ??
          delta?.reasoning ??
          (delta as any)?.delta?.reasoning ??
          parsed.choices?.[0]?.message?.reasoning_content ??
          parsed.choices?.[0]?.message?.thinking;
        if (thinking) emitThinking(thinking);
        if (content) emitContent(content);
      };

      const processBufferData = (buf: string): string => {
        if (!buf) return '';
        // SSE 数据以空行(\n\n)分隔事件
        const events = buf.split('\n\n');
        const remaining = events.pop() || ''; // 保留最后一个不完整的事件到下一次
        let processedData = '';

        for (const event of events) {
          const dataLines = event.split('\n').filter((l) => l.trim().startsWith('data:'));
          for (const dl of dataLines) {
            const data = dl.trim().slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              extractAndEmit(parsed);
              // processedData 仅用于最后兜底判断有没有非 reasoning 的内容产出
              const delta = parsed.choices?.[0]?.delta;
              const content = delta?.content ?? parsed.choices?.[0]?.message?.content;
              if (content) processedData += content;
            } catch {
              // 忽略解析错误
            }
          }
        }

        return processedData;
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // 使用 processBufferData 处理已完成的 SSE 事件
          // processBufferData 会保留最后一个不完整的事件在 buffer 中
          const remainingStart = buffer.lastIndexOf('\n\n');
          if (remainingStart >= 0) {
            // 有完整的事件可以处理
            const processedPart = buffer.substring(0, remainingStart + 2);
            buffer = buffer.substring(remainingStart + 2);
            processBufferData(processedPart);
          }
        }

        // 流结束后，处理 buffer 中所有剩余数据
        if (buffer.trim()) {
          // 确保最后一个事件也被处理
          const finalData = processBufferData(buffer);
          // 如果还有未处理的数据（没有以\n\n结尾的事件），也尝试处理
          if (!finalData && buffer.trim()) {
            const dataLines = buffer.split('\n').filter((l) => l.trim().startsWith('data:'));
            for (const dl of dataLines) {
              const data = dl.trim().slice(5).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                extractAndEmit(parsed);
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return fullText;
        }
        throw new ApiError('parse', '解析流式响应失败：' + (err?.message || '未知错误'));
      }

      return fullText;
    } catch (e) {
      const text = await response.text();
      return parseSSEText(text, onStream, options);
    }
  } else {
    const text = await response.text();
    return parseSSEText(text, onStream, options);
  }
}

export const openaiPlugin: AIPlugin = {
  id: 'openai-compatible',
  name: 'OpenAI 兼容',
  format: 'openai',
  description: '兼容 OpenAI Chat Completions API 格式的通用插件，支持大多数国产大模型',
  capabilities: {
    text: true,
    image: true,
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
    if (systemPrompt) {
      formattedMessages.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of messages) {
      if (msg.role === 'system') continue;
      const imgs = (msg.images || []).filter(Boolean);
      // 只有 user 消息允许带图。
      // 很多 API（DeepSeek 官方就是）会直接报
      // "Image in assistant message is not supported" 并把整轮请求打回，
      // 所以 AI 自己发过的表情包/图片要退回成文字说明，保住上下文但不带图。
      if (imgs.length > 0 && msg.role === 'user') {
        const content: any[] = [{ type: 'text', text: msg.content }];
        for (const img of imgs) {
          content.push({ type: 'image_url', image_url: { url: img } });
        }
        formattedMessages.push({ role: msg.role, content });
      } else if (imgs.length > 0) {
        const note = `（发送了 ${imgs.length} 张图片/表情包）`;
        formattedMessages.push({
          role: msg.role,
          content: msg.content ? `${msg.content}\n${note}` : note,
        });
      } else {
        formattedMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: any = {
      model: provider.model,
      messages: formattedMessages,
      stream: streamCallback ? true : false,
    };

    const supportsReadableStream = typeof ReadableStream !== 'undefined' && typeof Response !== 'undefined' && 
      (Response.prototype?.body?.getReader || typeof (new Response()).body?.getReader === 'function');

    if (streamCallback && !supportsReadableStream) {
      let lastError: any;
      for (let attempt = 0; attempt <= (options.retries ?? 0); attempt++) {
        try {
          return await streamWithXHR(
            `${baseUrl}/chat/completions`,
            buildHeaders(provider),
            JSON.stringify(body),
            streamCallback,
            {
              signal: options.signal,
              onTokenUsage: options.onTokenUsage,
              onThinkingChunk: options.onThinkingChunk,
              onChunkEvent: options.onChunkEvent,
            }
          );
        } catch (err: any) {
          if (err?.retryable && attempt < (options.retries ?? 0)) {
            options.onRetry?.(attempt + 1, err);
            const delay = 1000 * (attempt + 1);
            await new Promise((r) => setTimeout(r, delay));
          } else {
            throw err;
          }
          lastError = err;
        }
      }
      throw lastError || new ApiError('unknown', '请求失败', undefined, false);
    }

    const fetchWithRetry = async (attempt = 0): Promise<Response> => {
      try {
        return await safeFetch(
          `${baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: buildHeaders(provider),
            body: JSON.stringify(body),
          },
          { retries: 0, timeout: options.timeout ?? 1800000, signal: options.signal }
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

    if (streamCallback) {
      const supportsReader = response.body && typeof (response.body as any).getReader === 'function';
      if (supportsReader) {
        return parseOpenAIStream(response, streamCallback, {
          onTokenUsage: options.onTokenUsage,
          onThinkingChunk: options.onThinkingChunk,
          onChunkEvent: options.onChunkEvent,
        });
      } else {
        return streamWithXHR(
          `${baseUrl}/chat/completions`,
          buildHeaders(provider),
          JSON.stringify(body),
          streamCallback,
          {
            signal: options.signal,
            onTokenUsage: options.onTokenUsage,
            onThinkingChunk: options.onThinkingChunk,
            onChunkEvent: options.onChunkEvent,
          }
        );
      }
    }

    try {
      const data = await response.json();
      options.onTokenUsage?.({
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      });
      const msg = data.choices?.[0]?.message;
      const content =
        msg?.content ??
        msg?.output_text ??
        msg?.answer ??
        msg?.response ??
        data.output_text ??
        data.answer ??
        data.response ??
        data.choices?.[0]?.text ??
        '';
      const reasoning =
        msg?.reasoning_content ??
        msg?.thinking ??
        msg?.reasoning ??
        data.reasoning_content ??
        data.thinking ??
        data.reasoning ??
        '';
      if (reasoning) {
        try { options.onThinkingChunk?.(reasoning); } catch {}
        try { options.onChunkEvent?.({ type: 'thinking', thinking: reasoning }); } catch {}
      }
      // 修复：部分供应商 content 为 null，但 reasoning / 思考内容存在；此时返回内容至少要包含推理后的正式内容，否则直接把 reasoning 作为兜底
      return content || reasoning || '';
    } catch (err: any) {
      throw new ApiError('parse', '解析响应失败：' + (err?.message || 'JSON 错误'));
    }
  },

  async generateImage(
    provider: AIProvider,
    prompt: string,
    size: string = '1024x1024',
    options: ChatOptions = {}
  ): Promise<string[]> {
    const baseUrl = getApiBase(provider);
    if (!baseUrl) throw new ApiError('no_base_url', '请先配置 Base URL');
    if (!provider.apiKey) throw new ApiError('no_api_key', '请先配置 API 密钥');

    const body: any = {
      model: provider.model,
      prompt,
      n: 1,
      size,
    };

    try {
      const response = await safeFetch(
        `${baseUrl}/images/generations`,
        {
          method: 'POST',
          headers: buildHeaders(provider),
          body: JSON.stringify(body),
        },
        { retries: options.retries ?? 1 }
      );

      const data = await response.json();
      const results = data.data?.map((item: any) => {
        if (item.url) return item.url;
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        return null;
      }).filter(Boolean) || [];
      return results;
    } catch (err: any) {
      throw new ApiError(err?.kind || 'unknown', getErrorMessage(err), err?.status, false);
    }
  },

  async visionAnalyze(
    provider: AIProvider,
    imageUrl: string,
    prompt: string,
    options: ChatOptions = {}
  ): Promise<string> {
    const baseUrl = getApiBase(provider);
    if (!baseUrl) throw new ApiError('no_base_url', '请先配置 Base URL');
    if (!provider.apiKey) throw new ApiError('no_api_key', '请先配置 API 密钥');

    const body = {
      model: provider.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    };

    try {
      const response = await safeFetch(
        `${baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: buildHeaders(provider),
          body: JSON.stringify(body),
        },
        { retries: options.retries ?? 1 }
      );

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      throw new ApiError(err?.kind || 'unknown', getErrorMessage(err), err?.status, false);
    }
  },

  async fetchModels(
    baseUrl: string,
    apiKey: string,
    options: ChatOptions = {}
  ): Promise<{ models: string[]; error?: string }> {
    const normalized = normalizeUrl(baseUrl)
      .replace(/\/chat\/completions\/?$/i, '')
      .replace(/\/images\/generations\/?$/i, '')
      .replace(/\/models\/?$/i, '');
    if (!normalized) {
      return { models: [], error: '请先填写 API 主机' };
    }
    if (!apiKey) {
      return { models: [], error: '请先填写 API 密钥' };
    }

    const tryUrls = [`${normalized}/models`];
    if (!normalized.match(/\/v\d+$/i)) {
      tryUrls.push(`${normalized}/v1/models`);
    }

    let lastError = '';

    for (const url of tryUrls) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': 'AI-Tavern/2.0',
            Accept: 'application/json',
          },
          signal: options.signal,
        });

        const text = await response.text();
        if (!text || text.trim().length === 0) {
          lastError = `HTTP ${response.status}: 服务器返回空响应`;
          continue;
        }

        if (text.startsWith('<') || text.includes('<html') || text.includes('Cloudflare')) {
          lastError = '检测到反爬验证，无法自动获取模型。请手动添加模型名称。';
          continue;
        }

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          lastError = `HTTP ${response.status}: 响应不是JSON：${text.substring(0, 100)}`;
          continue;
        }

        let models: string[] = [];
        if (Array.isArray(data.data)) {
          models = data.data.map((m: any) => m.id || m.name).filter(Boolean);
        } else if (Array.isArray(data.models)) {
          models = data.models.map((m: any) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
        } else if (Array.isArray(data)) {
          models = data.map((m: any) => typeof m === 'string' ? m : (m.id || m.name)).filter(Boolean);
        }

        if (models.length > 0) {
          return { models };
        }
        lastError = `HTTP ${response.status}: 未获取到模型列表`;
      } catch (err: any) {
        lastError = getErrorMessage(err);
      }
    }

    return { models: [], error: lastError || '获取失败，请手动添加模型名称' };
  },

  detectCapabilities(models: string[]): AIType[] {
    const capabilities: Set<AIType> = new Set();
    const allModels = models.join(' ').toLowerCase();

    if (models.length > 0) {
      capabilities.add('text');
    }

    const imageKeywords = ['dall-e', 'dalle', 'stable-diffusion', 'sdxl', 'midjourney', 'flux', 'imagen', 'cogview', 'wanx', 'stable_diffusion'];
    if (imageKeywords.some((kw) => allModels.includes(kw))) {
      capabilities.add('image');
    }

    const visionKeywords = ['vision', 'gpt-4o', 'gpt-4-vision', 'claude-3', 'gemini', 'qwen-vl', 'glm-4v', 'llava', 'vl', 'plus', 'max', 'pro'];
    if (visionKeywords.some((kw) => allModels.includes(kw))) {
      capabilities.add('vision');
    }

    if (capabilities.has('text')) {
      capabilities.add('summary');
    }

    return Array.from(capabilities);
  },

  async testConnection(
    baseUrl: string,
    apiKey: string
  ): Promise<{ ok: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      const root = getApiBase({ baseUrl } as AIProvider);
      if (!root) {
        return { ok: false, error: '请先填写 API 主机' };
      }

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const response = await fetch(`${root}/models`, { method: 'GET', headers });

      if (response.ok || response.status === 401 || response.status === 403 || response.status === 404) {
        return { ok: true, latency: Date.now() - start };
      }

      return { ok: false, latency: Date.now() - start, error: `HTTP ${response.status}` };
    } catch (error: any) {
      return {
        ok: false,
        latency: Date.now() - start,
        error: getErrorMessage(error),
      };
    }
  },
};
