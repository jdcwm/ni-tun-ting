import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { IconClose, IconSettings, IconPalette, IconGlobe, IconUser, IconDatabase, IconChevronRight, IconBrowser, IconImage } from '../components/Icons';

const SCREEN_W = Dimensions.get('window').width;

interface ManagementMenuProps {
  onClose: () => void;
  onNavigate: (screen: string) => void;
}

interface MenuItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  screen: string;
  category: '制作端' | '管理端';
}

export const ManagementMenu: React.FC<ManagementMenuProps> = ({ onClose, onNavigate }) => {
  const theme = useTheme();
  const { userProfile, chats } = useApp();
  const insets = useSafeAreaInsets();
  const safeBottom = (insets.bottom || 0) + 34;

  const menuItems: MenuItem[] = [
    // 制作端
    {
      id: 'character-creator',
      title: '角色卡制作',
      description: '创建和编辑AI角色卡',
      icon: <IconUser size={24} color={theme.accentColor} />,
      screen: 'character',
      category: '制作端',
    },
    {
      id: 'worldbook-editor',
      title: '世界观编辑器',
      description: '管理和编辑世界观设置',
      icon: <IconGlobe size={24} color={theme.accentColor} />,
      screen: 'worldbook',
      category: '制作端',
    },
    {
      id: 'theme-editor',
      title: '主题制作工具',
      description: '创建自定义主题样式',
      icon: <IconPalette size={24} color={theme.accentColor} />,
      screen: 'themeEditor',
      category: '制作端',
    },
    {
      id: 'fancy-work-creator',
      title: '装饰制作',
      description: '创建状态条和装饰',
      icon: <IconImage size={24} color={theme.accentColor} />,
      screen: 'fancyWork',
      category: '制作端',
    },
    {
      id: 'character-browser',
      title: '角色卡获取',
      description: '从网络获取角色卡',
      icon: <IconBrowser size={24} color={theme.accentColor} />,
      screen: 'characterBrowser',
      category: '制作端',
    },
    
    // 管理端
    {
      id: 'chat-management',
      title: '对话管理',
      description: `管理 ${chats.length} 个对话`,
      icon: <IconDatabase size={24} color={theme.accentColor} />,
      screen: 'chatManagement',
      category: '管理端',
    },
    {
      id: 'user-settings',
      title: '用户设置',
      description: userProfile?.username || '未设置用户名',
      icon: <IconUser size={24} color={theme.accentColor} />,
      screen: 'userSettings',
      category: '管理端',
    },
    {
      id: 'system-check',
      title: '系统检测',
      description: 'AI功能和记忆检测',
      icon: <IconSettings size={24} color={theme.accentColor} />,
      screen: 'systemCheck',
      category: '管理端',
    },
    {
      id: 'theme-settings',
      title: '主题设置',
      description: '颜色和样式配置',
      icon: <IconPalette size={24} color={theme.accentColor} />,
      screen: 'themeSettings',
      category: '管理端',
    },
    {
      id: 'recycle-bin',
      title: '回收站',
      description: '查看已删除的内容',
      icon: <IconDatabase size={24} color={theme.accentColor} />,
      screen: 'recycleBin',
      category: '管理端',
    },
  ];

  const renderSection = (title: string, category: '制作端' | '管理端') => {
    const items = menuItems.filter((item) => item.category === category);
    if (items.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>{title}</Text>
        <View style={styles.menuGrid}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => {
                onNavigate(item.screen);
                onClose();
              }}
              style={[styles.menuItem, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
              activeOpacity={0.7}
            >
              <View style={styles.itemIcon}>{item.icon}</View>
              <Text style={[styles.itemTitle, { color: theme.textColor }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.itemDesc, { color: theme.subTextColor }]} numberOfLines={2}>
                {item.description}
              </Text>
              <IconChevronRight size={16} color={theme.subTextColor} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconClose size={24} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>管理中心</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: safeBottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 用户信息卡片 */}
        <View style={[styles.userCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <View style={[styles.userAvatar, { backgroundColor: theme.accentColor + '20' }]}>
            <IconUser size={32} color={theme.accentColor} />
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.username, { color: theme.textColor }]}>
              {userProfile?.username || '未设置用户'}
            </Text>
            {userProfile?.userId && (
              <Text style={[styles.userId, { color: theme.subTextColor }]}>
                ID: {userProfile.userId}
              </Text>
            )}
          </View>
        </View>

        {/* 制作端 */}
        {renderSection('制作端', '制作端')}

        {/* 管理端 */}
        {renderSection('管理端', '管理端')}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    zIndex: 2000,
    ...Platform.select({
      android: {
        elevation: 100,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 24,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 16,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
  },
  userId: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  menuItem: {
    width: (SCREEN_W - 44) / 2,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 8,
    flexDirection: 'column',
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 107, 157, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
});
