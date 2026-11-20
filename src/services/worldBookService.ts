import { WorldBook, WorldBookEntry, WorldBookScanResult, WorldBookScannerOptions } from '../types';
import { generateId } from '../constants/defaults';

export const worldBookService = {
  scanWorldBooks(
    worldBooks: WorldBook[],
    text: string,
    options?: WorldBookScannerOptions & { messageCount?: number; lastInjectTime?: number }
  ): WorldBookScanResult[] {
    const opts = {
      scanDepth: 100,
      caseSensitive: false,
      useRegex: false,
      matchWholeWord: false,
      positionPriority: ['top', 'before_char', 'before_persona', 'before_history', 'after_history', 'after_persona', 'after_char', 'bottom', 'at_depth'],
      maxEntries: 50,
      tokenBudget: 0,
      messageCount: 0,
      lastInjectTime: 0,
      ...options,
    };

    const results: WorldBookScanResult[] = [];
    const matchedEntryIds = new Set<string>();

    for (const book of worldBooks) {
      if (!book.entries || book.entries.length === 0) continue;

      for (const entry of book.entries) {
        if (!entry.enabled) continue;
        if (matchedEntryIds.has(entry.id)) continue;

        if (!this.shouldInject(entry, opts.messageCount!, opts.lastInjectTime!)) {
          continue;
        }

        const scanDepth = entry.scanDepth ?? opts.scanDepth;
        const scanText = scanDepth > 0 ? text.slice(-scanDepth * 100) : text;

        const matchedKeys = this.matchKeys(entry, scanText, opts);
        
        if (matchedKeys.length > 0 || entry.constant || entry.injectWhen === 'always') {
          if (entry.probability && entry.probability < 1 && entry.probability > 0) {
            if (Math.random() > entry.probability) {
              continue;
            }
          }

          const firstMatchPos = this.findFirstMatchPosition(entry.keys, scanText, opts);
          
          results.push({
            entryId: entry.id,
            matchedKeys,
            matchedPosition: firstMatchPos,
            content: entry.content,
            order: entry.order ?? 0,
            position: entry.position || 'after_char',
            injectTarget: entry.injectTarget || 'system_prompt',
          });

          matchedEntryIds.add(entry.id);

          if (entry.useRecursion && entry.recursionDepth && entry.recursionDepth > 0) {
            const recursiveResults = this.scanRecursive(
              worldBooks,
              entry.content,
              entry.recursionDepth,
              matchedEntryIds,
              opts
            );
            results.push(...recursiveResults);
          }
        }
      }
    }

    const sorted = this.sortByPosition(results, opts.positionPriority);
    
    if (opts.maxEntries > 0 && sorted.length > opts.maxEntries) {
      return sorted.slice(0, opts.maxEntries);
    }

    return sorted;
  },

  shouldInject(entry: WorldBookEntry, messageCount: number, lastInjectTime: number): boolean {
    const injectWhen = entry.injectWhen || 'on_keyword';
    
    switch (injectWhen) {
      case 'always':
        return true;
      case 'on_keyword':
        return true;
      case 'on_message_count':
        if (entry.injectMessageCount && messageCount > 0) {
          return messageCount % entry.injectMessageCount === 0;
        }
        return true;
      case 'on_time_interval':
        if (entry.injectTimeInterval && lastInjectTime > 0) {
          const now = Date.now();
          return now - lastInjectTime >= entry.injectTimeInterval * 60 * 1000;
        }
        return true;
      default:
        return true;
    }
  },

  matchKeys(entry: WorldBookEntry, text: string, options: WorldBookScannerOptions): string[] {
    if (entry.constant) {
      return entry.keys || [];
    }

    const matched: string[] = [];
    const keys = entry.keys || [];

    // 改进：提取潜在名字（首字母大写、短词等）
    const potentialNames = this.extractPotentialNames(text);
    
    for (const key of keys) {
      if (!key || !key.trim()) continue;

      let isMatch = false;

      if (entry.useRegex || options.useRegex) {
        try {
          const flags = options.caseSensitive ? 'g' : 'gi';
          const regex = new RegExp(key, flags);
          isMatch = regex.test(text);
        } catch {
          isMatch = false;
        }
      } else if (options.matchWholeWord) {
        const pattern = `\\b${this.escapeRegex(key)}\\b`;
        const flags = options.caseSensitive ? 'g' : 'gi';
        try {
          const regex = new RegExp(pattern, flags);
          isMatch = regex.test(text);
        } catch {
          isMatch = false;
        }
      } else {
        const searchText = options.caseSensitive ? text : text.toLowerCase();
        const searchKey = options.caseSensitive ? key : key.toLowerCase();
        
        // 基础包含匹配
        if (searchText.includes(searchKey)) {
          isMatch = true;
        }
        
        // 名字智能匹配：如果key是名字类型，进行更灵活的匹配
        if (!isMatch && this.isNameKey(key)) {
          isMatch = this.fuzzyNameMatch(key, potentialNames, searchText, !!options.caseSensitive);
        }
      }

      if (isMatch) {
        matched.push(key);
      }
    }

    // matchMode: all — 所有关键词都命中才算触发
    const matchMode = entry.matchMode || 'any';
    if (matchMode === 'all' && keys.length > 0) {
      const validKeys = keys.filter((k) => k && k.trim());
      if (matched.length < validKeys.length) {
        return [];
      }
    }

    if (entry.secondaryKeys && entry.secondaryKeys.length > 0 && matched.length > 0) {
      let allSecondaryMatched = true;
      for (const key of entry.secondaryKeys) {
        if (!key || !key.trim()) continue;
        const searchText = options.caseSensitive ? text : text.toLowerCase();
        const searchKey = options.caseSensitive ? key : key.toLowerCase();
        if (!searchText.includes(searchKey)) {
          // 辅助键也支持名字模糊匹配
          if (this.isNameKey(key)) {
            if (!this.fuzzyNameMatch(key, potentialNames, searchText, !!options.caseSensitive)) {
              allSecondaryMatched = false;
              break;
            }
          } else {
            allSecondaryMatched = false;
            break;
          }
        }
      }
      if (!allSecondaryMatched) {
        return [];
      }
    }

    return matched;
  },

  /**
   * 提取文本中的潜在名字
   */
  extractPotentialNames(text: string): string[] {
    if (!text) return [];
    
    const names = new Set<string>();
    
    // 规则1: 首字母大写的短词（可能是名字）
    const capitalizedWords = text.match(/\b[A-Z][a-z]{1,15}\b/g);
    if (capitalizedWords) {
      capitalizedWords.forEach((w) => {
        if (w.length >= 2 && w.length <= 15) {
          names.add(w.toLowerCase());
        }
      });
    }
    
    // 规则2: 连续出现的大写字母缩写（如 AK, YS）
    const acronyms = text.match(/\b[A-Z]{2,4}\b/g);
    if (acronyms) {
      acronyms.forEach((w) => names.add(w.toLowerCase()));
    }
    
    // 规则3: 带姓氏格式（如 李雷、Han Meimei）
    const chineseNames = text.match(/[\u4e00-\u9fff]{2,4}/g);
    if (chineseNames) {
      chineseNames.forEach((w) => {
        if (w.length >= 2 && w.length <= 4) {
          names.add(w);
        }
      });
    }
    
    // 规则4: 常见名字后缀（桑、君、大人、小姐等）
    const honorifics = ['桑', '君', '大人', '小姐', '先生', '女士', '酱', 'sama', 'san', 'kun', 'chan'];
    honorifics.forEach((h) => {
      const pattern = new RegExp(`[\\u4e00-\\u9fff\\w]+${h}`, 'g');
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((m) => {
          const namePart = m.replace(h, '').toLowerCase();
          if (namePart.length >= 1) {
            names.add(namePart);
          }
        });
      }
    });
    
    // 规则5: 引号内的名字
    const quotedNames = text.match(/[""''「」『』【】]([^""''「」『』【】]{1,15})[""''「」『』【】]/g);
    if (quotedNames) {
      quotedNames.forEach((w) => {
        const name = w.replace(/[""''「」『』【】]/g, '');
        if (name.length >= 1 && name.length <= 15) {
          names.add(name.toLowerCase());
        }
      });
    }
    
    return Array.from(names);
  },

  /**
   * 检查key是否是名字类型
   */
  isNameKey(key: string): boolean {
    const nameIndicators = [
      // 常见名字特征
      '的名字', '名字', '姓名', 'name', 'character', '人物',
      // 长度判断（2-4个字符通常是名字）
    ];
    
    const lowerKey = key.toLowerCase();
    if (nameIndicators.some((indicator) => lowerKey.includes(indicator))) {
      return true;
    }
    
    // 如果key是短字符串（2-5字符），可能是名字
    if (key.length >= 2 && key.length <= 5) {
      // 检查是否包含中文字符
      if (/[\u4e00-\u9fff]/.test(key)) {
        return true;
      }
      // 检查是否是首字母大写的英文词
      if (/^[A-Z][a-z]+$/.test(key)) {
        return true;
      }
    }
    
    return false;
  },

  /**
   * 模糊名字匹配
   */
  fuzzyNameMatch(key: string, potentialNames: string[], searchText: string, caseSensitive: boolean): boolean {
    const lowerKey = caseSensitive ? key : key.toLowerCase();
    
    // 精确匹配
    if (searchText.includes(lowerKey)) {
      return true;
    }
    
    // 潜在名字列表匹配
    if (potentialNames.length > 0) {
      for (const name of potentialNames) {
        if (name === lowerKey) {
          return true;
        }
        // 包含关系
        if (name.includes(lowerKey) || lowerKey.includes(name)) {
          return true;
        }
      }
    }
    
    // 字符重叠度检查（至少50%字符重叠）
    const keyChars = new Set(lowerKey.split(''));
    let matchCount = 0;
    for (const char of keyChars) {
      if (searchText.includes(char)) {
        matchCount++;
      }
    }
    const overlapRatio = matchCount / keyChars.size;
    if (overlapRatio >= 0.7 && keyChars.size >= 2) {
      return true;
    }
    
    return false;
  },

  findFirstMatchPosition(
    keys: string[],
    text: string,
    options: WorldBookScannerOptions
  ): number {
    let earliestPos = -1;
    const searchText = options.caseSensitive ? text : text.toLowerCase();

    for (const key of keys) {
      if (!key || !key.trim()) continue;
      const searchKey = options.caseSensitive ? key : key.toLowerCase();
      const pos = searchText.indexOf(searchKey);
      if (pos !== -1 && (earliestPos === -1 || pos < earliestPos)) {
        earliestPos = pos;
      }
    }

    return earliestPos;
  },

  scanRecursive(
    worldBooks: WorldBook[],
    text: string,
    depth: number,
    matchedIds: Set<string>,
    options: WorldBookScannerOptions
  ): WorldBookScanResult[] {
    if (depth <= 0) return [];

    const results: WorldBookScanResult[] = [];

    for (const book of worldBooks) {
      if (!book.entries) continue;

      for (const entry of book.entries) {
        if (!entry.enabled) continue;
        if (matchedIds.has(entry.id)) continue;

        const matchedKeys = this.matchKeys(entry, text, options);
        if (matchedKeys.length > 0) {
          matchedIds.add(entry.id);
          const firstMatchPos = this.findFirstMatchPosition(entry.keys, text, options);

          results.push({
            entryId: entry.id,
            matchedKeys,
            matchedPosition: firstMatchPos,
            content: entry.content,
            order: entry.order ?? 0,
            position: entry.position || 'after_char',
            injectTarget: entry.injectTarget || 'system_prompt',
          });

          if (entry.useRecursion && entry.recursionDepth && depth > 1) {
            const recursiveResults = this.scanRecursive(
              worldBooks,
              entry.content,
              depth - 1,
              matchedIds,
              options
            );
            results.push(...recursiveResults);
          }
        }
      }
    }

    return results;
  },

  sortByPosition(
    results: WorldBookScanResult[],
    positionPriority: string[]
  ): WorldBookScanResult[] {
    const positionIndex = new Map<string, number>();
    positionPriority.forEach((pos, idx) => positionIndex.set(pos, idx));

    return [...results].sort((a, b) => {
      const posA = positionIndex.get(a.position) ?? 999;
      const posB = positionIndex.get(b.position) ?? 999;
      
      if (posA !== posB) return posA - posB;
      
      if (a.order !== b.order) return a.order - b.order;
      
      return a.matchedPosition - b.matchedPosition;
    });
  },

  buildContextString(results: WorldBookScanResult[], separator: string = '\n\n'): string {
    return results.map((r) => r.content).join(separator);
  },

  filterByTriggerScope(
    results: WorldBookScanResult[],
    scope: 'user' | 'ai' | 'both'
  ): WorldBookScanResult[] {
    return results;
  },

  groupByInjectTarget(results: WorldBookScanResult[]): {
    system_prompt: WorldBookScanResult[];
    pre_prompt: WorldBookScanResult[];
    post_prompt: WorldBookScanResult[];
  } {
    const groups = {
      system_prompt: [] as WorldBookScanResult[],
      pre_prompt: [] as WorldBookScanResult[],
      post_prompt: [] as WorldBookScanResult[],
    };
    for (const r of results) {
      const target = r.injectTarget || 'system_prompt';
      if (target === 'pre_prompt') {
        groups.pre_prompt.push(r);
      } else if (target === 'post_prompt') {
        groups.post_prompt.push(r);
      } else {
        groups.system_prompt.push(r);
      }
    }
    return groups;
  },

  buildScanTextByRole(
    messages: { role: string; content: string }[],
    scope: 'user' | 'ai' | 'both',
    depth: number = 20
  ): string {
    const recent = messages.slice(-depth);
    let filtered: { role: string; content: string }[];
    if (scope === 'user') {
      filtered = recent.filter((m) => m.role === 'user');
    } else if (scope === 'ai') {
      filtered = recent.filter((m) => m.role === 'assistant');
    } else {
      filtered = recent;
    }
    return filtered.map((m) => m.content).join('\n');
  },

  scanWorldBooksFromMessages(
    worldBooks: WorldBook[],
    messages: { role: string; content: string }[],
    options?: WorldBookScannerOptions & { messageCount?: number; lastInjectTime?: number }
  ): WorldBookScanResult[] {
    const userText = this.buildScanTextByRole(messages, 'user', options?.scanDepth || 100);
    const aiText = this.buildScanTextByRole(messages, 'ai', options?.scanDepth || 100);
    const bothText = userText + '\n' + aiText;

    const results: WorldBookScanResult[] = [];
    const matchedEntryIds = new Set<string>();

    for (const book of worldBooks) {
      if (!book.entries || book.entries.length === 0) continue;

      for (const entry of book.entries) {
        if (!entry.enabled) continue;
        if (matchedEntryIds.has(entry.id)) continue;

        if (!this.shouldInject(entry, options?.messageCount || 0, options?.lastInjectTime || 0)) {
          continue;
        }

        const scope = entry.triggerScope || 'user';
        const scanText = scope === 'user' ? userText : scope === 'ai' ? aiText : bothText;

        if (!scanText && !entry.constant && entry.injectWhen !== 'always') continue;

        const matchedKeys = this.matchKeys(entry, scanText, {
          scanDepth: options?.scanDepth,
          caseSensitive: options?.caseSensitive,
          useRegex: options?.useRegex,
          matchWholeWord: options?.matchWholeWord,
        });

        if (matchedKeys.length > 0 || entry.constant || entry.injectWhen === 'always') {
          if (entry.probability && entry.probability < 1 && entry.probability > 0) {
            if (Math.random() > entry.probability) {
              continue;
            }
          }

          const firstMatchPos = this.findFirstMatchPosition(entry.keys, scanText, {
            caseSensitive: options?.caseSensitive,
          } as WorldBookScannerOptions);

          results.push({
            entryId: entry.id,
            matchedKeys,
            matchedPosition: firstMatchPos,
            content: entry.content,
            order: entry.order ?? 0,
            position: entry.position || 'after_char',
            injectTarget: entry.injectTarget || 'system_prompt',
          });

          matchedEntryIds.add(entry.id);

          if (entry.useRecursion && entry.recursionDepth && entry.recursionDepth > 0) {
            const recursiveResults = this.scanRecursive(
              worldBooks,
              entry.content,
              entry.recursionDepth,
              matchedEntryIds,
              options || {}
            );
            results.push(...recursiveResults);
          }
        }
      }
    }

    const sorted = this.sortByPosition(results, options?.positionPriority || [
      'top', 'before_char', 'before_persona', 'before_history',
      'after_history', 'after_persona', 'after_char', 'bottom', 'at_depth',
    ]);

    if (options?.maxEntries && options.maxEntries > 0 && sorted.length > options.maxEntries) {
      return sorted.slice(0, options.maxEntries);
    }

    return sorted;
  },

  createEntry(partial?: Partial<WorldBookEntry>): WorldBookEntry {
    return {
      id: generateId(),
      keys: [],
      content: '',
      images: [],
      inlineFiles: [],
      enabled: true,
      scanDepth: 100,
      tokenBudget: 0,
      position: 'after_char',
      probability: 1,
      caseSensitive: false,
      useRecursion: false,
      recursionDepth: 0,
      useRegex: false,
      order: 0,
      constant: false,
      selective: false,
      secondaryKeys: [],
      comment: '',
      category: '',
      injectWhen: 'on_keyword',
      injectMessageCount: 0,
      injectTimeInterval: 0,
      keepWithText: true,
      triggerScope: 'user',
      matchMode: 'any',
      injectTarget: 'system_prompt',
      ...partial,
    };
  },

  createWorldBook(name: string, partial?: Partial<WorldBook>): WorldBook {
    const now = Date.now();
    return {
      id: generateId(),
      name,
      description: '',
      systemPrompt: '',
      summaryPrompt: '',
      entries: [],
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
  },

  duplicateEntry(entry: WorldBookEntry): WorldBookEntry {
    return {
      ...entry,
      id: generateId(),
      keys: [...entry.keys],
      images: entry.images.map((img) => ({ ...img, id: generateId() })),
      inlineFiles: entry.inlineFiles ? entry.inlineFiles.map((f) => ({ ...f, id: generateId() })) : [],
      secondaryKeys: entry.secondaryKeys ? [...entry.secondaryKeys] : [],
    };
  },

  duplicateWorldBook(book: WorldBook, newName?: string): WorldBook {
    return {
      ...book,
      id: generateId(),
      name: newName || `${book.name} (Copy)`,
      entries: book.entries.map((e) => this.duplicateEntry(e)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },

  importWorldBookFromJSON(data: any): WorldBook | null {
    try {
      if (!data || !data.name) return null;

      const entries: WorldBookEntry[] = (data.entries || []).map((e: any, idx: number) => ({
        id: generateId(),
        keys: e.keys || e.keywords || [],
        content: e.content || e.message || '',
        images: [],
        enabled: e.enabled !== undefined ? e.enabled : true,
        scanDepth: e.scan_depth || e.scanDepth || 100,
        tokenBudget: e.token_budget || e.tokenBudget || 0,
        position: e.position || 'after_char',
        probability: e.probability ?? 1,
        caseSensitive: e.case_sensitive || e.caseSensitive || false,
        useRecursion: e.use_recursion || e.useRecursion || false,
        recursionDepth: e.recursion_depth || e.recursionDepth || 0,
        useRegex: e.use_regex || e.useRegex || false,
        order: e.order ?? idx,
        constant: e.constant || false,
        selective: e.selective || false,
        secondaryKeys: e.secondary_keys || e.secondaryKeys || [],
        comment: e.comment || e.notes || '',
        category: e.category || '',
      }));

      return {
        id: generateId(),
        name: data.name,
        description: data.description || '',
        systemPrompt: data.system_prompt || data.systemPrompt || '',
        summaryPrompt: data.summary_prompt || data.summaryPrompt || '',
        entries,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch {
      return null;
    }
  },

  exportWorldBookToJSON(book: WorldBook): string {
    const exportData = {
      name: book.name,
      description: book.description,
      system_prompt: book.systemPrompt,
      summary_prompt: book.summaryPrompt,
      entries: book.entries.map((e) => ({
        keys: e.keys,
        content: e.content,
        enabled: e.enabled,
        scan_depth: e.scanDepth,
        token_budget: e.tokenBudget,
        position: e.position,
        probability: e.probability,
        case_sensitive: e.caseSensitive,
        use_recursion: e.useRecursion,
        recursion_depth: e.recursionDepth,
        use_regex: e.useRegex,
        order: e.order,
        constant: e.constant,
        selective: e.selective,
        secondary_keys: e.secondaryKeys,
        comment: e.comment,
        category: e.category,
      })),
    };
    return JSON.stringify(exportData, null, 2);
  },

  getPositionLabel(position: string): string {
    const labels: Record<string, string> = {
      top: '顶部',
      before_char: '角色卡之前',
      after_char: '角色卡之后',
      before_persona: '人设之前',
      after_persona: '人设之后',
      before_history: '对话历史之前',
      after_history: '对话历史之后',
      bottom: '底部',
      at_depth: '指定深度',
    };
    return labels[position] || position;
  },

  escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  },

  filterEntriesByBudget(
    entries: WorldBookScanResult[],
    tokenBudget: number
  ): WorldBookScanResult[] {
    if (tokenBudget <= 0) return entries;

    const result: WorldBookScanResult[] = [];
    let totalTokens = 0;

    for (const entry of entries) {
      const entryTokens = this.estimateTokenCount(entry.content);
      if (totalTokens + entryTokens <= tokenBudget) {
        result.push(entry);
        totalTokens += entryTokens;
      } else {
        break;
      }
    }

    return result;
  },

  /**
   * 构建完整的系统提示词，按照TavernAI的位置规范插入世界书条目
   * 位置顺序: top -> before_char -> before_persona -> before_history -> after_history -> after_persona -> after_char -> at_depth -> bottom
   */
  buildPromptWithWorldBooks(params: {
    baseSystemPrompt?: string;
    characterPrompt?: string;
    personaPrompt?: string;
    historyPrompt?: string;
    worldBooks: WorldBook[];
    scanText: string;
    tokenBudget?: number;
    maxEntries?: number;
  }): string {
    const {
      baseSystemPrompt,
      characterPrompt,
      personaPrompt,
      historyPrompt,
      worldBooks,
      scanText,
      tokenBudget = 0,
      maxEntries = 50,
    } = params;

    // 扫描世界书
    const scanResults = this.scanWorldBooks(worldBooks, scanText, {
      scanDepth: 100,
      maxEntries,
      tokenBudget,
    });

    // 按位置分组
    const positionGroups: Record<string, WorldBookScanResult[]> = {
      top: [],
      before_char: [],
      before_persona: [],
      before_history: [],
      after_history: [],
      after_persona: [],
      after_char: [],
      at_depth: [],
      bottom: [],
    };

    for (const result of scanResults) {
      const pos = result.position || 'after_char';
      if (!positionGroups[pos]) {
        positionGroups[pos] = [];
      }
      positionGroups[pos].push(result);
    }

    // 按顺序构建提示词
    const parts: string[] = [];

    // top 位置
    if (positionGroups.top.length > 0) {
      parts.push(this.buildGroupString(positionGroups.top));
    }

    // 基础系统提示
    if (baseSystemPrompt) {
      parts.push(baseSystemPrompt);
    }

    // before_char 位置
    if (positionGroups.before_char.length > 0) {
      parts.push(this.buildGroupString(positionGroups.before_char));
    }

    // 角色提示
    if (characterPrompt) {
      parts.push(characterPrompt);
    }

    // before_persona 位置
    if (positionGroups.before_persona.length > 0) {
      parts.push(this.buildGroupString(positionGroups.before_persona));
    }

    // 人设提示
    if (personaPrompt) {
      parts.push(personaPrompt);
    }

    // before_history 位置
    if (positionGroups.before_history.length > 0) {
      parts.push(this.buildGroupString(positionGroups.before_history));
    }

    // 对话历史
    if (historyPrompt) {
      parts.push(historyPrompt);
    }

    // after_history 位置
    if (positionGroups.after_history.length > 0) {
      parts.push(this.buildGroupString(positionGroups.after_history));
    }

    // after_persona 位置
    if (positionGroups.after_persona.length > 0) {
      parts.push(this.buildGroupString(positionGroups.after_persona));
    }

    // after_char 位置
    if (positionGroups.after_char.length > 0) {
      parts.push(this.buildGroupString(positionGroups.after_char));
    }

    // at_depth 位置（在指定深度插入）
    if (positionGroups.at_depth.length > 0) {
      parts.push(this.buildGroupString(positionGroups.at_depth));
    }

    // bottom 位置
    if (positionGroups.bottom.length > 0) {
      parts.push(this.buildGroupString(positionGroups.bottom));
    }

    return parts.filter((p) => p && p.trim()).join('\n\n');
  },

  buildGroupString(results: WorldBookScanResult[]): string {
    return results
      .sort((a, b) => a.order - b.order)
      .map((r) => r.content)
      .filter((c) => c && c.trim())
      .join('\n\n');
  },

  /**
   * 从对话消息构建扫描文本
   */
  buildScanTextFromMessages(messages: { role: string; content: string }[], depth: number = 20): string {
    const recentMessages = messages.slice(-depth);
    return recentMessages.map((m) => m.content).join('\n');
  },
};
