import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { mediaLibraryService, MediaAsset, MediaKind } from '../services/mediaLibraryService';
import {
  IconClose,
  IconPlus,
  IconTrash,
  IconEdit,
  IconImage,
  IconCopy,
} from '../components/Icons';

interface Props {
  onClose: () => void;
}

const KIND_LABEL: Record<MediaKind, string> = {
  image: '图片',
  gif: '动图',
  video: '视频',
  audio: '音频',
  file: '文件',
};

const formatSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * 素材库。
 *
 * 导入的图片 / GIF / 视频会存在 app 文档目录并登记名字，用户在自己的界面代码里
 * 用 media://名字 就能引用（构建 WebView 界面时会被解析成 data URL）。
 * 这样「通过代码调用各种各样的图片 / 动图 / 视频」才有稳定的素材来源。
 */
export const MediaLibraryScreen: React.FC<Props> = ({ onClose }) => {
  const theme = useTheme();
  const { settings } = useApp();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await mediaLibraryService.list();
      setAssets(list);
    } finally {
      setLoading(false);
    }
  }, []);

  // 本应用用的是自定义 Modal 导航，没有 react-navigation 的 focus 事件，直接在挂载时加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleImportGallery = async () => {
    setBusy(true);
    try {
      const imported = await mediaLibraryService.importFromGallery(true);
      if (imported.length === 0) {
        // 用户取消不提示
      } else {
        await refresh();
        Alert.alert('导入完成', `已导入 ${imported.length} 个素材`);
      }
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const handleImportFiles = async () => {
    setBusy(true);
    try {
      const imported = await mediaLibraryService.importFromFiles();
      if (imported.length > 0) {
        await refresh();
        Alert.alert('导入完成', `已导入 ${imported.length} 个素材`);
      }
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (asset: MediaAsset) => {
    Alert.alert('删除素材', `确定删除「${asset.name}」吗？\n引用它的界面代码会失效。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await mediaLibraryService.remove(asset.id);
          await refresh();
        },
      },
    ]);
  };

  const handleStartRename = (asset: MediaAsset) => {
    setRenamingId(asset.id);
    setRenameText(asset.name);
  };

  const handleCommitRename = async () => {
    if (!renamingId) return;
    const ok = await mediaLibraryService.rename(renamingId, renameText);
    setRenamingId(null);
    setRenameText('');
    if (!ok) {
      Alert.alert('重命名失败', '名字不能为空');
      return;
    }
    await refresh();
  };

  const handleCopyRef = async (asset: MediaAsset) => {
    const ref = `media://${asset.name}`;
    try {
      await Clipboard.setStringAsync(ref);
      Alert.alert('已复制引用', `${ref}\n\n在你的界面 HTML 里这样用：\n<img src="${ref}">`);
    } catch {
      Alert.alert('引用格式', ref);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
      {/* 顶部栏 */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor },
        ]}
      >
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <IconClose size={22} color={theme.textColor} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.textColor, fontSize: 17, fontWeight: '600' }}>素材库</Text>
          <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
            共 {assets.length} 个 · 代码里用 media://名字 引用
          </Text>
        </View>
        {busy ? <ActivityIndicator size="small" color={theme.accentColor} /> : null}
      </View>

      {/* 导入区 */}
      <View style={[styles.importRow, { borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity
          onPress={handleImportGallery}
          disabled={busy}
          style={[styles.importBtn, { backgroundColor: theme.accentColor }]}
        >
          <IconImage size={16} color="#fff" />
          <Text style={styles.importBtnText}>从相册导入图片/GIF/视频</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleImportFiles}
          disabled={busy}
          style={[styles.importBtn, { backgroundColor: theme.secondaryColor }]}
        >
          <IconPlus size={16} color={theme.textColor} />
          <Text style={[styles.importBtnText, { color: theme.textColor }]}>从文件导入</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.accentColor} />
        ) : assets.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 60, paddingHorizontal: 24 }}>
            <Text style={{ color: theme.subTextColor, fontSize: 15, textAlign: 'center' }}>
              还没有素材
            </Text>
            <Text
              style={{
                color: theme.subTextColor,
                fontSize: 12,
                textAlign: 'center',
                marginTop: 10,
                lineHeight: 20,
              }}
            >
              导入后可以用在：{'\n'}
              · 对话背景 / 视频背景{'\n'}
              · 启动页图片{'\n'}
              · 自定义界面里的图片、动图、视频{'\n'}
              · 角色卡封面、AI 头像
            </Text>
          </View>
        ) : (
          assets.map((a) => (
            <View
              key={a.id}
              style={[
                styles.card,
                { backgroundColor: theme.primaryColor, borderColor: theme.borderColor },
              ]}
            >
              {/* 缩略图 */}
              <View
                style={[
                  styles.thumb,
                  { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor },
                ]}
              >
                {a.kind === 'video' || a.kind === 'audio' ? (
                  <Text style={{ fontSize: 24 }}>{a.kind === 'video' ? '🎬' : '🎵'}</Text>
                ) : a.kind === 'file' ? (
                  <Text style={{ fontSize: 24 }}>📄</Text>
                ) : (
                  <Image source={{ uri: a.uri }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                )}
              </View>

              {/* 信息 */}
              <View style={{ flex: 1, marginLeft: 12 }}>
                {renamingId === a.id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      value={renameText}
                      onChangeText={setRenameText}
                      autoFocus
                      onSubmitEditing={handleCommitRename}
                      style={[
                        styles.renameInput,
                        {
                          color: theme.textColor,
                          backgroundColor: theme.secondaryColor,
                          borderColor: theme.borderColor,
                        },
                      ]}
                    />
                    <TouchableOpacity
                      onPress={handleCommitRename}
                      style={[styles.smallBtn, { backgroundColor: theme.accentColor }]}
                    >
                      <Text style={{ color: '#fff', fontSize: 12 }}>保存</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                    {a.name}
                  </Text>
                )}
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 3 }}>
                  {KIND_LABEL[a.kind]}
                  {formatSize(a.size) ? ` · ${formatSize(a.size)}` : ''}
                </Text>
                <TouchableOpacity onPress={() => handleCopyRef(a)} style={{ marginTop: 4 }}>
                  <Text style={{ color: theme.accentColor, fontSize: 11 }}>
                    media://{a.name}（点击复制引用）
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 操作 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <TouchableOpacity onPress={() => handleCopyRef(a)} style={styles.iconBtn}>
                  <IconCopy size={17} color={theme.subTextColor} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleStartRename(a)} style={styles.iconBtn}>
                  <IconEdit size={17} color={theme.subTextColor} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(a)} style={styles.iconBtn}>
                  <IconTrash size={17} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 4,
  },
  headerBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  importRow: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1 },
  importBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  importBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
  },
});
