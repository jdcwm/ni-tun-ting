const zlib = require('zlib');

// Read our inflate source and eval it
const fs = require('fs');
const src = fs.readFileSync('./src/utils/zipUtils.ts', 'utf8');

// Extract just the inflate function and helpers
const lines = src.split('\n');
// Find inflate function
let inflateStart = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('export function inflate(')) {
        inflateStart = i;
        break;
    }
}
if (inflateStart === -1) {
    console.log('Could not find inflate function');
    process.exit(1);
}
// Get everything up to inflate
const code = lines.slice(0, inflateStart + 1).join('\n');

// Eval the helper code, replacing export with nothing
const evalCode = code
    .replace(/^export /gm, '')
    .replace(/^import.*$/gm, '');

try {
    eval(evalCode);
    console.log('Helper code loaded OK');
    
    // Create test data: a DEFLATE stream of "Hello World! Hello World!"
    const original = Buffer.from('Hello World! Hello World! Hello World!');
    const compressed = zlib.deflateSync(original);
    console.log('Original size:', original.length, 'Compressed size:', compressed.length);
    
    // Now decompress with our inflate
    const result = inflate(new Uint8Array(compressed), original.length);
    const decompressed = Buffer.from(result);
    console.log('Decompressed:', decompressed.toString());
    console.log('Match:', original.equals(decompressed));
    
    if (original.equals(decompressed)) {
        console.log('INFLATE TEST PASSED!');
    } else {
        console.log('INFLATE TEST FAILED!');
        process.exit(1);
    }
} catch(e) {
    console.log('Error:', e.message);
    console.log(e.stack);
    process.exit(1);
}
