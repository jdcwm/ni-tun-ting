import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  ViewStyle,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { AIProvider, AIModel, AIType } from '../types';
import { IconStar, IconStarOutline, IconSearch, IconClose } from './Icons';

const { height: SCREEN_H } = Dimensions.get('window');

interface ModelSelectorProps {
  visible: boolean;
  onClose: () => void;
  providers: AIProvider[];
  selectedModelId?: string;
  selectedProviderId?: string;
  onSelect: (provider: AIProvider, model: AIModel) => void;
  capabilityFilter?: AIType;
  title?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  visible,
  onClose,
  providers,
  selectedModelId,
  selectedProviderId,
  onSelect,
  capabilityFilter = 'text',
  title = '选择AI',
}) => {
  const theme = useTheme();
  const [searchText, setSearchText] = useState('');
  const [tab, setTab] = useState<'all' | 'favorites'>('all');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  const filteredProviders = useMemo(() => {
    let result = providers.filter((p) => p.models && p.models.length > 0 && p.capabilities.includes(capabilityFilter));

    result = result.map((p) => ({
      ...p,
      models: p.models.filter((m) => {
        const modelCaps = m.capabilities && m.capabilities.length > 0 ? m.capabilities : p.capabilities;
        return modelCaps.includes(capabilityFilter);
      }),
    })).filter((p) => p.models.length > 0);

    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      result = result.map((p) => ({
        ...p,
        models: p.models.filter(
          (m) =>
          m.name.toLowerCase().includes(query) ||
          m.modelId.toLowerCase().includes(query) ||
          p.name.toLowerCase().includes(query)
        ),
      })).filter((p) => p.models.length > 0);
    }

    if (tab === 'favorites') {
      result = result.map((p) => ({
        ...p,
        models: p.models.filter((m) => m.isFavorite),
      })).filter((p) => p.models.length > 0);
    }

    return result;
  }, [providers, searchText, tab, capabilityFilter]);

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const getCapabilityIcon = (type: string): string => {
    const icons: Record<string, string> = {
      text: '💬',
      image: '🎨',
      vision: '👁️',
      summary: '📝',
      function_calling: '🔧',
      streaming: '⚡',
      reasoning: '🧠',
      audio: '🎵',
    };
    return icons[type] || '❓';
  };

  const renderProviderSection = ({ item: provider }: { item: AIProvider }) => {
    const isExpanded = expandedProviders.has(provider.id);
    const favoriteModels = provider.models.filter((m) => m.isFavorite).length;

    return (
      <View style={[styles.providerSection, { borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity
          style={styles.providerHeader}
          onPress={() => toggleProvider(provider.id)}
        >
          <Text style={[styles.providerName, { color: theme.textColor }]}>
            {provider.name}
          </Text>
          <View style={styles.providerInfo}>
            <Text style={[styles.providerCount, { color: theme.subTextColor }]}>
              {provider.models.length} 个模型
            </Text>
            {favoriteModels > 0 && (
              <Text style={[styles.providerCount, { color: theme.accentColor, marginLeft: 8 }]}>
              ⭐ {favoriteModels}
              </Text>
            )}
            <Text style={[styles.expandIcon, { color: theme.subTextColor, marginLeft: 8 }]}>
              {isExpanded ? '▼' : '▶'}
            </Text>
          </View>
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.modelsList}>
            {provider.models.map((model) => {
              const isSelected =
                selectedModelId === model.id ||
                (selectedProviderId === provider.id && selectedModelId === model.id);
              const modelCaps = model.capabilities && model.capabilities.length > 0
                ? model.capabilities
                : provider.capabilities;
              return (
                <TouchableOpacity
                  key={model.id}
                  style={[
                    styles.modelItem,
                    {
                      backgroundColor: isSelected ? theme.accentColor + '20' : 'transparent',
                      borderBottomColor: theme.borderColor,
                    },
                  ]}
                  onPress={() => onSelect(provider, model)}
                >
                  <View style={styles.modelMain}>
                    <Text
                      style={[
                        styles.modelName,
                        { color: isSelected ? theme.accentColor : theme.textColor },
                      ]}
                      numberOfLines={1}
                    >
                      {model.name}
                    </Text>
                    <View style={styles.modelCapabilities}>
                      {modelCaps.slice(0, 3).map((cap, i) => (
                        <Text key={i} style={styles.capabilityIcon}>
                          {getCapabilityIcon(cap)}
                        </Text>
                      ))}
                    </View>
                  </View>
                  <Text style={[styles.modelId, { color: theme.subTextColor }]} numberOfLines={1}>
                    {model.modelId}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={() => {
          Keyboard.dismiss();
          onClose();
        }}>
          <View style={styles.modalBackdrop} />
        </TouchableWithoutFeedback>
        <TouchableWithoutFeedback onPress={() => {}}>
          <View style={[styles.modalContainer, { backgroundColor: theme.menuBgColor }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <IconClose size={20} color={theme.textColor} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.textColor }]}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={[styles.tabBar, { borderBottomColor: theme.borderColor }]}>
            <TouchableOpacity
              style={[styles.tabItem, tab === 'all' && { borderBottomColor: theme.accentColor }]}
              onPress={() => setTab('all')}
            >
              <Text style={{ color: tab === 'all' ? theme.accentColor : theme.textColor }}>
                全部
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, tab === 'favorites' && { borderBottomColor: theme.accentColor }]}
              onPress={() => setTab('favorites')}
            >
              <Text style={{ color: tab === 'favorites' ? theme.accentColor : theme.textColor }}>
                收藏
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.searchContainer, { borderBottomColor: theme.borderColor }]}>
            <View style={[styles.searchBox, { backgroundColor: theme.inputBgColor }]}>
              <IconSearch size={18} color={theme.subTextColor} />
              <TextInput
                style={[styles.searchInput, { color: theme.textColor }]}
                placeholder="搜索模型..."
                placeholderTextColor={theme.subTextColor}
                value={searchText}
                onChangeText={setSearchText}
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText('')}>
                  <IconClose size={16} color={theme.subTextColor} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <FlatList
            data={filteredProviders}
            renderItem={renderProviderSection}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.subTextColor }]}>
                  {providers.length === 0
                    ? '暂无AI提供商，请在设置中添加'
                    : tab === 'favorites'
                    ? '暂无收藏的模型'
                    : '没有符合条件的模型'}
                </Text>
              </View>
            }
          />
        </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_H * 0.9,
    minHeight: 400,
    paddingBottom: 40,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  providerSection: {
    borderBottomWidth: 1,
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerCount: {
    fontSize: 12,
  },
  expandIcon: {
    fontSize: 10,
  },
  modelsList: {
    paddingBottom: 4,
  },
  modelItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modelMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  modelCapabilities: {
    flexDirection: 'row',
    gap: 4,
  },
  capabilityIcon: {
    fontSize: 14,
  },
  modelId: {
    fontSize: 12,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
