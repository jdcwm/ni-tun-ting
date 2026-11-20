import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../hooks/useTheme';

interface MarkdownRendererProps {
  content: string;
  fontSize?: number;
  enableMarkdown?: boolean;
  enableLatex?: boolean;
  enableMermaid?: boolean;
  isUser?: boolean;
  customCSS?: string;
  messageId?: string;
  fontFamily?: string;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold' | '300' | '400' | '500' | '600' | '700';
}

// Markdown 渲染高度缓存：messageId -> height
const markdownHeightCache = new Map<string, number>();

// ========================
// Markdown 解析器（RN端运行，不依赖CDN）
// ========================

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * 在 RN 端解析 Markdown，生成 HTML 字符串
 * 支持：标题、加粗、斜体、删除线、列表、代码块、行内代码、引用、分隔线、链接、图片、表格
 * 支持 HTML 标签透传：<details>, <summary>, <b>, <strong>, <em>, <i>, <u>, <s>, <mark>, <sub>, <sup> 等
 * 支持 XML 风格标签透传：<世界观>, <角色设定> 等
 * 支持 <style> 块提取，提取的 CSS 会被注入到页面
 * 返回 { html, extractedCSS }
 */
const parseMarkdown = (text: string): { html: string; extractedCSS: string } => {
  if (!text) return { html: '', extractedCSS: '' };

  let extractedCSS = '';

  // 0. 提取 <style>...</style> 块
  text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, css) => {
    extractedCSS += css + '\n';
    return '';
  });

  // 1. 保护代码块 ```...```
  const codeBlocks: string[] = [];
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code);
    return `\x00CB${idx}\x00`;
  });

  // 2. 保护行内代码 `...`
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(code);
    return `\x00IC${idx}\x00`;
  });

  // 3. 保护已存在的 HTML / XML 标签（透传，不解析）
  // 匹配 <tag ...>...</tag> 或 <tag .../> 或 </tag>
  // 支持中文标签名如 <世界观>, <角色设定>
  const htmlTags: string[] = [];
  text = text.replace(/<(\/?[a-zA-Z\u4e00-\u9fa5][^>]*)>/g, (match) => {
    const idx = htmlTags.length;
    htmlTags.push(match);
    return `\x00HT${idx}\x00`;
  });

  // 4. 转义剩余的特殊字符（& < >）—— 但不转义 \x00 占位符
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 5. 标题（h1-h6）
  text = text.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  text = text.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 6. 分隔线
  text = text.replace(/^---+\s*$/gm, '<hr>');
  text = text.replace(/^\*\*\*+\s*$/gm, '<hr>');
  text = text.replace(/^___+\s*$/gm, '<hr>');

  // 7. 引用块
  text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // 合并连续的 blockquote
  text = text.replace(/(<\/blockquote>)\n(<blockquote>)/g, '<br>');

  // 8. 表格（简单支持）
  if (/^\|.+\|$/m.test(text)) {
    const lines = text.split('\n');
    const result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    const flushTable = () => {
      if (tableRows.length === 0) return;
      let html = '<table>';
      // 第一行是表头
      if (tableRows.length >= 1) {
        const headers = tableRows[0].split('|').filter((c) => c.trim() !== '');
        html += '<thead><tr>';
        headers.forEach((h) => { html += `<th>${h.trim()}</th>`; });
        html += '</tr></thead>';
      }
      // 第二行是分隔符（跳过）
      // 其余是数据行
      if (tableRows.length >= 2) {
        html += '<tbody>';
        for (let i = 1; i < tableRows.length; i++) {
          if (/^[\s|:-]+$/.test(tableRows[i])) continue;
          const cells = tableRows[i].split('|').filter((c) => c.trim() !== '');
          html += '<tr>';
          cells.forEach((c) => { html += `<td>${c.trim()}</td>`; });
          html += '</tr>';
        }
        html += '</tbody>';
      }
      html += '</table>';
      result.push(html);
      tableRows = [];
    };

    for (const line of lines) {
      if (/^\|.+\|$/.test(line.trim())) {
        inTable = true;
        tableRows.push(line.trim());
      } else {
        if (inTable) {
          flushTable();
          inTable = false;
        }
        result.push(line);
      }
    }
    if (inTable) flushTable();
    text = result.join('\n');
  }

  // 9. 列表处理
  const lines = text.split('\n');
  const outLines: string[] = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 无序列表项
    const ulMatch = line.match(/^(\s*)[*\-+] (.+)$/);
    // 有序列表项
    const olMatch = line.match(/^(\s*)\d+\. (.+)$/);

    if (ulMatch) {
      if (inOl) { outLines.push('</ol>'); inOl = false; }
      if (!inUl) { outLines.push('<ul>'); inUl = true; }
      outLines.push(`<li>${ulMatch[2]}</li>`);
    } else if (olMatch) {
      if (inUl) { outLines.push('</ul>'); inUl = false; }
      if (!inOl) { outLines.push('<ol>'); inOl = true; }
      outLines.push(`<li>${olMatch[2]}</li>`);
    } else {
      if (inUl) { outLines.push('</ul>'); inUl = false; }
      if (inOl) { outLines.push('</ol>'); inOl = false; }
      outLines.push(line);
    }
  }
  if (inUl) outLines.push('</ul>');
  if (inOl) outLines.push('</ol>');
  text = outLines.join('\n');

  // 10. 加粗+斜体 ***text***
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // 11. 加粗 **text** 或 __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // 12. 斜体 *text* 或 _text_
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  // 13. 删除线 ~~text~~
  text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  // 14. 图片 ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  // 15. 链接 [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // 16. 标记 ==text==
  text = text.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  // 17. 换行处理
  // 连续两个换行 = 段落分隔
  text = text.replace(/\n\n+/g, '\n\n');
  // 单个换行 = <br>（但在块级元素内不需要）
  text = text.replace(/\n/g, '<br>');
  // 修复块级元素前后的 <br>
  text = text.replace(/<br>(<(?:h[1-6]|ul|ol|li|blockquote|pre|hr|table|thead|tbody|tr|th|td)>)/g, '$1');
  text = text.replace(/(<\/(?:h[1-6]|ul|ol|li|blockquote|pre|hr|table|thead|tbody|tr|th|td)>)<br>/g, '$1');

  // 18. 段落包裹（将非块级元素的连续文本包裹在 <p> 中）
  // 简化处理：将连续的非标签文本包裹在 <p> 中
  // 这里不做复杂处理，保持简单

  // 19. 恢复 HTML 标签
  text = text.replace(/\x00HT(\d+)\x00/g, (_match, idx) => {
    return htmlTags[parseInt(idx)];
  });

  // 20. 恢复行内代码
  text = text.replace(/\x00IC(\d+)\x00/g, (_match, idx) => {
    return `<code>${escapeHtml(inlineCodes[parseInt(idx)])}</code>`;
  });

  // 21. 恢复代码块
  text = text.replace(/\x00CB(\d+)\x00/g, (_match, idx) => {
    return `<pre><code>${escapeHtml(codeBlocks[parseInt(idx)])}</code></pre>`;
  });

  return { html: text, extractedCSS };
};

