import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  ScrollView,
  Image,
  ImageBackground,
  Modal,
  FlatList,
  Alert,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { AIProvider, QuickCommand, AIType, InlineFile } from '../types';
import { useApp } from '../context/AppContext';
import { imageUtils } from '../utils/imageUtils';
import { ImagePreviewModal } from './ImagePreviewModal';
import {
  IconSearch, IconChat, IconPaint, IconImage,
  IconBolt, IconSend, IconPlus,
} from './Icons';
import { MessageActionSheet, MessageAction } from './MessageActionSheet';
import { fileService } from '../services/fileService';

interface ChatInputProps {
  onSend: (text: string, images: string[], type: 'text' | 'image') => void;
  onSendWithFiles?: (text: string, images: string[], inlineFiles: InlineFile[], type: 'text' | 'image') => void;
  onImageAdd?: () => void;
  onAddFile?: () => void;
  onWebSearchToggle?: (enabled: boolean) => void;
  /** 群聊：让成员自己接着聊一轮（不依赖用户发言） */
  onContinueChat?: () => void;
  /**
   * 一次性外部插入文本（例如点「地点悬浮窗」里的地点名）。
   * 收到后追加到输入框，并立刻回调 onInsertConsumed 清掉，避免重复插入。
   */
  insertText?: string | null;
  onInsertConsumed?: () => void;
  showContinueChat?: boolean;
  continueChatBusy?: boolean;
  webSearchEnabled: boolean;
  selectedTextProvider?: AIProvider;
  selectedImageProvider?: AIProvider;
  selectedVisionProvider?: AIProvider;
  selectedSummaryProvider?: AIProvider;
  onSelectProvider: (type: AIType, provider: AIProvider) => void;
  onOpenModelSelector?: (type: AIType) => void;
  quickCommands: QuickCommand[];
  maxImages?: number;
  placeholder?: string;
  pasteLongTextAsFile?: boolean;
  onInputFocus?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  onSendWithFiles,
  onImageAdd,
  onAddFile,
  onWebSearchToggle,
  onContinueChat,
  showContinueChat,
  continueChatBusy,
  insertText,
  onInsertConsumed,
  webSearchEnabled,
  selectedTextProvider,
  selectedImageProvider,
  selectedVisionProvider,
  selectedSummaryProvider,
  quickCommands,
  onSelectProvider,
  onOpenModelSelector,
  maxImages = 9,
  placeholder,
  pasteLongTextAsFile = false,
  onInputFocus,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { providers } = useApp();
  const [text, setText] = useState('');

  // 外部（内置 CSS 悬浮窗等）一次性插入文本：追加到输入框并立即消费掉
  useEffect(() => {
    if (!insertText) return;
    setText((prev) => prev + insertText);
    onInsertConsumed?.();
  }, [insertText, onInsertConsumed]);
  const [images, setImages] = useState<string[]>([]);
  const [inlineFiles, setInlineFiles] = useState<InlineFile[]>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [showProviderSelector, setShowProviderSelector] = useState(false);
  const [providerType, setProviderType] = useState<AIType>('text');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const textInputRef = useRef<TextInput>(null);
  const lastTextLengthRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleTextChange = async (newText: string) => {
    if (pasteLongTextAsFile && newText.length > lastTextLengthRef.current + 500) {
      const pastedText = newText.slice(lastTextLengthRef.current);
      if (pastedText.length > 500) {
        try {
          const fileName = `粘贴文本_${Date.now()}.txt`;
          const fileUri = await fileService.saveTextFile(pastedText, fileName);
          const newFile: InlineFile = {
            id: Date.now().toString(),
            type: 'file',
            name: fileName,
            uri: fileUri,
            mimeType: 'text/plain',
            size: pastedText.length,
            insertPosition: lastTextLengthRef.current,
          };
          setInlineFiles([...inlineFiles, newFile]);
          setText(newText.slice(0, lastTextLengthRef.current));
          lastTextLengthRef.current = lastTextLengthRef.current;
          return;
        } catch (e) {
          console.error('保存粘贴文本失败:', e);
        }
      }
    }
    setText(newText);
    lastTextLengthRef.current = newText.length;
  };

  const handleSend = () => {
    if (text.trim() || images.length > 0 || inlineFiles.length > 0) {
      if (onSendWithFiles) {
        onSendWithFiles(text.trim(), images, inlineFiles, 'text');
      } else {
        onSend(text.trim(), images, 'text');
      }
      setText('');
      setImages([]);
      setInlineFiles([]);
      setShowCommands(false);
    }
  };

  const handleGenerateImage = () => {
    if (!text.trim()) {
      Alert.alert('提示', '请输入生图提示词');
      return;
    }
    onSend(text.trim(), [], 'image');
    setText('');
    setShowCommands(false);
  };

