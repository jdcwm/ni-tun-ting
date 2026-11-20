import { StatusVar, StatusBarConfig } from '../types';
import { aiJSService } from './aiJSService';

export type StatusVarValue = number | string;
export type StatusVarCommand =
  | { op: 'set'; name: string; value: StatusVarValue }
  | { op: 'add'; name: string; value: StatusVarValue }
  | { op: 'inc'; name: string }
  | { op: 'dec'; name: string }
  | { op: 'delete'; name: string };

interface MacroRenderContext {
  vars?: Record<string, StatusVarValue>;
  userName?: string;
  charName?: string;
  chatTitle?: string;
  messageCount?: number;
}

const parseValue = (rawValue: string): StatusVarValue => {
  const trimmed = rawValue.trim();
  const numValue = Number(trimmed);
  return trimmed !== '' && !isNaN(numValue) ? numValue : trimmed;
};

const readVar = (vars: Record<string, StatusVarValue> | undefined, name: string): string => {
  const value = vars?.[name.trim()];
  return value === undefined || value === null ? '' : String(value);
};

const clampDisplayValue = (value: StatusVarValue, configVar: StatusVar): StatusVarValue => {
  if (typeof value !== 'number' || configVar.type === 'string') {
    return value;
  }

  const min = configVar.min ?? Number.NEGATIVE_INFINITY;
  const max = configVar.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, value));
};