/**
 * Markdown 解析结果缓存。
 * parseMarkdown 是纯函数（只依赖 text），但每次进对话、以及 FlatList 回收后再挂载
 * 都会重新解析一遍，长会话里这是最贵的一块开销。这里做一层进程内 LRU：
 * 同一段内容只解析一次。上限 300 条，超出后按插入顺序淘汰最早的（Map 保序）。
 */
const MARKDOWN_PARSE_CACHE_MAX = 300;
const markdownParseCache = new Map<string, { html: string; extractedCSS: string }>();

const parseMarkdownCached = (text: string): { html: string; extractedCSS: string } => {
  const hit = markdownParseCache.get(text);
  if (hit) {
    // 命中后删除再插回，维持 LRU 顺序
    markdownParseCache.delete(text);
    markdownParseCache.set(text, hit);
    return hit;
  }
  const value = parseMarkdown(text);
  markdownParseCache.set(text, value);
  if (markdownParseCache.size > MARKDOWN_PARSE_CACHE_MAX) {
    const oldest = markdownParseCache.keys().next();
    if (!oldest.done) markdownParseCache.delete(oldest.value);
  }
  return value;
};

/** 清理解析缓存（换主题/自定义 CSS 不需要，改内容才需要） */
export const clearMarkdownParseCache = () => markdownParseCache.clear();

// ========================
// HTML 构建
// ========================