  const handleCommandPress = (command: QuickCommand) => {
    setText(command.content);
    setShowCommands(false);
  };

  const openProviderSelector = (type: AIType) => {
    if (onOpenModelSelector) {
      onOpenModelSelector(type);
    } else {
      setProviderType(type);
      setShowProviderSelector(true);
    }
  };

  const handleSelectProvider = (provider: AIProvider) => {
    onSelectProvider(providerType, provider);
    setShowProviderSelector(false);
  };

  const pickImages = async () => {
    Alert.alert('添加图片', '选择来源', [
      { text: '取消', style: 'cancel' },
      {
        text: '相册',
        onPress: async () => {
          const remaining = maxImages - images.length;
          if (remaining <= 0) {
            Alert.alert('提示', `最多只能添加${maxImages}张图片`);
            return;
          }
          const picked = await imageUtils.pickMultipleImages(remaining);
          const saved: string[] = [];
          for (const uri of picked) {
            const savedUri = await imageUtils.saveImageToAppDir(uri, 'chat');
            saved.push(savedUri);
          }
          setImages([...images, ...saved]);
        },
      },
      {
        text: '拍照',
        onPress: async () => {
          const remaining = maxImages - images.length;
          if (remaining <= 0) {
            Alert.alert('提示', `最多只能添加${maxImages}张图片`);
            return;
          }
          const uri = await imageUtils.takePhoto();
          if (uri) {
            const savedUri = await imageUtils.saveImageToAppDir(uri, 'chat');
            setImages([...images, savedUri]);
          }
        },
      },
    ]);
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const importFile = async () => {
    const file = await fileService.importFileFromDevice();
    if (file) {
      const position = text.length;
      const result = fileService.insertFileIntoContent(text, file, position);
      setText(result.content);
      setInlineFiles([...inlineFiles, result.file]);
    }
  };

  const typeLabels: Record<string, string> = {
    text: '对话',
    image: '生图',
    vision: '识图',
    summary: '总结',
    function_calling: '函数',
    streaming: '流式',
    reasoning: '推理',
    audio: '音频',
  };

  const getProvidersByCapability = (cap: AIType) =>
    providers.filter((p) => p.capabilities.includes(cap));

  const getCurrentProviderName = (type: AIType) => {
    switch (type) {
      case 'text': return selectedTextProvider?.name;
      case 'image': return selectedImageProvider?.name;
      case 'vision': return selectedVisionProvider?.name;
      default: return undefined;
    }
  };

  const providerList = getProvidersByCapability(providerType);
  const favoriteProviders = providerList.filter((p) => p.isFavorite);
  const otherProviders = providerList.filter((p) => !p.isFavorite);

  // 计算底部间距（紧贴导航栏，不额外留白）：
  // - 键盘弹出时：使用键盘高度
  // - 键盘未弹出时：使用系统安全区域 bottom inset，保证紧贴导航栏/手势条上方
  //   iOS = 交给 SafeAreaView edges={['bottom']} 处理
  const bottomPadding = Platform.OS === 'android'
    ? Math.max(insets.bottom, 0)
    : 0;

  // iOS 使用 SafeAreaView 只含 edges:bottom 保证紧贴 home indicator；Android 使用 View + 显式 padding
  const OuterContainer: any = Platform.OS === 'ios' ? SafeAreaView : View;
  const outerEdges = Platform.OS === 'ios' ? { edges: ['bottom'] as const } : undefined;

  return (
    <OuterContainer
      {...outerEdges}
      style={[
        styles.container,
        {
          backgroundColor: theme.inputBgColor,
          paddingBottom: bottomPadding,
        },
      ]}>
      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
          {images.map((uri, index) => (
            <View key={index} style={styles.imageWrapper}>
              <TouchableOpacity onPress={() => setPreviewImage(uri)}>
                <Image source={{ uri }} style={styles.inputImage} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.removeImageBtn, { backgroundColor: theme.accentColor }]}
                onPress={() => removeImage(index)}
              >
                <Text style={{ color: '#fff', fontSize: 12 }}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputWrapper}>
          {(() => {
            const hasBg = !!theme.inputBackgroundImage;
            const np = theme.inputBgNinePatch || { paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 12, cornerRadius: 12, opacity: 1 };
            const boxStyle = hasBg
              ? {
                  backgroundColor: 'transparent' as const,
                  borderRadius: np.cornerRadius,
                  paddingTop: np.paddingTop,
                  paddingBottom: np.paddingBottom,
                  paddingLeft: np.paddingLeft,
                  paddingRight: np.paddingRight,
                  overflow: 'hidden' as const,
                }
              : { backgroundColor: theme.backgroundColor };
            const Box: any = hasBg ? ImageBackground : View;
            const boxProps: any = hasBg
              ? {
                  source: { uri: theme.inputBackgroundImage },
                  imageStyle: { borderRadius: np.cornerRadius, opacity: np.opacity ?? 1 },
                  resizeMode: 'cover' as const,
                }
              : {};
            return (
              <Box {...boxProps} style={[styles.inputBox, boxStyle]}>
                <View style={styles.topRow}>
              <TouchableOpacity
                style={[
                  styles.pillButton,
                  { backgroundColor: webSearchEnabled ? theme.accentColor : theme.secondaryColor },
                ]}
                onPress={() => onWebSearchToggle?.(!webSearchEnabled)}
                activeOpacity={0.7}
              >
                <IconSearch size={13} color={webSearchEnabled ? theme.buttonTextColor : theme.subTextColor} />
                <Text style={{ color: webSearchEnabled ? theme.buttonTextColor : theme.subTextColor, fontSize: 11, marginLeft: 3 }}>
                  联网
                </Text>
              </TouchableOpacity>

              {showContinueChat ? (
                <TouchableOpacity
                  style={[
                    styles.pillButton,
                    { backgroundColor: theme.accentColor, opacity: continueChatBusy ? 0.5 : 1 },
                  ]}
                  onPress={() => {
                    if (!continueChatBusy) onContinueChat?.();
                  }}
                  disabled={continueChatBusy}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: theme.buttonTextColor, fontSize: 11, fontWeight: '600' }}>
                    ▶ 继续聊
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.pillButton, { backgroundColor: theme.secondaryColor }]}
                onPress={() => openProviderSelector('text')}
                activeOpacity={0.7}
              >
                <IconChat size={13} color={theme.subTextColor} />
                <Text style={{ color: theme.textColor, fontSize: 11, marginLeft: 3, maxWidth: 70 }} numberOfLines={1}>
                  {getCurrentProviderName('text') || '选AI'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pillButton, { backgroundColor: theme.secondaryColor }]}
                onPress={() => openProviderSelector('image')}
                activeOpacity={0.7}
              >
                <IconPaint size={13} color={theme.subTextColor} />
                <Text style={{ color: theme.textColor, fontSize: 11, marginLeft: 3, maxWidth: 55 }} numberOfLines={1}>
                  {getCurrentProviderName('image') || '生图'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputRow}>
              <TouchableOpacity
                style={[styles.commandButton, { backgroundColor: theme.secondaryColor }]}
                onPress={() => setShowCommands(!showCommands)}
                activeOpacity={0.7}
              >
                <IconBolt size={16} color={showCommands ? theme.accentColor : theme.subTextColor} />
              </TouchableOpacity>

              <TextInput
                ref={textInputRef}
                style={[
                  styles.input,
                  {
                    color: theme.textColor,
                    fontSize: theme.fontSize,
                    textAlignVertical: 'center',
                  },
                ]}
                value={text}
                onChangeText={handleTextChange}
                onFocus={() => { onInputFocus?.(); }}
                placeholder={placeholder || '输入消息...'}
                placeholderTextColor={theme.subTextColor}
                multiline
                scrollEnabled={false}
                autoFocus={false}
                keyboardAppearance="dark"
                returnKeyType="send"
                enablesReturnKeyAutomatically
                disableFullscreenUI
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
              />

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: (text.trim() || images.length > 0 || inlineFiles.length > 0) ? theme.buttonColor : theme.secondaryColor,
                    opacity: (text.trim() || images.length > 0 || inlineFiles.length > 0) ? 1 : 0.5,
                  },
                ]}
                onPress={handleSend}
                activeOpacity={0.7}
              >
                <IconSend size={16} color={(text.trim() || images.length > 0 || inlineFiles.length > 0) ? theme.buttonTextColor : theme.subTextColor} />
              </TouchableOpacity>
            </View>
          </Box>
          );
        })()}
        </View>

        {showCommands && (
          <View style={[styles.commandsContainer, { borderTopColor: theme.borderColor }]}>
            <ScrollView style={styles.commandsScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <View style={styles.commandsGrid}>
                {quickCommands.map((cmd) => (
                  <TouchableOpacity
                    key={cmd.id}
                    style={[styles.commandChip, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => handleCommandPress(cmd)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: theme.textColor, fontSize: theme.fontSize, fontWeight: '500' }}>{cmd.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionChip, { backgroundColor: theme.accentColor }]}
                onPress={handleGenerateImage}
              >
                <View style={styles.iconBtnInner}>
                  <IconPaint size={16} color={theme.buttonTextColor} />
                  <Text style={{ color: theme.buttonTextColor, fontSize: 14, fontWeight: '500', marginLeft: 6 }}>生成图片</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

      <Modal
        visible={showProviderSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProviderSelector(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowProviderSelector(false)}
        >
          <View style={[styles.modalContent, {
            backgroundColor: theme.menuBgColor,
            paddingBottom: Math.max(insets.bottom, 0) + 24,
          }]}>
            <View style={styles.dragHandle}>
              <View style={[styles.dragBar, { backgroundColor: theme.borderColor }]} />
            </View>

            <Text style={[styles.modalTitle, { color: theme.textColor }]}>
              选择AI
            </Text>

            <View style={styles.typeTabs}>
              {(['text', 'image', 'vision', 'summary'] as AIType[]).map((type) => {
                const isActive = providerType === type;
                const selected =
                  type === 'text' ? selectedTextProvider :
                  type === 'image' ? selectedImageProvider :
                  type === 'vision' ? selectedVisionProvider :
                  selectedSummaryProvider;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeTab,
                      {
                        backgroundColor: isActive ? theme.accentColor : theme.secondaryColor,
                      },
                    ]}
                    onPress={() => setProviderType(type)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: isActive ? theme.buttonTextColor : theme.textColor, fontSize: 12, fontWeight: '500' }}>
                      {typeLabels[type]}
                    </Text>
                    {selected && (
                      <Text style={{ color: isActive ? theme.buttonTextColor : theme.accentColor, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                        {selected.name}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.providerListContainer, { backgroundColor: theme.secondaryColor }]}>
              <FlatList
                data={[...favoriteProviders, ...otherProviders]}
                keyExtractor={(item) => item.id + providerType}
                renderItem={({ item, index }) => {
                  const isFavorite = item.isFavorite;
                  const isSelected =
                    (providerType === 'text' && selectedTextProvider?.id === item.id) ||
                    (providerType === 'image' && selectedImageProvider?.id === item.id) ||
                    (providerType === 'vision' && selectedVisionProvider?.id === item.id) ||
                    (providerType === 'summary' && selectedSummaryProvider?.id === item.id);
                  const isLast = index === [...favoriteProviders, ...otherProviders].length - 1;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.providerItem,
                        !isLast && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.borderColor + '40',
                        },
                        isSelected && { backgroundColor: theme.accentColor + '15' },
                      ]}
                      onPress={() => handleSelectProvider(item)}
                      activeOpacity={0.5}
                    >
                      <View style={styles.providerItemLeft}>
                        {isFavorite && <Text style={{ marginRight: 6, fontSize: 14, color: theme.accentColor }}>★</Text>}
                        <Text style={{ color: theme.textColor, fontWeight: isSelected ? '600' : '400' }}>
                          {item.name}
                        </Text>
                      </View>
                      <Text style={{ color: theme.subTextColor, fontSize: 12 }}>{item.model}</Text>
                    </TouchableOpacity>
                  );
                }}
                ListHeaderComponent={() => {
                  if (favoriteProviders.length > 0 && otherProviders.length > 0) {
                    return (
                      <Text style={[styles.providerSectionHeader, { color: theme.subTextColor }]}>
                        收藏
                      </Text>
                    );
                  }
                  return null;
                }}
                ListFooterComponent={() => {
                  if (favoriteProviders.length > 0 && otherProviders.length > 0) {
                    return (
                      <Text style={[styles.providerSectionHeader, { color: theme.subTextColor, marginTop: 10 }]}>
                        其他
                      </Text>
                    );
                  }
                  return null;
                }}
                ListEmptyComponent={
                  <Text style={{ color: theme.subTextColor, textAlign: 'center', padding: 20 }}>
                    暂无{typeLabels[providerType]}AI，请在设置中添加支持{typeLabels[providerType]}的供应商
                  </Text>
                }
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <ImagePreviewModal
        visible={!!previewImage}
        imageUri={previewImage || ''}
        onClose={() => setPreviewImage(null)}
      />
    </OuterContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingTop: 0,
    paddingBottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  inputWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  inputBox: {
    borderRadius: 20,
    padding: 8,
    paddingBottom: 6,
  },
  imagesRow: {
    maxHeight: 80,
    marginBottom: 8,
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 8,
  },
  inputImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  pillButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  commandButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 32,
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  sendButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
  },
  commandsContainer: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 8,
  },
  commandsScroll: {
    maxHeight: 220,
  },
  commandsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 8,
  },
  commandChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 6,
    gap: 8,
    paddingBottom: 4,
  },
  actionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '75%',
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 14,
    textAlign: 'center',
  },
  providerListContainer: {
    borderRadius: 14,
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  providerItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerSectionHeader: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 4,
    fontWeight: '600',
    paddingHorizontal: 10,
  },
  typeTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  typeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 48,
  },
});
