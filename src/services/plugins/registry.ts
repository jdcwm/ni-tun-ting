import { AIPlugin, PluginPreset, ApiFormat } from './types';
import { openaiPlugin } from './openaiPlugin';
import { anthropicPlugin } from './anthropicPlugin';
import { geminiPlugin } from './geminiPlugin';
import { ollamaPlugin } from './ollamaPlugin';
import { pythonProxyPlugin } from './pythonProxyPlugin';

class PluginRegistry {
  private plugins: Map<string, AIPlugin> = new Map();
  private presets: Map<string, PluginPreset> = new Map();

  constructor() {
    this.register(openaiPlugin);
    this.register(anthropicPlugin);
    this.register(geminiPlugin);
    this.register(ollamaPlugin);
    this.register(pythonProxyPlugin);

    this.registerPresets([
      {
        id: 'openai',
        name: 'OpenAI',
        format: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o',
        capabilities: ['text', 'image', 'vision', 'summary'],
        description: 'OpenAI 官方 API',
        website: 'https://platform.openai.com',
      },
      {
        id: 'deepseek',
        name: 'DeepSeek (深度求索)',
        format: 'openai',
        baseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        capabilities: ['text', 'summary'],
        description: '国产高性价比大模型',
        website: 'https://platform.deepseek.com',
      },
      {
        id: 'qwen',
        name: '通义千问 (阿里云)',
        format: 'openai',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        defaultModel: 'qwen-plus',
        capabilities: ['text', 'image', 'vision', 'summary'],
        description: '阿里云通义千问系列',
        website: 'https://dashscope.aliyun.com',
      },
      {
        id: 'zhipu',
        name: '智谱 AI (GLM)',
        format: 'openai',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        defaultModel: 'glm-4-plus',
        capabilities: ['text', 'image', 'vision', 'summary'],
        description: '智谱AI GLM系列模型',
        website: 'https://open.bigmodel.cn',
      },
      {
        id: 'doubao',
        name: '豆包 (字节跳动)',
        format: 'openai',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        defaultModel: 'doubao-pro-32k',
        capabilities: ['text', 'image', 'vision', 'summary'],
        description: '字节跳动火山引擎豆包',
        website: 'https://www.volcengine.com/product/doubao',
      },
      {
        id: 'moonshot',
        name: '月之暗面 (Kimi)',
        format: 'openai',
        baseUrl: 'https://api.moonshot.cn/v1',
        defaultModel: 'moonshot-v1-8k',
        capabilities: ['text', 'summary'],
        description: 'Kimi 长文本大模型',
        website: 'https://platform.moonshot.cn',
      },
      {
        id: 'yi',
        name: '零一万物 (Yi)',
        format: 'openai',
        baseUrl: 'https://api.lingyiwanwu.com/v1',
        defaultModel: 'yi-large',
        capabilities: ['text', 'summary'],
        description: '零一万物 Yi 系列模型',
        website: 'https://platform.lingyiwanwu.com',
      },
      {
        id: 'siliconflow',
        name: 'SiliconFlow (硅基流动)',
        format: 'openai',
        baseUrl: 'https://api.siliconflow.cn/v1',
        defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
        capabilities: ['text', 'image', 'summary'],
        description: '开源大模型聚合平台',
        website: 'https://siliconflow.cn',
      },
      {
        id: 'groq',
        name: 'Groq',
        format: 'openai',
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.1-70b-versatile',
        capabilities: ['text', 'summary'],
        description: '超快推理速度的 Groq 平台',
        website: 'https://groq.com',
      },
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        format: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        defaultModel: 'claude-3-5-sonnet-20241022',
        capabilities: ['text', 'vision', 'summary'],
        description: 'Claude 系列模型，长文本能力强',
        website: 'https://www.anthropic.com',
      },
      {
        id: 'gemini',
        name: 'Google Gemini',
        format: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        defaultModel: 'gemini-2.0-flash',
        capabilities: ['text', 'vision', 'summary'],
        description: 'Google Gemini 系列模型',
        website: 'https://ai.google.dev',
      },
      {
        id: 'ollama',
        name: 'Ollama (本地模型)',
        format: 'ollama',
        baseUrl: 'http://localhost:11434',
        defaultModel: 'llama3.1',
        capabilities: ['text', 'summary'],
        description: '本地部署开源大模型，完全离线',
        website: 'https://ollama.com',
      },
      {
        id: 'azure',
        name: 'Azure OpenAI',
        format: 'azure',
        baseUrl: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
        defaultModel: 'gpt-4o',
        capabilities: ['text', 'image', 'vision', 'summary'],
        description: '微软 Azure 上的 OpenAI 服务',
        website: 'https://azure.microsoft.com',
      },
      {
        id: 'minimax',
        name: 'MiniMax (海螺)',
        format: 'openai',
        baseUrl: 'https://api.minimax.chat/v1',
        defaultModel: 'abab6.5s-chat',
        capabilities: ['text', 'summary'],
        description: 'MiniMax 大模型平台',
        website: 'https://www.minimaxi.com',
      },
      {
        id: 'stepfun',
        name: '阶跃星辰 (StepFun)',
        format: 'openai',
        baseUrl: 'https://api.stepfun.com/v1',
        defaultModel: 'step-2-16k',
        capabilities: ['text', 'vision', 'summary'],
        description: '阶跃星辰大模型',
        website: 'https://platform.stepfun.com',
      },
      {
        id: 'baichuan',
        name: '百川智能',
        format: 'openai',
        baseUrl: 'https://api.baichuan-ai.com/v1',
        defaultModel: 'Baichuan4',
        capabilities: ['text', 'summary'],
        description: '百川智能大模型',
        website: 'https://platform.baichuan-ai.com',
      },
      {
        id: 'hunyuan',
        name: '腾讯混元',
        format: 'openai',
        baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        defaultModel: 'hunyuan-pro',
        capabilities: ['text', 'summary'],
        description: '腾讯混元大模型',
        website: 'https://cloud.tencent.com/product/hunyuan',
      },
      {
        id: 'wenxin',
        name: '文心一言 (百度)',
        format: 'openai',
        baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/v2',
        defaultModel: 'ernie-4.0',
        capabilities: ['text', 'summary'],
        description: '百度文心一言',
        website: 'https://cloud.baidu.com/product/wenxinworkshop',
      },
      {
        id: 'local-openai',
        name: '本地部署 (OpenAI 兼容)',
        format: 'openai',
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
        capabilities: ['text', 'summary'],
        description: 'LM Studio / text-generation-webui 等本地 OpenAI 兼容 API',
        website: '',
      },
    ]);
  }

  register(plugin: AIPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  unregister(pluginId: string): boolean {
    return this.plugins.delete(pluginId);
  }

  get(pluginId: string): AIPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getByFormat(format: ApiFormat): AIPlugin | undefined {
    for (const plugin of this.plugins.values()) {
      if (plugin.format === format) return plugin;
    }
    return this.plugins.get('openai-compatible');
  }

  getAll(): AIPlugin[] {
    return Array.from(this.plugins.values());
  }

  registerPresets(presets: PluginPreset[]): void {
    for (const preset of presets) {
      this.presets.set(preset.id, preset);
    }
  }

  getPresets(): PluginPreset[] {
    return Array.from(this.presets.values());
  }

  getPreset(id: string): PluginPreset | undefined {
    return this.presets.get(id);
  }
}

export const pluginRegistry = new PluginRegistry();