const buildHtml = (
  parsedHtml: string,
  fontSize: number,
  enableLatex: boolean,
  enableMermaid: boolean,
  textColor: string,
  bgColor: string,
  isUser: boolean,
  extractedCSS: string = '',
  customCSS: string = '',
  fontFamily?: string,
  fontColor?: string,
  fontWeight?: string
): string => {
  const latexScripts = enableLatex ? `
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  ` : '';

  const mermaidScript = enableMermaid ? `
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  ` : '';

  const latexInit = enableLatex ? `
    if (typeof renderMathInElement !== 'undefined') {
      renderMathInElement(document.getElementById('content'), {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
        ],
        throwOnError: false,
      });
    }
  ` : '';

  const mermaidInit = enableMermaid ? `
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    }
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html {
    overflow: hidden;
    height: auto;
  }
  body {
    font-size: ${fontSize}px;
    color: ${fontColor || textColor};
    background-color: ${bgColor};
    font-family: ${fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'};
    font-weight: ${fontWeight || 'normal'};
    line-height: 1.8;
    word-wrap: break-word;
    overflow-wrap: break-word;
    -webkit-text-size-adjust: 100%;
    overflow: hidden;
    height: auto;
    touch-action: none;
    user-select: text;
    -webkit-user-select: text;
    -webkit-touch-callout: none;
    -webkit-user-drag: none;
  }
  #content {
    padding: 4px 0;
    width: 100%;
  }
  #content p {
    margin: 8px 0;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.8;
  }
  #content br { display: block; content: ""; }
  #content pre {
    background-color: rgba(0,0,0,0.35);
    padding: 14px 16px;
    border-radius: 10px;
    overflow-x: auto;
    margin: 14px 0;
    font-size: ${fontSize - 1}px;
    white-space: pre;
    border: 1px solid rgba(128,128,128,0.15);
    max-width: 100%;
  }
  #content code {
    background-color: rgba(0,0,0,0.3);
    padding: 3px 7px;
    border-radius: 6px;
    font-family: "SF Mono", Monaco, Menlo, Consolas, monospace;
    font-size: ${fontSize - 1}px;
    color: #e8e8e8;
  }
  #content pre code {
    background: none;
    padding: 0;
    border: none;
    color: inherit;
    font-size: inherit;
  }
  #content h1 {
    font-size: ${fontSize + 10}px;
    font-weight: 700;
    margin: 20px 0 10px;
    border-bottom: 2px solid rgba(128,128,128,0.3);
    padding-bottom: 6px;
    color: ${textColor};
  }
  #content h2 {
    font-size: ${fontSize + 8}px;
    font-weight: 700;
    margin: 18px 0 8px;
    border-bottom: 1px solid rgba(128,128,128,0.2);
    padding-bottom: 4px;
    color: ${textColor};
  }
  #content h3 {
    font-size: ${fontSize + 6}px;
    font-weight: 600;
    margin: 16px 0 8px;
    color: ${textColor};
  }
  #content h4 {
    font-size: ${fontSize + 4}px;
    font-weight: 600;
    margin: 14px 0 6px;
    color: ${textColor};
  }
  #content h5, #content h6 {
    font-size: ${fontSize + 2}px;
    font-weight: 600;
    margin: 12px 0 6px;
    color: ${textColor};
  }
  #content ul {
    margin: 10px 0;
    padding-left: 28px;
    list-style-type: disc;
  }
  #content ol {
    margin: 10px 0;
    padding-left: 28px;
    list-style-type: decimal;
  }
  #content li {
    margin: 5px 0;
    line-height: 1.7;
    word-break: break-word;
  }
  #content li > ul, #content li > ol {
    margin: 4px 0;
    padding-left: 24px;
  }
  #content blockquote {
    border-left: 4px solid ${textColor}80;
    padding: 10px 16px;
    margin: 14px 0;
    background-color: rgba(128,128,128,0.08);
    border-radius: 0 10px 10px 0;
    color: ${textColor}cc;
  }
  #content blockquote p { margin: 4px 0; }
  #content table {
    border-collapse: collapse;
    width: 100%;
    margin: 14px 0;
    font-size: ${fontSize - 1}px;
    overflow: hidden;
    border-radius: 8px;
  }
  #content th {
    border: 1px solid rgba(128,128,128,0.3);
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
    background-color: rgba(128,128,128,0.15);
    color: ${textColor};
  }
  #content td {
    border: 1px solid rgba(128,128,128,0.2);
    padding: 8px 12px;
    text-align: left;
    color: ${textColor};
  }
  #content tr:nth-child(even) td {
    background-color: rgba(128,128,128,0.05);
  }
  #content a {
    color: #4ecdc4;
    text-decoration: underline;
  }
  #content img {
    max-width: 100%;
    border-radius: 10px;
    display: block;
    margin: 10px 0;
    height: auto;
  }
  #content hr {
    border: none;
    border-top: 2px solid rgba(128,128,128,0.25);
    margin: 20px 0;
    height: 0;
  }
  #content strong, #content b {
    font-weight: 700;
    color: ${textColor};
  }
  #content em, #content i {
    font-style: italic;
  }
  #content u {
    text-decoration: underline;
  }
  #content s, #content del {
    text-decoration: line-through;
    opacity: 0.7;
  }
  #content mark {
    background-color: rgba(255,215,0,0.2);
    color: ${textColor};
    padding: 2px 4px;
    border-radius: 4px;
  }
  #content sup {
    font-size: 0.75em;
    vertical-align: super;
  }
  #content sub {
    font-size: 0.75em;
    vertical-align: sub;
  }
  /* details / summary 可折叠面板 */
  #content details {
    margin: 12px 0;
    padding: 0;
    background-color: rgba(0,0,0,0.15);
    border: 1px solid rgba(128,128,128,0.2);
    border-radius: 10px;
    overflow: hidden;
  }
  #content details[open] {
    background-color: rgba(0,0,0,0.2);
  }
  #content summary {
    padding: 12px 16px;
    font-weight: 600;
    font-size: ${fontSize}px;
    color: ${textColor};
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    list-style: none;
    display: flex;
    align-items: center;
  }
  #content summary::before {
    content: "\\25B6";
    font-size: 0.8em;
    margin-right: 8px;
    transition: transform 0.2s;
    display: inline-block;
  }
  #content details[open] > summary::before {
    transform: rotate(90deg);
  }
  #content summary::-webkit-details-marker {
    display: none;
  }
  #content details > *:not(summary) {
    padding: 0 16px 12px;
  }
  #content details > summary + * {
    padding-top: 8px;
  }
  /* mermaid */
  #content .mermaid {
    text-align: center;
    margin: 16px 0;
    background-color: rgba(0,0,0,0.2);
    padding: 16px;
    border-radius: 8px;
  }
  .katex { font-size: 1.1em; }
  .katex-display { overflow-x: auto; padding: 6px 0; margin: 12px 0; }
  /* 用户自定义 CSS（对话级内置 CSS） */
  ${customCSS}
  /* AI 输出中提取的 style 块内容 */
  ${extractedCSS}
</style>
${latexScripts}
${mermaidScript}
</head>
<body>
<div id="content">${parsedHtml}</div>
<script>
  // Web 环境兼容：如果没有 ReactNativeWebView，则通过 parent.postMessage 通信
  if (typeof window.ReactNativeWebView === 'undefined') {
    window.ReactNativeWebView = {
      postMessage: function(data) {
        try {
          window.parent.postMessage(data, '*');
        } catch(e) {}
      }
    };
  }

  // 阻止 body 和 html 的触摸滚动（但允许 details/summary 交互和 pre 的横向滚动）
  document.addEventListener('touchmove', function(e) {
    var target = e.target;
    // 允许 pre/code 内部的水平滚动
    while (target && target !== document.body) {
      if (target.tagName === 'PRE' || target.tagName === 'CODE' || target.tagName === 'DETAILS') {
        return;
      }
      target = target.parentElement;
    }
    e.preventDefault();
  }, { passive: false });

  // LaTeX 渲染
  ${latexInit}

  // Mermaid 渲染
  ${mermaidInit}

  // 高度计算 —— 多次检测确保准确，取实际内容高度
  function reportHeight() {
    var contentEl = document.getElementById('content');
    var h = contentEl ? contentEl.scrollHeight : document.body.scrollHeight;
    // 加上少量 padding 避免底部截断
    h = h + 8;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: h }));
  }

  // DOMContentLoaded 时立即检测一次
  if (document.readyState !== 'loading') {
    reportHeight();
  } else {
    document.addEventListener('DOMContentLoaded', reportHeight);
  }

  // load 时再检测
  window.addEventListener('load', function() {
    reportHeight();
    setTimeout(reportHeight, 50);
    setTimeout(reportHeight, 150);
    setTimeout(reportHeight, 300);
  });

  // 使用 ResizeObserver 监听内容变化（如果可用）
  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function() {
      reportHeight();
    });
    ro.observe(document.getElementById('content'));
  }

  // 监听 details 的展开/收起
  document.querySelectorAll('details').forEach(function(d) {
    d.addEventListener('toggle', function() {
      setTimeout(reportHeight, 50);
    });
  });
</script>
</body>
</html>`;
};

