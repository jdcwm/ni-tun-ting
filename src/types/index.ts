export type ApiFormat =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'azure'
  | 'custom'
  | 'python_proxy';

export interface PythonProxyConfig {
  /** Python 可执行文件路径，留空用默认 python/python3 */
  pythonPath?: string;
  /** 用户自建的完整脚本（Python），将被写入临时文件后启动 HTTP 服务
   *  要求脚本监听 127.0.0.1:{port}，实现 OpenAI 兼容的 /v1/chat/completions 接口即可
   *  脚本里可通过 getopt/env 读取 PORT / API_KEY / MODEL 环境变量
   */
  scriptCode?: string;
  /** 启动命令（若用户不想用内嵌脚本，则提供完整命令行；优先级高于 scriptCode）*/
  launchCommand?: string;
  /** 额外 pip 依赖，逗号分隔 */
  pipPackages?: string;
  /** 脚本是否已保存，用于展示"编辑脚本"按钮状态 */
  lastSavedAt?: number;
}

export interface AIModel {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
  capabilities: AIType[];
  isFavorite: boolean;
  order?: number;
  contextLength?: number;
  description?: string;
}

export interface AIProvider {
  id: string;
  name: string;
  format: ApiFormat;
  capabilities: string[];
  apiKey: string;
  baseUrl: string;
  model: string;
  models: AIModel[];
  isFavorite: boolean;
  order?: number;
  apiPath?: string;
  presetId?: string;
  lastModelFetchTime?: number;
  /** 自建中转（Python 环境）配置，仅当 format === 'python_proxy' 时启用 */
  pythonProxy?: PythonProxyConfig;
  /** AI 头像（本地 uri 或 base64） */
  avatar?: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  greeting: string;
  messageExample?: string;
  functionBar?: string;
  avatar?: string;
  tags: string[];
  isFavorite: boolean;
  isPreset?: boolean;
  createdAt: number;
  statusBar?: StatusBarConfig;
  summaryPrompt?: string;
  worldBookIds?: string[];
  updatedAt?: number;
  creator?: string;
  characterVersion?: string;
  creatorNotes?: string;
  alternateGreetings?: string[];
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  mesExample?: string;
  userPersona?: string;
  prePrompt?: string;
  postPrompt?: string;
  blockWords?: string[];
  greetingEnabled?: boolean;
  /**
   * 角色自带的内置 CSS（建对话时会被复制到 chat.settings.cssEntries）。
   * 碧蓝档案角色用它挂「地点悬浮窗」。
   */
  cssEntries?: CSSEntry[];
}

export interface TavernAIV2CardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  extensions: Record<string, any>;
}

export interface TavernAIV2Card {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: TavernAIV2CardData;
}

export type CardImportFormat = 'tavern_v2' | 'tavern_v1' | 'sillytavern' | 'json' | 'png';

export interface StatusVar {
  name: string;
  label: string;
  value: number | string;
  min?: number;
  max?: number;
  type: 'number' | 'string' | 'progress';
  color?: string;
  icon?: string;
}

export interface StatusBarConfig {
  enabled: boolean;
  vars: StatusVar[];
  position: 'top' | 'bottom';
  style: 'bar' | 'compact' | 'inline' | 'full';
  animation?: 'none' | 'breathing' | 'pulse' | 'gradient';
  backgroundColor?: string;
  textColor?: string;
}

export interface WorldBookCoverConfig {
  scale: number;
  offsetX: number;
  offsetY: number;
  borderRadius: number;
}

export interface WorldBook {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  summaryPrompt?: string;
  entries: WorldBookEntry[];
  createdAt: number;
  updatedAt: number;
  coverImage?: string;
  coverConfig?: WorldBookCoverConfig;
}

export interface WorldBookEntry {
  id: string;
  keys: string[];
  content: string;
  images: WorldBookImage[];
  inlineFiles?: InlineFile[];
  enabled: boolean;
  scanDepth?: number;
  tokenBudget?: number;
  position?: 'before_char' | 'after_char' | 'before_persona' | 'after_persona' | 'before_history' | 'after_history' | 'at_depth' | 'top' | 'bottom';
  probability?: number;
  caseSensitive?: boolean;
  useRecursion?: boolean;
  recursionDepth?: number;
  useRegex?: boolean;
  order?: number;
  constant?: boolean;
  selective?: boolean;
  secondaryKeys?: string[];
  comment?: string;
  category?: string;
  injectWhen?: 'always' | 'on_keyword' | 'on_message_count' | 'on_time_interval';
  injectMessageCount?: number;
  injectTimeInterval?: number;
  keepWithText?: boolean;
  triggerScope?: 'user' | 'ai' | 'both';
  matchMode?: 'any' | 'all';
  injectTarget?: 'system_prompt' | 'pre_prompt' | 'post_prompt';
}

