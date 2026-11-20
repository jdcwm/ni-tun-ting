export type PluginType = 'ai' | 'worldbook' | 'fancywork' | 'filter' | 'command';

export interface PluginBase {
  id: string;
  name: string;
  type: PluginType;
  version: string;
  description?: string;
  author?: string;
  website?: string;
  enabled: boolean;
}

export interface WorldBookPlugin extends PluginBase {
  type: 'worldbook';
  entries: Array<{
    id?: string;
    keys: string[];
    content: string;
    priority?: number;
    enabled?: boolean;
  }>;
  category?: string;
}

export interface FancyWorkPlugin extends PluginBase {
  type: 'fancywork';
  html: string;
  css?: string;
  js?: string;
  position?: 'sidebar' | 'overlay' | 'welcome' | 'chat_bg';
  width?: number;
  height?: number;
}

export interface ChatFilterPlugin extends PluginBase {
  type: 'filter';
  onBeforeSend?: (content: string) => string | Promise<string>;
  onAfterReceive?: (content: string) => string | Promise<string>;
  onBeforeSystemPrompt?: (prompt: string) => string | Promise<string>;
}

export type Plugin = WorldBookPlugin | FancyWorkPlugin | ChatFilterPlugin;

class PluginManager {
  private plugins: Map<string, Plugin> = new Map();

  register(plugin: Plugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  get(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getByType<T extends Plugin>(type: PluginType): T[] {
    return this.getAll().filter((p) => p.type === type && p.enabled) as T[];
  }

  enable(id: string): boolean {
    const p = this.plugins.get(id);
    if (p) {
      p.enabled = true;
      return true;
    }
    return false;
  }

  disable(id: string): boolean {
    const p = this.plugins.get(id);
    if (p) {
      p.enabled = false;
      return true;
    }
    return false;
  }

  async applyInputFilters(content: string): Promise<string> {
    let result = content;
    for (const plugin of this.getByType<ChatFilterPlugin>('filter')) {
      if (plugin.onBeforeSend) {
        try {
          result = await plugin.onBeforeSend(result);
        } catch (e) {
          console.warn(`[plugin] filter ${plugin.id} onBeforeSend error:`, e);
        }
      }
    }
    return result;
  }

  async applyOutputFilters(content: string): Promise<string> {
    let result = content;
    for (const plugin of this.getByType<ChatFilterPlugin>('filter')) {
      if (plugin.onAfterReceive) {
        try {
          result = await plugin.onAfterReceive(result);
        } catch (e) {
          console.warn(`[plugin] filter ${plugin.id} onAfterReceive error:`, e);
        }
      }
    }
    return result;
  }

  async applySystemPromptFilters(prompt: string): Promise<string> {
    let result = prompt;
    for (const plugin of this.getByType<ChatFilterPlugin>('filter')) {
      if (plugin.onBeforeSystemPrompt) {
        try {
          result = await plugin.onBeforeSystemPrompt(result);
        } catch (e) {
          console.warn(`[plugin] filter ${plugin.id} onBeforeSystemPrompt error:`, e);
        }
      }
    }
    return result;
  }

  collectWorldBookEntries(): WorldBookPlugin['entries'] {
    const all: WorldBookPlugin['entries'] = [];
    for (const plugin of this.getByType<WorldBookPlugin>('worldbook')) {
      for (const entry of plugin.entries) {
        if (entry.enabled !== false) {
          all.push({ ...entry, id: entry.id || `${plugin.id}_${all.length}` });
        }
      }
    }
    return all;
  }

  collectFancyWorks(position?: string): FancyWorkPlugin[] {
    const works = this.getByType<FancyWorkPlugin>('fancywork');
    if (position) {
      return works.filter((w) => w.position === position);
    }
    return works;
  }
}

export const pluginManager = new PluginManager();
