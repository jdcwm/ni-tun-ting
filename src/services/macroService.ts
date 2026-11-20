import { ChatMessage, Character } from '../types';

// ============================================================================
// 安全表达式求值器 - 不依赖 eval/new Function
// ============================================================================
function safeEval(expr: string, data: Record<string, any>): any {
  const trimmed = expr.trim();
  
  // 数字
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  
  // 字符串（单引号或双引号）
  if (/^'([^']*)'$/.test(trimmed) || /^"([^"]*)"$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  
  // 布尔值
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === 'undefined') return '';
  
  // 比较操作 (a OP b)
  const compareMatch = trimmed.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (compareMatch) {
    const left = safeEval(compareMatch[1], data);
    const right = safeEval(compareMatch[3], data);
    const op = compareMatch[2];
    switch (op) {
      case '==': return left == right;
      case '!=': return left != right;
      case '>': return Number(left) > Number(right);
      case '<': return Number(left) < Number(right);
      case '>=': return Number(left) >= Number(right);
      case '<=': return Number(left) <= Number(right);
    }
  }
  
  // 数学运算 (a OP b)
  const mathMatch = trimmed.match(/^(.+?)\s*([+\-*/%])\s*(.+)$/);
  if (mathMatch) {
    const left = Number(safeEval(mathMatch[1], data));
    const right = Number(safeEval(mathMatch[3], data));
    const op = mathMatch[2];
    switch (op) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
    }
  }
  
  // 逻辑运算
  if (trimmed.includes('&&')) {
    const parts = trimmed.split('&&');
    return parts.every(p => safeEval(p.trim(), data));
  }
  if (trimmed.includes('||')) {
    const parts = trimmed.split('||');
    return parts.some(p => safeEval(p.trim(), data));
  }
  if (trimmed.startsWith('!')) {
    return !safeEval(trimmed.slice(1).trim(), data);
  }
  
  // 三元表达式 (cond ? a : b)
  const ternaryMatch = trimmed.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    const cond = safeEval(ternaryMatch[1].trim(), data);
    return cond ? safeEval(ternaryMatch[2].trim(), data) : safeEval(ternaryMatch[3].trim(), data);
  }
  
  // 数组字面量 [a, b, c]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(item => safeEval(item.trim(), data));
  }
  
  // 函数调用 func(args...)
  const funcMatch = trimmed.match(/^(\w+)\((.*)\)$/);
  if (funcMatch) {
    const funcName = funcMatch[1];
    const argsStr = funcMatch[2];
    const fn = data[funcName];
    if (typeof fn === 'function') {
      const args = argsStr ? argsStr.split(',').map((a: string) => safeEval(a.trim(), data)) : [];
      return fn(...args);
    }
    return '';
  }
  
  // 变量访问（支持点号路径）
  const parts = trimmed.split('.');
  let value: any = data[parts[0]];
  for (let i = 1; i < parts.length; i++) {
    if (value === undefined || value === null) return '';
    value = value[parts[i]];
  }
  
  return value ?? '';
}

// ============================================================================
// Handlebars 引擎 - 安全自实现版本
// ============================================================================
interface HBSHelper {
  [key: string]: (...args: any[]) => any;
}