export interface WorldBookImage {
  id: string;
  name: string;
  uri: string;
  triggerKeywords: string[];
}

export interface MessageVersion {
  id: string;
  content: string;
  images: string[];
  inlineFiles?: InlineFile[];
  timestamp: number;
  providerId?: string;
}

export interface InlineFile {
  id: string;
  type: 'image' | 'file';
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
  insertPosition: number;
}

export interface AIJSResult {
  success: boolean;
  html?: string;
  type?: 'statusBar' | 'floating' | 'sidebar' | 'greeting' | 'modal' | 'inline' | 'none';
  vars?: Record<string, number | string>;
  errors?: string[];
  height?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images: string[];
  inlineFiles?: InlineFile[];
  /**
   * AI 用 {{ui:img=名字}} 发图时，记录每张图应插入到正文的第几个字符处。
   * 这样表情会显示在「指令原本所在的位置」，而正文本身保持干净
   * （编辑界面看不到任何指令或占位符）。
   */
  inlineImagePositions?: Array<{ uri: string; at: number }>;
  timestamp: number;
  providerId?: string;
  type?: 'text' | 'image' | 'summary';
  isFavorite?: boolean;
  isError?: boolean;
  errorDetail?: string;
  versions?: MessageVersion[];
  currentVersionIndex?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  firstTokenTime?: number;
  totalElapsedTime?: number;
  aijsCode?: string;
  aijsResult?: AIJSResult;
  senderMemberId?: string;
  /** 思考过程（推理内容），来自 reasoning_content / thinking / delta.reasoning */
  thinkingContent?: string;
  /** 编辑态：用户是否正在编辑此消息内容 */
  editing?: boolean;
  /** 自动总结：消息是否已被压缩（构建上下文时会被跳过） */
  isCompressed?: boolean;
  /** 自动总结：本条消息是否是一条压缩总结消息 */
  isCompressedSummary?: boolean;
}

export interface GroupMember {
  id: string;
  characterId?: string;
  name: string;
  avatar?: string;
  settings: ChatSettings;
  isActive: boolean;
  autoRespond: boolean;
  joinOrder: number;
}

// ====== 对话规划（AI 预测本次聊天内容） ======
export interface ConversationPlan {
  /** AI 预测的关键词（几个词） */
  keywords: string[];
  /** AI 预测的几句话（剧情走向/要点） */
  beats: string[];
  /** 场景快照 */
  scene?: string;
  /** 预测时间戳 */
  predictedAt: number;
  /** 基于哪条用户消息做的预测 */
  basedOnUserMessage?: string;
}

/** 对话预测的玩家设置 */
export interface PredictionConfig {
  enabled: boolean;
  /** per_turn=每轮收到用户消息后预测一次；once=一次对话只预测一次 */
  mode: 'per_turn' | 'once';
  /** 用户说一句，AI 最多回复几条 */
  maxMessages: number;
  /** 自定义预测提示词（留空用内置） */
  prompt?: string;
}

