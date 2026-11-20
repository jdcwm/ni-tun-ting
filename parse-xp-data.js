const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', '..', '醒来_2.txt');
const outputPath = path.join(__dirname, 'src', 'data', 'xpExtensionData.ts');

const content = fs.readFileSync(inputPath, 'utf-8');
const lines = content.split(/\r?\n/);

const entries = [];
const categoryMap = {
  'A': '世界观设定',
  'D': '性格与身份属性',
  'E': '职业身份',
  'F': '职业身份',
  'I': '特殊能力',
  'J': '服装与服饰',
  'K': '身体特征与性征',
  'L': '感官与情感状态',
  'N': '体位与性行为',
  'P': '调教与行为',
  'S': '特殊场景',
  'T': 'SM与酷刑',
  'U': '拘束与调教',
  'V': '驯养与长期',
  'W': '重度暴力',
  'X': '异物与排泄',
  'Y': '兽交与动物',
  'Z': '极端与猎奇',
};

for (const line of lines) {
  const match = line.match(/^([A-Z]+\d+)\.\s+(.+?):\s*(.+)$/);
  if (match) {
    const [, id, name, desc] = match;
    const category = id.replace(/\d+/g, '');
    const keys = [name];
    if (name.includes('/')) {
      keys.push(...name.split('/'));
    }
    if (name.includes('（')) {
      const baseName = name.replace(/（[^）]+）/g, '').trim();
      keys.push(baseName);
    }
    entries.push({
      id: `xp_${id}`,
      keys: [...new Set(keys.map(k => k.trim()).filter(k => k.length > 0))],
      content: `${name}：${desc.trim()}`,
      category: categoryMap[category] || '其他',
      enabled: true,
      images: [],
    });
  }
}

console.log(`Total entries found: ${entries.length}`);

const categories = {};
for (const entry of entries) {
  const cat = entry.category;
  if (!categories[cat]) categories[cat] = 0;
  categories[cat]++;
}

console.log('\nCategories:');
for (const [cat, count] of Object.entries(categories)) {
  console.log(`  ${cat}: ${count}`);
}

const escapeContent = (str) => {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
};

const worldBookContent = `import { WorldBook, WorldBookEntry } from '../types';

export const xpExtensionEntries: WorldBookEntry[] = [
${entries.map(e => `  {
    id: '${e.id}',
    keys: ${JSON.stringify(e.keys)},
    content: \`${escapeContent(e.content)}\`,
    images: [],
    enabled: ${e.enabled},
    category: '${e.category}',
  }`).join(',\n')}
];

export const xpExtensionWorldBook: WorldBook = {
  id: 'worldbook_xp_extension',
  name: 'XP扩展分类库',
  description: '包含各类角色属性、服装、身体特征、体位、调教方式等XP扩展词条，用于丰富角色扮演的细节描写。',
  entries: xpExtensionEntries,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
`;

fs.writeFileSync(outputPath, worldBookContent, 'utf-8');
console.log(`\nGenerated: ${outputPath}`);
console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
