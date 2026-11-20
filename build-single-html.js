const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const outputPath = path.join(__dirname, 'shark酒馆-web版.html');

console.log('=== 开始构建单文件HTML ===');

if (!fs.existsSync(distDir)) {
  console.error('错误: dist目录不存在，请先运行 expo export -p web');
  process.exit(1);
}

const htmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('错误: index.html不存在');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf-8');
console.log('✓ 读取index.html成功');

const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');
if (!fs.existsSync(jsDir)) {
  console.error('错误: JS目录不存在');
  process.exit(1);
}

const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error('错误: 未找到JS文件');
  process.exit(1);
}

const jsPath = path.join(jsDir, jsFiles[0]);
let jsContent = fs.readFileSync(jsPath, 'utf-8');
console.log(`✓ 读取JS文件: ${jsFiles[0]} (${(jsContent.length / 1024 / 1024).toFixed(2)} MB)`);

const faviconPath = path.join(distDir, 'favicon.ico');
if (fs.existsSync(faviconPath)) {
  const faviconBase64 = fs.readFileSync(faviconPath).toString('base64');
  html = html.replace(
    '<link rel="icon" href="/favicon.ico"/>',
    '<link rel="icon" href="data:image/x-icon;base64,' + faviconBase64 + '"/>'
  );
  console.log('✓ 内联favicon成功');
} else {
  console.log('⚠️ favicon.ico不存在，跳过');
}

const assetsDir = path.join(distDir, 'assets');
if (fs.existsSync(assetsDir)) {
  const assetFiles = [];
  const collectAssets = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        collectAssets(fullPath);
      } else if (file.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
        assetFiles.push(fullPath);
      }
    }
  };
  collectAssets(assetsDir);

  console.log(`✓ 发现 ${assetFiles.length} 个资源文件`);

  for (const assetPath of assetFiles) {
    const relativePath = '/' + path.relative(distDir, assetPath).replace(/\\/g, '/');
    const ext = path.extname(assetPath).toLowerCase();
    let mimeType = '';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.svg') mimeType = 'image/svg+xml';
    else if (ext === '.webp') mimeType = 'image/webp';
    else continue;

    const base64 = fs.readFileSync(assetPath).toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const escapedPath = relativePath.replace(/\//g, '\\/');
    const regex = new RegExp(`"${escapedPath}"`, 'g');
    const matches = jsContent.match(regex);
    
    if (matches && matches.length > 0) {
      jsContent = jsContent.replace(regex, `"${dataUrl}"`);
      console.log(`  ✓ 内联资源: ${path.basename(assetPath)} (${(base64.length * 0.75 / 1024).toFixed(1)} KB)`);
    }
  }
}

const jsBlob = Buffer.from(jsContent, 'utf-8').toString('base64');

const loaderScript = `
<script>
(function() {
  var jsData = atob('${jsBlob}');
  var blob = new Blob([jsData], { type: 'application/javascript' });
  var url = URL.createObjectURL(blob);
  var script = document.createElement('script');
  script.src = url;
  script.onload = function() {
    URL.revokeObjectURL(url);
  };
  document.head.appendChild(script);
})();
</script>
`;

html = html.replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/, loaderScript);
console.log('✓ 使用Blob方式内联JS脚本');

fs.writeFileSync(outputPath, html, 'utf-8');

const stats = fs.statSync(outputPath);
console.log('\n=== 构建完成 ===');
console.log('输出文件:', outputPath);
console.log('文件大小:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

const firstLine = html.substring(0, 50);
console.log('文件开头:', firstLine);

const scriptCount = (html.match(/<\/script>/g) || []).length;
console.log('最终</script>标签数量:', scriptCount);

console.log('\n测试方法:');
console.log('  1. 直接用浏览器打开HTML文件');
console.log('  2. 或运行: npx http-server -p 8080');