/** 外部媒体（AI 申请 / 外部 URL 拉取） */
export interface ExternalMedia {
  url: string;
  type: 'image' | 'video' | 'audio' | 'file';
  name?: string;
  requestedBy?: string; // 申请该媒体的角色 id / 名称
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  worldBookIds: string[];
  settings: ChatSettings;
  wallpaper?: string;
  coverImage?: string;
  coverConfig?: { offsetX: number; offsetY: number; scale: number };
  userAvatar?: string;
  assistantAvatar?: string;
  characterId?: string;
  isPinned?: boolean;
  isFavorite?: boolean;
  statusVars?: Record<string, number | string>;
  parentId?: string;
  conversationType?: 'parent' | 'child' | 'manual' | 'group' | 'group_private';
  scrollPosition?: number;
  groupMembers?: GroupMember[];
  activeMemberId?: string;
  summaries?: string[];
  // 分享卡片相关
  isSharedCard?: boolean;
  cardHideFlags?: {
    systemPrompt?: boolean;
    worldBook?: boolean;
    characterDesc?: boolean;
    characterPersonality?: boolean;
    characterScenario?: boolean;
    author?: boolean;
    css?: boolean;
    regex?: boolean;
    greeting?: boolean;
  };
  extraSystemPrompt?: string; // 额外系统设定（仅分享卡片且有隐藏时可用）
  /**
   * 宏变量存储（可持久化）。
   * 之前 macroService 的变量作用域只是模块内存单例，没有任何地方写入或落盘，
   * 所以 {{setvar}}/{{getvar}} 实际上永远是空的、重启即丢。现在把它们按对话保存下来。
   */
  macroVars?: {
    global?: Record<string, any>;
    chat?: Record<string, any>;
    session?: Record<string, any>;
  };
  /**
   * AI 界面指令累积出的界面状态（换色/装饰/背景/图片）。
   * 由对话历史里的 {{ui:...}} 指令推导；在这里持久化以便备份与分享携带。
   */
  uiState?: {
    bg?: string;
    bgm?: string;
    images?: string[];
    decor?: string;
    theme?: string;
    colors?: Record<string, string>;
  };
  /** 对话规划（AI 预测的本次聊天内容，本段对话内 AI 遵循） */
  conversationPlan?: ConversationPlan;
  /** 预测设置 */
  predictionConfig?: PredictionConfig;
  /** 扮演模式：玩家扮演的角色 id（通讯录「扮演」） */
  playAsCharacterId?: string;
  /** 外部媒体申请列表 */
  externalMedia?: ExternalMedia[];
}

export interface ChatSettings {
  textProviderId?: string;
  textModelId?: string;
  imageProviderId?: string;
  imageModelId?: string;
  visionProviderId?: string;
  visionModelId?: string;
  summaryProviderId?: string;
  summaryModelId?: string;
  memoryLength: number;
  autoSummarize: boolean;
  autoSummarizeThreshold: number;
  streamOutput: boolean;
  maxImagesPerMessage: number;
  sendImagesInContext: boolean;
  imageHistoryCount: number;
  systemPrompt: string;
  userPersona: string;
  prePrompt: string;
  postPrompt: string;
  /** 用户消息的前置词/后置词（AI 输出的前置/后置是 prePrompt/postPrompt） */
  userPrePrompt?: string;
  userPostPrompt?: string;
  summaryPrompt: string;
  imageGenerationPrompt: string;
  autoImageGeneration: boolean;
  statusBar?: StatusBarConfig;
  summaryRestartChance?: number;
  pasteLongTextAsFile?: boolean;
  regexRules?: RegexRule[];
  customCSS?: string;
  globalCSS?: string;
  cssEntries?: CSSEntry[];
  blockWords?: string[];
  suggestedQuestionsEnabled?: boolean;
  greeting?: string;
  greetingEnabled?: boolean;
  userName?: string;
  /** 对话预测设置（玩家可设：开关、AI 最多发送数等） */
  predictionConfig?: PredictionConfig;
  /** 群聊自动推进：用户没说话时，成员自己接着聊 */
  groupAutoAdvance?: {
    enabled: boolean;
    /** 每次用户发言后自动再聊几轮（1~5） */
    rounds: number;
    /** 大于 0 时：即使老师不说话，也每隔这么多秒自动推进一轮（0/未设为不定时） */
    autoIntervalSec?: number;
  };
  /**
   * 「自导模式」：玩家扮演某个角色给自己发消息。
   * 设了角色 id 后，这个对话里发出的消息都会记为「该角色说的」，
   * 并且**不会触发 AI 回复**（方便自己写剧情 / 双开对戏）。
   */
  puppetCharacterId?: string;
}

export interface CSSEntry {
  id: string;
  name: string;
  css: string;
  enabled: boolean;
  scope: 'message' | 'global';
  /**
   * 把它渲染成**一块悬浮窗**，而不是注入样式。
   *
   * 有 widget 的条目不参与全局样式注入，而是在聊天区上叠一个**只有这么大**的
   * 可交互 WebView —— 既能跑 HTML/JS（拖动、滚动、点击插入），又不会盖住聊天列表。
   * 拖动由窗口内 JS 上报位移、RN 侧移动这块区域实现。
   */
  widget?: {
    width?: number;
    height?: number;
    /** 初始位置，默认右上角 */
    anchor?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  };
}

