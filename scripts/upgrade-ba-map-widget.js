// 重写地点悬浮窗：作为「一块专属 WebView」的内容（不再自己 fixed 定位），
// 拖动时把位移上报给 RN，由 RN 移动这块区域；列表内部滚动；点地点插入输入栏。
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'src', 'data', 'blueArchive.ts');

let src = fs.readFileSync(F, 'utf8');
const START = 'const buildLocationWidget = (): string => {';
const i = src.indexOf(START);
if (i < 0) {
  console.error('找不到 buildLocationWidget');
  process.exit(1);
}
// 结束标志：紧随其后的 export const BLUE_ARCHIVE_CSS_SIDEBAR
const MARK = 'export const BLUE_ARCHIVE_CSS_SIDEBAR = buildLocationWidget();';
const j = src.indexOf(MARK, i);
if (j < 0) {
  console.error('找不到结束标记');
  process.exit(1);
}

const NEW = `/**
 * 碧蓝档案「地点悬浮窗」——用**内置 CSS 条目**承载的交互式悬浮窗。
 *
 * 这份内容会被放进**一块专属的小 WebView**（由 CSSEntry.widget 声明宽高），所以：
 *  · 拖动：按住标题栏 → 把位移上报给 RN（Aurora.moveWidget），由 RN 移动这块区域
 *  · 滚动：地点列表内部可上下滚动
 *  · 点击地点：Aurora.insertToChatInput(name) 把地点名插进 App 的聊天输入框
 *  · 「−」折叠 / 展开列表
 *
 * 之所以不做成纯 CSS 的 body::after：伪元素没法拖动、没法可靠滚动，
 * 更不能把文字塞进输入框；而全屏覆盖层又会挡住整个聊天列表。
 */
const buildLocationWidget = (): string => {
  const academies = KIVOTOS_LOCATIONS.filter((l) => l.kind === '学园');
  const world = KIVOTOS_LOCATIONS.filter((l) => l.kind !== '学园');
  const row = (name: string) =>
    \`<div class="loc" data-name="\${name.replace(/"/g, '&quot;')}">\${name}</div>\`;
  const group = (title: string, list: typeof KIVOTOS_LOCATIONS) =>
    list.length ? \`<div class="grp">\${title}</div>\` + list.map((l) => row(l.name)).join('') : '';

  return \`<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden;height:100%}
#kivotos-map{position:relative;width:100%;height:100%;display:flex;flex-direction:column;
  background:linear-gradient(160deg,rgba(30,42,74,.96),rgba(16,22,38,.96));border:1px solid rgba(150,190,255,.45);
  border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);color:#cfe0ff;
  font:11px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden}
#kivotos-map .hd{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 8px;
  background:rgba(90,130,220,.3);cursor:move;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
#kivotos-map .hd .ttl{font-weight:600;letter-spacing:.5px;pointer-events:none}
#kivotos-map .hd .mini{width:20px;height:20px;line-height:18px;text-align:center;border-radius:6px;
  border:1px solid rgba(150,190,255,.5);cursor:pointer;flex:0 0 auto;background:rgba(255,255,255,.06)}
#kivotos-map .bd{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;
  padding:4px 6px 8px;touch-action:pan-y}
#kivotos-map .grp{margin:6px 0 2px;font-size:10px;color:#8fb4ff;letter-spacing:1px}
#kivotos-map .loc{padding:6px;border-radius:6px;cursor:pointer;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;-webkit-tap-highlight-color:transparent}
#kivotos-map .loc:active{background:rgba(120,160,255,.32)}
#kivotos-map .tip{padding:4px 6px 2px;font-size:9px;color:#7f93bb}
</style>
<div id="kivotos-map">
  <div class="hd" id="km-hd"><span class="ttl">◇ 基沃托斯地点</span><span class="mini" id="km-min">−</span></div>
  <div class="bd" id="km-bd">
    <div class="tip">点一下地点 → 插入输入栏</div>
    \${group('【学园】', academies)}
    \${group('【世界观】', world)}
  </div>
</div>
<script>
(function () {
  var el = document.getElementById('kivotos-map');
  var hd = document.getElementById('km-hd');
  var bd = document.getElementById('km-bd');
  var mini = document.getElementById('km-min');
  if (!el || !hd || !bd) return;

  /* ---- 拖动：把位移交给 RN，由 RN 移动承载本窗口的那块 View ---- */
  var dragging = false, lastX = 0, lastY = 0;
  function point(e) { return e.touches && e.touches[0] ? e.touches[0] : e; }
  function onDown(e) {
    var t = point(e);
    lastX = t.clientX; lastY = t.clientY; dragging = true;
    if (e.cancelable) e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    var t = point(e);
    var dx = t.clientX - lastX, dy = t.clientY - lastY;
    lastX = t.clientX; lastY = t.clientY;
    try { if (window.Aurora && Aurora.moveWidget) Aurora.moveWidget(dx, dy); } catch (err) {}
    if (e.cancelable) e.preventDefault();
  }
  function onUp() { dragging = false; }
  hd.addEventListener('touchstart', onDown, { passive: false });
  hd.addEventListener('touchmove', onMove, { passive: false });
  hd.addEventListener('touchend', onUp);
  hd.addEventListener('touchcancel', onUp);
  hd.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  /* ---- 折叠 / 展开 ---- */
  if (mini) {
    mini.addEventListener('click', function (e) {
      e.stopPropagation();
      var hidden = bd.style.display === 'none';
      bd.style.display = hidden ? 'block' : 'none';
      mini.textContent = hidden ? '−' : '+';
    });
  }

  /* ---- 点地点 → 插入 App 的聊天输入框 ---- */
  bd.addEventListener('click', function (e) {
    var node = e.target;
    while (node && node !== bd && String(node.className || '').indexOf('loc') < 0) node = node.parentNode;
    if (!node || node === bd) return;
    var name = node.getAttribute('data-name') || (node.textContent || '').trim();
    if (!name) return;
    try {
      // insertToChatInput → App 自己的聊天输入框（悬浮窗专用）
      if (window.Aurora && Aurora.insertToChatInput) Aurora.insertToChatInput(name);
      else if (window.Aurora && Aurora.appendToInput) Aurora.appendToInput(name);
      if (window.Aurora && Aurora.toast) Aurora.toast('已插入：' + name);
    } catch (err) { /* 忽略 */ }
  });
})();
</script>\`;
};

`;

src = src.slice(0, i) + NEW + src.slice(j);
fs.writeFileSync(F, src, 'utf8');
console.log('地点悬浮窗已改为「专属小块 WebView」版');