// ========================
// 组件
// ========================

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  fontSize = 15,
  enableMarkdown = true,
  enableLatex = true,
  enableMermaid = true,
  isUser = false,
  customCSS = '',
  messageId = '',
  fontFamily,
  fontColor,
  fontWeight,
}) => {
  const theme = useTheme();
  const webViewRef = useRef<WebView>(null);

  // 初始高度：优先从缓存获取，其次根据内容估算
  // 缓存键带上内容长度与字号：切换消息版本、改字号时高度会变，只用 messageId 会串味
  const heightKey = messageId ? `${messageId}:${content.length}:${fontSize}` : '';
  const getInitialHeight = () => {
    if (heightKey && markdownHeightCache.has(heightKey)) {
      return markdownHeightCache.get(heightKey)!;
    }
    const lineCount = content.split('\n').length;
    return Math.max(40, lineCount * 24 + 20);
  };

  const [contentHeight, setContentHeight] = React.useState(getInitialHeight);

  const textColor = isUser ? theme.buttonTextColor : theme.textColor;
  const bgColor = isUser ? theme.accentColor : theme.secondaryColor;

  const parsed = useMemo(() => {
    if (!content) return { html: '', extractedCSS: '' };
    if (enableMarkdown) {
      return parseMarkdownCached(content);
    }
    return { html: escapeHtml(content).replace(/\n/g, '<br>'), extractedCSS: '' };
  }, [content, enableMarkdown]);

  const html = useMemo(() => {
    return buildHtml(parsed.html, fontSize, enableLatex, enableMermaid, textColor, bgColor, isUser, parsed.extractedCSS, customCSS, fontFamily, fontColor, fontWeight);
  }, [parsed.html, parsed.extractedCSS, fontSize, enableLatex, enableMermaid, textColor, bgColor, isUser, customCSS, fontFamily, fontColor, fontWeight]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'height' && data.height > 0) {
        const newHeight = data.height + 4;
        setContentHeight(prev => {
          const h = Math.max(prev, newHeight);
          // 缓存高度
          if (messageId) {
            markdownHeightCache.set(messageId, h);
          }
          return h;
        });
      }
    } catch (e) {
      // ignore
    }
  };

  // 当 content 变化时重置高度，优先从缓存获取，其次根据内容长度估算
  useEffect(() => {
    if (messageId && markdownHeightCache.has(messageId)) {
      setContentHeight(markdownHeightCache.get(messageId)!);
      return;
    }
    const lineCount = content.split('\n').length;
    const estimatedHeight = lineCount * 24 + 20;
    setContentHeight(Math.max(40, estimatedHeight));
  }, [content, messageId]);

  if (Platform.OS === 'web') {
    const webStyle: React.CSSProperties = {
      fontSize: `${fontSize}px`,
      color: textColor,
      backgroundColor: bgColor,
      lineHeight: 1.8,
      wordWrap: 'break-word',
      overflowWrap: 'break-word',
      padding: '4px 0',
      width: '100%',
    };

    return (
      <View style={styles.container}>
        <div
          style={webStyle}
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: parsed.html + '<style>' + parsed.extractedCSS + '</style>' }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={[styles.webview, { height: contentHeight, backgroundColor: bgColor }]}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        overScrollMode="never"
        bounces={false}
        textZoom={100}
        allowFileAccess={false}
        mixedContentMode="compatibility"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minWidth: 0,
  },
  webview: {
    minWidth: 0,
  },
  globalCssContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  globalCssWebview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

interface GlobalCSSRendererProps {
  css: string;
}

export const GlobalCSSRenderer: React.FC<GlobalCSSRendererProps> = ({ css }) => {
  if (!css || !css.trim()) return null;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    overflow: hidden;
    pointer-events: none;
  }
  ${css}
</style>
</head>
<body>
</body>
</html>`;

  return (
    <View style={styles.globalCssContainer} pointerEvents="none">
      <WebView
        source={{ html }}
        style={styles.globalCssWebview}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        javaScriptEnabled
        originWhitelist={['*']}
        overScrollMode="never"
        bounces={false}
        allowFileAccess={false}
        mixedContentMode="compatibility"
      />
    </View>
  );
};