export interface RegexRule {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  scope: 'input' | 'output' | 'both';
  enabled: boolean;
  order: number;
}

export interface QuickCommand {
  id: string;
  name: string;
  content: string;
  order: number;
}

export interface ThemeConfig {
  backgroundColor: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  subTextColor: string;
  inputBgColor: string;
  buttonColor: string;
  buttonTextColor: string;
  menuBgColor: string;
  borderColor: string;
  fontSize: number;
  statusBarSize: number;
  inputBorderRadius?: number;
  inputBorderWidth?: number;
  inputBorderColor?: string;
  inputBorderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  inputFontSize?: number;
  fontFamily?: string;
  buttonBorderRadius?: number;
  buttonBorderWidth?: number;
  buttonBorderColor?: string;
  buttonHasShadow?: boolean;
  buttonGradientColor?: string;
  buttonPattern?: 'rounded' | 'square' | 'pill' | 'outline' | 'shadow' | 'gradient' | 'icon' | 'text';
  bubbleStyle?: 'default' | 'classic_tail' | 'fresh_green' | 'transparent' | string;
  /** 默认背景图片（墙纸）uri，覆盖 backgroundColor */
  wallpaper?: string;
  /** 按钮自定义图标映射：iconKey -> 图片uri */
  buttonIcons?: Record<string, string>;
  /** 开屏画面配置（主题可携带） */
  splash?: {
    backgroundColor?: string;
    image?: string;
    title?: string;
    subtitle?: string;
    showTitle?: boolean;
    animation?: 'fade' | 'scale' | 'slide' | 'none';
    duration?: number;
    resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  };
  /** AI 思考中指示器配置 */
  thinkingIndicator?: {
    text?: string;
    dots?: number;
    dotColor?: string;
    dotSize?: number;
    animation?: 'bounce' | 'pulse' | 'wave' | 'none';
    speed?: number;
    showDots?: boolean;
    showText?: boolean;
  };
  /** 消息气泡自定义颜色 */
  userBubbleColor?: string;
  assistantBubbleColor?: string;
  userBubbleTextColor?: string;
  assistantBubbleTextColor?: string;
  /** 输入框背景图（9-patch 风格，导入自定义图片） */
  inputBackgroundImage?: string;
  /** 输入框背景 9-patch 参数：padding=内容区域，cornerRadius=四角固定区 */
  inputBgNinePatch?: {
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    cornerRadius: number;
    /** 图片透明度 0-1 */
    opacity?: number;
  };
}

export interface ChatDisplaySettings {
  displayMode: 'classic' | 'bubble';
  showAvatar: boolean;
  showMessageWordCount: boolean;
  showTokenUsage: boolean;
  showModelName: boolean;
  showTimestamp: boolean;
  showFirstTokenTime: boolean;
  messageDensity?: number;
  bubbleStyle?: 'default' | 'classic_tail' | 'fresh_green' | 'transparent' | string;
}

export interface ChatFeatureSettings {
  autoCollapseCodeBlocks: boolean;
  autoGenerateChatTitle: boolean;
  spellCheck: boolean;
  markdownRendering: boolean;
  latexRendering: boolean;
  mermaidRendering: boolean;
  injectDefaultMetadata: boolean;
  autoRenderArtifacts: boolean;
  pasteLongTextAsFile: boolean;
}

export interface ContextManagementSettings {
  autoCompress: boolean;
  compressThreshold: number;
}

export interface UserProfile {
  userId: string;
  username: string;
  avatar?: string;
  numberId?: string;
  isOnline?: boolean;
  lastActiveAt?: number;
  createdAt: number;
}

/** 一本独立的通讯录：里面装的角色互不与其它通讯录共享 */
export interface ContactBook {
  id: string;
  name: string;
  /** 收录的角色 id */
  characterIds: string[];
  createdAt: number;
}