export const statusVarService = {
  parseVarCommands: (text: string): StatusVarCommand[] => {
    const results: StatusVarCommand[] = [];
    const regex = /\{\{(setvar|addvar|incvar|decvar|deletevar|flushvar)(?:::|:|\s+)([^}:]+?)(?:(?:::|:)([^}]*))?\}\}/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const op = match[1].toLowerCase();
      const name = match[2].trim();
      const rawValue = match[3]?.trim() ?? '';

      if (!name) continue;

      if (op === 'setvar') {
        results.push({ op: 'set', name, value: parseValue(rawValue) });
      } else if (op === 'addvar') {
        results.push({ op: 'add', name, value: parseValue(rawValue) });
      } else if (op === 'incvar') {
        results.push({ op: 'inc', name });
      } else if (op === 'decvar') {
        results.push({ op: 'dec', name });
      } else {
        results.push({ op: 'delete', name });
      }
    }

    return results;
  },

  parseSetVarCommands: (text: string): { name: string; value: StatusVarValue }[] => {
    return statusVarService
      .parseVarCommands(text)
      .filter((cmd): cmd is { op: 'set'; name: string; value: StatusVarValue } => cmd.op === 'set')
      .map(({ name, value }) => ({ name, value }));
  },

  parseGetVarCommands: (text: string): string[] => {
    const results: string[] = [];
    const regex = /\{\{getvar(?:::|:|\s+)([^}]+)\}\}/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      results.push(match[1].trim());
    }

    return results;
  },

  replaceGetVarCommands: (
    text: string,
    vars: Record<string, StatusVarValue>
  ): string => {
    return text.replace(/\{\{getvar(?:::|:|\s+)([^}]+)\}\}/gi, (_match, name) =>
      readVar(vars, name)
    );
  },

  renderPromptMacros: (text: string, context: MacroRenderContext = {}): string => {
    const now = new Date();
    let result = text;

    result = result.replace(/\{\{user\}\}/gi, context.userName || '用户');
    result = result.replace(/\{\{char\}\}/gi, context.charName || 'AI');
    result = result.replace(/\{\{ai_card\}\}/gi, context.charName || 'AI');
    result = result.replace(/\{\{user_card\}\}/gi, context.userName || '用户');
    result = result.replace(/\{\{date\}\}/gi, now.toLocaleDateString());
    result = result.replace(/\{\{time\}\}/gi, now.toLocaleTimeString());
    result = result.replace(/\{\{chat_title\}\}/gi, context.chatTitle || '');
    result = result.replace(/\{\{message_count\}\}/gi, String(context.messageCount ?? 0));
    result = statusVarService.replaceGetVarCommands(result, context.vars || {});

    result = result.replace(/\{\{random(?:::|:)([^}]+)\}\}/gi, (_match, rawOptions) => {
      const options = String(rawOptions)
        .split(/::|:/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (options.length === 0) return '';
      return options[Math.floor(Math.random() * options.length)];
    });

    result = result.replace(/\{\{rand(?:::|:)(\d+)\}\}/gi, (_match, max) => {
      const upper = Math.max(0, Number(max) || 0);
      return String(Math.floor(Math.random() * (upper + 1)));
    });

    result = result.replace(/\{\{roll(?:::|:)(\d+)\}\}/gi, (_match, sides) => {
      const dieSides = Math.max(1, Number(sides) || 1);
      return String(Math.floor(Math.random() * dieSides) + 1);
    });

    return result;
  },

  stripStatusCommands: (text: string): string => {
    let result = text;
    result = result.replace(/\{\{(?:setvar|addvar|incvar|decvar|deletevar|flushvar)(?:::|:|\s+)[^}]+\}\}/gi, '');
    result = result.replace(/\{\{getvar(?:::|:|\s+)[^}]+\}\}/gi, '');
    result = result.replace(/<StatusBlock>[\s\S]*?<\/StatusBlock>/gi, '');
    result = result.replace(/```status[\s\S]*?```/gi, '');
    return result.trim();
  },

  applyUpdates: (
    currentVars: Record<string, StatusVarValue>,
    updates: Array<StatusVarCommand | { name: string; value: StatusVarValue }>
  ): Record<string, StatusVarValue> => {
    const newVars = { ...currentVars };

    updates.forEach((update) => {
      const command: StatusVarCommand = 'op' in update
        ? update
        : { op: 'set', name: update.name, value: update.value };

      if (command.op === 'delete') {
        delete newVars[command.name];
        return;
      }

      const currentValue = newVars[command.name];

      if (command.op === 'set') {
        newVars[command.name] = command.value;
      } else if (command.op === 'add') {
        const addValue = Number(command.value);
        const numericCurrent = Number(currentValue ?? 0);
        if (!isNaN(addValue) && !isNaN(numericCurrent)) {
          newVars[command.name] = numericCurrent + addValue;
        } else {
          newVars[command.name] = `${currentValue ?? ''}${command.value}`;
        }
      } else if (command.op === 'inc') {
        const numericCurrent = Number(currentValue ?? 0);
        newVars[command.name] = isNaN(numericCurrent) ? 1 : numericCurrent + 1;
      } else if (command.op === 'dec') {
        const numericCurrent = Number(currentValue ?? 0);
        newVars[command.name] = isNaN(numericCurrent) ? -1 : numericCurrent - 1;
      }
    });

    return newVars;
  },

  initVarsFromConfig: (config?: StatusBarConfig): Record<string, StatusVarValue> => {
    if (!config || !config.vars) return {};
    const vars: Record<string, StatusVarValue> = {};
    config.vars.forEach((v) => {
      vars[v.name] = v.value;
    });
    return vars;
  },

  getDisplayVars: (
    config: StatusBarConfig | undefined,
    currentVars: Record<string, StatusVarValue>
  ): StatusVar[] => {
    if (!config || !config.vars) return [];
    return config.vars.map((v) => ({
      ...v,
      value: clampDisplayValue(
        currentVars[v.name] !== undefined ? currentVars[v.name] : v.value,
        v
      ),
    }));
  },

  generateSystemPrompt: (config?: StatusBarConfig): string => {
    if (!config || !config.enabled || config.vars.length === 0) return '';

    const varDescriptions = config.vars
      .map((v) => {
        let desc = `- ${v.name} (${v.label})`;
        if (v.min !== undefined && v.max !== undefined) {
          desc += `，范围 ${v.min}-${v.max}`;
        }
        if (v.type === 'progress') {
          desc += '，进度条类型';
        } else if (v.type === 'number') {
          desc += '，纯数字类型';
        } else {
          desc += '，文字类型';
        }
        if (v.icon) {
          desc += `，图标：${v.icon}`;
        }
        return desc;
      })
      .join('\n');

    const codeBlock = '```';
    return `
═══════════════════════════════════
         状态变量系统 v2.0
═══════════════════════════════════

【功能说明】
你现在拥有一套强大的状态变量系统！你可以通过特殊语法来管理和更新角色的各种状态。
这些状态会实时显示在聊天界面的状态栏中，给用户带来沉浸式的互动体验。

【核心语法】

1. 更新变量（必须掌握！）
   {{setvar:变量名:数值}} 或 {{setvar::变量名::数值}}
   
   示例：
   {{setvar:hp:80}}      - 将生命值设为80
   {{setvar:mood:开心}}   - 将心情设为"开心"
   {{setvar:location:森林}} - 将位置设为"森林"

2. 读取变量（可选）
   {{getvar:变量名}} 或 {{getvar::变量名}}
   
   示例：
   我的生命值是 {{getvar:hp}}！

【使用规范】

✅ 必须遵守的规则：
1. 每次回复末尾，必须检查是否需要更新状态变量
2. 只使用预定义的变量名，不能自己创建新变量
3. 数值类型变量必须在范围内，超出范围会被自动修正
4. 变量更新必须放在 ${codeBlock}status 代码块或 <StatusBlock> 标签中

❌ 绝对禁止：
1. 不要在对话正文中讨论状态变量系统本身
2. 不要解释"我正在更新状态"这类内容
3. 不要使用未定义的变量名

【预定义变量列表】
${varDescriptions}

【三种格式（任选其一）】

格式1：代码块格式（推荐）
${codeBlock}status
{{setvar:hp:80}}
{{setvar:mp:60}}
{{setvar:mood:开心}}
${codeBlock}

格式2：标签格式
<StatusBlock>
{{setvar:hp:80}}
{{setvar:mp:60}}
</StatusBlock>

格式3：内联格式（简单更新时可用）
{{setvar:hp:80}}{{setvar:mp:60}}

格式4：SillyTavern兼容格式
{{setvar::hp::80}}
{{addvar::hp::-10}}
{{incvar::turn}}
{{decvar::energy}}

【智能更新策略】

根据对话内容合理更新变量：
- 如果用户攻击敌人 → 减少生命值和体力，增加击杀数
- 如果用户休息 → 恢复生命值和体力
- 如果用户使用技能 → 减少魔法值
- 如果用户移动 → 更新位置，消耗体力
- 如果用户获得物品 → 增加金币或道具
- 如果用户受伤 → 减少生命值
- 如果用户吃东西 → 增加饱食度

【完整示例】

场景：用户说"我攻击哥布林"

你的回复：
我挥舞长剑冲向哥布林！经过一番激战，我成功击败了它，但也受了点伤。

${codeBlock}status
{{setvar:hp:85}}
{{setvar:stamina:80}}
{{setvar:kills:1}}
{{setvar:gold:550}}
${codeBlock}

【提示】
- 更新要自然，不要每次都更新所有变量，只更新变化的
- 数值变化要合理，不要忽高忽低
- 根据角色性格调整更新幅度

═══════════════════════════════════
       高级渲染引擎 v3.0 完整API
═══════════════════════════════════

【功能说明】
你可以通过JavaScript代码创建任意复杂的自定义界面！支持完整的DOM操作、CSS动画、SVG绘图、交互事件。

【一、变量操作】
setVar('hp', 80)         设置变量
addVar('gold', 100)      增减变量
getVar('hp')             读取变量
incVar('turn')           自增1
decVar('energy')         自减1

【二、渲染入口】
ui.inline.render(html)     在消息内渲染（最常用）
ui.statusBar.render(html)  渲染到状态栏区域
ui.modal.show(html)        弹窗显示

【三、内置组件库 ui.components】
所有组件返回HTML字符串，可直接拼接使用。

1. progressBar - 进度条
   ui.components.progressBar({
     value: 80, max: 100, label: 'HP',
     color: '#ff6b6b', trackColor: '#333',
     height: 8, showText: true, animated: true
   })

2. statCard - 状态卡片
   ui.components.statCard({
     icon: '⚔️', label: '攻击力', value: '120',
     color: '#fff', bgGradient: 'linear-gradient(135deg,#1a1a2e,#16213e)'
   })

3. gauge - 环形仪表
   ui.components.gauge({
     value: 75, max: 100, label: '暴击率',
     size: 80, color: '#FFD700', unit: '%'
   })

4. badge - 徽章
   ui.components.badge({ text: 'LV.5', color: '#fff', bg: '#4CAF50', icon: '⭐' })

5. card - 卡片容器
   ui.components.card({
     title: '角色信息', subtitle: '等级 5',
     content: '内容...', footer: '附加信息',
     gradient: 'linear-gradient(135deg,#1a1a2e,#0f3460)',
     borderColor: 'rgba(255,255,255,0.1)', glow: true
   })

6. chip - 标签芯片
   ui.components.chip({ label: '火焰', value: '+10', color: '#ff6b6b', active: true })

7. divider - 分隔线
   ui.components.divider({ color: 'rgba(255,255,255,0.1)', margin: 8 })

8. avatar - 头像
   ui.components.avatar({ src: '', size: 48, ring: true, ringColor: '#4CAF50' })

9. tabs - 标签页
   ui.components.tabs({ tabs: [{label:'状态',content:'...'},{label:'技能',content:'...'}], active: 0 })

【四、CSS动画类 ui.animations】
直接给元素加class即可生效：
- ai-anim-shimmer   高光扫过（适合进度条）
- ai-anim-pulse     脉冲缩放（适合警告/重要状态）
- ai-anim-glow      发光呼吸（适合卡片）
- ai-anim-slide-up  滑入动画（适合入场效果）
- ai-anim-fade-in   淡入动画
- ai-anim-bounce    弹跳动画（适合通知）
- ai-anim-rotate    旋转动画（适合loading）
- ai-anim-flash     闪烁动画（适合低血量警告）

【五、DOM工具】
$(selector)            querySelector
$$(selector)           querySelectorAll
el(tag, attrs, ...children)  创建DOM元素

el('div', {style:{color:'red'}, class:'my-class', onClick:()=>{}}, '文本内容')

【六、事件通信】
emit('eventName', data)    向App发送事件
onUpdate(callback)         注册更新回调

【七、完整示例】

${codeBlock}js
// 更新变量
setVar('hp', 85);
setVar('mp', 60);
setVar('gold', 550);
addVar('exp', 50);

// 渲染RPG状态面板
ui.inline.render(\`
  <div style="background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);border-radius:16px;padding:16px;font-family:sans-serif;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <div style="width:48px;height:48px;border-radius:50%;background:radial-gradient(circle,#FFD700,#FFA500);display:flex;align-items:center;justify-content:center;font-size:24px;" class="ai-anim-glow">🧙</div>
      <div style="flex:1;">
        <div style="color:#FFD700;font-size:16px;font-weight:700;">法师 艾伦</div>
        <div style="display:flex;gap:6px;margin-top:2px;">
          \${ui.components.badge({text:'LV.12',bg:'rgba(255,215,0,0.2)',color:'#FFD700',icon:'⭐'})}
          \${ui.components.badge({text:'火焰法师',bg:'rgba(255,107,107,0.2)',color:'#ff6b6b'})}
        </div>
      </div>
    </div>

    <div style="display:flex;gap:12px;flex-direction:column;">
      \${ui.components.progressBar({value:getVar('hp',85),max:100,label:'❤️ 生命值',color:'linear-gradient(90deg,#ff6b6b,#ee5a5a)',height:10})}
      \${ui.components.progressBar({value:getVar('mp',60),max:100,label:'💙 魔法值',color:'linear-gradient(90deg,#4FC3F7,#29B6F6)',height:10})}
      \${ui.components.progressBar({value:75,max:100,label:'✨ 经验值',color:'linear-gradient(90deg,#FFD54F,#FFC107)',height:6,showText:false})}
    </div>

    <div style="display:flex;gap:8px;margin-top:14px;justify-content:space-around;">
      \${ui.components.statCard({icon:'⚔️',label:'攻击',value:'156',color:'#fff',bgGradient:'linear-gradient(135deg,#1a1a2e,#16213e)'})}
      \${ui.components.statCard({icon:'🛡️',label:'防御',value:'89',color:'#fff',bgGradient:'linear-gradient(135deg,#1a1a2e,#16213e)'})}
      \${ui.components.statCard({icon:'💰',label:'金币',value:getVar('gold',550),color:'#FFD700',bgGradient:'linear-gradient(135deg,#1a1a2e,#16213e)'})}
    </div>
  </div>
\`);
${codeBlock}

【八、使用规范】
1. 代码块用 \`\`\`js 包裹
2. HTML用反引号(\`)包裹，模板字符串中用 \${} 插入组件
3. 所有CSS用内联style属性或class
4. 颜色用十六进制(#ff6b6b)或CSS颜色名
5. 界面宽度约为360px，注意适配
6. 可以直接写原生CSS3：渐变、阴影、transform、animation、SVG、Canvas都支持
7. 可以用 document.getElementById 等 DOM API 直接操作
═══════════════════════════════════
`.trim();
  },

  hasAIJSCode: (text: string): boolean => {
    return aiJSService.hasAIJSCode(text);
  },

  extractAIJSCode: (text: string): string[] => {
    return aiJSService.extractAIJSCode(text);
  },

  stripAIJSCode: (text: string): string => {
    return aiJSService.stripAIJSCode(text);
  },

  stripAllSystemCommands: (text: string): string => {
    let result = statusVarService.stripStatusCommands(text);
    result = statusVarService.stripAIJSCode(result);
    return result;
  },
};
