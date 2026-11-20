import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface IconProps {
  size?: number;
  color?: string;
  /** 可选的自定义图标键；若 settings.customButtonIcons 中存在此 key，则渲染自定义图 */
  name?: string;
}

/** 全局默认 Ionicons 图标风格尺寸（统一大小 / 统一线宽） */
export const ICON_DEFAULT_SIZE = 18;
export const ICON_STYLE = 'outline'; // 统一 -outline 变体，保证线宽一致

/** 全局自定义图标映射：iconKey -> uri (png/jpg/gif/webp 均可) */
let customIconRegistry: Record<string, string> = {};

export function setCustomIconRegistry(map: Record<string, string> = {}) {
  customIconRegistry = map || {};
}

/**
 * 优先渲染自定义图标（支持 png/jpg/gif/webp），否则返回 null 让调用者渲染默认图
 */
function renderCustom(name: string | undefined, size: number): React.ReactNode {
  if (!name) return null;
  const uri = customIconRegistry[name];
  if (!uri) return null;
  const isRemote = /^https?:\/\//i.test(uri);
  const source = isRemote ? { uri } : (uri as any);
  return (
    <Image
      source={source}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

/**
 * 统一的 Ionicons 渲染器：
 * - 先尝试 custom 图标（兼容旧逻辑）
 * - 否则使用给定的 Ionicons outline 名称
 */
function Ion({
  ion,
  size = ICON_DEFAULT_SIZE,
  color = '#888',
  customName,
}: {
  ion: React.ComponentProps<typeof Ionicons>['name'];
  size?: number;
  color?: string;
  customName?: string;
}) {
  const c = renderCustom(customName, size);
  if (c) return <View style={{ width: size, height: size }}>{c}</View>;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Ionicons name={ion} size={size} color={color} />
    </View>
  );
}

export const IconCopy: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'copy' }) => (
  <Ion ion="copy-outline" size={size} color={color} customName={name} />
);

export const IconStar: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'star' }) => (
  <Ion ion="star" size={size} color={color} customName={name} />
);

export const IconStarOutline: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'starOutline' }) => (
  <Ion ion="star-outline" size={size} color={color} customName={name} />
);

export const IconRefresh: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'refresh' }) => (
  <Ion ion="refresh-outline" size={size} color={color} customName={name} />
);

export const IconSummarize: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'summarize' }) => (
  <Ion ion="newspaper-outline" size={size} color={color} customName={name} />
);

export const IconEye: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'eye' }) => (
  <Ion ion="eye-outline" size={size} color={color} customName={name} />
);

export const IconEyeOff: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'eyeOff' }) => (
  <Ion ion="eye-off-outline" size={size} color={color} customName={name} />
);

export const IconTrash: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'trash' }) => (
  <Ion ion="trash-outline" size={size} color={color} customName={name} />
);

export const IconClose: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'close' }) => (
  <Ion ion="close-outline" size={size} color={color} customName={name} />
);

export const IconSend: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'send' }) => (
  <Ion ion="send-outline" size={size} color={color} customName={name} />
);

export const IconSearch: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'search' }) => (
  <Ion ion="search-outline" size={size} color={color} customName={name} />
);

export const IconMenu: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'menu' }) => (
  <Ion ion="menu-outline" size={size} color={color} customName={name} />
);

export const IconImage: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'image' }) => (
  <Ion ion="image-outline" size={size} color={color} customName={name} />
);

export const IconBolt: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'bolt' }) => (
  <Ion ion="flash-outline" size={size} color={color} customName={name} />
);

export const IconPaint: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'paint' }) => (
  <Ion ion="color-palette-outline" size={size} color={color} customName={name} />
);

export const IconChat: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'chat' }) => (
  <Ion ion="chatbubble-ellipses-outline" size={size} color={color} customName={name} />
);

export const IconPlus: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'plus' }) => (
  <Ion ion="add-outline" size={size} color={color} customName={name} />
);

export const IconSettings: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'settings' }) => (
  <Ion ion="settings-outline" size={size} color={color} customName={name} />
);

export const IconFont: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'font' }) => (
  <Ion ion="text-outline" size={size} color={color} customName={name} />
);

export const IconInputBox: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'inputBox' }) => (
  <Ion ion="create-outline" size={size} color={color} customName={name} />
);

export const IconUserCircle: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'userCircle' }) => (
  <Ion ion="person-circle-outline" size={size} color={color} customName={name} />
);

export const IconEdit: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'edit' }) => (
  <Ion ion="pencil-outline" size={size} color={color} customName={name} />
);

export const IconQuote: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'quote' }) => (
  <Ion ion="chatbox-ellipses-outline" size={size} color={color} customName={name} />
);

export const IconMore: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'more' }) => (
  <Ion ion="ellipsis-horizontal-outline" size={size} color={color} customName={name} />
);

export const IconDown: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'down' }) => (
  <Ion ion="arrow-down-outline" size={size} color={color} customName={name} />
);

export const IconUp: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'up' }) => (
  <Ion ion="arrow-up-outline" size={size} color={color} customName={name} />
);

export const IconShare: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'share' }) => (
  <Ion ion="share-social-outline" size={size} color={color} customName={name} />
);

export const IconDownload: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'download' }) => (
  <Ion ion="download-outline" size={size} color={color} customName={name} />
);

export const IconUpload: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'upload' }) => (
  <Ion ion="cloud-upload-outline" size={size} color={color} customName={name} />
);

export const IconImport: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'import' }) => (
  <Ion ion="arrow-redo-outline" size={size} color={color} customName={name} />
);

export const IconExport: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'export' }) => (
  <Ion ion="arrow-undo-outline" size={size} color={color} customName={name} />
);

