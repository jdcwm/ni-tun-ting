// 用 JS 平移代替 WebView 原生滚动（小 WebView 里原生纵向滚动收不到手势）
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'src', 'data', 'blueArchive.ts');

let src = fs.readFileSync(F, 'utf8');

// 1) 给 .bd 里的内容套一层 #km-list（可平移），.bd 自身隐藏溢出
src = src.replace(
  `#kivotos-map .bd{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:4px 6px 8px;touch-action:pan-y}`,
  `#kivotos-map .bd{flex:1 1 auto;min-height:0;overflow:hidden;position:relative;touch-action:none}
#kivotos-map #km-list{will-change:transform}`,
);

// 2) body 里包一层
src = src.replace(
  `  <div class="bd" id="km-bd">
    <div class="tip">点一下地点 → 插入输入栏</div>`,
  `  <div class="bd" id="km-bd">
   <div id="km-list">
    <div class="tip">点一下地点 → 插入输入栏</div>`,
);
src = src.replace(
  `    \${group('【世界观】', world)}
  </div>
</div>`,
  `    \${group('【世界观】', world)}
   </div>
  </div>
</div>`,
);

// 3) 用 JS 平移代替原生滚动；并区分「点」与「滑」
src = src.replace(
  `  /* ---- 点地点 → 插入 App 的聊天输入框 ---- */
  bd.addEventListener('click', function (e) {
    var node = e.target;
    while (node && node !== bd && String(node.className || '').indexOf('loc') < 0) node = node.parentNode;
    if (!node || node === bd) return;
    var name = node.getAttribute('data-name') || (node.textContent || '').trim();
    if (!name) return;
    try {`,
  `  /* ---- 列表滚动：小 WebView 里原生纵向滚动收不到手势，改成 JS 平移 ---- */
  var list = document.getElementById('km-list');
  var offset = 0, scrolling = false, scrollStartY = 0, scrollStartOffset = 0, scrollMoved = 0;
  function maxOffset() {
    if (!list) return 0;
    return Math.min(0, bd.clientHeight - list.scrollHeight);
  }
  function applyOffset(v) {
    offset = Math.max(maxOffset(), Math.min(0, v));
    if (list) list.style.transform = 'translateY(' + offset + 'px)';
  }
  function sPoint(e) { return e.touches && e.touches[0] ? e.touches[0] : e; }
  bd.addEventListener('touchstart', function (e) {
    var t = sPoint(e);
    scrolling = true; scrollMoved = 0; scrollStartY = t.clientY; scrollStartOffset = offset;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  bd.addEventListener('touchmove', function (e) {
    if (!scrolling) return;
    var t = sPoint(e);
    var dy = t.clientY - scrollStartY;
    if (Math.abs(dy) > scrollMoved) scrollMoved = Math.abs(dy);
    applyOffset(scrollStartOffset + dy);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  function endScroll() { scrolling = false; }
  bd.addEventListener('touchend', endScroll);
  bd.addEventListener('touchcancel', endScroll);
  // 桌面/调试：鼠标滚轮
  bd.addEventListener('wheel', function (e) {
    applyOffset(offset - (e.deltaY || 0));
    e.preventDefault();
  }, { passive: false });

  /* ---- 点地点 → 插入 App 的聊天输入框（滑动手势不算点击） ---- */
  bd.addEventListener('click', function (e) {
    if (scrollMoved > 8) return;
    var node = e.target;
    while (node && node !== bd && String(node.className || '').indexOf('loc') < 0) node = node.parentNode;
    if (!node || node === bd) return;
    var name = node.getAttribute('data-name') || (node.textContent || '').trim();
    if (!name) return;
    try {`,
);

fs.writeFileSync(F, src, 'utf8');
console.log('已改为 JS 平移滚动');
