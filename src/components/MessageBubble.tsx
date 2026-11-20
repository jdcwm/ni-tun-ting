import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Image, ScrollView, ActivityIndicator, Animated, TextInput } from 'react-native';
import { ChatMessage } from '../types';
import { useTheme } from '../hooks/useTheme';
import { parseThinkingContent, isInThinkingState } from '../utils/thinkingUtils';
import { statusVarService } from '../services/statusVarService';
import { fileService } from '../services/fileService';
import { extractSuggestedQuestions } from '../utils/suggestedQuestions';
import {
  IconRefresh, IconCopy, IconEdit, IconMore, IconDown, IconUser, IconAI, IconEye, IconEyeOff, IconCheck,
} from './Icons';
import { MarkdownRenderer } from './MarkdownRenderer';
import { AIJSRenderer } from './AIJSRenderer';
import {
  BubbleSkinConfig, BubbleNinePatch, BubbleFontConfig,
  defaultBubbleSkin, freshGreenSkin, bubbleTransparentSkin,
  getSkinById, applyFontConfig, resolveBubbleColor, bubbleBodyStyle,
} from '../services/bubbleSkins';

const SCREEN_W = Dimensions.get('window').width;
const IMAGE_SIZE = Math.min(110, SCREEN_W * 0.26);

interface MessageBubbleProps {
  message: ChatMessage;
  onLongPress?: () => void;
  onImagePress?: (uri: string) => void;
  onResend?: () => void;
  onRegenerate?: () => void;
  onContinue?: () => void;
  onEdit?: () => void;
  onCopy?: () => void;
  onMore?: () => void;
  onPrevVersion?: () => void;
  onNextVersion?: () => void;
  currentVersion?: number;
  totalVersions?: number;
  versionHistory?: string[];
  providerName?: string;
  senderName?: string;
  wordCount?: number;
  elapsedSeconds?: number;
  isStreaming?: boolean;
  isUser?: boolean;
  avatar?: string;
  displayMode?: 'classic' | 'bubble';
  showAvatar?: boolean;
  showTokenUsage?: boolean;
  showModelName?: boolean;
  showWordCount?: boolean;
  showTimestamp?: boolean;
  showFirstTokenTime?: boolean;
  enableMarkdown?: boolean;
  enableLatex?: boolean;
  enableMermaid?: boolean;
  customCSS?: string;
  suggestedQuestionsEnabled?: boolean;
  onSuggestedQuestion?: (text: string) => void;
  statusVars?: Record<string, number | string>;
  chatTitle?: string;
  messageCount?: number;
  messageIndex?: number;
  onVarUpdate?: (vars: Record<string, number | string>) => void;
  canEdit?: boolean;
  fullWidth?: boolean;
  bubbleStyle?: string;
  bubbleSkin?: BubbleSkinConfig;
  /** 允许用户直接在气泡里编辑消息内容，保存时回调（流式中或完成后均可） */
  allowInlineEdit?: boolean;
  onChangeContent?: (next: string) => void;
  onChangeThinkingContent?: (next: string) => void;
  /** 「AI思考中」占位态自定义配置 */
  thinkingIndicator?: import('../types').ThinkingIndicatorConfig;
}