export interface ConversationSettings {
  userAvatar?: string;
  userName?: string;
  userId?: string;
  /** 扮演模式：玩家正在扮演的角色 id（通讯录「扮演」），会被持久记忆 */
  playingAsCharacterId?: string;
  /** 多个互相独立的通讯录（不同通讯录的角色不互通） */
  contactBooks?: ContactBook[];
  defaultAssistantAvatar?: string;
  defaultSystemPrompt: string;
  contextMessageLimit: number;
  temperature: number;
  topP: number;
  backgroundImage?: string;
  splashImage?: string;
  splashBackgroundColor?: string;
  /** 夜间模式开屏背景色 */
  splashBackgroundColorDark?: string;
  /** 夜间模式开屏图片 */
  splashImageDark?: string;
  /** 夜间模式开屏标题 */
  splashTitleDark?: string;
  /** 夜间模式开屏副标题 */
  splashSubtitleDark?: string;
  splashResizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  splashAnimation?: 'fade' | 'scale' | 'slide' | 'none';
  splashDuration?: number;
  splashTitle?: string;
  splashSubtitle?: string;
  showSplashTitle?: boolean;
  /** 开屏图片尺寸（dp），默认 200 */
  splashImageSize?: number;
  /** 开屏图片水平偏移（dp，负数左移，正数右移），默认 0 */
  splashImageOffsetX?: number;
  /** 开屏图片垂直偏移（dp，负数上移，正数下移），默认 0 */
  splashImageOffsetY?: number;
  /** 是否使用独立的日间/夜间开屏配置 */
  splashSeparateDark?: boolean;
  streamOutput: boolean;
}

export interface AppSettings {
  userProfile: UserProfile;
  theme: ThemeConfig;
  /** 日间模式独立主题配置（切换日间时加载此主题） */
  themeLight?: ThemeConfig;
  /** 夜间模式独立主题配置（切换夜间时加载此主题） */
  themeDark?: ThemeConfig;
  isDarkMode: boolean;
  baseSystemPrompt: string;
  unifiedPrePrompt: string;
  quickCommands: QuickCommand[];
  webSearchEnabled: boolean;
  webSearchProvider: string;
  webSearchApiKey: string;
  webSearchMaxResults: number;
  conversation: ConversationSettings;
  display: ChatDisplaySettings;
  features: ChatFeatureSettings;
  contextManagement: ContextManagementSettings;
  swipeGesturesEnabled: boolean;
  summaryProviderId?: string;
  summaryModel?: string;
  defaultModel?: string;
  /** 按钮自定义图标映射：iconKey -> image uri（png/jpg/gif/webp 均可）*/
  customButtonIcons?: Record<string, string>;
  /** 「AI思考中」加载占位态自定义 */
  thinkingIndicator?: ThinkingIndicatorConfig;
  /**
   * 自定义用户界面（方案B）。
   * 开启后用用户的 HTML/CSS/JS 渲染主界面，通过 window.Aurora 反向驱动 App。
   * 见《自定义界面书写规则.md》。
   */
  customInterface?: {
    enabled: boolean;
    html: string;
    css: string;
    js: string;
    splashHtml?: string;
    splashCss?: string;
    sidebarHtml?: string;
    sidebarCss?: string;
    floatingHtml?: string;
    floatingCss?: string;
    splashDuration?: number;
    updatedAt?: number;
  };
}

/** AI 输出时的"思考中"占位态自定义配置 */
export interface ThinkingIndicatorConfig {
  /** 自定义文本（默认 "AI 思考中"），可留空只显示图片 */
  text?: string;
  /** 自定义图片/动图 uri，设置后替代默认转圈（png/jpg/gif/webp 均可，动图可播放） */
  imageUri?: string;
  /** 图片宽度，默认 24 */
  imageWidth?: number;
  /** 图片高度，默认 24 */
  imageHeight?: number;
  /** 是否圆角裁剪图片，默认 false */
  imageRound?: boolean;
  /** 字体大小，默认跟随主题 fontSize */
  fontSize?: number;
  /** 字体颜色，默认跟随主题 subTextColor */
  fontColor?: string;
  /** 字体粗细 */
  fontWeight?: 'normal' | 'bold' | '300' | '400' | '500' | '600' | '700';
  /** 字体族 */
  fontFamily?: string;
  /** 是否显示尾部省略号动画，默认 true */
  showDots?: boolean;
  /** 占位态文本相对图片的排列：left 图片在左文字在右 / right / top / bottom，默认 left */
  layout?: 'left' | 'right' | 'top' | 'bottom';
}

export type AIType = 'text' | 'image' | 'vision' | 'summary';

export type FancyWorkType = 'sidebar' | 'greeting' | 'floating' | 'guide' | 'statusBar' | 'custom';

