import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Dimensions, TextInput, Animated } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { IconClose, IconTrash, IconRefresh, IconInbox, IconSearch, IconCheck, IconChevronDown } from '../components/Icons';

const SCREEN_W = Dimensions.get('window').width;
const AUTO_CLEANUP_DAYS = 30;
const AUTO_CLEANUP_MS = AUTO_CLEANUP_DAYS * 24 * 60 * 60 * 1000;

interface RecycleBinScreenProps {
  onClose: () => void;
}

type SortOrder = 'newest' | 'oldest';

export const RecycleBinScreen: React.FC<RecycleBinScreenProps> = ({ onClose }) => {
  const theme = useTheme();
  const { recycleBin, restoreFromRecycleBin, clearRecycleBin, deleteFromRecycleBin } = useApp();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [filterType, setFilterType] = useState<'all' | 'chat' | 'message'>('all');
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useState(new Animated.Value(0))[0];

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const filteredItems = useMemo(() => {
    let items = [...recycleBin];
    if (filterType !== 'all') {
      items = items.filter((item) => item.type === filterType);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter((item) => {
        const title = getItemTitle(item).toLowerCase();
        return title.includes(query);
      });
    }
    items.sort((a, b) => {
      return sortOrder === 'newest' ? b.deletedAt - a.deletedAt : a.deletedAt - b.deletedAt;
    });
    return items;
  }, [recycleBin, filterType, searchQuery, sortOrder]);

  const allSelected = selectedIds.size === filteredItems.length && filteredItems.length > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((item) => item.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleRestore = (id: string, item: any) => {
    Alert.alert(
      '恢复确认',
      `确定要恢复这个${item.type === 'chat' ? '对话' : '消息'}吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '恢复',
          onPress: () => {
            restoreFromRecycleBin(id);
            showToast('已恢复');
          },
        },
      ]
    );
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      '彻底删除',
      '删除后将无法恢复，确定要继续吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            deleteFromRecycleBin(id);
            showToast('已彻底删除');
          },
        },
      ]
    );
  };

  const handleBatchRestore = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      '批量恢复',
      `确定要恢复选中的 ${selectedIds.size} 个项目吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '恢复全部',
          onPress: () => {
            selectedIds.forEach((id) => restoreFromRecycleBin(id));
            showToast(`已恢复 ${selectedIds.size} 个项目`);
            exitSelectionMode();
          },
        },
      ]
    );
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      '批量彻底删除',
      `确定要彻底删除选中的 ${selectedIds.size} 个项目吗？此操作无法撤销！`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '全部删除',
          style: 'destructive',
          onPress: () => {
            selectedIds.forEach((id) => deleteFromRecycleBin(id));
            showToast(`已删除 ${selectedIds.size} 个项目`);
            exitSelectionMode();
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    if (recycleBin.length === 0) return;
    Alert.alert(
      '清空回收站',
      '确定要清空回收站吗？所有项目将被彻底删除！',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: () => {
            clearRecycleBin();
            showToast('回收站已清空');
          },
        },
      ]
    );
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const getDaysRemaining = (deletedAt: number) => {
    const elapsed = Date.now() - deletedAt;
    const remaining = AUTO_CLEANUP_MS - elapsed;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  };

  const getItemTitle = (item: any) => {
    if (item.type === 'chat') {
      return item.data.title || '未命名对话';
    } else if (item.type === 'message') {
      const content = item.data.content || item.data.text || '';
      return content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }
    return '未知项目';
  };

  const getDaysColor = (days: number) => {
    if (days <= 3) return '#ff4444';
    if (days <= 7) return '#ffaa00';
    return theme.subTextColor;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        {selectionMode ? (
          <TouchableOpacity onPress={exitSelectionMode} style={styles.closeBtn}>
            <Text style={[styles.cancelText, { color: theme.textColor }]}>取消</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <IconClose size={24} color={theme.textColor} />
          </TouchableOpacity>
        )}

        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>
            {selectionMode ? `已选 ${selectedIds.size} 项` : '回收站'}
          </Text>
          {!selectionMode && (
            <Text style={[styles.itemCount, { color: theme.subTextColor }]}>
              {recycleBin.length} 个项目
            </Text>
          )}
        </View>

        {selectionMode ? (
          <TouchableOpacity onPress={toggleSelectAll} style={styles.actionHeaderBtn}>
            <Text style={[styles.actionHeaderText, { color: theme.accentColor }]}>
              {allSelected ? '取消全选' : '全选'}
            </Text>
          </TouchableOpacity>
        ) : (
          recycleBin.length > 0 && (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={() => setSelectionMode(true)} style={styles.actionHeaderBtn}>
                <Text style={[styles.actionHeaderText, { color: theme.subTextColor }]}>管理</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
                <IconTrash size={20} color={theme.subTextColor} />
              </TouchableOpacity>
            </View>
          )
        )}
      </View>

      {/* 搜索和过滤栏 */}
      {recycleBin.length > 0 && (
        <View style={[styles.filterBar, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
          <View style={[styles.searchBox, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <IconSearch size={16} color={theme.subTextColor} />
            <TextInput
              style={[styles.searchInput, { color: theme.textColor }]}
              placeholder="搜索回收站"
              placeholderTextColor={theme.subTextColor}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <IconClose size={16} color={theme.subTextColor} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.filterRow}>
            <View style={styles.filterTabs}>
              {(['all', 'chat', 'message'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setFilterType(type)}
                  style={[
                    styles.filterTab,
                    {
                      backgroundColor: filterType === type ? theme.accentColor : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterTabText,
                      { color: filterType === type ? '#fff' : theme.subTextColor },
                    ]}
                  >
                    {type === 'all' ? '全部' : type === 'chat' ? '对话' : '消息'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
              style={[styles.sortBtn, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
            >
              <Text style={[styles.sortText, { color: theme.subTextColor }]}>
                {sortOrder === 'newest' ? '最新' : '最早'}
              </Text>
              <IconChevronDown size={14} color={theme.subTextColor} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 列表内容 */}
      {filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <IconInbox size={64} color={theme.subTextColor} />
          <Text style={[styles.emptyText, { color: theme.subTextColor }]}>
            {recycleBin.length === 0 ? '回收站是空的' : '没有找到匹配的项目'}
          </Text>
          <Text style={[styles.emptyHint, { color: theme.subTextColor }]}>
            {recycleBin.length === 0
              ? '删除的对话和消息会在这里临时保存'
              : '尝试调整搜索条件或过滤选项'}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {filteredItems.map((item) => {
            const daysRemaining = getDaysRemaining(item.deletedAt);
            const isSelected = selectedIds.has(item.id);

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.itemCard,
                  { backgroundColor: theme.primaryColor, borderColor: theme.borderColor },
                  selectionMode && isSelected && { borderColor: theme.accentColor, borderWidth: 2 },
                ]}
                onPress={() => {
                  if (selectionMode) {
                    toggleSelect(item.id);
                  }
                }}
                activeOpacity={selectionMode ? 0.7 : 1}
              >
                {selectionMode && (
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: isSelected ? theme.accentColor : theme.subTextColor },
                      isSelected && { backgroundColor: theme.accentColor },
                    ]}
                  >
                    {isSelected && <IconCheck size={14} color="#fff" />}
                  </View>
                )}

                <View style={styles.itemInfo}>
                  <View style={styles.itemHeader}>
                    <View
                      style={[
                        styles.typeBadge,
                        { backgroundColor: item.type === 'chat' ? theme.accentColor : theme.secondaryColor },
                      ]}
                    >
                      <Text style={styles.typeText}>{item.type === 'chat' ? '对话' : '消息'}</Text>
                    </View>
                    <View style={[styles.countdownBadge, { backgroundColor: getDaysColor(daysRemaining) + '20', borderColor: getDaysColor(daysRemaining) }]}>
                      <Text style={[styles.countdownText, { color: getDaysColor(daysRemaining) }]}>
                        {daysRemaining === 0 ? '即将清除' : `${daysRemaining}天后清除`}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.itemTitle, { color: theme.textColor }]} numberOfLines={2}>
                    {getItemTitle(item)}
                  </Text>

                  <View style={styles.itemMeta}>
                    <Text style={[styles.itemTime, { color: theme.subTextColor }]}>
                      删除于 {formatTime(item.deletedAt)}
                    </Text>
                  </View>
                </View>

                {!selectionMode && (
                  <View style={styles.itemActions}>
                    <TouchableOpacity
                      onPress={() => handleRestore(item.id, item)}
                      style={[styles.actionBtn, { backgroundColor: theme.secondaryColor }]}
                    >
                      <IconRefresh size={16} color={theme.textColor} />
                      <Text style={[styles.actionBtnText, { color: theme.textColor }]}>恢复</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(item.id)}
                      style={[styles.actionBtn, { backgroundColor: '#8b0000' }]}
                    >
                      <IconTrash size={16} color="#fff" />
                      <Text style={styles.actionBtnTextDanger}>删除</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* 底部操作栏 */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={[styles.batchBar, { backgroundColor: theme.menuBgColor, borderTopColor: theme.borderColor }]}>
          <TouchableOpacity
            onPress={handleBatchRestore}
            style={[styles.batchBtn, { backgroundColor: theme.accentColor }]}
          >
            <IconRefresh size={18} color="#fff" />
            <Text style={styles.batchBtnText}>批量恢复</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleBatchDelete}
            style={[styles.batchBtn, { backgroundColor: '#8b0000' }]}
          >
            <IconTrash size={18} color="#fff" />
            <Text style={styles.batchBtnText}>批量删除</Text>
          </TouchableOpacity>
        </View>
      )}

      {!selectionMode && recycleBin.length > 0 && (
        <View style={[styles.footer, { backgroundColor: theme.menuBgColor, borderTopColor: theme.borderColor }]}>
          <Text style={[styles.footerText, { color: theme.subTextColor }]}>
            回收站项目将在 {AUTO_CLEANUP_DAYS} 天后自动清除
          </Text>
        </View>
      )}

      {/* Toast 提示 */}
      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <Text style={[styles.toastText, { color: theme.textColor }]}>{toastMessage}</Text>
        </Animated.View>
      )}
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
  headerInfo: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  itemCount: {
    fontSize: 12,
    marginTop: 2,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionHeaderText: {
    fontSize: 15,
    fontWeight: '500',
  },
  clearBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: 38,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 4,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sortText: {
    fontSize: 13,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
  },
  itemCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: 8,
    top: 8,
  },
  itemInfo: {
    gap: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  countdownBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  countdownText: {
    fontSize: 10,
    fontWeight: '600',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemTime: {
    fontSize: 12,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 10,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actionBtnTextDanger: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  batchBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    paddingBottom: 28,
  },
  batchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 14,
  },
  batchBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    alignItems: 'center',
    paddingBottom: 28,
  },
  footerText: {
    fontSize: 12,
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    marginLeft: -100,
    width: 200,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
  },
});