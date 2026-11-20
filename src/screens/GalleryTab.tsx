import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import { mediaLibraryService, MediaAsset } from '../services/mediaLibraryService';
import * as Clipboard from 'expo-clipboard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const GAP = 6;
const ITEM_SIZE = (SCREEN_WIDTH - 32 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface GalleryTabProps {
  chatId: string;
}

/**
 * 「图库」= 素材库。
 *
 * 上传到这里（并取好名字）的图片，AI 就能用 `{{ui:img=名字}}` 发出来。
 * 所以每张图都把「名字」显示出来，并支持一键复制，方便直接告诉 AI 用哪张。
 */
export const GalleryTab: React.FC<GalleryTabProps> = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await mediaLibraryService.list());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleUploadGallery = async () => {
    const added = await mediaLibraryService.importFromGallery(true);
    if (added.length === 0) return;
    await reload();
    Alert.alert('上传成功', `已加入 ${added.length} 张，AI 现在可以调用它们了。`);
  };

  const handleUploadFiles = async () => {
    const added = await mediaLibraryService.importFromFiles();
    if (added.length === 0) return;
    await reload();
    Alert.alert('上传成功', `已加入 ${added.length} 个文件。`);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>图库</Text>
          <Text style={[styles.countText, { color: theme.subTextColor }]}>{assets.length} 张</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.saveAllBtn, { backgroundColor: theme.accentColor }]}
            onPress={handleUploadGallery}
          >
            <Text style={{ color: theme.buttonTextColor, fontSize: 12 }}>+ 相册</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveAllBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={handleUploadFiles}
          >
            <Text style={{ color: theme.textColor, fontSize: 12 }}>+ 文件</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={{ color: theme.subTextColor, fontSize: 11, paddingHorizontal: 16, paddingTop: 8 }}>
        上传后 AI 就能用 {'{{ui:img=名字}}'} 发出这些图（点名字可复制）。
      </Text>

      <FlatList
        style={styles.content}
        data={assets}
        keyExtractor={(a) => a.id}
        numColumns={NUM_COLUMNS}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        removeClippedSubviews
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP, paddingBottom: insets.bottom + 20 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 44, marginBottom: 12 }}>🖼️</Text>
            <Text style={{ color: theme.textColor, fontSize: 15, fontWeight: '600', marginBottom: 6 }}>
              图库还是空的
            </Text>
            <Text style={{ color: theme.subTextColor, textAlign: 'center', fontSize: 12 }}>
              点右上角「+ 相册」上传图片{'\n'}AI 就能在聊天里把它们发出来
            </Text>
          </View>
        }
        renderItem={({ item: a }) => (
          <View style={{ width: ITEM_SIZE }}>
            <TouchableOpacity
              style={[
                styles.imageWrapper,
                { width: ITEM_SIZE, height: ITEM_SIZE, backgroundColor: theme.secondaryColor },
              ]}
              onPress={() => setPreviewImage(a.uri)}
              onLongPress={() =>
                Alert.alert(a.name, a.note || a.fileName || '', [
                  { text: '复制名字', onPress: () => Clipboard.setStringAsync(a.name) },
                  {
                    text: '删除',
                    style: 'destructive',
                    onPress: async () => {
                      await mediaLibraryService.remove(a.id);
                      reload();
                    },
                  },
                  { text: '取消', style: 'cancel' },
                ])
              }
            >
              <Image source={{ uri: a.uri }} style={styles.image} resizeMode="cover" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Clipboard.setStringAsync(a.name);
                Alert.alert('已复制名字', a.name);
              }}
            >
              <Text numberOfLines={1} style={{ color: theme.subTextColor, fontSize: 10, marginTop: 3 }}>
                {a.name}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <ImagePreviewModal
        visible={!!previewImage}
        imageUri={previewImage || ''}
        onClose={() => setPreviewImage(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  countText: { fontSize: 13 },
  saveAllBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  content: { flex: 1, padding: 16 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 70 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  imageWrapper: { borderRadius: 8, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
