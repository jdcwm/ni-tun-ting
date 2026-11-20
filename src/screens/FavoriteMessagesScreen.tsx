import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { ChatMessage } from '../types';
import { IconStar, IconClose } from '../components/Icons';

interface FavoriteMessagesScreenProps {
  onSelectChat: (chatId: string) => void;
  onClose?: () => void;
}

export const FavoriteMessagesScreen: React.FC<FavoriteMessagesScreenProps> = ({ onSelectChat, onClose }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getFavoriteMessages, toggleMessageFavorite, chats, characters } = useApp();

  const favoriteMessages = useMemo(() => {
    return getFavoriteMessages();
  }, [chats]);

  const handleNavigateToChat = (chatId: string) => {
    onSelectChat(chatId);
  };

  const handleUnfavorite = (chatId: string, messageId: string) => {
    toggleMessageFavorite(chatId, messageId);
  };

  const renderFavoriteItem = ({ item }: { item: { chatId: string; chatTitle: string; message: ChatMessage } }) => {
    const chat = chats.find((c) => c.id === item.chatId);
    const character = chat?.characterId ? characters.find((c) => c && c.id === chat.characterId) : null;
    const avatarUri = chat?.assistantAvatar || character?.avatar;

    const formatTime = (timestamp: number) => {
      const date = new Date(timestamp);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const hour = date.getHours().toString().padStart(2, '0');
      const minute = date.getMinutes().toString().padStart(2, '0');
      return `${month}月${day}日 ${hour}:${minute}`;
    };

    return (
      <View style={[styles.favoriteItem, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.chatInfo}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.avatarPlaceholderText, { color: theme.subTextColor }]}>
                {item.chatTitle.charAt(0)}
              </Text>
            </View>
          )}
          <View style={styles.chatMeta}>
            <Text style={[styles.chatTitle, { color: theme.textColor }]} numberOfLines={1}>
              {item.chatTitle}
            </Text>
            <Text style={[styles.chatTime, { color: theme.subTextColor }]}>
              {formatTime(item.message.timestamp)}
            </Text>
          </View>
        </View>

        <View style={[styles.messageContent, { backgroundColor: theme.secondaryColor }]}>
          <Text style={[styles.messageText, { color: theme.textColor }]} numberOfLines={3}>
            {item.message.content}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.unfavoriteBtn, { backgroundColor: theme.inputBgColor }]}
            onPress={() => handleUnfavorite(item.chatId, item.message.id)}
            activeOpacity={0.7}
          >
            <IconStar size={16} color="#ff6b9d" />
            <Text style={{ color: '#ff6b9d', fontSize: 12, marginLeft: 4 }}>取消收藏</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.goToChatBtn, { backgroundColor: theme.accentColor }]}
            onPress={() => handleNavigateToChat(item.chatId)}
            activeOpacity={0.7}
          >
            <Text style={{ color: theme.buttonTextColor, fontSize: 12, fontWeight: '500' }}>查看对话 ›</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <IconClose size={20} color={theme.textColor} />
          </TouchableOpacity>
        )}
        <Text style={[styles.title, { color: theme.textColor }]}>收藏的消息</Text>
        <Text style={[styles.count, { color: theme.subTextColor }]}>
          {favoriteMessages.length} 条
        </Text>
      </View>

      <FlatList
        data={favoriteMessages}
        keyExtractor={(item) => `${item.chatId}-${item.message.id}`}
        renderItem={renderFavoriteItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={{ opacity: 0.3 }}>
              <IconStar size={48} color={theme.subTextColor} />
            </View>
            <Text style={{ color: theme.subTextColor, marginTop: 16, fontSize: 15 }}>
              还没有收藏的消息
            </Text>
            <Text style={{ color: theme.subTextColor, marginTop: 8, fontSize: 13, opacity: 0.7 }}>
              在消息气泡下方点击「⋯」
              {'\n'}然后选择「收藏」添加
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  count: {
    fontSize: 13,
  },
  favoriteItem: {
    padding: 14,
    borderBottomWidth: 1,
  },
  chatInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarPlaceholderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chatMeta: {
    flex: 1,
    minWidth: 0,
  },
  chatTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  chatTime: {
    fontSize: 12,
  },
  messageContent: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  unfavoriteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  goToChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
});