export const IconBack: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'back' }) => (
  <Ion ion="arrow-back-outline" size={size} color={color} customName={name} />
);

export const IconForward: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'forward' }) => (
  <Ion ion="arrow-forward-outline" size={size} color={color} customName={name} />
);

export const IconBrowser: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'browser' }) => (
  <Ion ion="globe-outline" size={size} color={color} customName={name} />
);

export const IconCheck: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'check' }) => (
  <Ion ion="checkmark-outline" size={size} color={color} customName={name} />
);

export const IconX: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'x' }) => (
  <Ion ion="close-outline" size={size} color={color} customName={name} />
);

export const IconCamera: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'camera' }) => (
  <Ion ion="camera-outline" size={size} color={color} customName={name} />
);

export const IconUser: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'user' }) => (
  <Ion ion="person-outline" size={size} color={color} customName={name} />
);

export const IconAI: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'ai' }) => (
  <Ion ion="sparkles-outline" size={size} color={color} customName={name} />
);

export const IconGlobe: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'globe' }) => (
  <Ion ion="earth-outline" size={size} color={color} customName={name} />
);

export const IconWifi: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'wifi' }) => (
  <Ion ion="wifi-outline" size={size} color={color} customName={name} />
);

export const IconCpu: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'cpu' }) => (
  <Ion ion="hardware-chip-outline" size={size} color={color} customName={name} />
);

export const IconDatabase: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'database' }) => (
  <Ion ion="server-outline" size={size} color={color} customName={name} />
);

export const IconZap: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'zap' }) => (
  <Ion ion="flash-outline" size={size} color={color} customName={name} />
);

export const IconGame: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'game' }) => (
  <Ion ion="game-controller-outline" size={size} color={color} customName={name} />
);

export const IconPalette: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'palette' }) => (
  <Ion ion="color-palette-outline" size={size} color={color} customName={name} />
);

export const IconInbox: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'inbox' }) => (
  <Ion ion="archive-outline" size={size} color={color} customName={name} />
);

export const IconChevronRight: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'chevronRight' }) => (
  <Ion ion="chevron-forward-outline" size={size} color={color} customName={name} />
);

export const IconChevronDown: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'chevronDown' }) => (
  <Ion ion="chevron-down-outline" size={size} color={color} customName={name} />
);

export const IconCharacters: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'characters' }) => (
  <Ion ion="people-outline" size={size} color={color} customName={name} />
);

export const IconCommunity: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'community' }) => (
  <Ion ion="business-outline" size={size} color={color} customName={name} />
);

export const IconPeople: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'people' }) => (
  <Ion ion="people-outline" size={size} color={color} customName={name} />
);

export const IconPerson: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'person' }) => (
  <Ion ion="person-add-outline" size={size} color={color} customName={name} />
);

export const IconChatHistory: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'chatHistory' }) => (
  <Ion ion="time-outline" size={size} color={color} customName={name} />
);

export const IconFavoriteMsg: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'favoriteMsg' }) => (
  <Ion ion="heart-outline" size={size} color={color} customName={name} />
);

export const IconFavoriteChat: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'favoriteChat' }) => (
  <Ion ion="bookmark-outline" size={size} color={color} customName={name} />
);

export const IconToolbox: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'toolbox' }) => (
  <Ion ion="construct-outline" size={size} color={color} customName={name} />
);

export const IconWorldBook: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'worldBook' }) => (
  <Ion ion="library-outline" size={size} color={color} customName={name} />
);

export const IconTheme: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'theme' }) => (
  <Ion ion="color-wand-outline" size={size} color={color} customName={name} />
);

export const IconMoon: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'moon' }) => (
  <Ion ion="moon-outline" size={size} color={color} customName={name} />
);

export const IconSun: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'sun' }) => (
  <Ion ion="sunny-outline" size={size} color={color} customName={name} />
);

export const IconPin: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'pin' }) => (
  <Ion ion="push-outline" size={size} color={color} customName={name} />
);

export const IconBook: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'book' }) => (
  <Ion ion="book-outline" size={size} color={color} customName={name} />
);

export const IconFolder: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'folder' }) => (
  <Ion ion="folder-outline" size={size} color={color} customName={name} />
);

export const IconFile: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'file' }) => (
  <Ion ion="document-outline" size={size} color={color} customName={name} />
);

export const IconChevronLeft: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'chevronLeft' }) => (
  <Ion ion="chevron-back-outline" size={size} color={color} customName={name} />
);

export const IconStop: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'stop' }) => (
  <Ion ion="stop-outline" size={size} color={color} customName={name} />
);

export const IconMenuDots: React.FC<IconProps> = ({ size = ICON_DEFAULT_SIZE, color = '#888', name = 'menuDots' }) => (
  <Ion ion="ellipsis-vertical-outline" size={size} color={color} customName={name} />
);

// 保留 styles（兼容旧的直接引用 styles.xxx 的场景；新实现基本用不到）
const styles = StyleSheet.create({
  copyBack: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 2,
    top: 2,
    right: 2,
  },
  copyFront: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 2,
  },
  line: {
    height: 1.5,
    borderRadius: 1,
  },
  trashLid: {
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    height: 4,
    marginBottom: 1,
  },
  trashBody: {
    borderWidth: 1.5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  trashLine: {
    width: 1.5,
    height: '55%',
    borderRadius: 1,
  },
  hamburger: {
    height: 1.5,
    borderRadius: 1,
  },
  editBody: {
    borderRadius: 1,
  },
  editTip: {
    borderRadius: 1,
  },
  eyeShape: {
    width: '80%',
    height: '50%',
    borderWidth: 1.5,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyePupil: {
    width: '30%',
    height: '30%',
    borderRadius: 50,
  },
  paletteOuter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  paletteInner: {},
});
