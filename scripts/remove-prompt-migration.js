// 撤掉「碧蓝档案提示词/资料」的自动升级迁移。
// 用户要求：不要自动更新提示词 —— 只改源码里那一份就够了，运行时不要动用户的数据。
// 保留：世界书升级、通讯录预置、遗留扮演标记清理。
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'src', 'context', 'AppContext.tsx');

let s = fs.readFileSync(F, 'utf8');

const START = '        // ===== 碧蓝档案「资料 / 提示词」版本迁移 =====';
const END = '        // ===== 数据完整性安全门 =====';

const i = s.indexOf(START);
const j = s.indexOf(END);
if (i < 0 || j < 0 || j <= i) {
  console.error('找不到迁移块边界', i, j);
  process.exit(1);
}

const REPLACEMENT = `        // ===== 遗留字段清理 =====
        // 说明：这里**不再自动更新任何提示词/角色资料**。
        // 之前加过一整套「碧蓝档案提示词版本迁移」，会在启动时重写对话和角色卡的 systemPrompt，
        // 用户明确要求不要这么做 —— 提示词只改源码里的那一份，运行时不要动用户数据。
        // 只保留这一项必要的修复：清掉早期「扮演」功能写进对话设置的标记，
        // 因为残留标记会让那个对话永远不回复。
        {
          let clearedPuppet = 0;
          for (const c of migratedChats) {
            if (c.settings?.puppetCharacterId) {
              c.settings = { ...c.settings, puppetCharacterId: undefined };
              clearedPuppet++;
            }
          }
          if (clearedPuppet > 0) console.log('[migrate] 已清理遗留的扮演标记:', clearedPuppet, '个');
        }

`;

s = s.slice(0, i) + REPLACEMENT + s.slice(j);
fs.writeFileSync(F, s, 'utf8');
console.log('已移除碧蓝档案提示词/资料自动升级迁移');
