const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', '..', '醒来_2.txt');
const content = fs.readFileSync(inputPath, 'utf-8');
const lines = content.split(/\r?\n/);

console.log('Total lines:', lines.length);
console.log('First 20 lines:');
for (let i = 0; i < 20 && i < lines.length; i++) {
  const line = lines[i];
  console.log(`${i + 1}: [${line.substring(0, 80)}] (length: ${line.length})`);
  if (i >= 9) {
    const match = line.match(/^([A-Z]+\d+)\.\s+([^：]+)：\s*(.+)$/);
    console.log(`  match: ${match ? 'YES' : 'NO'}`);
    if (!match) {
      const charCodes = [];
      for (let j = 0; j < Math.min(10, line.length); j++) {
        charCodes.push(line.charCodeAt(j));
      }
      console.log(`  charCodes (first 10): ${charCodes.join(', ')}`);
    }
  }
}
