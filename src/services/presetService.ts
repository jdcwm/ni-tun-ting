import { 
  Preset, 
  PresetType, 
  AIProviderPreset, 
  ModelParameters, 
  PromptPreset,
  ChatSettings,
  ThemeConfig,
  WorldBook,
  Character
} from '../types';
import { generateId } from '../constants/defaults';

export const presetService = {
  createPreset<T extends Preset>(
    type: PresetType,
    name: string,
    data: Partial<T>,
    description?: string
  ): T {
    const now = Date.now();
    const basePreset: Preset = {
      id: generateId(),
      name,
      description,
      type,
      createdAt: now,
      updatedAt: now,
      isFavorite: false,
      order: 0,
    };
    return { ...basePreset, ...data } as T;
  },

  createAIProviderPreset(
    name: string,
    providerFormat: string,
    baseUrl: string,
    model: string,
    parameters: ModelParameters,
    apiKey?: string,
    description?: string
  ): AIProviderPreset {
    return this.createPreset<AIProviderPreset>('ai_provider', name, {
      providerFormat: providerFormat as any,
      baseUrl,
      model,
      parameters,
      apiKey,
    }, description);
  },

  createPromptPreset(
    name: string,
    data: Partial<PromptPreset>,
    description?: string
  ): PromptPreset {
    return this.createPreset<PromptPreset>('prompt', name, data, description);
  },

  duplicatePreset<T extends Preset>(preset: T, newName?: string): T {
    return {
      ...preset,
      id: generateId(),
      name: newName || `${preset.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isFavorite: false,
    };
  },

  updatePreset<T extends Preset>(preset: T, updates: Partial<T>): T {
    return {
      ...preset,
      ...updates,
      updatedAt: Date.now(),
    };
  },

  exportPreset(preset: Preset): string {
    const exportData = {
      ...preset,
      _export_meta: {
        exported_at: Date.now(),
        version: '1.0',
      },
    };
    return JSON.stringify(exportData, null, 2);
  },

  importPreset(json: string): Preset | null {
    try {
      const parsed = JSON.parse(json);
      if (!parsed.id || !parsed.name || !parsed.type) {
        return null;
      }
      const preset: Preset = {
        id: generateId(),
        name: parsed.name,
        description: parsed.description,
        type: parsed.type as PresetType,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isFavorite: false,
        order: parsed.order || 0,
        ...parsed,
      };
      return preset;
    } catch {
      return null;
    }
  },

  exportPresets(presets: Preset[]): string {
    const exportData = {
      presets: presets.map((p) => ({ ...p })),
      _export_meta: {
        exported_at: Date.now(),
        version: '1.0',
        count: presets.length,
      },
    };
    return JSON.stringify(exportData, null, 2);
  },

  importPresets(json: string): Preset[] | null {
    try {
      const parsed = JSON.parse(json);
      const presets = Array.isArray(parsed) ? parsed : parsed.presets;
      if (!Array.isArray(presets)) return null;
      
      return presets.map((p: any) => ({
        id: generateId(),
        name: p.name || 'Unnamed Preset',
        description: p.description,
        type: p.type || 'ai_provider',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isFavorite: false,
        order: p.order || 0,
        ...p,
      }));
    } catch {
      return null;
    }
  },

  sortPresets(presets: Preset[], sortBy: 'name' | 'date' | 'favorites' | 'order' = 'order'): Preset[] {
    return [...presets].sort((a, b) => {
      if (sortBy === 'favorites') {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'date') {
        return b.updatedAt - a.updatedAt;
      }
      return (a.order || 0) - (b.order || 0);
    });
  },

  filterPresets(presets: Preset[], type?: PresetType, search?: string): Preset[] {
    let filtered = presets;
    if (type) {
      filtered = filtered.filter((p) => p.type === type);
    }
    if (search && search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.description || '').toLowerCase().includes(query)
      );
    }
    return filtered;
  },

  getDefaultModelParameters(): ModelParameters {
    return {
      temperature: 0.7,
      topP: 0.9,
      topK: 0,
      repetitionPenalty: 1.1,
      repetitionPenaltyRange: 0,
      repetitionPenaltySlope: 0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxTokens: 4096,
      maxContextLength: 8192,
      stopSequences: [],
      seed: undefined,
      mirostat: 0,
      mirostatTau: 5.0,
      mirostatEta: 0.1,
      stream: true,
      temperatureLast: false,
      dynamicTemp: false,
      dynatempLow: 0.3,
      dynatempHigh: 1.0,
      dynatempExponent: 1.0,
      smoothingFactor: 0.0,
    };
  },

  getDefaultPromptPresets(): PromptPreset[] {
    const now = Date.now();
    return [
      // ── 系统设定 ──
      {
        id: 'default_balanced',
        name: '平衡模式',
        description: '通用的角色扮演预设，平衡创造性和一致性',
        type: 'prompt',
        category: 'system',
        createdAt: now,
        updatedAt: now,
        isFavorite: true,
        order: 0,
        systemPrompt: '你是一个富有创造力的AI助手，擅长角色扮演。请始终保持角色设定，给出生动、自然的回复。',
        includeCharacterSystemPrompt: true,
        includeWorldBookSystemPrompt: true,
      },
      {
        id: 'default_creative',
        name: '创意模式',
        description: '更具创造性和想象力的回复',
        type: 'prompt',
        category: 'system',
        createdAt: now,
        updatedAt: now,
        isFavorite: false,
        order: 1,
        systemPrompt: '你是一个极具创造力的故事讲述者。请用生动的语言、丰富的细节和意想不到的转折来推进故事。不要害怕打破常规，让对话充满惊喜。',
        includeCharacterSystemPrompt: true,
        includeWorldBookSystemPrompt: true,
      },
      {
        id: 'default_strict',
        name: '严格模式',
        description: '严格遵循角色设定，保持一致性',
        type: 'prompt',
        category: 'system',
        createdAt: now,
        updatedAt: now,
        isFavorite: false,
        order: 2,
        systemPrompt: '你必须严格遵循角色设定和世界观。保持角色的性格、语气和行为模式的一致性。不要做不符合角色设定的事情或说不符合角色设定的话。',
        includeCharacterSystemPrompt: true,
        includeWorldBookSystemPrompt: true,
      },
      {
        id: 'render_demo',
        name: '渲染演示',
        description: '展示AIJS渲染引擎的各种炫酷效果',
        type: 'prompt',
        category: 'system',
        createdAt: now,
        updatedAt: now,
        isFavorite: true,
        order: 3,
        systemPrompt: `你是一个演示AIJS渲染引擎能力的助手。当用户说"开始演示"或类似内容时，你需要输出JavaScript代码来展示各种炫酷效果。

可用能力清单：

1. CSS3动画：渐变背景、发光效果、动画keyframes、transform
2. SVG绘图：环形仪表、图标、路径动画
3. Canvas绘图：粒子效果、动态图形
4. 交互组件：按钮、标签页切换、触摸滑动
5. 玻璃拟态：毛玻璃效果、backdrop-filter
6. 内置组件：progressBar、statCard、gauge、badge、card、chip、tabs等

示例演示代码格式：

\`\`\`js
// 演示1：RPG状态栏
setVar('hp', 85);
setVar('mp', 60);
ui.inline.render(\`
  <div style="background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);border-radius:16px;padding:16px;">
    <div style="display:flex;gap:12px;flex-direction:column;">
      \${ui.components.progressBar({value:85,max:100,label:'❤️ 生命值',color:'linear-gradient(90deg,#ff6b6b,#ee5a5a)',height:10})}
      \${ui.components.progressBar({value:60,max:100,label:'💙 魔法值',color:'linear-gradient(90deg,#4FC3F7,#29B6F6)',height:10})}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      \${ui.components.statCard({icon:'⚔️',label:'攻击',value:'156'})}
      \${ui.components.statCard({icon:'🛡️',label:'防御',value:'89'})}
    </div>
  </div>
\`);
\`\`\`

规则：
- 用户每次请求只演示一个效果，保持简洁
- 使用ui.inline.render()渲染到消息内
- 代码必须用\`\`\`js代码块包裹
- HTML用反引号模板字符串
- 优先使用内置组件，也可以直接写原生HTML/CSS/JS`,
        includeCharacterSystemPrompt: false,
        includeWorldBookSystemPrompt: false,
      },
      // ── 用户人设 ──
      {
        id: 'persona_default',
        name: '默认用户',
        description: '通用用户人设模板',
        type: 'prompt',
        category: 'persona',
        createdAt: now,
        updatedAt: now,
        isFavorite: true,
        order: 0,
        personaDescription: '我是一个普通的冒险者，性格开朗，善于交际。喜欢探索未知的事物，对各种文化和历史都有浓厚的兴趣。',
      },
      {
        id: 'persona_scholar',
        name: '学者人设',
        description: '博学多才的学者角色',
        type: 'prompt',
        category: 'persona',
        createdAt: now,
        updatedAt: now,
        isFavorite: false,
        order: 1,
        personaDescription: '我是一位游历四方的学者，对古代文明和神秘魔法有深入研究。性格沉稳，善于分析，说话时喜欢引用古籍和典故。',
      },
      // ── 正则 ──
      {
        id: 'regex_status_format',
        name: '状态栏格式化',
        description: '提取状态栏标签并格式化输出',
        type: 'prompt',
        category: 'regex',
        createdAt: now,
        updatedAt: now,
        isFavorite: true,
        order: 0,
        systemPrompt: '请在回复中用 <Status> 标签包裹角色状态信息，格式如下：\n<Status>\nHP: 数值/最大值\nMP: 数值/最大值\n情绪: 描述\n位置: 描述\n</Status>\n状态栏会自动渲染在前端，不需要额外描述。',
        findRegex: '<Status>([\\s\\S]*?)<\\/Status>',
        replaceString: '',
        isRegexEnabled: true,
        regexScope: 'output',
      },
      {
        id: 'regex_code_clean',
        name: '代码块清理',
        description: '清理消息中的代码块，仅保留渲染结果',
        type: 'prompt',
        category: 'regex',
        createdAt: now,
        updatedAt: now,
        isFavorite: false,
        order: 1,
        systemPrompt: '你可以在回复中使用代码块来渲染动态界面。代码块会被自动提取并执行。',
        findRegex: '```(?:js|javascript|html|css)[\\s\\S]*?```',
        replaceString: '',
        isRegexEnabled: true,
        regexScope: 'output',
      },
      {
        id: 'regex_thinking',
        name: '思考过程隐藏',
        description: '隐藏AI的思考过程标签',
        type: 'prompt',
        category: 'regex',
        createdAt: now,
        updatedAt: now,
        isFavorite: false,
        order: 2,
        systemPrompt: '你可以在回复中使用 <think></think> 标签来记录思考过程，这些内容不会显示给用户。',
        findRegex: '<think>[\\s\\S]*?<\\/think>',
        replaceString: '',
        isRegexEnabled: true,
        regexScope: 'output',
      },
    ];
  },

  worldBookToPreset(worldBook: WorldBook): Preset & { worldBook: WorldBook } {
    return {
      id: generateId(),
      name: worldBook.name,
      description: worldBook.description,
      type: 'world_book',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isFavorite: false,
      order: 0,
      worldBook,
    } as any;
  },

  characterToPreset(character: Character): Preset & { character: Character } {
    return {
      id: generateId(),
      name: character.name,
      description: character.description.substring(0, 100),
      type: 'character',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isFavorite: character.isFavorite,
      order: 0,
      character,
    } as any;
  },

  chatSettingsToPreset(settings: ChatSettings, name: string): Preset & { settings: ChatSettings } {
    return {
      id: generateId(),
      name,
      type: 'chat_settings',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isFavorite: false,
      order: 0,
      settings,
    } as any;
  },

  themeToPreset(theme: ThemeConfig, name: string): Preset & { theme: ThemeConfig } {
    return {
      id: generateId(),
      name,
      type: 'theme',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isFavorite: false,
      order: 0,
      theme,
    } as any;
  },

  validatePresetType(preset: any, type: PresetType): boolean {
    if (!preset || preset.type !== type) return false;
    
    switch (type) {
      case 'ai_provider':
        return !!preset.providerFormat && !!preset.model;
      case 'prompt':
        return true;
      case 'chat_settings':
        return !!preset.settings;
      case 'world_book':
        return !!preset.worldBook;
      case 'character':
        return !!preset.character;
      case 'theme':
        return !!preset.theme;
      default:
        return true;
    }
  },
};
