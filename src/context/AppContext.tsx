import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { AppSettings, Chat, AIProvider, WorldBook, ThemeConfig, Character, ChatMessage, FancyWork, Preset, UserProfile } from '../types';
import { storage } from '../utils/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultAppSettings, defaultChatSettings, defaultTheme, darkTheme, defaultConversationSettings, defaultChatDisplaySettings, defaultChatFeatureSettings, defaultContextManagementSettings, generateId, defaultUserProfile } from '../constants/defaults';
import { gensokyoCharacter, gensokyoWorldBook } from '../data/gensokyoData';
import { xpExtensionWorldBook } from '../data/xpExtensionData';
import { blueArchivePresetCharacters, buildDefaultBlueArchiveGroupChat } from '../data/blueArchiveData';
import { BLUE_ARCHIVE_CSS_SIDEBAR } from '../data/blueArchive';
import { buildDefaultProvider } from '../data/defaultProvider';
import { emojiPackService } from '../services/emojiPackService';
import { presetService } from '../services/presetService';
import { mergeChatSettings } from '../utils/chatSettingsMerge';
import { macroService } from '../services/macroService';
import { backupService } from '../services/backupService';
import { authApi } from '../services/authApi';
import { mediaLibraryService } from '../services/mediaLibraryService';
import { setCustomIconRegistry } from '../components/Icons';

// ========== 自定义按钮图标同步：每次 settings 变化，把 customButtonIcons 注入 Icons 组件 ==========
const applyCustomIcons = (s: AppSettings) => {
  try {
    setCustomIconRegistry(s.customButtonIcons || {});
  } catch (e) {
    // ignore
  }
};
// 启动时先初始化一次默认空图，避免首次渲染闪烁
applyCustomIcons(defaultAppSettings);

// ==================== Task 2: 说明书注入 ====================
const PRESET_MANUAL_TEXT = `# 鲵吞亭 AI 对话应用 使用说明书 v3.3

## 目录
1. [应用简介](#应用简介)
2. [快速开始](#快速开始)
3. [界面介绍](#界面介绍)
4. [对话系统](#对话系统)
5. [模板引擎与宏变量](#模板引擎与宏变量)
6. [AI 模型配置](#ai-模型配置)
7. [角色卡管理](#角色卡管理)
8. [世界书系统](#世界书系统)
9. [主题与外观](#主题与外观)
10. [高级功能](#高级功能)
11. [常见问题](#常见问题)

---

## 应用简介

**鲵吞亭** 是一款功能强大的 AI 角色扮演对话应用，支持多种 AI 模型、多模板引擎宏变量、子对话分支、世界书系统、自动总结、网络搜索等高级功能。

### 主要特性
- 支持 **Handlebars / EJS / Nunjucks** 三种模板引擎，自动识别语法
- 子对话分支模式，点击标题一键返回母对话
- 角色卡系统：支持 TavernAI / SillyTavern 格式 PNG 导入
- 世界书系统：基于关键词触发的动态世界观注入
- 多模型支持：OpenAI、Gemini、Claude、DeepSeek 等
- 网络搜索：集成多种搜索服务
- 自动总结：自动压缩长对话历史
- 高度自定义：主题、配色、按钮样式、字体均可调整

---

## 快速开始

### 首次使用
1. 安装 APK 并打开应用
2. 添加 AI 密钥：设置 → AI 模型设置 → 添加 API 配置
3. 选择模型：主界面顶部点击模型选择按钮
4. 选择角色卡或新建对话，开始使用

---

## 对话系统

### 母对话与子对话
- **母对话（主对话）**：最初创建的对话，可以派生子对话
- **子对话**：从母对话分支出来的独立对话，用于探索不同剧情方向

### 子对话返回功能
在子对话界面，点击顶部标题栏即可快速返回母对话：
- 标题显示当前子对话标题
- 下方副标题显示「← 返回：母对话标题」
- 点击整个标题区域即可跳转到母对话

### 对话操作
- 长按消息可复制、删除、收藏、重新生成
- 支持导出对话为 JSON / Markdown / TXT / HTML 格式
- 支持子对话合并、归档

---

## 模板引擎与宏变量

鲵吞亭支持三种主流模板引擎，可在宏变量和系统提示中使用。

### 支持的引擎

| 引擎 | 特点 | 语法示例 |
|------|------|----------|
| **Handlebars** | 无逻辑模板，与 SillyTavern 兼容 | \`{{char}} 说：你好 {{user}}\` |
| **EJS** | 支持完整 JavaScript 逻辑 | \`<%= char %> 说：状态良好\` |
| **Nunjucks** | 语法类似 Jinja2 | \`{{ char }} 说：你好 {{ user }}\` |

### 引擎自动检测
应用会根据模板内容自动识别使用的引擎：
- 包含 \`<% %>\` 语法 → EJS
- 包含 \`{% %}\` 语法 → Nunjucks
- 其他情况默认 → Handlebars

### 内置宏变量

| 变量 | 说明 | 示例 |
|------|------|------|
| \`{{char}}\` | 角色名称 | \`{{char}} 说：你好\` |
| \`{{user}}\` | 用户名称 | \`你好，{{user}}\` |
| \`{{char_persona}}\` | 角色人设 | 【角色设定】\\n\`{{char_persona}}\` |
| \`{{history}}\` | 最近对话历史 | 【历史】\\n\`{{history}}\` |
| \`{{message_count}}\` | 消息总数 | 已对话 \`{{message_count}}\` 条 |
| \`{{time}}\` | 当前时间 | 当前时间：\`{{time}}\` |
| \`{{date}}\` | 当前日期 | 今天是 \`{{date}}\` |
| \`{{random}}\` | 随机数 | 随机值：\`{{random}}\` |

### Handlebars 辅助函数

**条件判断**
- \`{{#if condition}}...{{/if}}\` — 条件分支
- \`{{#if_eq a b}}...{{/if_eq}}\` — 等于判断
- \`{{#if_neq a b}}...{{/if_neq}}\` — 不等于判断
- \`{{#if_gt a b}}...{{/if_gt}}\` — 大于判断
- \`{{#if_lt a b}}...{{/if_lt}}\` — 小于判断
- \`{{#unless condition}}...{{/unless}}\` — 否定条件

**循环**
- \`{{#each items}}...{{/each}}\` — 遍历数组
- \`{{times n}}...{{/times}}\` — 重复 n 次

**随机**
- \`{{pick a b c}}\` — 随机选择一个值
- \`{{roll min max}}\` — 生成随机整数
- \`{{rand max}}\` — 生成 0 到 max 的随机数
- \`{{chance probability}}...{{/chance}}\` — 按概率触发

**数学运算**
- \`{{add a b}}\` — 加法
- \`{{sub a b}}\` — 减法
- \`{{mul a b}}\` — 乘法
- \`{{div a b}}\` — 除法
- \`{{mod a b}}\` — 取模

**字符串操作**
- \`{{uppercase str}}\` — 转大写
- \`{{lowercase str}}\` — 转小写
- \`{{trim str}}\` — 去空格
- \`{{length str}}\` — 获取长度
- \`{{substring str start end}}\` — 截取子串

**变量存储**
- \`{{setvar name value}}\` — 设置会话变量
- \`{{getvar name}}\` — 获取变量值
- \`{{setchatvar name value}}\` — 设置对话变量
- \`{{setglobalvar name value}}\` — 设置全局变量

**日期时间**
- \`{{now format}}\` — 当前时间（date/time/full）
- \`{{format_date date format}}\` — 格式化日期

**其他**
- \`{{default val fallback}}\` — 默认值
- \`{{first arr}}\` — 数组第一个元素
- \`{{last arr}}\` — 数组最后一个元素
- \`{{join arr sep}}\` — 数组连接

### EJS 内置函数
在 EJS 模板中可使用：
\`\`\`
<%= uppercase(str) %>       // 转大写
<%= lowercase(str) %>       // 转小写
<%= add(a, b) %>            // 加法
<%= sub(a, b) %>            // 减法
<%= mul(a, b) %>            // 乘法
<%= div(a, b) %>            // 除法
<%= pick('a', 'b', 'c') %>  // 随机选择
<%= roll(1, 100) %>         // 随机整数
<%= now('time') %>          // 当前时间
<%= getVariable('session', 'name') %> // 获取变量
<% setVariable('session', 'name', value) %> // 设置变量
\`\`\`

### Nunjucks 过滤器
在 Nunjucks 模板中可使用过滤器管道：
\`\`\`
{{ char | uppercase }}      // 转大写
{{ char | lowercase }}      // 转小写
{{ arr | length }}          // 数组长度
{{ arr | first }}           // 第一个元素
{{ arr | last }}            // 最后一个元素
{{ arr | join(', ') }}      // 数组连接
{{ val | default('默认值') }} // 默认值
\`\`\`

### 变量作用域
- **global**：全局变量，所有对话共享
- **chat**：对话变量，仅当前对话可见
- **session**：会话变量，当前会话可见
- **message**：消息级变量

---

## AI 模型配置

### 添加 AI 提供商
1. 打开设置 → AI 模型设置
2. 点击「+」添加提供商
3. 选择提供商类型：
   - OpenAI (GPT 系列)
   - Anthropic (Claude 系列)
   - Gemini
   - DeepSeek
   - Ollama (本地)
   - Azure
   - 自定义
4. 填写 API Key 和基础 URL
5. 选择默认模型
6. 保存配置

### 模型能力
- **text**：文本对话
- **image**：图像生成
- **vision**：视觉理解
- **summary**：文本总结

---

## 角色卡管理

### 导入角色卡
支持多种格式：
- **PNG 卡片**：含 tEXt chunk 的 TavernAI v2 / v1 格式
- **JSON 文件**：SillyTavern 导出格式
- **手动创建**：填写角色信息

### 角色卡字段
- 角色名称、描述、人设、问候语
- 标签、头像、创建者备注
- 世界观关联

---

## 世界书系统

### 功能说明
世界书（World Book）是基于关键词触发的动态世界观注入系统。当用户消息或 AI 回复中包含关键词时，自动注入相关背景设定。

### 配置步骤
1. 创建新世界书
2. 添加条目（关键词 + 内容）
3. 设置触发选项：
   - 触发时机：用户消息 / AI 回复 / 两者
   - 匹配模式：任意关键词 / 全部关键词
   - 注入位置：系统提示前 / 后 / 角色人设前 / 后
   - 扫描深度、概率、递归选项

---

## 主题与外观

### 主题设置
在左侧菜单 → 显示与聊天气泡中可自定义：
- 主色调、背景色、文字颜色
- 按钮样式：圆角 / 方形 / 胶囊 / 描边 / 阴影 / 渐变 / 图标 / 文字
- 输入框样式：边框圆角、宽度、颜色、样式
- 字体大小、字体族
- 用户头像、AI 头像
- 背景图片

### 昼夜模式
- 日间模式：粉色主色调 \`#fff5f6\`
- 夜间模式：深色主题 \`#0d0d1a\`
- 切换后下次打开应用自动保持所选模式

### 聊天气泡皮肤系统（v3.3.0 新增）

基于 9-patch 切片拉伸原理实现的配置驱动气泡皮肤系统，所有视觉属性通过配置对象本地绘制，无需传输图片资源。

**核心原理：**
- **九宫格切片拉伸**：将气泡分成四角固定、四边单向拉伸、中心双向拉伸的区域，确保圆角等细节在任何尺寸下不变形
- **字体参数化**：仅传递字体名称、大小、颜色、粗细等参数，本地渲染。无对应字体时自动回退系统默认
- **头像框本地绘制**：通过 borderRadius 和 borderWidth 在本地绘制圆形/圆角矩形/方形边框，裁剪头像

**预设皮肤：**

| 皮肤 | 说明 | 特点 |
|------|------|------|
| **默认** | 简洁纯色气泡 | 沉浸阅读，使用主题色 |
| **清新绿** | 绿色系气泡 | 白底AI气泡+绿色用户气泡，带头像框 |
| **透明** | 完全透明背景 | 极简风格，仅边框 |

**皮肤配置可自定义属性：**
- 背景色、内边距（上下左右）
- 四角圆角（独立设置）
- 边框宽度、颜色
- 阴影（偏移、透明度、半径、颜色）
- 字体（字体族、大小、颜色、粗细、行高、字间距）
- 头像框（形状、边框、阴影）

**切换方法：** 左侧菜单 → 聊天气泡皮肤 → 选择皮肤

---

## 高级功能

### 自动总结
- 当对话超过设定阈值时自动总结历史
- 可配置总结使用的模型和提示词
- 支持重新总结、压缩

### 网络搜索
- 支持 Tavily、SerpAPI、Google 搜索 API
- 搜索结果自动注入上下文
- 可配置最大结果数

### 状态条
- 在角色卡中配置状态变量（生命值、魔力等）
- 支持数字、字符串、进度条三种类型
- 顶部/底部显示位置可选

### 花式作品
- 支持 AIJS 脚本和 HTML/CSS/JS 自定义作品
- 可创建侧边栏、问候页、浮动提示等

### 回收站
- 左侧菜单进入回收站
- 可恢复或永久删除对话

---

## 常见问题

### Q: 如何切换到子对话模式？
A: 在对话设置中选择「派生子对话」，或在消息长按菜单中选择「从此处分支」。

### Q: 模板引擎怎么选？
A: 一般推荐 Handlebars（兼容 SillyTavern）。需要复杂逻辑用 EJS，喜欢 Jinja 语法用 Nunjucks。应用会自动识别。

### Q: 角色卡导入失败怎么办？
A: 确认 PNG 文件是否为 TavernAI v2 格式，或尝试使用 JSON 格式导入。

### Q: 如何备份数据？
A: 设置 → 数据管理 → 导出所有数据，可保存为 JSON 格式。

### Q: 应用支持哪些语言？
A: 应用界面支持中文（简体），角色卡内容支持任意语言。

---

## 版本历史

### v3.3.0
- 新增：9-patch 聊天气泡皮肤系统（配置驱动，切片拉伸原理）
- 新增：聊天气泡皮肤选择器（默认/清新绿/透明）
- 新增：字体参数化配置（字体名/大小/颜色/粗细可配置，本地渲染）
- 新增：头像框本地UI绘制（圆形/圆角矩形/方形边框）
- 新增：子对话点击标题返回母对话功能
- 新增：集成 Handlebars、EJS、Nunjucks 三种模板引擎
- 新增：多引擎自动检测和切换
- 新增：丰富的宏变量辅助函数（条件、循环、数学、字符串等）
- 新增：切换回复版本导航按钮（左右箭头样式）
- 新增：使用时长和首字时间显示
- 新增：昼夜模式持久化（下次打开自动恢复）
- 优化：左侧菜单整合显示设置与聊天气泡设置
- 优化：设置界面布局精简
- 修复：TypeScript 类型错误
- 修复：向后兼容旧版气泡样式值（classic/qq 自动映射到 default）

### v3.2.0
- 替换所有 emoji 为自定义 React Native 图标组件
- 重构左侧菜单为标签切换布局
- 主题设置改为全屏独立界面
- 夜间模式支持

### v3.0.0
- 全新 UI 设计
- 多模型支持
- 世界书系统
- 自动总结功能

### v2.5.0
- 新增：上下文压缩与对话记忆机制
- 新增：导出 JSON / TXT 对话
- 新增：对话收藏与置顶
- 新增：多角色对话（分组）

### v2.0.0
- 新增：角色卡管理与导入导出
- 新增：参数配置面板（温度 / 上下文长度）
- 新增：主模式切换（聊天 / 续写 / 图片生成）
- 新增：模板系统

### v1.5.0
- 新增：使用说明内置对话
- 新增：对话筛选与搜索
- 优化：AI 回复流式渲染体验

### v1.0.0
- 首个版本
- 单模型基础对话
- 简单历史记录
`;

