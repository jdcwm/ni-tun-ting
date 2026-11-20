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

const analyzePNG = (filePath) => {
  console.log(`\n=== 分析 PNG 文件: ${filePath} ===`);
  
  try {
    const buffer = fs.readFileSync(filePath);
    const bytes = new Uint8Array(buffer);
    
    console.log(`文件大小: ${buffer.length} 字节`);
    
    // 验证PNG签名
    let isValidPNG = true;
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
      if (bytes[i] !== PNG_SIGNATURE[i]) {
        isValidPNG = false;
        break;
      }
    }
    
    if (!isValidPNG) {
      console.log('❌ 不是有效的PNG文件');
      return;
    }
    console.log('✅ 是有效的PNG文件');
    
    // 遍历chunk
    let offset = PNG_SIGNATURE.length;
    let foundTextChunk = false;
    let foundChara = false;
    
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) break;
      
      const chunkLength = readUInt32BE(bytes, offset);
      const chunkType = bytesToString(bytes.subarray(offset + 4, offset + 8));
      
      // 检查是否越界
      if (offset + 12 + chunkLength > bytes.length) {
        console.log(`⚠️ 截断的chunk: ${chunkType}, 位置: ${offset}`);
        break;
      }
      
      const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkLength);
      
      console.log(`  Chunk: ${chunkType}, 长度: ${chunkLength} 字节`);
      
      if (chunkType === 'tEXt') {
        foundTextChunk = true;
        // 查找null分隔符
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
          
          console.log(`    Keyword: "${keyword}"`);
          
          if (keyword === 'chara' || keyword === 'chara_card_v2' || keyword === 'chara_card_v3') {
            foundChara = true;
            console.log(`    ✅ 找到角色卡片数据!`);
            console.log(`    数据长度: ${textData.length} 字符`);
            
            try {
              const jsonStr = Buffer.from(textData, 'base64').toString('utf-8');
              const cardData = JSON.parse(jsonStr);
              console.log(`    解析成功!`);
              console.log(`    Spec: ${cardData.spec || 'N/A'}`);
              console.log(`    角色名: ${cardData.data?.name || cardData.name || 'N/A'}`);
              console.log(`    描述: ${cardData.data?.description || cardData.description || 'N/A'}`);
              console.log(`    Tags: ${cardData.data?.tags?.slice(0, 5).join(', ') || cardData.tags?.slice(0, 5).join(', ') || 'N/A'}`);
            } catch (e) {
              console.log(`    ❌ Base64解码失败，尝试直接JSON解析...`);
              try {
                const cardData = JSON.parse(textData);
                console.log(`    ✅ 直接JSON解析成功!`);
                console.log(`    角色名: ${cardData.data?.name || cardData.name || 'N/A'}`);
              } catch (e2) {
                console.log(`    ❌ JSON解析也失败: ${e2.message}`);
                console.log(`    数据前100字符: "${textData.substring(0, 100)}..."`);
              }
            }
          }
        }
      }
      
      offset += 12 + chunkLength;
    }
    
    console.log('\n=== 分析结果 ===');
    if (foundChara) {
      console.log('✅ 这张PNG包含角色卡片数据，可以导入');
    } else if (foundTextChunk) {
      console.log('⚠️ 这张PNG包含tEXt chunk，但没有角色卡片数据');
    } else {
      console.log('❌ 这张PNG没有包含角色卡片数据');
      console.log('提示: TavernAI/SillyTavern格式的角色卡会在PNG的tEXt chunk中嵌入base64编码的JSON数据');
    }
    
  } catch (error) {
    console.error(`❌ 读取文件失败: ${error.message}`);
  }
};

const desktopPath = 'c:\\Users\\jdcwm\\Desktop';
const testFiles = fs.readdirSync(desktopPath).filter(f => f.endsWith('.png'));

console.log(`\n=== 在桌面找到 ${testFiles.length} 个PNG文件 ===`);
testFiles.forEach((file, index) => {
  console.log(`${index + 1}. ${file}`);
});

testFiles.forEach(name => {
  const fullPath = path.join(desktopPath, name);
  analyzePNG(fullPath);
});