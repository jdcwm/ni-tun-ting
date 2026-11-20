const fs = require('fs');
const path = require('path');

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

const readUInt32BE = (bytes, offset) => {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
};

const bytesToString = (bytes) => {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(str));
};

const desktopPath = 'c:\\Users\\jdcwm\\Desktop';
const testFile = '1784893363703_48iyur5d6cjt_png_512x768~tplv-zaeny81f73-image.png';
const fullPath = path.join(desktopPath, testFile);

console.log(`\n=== 详细分析角色卡: ${testFile} ===\n`);

try {
  const buffer = fs.readFileSync(fullPath);
  const bytes = new Uint8Array(buffer);
  
  let offset = PNG_SIGNATURE.length;
  
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) break;
    
    const chunkLength = readUInt32BE(bytes, offset);
    const chunkType = bytesToString(bytes.subarray(offset + 4, offset + 8));
    
    if (offset + 12 + chunkLength > bytes.length) break;
    
    const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    
    if (chunkType === 'tEXt') {
      let nullIndex = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i;
          break;
        }
      }
      
      if (nullIndex > 0) {
        const keyword = bytesToString(chunkData.subarray(0, nullIndex));
        const textData = bytesToString(chunkData.subarray(nullIndex + 1));
        
        if (keyword === 'chara' || keyword === 'chara_card_v2' || keyword === 'chara_card_v3') {
          console.log(`找到角色数据，keyword: ${keyword}`);
          console.log(`数据长度: ${textData.length} 字符\n`);
          
          try {
            const jsonStr = Buffer.from(textData, 'base64').toString('utf-8');
            const cardData = JSON.parse(jsonStr);
            
            console.log('=== 角色卡完整结构 ===');
            console.log('spec:', cardData.spec);
            console.log('spec_version:', cardData.spec_version);
            
            if (cardData.data) {
              console.log('\n=== data 字段内容 ===');
              const data = cardData.data;
              console.log('name:', data.name);
              console.log('description 长度:', (data.description || '').length);
              console.log('system_prompt 长度:', (data.system_prompt || '').length);
              console.log('system_prompt 内容:', data.system_prompt ? data.system_prompt.substring(0, 200) + '...' : '(空)');
              console.log('first_mes (开场白) 长度:', (data.first_mes || '').length);
              console.log('first_mes 内容:', data.first_mes ? data.first_mes.substring(0, 200) + '...' : '(空)');
              console.log('greeting:', data.greeting ? data.greeting.substring(0, 100) : '(空)');
              console.log('personality 长度:', (data.personality || '').length);
              console.log('scenario:', data.scenario ? data.scenario.substring(0, 100) : '(空)');
              console.log('mes_example 长度:', (data.mes_example || '').length);
              console.log('creator_notes 长度:', (data.creator_notes || '').length);
              console.log('alternate_greetings:', data.alternate_greetings?.length || 0);
              console.log('tags:', data.tags?.join(', ') || '[]');
              console.log('creator:', data.creator || '');
              console.log('character_version:', data.character_version || '');
              
              // 列出所有字段
              console.log('\n=== data 的所有字段 ===');
              Object.keys(data).forEach(key => {
                const val = data[key];
                if (typeof val === 'string') {
                  console.log(`  ${key}: 字符串, 长度 ${val.length}`);
                } else if (Array.isArray(val)) {
                  console.log(`  ${key}: 数组, 长度 ${val.length}`);
                } else if (typeof val === 'object' && val !== null) {
                  console.log(`  ${key}: 对象, 字段: ${Object.keys(val).join(', ')}`);
                } else {
                  console.log(`  ${key}: ${typeof val} = ${val}`);
                }
              });
            }
          } catch (e) {
            console.log('解析失败:', e.message);
          }
        }
      }
    }
    
    offset += 12 + chunkLength;
  }
  
} catch (error) {
  console.error('读取文件失败:', error.message);
}