interface AppContextType {
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  updateTheme: (theme: Partial<ThemeConfig>) => void;
  toggleTheme: () => void;
  setPlayingAs: (characterId: string | undefined) => Promise<void>;
  isDarkMode: boolean;
  setDarkMode: (dark: boolean) => Promise<void>;
  recycleBin: { id: string; type: 'chat' | 'message'; data: any; deletedAt: number }[];
  addToRecycleBin: (item: { id: string; type: 'chat' | 'message'; data: any }) => void;
  restoreFromRecycleBin: (id: string) => void;
  clearRecycleBin: () => void;
  deleteFromRecycleBin: (id: string) => void;
  userProfile: UserProfile | null;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  currentConfig: {
    contextLength?: number;
    maxMemoryMessages?: number;
    temperature?: number;
  } | null;
  setCurrentConfig: (config: any) => void;
  messageDensity: number;
  accentColor: string;
  chats: Chat[];
  setChats: (chats: Chat[] | ((prev: Chat[]) => Chat[])) => void;
  providers: AIProvider[];
  setProviders: (providers: AIProvider[]) => void;
  worldBooks: WorldBook[];
  setWorldBooks: (worldBooks: WorldBook[]) => void;
  characters: Character[];
  setCharacters: (characters: Character[]) => Promise<void>;
  addCharacter: (character: Character) => Promise<void>;
  presetCharacters: Character[];
  createChatFromPreset: (characterId: string) => Chat | null;
  createChatFromCharacter: (character: Character) => Chat;
  fancyWorks: FancyWork[];
  setFancyWorks: (works: FancyWork[]) => void;
  presets: Preset[];
  setPresets: (presets: Preset[]) => void;
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
  isLoading: boolean;
  toggleChatPin: (chatId: string) => void;
  toggleChatFavorite: (chatId: string) => void;
  toggleMessageFavorite: (chatId: string, messageId: string) => void;
  getFavoriteMessages: () => { chatId: string; chatTitle: string; message: ChatMessage }[];
  buildSnapshot: () => any;
  exportAllData: () => string;
  /** 带素材库的导出（图片/GIF/视频内嵌 base64） */
  exportAllDataWithMedia: () => Promise<string>;
  importAllData: (data: string) => Promise<boolean>;
  getChatsBackups: () => Promise<{ timestamp: number; chatCount: number }[]>;
  getFullBackups: () => Promise<{ timestamp: number; chatCount: number }[]>;
  restoreChatsFromBackup: (timestamp: number) => Promise<boolean>;
  restoreFullFromBackup: (timestamp: number) => Promise<boolean>;
  createManualBackup: () => Promise<boolean>;
  // ===== Task 2: 说明书辅助 =====
  isManualChat: (chatId: string) => boolean;
  // ===== Task 10: 登录功能 =====
  isLoggedIn: boolean;
  currentUser: { username: string; nickname: string; isGuest: boolean; isAdmin: boolean; uid?: number; bio?: string; avatar?: string; points?: number; token?: string; serverUrl?: string } | null;
  login: (username: string, password: string) => Promise<{ username: string; nickname: string; uid?: number; bio?: string; avatar?: string; points?: number }>;
  register: (username: string, password: string, nickname?: string) => Promise<{ username: string; nickname: string; uid?: number; bio?: string; avatar?: string; points?: number }>;
  guestLogin: () => Promise<{ username: string; nickname: string }>;
  logout: () => Promise<void>;
  updateCurrentUser: (data: { nickname?: string; bio?: string; avatar?: string; points?: number }) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const presetCharacters: Character[] = [
  gensokyoCharacter,
  ...blueArchivePresetCharacters,
];

const presetWorldBooks: WorldBook[] = [
  gensokyoWorldBook,
];

// Task 2: 使用新版 PRESET_MANUAL_TEXT 创建 manual chat
const createManualChat = (): Chat => {
  const timestamp = Date.now();
  const genId = generateId();
  return {
    id: 'manual_v3_3_' + timestamp,
    title: '使用说明书',
    conversationType: 'manual',
    isPinned: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [
      { id: genId, role: 'assistant', content: PRESET_MANUAL_TEXT, images: [], timestamp },
    ],
    worldBookIds: [],
    settings: { ...defaultChatSettings },
  };
};

// Task 2: chats 排序函数：manual 永远最前 → 置顶 → 更新时间
const sortChats = (chatsArr: Chat[]): Chat[] => {
  return [...chatsArr].sort((a, b) => {
    // manual 类型永远排最前
    if (a.conversationType === 'manual' && b.conversationType !== 'manual') return -1;
    if (a.conversationType !== 'manual' && b.conversationType === 'manual') return 1;
    // 置顶优先
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    // 按更新时间倒序
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
};

const createPresetChatFromCharacter = (character: Character): Chat => {
  const now = Date.now();
  const macroContext = macroService.buildContext({
    character,
    userName: '用户',
    messages: [],
    chatTitle: character.name,
    systemPrompt: character.systemPrompt,
  });
  const renderedGreeting = macroService.render(character.greeting, macroContext);
  return {
    id: `preset_chat_${character.id}`,
    title: character.name,
    messages: [
      {
        id: `preset_msg_${character.id}_0`,
        role: 'assistant',
        content: renderedGreeting,
        images: [],
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    worldBookIds: [],
    settings: mergeChatSettings({
      ...defaultChatSettings,
      systemPrompt: character.systemPrompt,
      summaryPrompt: character.summaryPrompt || defaultChatSettings.summaryPrompt,
      statusBar: character.statusBar,
      userPersona: character.userPersona || '',
      prePrompt: character.prePrompt || '',
      postPrompt: character.postPrompt || '',
      blockWords: character.blockWords || [],
      greeting: character.greeting || '',
      greetingEnabled: character.greetingEnabled ?? false,
      cssEntries: character.cssEntries?.length ? character.cssEntries : defaultChatSettings.cssEntries,
    }),
    characterId: character.id,
    isPinned: false,
    // 不再做成「母对话」：母对话必须先新建子对话才能聊，
    // 而需求是「所有对话其实都是和角色的私聊」，所以直接用普通对话。
  };
};

/**
 * 把角色卡的所有字段拼成完整的 systemPrompt。
 * 抽成独立函数，供「从角色卡建新对话」和「给现有对话添加/切换角色」共用，
 * 保证两条路径写进 systemPrompt 的内容完全一致。
 */
export const buildSystemPromptFromCharacter = (character: Character): string => {
  const parts: string[] = [];
  if (character.systemPrompt) parts.push(character.systemPrompt);
  if (character.personality) parts.push(`【${character.name}·外貌/性格（Personality）】\n${character.personality}`);
  if (character.scenario) parts.push(`【${character.name}·场景设定（Scenario）】\n${character.scenario}`);
  if (character.description && !character.systemPrompt?.includes(character.description)) {
    parts.push(`【${character.name}·角色简介（Description）】\n${character.description}`);
  }
  const mesExample = character.mesExample || character.messageExample;
  if (mesExample) parts.push(`【${character.name}·对话示例（Message Example / mes_example）】\n${mesExample}`);
  if (character.creatorNotes) parts.push(`【${character.name}·作者备注（Creator Notes）】\n${character.creatorNotes}`);
  const postHistoryInstructions = character.functionBar || (character as any).postHistoryInstructions;
  if (postHistoryInstructions) parts.push(`【${character.name}·回复风格指令（Post History Instructions）】\n${postHistoryInstructions}`);
  return parts.join('\n\n') || `You are ${character.name}.`;
};

/**
 * 把角色的设定「复制」到已有对话上：系统指令、用户人设、前后置提示、状态栏、问候语等。
 * 这是「添加角色」的核心 —— 只设置 characterId 是不够的，对话不会因此真正采用角色设定。
 */
export const applyCharacterToChat = (chat: Chat, character: Character): Chat => {
  return {
    ...chat,
    characterId: character.id,
    title: chat.title === '新对话' || !chat.title ? character.name : chat.title,
    assistantAvatar: character.avatar ?? chat.assistantAvatar,
    updatedAt: Date.now(),
    settings: mergeChatSettings({
      ...chat.settings,
      systemPrompt: buildSystemPromptFromCharacter(character),
      summaryPrompt: character.summaryPrompt || chat.settings.summaryPrompt,
      statusBar: character.statusBar ?? chat.settings.statusBar,
      userPersona: character.userPersona || '',
      prePrompt: character.prePrompt || '',
      postPrompt: character.postPrompt || '',
      blockWords: character.blockWords || [],
      greeting: character.greeting || '',
      greetingEnabled: character.greetingEnabled ?? chat.settings.greetingEnabled,
      cssEntries: character.cssEntries?.length ? character.cssEntries : chat.settings.cssEntries,
    }),
  };
};

export const createChatFromCharacter = (character: Character): Chat => {
  const now = Date.now();
  const chatId = generateId();
  const finalSystemPrompt = buildSystemPromptFromCharacter(character);
  const macroContext = macroService.buildContext({
    character,
    userName: '用户',
    messages: [],
    chatTitle: character.name,
    systemPrompt: finalSystemPrompt,
  });
  const renderedGreeting = macroService.render(character.greeting, macroContext);
  return {
    id: chatId,
    title: character.name,
    messages: [
      {
        id: `msg_${chatId}_0`,
        role: 'assistant',
        content: renderedGreeting,
        images: [],
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    worldBookIds: [],
    settings: mergeChatSettings({
      ...defaultChatSettings,
      systemPrompt: finalSystemPrompt,
      summaryPrompt: character.summaryPrompt || defaultChatSettings.summaryPrompt,
      statusBar: character.statusBar,
      userPersona: character.userPersona || '',
      prePrompt: character.prePrompt || '',
      postPrompt: character.postPrompt || '',
      blockWords: character.blockWords || [],
      greeting: character.greeting || '',
      greetingEnabled: character.greetingEnabled ?? true,
      // 角色自带的内置 CSS（碧蓝档案角色的「地点悬浮窗」就是靠这个带到每个对话里）
      cssEntries: character.cssEntries?.length ? character.cssEntries : defaultChatSettings.cssEntries,
    }),
    characterId: character.id,
    assistantAvatar: character.avatar,
    isPinned: false,
    conversationType: 'parent',
  };
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettingsState] = useState<AppSettings>(defaultAppSettings);
  const [chats, setChatsState] = useState<Chat[]>([]);
  const [providers, setProvidersState] = useState<AIProvider[]>([]);
  const [worldBooks, setWorldBooksState] = useState<WorldBook[]>([]);
  const [characters, setCharactersState] = useState<Character[]>([]);
  const [fancyWorks, setFancyWorksState] = useState<FancyWork[]>([]);
  const [presets, setPresetsState] = useState<Preset[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // ===== Task 10: 登录状态 =====
  const [isLoggedIn, setIsLoggedInState] = useState(false);
  const [currentUser, setCurrentUserState] = useState<{ username: string; nickname: string; isGuest: boolean; isAdmin: boolean; uid?: number; bio?: string; avatar?: string; points?: number; token?: string; serverUrl?: string } | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();
    return () => {
      isMountedRef.current = false;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // 持久化 currentChatId：任何对话切换都保存，下次启动直接打开最近对话
  useEffect(() => {
    if (isInitialLoadRef.current) return; // 首次加载恢复阶段不要覆盖
    storage.saveCurrentChatId(currentChatId).catch(() => {});
  }, [currentChatId]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedProvidersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedWBTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedCharsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (isInitialLoadRef.current) return;
    // 空数组不自动保存，防止首次加载失败时覆盖用户数据
    if (chats.length === 0) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // 防抖 800ms：对话多时光 JSON.stringify + 6 份文件写就要 50-200ms，
    // 流式/用户编辑时降低频率，避免 UI 卡顿；AppState background 时会立即保存兜底
    saveTimeoutRef.current = setTimeout(() => {
      storage.saveChats(chats).catch(console.error);
      // AsyncStorage 自动备份（防抖，不阻塞主流程）
      backupService.autoBackupChats(chats).catch(() => {});
      // 文件系统备份（更可靠，防止 AsyncStorage 数据丢失）
      backupService.createFileBackup({ chats }).catch(() => {});
    }, 800);
  }, [chats]);

  // AppState 监听：app 进入后台/被杀时立即保存，防止退出时数据丢失
  const chatsRef = useRef<Chat[]>([]);
  chatsRef.current = chats;
  const settingsRef = useRef<AppSettings>(defaultAppSettings);
  settingsRef.current = settings;
  const providersRef = useRef<AIProvider[]>([]);
  providersRef.current = providers;
  const worldBooksRef = useRef<WorldBook[]>([]);
  worldBooksRef.current = worldBooks;
  const charactersRef = useRef<Character[]>([]);
  charactersRef.current = characters;
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // app 进入后台 — 立即保存所有数据（不走防抖）
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        if (debouncedProvidersTimerRef.current) {
          clearTimeout(debouncedProvidersTimerRef.current);
          debouncedProvidersTimerRef.current = null;
        }
        if (debouncedWBTimerRef.current) {
          clearTimeout(debouncedWBTimerRef.current);
          debouncedWBTimerRef.current = null;
        }
        if (debouncedCharsTimerRef.current) {
          clearTimeout(debouncedCharsTimerRef.current);
          debouncedCharsTimerRef.current = null;
        }
        if (!isInitialLoadRef.current) {
          storage.saveChats(chatsRef.current, true).catch(() => {});
          storage.saveSettings(settingsRef.current, true).catch(() => {});
          storage.saveProviders(providersRef.current, true).catch(() => {});
          storage.saveWorldBooks(worldBooksRef.current, true).catch(() => {});
          storage.saveCharacters(charactersRef.current, true).catch(() => {});
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, []);

  const loadData = async () => {
    let dataLoaded = false;
    try {
      // 初始化 communityService（加载保存的服务器地址和token）
      const { communityService } = require('../services/communityService');
      await communityService.init();

      const [savedSettings, savedChats, savedProviders, savedWorldBooks, savedCharacters, savedFancyWorks, savedSession] = await Promise.all([
        storage.getSettings().catch(() => defaultAppSettings),
        storage.getChats().catch(() => []),
        storage.getProviders().catch(() => []),
        storage.getWorldBooks().catch(() => []),
        storage.getCharacters().catch(() => []),
        storage.getFancyWorks?.().catch(() => []) || Promise.resolve([]),
        // Task 10: 恢复登录 session
        authApi.getCurrentSession().catch(() => null),
      ]);
      console.log('[loadData] settings keys:', savedSettings ? Object.keys(savedSettings).length : 0,
        'chats:', savedChats?.length || 0,
        'providers:', savedProviders?.length || 0,
        'worldBooks:', savedWorldBooks?.length || 0,
        'characters:', savedCharacters?.length || 0);
      console.log('[loadData] settings.theme exists:', !!(savedSettings?.theme));

      if (!isMountedRef.current) return;

      // Task 10: 应用恢复的登录状态
      if (savedSession) {
        setIsLoggedInState(true);
        setCurrentUserState({
          username: savedSession.username,
          nickname: savedSession.nickname,
          isGuest: savedSession.isGuest,
          isAdmin: (savedSession as any).isAdmin || false,
          uid: (savedSession as any).uid,
          bio: (savedSession as any).bio,
          avatar: (savedSession as any).avatar,
          points: (savedSession as any).points ?? 0,
        });
      }

      // 1. 先设置 providers，确保 AI 对话功能可用（不受 chats 处理影响）
      let migratedProviders = (savedProviders || []).map((p: any) => ({
        ...p,
        format: p.format || 'openai',
        capabilities: p.capabilities || (p.type ? [p.type] : ['text']),
      }));
      // 一个提供商都没有时，预置 DeepSeek，保证开箱可用
      if (migratedProviders.length === 0) {
        migratedProviders = [buildDefaultProvider()];
        storage.saveProviders(migratedProviders, true).catch(() => {});
      }
      setProvidersState(migratedProviders);

      // 2. 设置 worldBooks — 直接使用文件中读到的，不合并覆盖
      if (savedWorldBooks && savedWorldBooks.length > 0) {
        // 内置资料升级：幻想入界世界书条目数变多时整本替换（一次性，升级后数量相等就不会再触发）。
        // 老版本只有 146 条（11 地点 + 135 角色），新版是 49 地点 + 156 角色。
        // 匹配放宽：id 相同 **或** 名字带「幻想入界」都算同一本（历史数据 id 可能不同）。
        const isGensokyoBook = (wb: any): boolean =>
          !!wb && (wb.id === gensokyoWorldBook.id || String(wb.name || '').includes('幻想入界'));

        let upgradedAny = false;
        const upgradedBooks = savedWorldBooks.map((wb: any) => {
          if (!isGensokyoBook(wb)) return wb;
          if ((wb.entries?.length || 0) >= gensokyoWorldBook.entries.length) return wb;
          upgradedAny = true;
          console.log('[migrate] 幻想入界世界书升级:', wb.entries?.length || 0, '->', gensokyoWorldBook.entries.length);
          return { ...wb, entries: gensokyoWorldBook.entries, updatedAt: Date.now() };
        });
        setWorldBooksState(upgradedBooks);
        if (upgradedAny) {
          storage.saveWorldBooks(upgradedBooks, true).catch(() => {});
        }
      } else {
        setWorldBooksState(presetWorldBooks);
        storage.saveWorldBooks(presetWorldBooks, true).catch(() => {});
      }

      // 3. 设置 characters — 直接使用文件中读到的，不合并覆盖
      if (savedCharacters && savedCharacters.length > 0) {
        setCharactersState(savedCharacters);
      } else {
        setCharactersState(presetCharacters);
        storage.saveCharacters(presetCharacters, true).catch(() => {});
      }

      // 4. 设置 fancyWorks
      setFancyWorksState(savedFancyWorks || []);

      // 5. 设置 presets
      const savedPresets = await storage.getPresets().catch(() => []);
      if (savedPresets && savedPresets.length > 0) {
        setPresetsState(savedPresets);
      } else {
        const defaultPresets = presetService.getDefaultPromptPresets();
        setPresetsState(defaultPresets);
        storage.savePresets(defaultPresets, true).catch(() => {});
      }

      // 6. 设置 settings
      const savedIsDarkMode = savedSettings.isDarkMode ?? false;
      const loadedThemeBase = savedIsDarkMode ? darkTheme : defaultTheme;
      // 关键修复：默认主题仅做兜底缺失字段；导入/保存的 savedSettings.theme 必须在最后面覆盖默认值
      const preservedTheme = savedSettings.theme && typeof savedSettings.theme === 'object' && Object.keys(savedSettings.theme).length > 0
        ? savedSettings.theme
        : {};
      const mergedSettings: AppSettings = {
        ...defaultAppSettings,
        ...savedSettings,
        isDarkMode: savedIsDarkMode,
        theme: { ...loadedThemeBase, ...(defaultAppSettings.theme || {}), ...preservedTheme },
        conversation: { ...defaultConversationSettings, ...(savedSettings.conversation || {}) },
        display: { ...defaultChatDisplaySettings, ...(savedSettings.display || {}) },
        features: { ...defaultChatFeatureSettings, ...(savedSettings.features || {}) },
        contextManagement: { ...defaultContextManagementSettings, ...(savedSettings.contextManagement || {}) },
        quickCommands: savedSettings.quickCommands?.length ? savedSettings.quickCommands : defaultAppSettings.quickCommands,
      };
      // 通讯录：公开版本不预置任何内容（角色卡需要用户自己导入）。
      // 这里只保证字段是数组，避免下游 .map 报错。
      if (!Array.isArray(mergedSettings.conversation?.contactBooks)) {
        mergedSettings.conversation = { ...mergedSettings.conversation, contactBooks: [] };
      }

      setSettingsState(mergedSettings);
      setIsDarkMode(savedIsDarkMode);
      // 自定义图标注册（加载 settings 后应用）
      applyCustomIcons(mergedSettings);

      // 7. 最后处理 chats（最复杂的部分，单独 try-catch）
      try {
        const migratedChats = (savedChats || []).map((chat: any) => {
          try {
            return {
              ...chat,
              settings: mergeChatSettings(chat.settings),
              worldBookIds: chat.worldBookIds || [],
              statusVars: chat.statusVars || {},
              messages: Array.isArray(chat.messages) ? chat.messages : [],
            };
          } catch {
            return null;
          }
        }).filter(Boolean) as Chat[];

        // ===== 遗留字段清理 =====
        // 说明：这里**不再自动更新任何提示词/角色资料**。
        // 之前加过一整套「碧蓝档案提示词版本迁移」，会在启动时重写对话和角色卡的 systemPrompt，
        // 用户明确要求不要这么做 —— 提示词只改源码里的那一份，运行时不要动用户数据。
        // 只保留这一项必要的修复：清掉早期「扮演」功能写进对话设置的标记，
        // 因为残留标记会让那个对话永远不回复。
        {
          let clearedPuppet = 0;
          let refreshedWidget = 0;
          for (const c of migratedChats) {
            if (c.settings?.puppetCharacterId) {
              c.settings = { ...c.settings, puppetCharacterId: undefined };
              clearedPuppet++;
            }
            // 内置「地点悬浮窗」升级为可拖动/可点击插入的悬浮块：
            // 只刷新我们自己的那一条（id = css_ba_map_sidebar），**绝不碰用户自建的 CSS 条目**。
            const entries = (c.settings?.cssEntries || []) as any[];
            const builtin = entries.find((e) => e?.id === 'css_ba_map_sidebar');
            const builtinPreset = ((blueArchivePresetCharacters[0]?.cssEntries || []) as any[]).find(
              (e: any) => e?.id === 'css_ba_map_sidebar',
            );
            if (builtin && builtinPreset && (builtin.css !== BLUE_ARCHIVE_CSS_SIDEBAR || !builtin.widget)) {
              c.settings = {
                ...c.settings,
                cssEntries: entries.map((e) =>
                  e?.id === 'css_ba_map_sidebar'
                    ? { ...e, css: BLUE_ARCHIVE_CSS_SIDEBAR, widget: builtinPreset.widget }
                    : e,
                ),
              };
              refreshedWidget++;
            }
          }
          if (clearedPuppet > 0) console.log('[migrate] 已清理遗留的扮演标记:', clearedPuppet, '个');
          if (refreshedWidget > 0) console.log('[migrate] 地点悬浮窗已升级为可交互版:', refreshedWidget, '个对话');
        }

        // ===== 数据完整性安全门 =====
        // 触发完整恢复的条件：chats 完全为空 — 或 — 只剩说明书（没有任何用户对话），但此前的紧急备份/完整备份里有大量对话
        // 这是毁灭性覆盖陷阱的关键修复：只要备份里「用户对话数」明显比当前读出来的更多，就走恢复而不是直接用残缺数据覆盖副本
        const onlyManualLeft = migratedChats.length === 0 ||
          (migratedChats.length === 1 && migratedChats[0].conversationType === 'manual') ||
          migratedChats.every((c) => c.conversationType === 'manual');
        const userChatCountNow = migratedChats.filter((c) => c.conversationType !== 'manual').length;
        const shouldTryRestore = migratedChats.length === 0 || onlyManualLeft;

        // 启动时检测：如果存储中的 chats 为空 或 只剩说明书对话，尝试从备份恢复
        if (shouldTryRestore) {
          // 最优先：从紧急备份恢复（导入数据时的原始 JSON 字符串）— 完整恢复所有字段
          try {
            const emergencyData = await storage.getEmergencyBackup();
            if (emergencyData) {
              const emergencyParsed = JSON.parse(emergencyData);
              const emergencyUserChats = (Array.isArray(emergencyParsed.chats) ? emergencyParsed.chats : []).filter((c: any) => c.conversationType !== 'manual');
              // 只有紧急备份里的用户对话数比磁盘读出来的更多时才恢复（避免空紧急备份覆盖正常数据）
              if (emergencyUserChats.length > userChatCountNow) {
                console.warn(`[emergency] 检测到数据丢失（磁盘用户对话=${userChatCountNow}，紧急备份=${emergencyUserChats.length}），恢复完整数据...`);
                const restoredChatsRaw = emergencyParsed.chats
                  .filter((chat: any) => chat.conversationType !== 'manual')
                  .map((chat: any) => ({
                    ...chat,
                    settings: mergeChatSettings(chat.settings),
                    worldBookIds: chat.worldBookIds || [],
                    statusVars: chat.statusVars || {},
                    messages: Array.isArray(chat.messages) ? chat.messages : [],
                  }));
                const finalRestored = sortChats([createManualChat(), ...restoredChatsRaw]);
                setChatsState(finalRestored);
                chatsRef.current = finalRestored;

                // 完整恢复 settings（保留主题全部字段）
                if (emergencyParsed.settings) {
                  const cleaned = { ...emergencyParsed.settings };
                  delete cleaned.themePresetName;
                  const eTheme = cleaned.theme && typeof cleaned.theme === 'object' && Object.keys(cleaned.theme).length > 0
                    ? cleaned.theme : {};
                  const eIsDark = cleaned.isDarkMode ?? savedIsDarkMode;
                  const baseTheme = eIsDark ? darkTheme : defaultTheme;
                  const mergedEmergSettings: AppSettings = {
                    ...defaultAppSettings,
                    ...cleaned,
                    isDarkMode: eIsDark,
                    theme: { ...baseTheme, ...(defaultAppSettings.theme || {}), ...eTheme },
                    conversation: { ...defaultConversationSettings, ...(cleaned.conversation || {}) },
                    display: { ...defaultChatDisplaySettings, ...(cleaned.display || {}) },
                    features: { ...defaultChatFeatureSettings, ...(cleaned.features || {}) },
                    contextManagement: { ...defaultContextManagementSettings, ...(cleaned.contextManagement || {}) },
                    quickCommands: cleaned.quickCommands?.length ? cleaned.quickCommands : defaultAppSettings.quickCommands,
                  };
                  setSettingsState(mergedEmergSettings);
                  setIsDarkMode(eIsDark);
                  settingsRef.current = mergedEmergSettings;
                  applyCustomIcons(mergedEmergSettings);
                  await storage.saveSettings(mergedEmergSettings, true);
                }

                // 完整恢复 providers
                if (Array.isArray(emergencyParsed.providers)) {
                  const mp = emergencyParsed.providers.map((p: any) => ({
                    ...p,
                    format: p.format || 'openai',
                    capabilities: p.capabilities || (p.type ? [p.type] : ['text']),
                  }));
                  setProvidersState(mp);
                  providersRef.current = mp;
                  await storage.saveProviders(mp, true);
                }
                // 完整恢复 worldBooks
                if (Array.isArray(emergencyParsed.worldBooks)) {
                  setWorldBooksState(emergencyParsed.worldBooks);
                  worldBooksRef.current = emergencyParsed.worldBooks;
                  await storage.saveWorldBooks(emergencyParsed.worldBooks, true);
                }
                // 完整恢复 characters
                if (Array.isArray(emergencyParsed.characters)) {
                  setCharactersState(emergencyParsed.characters);
                  charactersRef.current = emergencyParsed.characters;
                  await storage.saveCharacters(emergencyParsed.characters, true);
                }
                if (Array.isArray(emergencyParsed.fancyWorks)) {
                  setFancyWorksState(emergencyParsed.fancyWorks);
                  await storage.saveFancyWorks(emergencyParsed.fancyWorks, true);
                }
                if (Array.isArray(emergencyParsed.presets)) {
                  setPresetsState(emergencyParsed.presets);
                  await storage.savePresets(emergencyParsed.presets, true);
                }
                await storage.saveChats(finalRestored, true);
                await storage.flushAll();
                console.warn(`[emergency] 恢复成功: ${finalRestored.length} 条对话 (完整)`);
                dataLoaded = true;
                return;
              }
            }
          } catch (emergencyErr) {
            console.error('[emergency] 恢复失败:', emergencyErr);
          }

          // 优先尝试从文件系统完整备份恢复（包含 settings + providers + worldBooks + characters 全套）
          try {
            const fileBackups = await backupService.getFileBackups();
            if (fileBackups.length > 0) {
              const latest = fileBackups[0]; // 已按时间倒序排列
              if (latest.chatCount > userChatCountNow) {
                console.warn(`[backup] 检测到数据丢失（磁盘用户对话=${userChatCountNow}，文件备份=${latest.chatCount}），从文件系统完整备份恢复: 文件名=${latest.fileName}`);
                const restored = await backupService.restoreFromFileBackup(latest.fileName);
                if (restored && restored.chats && restored.chats.length > 0) {
                  const restoredChats = restored.chats.map((chat: any) => ({
                    ...chat,
                    settings: mergeChatSettings(chat.settings),
                    worldBookIds: chat.worldBookIds || [],
                    statusVars: chat.statusVars || {},
                    messages: Array.isArray(chat.messages) ? chat.messages : [],
                  }));
                  const hasManualRestored = restoredChats.some((c: Chat) => c.conversationType === 'manual');
                  const finalRestored = sortChats(hasManualRestored ? restoredChats : [createManualChat(), ...restoredChats]);
                  setChatsState(finalRestored);
                  chatsRef.current = finalRestored;

                  if (restored.settings) {
                    const cleaned: any = { ...restored.settings };
                    delete cleaned.themePresetName;
                    const eTheme = cleaned.theme && typeof cleaned.theme === 'object' && Object.keys(cleaned.theme).length > 0
                      ? cleaned.theme : {};
                    const eIsDark = cleaned.isDarkMode ?? savedIsDarkMode;
                    const baseTheme = eIsDark ? darkTheme : defaultTheme;
                    const mergedS: AppSettings = {
                      ...defaultAppSettings,
                      ...cleaned,
                      isDarkMode: eIsDark,
                      theme: { ...baseTheme, ...(defaultAppSettings.theme || {}), ...eTheme },
                      conversation: { ...defaultConversationSettings, ...(cleaned.conversation || {}) },
                      display: { ...defaultChatDisplaySettings, ...(cleaned.display || {}) },
                      features: { ...defaultChatFeatureSettings, ...(cleaned.features || {}) },
                      contextManagement: { ...defaultContextManagementSettings, ...(cleaned.contextManagement || {}) },
                      quickCommands: cleaned.quickCommands?.length ? cleaned.quickCommands : defaultAppSettings.quickCommands,
                    };
                    setSettingsState(mergedS);
                    setIsDarkMode(eIsDark);
                    settingsRef.current = mergedS;
                    applyCustomIcons(mergedS);
                    await storage.saveSettings(mergedS, true);
                  }
                  if (Array.isArray(restored.providers)) {
                    const mp = restored.providers.map((p: any) => ({
                      ...p,
                      format: p.format || 'openai',
                      capabilities: p.capabilities || (p.type ? [p.type] : ['text']),
                    }));
                    setProvidersState(mp);
                    providersRef.current = mp;
                    await storage.saveProviders(mp, true);
                  }
                  if (Array.isArray(restored.worldBooks)) {
                    setWorldBooksState(restored.worldBooks);
                    worldBooksRef.current = restored.worldBooks;
                    await storage.saveWorldBooks(restored.worldBooks, true);
                  }
                  if (Array.isArray(restored.characters)) {
                    setCharactersState(restored.characters);
                    charactersRef.current = restored.characters;
                    await storage.saveCharacters(restored.characters, true);
                  }
                  if (Array.isArray(restored.fancyWorks)) {
                    setFancyWorksState(restored.fancyWorks);
                    await storage.saveFancyWorks(restored.fancyWorks, true);
                  }
                  if (Array.isArray(restored.presets)) {
                    setPresetsState(restored.presets);
                    await storage.savePresets(restored.presets, true);
                  }
                  await storage.saveChats(finalRestored, true);
                  await storage.flushAll();
                  dataLoaded = true;
                  return;
                }
              }
            }
          } catch (e) {
            console.warn('[backup] 文件系统完整备份恢复失败，尝试 AsyncStorage 备份:', e);
          }

          // 回退到 AsyncStorage 完整备份
          const backupCheck = await backupService.checkAvailableBackup();
          if (backupCheck.hasBackup && backupCheck.chatCount > userChatCountNow) {
            console.warn(`[backup] 检测到数据丢失（磁盘用户对话=${userChatCountNow}，AsyncStorage备份=${backupCheck.chatCount}），从 AsyncStorage 完整备份恢复`);
            const restored = await backupService.restoreFullFromBackup(backupCheck.latestTimestamp);
            if (restored && restored.chats && restored.chats.length > 0) {
              const restoredChats = restored.chats.map((chat: any) => ({
                ...chat,
                settings: mergeChatSettings(chat.settings),
                worldBookIds: chat.worldBookIds || [],
                statusVars: chat.statusVars || {},
                messages: Array.isArray(chat.messages) ? chat.messages : [],
              }));
              const hasManualRestored = restoredChats.some((c: Chat) => c.conversationType === 'manual');
              const finalRestored = sortChats(hasManualRestored ? restoredChats : [createManualChat(), ...restoredChats]);
              setChatsState(finalRestored);
              chatsRef.current = finalRestored;

              if (restored.settings) {
                const cleaned: any = { ...restored.settings };
                delete cleaned.themePresetName;
                const eTheme = cleaned.theme && typeof cleaned.theme === 'object' && Object.keys(cleaned.theme).length > 0
                  ? cleaned.theme : {};
                const eIsDark = cleaned.isDarkMode ?? savedIsDarkMode;
                const baseTheme = eIsDark ? darkTheme : defaultTheme;
                const mergedS: AppSettings = {
                  ...defaultAppSettings,
                  ...cleaned,
                  isDarkMode: eIsDark,
                  theme: { ...baseTheme, ...(defaultAppSettings.theme || {}), ...eTheme },
                  conversation: { ...defaultConversationSettings, ...(cleaned.conversation || {}) },
                  display: { ...defaultChatDisplaySettings, ...(cleaned.display || {}) },
                  features: { ...defaultChatFeatureSettings, ...(cleaned.features || {}) },
                  contextManagement: { ...defaultContextManagementSettings, ...(cleaned.contextManagement || {}) },
                  quickCommands: cleaned.quickCommands?.length ? cleaned.quickCommands : defaultAppSettings.quickCommands,
                };
                setSettingsState(mergedS);
                setIsDarkMode(eIsDark);
                settingsRef.current = mergedS;
                applyCustomIcons(mergedS);
                await storage.saveSettings(mergedS, true);
              }
              if (Array.isArray(restored.providers)) {
                const mp = restored.providers.map((p: any) => ({
                  ...p,
                  format: p.format || 'openai',
                  capabilities: p.capabilities || (p.type ? [p.type] : ['text']),
                }));
                setProvidersState(mp);
                providersRef.current = mp;
                await storage.saveProviders(mp, true);
              }
              if (Array.isArray(restored.worldBooks)) {
                setWorldBooksState(restored.worldBooks);
                worldBooksRef.current = restored.worldBooks;
                await storage.saveWorldBooks(restored.worldBooks, true);
              }
              if (Array.isArray(restored.characters)) {
                setCharactersState(restored.characters);
                charactersRef.current = restored.characters;
                await storage.saveCharacters(restored.characters, true);
              }
              if (Array.isArray(restored.presets)) {
                setPresetsState(restored.presets);
                await storage.savePresets(restored.presets, true);
              }
              if (Array.isArray(restored.fancyWorks)) {
                setFancyWorksState(restored.fancyWorks);
                await storage.saveFancyWorks(restored.fancyWorks, true);
              }
              await storage.saveChats(finalRestored, true);
              await storage.flushAll();
              dataLoaded = true;
              return;
            }
          }
        }

        const hasManual = migratedChats.some((c: Chat) => c.conversationType === 'manual');
        let finalChats = [...migratedChats];
        let manualUpdated = false;
        let manualUpgraded = false; // 说明书内容被版本升级替换（这种情况才允许启动时回写）

        if (migratedChats.length === 0) {
          // 公开版本：不再预置「默认对话」（碧蓝档案群聊 / 幻想入界）。
          // 首次启动只放一份说明书，用户自己建对话、自己导入角色卡。
          finalChats = [createManualChat()];
          manualUpdated = true;
          // 首次启动：还没有任何数据，允许保存一次
        } else {
          if (!hasManual) {
            finalChats = [createManualChat(), ...finalChats];
            manualUpdated = true;
          } else {
            const MANUAL_VERSION = '2.7.0';
            finalChats = finalChats.map((c: Chat) => {
              if (c.conversationType === 'manual' && c.id === 'manual_chat_system') {
                const content = c.messages[0]?.content || '';
                const versionMatch = content.match(/v(\d+\.\d+\.\d+)/);
                const currentVersion = versionMatch ? versionMatch[1] : '0.0.0';
                if (currentVersion !== MANUAL_VERSION || c.messages.length < 2) {
                  manualUpdated = true;
                  manualUpgraded = true;
                  return createManualChat();
                }
              }
              return c;
            });
          }
        }
        setChatsState(sortChats(finalChats));

        // 恢复最近一次打开的对话 Id
        try {
          const savedLastId: string | null = await storage.getCurrentChatId();
          if (savedLastId && finalChats.some((c: Chat) => c.id === savedLastId)) {
            setCurrentChatId(savedLastId);
          }
        } catch {
          // 静默忽略
        }

        // ===== 启动时回写保存的安全门（绝对避免把残缺/不完整的数据覆盖到 6 份物理副本）=====
        // 仅在以下「可信」情况才写回：
        //   1. migratedChats.length === 0 首次启动，写入默认说明书
        //   2. 说明书内容真正发生了版本升级（manualUpgraded）
        //   3. 「只缺了说明书，其它对话都在」的补齐场景 — 但前提是之前就有用户对话（userChatCountNow > 0）
        // 其它情况一律不写回，防止 99% 的磁盘数据因为 page cache 丢失某一份就被整个炸掉
        const hasAnyUserChatsNow = finalChats.some((c) => c.conversationType !== 'manual');
        const isFirstRun = migratedChats.length === 0;
        const missingManualOnly = !hasManual && hasAnyUserChatsNow;
        const safeToRewriteBack = isFirstRun || manualUpgraded || missingManualOnly;
        if (safeToRewriteBack) {
          await storage.saveChats(sortChats(finalChats), true);
          try { await AsyncStorage.setItem('ai_tavern_app_version', '2.7.0'); } catch {}
        } else {
          console.log(`[loadData] SKIP startup-chats-rewrite (防残缺覆盖)：migrated=${migratedChats.length} userChats=${userChatCountNow}`);
        }

        // 数据加载成功后创建完整备份（仅当有对话时）
        if (finalChats.length > 0) {
          backupService.createFullBackup({
            settings: mergedSettings,
            chats: finalChats,
            providers: migratedProviders,
            worldBooks: savedWorldBooks || [],
            characters: savedCharacters || [],
            fancyWorks: savedFancyWorks || [],
            presets: savedPresets || [],
          }).catch(() => {});
        }
      } catch (chatError) {
        console.error('Failed to load chats:', chatError);
        // chats 加载失败不影响其他功能
      }

      dataLoaded = true;
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        // 只有数据完全加载成功才启用自动保存
        if (dataLoaded) {
          isInitialLoadRef.current = false;
        }
      }
    }
  };

  const setSettings = async (newSettings: AppSettings) => {
    settingsRef.current = newSettings;
    setSettingsState(newSettings);
    applyCustomIcons(newSettings);
    await storage.saveSettings(newSettings, true);
  };

  const updateTheme = async (themeUpdates: Partial<ThemeConfig>) => {
    const newSettings = {
      ...settings,
      theme: { ...settings.theme, ...themeUpdates },
    };
    settingsRef.current = newSettings;
    setSettingsState(newSettings);
    applyCustomIcons(newSettings);
    await storage.saveSettings(newSettings, true);
  };

  // 扮演模式：设置/取消玩家正在扮演的角色（通讯录「扮演」），持久记忆
  const setPlayingAs = async (characterId: string | undefined) => {
    const newSettings: AppSettings = {
      ...settings,
      conversation: { ...settings.conversation, playingAsCharacterId: characterId },
    };
    settingsRef.current = newSettings;
    setSettingsState(newSettings);
    applyCustomIcons(newSettings);
    await storage.saveSettings(newSettings, true);
  };

  // 首次启动：把内置表情包释放进素材库（AI 才能用 {{ui:img=名字}} 发图）
  // 推迟到首屏渲染之后再跑，并且服务内部是分块导入的，避免拖慢启动
  useEffect(() => {
    const timer = setTimeout(() => {
      emojiPackService
        .ensureSeeded()
        .then((r) => {
          if (!r.skipped && r.imported > 0) {
            console.log('[emojiPack] 已导入内置表情', r.imported, '个');
          }
        })
        .catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // 主题切换（日间/夜间）
  const [isDarkMode, setIsDarkMode] = useState(false);
  const toggleTheme = async () => {
    const newIsDark = !isDarkMode;
    setIsDarkMode(newIsDark);
    const newTheme = newIsDark ? darkTheme : defaultTheme;
    const newSettings = { ...settings, theme: newTheme, isDarkMode: newIsDark };
    settingsRef.current = newSettings;
    setSettingsState(newSettings);
    applyCustomIcons(newSettings);
    await storage.saveSettings(newSettings, true);
  };

  const setDarkMode = async (dark: boolean) => {
    // 切换前保存当前主题到对应字段（日间→themeLight，夜间→themeDark）
    const currentIsDark = settings.isDarkMode;
    const savedThemeLight = currentIsDark ? settings.themeLight : { ...settings.theme };
    const savedThemeDark = currentIsDark ? { ...settings.theme } : settings.themeDark;

    // 加载目标主题：优先用已保存的，否则用默认
    const targetTheme = dark
      ? (savedThemeDark || darkTheme)
      : (savedThemeLight || defaultTheme);

    setIsDarkMode(dark);
    const newSettings = {
      ...settings,
      theme: targetTheme,
      themeLight: savedThemeLight,
      themeDark: savedThemeDark,
      isDarkMode: dark,
    };
    settingsRef.current = newSettings;
    setSettingsState(newSettings);
    applyCustomIcons(newSettings);
    await storage.saveSettings(newSettings, true);
  };

  // 回收站
  const [recycleBinState, setRecycleBinState] = useState<{ id: string; type: 'chat' | 'message'; data: any; deletedAt: number }[]>([]);
  const addToRecycleBin = (item: { id: string; type: 'chat' | 'message'; data: any }) => {
    setRecycleBinState((prev) => [...prev, { ...item, deletedAt: Date.now() }]);
  };
  const restoreFromRecycleBin = (id: string) => {
    setRecycleBinState((prev) => prev.filter((item) => item.id !== id));
  };
  const clearRecycleBin = () => {
    setRecycleBinState([]);
  };
  const deleteFromRecycleBin = (id: string) => {
    setRecycleBinState((prev) => prev.filter((item) => item.id !== id));
  };

  // 用户资料
  const [userProfileState, setUserProfileState] = useState<UserProfile | null>(defaultUserProfile);
  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUserProfileState((prev) => {
      const updated = { ...(prev || defaultUserProfile), ...updates };
      if (settings.userProfile !== undefined) {
        const newSettings = { ...settings, userProfile: updated };
        settingsRef.current = newSettings;
        setSettingsState(newSettings);
        storage.saveSettings(newSettings, true).catch(() => {});
      }
      return updated;
    });
  };

  // 当前AI配置
  const [currentConfigState, setCurrentConfigState] = useState<any>(null);
  const setCurrentConfig = (config: any) => {
    setCurrentConfigState(config);
  };

  // 消息密度
  const messageDensity = settings.display?.messageDensity ?? 1;
  
  // 强调色
  const accentColor = settings.theme?.accentColor ?? '#ff6b9d';

  const setChats = (newChats: Chat[] | ((prev: Chat[]) => Chat[])) => {
    if (typeof newChats === 'function') {
      const updater = newChats as (prev: Chat[]) => Chat[];
      setChatsState((prev) => {
        const next = updater(prev);
        chatsRef.current = next;
        // 立即写入 FileSystem + AsyncStorage，不等防抖，防止用户操作后立刻杀进程丢失
        storage.saveChats(next, true).catch(() => {});
        return next;
      });
    } else {
      chatsRef.current = newChats;
      setChatsState(newChats);
      storage.saveChats(newChats, true).catch(() => {});
    }
  };

  const setProviders = async (newProviders: AIProvider[]) => {
    providersRef.current = newProviders;
    setProvidersState(newProviders);
    await storage.saveProviders(newProviders, true);
  };

  const setWorldBooks = async (newWorldBooks: WorldBook[]) => {
    worldBooksRef.current = newWorldBooks;
    setWorldBooksState(newWorldBooks);
    await storage.saveWorldBooks(newWorldBooks, true);
  };

  const setCharacters = async (newCharacters: Character[]) => {
    charactersRef.current = newCharacters;
    setCharactersState(newCharacters);
    await storage.saveCharacters(newCharacters, true);
  };

  const addCharacter = async (character: Character) => {
    const newCharacters = [...charactersRef.current, character];
    charactersRef.current = newCharacters;
    setCharactersState(newCharacters);
    await storage.saveCharacters(newCharacters, true);
  };

  const createChatFromPreset = (characterId: string): Chat | null => {
    const character = presetCharacters.find((c) => c.id === characterId);
    if (!character) return null;
    const newChat = createPresetChatFromCharacter(character);
    setChats([newChat, ...chats]);
    return newChat;
  };

  const handleCreateChatFromCharacter = (character: Character): Chat => {
    const newChat = createChatFromCharacter(character);
    setChats([newChat, ...chats]);
    return newChat;
  };

  const setFancyWorks = async (newWorks: FancyWork[]) => {
    setFancyWorksState(newWorks);
    if (storage.saveFancyWorks) {
      await storage.saveFancyWorks(newWorks, true);
    }
  };

  const setPresets = async (newPresets: Preset[]) => {
    setPresetsState(newPresets);
    await storage.savePresets(newPresets, true);
  };

  const toggleChatPin = (chatId: string) => {
    const newChats = chats.map((c) =>
      c.id === chatId ? { ...c, isPinned: !c.isPinned, updatedAt: Date.now() } : c
    );
    setChats(newChats);
  };

  const toggleChatFavorite = (chatId: string) => {
    const newChats = chats.map((c) =>
      c.id === chatId ? { ...c, isFavorite: !c.isFavorite, updatedAt: Date.now() } : c
    );
    setChats(newChats);
  };

  const toggleMessageFavorite = (chatId: string, messageId: string) => {
    const newChats = chats.map((c) => {
      if (c.id !== chatId) return c;
      return {
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId ? { ...m, isFavorite: !m.isFavorite } : m
        ),
        updatedAt: Date.now(),
      };
    });
    setChats(newChats);
  };

  const getFavoriteMessages = () => {
    const favorites: { chatId: string; chatTitle: string; message: ChatMessage }[] = [];
    chats.forEach((chat) => {
      chat.messages.forEach((msg) => {
        if (msg.isFavorite) {
          favorites.push({ chatId: chat.id, chatTitle: chat.title, message: msg });
        }
      });
    });
    return favorites.sort((a, b) => b.message.timestamp - a.message.timestamp);
  };

  const buildSnapshot = () => {
    return {
      version: 1,
      exportTime: Date.now(),
      settings,
      chats,
      providers,
      worldBooks,
      characters,
    };
  };
  const exportAllData = () => {
    return JSON.stringify(buildSnapshot(), null, 2);
  };

  /**
   * 带素材的导出。
   * buildSnapshot 是同步的（内部备份用，不能塞大文件），但用户手动「导出所有数据」时
   * 素材库的图片/GIF/视频必须一起走，否则换机后自定义界面里的 media:// 引用全会失效。
   */
  const exportAllDataWithMedia = async (): Promise<string> => {
    let mediaAssets: any[] = [];
    try {
      mediaAssets = await mediaLibraryService.exportAll();
    } catch (e) {
      console.warn('[export] 素材打包失败，导出不含素材', e);
    }
    const snapshot: any = { ...buildSnapshot(), mediaAssets };
    snapshot.mediaCount = mediaAssets.length;
    return JSON.stringify(snapshot, null, 2);
  };
  // === 备份与恢复 ===
  const getChatsBackupsFn = async () => {
    return backupService.getChatsBackups();
  };

  const getFullBackupsFn = async () => {
    return backupService.getFullBackups();
  };

  const restoreChatsFromBackupFn = async (timestamp: number): Promise<boolean> => {
    try {
      const restored = await backupService.restoreChatsFromBackup(timestamp);
      if (restored && restored.length > 0) {
        const migrated = restored.map((chat: any) => ({
          ...chat,
          settings: mergeChatSettings(chat.settings),
          worldBookIds: chat.worldBookIds || [],
          statusVars: chat.statusVars || {},
          messages: Array.isArray(chat.messages) ? chat.messages : [],
        }));
        setChats(migrated);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const restoreFullFromBackupFn = async (timestamp: number): Promise<boolean> => {
    try {
      const restored = await backupService.restoreFullFromBackup(timestamp);
      if (!restored) return false;

      // 恢复 settings + 主题（完整保留备份中的 theme 字段）
      if (restored.settings) {
        const cleaned: any = { ...restored.settings };
        delete cleaned.themePresetName;
        const eTheme = cleaned.theme && typeof cleaned.theme === 'object' && Object.keys(cleaned.theme).length > 0
          ? cleaned.theme : {};
        const eIsDark = cleaned.isDarkMode ?? false;
        const baseTheme = eIsDark ? darkTheme : defaultTheme;
        const mergedS: AppSettings = {
          ...defaultAppSettings,
          ...cleaned,
          isDarkMode: eIsDark,
          theme: { ...baseTheme, ...(defaultAppSettings.theme || {}), ...eTheme },
          conversation: { ...defaultConversationSettings, ...(cleaned.conversation || {}) },
          display: { ...defaultChatDisplaySettings, ...(cleaned.display || {}) },
          features: { ...defaultChatFeatureSettings, ...(cleaned.features || {}) },
          contextManagement: { ...defaultContextManagementSettings, ...(cleaned.contextManagement || {}) },
          quickCommands: cleaned.quickCommands?.length ? cleaned.quickCommands : defaultAppSettings.quickCommands,
        };
        setSettingsState(mergedS);
        setIsDarkMode(eIsDark);
        settingsRef.current = mergedS;
        applyCustomIcons(mergedS);
        await storage.saveSettings(mergedS, true);
      }

      // 恢复 chats — 过滤掉重复的说明书，确保只留一份系统说明书，再 sortChats
      if (restored.chats) {
        const migrated = restored.chats
          .filter((chat: any) => chat?.conversationType !== 'manual')
          .map((chat: any) => ({
            ...chat,
            settings: mergeChatSettings(chat.settings),
            worldBookIds: chat.worldBookIds || [],
            statusVars: chat.statusVars || {},
            messages: Array.isArray(chat.messages) ? chat.messages : [],
          }));
        const final = sortChats([createManualChat(), ...migrated]);
        setChatsState(final);
        chatsRef.current = final;
        await storage.saveChats(final, true);
      }

      // 恢复 providers
      if (restored.providers && restored.providers.length > 0) {
        const mp = restored.providers.map((p: any) => ({
          ...p,
          format: p.format || 'openai',
          capabilities: p.capabilities || (p.type ? [p.type] : ['text']),
        }));
        setProvidersState(mp);
        providersRef.current = mp;
        await storage.saveProviders(mp, true);
      }
      // 恢复 worldBooks
      if (restored.worldBooks && restored.worldBooks.length > 0) {
        setWorldBooksState(restored.worldBooks);
        worldBooksRef.current = restored.worldBooks;
        await storage.saveWorldBooks(restored.worldBooks, true);
      }
      // 恢复 characters
      if (restored.characters && restored.characters.length > 0) {
        setCharactersState(restored.characters);
        charactersRef.current = restored.characters;
        await storage.saveCharacters(restored.characters, true);
      }
      if (restored.fancyWorks && restored.fancyWorks.length > 0) {
        setFancyWorksState(restored.fancyWorks);
        await storage.saveFancyWorks(restored.fancyWorks, true);
      }
      if (restored.presets && restored.presets.length > 0) {
        setPresetsState(restored.presets);
        await storage.savePresets(restored.presets, true);
      }
      // 收尾：flush 所有 AsyncStorage 防抖写 + 500ms 刷盘窗口 + 二次强写，保证恢复后立刻杀进程也不丢
      await storage.flushAll();
      await storage.waitForFlush(500);
      await Promise.all([
        storage.saveChats(chatsRef.current || [], true),
        storage.saveSettings(settingsRef.current, true),
        storage.saveProviders(providersRef.current || [], true),
        storage.saveWorldBooks(worldBooksRef.current || [], true),
        storage.saveCharacters(charactersRef.current || [], true),
      ]);
      try { await storage.flushAll(); } catch {}
      return true;
    } catch (err) {
      console.error('[restoreFullFromBackupFn] error:', err);
      return false;
    }
  };

  const createManualBackupFn = async (): Promise<boolean> => {
    try {
      // 同时写双存储：FileSystem（优先大文件安全）+ AsyncStorage（兜底小快照）
      await backupService.createFullBackup({
        settings,
        chats,
        providers,
        worldBooks,
        characters,
        fancyWorks,
        presets,
      });
      // 额外立即把 chats/settings/providers 再写一遍三份副本（确保手动备份操作完成后立刻就有三套最新主文件）
      await Promise.all([
        storage.saveChats(chats, true),
        storage.saveSettings(settings, true),
        storage.saveProviders(providers, true),
        storage.saveWorldBooks(worldBooks, true),
        storage.saveCharacters(characters, true),
        storage.saveFancyWorks(fancyWorks, true),
        storage.savePresets(presets, true),
      ]);
      await storage.flushAll();
      return true;
    } catch (e) {
      console.error('[createManualBackupFn] error:', e);
      return false;
    }
  };

  const importAllData = async (dataStr: string): Promise<boolean> => {
    try {
      const data = JSON.parse(dataStr);
      if (!data.version) return false;

      console.log('[importAllData] 开始导入，chats=', data.chats?.length || 0,
        ' providers=', data.providers?.length || 0,
        ' worldBooks=', data.worldBooks?.length || 0,
        ' characters=', data.characters?.length || 0,
        ' settings?.theme keys=', data.settings?.theme ? Object.keys(data.settings.theme).length : 0);

      // Step 0: 立即保存 3 份紧急备份（原始 JSON）—— 即便后面失败，下次启动也能恢复
      await storage.saveEmergencyBackup(dataStr);

      // Step 0.5: 还原内嵌的素材库（图片/GIF/视频）。
      // 自定义界面用 media://名字 引用素材，不把素材一起导回来，界面就会全是破图。
      if (Array.isArray(data.mediaAssets) && data.mediaAssets.length > 0) {
        try {
          const r = await mediaLibraryService.importAll(data.mediaAssets);
          console.log('[importAllData] 素材导入', r);
        } catch (e) {
          console.warn('[importAllData] 素材导入失败（不阻断整体导入）', e);
        }
      } else {
        mediaLibraryService.clearCache();
      }

      // 保存当前说明书（manual chat），导入后必须恢复，防止被覆盖
      const protectedManual = chats.find((c) => c.conversationType === 'manual') || createManualChat();
      let finalNewChats: Chat[] = chats;

      // 计算出导入后的最终快照（用于最后写入完整备份）— 先在本地变量确定，避免异步竞态
      let finalSettings: AppSettings = settingsRef.current;
      let finalProviders: AIProvider[] = providersRef.current;
      let finalWorldBooks: WorldBook[] = worldBooksRef.current;
      let finalCharacters: Character[] = charactersRef.current;
      let finalFancyWorks: FancyWork[] = fancyWorks;
      let finalPresets: Preset[] = presets;

      // ========= 1. settings（含主题） =========
      if (data.settings) {
        const rawCleaned: any = { ...data.settings };
        delete rawCleaned.themePresetName;
        const eTheme = rawCleaned.theme && typeof rawCleaned.theme === 'object' && Object.keys(rawCleaned.theme).length > 0
          ? rawCleaned.theme : {};
        const eIsDark = rawCleaned.isDarkMode ?? false;
        const baseTheme = eIsDark ? darkTheme : defaultTheme;
        const finalSettingsObj: AppSettings = {
          ...defaultAppSettings,
          ...rawCleaned,
          isDarkMode: eIsDark,
          theme: { ...baseTheme, ...(defaultAppSettings.theme || {}), ...eTheme },
          conversation: { ...defaultConversationSettings, ...(rawCleaned.conversation || {}) },
          display: { ...defaultChatDisplaySettings, ...(rawCleaned.display || {}) },
          features: { ...defaultChatFeatureSettings, ...(rawCleaned.features || {}) },
          contextManagement: { ...defaultContextManagementSettings, ...(rawCleaned.contextManagement || {}) },
          quickCommands: rawCleaned.quickCommands?.length ? rawCleaned.quickCommands : defaultAppSettings.quickCommands,
        };
        setSettingsState(finalSettingsObj);
        setIsDarkMode(eIsDark);
        settingsRef.current = finalSettingsObj;
        applyCustomIcons(finalSettingsObj);
        finalSettings = finalSettingsObj;
        // 串行立即写入 3 份物理副本 + AsyncStorage
        await storage.saveSettings(finalSettingsObj, true);
      }

      // ========= 2. chats（导入追加，去重，保留说明书） =========
      if (data.chats) {
        const existingIds = new Set(chats.map((c) => c.id));
        const migratedImportedChats = data.chats
          .filter((chat: any) => chat.conversationType !== 'manual')
          .filter((chat: any) => !existingIds.has(chat.id))
          .map((chat: any) => ({
            ...chat,
            settings: mergeChatSettings(chat.settings),
            worldBookIds: Array.isArray(chat.worldBookIds) ? chat.worldBookIds : [],
            statusVars: chat.statusVars || {},
            messages: Array.isArray(chat.messages)
              ? chat.messages.map((msg: any) => ({
                  id: msg.id || generateId(),
                  role: (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') ? msg.role : 'assistant',
                  content: msg.content || '',
                  images: Array.isArray(msg.images) ? msg.images : [],
                  timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
                  providerId: msg.providerId,
                  type: msg.type,
                  isFavorite: msg.isFavorite || false,
                  isError: msg.isError || false,
                  errorDetail: msg.errorDetail,
                  versions: Array.isArray(msg.versions) ? msg.versions : undefined,
                  currentVersionIndex: msg.currentVersionIndex,
                  tokenUsage: msg.tokenUsage,
                  firstTokenTime: msg.firstTokenTime,
                  totalElapsedTime: msg.totalElapsedTime,
                  aijsCode: msg.aijsCode,
                  aijsResult: msg.aijsResult,
                  senderMemberId: msg.senderMemberId,
                }))
              : [],
          }));
        // 在现有对话基础上追加；确保说明书对话仍在
        const hasManualInCurrent = chats.some((c) => c.conversationType === 'manual');
        const base = hasManualInCurrent ? chats : [protectedManual, ...chats];
        const sortedChats = sortChats([...base, ...migratedImportedChats]);
        finalNewChats = sortedChats;
        setChatsState(sortedChats);
        chatsRef.current = sortedChats;
        // 串行立即写入 3 份物理副本 + AsyncStorage
        await storage.saveChats(sortedChats, true);
      } else {
        const hasManualAlready = chats.some((c) => c.conversationType === 'manual');
        if (!hasManualAlready) {
          const newChats = sortChats([protectedManual, ...chats]);
          finalNewChats = newChats;
          setChatsState(newChats);
          chatsRef.current = newChats;
          await storage.saveChats(newChats, true);
        }
      }

      // ========= 3. providers =========
      if (data.providers) {
        const migratedProviders = data.providers.map((p: any) => ({
          ...p,
          format: p.format || 'openai',
          capabilities: p.capabilities || (p.type ? [p.type] : ['text']),
        }));
        setProvidersState(migratedProviders);
        providersRef.current = migratedProviders;
        finalProviders = migratedProviders;
        await storage.saveProviders(migratedProviders, true);
      }
      // ========= 4. worldBooks =========
      if (data.worldBooks) {
        setWorldBooksState(data.worldBooks);
        worldBooksRef.current = data.worldBooks;
        finalWorldBooks = data.worldBooks;
        await storage.saveWorldBooks(data.worldBooks, true);
      }
      // ========= 5. characters =========
      if (data.characters) {
        setCharactersState(data.characters);
        charactersRef.current = data.characters;
        finalCharacters = data.characters;
        await storage.saveCharacters(data.characters, true);
      }
      // ========= 6. fancyWorks =========
      if (Array.isArray(data.fancyWorks)) {
        setFancyWorksState(data.fancyWorks);
        finalFancyWorks = data.fancyWorks;
        await storage.saveFancyWorks(data.fancyWorks, true);
      }
      // ========= 7. presets =========
      if (Array.isArray(data.presets)) {
        setPresetsState(data.presets);
        finalPresets = data.presets;
        await storage.savePresets(data.presets, true);
      }

      // ========= 8. 创建完整文件系统备份（包含全部字段） =========
      await backupService.createFullBackup({
        settings: finalSettings,
        chats: finalNewChats,
        providers: finalProviders,
        worldBooks: finalWorldBooks,
        characters: finalCharacters,
        fancyWorks: finalFancyWorks,
        presets: finalPresets,
      });
      // 再创建一份 chats-only 备份（兼容自动恢复链路），也写完整字段
      await backupService.createFileBackup({
        settings: finalSettings,
        chats: finalNewChats,
        providers: finalProviders,
        worldBooks: finalWorldBooks,
        characters: finalCharacters,
        fancyWorks: finalFancyWorks,
        presets: finalPresets,
      });

      // 确保所有 AsyncStorage 防抖写立即 flush
      try { await storage.flushAll(); } catch {}

      // ========= 8.5 刷盘窗口：关键等待 + 二次强写 =========
      // 参考 Android 断电/杀进程数据丢失业界方案：fsync(fd) / Runtime.exec("sync")
      // Expo FileSystem 没有原生 fsync，我们用：
      //   a) 时间窗口等待 500~1000ms 让内核有机会把 page cache 刷到闪存
      //   b) 立刻把所有数据再完整写一遍 6 份副本
      //   c) 再次把 import 原始 JSON 写到 emergency（双目录 + AsyncStorage 共 5 份）
      await storage.waitForFlush(800);
      await Promise.all([
        storage.saveChats(finalNewChats, true),
        storage.saveSettings(finalSettings, true),
        storage.saveProviders(finalProviders, true),
        storage.saveWorldBooks(finalWorldBooks, true),
        storage.saveCharacters(finalCharacters, true),
        storage.saveFancyWorks(finalFancyWorks, true),
        storage.savePresets(finalPresets, true),
      ]);
      try { await storage.flushAll(); } catch {}
      await storage.saveEmergencyBackup(dataStr);

      // ========= 9. 终局回读验证（从物理文件重新读取，不使用内存缓存），失败直接重试 1 次 =========
      storage.clearCache();
      let allOk = true;
      try {
        if (data.settings) {
          const verifyS = await storage.getSettings();
          const ok = verifyS && Object.keys(verifyS).length > 0
            && (verifyS.theme && Object.keys(verifyS.theme).length >= Object.keys(finalSettings.theme || {}).length - 2
              || !data.settings.theme);
          if (!ok) {
            console.error('[importAllData] VERIFY FAILED settings, 重试');
            await storage.saveSettings(finalSettings, true);
          } else {
            console.log('[importAllData] VERIFY OK: settings.theme keys=', Object.keys(verifyS.theme || {}).length);
          }
          allOk = allOk && !!ok;
        }
        if (data.chats) {
          const verifyC = await storage.getChats();
          const ok = Array.isArray(verifyC) && verifyC.length >= finalNewChats.length;
          if (!ok) {
            console.error(`[importAllData] VERIFY FAILED chats: expected>=${finalNewChats.length} got=${Array.isArray(verifyC) ? verifyC.length : 'non-array'}, 重试`);
            await storage.saveChats(finalNewChats, true);
          } else {
            console.log(`[importAllData] VERIFY OK: chats=${verifyC.length}`);
          }
          allOk = allOk && !!ok;
        }
        if (data.providers) {
          const verifyP = await storage.getProviders();
          if (!Array.isArray(verifyP) || verifyP.length < finalProviders.length) {
            await storage.saveProviders(finalProviders, true);
            allOk = false;
          }
        }
        if (data.worldBooks) {
          const verifyW = await storage.getWorldBooks();
          if (!Array.isArray(verifyW) || verifyW.length < finalWorldBooks.length) {
            await storage.saveWorldBooks(finalWorldBooks, true);
            allOk = false;
          }
        }
        if (data.characters) {
          const verifyChars = await storage.getCharacters();
          if (!Array.isArray(verifyChars) || verifyChars.length < finalCharacters.length) {
            await storage.saveCharacters(finalCharacters, true);
            allOk = false;
          }
        }
      } catch (verifyErr) {
        console.error('[importAllData] verify read-back crashed:', verifyErr);
        allOk = false;
      }

      // 无论验证是否通过，再额外做一次等待+emergency（确保文件落盘）+ flush
      await storage.waitForFlush(500);
      await storage.saveEmergencyBackup(dataStr);
      try { await storage.flushAll(); } catch {}

      console.log('[importAllData] 导入结束 allOk=', allOk, ' finalChats=', finalNewChats.length);
      return true;
    } catch (err) {
      console.error('[importAllData] error:', err);
      return false;
    }
  };

  // ===== Task 2: isManualChat 辅助函数 =====
  const isManualChat = (chatId: string): boolean => {
    const chat = chats.find((c) => c.id === chatId);
    return !!chat && chat.conversationType === 'manual';
  };

  // ===== Task 10: 登录方法 =====
  const handleLogin = async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    setIsLoggedInState(true);
    setCurrentUserState({
      username: result.username,
      nickname: result.nickname,
      isGuest: false,
      isAdmin: result.isAdmin,
      uid: result.uid,
      bio: result.bio,
      avatar: result.avatar,
      points: result.points ?? 0,
    });
    return result;
  };

  const handleRegister = async (username: string, password: string, nickname?: string) => {
    const result = await authApi.register(username, password, nickname);
    setIsLoggedInState(true);
    setCurrentUserState({
      username: result.username,
      nickname: result.nickname,
      isGuest: false,
      isAdmin: result.isAdmin,
      uid: result.uid,
      bio: result.bio,
      avatar: result.avatar,
      points: result.points ?? 0,
    });
    return result;
  };

  const handleGuestLogin = async () => {
    const result = await authApi.guestLogin();
    setIsLoggedInState(true);
    setCurrentUserState({ username: result.username, nickname: result.nickname, isGuest: true, isAdmin: false, points: 0 });
    return result;
  };

  const handleLogout = async () => {
    await authApi.logout();
    setIsLoggedInState(false);
    setCurrentUserState(null);
  };

  // 局部更新当前用户资料（昵称/签名/头像/积分）：同步 currentUser 内存状态 + 写 authApi 本地会话持久化
  const handleUpdateCurrentUser = async (data: { nickname?: string; bio?: string; avatar?: string; points?: number }) => {
    setCurrentUserState((prev) => prev ? { ...prev, ...data } : prev);
    try {
      await authApi.updateProfile(data);
    } catch {
      // authApi.updateProfile 内部会先尝试走服务器再兜底本地写；此处静默，避免 UI 操作被打断
    }
  };

  return (
    <AppContext.Provider
      value={{
        settings,
        setSettings,
        updateTheme,
        toggleTheme,
        setPlayingAs,
        isDarkMode,
        setDarkMode,
        recycleBin: recycleBinState,
        addToRecycleBin,
        restoreFromRecycleBin,
        clearRecycleBin,
        deleteFromRecycleBin,
        userProfile: userProfileState,
        updateUserProfile,
        currentConfig: currentConfigState,
        setCurrentConfig,
        messageDensity,
        accentColor,
        chats,
        setChats,
        providers,
        setProviders,
        worldBooks,
        setWorldBooks,
        characters,
        setCharacters,
        addCharacter,
        presetCharacters,
        createChatFromPreset,
        createChatFromCharacter: handleCreateChatFromCharacter,
        fancyWorks,
        setFancyWorks,
        presets,
        setPresets,
        currentChatId,
        setCurrentChatId,
        isLoading,
        toggleChatPin,
        toggleChatFavorite,
        toggleMessageFavorite,
        getFavoriteMessages,
        buildSnapshot,
        exportAllData,
        exportAllDataWithMedia,
        importAllData,
        getChatsBackups: getChatsBackupsFn,
        getFullBackups: getFullBackupsFn,
        restoreChatsFromBackup: restoreChatsFromBackupFn,
        restoreFullFromBackup: restoreFullFromBackupFn,
        createManualBackup: createManualBackupFn,
        // ===== Task 2: 说明书辅助 =====
        isManualChat,
        // ===== Task 10: 登录功能 =====
        isLoggedIn,
        currentUser,
        login: handleLogin,
        register: handleRegister,
        guestLogin: handleGuestLogin,
        logout: handleLogout,
        updateCurrentUser: handleUpdateCurrentUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