const MessageBubbleComponent = React.forwardRef(function MessageBubble(
  {
      message,
      onLongPress,
      onImagePress,
      onRegenerate,
      onContinue,
      onEdit,
      onCopy,
      onMore,
      onPrevVersion,
      onNextVersion,
      currentVersion: propsCurrentVersion,
      totalVersions: propsTotalVersions,
      versionHistory,
      providerName,
      senderName,
      wordCount,
      elapsedSeconds,
      isStreaming = false,
      isUser: propsIsUser,
      avatar,
      displayMode = 'bubble',
      showAvatar = true,
      showTokenUsage = false,
      showModelName = false,
      showWordCount = false,
      showTimestamp = false,
      showFirstTokenTime = false,
      enableMarkdown = false,
      enableLatex = false,
      enableMermaid = false,
      customCSS = '',
      suggestedQuestionsEnabled = false,
      onSuggestedQuestion,
      statusVars,
      chatTitle,
      messageCount,
      messageIndex,
      onVarUpdate,
      canEdit = true,
      fullWidth = false,
      bubbleStyle = 'classic',
      bubbleSkin: customSkin,
      allowInlineEdit = true,
      onChangeContent,
      onChangeThinkingContent,
      thinkingIndicator,
    }: MessageBubbleProps,
  ref: any
) {
  const theme = useTheme();
  const isUser = propsIsUser !== undefined ? propsIsUser : message.role === 'user';
  const isSystem = message.role === 'system';
  const isAi = message.role === 'assistant';
  const isError = message.isError === true;

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={[styles.systemText, { color: theme.subTextColor, fontSize: theme.fontSize - 2 }]}>
          {message.content}
        </Text>
      </View>
    );
  }

  // ====== 思考过程合并：优先用显式字段 thinkingContent，若 content 里有 <think></think> 也合并显示 ======
  const parsed = parseThinkingContent(message.content || '');
  const inlineThinking = parsed.thinking;
  const rawContent = parsed.content || (isInThinkingState(message.content || '') ? '' : message.content);
  const mergedThinking = (message.thinkingContent || '') + ((message.thinkingContent && inlineThinking) ? '\n' : '') + inlineThinking;
  const hasThinking = mergedThinking.length > 0;
  const isThinking = isInThinkingState(message.content || '');
  const [showThinking, setShowThinking] = React.useState(hasThinking);

  const strippedContent = rawContent ? statusVarService.stripStatusCommands(rawContent) : '';

  // ====== 消息内容可编辑（流式中/完成后均可） ======
  const [editing, setEditing] = React.useState<boolean>(!!message.editing && allowInlineEdit);
  const [editDraft, setEditDraft] = React.useState<string>(rawContent);
  const [editingThinking, setEditingThinking] = React.useState(false);
  const [thinkingDraft, setThinkingDraft] = React.useState<string>(mergedThinking);

  // 外部 content/thinkingContent 变化时同步 draft
  React.useEffect(() => {
    setEditDraft(rawContent);
  }, [rawContent]);
  React.useEffect(() => {
    setThinkingDraft(mergedThinking);
  }, [mergedThinking]);

  const commitEdit = () => {
    if (!onChangeContent) return;
    onChangeContent(editDraft);
    setEditing(false);
  };
  const commitThinkingEdit = () => {
    if (!onChangeThinkingContent) return;
    onChangeThinkingContent(thinkingDraft);
    setEditingThinking(false);
  };

  const suggested = suggestedQuestionsEnabled && !isUser && !isStreaming && !isThinking
    ? extractSuggestedQuestions(strippedContent)
    : { cleanContent: strippedContent, questions: [] };

  const displayContent = editing ? editDraft : suggested.cleanContent;
  const suggestedQuestions = suggested.questions;
  const hasSuggestedQuestions = !editing && suggestedQuestions.length > 0;

  // 思考指示器动画
  const [dotCount, setDotCount] = React.useState(0);
  React.useEffect(() => {
    if (isStreaming && !displayContent) {
      const interval = setInterval(() => {
        setDotCount((prev) => (prev + 1) % 4);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [isStreaming, displayContent]);

  const [internalVersion, setInternalVersion] = React.useState(propsCurrentVersion ?? 1);
  const effectiveTotalVersions = propsTotalVersions ?? (versionHistory ? versionHistory.length : 1);
  const effectiveCurrentVersion = propsCurrentVersion ?? internalVersion;

  React.useEffect(() => {
    if (propsCurrentVersion !== undefined) {
      setInternalVersion(propsCurrentVersion);
    }
  }, [propsCurrentVersion]);

  const handlePrevVersion = () => {
    if (effectiveCurrentVersion > 1) {
      setInternalVersion((v) => Math.max(1, v - 1));
      onPrevVersion?.();
    }
  };

  const handleNextVersion = () => {
    if (effectiveCurrentVersion < effectiveTotalVersions) {
      setInternalVersion((v) => Math.min(effectiveTotalVersions, v + 1));
      onNextVersion?.();
    }
  };

  // 判断是否显示"思考中"状态：流式且没正文，或内嵌 think 未闭合；只要合并 thinking 有内容就允许显示思考区块
  const isThinkingOrLoading = (isStreaming && !displayContent && !hasThinking) || isThinking;
  // 显式 thinkingContent 存在时也应该显示思考折叠（不只是 loading）
  const thinkingVisible = showThinking && hasThinking;

  const countWords = (text: string): number => {
    if (!text) return 0;
    const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const english = (text.match(/[a-zA-Z]+/g) || []).length;
    return chinese + english;
  };

  const actualWordCount = wordCount ?? countWords(displayContent.replace(/\[文件:[^\]]+\]/g, ''));

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const showActions = ((displayContent?.length > 0 || hasThinking) || (allowInlineEdit && canEdit && onChangeContent)) && !isThinking && !editing;
  const isClassicMode = displayMode === 'classic';

  const effectiveSkin: BubbleSkinConfig = React.useMemo(() => {
    if (customSkin) return customSkin;
    return getSkinById(bubbleStyle || 'default');
  }, [customSkin, bubbleStyle]);

  const isTransparentStyle = bubbleStyle === 'transparent';

  const npUser: BubbleNinePatch = effectiveSkin.user;
  const npAi: BubbleNinePatch = effectiveSkin.ai;
  const npFont: BubbleFontConfig = effectiveSkin.font;
  const npAvatar = effectiveSkin.avatarFrame;

  const bubbleBodyStyle = React.useCallback((np: BubbleNinePatch, isMsgUser: boolean) => {
    const bgColor = resolveBubbleColor(np.backgroundColor, isMsgUser ? theme.accentColor : theme.secondaryColor);
    const style: any = {
      backgroundColor: bgColor,
      paddingTop: np.paddingTop,
      paddingBottom: np.paddingBottom,
      paddingLeft: np.paddingLeft,
      paddingRight: np.paddingRight,
      borderTopLeftRadius: np.cornerRadiusTL,
      borderTopRightRadius: np.cornerRadiusTR,
      borderBottomLeftRadius: np.cornerRadiusBL,
      borderBottomRightRadius: np.cornerRadiusBR,
      borderWidth: np.borderWidth,
      borderColor: np.borderColor,
    };
    if (np.shadow.enabled) {
      style.shadowColor = np.shadow.color || '#000';
      style.shadowOffset = { width: np.shadow.offsetX, height: np.shadow.offsetY };
      style.shadowOpacity = np.shadow.opacity;
      style.shadowRadius = np.shadow.radius;
    }
    return style;
  }, [theme]);

  const renderMetadata = () => {
    const parts: string[] = [];
    if (showWordCount && actualWordCount > 0) {
      parts.push(`${actualWordCount} 字`);
    }
    if (showTokenUsage && message.tokenUsage) {
      parts.push(`${message.tokenUsage.totalTokens} tok`);
    }
    if (showFirstTokenTime && message.firstTokenTime !== undefined && message.firstTokenTime > 0) {
      parts.push(`首字 ${(message.firstTokenTime / 1000).toFixed(1)}s`);
    }
    if (message.totalElapsedTime !== undefined && message.totalElapsedTime > 0 && !isStreaming) {
      parts.push(`耗时 ${(message.totalElapsedTime / 1000).toFixed(1)}s`);
    }
    if (elapsedSeconds !== undefined && elapsedSeconds > 0 && !isStreaming) {
      parts.push(`耗时 ${(elapsedSeconds / 1000).toFixed(1)}s`);
    }
    if (showTimestamp && message.timestamp) {
      parts.push(formatTime(message.timestamp));
    }
    if (senderName) {
      parts.unshift(senderName);
    }
    if (showModelName && providerName) {
      parts.push(providerName);
    }
    if (parts.length === 0) return null;
    return (
      <Text 
        style={[
          styles.metadataText,
          { color: theme.subTextColor, fontSize: 10 },
          !isClassicMode && isUser && styles.metadataTextUser,
        ]} 
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {parts.join(' · ')}
      </Text>
    );
  };

  // 图片较多时最多平铺 12 张，其余折叠成「+N」（不再硬性只显示 6 张）
  const MAX_INLINE_IMAGES = 12;
  const renderImages = () => {
    if (!message.images || message.images.length === 0) return null;
    // 已经作为内联表情渲染过的图不再重复堆到气泡下方
    const inlineUris = new Set((message.inlineFiles || []).map((f) => f.uri));
    const gridImages = message.images.filter((u) => !inlineUris.has(u));
    if (gridImages.length === 0) return null;
    const total = gridImages.length;
    return (
      <View style={[
        styles.imagesContainer,
        isClassicMode && styles.imagesContainerClassic,
      ]}>
        {gridImages.slice(0, MAX_INLINE_IMAGES).map((uri, index) => (
          <TouchableOpacity
            key={index.toString()}
            onPress={() => onImagePress?.(uri)}
            style={styles.imageWrapper}
          >
            <Image source={{ uri }} style={styles.messageImage} />
            {total > MAX_INLINE_IMAGES && index === MAX_INLINE_IMAGES - 1 && (
              <TouchableOpacity style={styles.moreImagesOverlay} onPress={() => onImagePress?.(uri)}>
                <Text style={styles.moreImagesText}>+{total - MAX_INLINE_IMAGES}</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderVersionNav = () => {
    if (!isAi || effectiveTotalVersions <= 1) return null;
    const isFirst = effectiveCurrentVersion <= 1;
    const isLast = effectiveCurrentVersion >= effectiveTotalVersions;
    return (
      <View style={styles.versionNavContainer}>
        <TouchableOpacity
          onPress={handlePrevVersion}
          activeOpacity={0.6}
          disabled={isFirst}
          style={[styles.versionArrowBtn, isFirst && styles.versionArrowDisabled]}
        >
          <View style={[styles.arrowLeft, { borderRightColor: theme.subTextColor }]} />
        </TouchableOpacity>
        <Text style={[styles.versionCounter, { color: theme.subTextColor }]}>
          {effectiveCurrentVersion}/{effectiveTotalVersions}
        </Text>
        <TouchableOpacity
          onPress={handleNextVersion}
          activeOpacity={0.6}
          disabled={isLast}
          style={[styles.versionArrowBtn, isLast && styles.versionArrowDisabled]}
        >
          <View style={[styles.arrowRight, { borderLeftColor: theme.subTextColor }]} />
        </TouchableOpacity>
      </View>
    );
  };

const renderInlineContent = () => {
    const inlineFiles = message.inlineFiles || [];
    const safeDisplay = displayContent || '';
    const EMPTY_PLACEHOLDER = '（空内容）';
    if (inlineFiles.length === 0 && !safeDisplay) {
      // 空内容消息：渲染占位文字（仍可长按操作、继续编辑、删除）
      return (
        <Text
          style={{
            flexWrap: 'wrap',
            fontStyle: 'italic',
            color: (isUser ? theme.buttonTextColor : theme.textColor) + '99',
            fontSize: Math.max(11, (npFont.fontSize ?? theme.fontSize) - 3),
          }}
        >
          {EMPTY_PLACEHOLDER}
        </Text>
      );
    }

    const parsedContent = fileService.parseContentWithFiles(safeDisplay, inlineFiles);
    const { text, files } = parsedContent;

    if (!text && files.length === 0) {
      return (
        <Text
          style={{
            flexWrap: 'wrap',
            fontStyle: 'italic',
            color: (isUser ? theme.buttonTextColor : theme.textColor) + '99',
            fontSize: Math.max(11, (npFont.fontSize ?? theme.fontSize) - 3),
          }}
        >
          {EMPTY_PLACEHOLDER}
        </Text>
      );
    }

    const fontStyle = applyFontConfig(
      { flexWrap: 'wrap' },
      npFont,
      { fontColor: isUser ? theme.buttonTextColor : theme.textColor, fontSize: theme.fontSize }
    );

    // AI 用 {{ui:img=名字}} 发的表情：按记录的位置就地插进正文
    const imgSlots = (message.inlineImagePositions || [])
      .filter((s) => !!s?.uri)
      .slice()
      .sort((a, b) => a.at - b.at);
    if (imgSlots.length > 0 && !editing) {
      const els: React.ReactNode[] = [];
      let cursor = 0;
      imgSlots.forEach((slot, idx) => {
        const at = Math.max(0, Math.min(slot.at, safeDisplay.length));
        if (at > cursor) {
          els.push(
            <Text key={`seg-${idx}`} style={[fontStyle, { flexWrap: 'wrap' }]}>
              {safeDisplay.slice(cursor, at)}
            </Text>
          );
        }
        els.push(
          <TouchableOpacity
            key={`img-${idx}`}
            onPress={() => onImagePress?.(slot.uri)}
            style={styles.inlineImageWrapper}
            activeOpacity={0.85}
          >
            <Image source={{ uri: slot.uri }} style={styles.inlineEmote} />
          </TouchableOpacity>
        );
        cursor = at;
      });
      if (cursor < safeDisplay.length) {
        els.push(
          <Text key="seg-end" style={[fontStyle, { flexWrap: 'wrap' }]}>
            {safeDisplay.slice(cursor)}
          </Text>
        );
      }
      return <View style={styles.inlineContent}>{els}</View>;
    }

    const elements: React.ReactNode[] = [];
    let lastPos = 0;

    files.forEach(({ file, position }) => {
      if (position > lastPos) {
        elements.push(
          <Text key={`text-${lastPos}`} style={[fontStyle, { flexWrap: 'wrap' }]}>
            {text.slice(lastPos, position)}
          </Text>
        );
      }

      elements.push(
        <View key={file.id} style={styles.inlineFileContainer}>
          {file.type === 'image' ? (
            <TouchableOpacity
              onPress={() => onImagePress?.(file.uri)}
              style={styles.inlineImageWrapper}
            >
              <Image source={{ uri: file.uri }} style={styles.inlineImage} />
              <View style={[styles.inlineFileNameBadge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
                <Text style={{ color: '#fff', fontSize: 10 }} numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.inlineFileWrapper, { backgroundColor: theme.inputBgColor }]}>
              <Text style={{ fontSize: 20, marginRight: 8 }}>
                {fileService.getFileIcon(file.mimeType || '')}
              </Text>
              <View style={styles.inlineFileInfo}>
                <Text style={{ color: isUser ? theme.buttonTextColor : theme.textColor, fontSize: theme.fontSize - 1, fontWeight: '500' }} numberOfLines={1}>
                  {file.name}
                </Text>
                {file.size && (
                  <Text style={{ color: theme.subTextColor, fontSize: 10 }}>
                    {fileService.formatFileSize(file.size)}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      );

      lastPos = position;
    });

    if (lastPos < text.length) {
      elements.push(
        <Text key={`text-${lastPos}-end`} style={[fontStyle, { flexWrap: 'wrap' }]}>
          {text.slice(lastPos)}
        </Text>
      );
    }

    return <View style={styles.inlineContent}>{elements}</View>;
  };

  return (
    <View
      style={[
        styles.container,
        isClassicMode && styles.containerClassic,
        !isClassicMode && isUser && styles.userContainer,
        !isClassicMode && isAi && styles.aiContainer,
        fullWidth && { maxWidth: '100%', width: '100%' },
      ]}
    >
      {renderImages()}

      <View style={[
        styles.bubbleRow,
        isClassicMode && styles.bubbleRowClassic,
        !isClassicMode && isUser && styles.bubbleRowUser,
        fullWidth && styles.bubbleRowFullWidth,
      ]}>
        {showAvatar && (
          <View style={[
            styles.avatarFrame,
            npAvatar.enabled && {
              borderWidth: npAvatar.borderWidth,
              borderColor: npAvatar.borderColor,
              borderRadius: npAvatar.shape === 'circle' ? 21 : npAvatar.shape === 'rounded' ? (npAvatar.borderRadius || 8) : 2,
              ...(npAvatar.shadowEnabled && {
                shadowColor: npAvatar.shadowColor || '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.25,
                shadowRadius: 2,
              }),
            },
          ]}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: isUser ? theme.accentColor : theme.secondaryColor }]}>
                {senderName ? (
                  <Text style={[styles.avatarLetter, { color: isUser ? theme.buttonTextColor : theme.textColor }]}>
                    {senderName.charAt(0).toUpperCase()}
                  </Text>
                ) : isUser ? (
                  <IconUser size={20} color={isUser ? theme.buttonTextColor : theme.textColor} />
                ) : (
                  <IconAI size={20} color={isUser ? theme.buttonTextColor : theme.textColor} />
                )}
              </View>
            )}
          </View>
        )}

        <View style={[
          styles.contentColumn,
          isClassicMode && styles.contentColumnClassic,
          !showAvatar && styles.contentColumnNoAvatar,
          fullWidth && styles.contentColumnFullWidth,
        ]}>
          {(displayContent || (message.inlineFiles && message.inlineFiles.length > 0) || hasThinking || isStreaming || isThinkingOrLoading || editing) ? (
            <View style={{ overflow: 'visible' }}>
              {/* ====== 思考过程（推理内容）折叠区 ====== */}
              {hasThinking ? (
                <View
                  style={[
                    styles.thinkingBlock,
                    {
                      backgroundColor: isUser ? theme.accentColor + '18' : theme.secondaryColor,
                      borderColor: theme.borderColor,
                      marginBottom: 8,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.subTextColor }}>
                        💡 思考过程 {thinkingVisible ? '' : `(${Math.ceil((mergedThinking || '').replace(/\s/g, '').length)}字)`}
                      </Text>
                      {isStreaming ? (
                        <ActivityIndicator size="small" color={theme.accentColor} />
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {!editingThinking && onChangeThinkingContent && (
                        <TouchableOpacity
                          style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                          onPress={() => {
                            setThinkingDraft(mergedThinking);
                            setEditingThinking(true);
                          }}
                        >
                          <IconEdit size={14} color={theme.subTextColor} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                        onPress={() => setShowThinking((v) => !v)}
                      >
                        {thinkingVisible ? (
                          <IconEyeOff size={16} color={theme.subTextColor} />
                        ) : (
                          <IconEye size={16} color={theme.subTextColor} />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {thinkingVisible ? (
                    editingThinking ? (
                      <View style={{ marginTop: 8 }}>
                        <TextInput
                          multiline
                          value={thinkingDraft}
                          onChangeText={setThinkingDraft}
                          style={[
                            styles.editorInput,
                            {
                              backgroundColor: theme.inputBgColor,
                              borderColor: theme.borderColor,
                              color: theme.textColor,
                              minHeight: 140,
                            },
                          ]}
                          placeholder="编辑思考过程..."
                          placeholderTextColor={theme.subTextColor}
                          textAlignVertical="top"
                        />
                        <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setThinkingDraft(mergedThinking);
                              setEditingThinking(false);
                            }}
                            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.secondaryColor }}
                          >
                            <Text style={{ color: theme.textColor, fontSize: 13 }}>取消</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={commitThinkingEdit}
                            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.accentColor, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          >
                            <IconCheck size={14} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 13 }}>保存</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View style={{ marginTop: 8 }}>
                        <ScrollView
                          nestedScrollEnabled
                          style={[styles.thinkingScroll, { maxHeight: Math.min(320, 60 + 16 * Math.ceil((mergedThinking || '').length / 40)) }]}
                        >
                          <Text
                            style={[
                              styles.thinkingText,
                              { color: theme.subTextColor, fontSize: theme.fontSize - 1 },
                            ]}
                          >
                            {mergedThinking}
                          </Text>
                        </ScrollView>
                      </View>
                    )
                  ) : null}
                </View>
              ) : null}

              <View
                style={[
                  styles.bubble,
                  !isClassicMode && isUser && styles.bubbleUser,
                  !isClassicMode && isAi && styles.bubbleAi,
                  isError && styles.errorBubble,
                  !isError && bubbleBodyStyle(isUser ? npUser : npAi, isUser),
                  isError && { borderRadius: 12, borderWidth: 1, borderColor: '#ef4444' },
                  fullWidth && styles.bubbleFullWidth,
                ]}
              >
                {isThinkingOrLoading ? (
                  (() => {
                    const cfg = thinkingIndicator || {};
                    const indText = cfg.text !== undefined ? cfg.text : 'AI 思考中';
                    const indFontSize = cfg.fontSize ?? theme.fontSize;
                    const indFontColor = cfg.fontColor ?? theme.subTextColor;
                    const indFontWeight = cfg.fontWeight ?? '500';
                    const indFontFamily = cfg.fontFamily;
                    const showDots = cfg.showDots !== false;
                    const imgUri = cfg.imageUri;
                    const imgW = cfg.imageWidth ?? 24;
                    const imgH = cfg.imageHeight ?? 24;
                    const imgRound = !!cfg.imageRound;
                    const layout = cfg.layout || 'left';
                    const isVertical = layout === 'top' || layout === 'bottom';

                    const imgEl = imgUri ? (
                      <Image
                        source={{ uri: imgUri }}
                        style={{
                          width: imgW,
                          height: imgH,
                          borderRadius: imgRound ? Math.min(imgW, imgH) / 2 : 0,
                        }}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <ActivityIndicator size="small" color={indFontColor} style={{ marginHorizontal: isVertical ? 0 : 6, marginVertical: isVertical ? 6 : 0 }} />
                    );

                    const textEl = indText ? (
                      <Text style={{
                        color: indFontColor,
                        fontSize: indFontSize,
                        fontWeight: indFontWeight,
                        fontFamily: indFontFamily,
                      }}>
                        {indText}
                      </Text>
                    ) : null;

                    const dotsEl = showDots ? (
                      <Text style={{ color: indFontColor, fontSize: indFontSize, opacity: 0.7, fontFamily: indFontFamily }}>
                        {'.'.repeat(dotCount)}
                      </Text>
                    ) : null;

                    return (
                      <View style={{
                        flexDirection: isVertical ? 'column' : 'row',
                        alignItems: 'center',
                        justifyContent: layout === 'right' ? 'flex-end' : (layout === 'bottom' ? 'flex-end' : 'flex-start'),
                        paddingVertical: 6,
                        paddingHorizontal: 4,
                      }}>
                        {layout === 'left' || layout === 'top' ? (
                          <>
                            {imgEl}
                            {textEl}
                            {dotsEl}
                          </>
                        ) : (
                          <>
                            {textEl}
                            {dotsEl}
                            {imgEl}
                          </>
                        )}
                      </View>
                    );
                  })()
              ) : editing ? (
                <View style={{ paddingVertical: 2 }}>
                  <TextInput
                    multiline
                    value={editDraft}
                    onChangeText={setEditDraft}
                    style={[
                      styles.editorInput,
                      {
                        backgroundColor: theme.inputBgColor,
                        borderColor: theme.borderColor,
                        color: isUser ? theme.buttonTextColor : theme.textColor,
                        minHeight: 72,
                      },
                    ]}
                    placeholder="编辑消息内容..."
                    placeholderTextColor={theme.subTextColor}
                    textAlignVertical="top"
                  />
                  <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditDraft(rawContent);
                        setEditing(false);
                      }}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.secondaryColor }}
                    >
                      <Text style={{ color: theme.textColor, fontSize: 13 }}>取消</Text>
                    </TouchableOpacity>
                    {onChangeContent ? (
                      <TouchableOpacity
                        onPress={commitEdit}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.accentColor, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      >
                        <IconCheck size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 13 }}>保存</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ) : enableMarkdown && !isUser && !isStreaming && !message.inlineFiles?.length && !(message.inlineImagePositions?.length) && !isError ? (
                <MarkdownRenderer
                  content={displayContent}
                  fontSize={npFont.fontSize || theme.fontSize}
                  enableMarkdown={enableMarkdown}
                  enableLatex={enableLatex}
                  enableMermaid={enableMermaid}
                  isUser={false}
                  customCSS={customCSS}
                  messageId={message.id}
                  fontFamily={npFont.fontFamily}
                  fontColor={npFont.color}
                  fontWeight={(npFont.fontWeight as 'normal' | 'bold' | '300' | '400' | '500' | '600' | '700')}
                />
              ) : (
                renderInlineContent()
              )}
              {isError && onRegenerate && (
                <TouchableOpacity
                  style={styles.errorRetryBtn}
                  onPress={onRegenerate}
                  activeOpacity={0.7}
                >
                  <IconRefresh size={16} color="#ef4444" />
                  <Text style={styles.errorRetryText}>重试</Text>
                </TouchableOpacity>
              )}
            </View>
            </View>
          ) : null}

          {renderMetadata()}

          {hasSuggestedQuestions && onSuggestedQuestion && (
            <View style={[styles.suggestedContainer, !isClassicMode && isUser && styles.suggestedContainerUser]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestedScrollContent}
              >
                {suggestedQuestions.map((q, idx) => (
                  <TouchableOpacity
                    key={idx.toString()}
                    style={[styles.suggestedBtn, { backgroundColor: theme.secondaryColor, borderColor: theme.accentColor + '60' }]}
                    onPress={() => onSuggestedQuestion(q.text)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.suggestedBtnText, { color: theme.textColor }]} numberOfLines={1}>
                      {q.text}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 底部信息栏：消息序号 + token消耗 + 操作按钮 */}
          {!isStreaming && (
            <View style={[styles.bottomBar, !isClassicMode && isUser && styles.bottomBarUser]}>
              {/* 消息序号 */}
              {messageIndex !== undefined && (
                <Text style={[styles.messageIndex, { color: theme.subTextColor }]}>
                  #{messageIndex + 1}
                </Text>
              )}

              {/* Token消耗信息 */}
              {message.tokenUsage && message.tokenUsage.totalTokens > 0 && (
                <Text style={[styles.tokenInfo, { color: theme.subTextColor }]}>
                  {message.tokenUsage.totalTokens} tok
                </Text>
              )}

              {/* 操作按钮 */}
              {showActions && (
                <View style={styles.bottomBarButtons}>
                  {onContinue && (
                    <TouchableOpacity onPress={onContinue} activeOpacity={0.6} style={styles.bottomBtn}>
                      <IconDown size={14} color={theme.subTextColor} />
                    </TouchableOpacity>
                  )}
                  {onRegenerate && (
                    <TouchableOpacity onPress={onRegenerate} activeOpacity={0.6} style={styles.bottomBtn}>
                      <IconRefresh size={14} color={theme.subTextColor} />
                    </TouchableOpacity>
                  )}
                  {(onEdit || (allowInlineEdit && onChangeContent)) && canEdit && (
                    <TouchableOpacity onPress={() => {
                      if (allowInlineEdit && onChangeContent) {
                        setEditDraft(rawContent);
                        setEditing(true);
                      } else {
                        onEdit?.();
                      }
                    }} activeOpacity={0.6} style={styles.bottomBtn}>
                      <IconEdit size={14} color={theme.subTextColor} />
                    </TouchableOpacity>
                  )}
                  {onCopy && (
                    <TouchableOpacity onPress={onCopy} activeOpacity={0.6} style={styles.bottomBtn}>
                      <IconCopy size={14} color={theme.subTextColor} />
                    </TouchableOpacity>
                  )}
                  {onMore && (
                    <TouchableOpacity onPress={onMore} activeOpacity={0.6} style={styles.bottomBtn}>
                      <IconMore size={14} color={theme.subTextColor} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* 版本导航：独立一行，居左（避免与操作按钮挤在一起误触） */}
          {!isStreaming && (
            <View style={styles.versionNavRow}>
              {renderVersionNav()}
            </View>
          )}

          {message.aijsCode && (
            <View style={styles.aijsContainer}>
              <AIJSRenderer
                code={message.aijsCode}
                statusVars={statusVars || {}}
                chatTitle={chatTitle}
                messageCount={messageCount || 0}
                onVarUpdate={onVarUpdate}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

// statusVars / Record 浅比较：键值相等即认为相同，避免父组件临时对象触发误判
function shallowRecordEqual(
  a: Record<string, number | string> | undefined,
  b: Record<string, number | string> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

// 自定义比较函数：忽略回调引用（renderItem 中每次新建闭包会导致全量重渲染）
// 只比较影响视觉输出的 props；非流式消息 id 相同 + message 引用相同即可跳过
function arePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  // message 身份不同：必须重渲染
  if (prev.message.id !== next.message.id) return false;

  // 流式消息：比较内容值而非引用（流式期间通过 mutations 更新）
  if (next.isStreaming || prev.isStreaming) {
    const streamingSame =
      prev.isStreaming === next.isStreaming &&
      prev.message.content === next.message.content &&
      prev.message.thinkingContent === next.message.thinkingContent &&
      prev.message.isError === next.message.isError &&
      prev.message.firstTokenTime === next.message.firstTokenTime &&
      prev.message.totalElapsedTime === next.message.totalElapsedTime &&
      prev.message.tokenUsage?.promptTokens === next.message.tokenUsage?.promptTokens &&
      prev.message.tokenUsage?.completionTokens === next.message.tokenUsage?.completionTokens;
    if (!streamingSame) return false;
  } else {
    // 非流式：message 引用没变化即可认为消息体相同（其他字段同下对比）
    if (prev.message !== next.message) return false;
  }

  // 外观类：枚举相等
  if (prev.avatar !== next.avatar) return false;
  if (prev.displayMode !== next.displayMode) return false;
  if (prev.showAvatar !== next.showAvatar) return false;
  if (prev.showTokenUsage !== next.showTokenUsage) return false;
  if (prev.showModelName !== next.showModelName) return false;
  if (prev.showWordCount !== next.showWordCount) return false;
  if (prev.showTimestamp !== next.showTimestamp) return false;
  if (prev.showFirstTokenTime !== next.showFirstTokenTime) return false;
  if (prev.enableMarkdown !== next.enableMarkdown) return false;
  if (prev.enableLatex !== next.enableLatex) return false;
  if (prev.enableMermaid !== next.enableMermaid) return false;
  if (prev.suggestedQuestionsEnabled !== next.suggestedQuestionsEnabled) return false;
  if (prev.chatTitle !== next.chatTitle) return false;
  if (prev.messageCount !== next.messageCount) return false;
  if (prev.fullWidth !== next.fullWidth) return false;
  if (prev.isUser !== next.isUser) return false;
  if (prev.providerName !== next.providerName) return false;
  if (prev.senderName !== next.senderName) return false;
  if (prev.bubbleStyle !== next.bubbleStyle) return false;
  if (prev.bubbleSkin !== next.bubbleSkin) return false;
  if (prev.elapsedSeconds !== next.elapsedSeconds) return false;
  if (prev.currentVersion !== next.currentVersion) return false;
  if (prev.totalVersions !== next.totalVersions) return false;
  if (prev.versionHistory !== next.versionHistory) return false;
  if (prev.thinkingIndicator !== next.thinkingIndicator) return false;
  if (prev.messageIndex !== next.messageIndex) return false;
  if (prev.wordCount !== next.wordCount) return false;
  if (prev.canEdit !== next.canEdit) return false;
  if (prev.allowInlineEdit !== next.allowInlineEdit) return false;

  // customCSS 为字符串：直接比较；statusVars 浅比较避免临时对象误判
  if (prev.customCSS !== next.customCSS) return false;
  if (!shallowRecordEqual(prev.statusVars, next.statusVars)) return false;

  // 回调函数：全部忽略。闭包由父组件在 renderItem 中创建，每次 render 都变，
  // 但实际行为绑定 messageId，只要 message.id 没变就不会出错。
  return true;
}

export const MessageBubble = React.memo(MessageBubbleComponent, arePropsEqual);

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    maxWidth: '100%',
    width: '100%',
  },
  containerClassic: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
    maxWidth: '100%',
    width: '100%',
  },
  userContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  aiContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  aijsContainer: {
    marginTop: 8,
    alignSelf: 'center',
    width: SCREEN_W - 32,
  },
  systemContainer: {
    alignSelf: 'center',
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  systemText: {
    textAlign: 'center',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bubbleRowFullWidth: {
    width: '100%',
  },
  bubbleRowClassic: {
    flexDirection: 'row',
    width: '100%',
  },
  bubbleRowUser: {
    flexDirection: 'row-reverse',
  },
  contentColumn: {
    flexShrink: 1,
    minWidth: 0,
  },
  contentColumnClassic: {
    flex: 1,
  },
  contentColumnFullWidth: {
    flex: 1,
    width: '100%',
  },
  contentColumnNoAvatar: {
    paddingHorizontal: 8,
  },
  thinkingBlock: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  thinkingScroll: {
    borderRadius: 8,
  },
  thinkingText: {
    lineHeight: 20,
    opacity: 0.95,
  },
  editorInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    lineHeight: 22,
  },
  suggestedContainer: {
    marginTop: 8,
    width: '100%',
  },
  suggestedContainerUser: {
    alignItems: 'flex-end',
  },
  suggestedScrollContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestedBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestedBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  avatarFrame: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarLetter: {
    fontSize: 17,
    fontWeight: '700',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '95%',
    width: '100%',
    minHeight: 36,
  },
  bubbleFullWidth: {
    maxWidth: '100%',
    width: '100%',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
  },
  bubbleAi: {
    alignSelf: 'flex-start',
  },
  errorBubble: {
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  errorRetryText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  metadataText: {
    fontSize: 10,
    marginTop: 4,
    marginLeft: 4,
    marginRight: 4,
    color: '#999',
  },
  metadataTextUser: {
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginLeft: 4,
    marginRight: 4,
    gap: 6,
    flexWrap: 'wrap',
    width: '100%',
    maxWidth: '100%',
  },
  actionRowUser: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // 底部信息栏样式
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 8,
    width: '100%',
    maxWidth: '100%',
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
  },
  bottomBarUser: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  messageIndex: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 4,
  },
  tokenInfo: {
    fontSize: 10,
    marginRight: 4,
  },
  bottomBarButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  bottomBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  imagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
    gap: 4,
    maxWidth: SCREEN_W * 0.75,
  },
  imagesContainerClassic: {
    marginLeft: 44,
  },
  imageWrapper: {
    position: 'relative',
  },
  messageImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 10,
    backgroundColor: '#0f3460',
  },
  moreImagesOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreImagesText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  inlineContent: {
    flexDirection: 'column',
    gap: 8,
  },
  inlineFileContainer: {
    width: '100%',
    marginVertical: 4,
  },
  inlineImageWrapper: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
  },
  // AI 发表情包时用的小尺寸（像聊天里的贴纸，不要占满整行）
  inlineEmote: {
    width: 132,
    height: 132,
    resizeMode: 'contain',
  },
  inlineImage: {
    width: '100%',
    maxHeight: 200,
    resizeMode: 'contain',
  },
  inlineFileNameBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inlineFileWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
  },
  inlineFileInfo: {
    flex: 1,
    minWidth: 0,
  },
  versionNavContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  versionNavRow: {
    width: '100%',
    alignItems: 'flex-start',
  },
  versionArrowBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  versionArrowDisabled: {
    opacity: 0.3,
  },
  versionCounter: {
    fontSize: 11,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'center',
    color: '#666',
  },
  arrowLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderRightWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  arrowRight: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});