const handlebarsEngine = {
  helpers: {} as HBSHelper,

  registerHelper(name: string, fn: (...args: any[]) => any) {
    this.helpers[name] = fn;
  },

  render(template: string, data: Record<string, any>): string {
    let result = template;
    let changed = true;
    let iterations = 0;
    const maxIterations = 20;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      // 处理 {{#if condition}}...{{else}}...{{/if}}
      const ifElseRegex = /\{\{#if\s+([^}]+?)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      const r1 = result.replace(ifElseRegex, (match: string, condition: string, ifBody: string, elseBody: string) => {
        try {
          const cond = safeEval(condition.trim(), data);
          return cond ? ifBody : elseBody;
        } catch {
          return '';
        }
      });
      if (r1 !== result) { result = r1; changed = true; continue; }

      // 处理 {{#if condition}}...{{/if}}
      const ifRegex = /\{\{#if\s+([^}]+?)\}\}([\s\S]*?)\{\{\/if\}\}/g;
      const r2 = result.replace(ifRegex, (match: string, condition: string, body: string) => {
        try {
          const cond = safeEval(condition.trim(), data);
          return cond ? body : '';
        } catch {
          return '';
        }
      });
      if (r2 !== result) { result = r2; changed = true; continue; }

      // 处理 {{#unless condition}}...{{/unless}}
      const unlessRegex = /\{\{#unless\s+([^}]+?)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
      const r3 = result.replace(unlessRegex, (match: string, condition: string, body: string) => {
        try {
          const cond = safeEval(condition.trim(), data);
          return !cond ? body : '';
        } catch {
          return '';
        }
      });
      if (r3 !== result) { result = r3; changed = true; continue; }

      // 处理 {{#each list}}...{{/each}}
      const eachRegex = /\{\{#each\s+([^}]+?)\}\}([\s\S]*?)\{\{\/each\}\}/g;
      const r4 = result.replace(eachRegex, (match: string, listExpr: string, body: string) => {
        try {
          const arr = safeEval(listExpr.trim(), data);
          if (!Array.isArray(arr) || arr.length === 0) return '';
          return arr.map((item: any, index: number) => {
            const loopData = {
              ...data,
              this: item,
              item,
              index,
              first: index === 0,
              last: index === arr.length - 1,
              length: arr.length,
            };
            return this.processBlock(body, loopData);
          }).join('');
        } catch {
          return '';
        }
      });
      if (r4 !== result) { result = r4; changed = true; continue; }

      // 处理 {{#times n}}...{{/times}}
      const timesRegex = /\{\{#times\s+(\d+)\s*\}\}([\s\S]*?)\{\{\/times\}\}/g;
      const r5 = result.replace(timesRegex, (match: string, n: string, body: string) => {
        const count = parseInt(n, 10);
        let output = '';
        for (let i = 0; i < count; i++) {
          output += this.processBlock(body, { ...data, index: i });
        }
        return output;
      });
      if (r5 !== result) { result = r5; changed = true; continue; }

      // 处理 {{#if_eq a b}}...{{else}}...{{/if_eq}}
      const ifEqElseRegex = /\{\{#if_eq\s+([^}]+?)\s+([^}]+?)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if_eq\}\}/g;
      const r6 = result.replace(ifEqElseRegex, (match: string, a: string, b: string, ifBody: string, elseBody: string) => {
        try {
          const va = safeEval(a.trim(), data);
          const vb = safeEval(b.trim(), data);
          return va == vb ? ifBody : elseBody;
        } catch {
          return '';
        }
      });
      if (r6 !== result) { result = r6; changed = true; continue; }

      // 处理 {{#if_eq a b}}...{{/if_eq}}
      const ifEqRegex = /\{\{#if_eq\s+([^}]+?)\s+([^}]+?)\}\}([\s\S]*?)\{\{\/if_eq\}\}/g;
      const r7 = result.replace(ifEqRegex, (match: string, a: string, b: string, body: string) => {
        try {
          const va = safeEval(a.trim(), data);
          const vb = safeEval(b.trim(), data);
          return va == vb ? body : '';
        } catch {
          return '';
        }
      });
      if (r7 !== result) { result = r7; changed = true; continue; }

      // 处理 {{#if_neq a b}}...{{/if_neq}}
      const ifNeqRegex = /\{\{#if_neq\s+([^}]+?)\s+([^}]+?)\}\}([\s\S]*?)\{\{\/if_neq\}\}/g;
      const r8 = result.replace(ifNeqRegex, (match: string, a: string, b: string, body: string) => {
        try {
          const va = safeEval(a.trim(), data);
          const vb = safeEval(b.trim(), data);
          return va != vb ? body : '';
        } catch {
          return '';
        }
      });
      if (r8 !== result) { result = r8; changed = true; continue; }

      // 处理 {{#if_gt a b}}...{{/if_gt}}
      const ifGtRegex = /\{\{#if_gt\s+([^}]+?)\s+([^}]+?)\}\}([\s\S]*?)\{\{\/if_gt\}\}/g;
      const r9 = result.replace(ifGtRegex, (match: string, a: string, b: string, body: string) => {
        try {
          const va = Number(safeEval(a.trim(), data));
          const vb = Number(safeEval(b.trim(), data));
          return va > vb ? body : '';
        } catch {
          return '';
        }
      });
      if (r9 !== result) { result = r9; changed = true; continue; }

      // 处理 {{#if_lt a b}}...{{/if_lt}}
      const ifLtRegex = /\{\{#if_lt\s+([^}]+?)\s+([^}]+?)\}\}([\s\S]*?)\{\{\/if_lt\}\}/g;
      const r10 = result.replace(ifLtRegex, (match: string, a: string, b: string, body: string) => {
        try {
          const va = Number(safeEval(a.trim(), data));
          const vb = Number(safeEval(b.trim(), data));
          return va < vb ? body : '';
        } catch {
          return '';
        }
      });
      if (r10 !== result) { result = r10; changed = true; continue; }

      // 处理 {{#if_gte a b}}...{{/if_gte}}
      const ifGteRegex = /\{\{#if_gte\s+([^}]+?)\s+([^}]+?)\}\}([\s\S]*?)\{\{\/if_gte\}\}/g;
      const r11 = result.replace(ifGteRegex, (match: string, a: string, b: string, body: string) => {
        try {
          const va = Number(safeEval(a.trim(), data));
          const vb = Number(safeEval(b.trim(), data));
          return va >= vb ? body : '';
        } catch {
          return '';
        }
      });
      if (r11 !== result) { result = r11; changed = true; continue; }

      // 处理 {{#if_lte a b}}...{{/if_lte}}
      const ifLteRegex = /\{\{#if_lte\s+([^}]+?)\s+([^}]+?)\}\}([\s\S]*?)\{\{\/if_lte\}\}/g;
      const r12 = result.replace(ifLteRegex, (match: string, a: string, b: string, body: string) => {
        try {
          const va = Number(safeEval(a.trim(), data));
          const vb = Number(safeEval(b.trim(), data));
          return va <= vb ? body : '';
        } catch {
          return '';
        }
      });
      if (r12 !== result) { result = r12; changed = true; continue; }

      // 处理 {{#chance probability}}...{{/chance}}
      const chanceRegex = /\{\{#chance\s+([^}]+?)\}\}([\s\S]*?)\{\{\/chance\}\}/g;
      const r13 = result.replace(chanceRegex, (match: string, prob: string, body: string) => {
        try {
          const p = parseInt(prob.trim(), 10) / 100;
          return Math.random() < p ? body : '';
        } catch {
          return '';
        }
      });
      if (r13 !== result) { result = r13; changed = true; continue; }
    }

    // 处理 {{helperName arg1 arg2 ...}} helper 调用
    result = result.replace(/\{\{\s*(\w+)\s*((?:(?!\}\}).)*?)\s*\}\}/g, (match: string, fnName: string, argsStr: string) => {
      if (fnName.startsWith('#') || fnName === 'else' || fnName === 'if' || fnName === 'unless' || 
          fnName === 'each' || fnName === 'times' || fnName === 'chance' || fnName.startsWith('if_')) {
        return match;
      }
      
      const fn = this.helpers[fnName];
      if (!fn) return match;
      
      try {
        const args = this.parseArgs(argsStr, data);
        const value = fn(...args);
        return String(value ?? '');
      } catch {
        return '';
      }
    });

    // 处理 {{variable.path}} 变量替换
    result = result.replace(/\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g, (match: string, varPath: string) => {
      const value = safeEval(varPath, data);
      return String(value ?? '');
    });

    return result;
  },

  processBlock(block: string, data: Record<string, any>): string {
    return this.render(block, data);
  },

  parseArgs(argsStr: string, data: Record<string, any>): any[] {
    if (!argsStr || !argsStr.trim()) return [];
    
    const args: any[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let depth = 0;

    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      
      if (inString) {
        if (ch === stringChar && argsStr[i - 1] !== '\\') {
          inString = false;
        }
        current += ch;
      } else if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        current += ch;
      } else if (ch === '(') {
        depth++;
        current += ch;
      } else if (ch === ')') {
        depth--;
        current += ch;
      } else if (ch === ' ' && depth === 0) {
        if (current.trim()) {
          args.push(this.parseArg(current.trim(), data));
        }
        current = '';
      } else {
        current += ch;
      }
    }
    
    if (current.trim()) {
      args.push(this.parseArg(current.trim(), data));
    }
    
    return args;
  },

  parseArg(arg: string, data: Record<string, any>): any {
    try {
      // 字符串字面量
      if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
        return arg.slice(1, -1);
      }
      // 数字
      if (/^-?\d+(\.\d+)?$/.test(arg)) {
        return Number(arg);
      }
      // 布尔值
      if (arg === 'true') return true;
      if (arg === 'false') return false;
      if (arg === 'null' || arg === 'undefined') return '';
      // 函数调用
      const funcMatch = arg.match(/^(\w+)\((.*)\)$/);
      if (funcMatch) {
        const fnName = funcMatch[1];
        const fn = this.helpers[fnName] || data[fnName];
        if (typeof fn === 'function') {
          const innerArgs = funcMatch[2] ? this.parseArgs(funcMatch[2], data) : [];
          return fn(...innerArgs);
        }
        return '';
      }
      // 变量
      return safeEval(arg, data);
    } catch {
      return arg;
    }
  },
};

// ============================================================================
// EJS 引擎 - 安全实现版本
// ============================================================================
interface EJSHelper {
  [key: string]: (...args: any[]) => any;
}

const ejsEngine = {
  helpers: {} as EJSHelper,
  
  registerHelper(name: string, fn: (...args: any[]) => any) {
    this.helpers[name] = fn;
  },
  
  render(template: string, data: Record<string, any>): string {
    let result = template;
    
    // 处理 <% for(var i=0; i<arr.length; i++) { %> 循环
    result = result.replace(/<%\s*for\s*\(\s*var\s+(\w+)\s*=\s*0\s*;\s*\1\s*<\s*(\w+)\.length\s*;\s*\1\+\+\s*\)\s*\{([\s\S]*?)%\}/g, (match: string, varName: string, arrName: string, body: string) => {
      const arr = data[arrName] || [];
      if (!Array.isArray(arr)) return '';
      let output = '';
      for (let i = 0; i < arr.length; i++) {
        output += this.processBlock(body, { ...data, [varName]: i, [arrName]: arr });
      }
      return output;
    });
    
    // 处理 <% if(condition) { %> 条件
    result = result.replace(/<%\s*if\s*\(\s*([^)]+?)\s*\)\s*\{([\s\S]*?)\}?\s*%\}/g, (match: string, condition: string, body: string) => {
      try {
        const cond = safeEval(condition.trim(), data);
        if (cond) return this.processBlock(body, data);
        return '';
      } catch {
        return '';
      }
    });
    
    // 处理 <% } else { %>
    result = result.replace(/<%\s*\}\s*else\s*\{([\s\S]*?)\}?\s*%\}/g, (match: string, body: string) => {
      return this.processBlock(body, data);
    });
    
    // 处理 <% } %> 结束
    result = result.replace(/<%\s*\}\s*%>/g, '');
    
    // 处理 <%= expression %> 输出表达式
    result = result.replace(/<%=\s*([^%]+?)\s*%>/g, (match: string, expr: string) => {
      try {
        const value = safeEval(expr.trim(), data);
        return String(value ?? '');
      } catch {
        return '';
      }
    });
    
    // 处理 <%- expression %> 原始输出
    result = result.replace(/<%-\s*([^%]+?)\s*%>/g, (match: string, expr: string) => {
      try {
        const value = safeEval(expr.trim(), data);
        return String(value ?? '');
      } catch {
        return '';
      }
    });
    
    // 处理 <% helper(args) %> helper 调用
    result = result.replace(/<%\s*(\w+)\s*\(([^)]*)\)\s*%>/g, (match: string, fnName: string, argsStr: string) => {
      const fn = data[fnName] || this.helpers[fnName];
      if (typeof fn === 'function') {
        try {
          const args = argsStr ? argsStr.split(',').map((a: string) => {
            a = a.trim();
            return safeEval(a, data);
          }) : [];
          return String(fn(...args) ?? '');
        } catch {
          return '';
        }
      }
      return '';
    });
    
    // 处理普通变量替换 {{var}}
    result = result.replace(/\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g, (match: string, varPath: string) => {
      const value = safeEval(varPath, data);
      return String(value ?? '');
    });
    
    return result;
  },
  
  processBlock(block: string, data: Record<string, any>): string {
    return this.render(block, data);
  },
};

// ============================================================================
// Nunjucks/Jinja2 引擎 - 安全实现版本
// ============================================================================
interface NJFilter {
  [key: string]: (...args: any[]) => any;
}

const nunjucksEngine = {
  filters: {} as NJFilter,
  extensions: {} as Record<string, any>,
  
  addFilter(name: string, fn: (...args: any[]) => any) {
    this.filters[name] = fn;
  },
  
  addExtension(name: string, ext: any) {
    this.extensions[name] = ext;
  },
  
  renderString(template: string, data: Record<string, any>): string {
    return this.processTemplate(template, data);
  },
  
  processTemplate(template: string, data: Record<string, any>): string {
    let result = template;
    
    // 处理 {% for item in list %}...{% endfor %}
    result = result.replace(/\{%\s*for\s+(\w+)\s+in\s+(\w+(?:\.\w+)*)\s*\%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, (match: string, itemName: string, listPath: string, body: string) => {
      try {
        const arr = safeEval(listPath.trim(), data);
        if (!Array.isArray(arr)) return '';
        return arr.map((item: any, index: number) => {
          const loopData: Record<string, any> = { 
            ...data, 
            [itemName]: item, 
            loop: { index, index0: index, first: index === 0, last: index === arr.length - 1, length: arr.length } 
          };
          return this.processTemplate(body, loopData);
        }).join('');
      } catch {
        return '';
      }
    });
    
    // 处理 {% if condition %}...{% endif %}
    result = result.replace(/\{%\s*if\s+([^%]+?)\s*\%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (match: string, condition: string, body: string) => {
      try {
        const cond = safeEval(condition.trim(), data);
        if (cond) return this.processTemplate(body, data);
        return '';
      } catch {
        return '';
      }
    });
    
    // 处理 {% if condition %}...{% else %}...{% endif %}
    result = result.replace(/\{%\s*if\s+([^%]+?)\s*\%\}([\s\S]*?)\{%\s*else\s*\%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (match: string, condition: string, ifBody: string, elseBody: string) => {
      try {
        const cond = safeEval(condition.trim(), data);
        if (cond) {
          return this.processTemplate(ifBody, data);
        } else {
          return this.processTemplate(elseBody, data);
        }
      } catch {
        return '';
      }
    });
    
    // 处理 {% if c1 %}...{% elif c2 %}...{% endif %}
    result = result.replace(/\{%\s*if\s+([^%]+?)\s*\%\}([\s\S]*?)\{%\s*elif\s+([^%]+?)\s*\%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (match: string, cond1: string, body1: string, cond2: string, body2: string) => {
      try {
        const c1 = safeEval(cond1.trim(), data);
        if (c1) return this.processTemplate(body1, data);
        const c2 = safeEval(cond2.trim(), data);
        if (c2) return this.processTemplate(body2, data);
        return '';
      } catch {
        return '';
      }
    });
    
    // 处理 {% set var = value %}
    result = result.replace(/\{%\s*set\s+(\w+)\s*=\s*([^%]+?)\s*\%\}/g, (match: string, varName: string, value: string) => {
      try {
        const val = safeEval(value.trim(), data);
        (data as any)[varName] = val;
      } catch {}
      return '';
    });
    
    // 处理 {% block %}...{% endblock %} 和 {% extends %}
    result = result.replace(/\{%\s*block\s+\w+\s*\%\}[\s\S]*?\{%\s*endblock\s*%\}/g, '');
    result = result.replace(/\{%\s*extends\s+[^%]+?\s*\%\}/g, '');
    
    // 处理 {{ expression | filter1 | filter2 }} 管道过滤
    result = result.replace(/\{\{([^}]+?)\}\}/g, (match: string, expr: string) => {
      try {
        const parts = expr.split('|').map((s: string) => s.trim()).filter(Boolean);
        const firstPart = parts[0];
        
        // 获取初始值
        let value = safeEval(firstPart, data);
        
        // 应用过滤器管道
        for (let i = 1; i < parts.length; i++) {
          const filterExpr = parts[i];
          const parenIdx = filterExpr.indexOf('(');
          const filterName = parenIdx !== -1 ? filterExpr.substring(0, parenIdx).trim() : filterExpr.trim();
          const filterArgsStr = parenIdx !== -1 ? filterExpr.substring(parenIdx + 1, filterExpr.lastIndexOf(')')) : '';
          
          const filter = this.filters[filterName];
          if (filter) {
            const args = filterArgsStr ? filterArgsStr.split(',').map((a: string) => {
              a = a.trim();
              return safeEval(a, data);
            }) : [];
            value = filter(value, ...args);
          }
        }
        
        return String(value ?? '');
      } catch {
        return '';
      }
    });
    
    return result;
  },
};

export type TemplateEngine = 'handlebars' | 'ejs' | 'nunjucks' | 'jinja';

export interface MacroContext {
  char: string;
  user: string;
  charPersona?: string;
  userPersona?: string;
  systemPrompt?: string;
  history?: string;
  messageCount?: number;
  chatTitle?: string;
  worldInfo?: string;
  lastMessage?: string;
  lastCharMessage?: string;
  lastUserMessage?: string;
  time?: string;
  date?: string;
  random?: number;
  [key: string]: any;
}

// 变量作用域层级
export type VariableScope = 'global' | 'chat' | 'session' | 'message';

interface VariableStorage {
  global: Record<string, any>;
  chat: Record<string, any>;
  session: Record<string, any>;
  message: Record<string, any>;
}

const variableStorage: VariableStorage = {
  global: {},
  chat: {},
  session: {},
  message: {},
};

// 变量监听者
const variableListeners: Set<(scope: VariableScope, name: string, value: any) => void> = new Set();

// 注册监听器
export const addVariableListener = (callback: (scope: VariableScope, name: string, value: any) => void) => {
  variableListeners.add(callback);
  return () => variableListeners.delete(callback);
};

// 获取变量
const getVariable = (scope: VariableScope, name: string): any => {
  return variableStorage[scope][name];
};

// 设置变量
const setVariable = (scope: VariableScope, name: string, value: any) => {
  variableStorage[scope][name] = value;
  variableListeners.forEach((listener) => listener(scope, name, value));
};

// 清除作用域变量
const clearScope = (scope: VariableScope) => {
  variableStorage[scope] = {};
};

// 注册自定义帮助函数
const registerHelpers = () => {
  // 条件判断（块辅助函数已由正则处理，这里作为兼容备用）
  handlebarsEngine.registerHelper('if', function (condition: any, trueVal: any, falseVal: any) {
    if (typeof falseVal !== 'undefined') {
      return condition ? trueVal : falseVal;
    }
    return condition ? trueVal : '';
  });

  handlebarsEngine.registerHelper('if_eq', function (a: any, b: any) {
    return a == b;
  });

  handlebarsEngine.registerHelper('if_neq', function (a: any, b: any) {
    return a != b;
  });

  handlebarsEngine.registerHelper('if_gt', function (a: any, b: any) {
    return Number(a) > Number(b);
  });

  handlebarsEngine.registerHelper('if_lt', function (a: any, b: any) {
    return Number(a) < Number(b);
  });

  handlebarsEngine.registerHelper('if_gte', function (a: any, b: any) {
    return Number(a) >= Number(b);
  });

  handlebarsEngine.registerHelper('if_lte', function (a: any, b: any) {
    return Number(a) <= Number(b);
  });

  handlebarsEngine.registerHelper('unless', function (condition: any) {
    return !condition;
  });

  // 循环
  handlebarsEngine.registerHelper('each', function (context: any) {
    if (!Array.isArray(context) || context.length === 0) return '';
    return context.map((item: any) => String(item)).join('');
  });

  handlebarsEngine.registerHelper('times', function (n: number) {
    return Number(n);
  });

  // 随机选择（修复：不再剥离最后一个参数）
  handlebarsEngine.registerHelper('pick', function () {
    const items = Array.prototype.slice.call(arguments);
    if (items.length === 0) return '';
    return items[Math.floor(Math.random() * items.length)];
  });

  // 随机数
  handlebarsEngine.registerHelper('roll', function (min: string, max: string) {
    const minNum = parseInt(min, 10);
    const maxNum = parseInt(max, 10);
    return Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
  });

  handlebarsEngine.registerHelper('rand', function (max: string) {
    const maxNum = parseInt(max, 10);
    return Math.floor(Math.random() * maxNum);
  });

  // 变量设置和获取
  handlebarsEngine.registerHelper('setvar', function (name: string, value: any) {
    setVariable('session', name, value);
    return '';
  });

  handlebarsEngine.registerHelper('getvar', function (name: string) {
    return getVariable('session', name) ?? getVariable('chat', name) ?? getVariable('global', name) ?? '';
  });

  handlebarsEngine.registerHelper('setchatvar', function (name: string, value: any) {
    setVariable('chat', name, value);
    return '';
  });

  handlebarsEngine.registerHelper('setglobalvar', function (name: string, value: any) {
    setVariable('global', name, value);
    return '';
  });

  // 数学运算
  handlebarsEngine.registerHelper('add', function (a: any, b: any) {
    return Number(a) + Number(b);
  });

  handlebarsEngine.registerHelper('sub', function (a: any, b: any) {
    return Number(a) - Number(b);
  });

  handlebarsEngine.registerHelper('mul', function (a: any, b: any) {
    return Number(a) * Number(b);
  });

  handlebarsEngine.registerHelper('div', function (a: any, b: any) {
    return Number(a) / Number(b);
  });

  handlebarsEngine.registerHelper('mod', function (a: any, b: any) {
    return Number(a) % Number(b);
  });

  // 字符串操作
  handlebarsEngine.registerHelper('uppercase', function (str: string) {
    return str?.toUpperCase() ?? '';
  });

  handlebarsEngine.registerHelper('lowercase', function (str: string) {
    return str?.toLowerCase() ?? '';
  });

  handlebarsEngine.registerHelper('trim', function (str: string) {
    return str?.trim() ?? '';
  });

  handlebarsEngine.registerHelper('length', function (str: string) {
    if (Array.isArray(str)) return str.length;
    return str?.length ?? 0;
  });

  handlebarsEngine.registerHelper('substring', function (str: string, start: string, end: string) {
    return str?.substring(parseInt(start, 10), end ? parseInt(end, 10) : undefined) ?? '';
  });

  // 日期时间格式化
  handlebarsEngine.registerHelper('format_date', function (date: any, format: string) {
    const d = new Date(date || Date.now());
    if (format === 'full') return d.toLocaleString();
    if (format === 'date') return d.toLocaleDateString();
    if (format === 'time') return d.toLocaleTimeString();
    return d.toISOString();
  });

  handlebarsEngine.registerHelper('now', function (format: string) {
    const fn = handlebarsEngine.helpers['format_date'];
    return fn ? fn(Date.now(), format) : new Date().toLocaleString();
  });

  // 默认值
  handlebarsEngine.registerHelper('default', function (value: any, defaultValue: any) {
    return value !== undefined && value !== null && value !== '' ? value : defaultValue;
  });

  // 随机概率
  handlebarsEngine.registerHelper('chance', function (probability: string) {
    const prob = parseInt(probability, 10) / 100;
    return Math.random() < prob;
  });

  // 列表操作
  handlebarsEngine.registerHelper('join', function (arr: any[], separator: string) {
    return arr?.join(separator) ?? '';
  });

  handlebarsEngine.registerHelper('first', function (arr: any[]) {
    return arr?.[0];
  });

  handlebarsEngine.registerHelper('last', function (arr: any[]) {
    return arr?.[arr.length - 1];
  });

  // 调试
  handlebarsEngine.registerHelper('log', function (...args: any[]) {
    console.log('Debug:', args.join(' '));
    return '';
  });
};

// 初始化注册
registerHelpers();

// 默认引擎
let defaultEngine: TemplateEngine = 'handlebars';

// 引擎配置
const engineConfigs: Record<TemplateEngine, {
  name: string;
  description: string;
  example: string;
  syntax: string;
}> = {
  handlebars: {
    name: 'Handlebars',
    description: '无逻辑模板，天然支持 {{变量}} 语法，与 SillyTavern 兼容',
    example: '{{char}} 说：你好 {{user}}',
    syntax: '{{variable}} / {{#if}} / {{#each}}',
  },
  ejs: {
    name: 'EJS',
    description: '允许在模板中直接写 JavaScript，支持循环、条件等复杂逻辑（ST-Prompt-Template 扩展使用）',
    example: '<%= char %> 说：你好 <%= user %>\n<% if (hp > 50) { %>状态良好<% } %>',
    syntax: '<%= variable %> / <% if %> / <% for %>',
  },
  nunjucks: {
    name: 'Nunjucks',
    description: '语法类似 Jinja2，功能强大，适合 JavaScript 环境',
    example: '{{ char }} 说：你好 {{ user }}\n{% if hp > 50 %}状态良好{% endif %}',
    syntax: '{{ variable }} / {% if %} / {% for %}',
  },
  jinja: {
    name: 'Jinja2',
    description: 'Python 生态最流行的模板引擎，使用 Nunjucks 兼容实现（语法完全一致）',
    example: '{{ char }} 说：你好 {{ user }}\n{% if hp > 50 %}状态良好{% endif %}\n{% for item in items %}{{ item }}\n{% endfor %}',
    syntax: '{{ variable }} / {% if %} / {% for %} / {{ variable|filter }}',
  },
};

// 检测模板使用的引擎
const detectEngine = (template: string): TemplateEngine => {
  if (!template) return defaultEngine;
  
  // 检查 EJS 语法
  if (template.indexOf('<%') !== -1 && template.indexOf('%>') !== -1) {
    return 'ejs';
  }
  
  // 检查 Jinja2 特有语法
  const hasJinjaSyntax = template.indexOf('{%') !== -1 && template.indexOf('%}') !== -1;
  if (hasJinjaSyntax) {
    if (template.indexOf('{% block') !== -1 || 
        template.indexOf('{% extends') !== -1 || 
        template.indexOf('{% trans') !== -1 ||
        template.indexOf('{% set ') !== -1) {
      return 'jinja';
    }
  }
  
  // 检查 Nunjucks/Jinja 通用语法
  if (template.indexOf('{%') !== -1 && template.indexOf('%}') !== -1 && template.indexOf('/{{') === -1) {
    return 'nunjucks';
  }
  
  return 'handlebars';
};

// 获取引擎信息
export const getEngineInfo = (engine?: TemplateEngine) => {
  const e = engine || defaultEngine;
  return engineConfigs[e];
};

// 获取所有引擎列表
export const getAllEngines = () => Object.entries(engineConfigs).map(([key, config]) => ({
  id: key as TemplateEngine,
  ...config,
  isDefault: key === defaultEngine,
}));

// 设置默认引擎
export const setDefaultEngine = (engine: TemplateEngine) => {
  defaultEngine = engine;
};

// Nunjucks/Jinja2 过滤器初始化
let nunjucksInitialized = false;

const initNunjucksEnv = () => {
  if (nunjucksInitialized) return;
  nunjucksInitialized = true;
  
  const filters = nunjucksEngine.filters;
  
  // 字符串过滤器
  filters['uppercase'] = (str: string) => str?.toUpperCase();
  filters['lowercase'] = (str: string) => str?.toLowerCase();
  filters['capitalize'] = (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  filters['title'] = (str: string) => str ? str.replace(/\w\S*/g, (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()) : '';
  filters['trim'] = (str: string) => str?.trim();
  filters['truncate'] = (str: string, length: number, killwords: boolean, end: string) => {
    if (!str) return '';
    if (str.length <= length) return str;
    let result = str.substring(0, length);
    if (!killwords) result = result.substring(0, result.lastIndexOf(' '));
    return result + (end || '...');
  };
  filters['wordcount'] = (str: string) => str ? str.trim().split(/\s+/).length : 0;
  filters['replace'] = (str: string, old: string, rep: string) => str?.split(old).join(rep);
  filters['striptags'] = (str: string) => str?.replace(/<[^>]*>/g, '');
  filters['url_encode'] = (str: string) => encodeURIComponent(str ?? '');
  filters['url_decode'] = (str: string) => decodeURIComponent(str ?? '');
  filters['json_dumps'] = (val: any, indent: number) => {
    try { return JSON.stringify(val, null, indent ?? 2); } catch { return String(val); }
  };
  
  // 数组过滤器
  filters['reverse'] = (arr: any[]) => arr?.slice().reverse();
  filters['sort'] = (arr: any[], reverse: boolean, caseSensitive: boolean, attr: string) => {
    if (!arr) return [];
    const sorted = arr.slice().sort((a: any, b: any) => {
      let x = attr ? a[attr] : a;
      let y = attr ? b[attr] : b;
      if (!caseSensitive && typeof x === 'string') { x = x.toLowerCase(); y = y.toLowerCase(); }
      if (x < y) return -1;
      if (x > y) return 1;
      return 0;
    });
    return reverse ? sorted.reverse() : sorted;
  };
  filters['first'] = (arr: any[]) => arr?.[0];
  filters['last'] = (arr: any[]) => arr?.[arr.length - 1];
  filters['length'] = (arr: any) => {
    if (Array.isArray(arr) || typeof arr === 'string') return arr.length;
    return 0;
  };
  filters['join'] = (arr: any[], sep: string) => arr?.join(sep ?? ', ') ?? '';
  filters['sum'] = (arr: any[], attr: string, start: number) => {
    if (!arr) return start ?? 0;
    return arr.reduce((acc: number, item: any) => acc + (attr ? Number(item[attr]) : Number(item)), start ?? 0);
  };
  filters['max'] = (arr: any[], attr: string) => {
    if (!arr || arr.length === 0) return undefined;
    return arr.reduce((m: any, item: any) => {
      const val = attr ? item[attr] : item;
      return val > (attr ? m[attr] : m) ? item : m;
    });
  };
  filters['min'] = (arr: any[], attr: string) => {
    if (!arr || arr.length === 0) return undefined;
    return arr.reduce((m: any, item: any) => {
      const val = attr ? item[attr] : item;
      return val < (attr ? m[attr] : m) ? item : m;
    });
  };
  filters['random'] = (arr: any[]) => arr?.[Math.floor(Math.random() * arr.length)];
  filters['batch'] = (arr: any[], linecount: number, fillwith: any) => {
    const result: any[][] = [];
    for (let i = 0; i < arr.length; i += linecount) {
      const batch = arr.slice(i, i + linecount);
      if (fillwith && batch.length < linecount) {
        while (batch.length < linecount) batch.push(fillwith);
      }
      result.push(batch);
    }
    return result;
  };
  filters['slice'] = (arr: any[], start: number, end: number) => arr?.slice(start, end);
  filters['map'] = (arr: any[], fn: any) => {
    if (!arr) return [];
    return arr.map((item: any) => typeof fn === 'function' ? fn(item) : item[fn]);
  };
  filters['reduce'] = (arr: any[], fn: any, initial: any) => {
    if (!arr) return initial;
    return arr.reduce((acc: any, item: any) => fn(acc, item), initial);
  };
  filters['select'] = (arr: any[], test: any, value: any) => {
    if (!arr) return [];
    return arr.filter((item: any) => {
      if (typeof test === 'function') return test(item);
      return item === value;
    });
  };
  filters['reject'] = (arr: any[], test: any, value: any) => {
    if (!arr) return [];
    return arr.filter((item: any) => {
      if (typeof test === 'function') return !test(item);
      return item !== value;
    });
  };
  filters['join_attr'] = (arr: any[], attr: string, sep: string) => {
    if (!arr) return '';
    return arr.map((item: any) => item[attr]).join(sep ?? ', ');
  };
  filters['chosen'] = (arr: any[]) => arr?.filter((item: any) => item);
  filters['compact'] = (arr: any[]) => arr?.filter((item: any) => item !== null && item !== undefined && item !== '');
  filters['reverse_each'] = (arr: any[]) => arr?.slice().reverse();
  
  // 数学过滤器
  filters['abs'] = (n: number) => Math.abs(Number(n));
  filters['round'] = (n: number, precision: number) => {
    const p = Math.pow(10, precision ?? 0);
    return Math.round(Number(n) * p) / p;
  };
  filters['int'] = (val: any, defaultVal: number) => {
    const n = parseInt(val, 10);
    return isNaN(n) ? (defaultVal ?? 0) : n;
  };
  filters['float'] = (val: any, defaultVal: number) => {
    const n = parseFloat(val);
    return isNaN(n) ? (defaultVal ?? 0.0) : n;
  };
  filters['string'] = (val: any) => String(val ?? '');
  filters['list'] = (val: any) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return val.split('');
    return [val];
  };
  
  // 条件过滤器
  filters['default'] = (val: any, def: any, bool: boolean) => {
    if (bool) return val || def;
    return val !== undefined && val !== null && val !== '' ? val : def;
  };
  filters['length_is'] = (val: any, oper: string, ref: number) => {
    const len = typeof val === 'string' || Array.isArray(val) ? val.length : 0;
    const r = ref ?? 0;
    switch (oper) {
      case '==': case 'eq': return len === r;
      case '!=': case 'ne': return len !== r;
      case '>': return len > r;
      case '>=': case 'gte': return len >= r;
      case '<': return len < r;
      case '<=': case 'lte': return len <= r;
      default: return len === r;
    }
  };
  filters['even'] = (n: number) => Number(n) % 2 === 0;
  filters['odd'] = (n: number) => Number(n) % 2 === 1;
  filters['divisibleby'] = (n: number, d: number) => Number(n) % Number(d) === 0;
  
  // Jinja2 特有过滤器
  filters['center'] = (str: string, width: number, char: string) => {
    const s = str ?? '';
    const w = width ?? 80;
    const c = char ?? ' ';
    if (s.length >= w) return s;
    const pad = Math.floor((w - s.length) / 2);
    return c.repeat(pad) + s + c.repeat(w - s.length - pad);
  };
  filters['ljust'] = (str: string, width: number, char: string) => {
    const s = str ?? '';
    if (s.length >= width) return s;
    return s + (char ?? ' ').repeat(width - s.length);
  };
  filters['rjust'] = (str: string, width: number, char: string) => {
    const s = str ?? '';
    if (s.length >= width) return s;
    return (char ?? ' ').repeat(width - s.length) + s;
  };
  filters['zfill'] = (str: string, width: number) => {
    const s = str ?? '';
    if (s.length >= width) return s;
    return '0'.repeat(width - s.length) + s;
  };
  filters['string_format'] = (str: string, ...args: any[]) => {
    try {
      let result = str;
      args.forEach((arg, i) => { result = result.replace(new RegExp('\\{' + i + '\\}', 'g'), String(arg)); });
      return result;
    } catch { return str; }
  };
  filters['force_escape'] = (str: string) => {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  filters['e'] = (str: string) => {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  filters['safe'] = (str: string) => str ?? '';
  filters['wordwrap'] = (str: string, width: number, breakLongWords: boolean) => {
    if (!str) return '';
    const w = width ?? 79;
    const words = str.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (line.length + word.length + 1 > w) {
        if (line) lines.push(line);
        if (breakLongWords && word.length > w) {
          for (let i = 0; i < word.length; i += w) lines.push(word.substr(i, w));
          line = '';
        } else {
          line = word;
        }
      } else {
        line = line ? line + ' ' + word : word;
      }
    }
    if (line) lines.push(line);
    return lines.join('\n');
  };
  filters['indent'] = (str: string, width: number, indentfirst: boolean) => {
    const s = str ?? '';
    const w = width ?? 4;
    const pad = ' '.repeat(w);
    const lines = s.split('\n');
    if (indentfirst && lines.length > 0) lines[0] = pad + lines[0];
    return lines.map((l: string) => l ? pad + l : l).join('\n');
  };
  filters['linebreaks'] = (str: string) => str?.replace(/\n/g, '<br/>\n');
  filters['linebreaksbr'] = (str: string) => str?.replace(/\n/g, '<br/>\n');
  filters['paragraphs'] = (str: string) => {
    return str?.split(/\n\n+/).map((p: string) => {
      return '<p>' + p.replace(/\n/g, '<br/>\n') + '</p>';
    }).join('\n\n');
  };
  filters['filesizeformat'] = (bytes: number, binary: boolean) => {
    if (bytes === 0) return '0 Bytes';
    const units = binary ? ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'] : ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(binary ? 1024 : 1000));
    const val = bytes / Math.pow(binary ? 1024 : 1000, i);
    return (i === 0 ? val : val.toFixed(1)) + ' ' + units[i];
  };
  filters['floatfmt'] = (val: number, precision: number) => {
    const n = Number(val);
    if (isNaN(n)) return '';
    if (precision === undefined) return String(n);
    return n.toFixed(precision);
  };
  filters['pprint'] = (val: any) => {
    try { return JSON.stringify(val, null, 4); } catch { return String(val); }
  };
  filters['list2str'] = (arr: any[], sep: string) => arr?.map((x: any) => String(x)).join(sep ?? ', ');
  filters['csv_format'] = (arr: any[][]) => {
    if (!arr || arr.length === 0) return '';
    return arr.map((row: any[]) => {
      return row.map((cell: any) => {
        const s = String(cell ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
    }).join('\n');
  };
};

const getNunjucksEnv = () => {
  initNunjucksEnv();
  return nunjucksEngine;
};

// EJS 自定义函数（完整库）
const ejsHelpers: Record<string, (...args: any[]) => any> = {
  uppercase: (str: string) => str?.toUpperCase(),
  lowercase: (str: string) => str?.toLowerCase(),
  capitalize: (str: string) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '',
  title: (str: string) => str ? str.replace(/\w\S*/g, (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()) : '',
  trim: (str: string) => str?.trim(),
  truncate: (str: string, length: number, killwords: boolean, end: string) => {
    if (!str) return '';
    if (str.length <= length) return str;
    let result = str.substring(0, length);
    if (!killwords) result = result.substring(0, result.lastIndexOf(' '));
    return result + (end || '...');
  },
  replace: (str: string, old: string, rep: string) => str?.split(old).join(rep),
  substring: (str: string, start: number, end: number) => str?.substring(start, end),
  striptags: (str: string) => str?.replace(/<[^>]*>/g, ''),
  length: (arr: any) => {
    if (Array.isArray(arr) || typeof arr === 'string') return arr.length;
    return 0;
  },
  first: (arr: any[]) => arr?.[0],
  last: (arr: any[]) => arr?.[arr.length - 1],
  join: (arr: any[], sep: string) => arr?.join(sep ?? ', ') ?? '',
  reverse: (arr: any[]) => arr?.slice().reverse(),
  sort: (arr: any[], reverse: boolean, caseSensitive: boolean, attr: string) => {
    if (!arr) return [];
    const sorted = arr.slice().sort((a: any, b: any) => {
      let x = attr ? a[attr] : a;
      let y = attr ? b[attr] : b;
      if (!caseSensitive && typeof x === 'string') { x = x.toLowerCase(); y = y.toLowerCase(); }
      if (x < y) return -1;
      if (x > y) return 1;
      return 0;
    });
    return reverse ? sorted.reverse() : sorted;
  },
  slice: (arr: any[], start: number, end: number) => arr?.slice(start, end),
  map: (arr: any[], fn: any) => {
    if (!arr) return [];
    return arr.map((item: any) => typeof fn === 'function' ? fn(item) : item[fn]);
  },
  filter: (arr: any[], fn: any) => {
    if (!arr) return [];
    return arr.filter((item: any) => typeof fn === 'function' ? fn(item) : true);
  },
  add: (a: any, b: any) => Number(a) + Number(b),
  sub: (a: any, b: any) => Number(a) - Number(b),
  mul: (a: any, b: any) => Number(a) * Number(b),
  div: (a: any, b: any) => Number(a) / Number(b),
  mod: (a: any, b: any) => Number(a) % Number(b),
  abs: (n: number) => Math.abs(Number(n)),
  round: (n: number, precision: number) => {
    const p = Math.pow(10, precision ?? 0);
    return Math.round(Number(n) * p) / p;
  },
  int: (val: any, defaultVal: number) => {
    const n = parseInt(val, 10);
    return isNaN(n) ? (defaultVal ?? 0) : n;
  },
  float: (val: any, defaultVal: number) => {
    const n = parseFloat(val);
    return isNaN(n) ? (defaultVal ?? 0.0) : n;
  },
  sum: (arr: any[], attr: string, start: number) => {
    if (!arr) return start ?? 0;
    return arr.reduce((acc: number, item: any) => acc + (attr ? Number(item[attr]) : Number(item)), start ?? 0);
  },
  max: (arr: any[], attr: string) => {
    if (!arr || arr.length === 0) return undefined;
    return arr.reduce((m: any, item: any) => {
      const val = attr ? item[attr] : item;
      return val > (attr ? m[attr] : m) ? item : m;
    });
  },
  min: (arr: any[], attr: string) => {
    if (!arr || arr.length === 0) return undefined;
    return arr.reduce((m: any, item: any) => {
      const val = attr ? item[attr] : item;
      return val < (attr ? m[attr] : m) ? item : m;
    });
  },
  pick: (...args: any[]) => {
    const items = args.slice(0, -1);
    if (items.length === 0) return '';
    return items[Math.floor(Math.random() * items.length)];
  },
  roll: (min: string, max: string) => {
    const minNum = parseInt(min, 10);
    const maxNum = parseInt(max, 10);
    return Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
  },
  rand: (max: string) => Math.floor(Math.random() * parseInt(max, 10)),
  random_item: (arr: any[]) => arr?.[Math.floor(Math.random() * arr.length)],
  chance: (probability: number) => Math.random() * 100 < probability,
  now: (format?: string) => {
    const d = new Date();
    if (format === 'date') return d.toLocaleDateString();
    if (format === 'time') return d.toLocaleTimeString();
    if (format === 'full') return d.toLocaleString();
    return d.toISOString();
  },
  format_date: (date: any, format?: string) => {
    const d = new Date(date || Date.now());
    if (format === 'date') return d.toLocaleDateString();
    if (format === 'time') return d.toLocaleTimeString();
    if (format === 'full') return d.toLocaleString();
    return d.toISOString();
  },
  getVariable: (scope: string, name: string) => {
    const stor = (variableStorage as any)[scope];
    return stor?.[name] ?? '';
  },
  setVariable: (scope: string, name: string, value: any) => {
    (variableStorage as any)[scope][name] = value;
    return '';
  },
  getGlobal: (name: string) => variableStorage.global[name] ?? '',
  setGlobal: (name: string, value: any) => { variableStorage.global[name] = value; return ''; },
  getChat: (name: string) => variableStorage.chat[name] ?? '',
  setChat: (name: string, value: any) => { variableStorage.chat[name] = value; return ''; },
  getSession: (name: string) => variableStorage.session[name] ?? '',
  setSession: (name: string, value: any) => { variableStorage.session[name] = value; return ''; },
  url_encode: (str: string) => encodeURIComponent(str ?? ''),
  url_decode: (str: string) => decodeURIComponent(str ?? ''),
  json_dumps: (val: any, indent: number) => {
    try { return JSON.stringify(val, null, indent ?? 2); } catch { return String(val); }
  },
  string_format: (str: string, ...args: any[]) => {
    try {
      let result = str;
      args.forEach((arg, i) => { result = result.replace(new RegExp('\\{' + i + '\\}', 'g'), String(arg)); });
      return result;
    } catch { return str; }
  },
  default: (val: any, def: any) => val !== undefined && val !== null && val !== '' ? val : def,
  even: (n: number) => Number(n) % 2 === 0,
  odd: (n: number) => Number(n) % 2 === 1,
  divisibleby: (n: number, d: number) => Number(n) % Number(d) === 0,
  escape: (str: string) => {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },
  unescape: (str: string) => {
    return String(str ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  },
  wordcount: (str: string) => str ? str.trim().split(/\s+/).length : 0,
  filesizeformat: (bytes: number, binary: boolean) => {
    if (bytes === 0) return '0 Bytes';
    const units = binary ? ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'] : ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(binary ? 1024 : 1000));
    const val = bytes / Math.pow(binary ? 1024 : 1000, i);
    return (i === 0 ? val : val.toFixed(1)) + ' ' + units[i];
  },
  format_number: (n: number, decimals: number) => {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? 0 });
  },
};

// 多引擎渲染器
const renderWithEngine = (
  template: string,
  context: MacroContext,
  engine: TemplateEngine
): string => {
  const templateData: Record<string, any> = {
    char: context.char || '',
    user: context.user || '',
    charPersona: context.charPersona || '',
    userPersona: context.userPersona || '',
    systemPrompt: context.systemPrompt || '',
    history: context.history || '',
    messageCount: context.messageCount ?? 0,
    chatTitle: context.chatTitle || '',
    worldInfo: context.worldInfo || '',
    lastMessage: context.lastMessage || '',
    lastCharMessage: context.lastCharMessage || '',
    lastUserMessage: context.lastUserMessage || '',
    time: context.time || new Date().toLocaleTimeString(),
    date: context.date || new Date().toLocaleDateString(),
    random: context.random || Math.random(),
    ...variableStorage.global,
    ...variableStorage.chat,
    ...variableStorage.session,
    ...(() => {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(context)) {
        if (k !== 'char' && k !== 'user') {
          result[k] = v;
        }
      }
      return result;
    })(),
  };

  switch (engine) {
    case 'handlebars': {
      let processed = template;

      // 转换旧语法
      processed = processed.replace(/\{\{setvar::([^:]+)::([^}]+)\}\}/g, '{{setvar $1 $2}}');
      processed = processed.replace(/\{\{setvar_([^:]+)::([^}]+)\}\}/g, '{{setvar $1 $2}}');
      processed = processed.replace(/\{\{getvar::([^}]+)\}\}/g, '{{getvar $1}}');
      processed = processed.replace(/\{\{getvar_([^}]+)\}\}/g, '{{getvar $1}}');
      processed = processed.replace(/\{\{pick::([^}]+)\}\}/g, (_, argsStr: string) => {
        const args = argsStr.split('::').filter(Boolean);
        return `{{pick ${args.map((a: string) => `"${a}"`).join(' ')}}}`;
      });
      processed = processed.replace(/\{\{roll::([^:]+)::([^}]+)\}\}/g, '{{roll $1 $2}}');
      processed = processed.replace(/\{\{rand::([^}]+)\}\}/g, '{{rand $1}}');
      processed = processed.replace(/\{\{if::([^}]+)\}\}([\s\S][\s\S]*?)\{\{endif\}\}/g, (_, condition: string, content: string) => {
        const parts = condition.split(/([<>!=]=?)/);
        const left = parts[0]?.trim() || 'true';
        const op = parts[1];
        const right = parts[2]?.trim() || '';
        if (!op) return `{{#if ${left}}}${content}{{/if}}`;
        const helperMap: Record<string, string> = {
          '==': 'if_eq', '!=': 'if_neq', '>': 'if_gt', '<': 'if_lt', '>=': 'if_gte', '<=': 'if_lte',
        };
        const helper = helperMap[op] || 'if_eq';
        return `{{#${helper} ${left} "${right}"}}${content}{{/${helper}}}`;
      });

      return handlebarsEngine.render(processed, templateData);
    }

    case 'ejs': {
      const data = {
        ...templateData,
        ...ejsHelpers,
        getVariable: (scope: string, name: string) => {
          const stor = (variableStorage as any)[scope];
          return stor?.[name] ?? '';
        },
        setVariable: (scope: string, name: string, value: any) => {
          (variableStorage as any)[scope][name] = value;
          return '';
        },
      };
      return ejsEngine.render(template, data);
    }

    case 'nunjucks':
    case 'jinja': {
      const env = getNunjucksEnv();
      const data = {
        ...templateData,
        getVariable: (name: string) => variableStorage.session[name] ?? variableStorage.chat[name] ?? variableStorage.global[name] ?? '',
        setVariable: (name: string, value: any) => {
          variableStorage.session[name] = value;
          return '';
        },
      };
      return env.renderString(template, data);
    }

    default:
      throw new Error(`Unknown engine: ${engine}`);
  }
};

export const macroService = {
  render(template: string, context: MacroContext, engine?: TemplateEngine): string {
    if (!template) return '';
    const e = engine || detectEngine(template);
    
    try {
      return renderWithEngine(template, context, e);
    } catch (error) {
      console.warn(`${e} rendering failed, falling back:`, error);
      return this.fallbackRender(template, context);
    }
  },

  getDefaultEngine(): TemplateEngine {
    return defaultEngine;
  },

  detectEngine(template: string): TemplateEngine {
    return detectEngine(template);
  },

  fallbackRender(template: string, context: MacroContext): string {
    let result = template;

    const varMap: Record<string, string> = {
      '{{char}}': context.char || '',
      '{{user}}': context.user || '',
      '{{char_persona}}': context.charPersona || '',
      '{{user_persona}}': context.userPersona || '',
      '{{system_prompt}}': context.systemPrompt || '',
      '{{history}}': context.history || '',
      '{{message_count}}': String(context.messageCount ?? 0),
      '{{chat_title}}': context.chatTitle || '',
      '{{world_info}}': context.worldInfo || '',
      '{{last_message}}': context.lastMessage || '',
      '{{last_char_message}}': context.lastCharMessage || '',
      '{{last_user_message}}': context.lastUserMessage || '',
      '{{time}}': context.time || new Date().toLocaleTimeString(),
      '{{date}}': context.date || new Date().toLocaleDateString(),
      '{{random}}': String(context.random || Math.random()),
    };

    for (const [macro, value] of Object.entries(varMap)) {
      result = result.replace(new RegExp(this.escapeRegExp(macro), 'g'), value);
    }

    return result;
  },

  escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  buildContext(params: {
    character?: Character;
    userName?: string;
    /** 只需要 role/content 两个字段，方便调用方传精简后的历史 */
    messages?: Array<Pick<ChatMessage, 'role' | 'content'>>;
    chatTitle?: string;
    systemPrompt?: string;
    worldInfo?: string;
    extra?: Record<string, any>;
  }): MacroContext {
    const { character, userName, messages, chatTitle, systemPrompt, worldInfo, extra } = params;

    const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1].content : '';
    const lastCharMessage = messages?.filter((m) => m.role === 'assistant').slice(-1)[0]?.content || '';
    const lastUserMessage = messages?.filter((m) => m.role === 'user').slice(-1)[0]?.content || '';

    const history = messages
      ?.slice(-50)
      .map((m) => {
        const role = m.role === 'user' ? userName || '用户' : character?.name || 'AI';
        return `${role}: ${m.content}`;
      })
      .join('\n') || '';

    return {
      char: character?.name || 'AI',
      user: userName || '用户',
      charPersona: character?.systemPrompt || '',
      userPersona: '',
      systemPrompt: systemPrompt || '',
      history,
      messageCount: messages?.length || 0,
      chatTitle: chatTitle || '',
      worldInfo: worldInfo || '',
      lastMessage,
      lastCharMessage,
      lastUserMessage,
      time: new Date().toLocaleTimeString(),
      date: new Date().toLocaleDateString(),
      random: Math.random(),
      ...(extra || {}),
    };
  },

  hasMacros(text: string): boolean {
    if (!text) return false;
    return /\{\{[^}]+\}\}/.test(text);
  },

  extractMacros(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/\{\{[^}]+\}\}/g);
    return matches ? [...new Set(matches)] : [];
  },

  getVariable(scope: VariableScope, name: string): any {
    return getVariable(scope, name);
  },

  setVariable(scope: VariableScope, name: string, value: any) {
    setVariable(scope, name, value);
  },

  clearScope(scope: VariableScope) {
    clearScope(scope);
  },

  getAllVariables(): Record<VariableScope, Record<string, any>> {
    return { ...variableStorage };
  },

  /**
   * 用外部存储覆盖当前变量作用域（进对话时调用）。
   * 之前这套作用域是纯内存单例、没有任何写入来源，所以 {{setvar}}/{{getvar}} 永远是空的。
   * 现在由 Chat 携带 macroVars，进出对话时做好同步。
   */
  hydrateVariables(state?: {
    global?: Record<string, any>;
    chat?: Record<string, any>;
    session?: Record<string, any>;
  } | null) {
    variableStorage.global = { ...(state?.global || {}) };
    variableStorage.chat = { ...(state?.chat || {}) };
    variableStorage.session = { ...(state?.session || {}) };
    variableStorage.message = {};
  },

  /** 取当前变量状态用于持久化（不含 message 作用域，它是单条消息级的临时值） */
  snapshotVariables(): {
    global: Record<string, any>;
    chat: Record<string, any>;
    session: Record<string, any>;
  } {
    return {
      global: { ...variableStorage.global },
      chat: { ...variableStorage.chat },
      session: { ...variableStorage.session },
    };
  },

  getBuiltinMacros(): { name: string; description: string; example: string }[] {
    return [
      { name: '{{char}}', description: '角色名称', example: '{{char}} 说：你好' },
      { name: '{{user}}', description: '用户名称', example: '你好，{{user}}' },
      { name: '{{char_persona}}', description: '角色人设', example: '【角色设定】\n{{char_persona}}' },
      { name: '{{history}}', description: '最近50条对话历史', example: '【历史记录】\n{{history}}' },
      { name: '{{message_count}}', description: '消息总数', example: '已对话 {{message_count}} 条' },
      { name: '{{time}}', description: '当前时间', example: '当前时间：{{time}}' },
      { name: '{{date}}', description: '当前日期', example: '今天是 {{date}}' },
      { name: '{{#if condition}}...{{/if}}', description: '条件判断', example: '{{#if hp > 50}}状态良好{{/if}}' },
      { name: '{{#each items}}...{{/each}}', description: '循环遍历', example: '{{#each skills}}{{this}}\n{{/each}}' },
      { name: '{{setvar name value}}', description: '设置会话变量', example: '{{setvar hp 100}}' },
      { name: '{{getvar name}}', description: '获取变量值', example: '生命值：{{getvar hp}}' },
      { name: '{{pick a b c}}', description: '随机选择', example: '{{pick 好 一般 差}}' },
      { name: '{{roll min max}}', description: '随机整数', example: '攻击：{{roll 1 100}}' },
      { name: '{{chance probability}}', description: '随机概率', example: '{{chance 50}}命中{{/chance}}' },
      { name: '{{add a b}}', description: '加法运算', example: '总数：{{add 10 5}}' },
      { name: '{{uppercase str}}', description: '转大写', example: '{{uppercase hello}}' },
      { name: '{{now format}}', description: '当前时间', example: '{{now time}}' },
      { name: '{{default val fallback}}', description: '默认值', example: '{{default name "未知"}}' },
    ];
  },
};