export interface FancyWork {
  id: string;
  name: string;
  type: FancyWorkType;
  html: string;
  css: string;
  js: string;
  description: string;
  isPreset: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FancyWorkTemplate {
  id: string;
  name: string;
  type: FancyWorkType;
  description: string;
  html: string;
  css: string;
  js: string;
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  type: PresetType;
  createdAt: number;
  updatedAt: number;
  isFavorite?: boolean;
  order?: number;
}

export type PresetType = 
  | 'ai_provider'
  | 'model_parameters'
  | 'chat_settings'
  | 'prompt'
  | 'world_book'
  | 'character'
  | 'theme'
  | 'tts';

export interface AIProviderPreset extends Preset {
  type: 'ai_provider';
  providerFormat: ApiFormat;
  baseUrl: string;
  apiKey?: string;
  model: string;
  parameters: ModelParameters;
}

export interface ModelParameters {
  temperature?: number;
  topP?: number;
  topK?: number;
  topA?: number;
  minP?: number;
  typicalP?: number;
  repetitionPenalty?: number;
  repetitionPenaltyRange?: number;
  repetitionPenaltySlope?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxTokens?: number;
  maxContextLength?: number;
  stopSequences?: string[];
  seed?: number;
  mirostat?: number;
  mirostatTau?: number;
  mirostatEta?: number;
  guidanceScale?: number;
  samplerOrder?: string[];
  useDefaultBanos?: boolean;
  banTokens?: string[];
  logitBias?: Record<string, number>;
  stream?: boolean;
  temperatureLast?: boolean;
  dynamicTemp?: boolean;
  dynatempLow?: number;
  dynatempHigh?: number;
  dynatempExponent?: number;
  smoothingFactor?: number;
}

export type PromptCategory = 'persona' | 'system' | 'regex';

export interface PromptPreset extends Preset {
  type: 'prompt';
  category?: PromptCategory;
  systemPrompt?: string;
  jailbreakPrompt?: string;
  personaDescription?: string;
  scenarioPrompt?: string;
  greeting?: string;
  exampleMessages?: string;
  includeCharacterSystemPrompt?: boolean;
  includeWorldBookSystemPrompt?: boolean;
  promptTemplate?: string;
  // 正则相关
  findRegex?: string;
  replaceString?: string;
  isRegexEnabled?: boolean;
  regexScope?: 'input' | 'output' | 'both';
}

export interface ChatExportOptions {
  format: 'json' | 'markdown' | 'txt' | 'html' | 'tavern_json';
  includeSystemMessages?: boolean;
  includeTimestamps?: boolean;
  includeImages?: boolean;
  includeMetadata?: boolean;
  includeCharacterInfo?: boolean;
  includeWorldBookInfo?: boolean;
  messageRange?: 'all' | 'selected' | 'last_n';
  lastNCount?: number;
  selectedMessageIds?: string[];
  fileName?: string;
}

export interface WorldBookScanResult {
  entryId: string;
  matchedKeys: string[];
  matchedPosition: number;
  content: string;
  order: number;
  position: string;
  injectTarget?: 'system_prompt' | 'pre_prompt' | 'post_prompt';
}

export interface WorldBookScannerOptions {
  scanDepth?: number;
  caseSensitive?: boolean;
  useRegex?: boolean;
  matchWholeWord?: boolean;
  positionPriority?: string[];
  maxEntries?: number;
  tokenBudget?: number;
}

// ====== Task 2: Community Resource Library / User Operation Logs (R6 + R9) ======
export type CommunityResourceType = 'character' | 'worldbook' | 'regex' | 'css';
export interface CommunityResourceEntry {
  id: string;
  type: CommunityResourceType;
  resourceId: string;
  source: 'community-purchase' | 'community-download' | 'manual-import' | 'cloud-restore';
  ownerUid?: string | number;
  metadata?: Record<string, any>;
  createdAt: number;
  isCommunityOwned: true;
  /** User-modified flag: if true, cloud sync still uploads this derived resource */
  userModified?: boolean;
}
export type UserLogType = 'import' | 'export' | 'download' | 'purchase' | 'cloud-sync' | 'avatar-change';
export interface UserLogEntry {
  ts: number;
  type: UserLogType;
  target: { kind: string; id: string; name?: string };
  meta?: Record<string, any>;
}
