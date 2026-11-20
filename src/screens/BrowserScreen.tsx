import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Dimensions, Alert, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../hooks/useTheme';
import { IconBack, IconForward, IconClose, IconRefresh, IconDownload, IconSearch } from '../components/Icons';
import { imageUtils } from '../utils/imageUtils';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

/**
 * 默认主页。
 * 之前写死 https://www.google.com —— 在国内网络下这个域名不可达，打开浏览器就是白屏，
 * 用户会以为"自带浏览器坏了"。这里改成可达的默认页，并允许调用方覆盖。
 */
const DEFAULT_HOME = 'https://www.bing.com';

interface BrowserScreenProps {
  initialUrl?: string;
  onClose: () => void;
  onDownloadImage?: (url: string) => void;
  onExtractCharacter?: (html: string, url: string) => void;
  mode?: 'browser' | 'character-hunter';
}

export const BrowserScreen: React.FC<BrowserScreenProps> = ({
  initialUrl = DEFAULT_HOME,
  onClose,
  onDownloadImage,
  onExtractCharacter,
  mode = 'browser',
}) => {
  const theme = useTheme();
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [extractedCount, setExtractedCount] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const webViewRef = useRef<any>(null);
  const urlRef = useRef(initialUrl);
  useEffect(() => { urlRef.current = url; }, [url]);

  // WebView 里注入的脚本只能通过 postMessage 把结果送回来（injectJavaScript 的返回值
  // 在 native 上是拿不到的）。之前代码直接判断 injectJavaScript 的返回值，因此永远拿到
  // 真值，提取/下载功能实际上是坏的。
  const handleWebViewMessage = useCallback(async (event: any) => {
    let payload: any = null;
    try {
      payload = JSON.parse(event?.nativeEvent?.data);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;

    const pageUrl = typeof payload.pageUrl === 'string' && payload.pageUrl ? payload.pageUrl : urlRef.current;

    // 1) 页面里直接内嵌了角色卡数据（chara_card_v2 / ccv3）—— 这是唯一可靠的提取方式
    if (payload.type === 'charadata') {
      const raw = typeof payload.data === 'string' ? payload.data : '';
      if (!raw) return;
      if (onExtractCharacter) {
        onExtractCharacter(raw, pageUrl);
      } else {
        Alert.alert(
          '发现角色卡数据',
          '当前页面内嵌了角色卡数据，但此入口未接提取逻辑。可改用「角色卡获取 → 浏览角色卡库」，或把页面 PNG 保存后从角色卡列表导入。',
        );
      }
      setExtractedCount((n) => n + 1);
      return;
    }

    // 2) 收集到一批图片，让用户选择下载
    if (payload.type === 'images') {
      const list: string[] = Array.isArray(payload.data) ? payload.data.filter((u: any) => typeof u === 'string') : [];
      if (list.length === 0) {
        Alert.alert('提示', '该页面没有发现可下载的图片');
        return;
      }
      const pickable = list.slice(0, 10);
      Alert.alert(
        `发现 ${list.length} 张图片`,
        `要下载前 ${pickable.length} 张吗？\n保存到应用图片目录，可从相册/图库入口查看。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '下载',
            onPress: async () => {
              setDownloading(true);
              let ok = 0;
              for (const imgUrl of pickable) {
                try {
                  // 外部回调优先（由上层决定存哪）
                  if (onDownloadImage) {
                    onDownloadImage(imgUrl);
                    ok++;
                    continue;
                  }
                  await imageUtils.saveImageToAppDir(imgUrl, 'browser');
                  ok++;
                } catch {
                  // 单张失败不影响其余
                }
              }
              setDownloading(false);
              Alert.alert('下载完成', `成功保存 ${ok} / ${pickable.length} 张`);
            },
          },
        ],
      );
      return;
    }

    // 3) 页面信息（提取失败时给用户一个明确结论，而不是静默无反应）
    if (payload.type === 'pageinfo') {
      Alert.alert(
        '未找到角色卡',
        `页面：${payload.title || '(无标题)'}\n\n` +
          `该页面没有内嵌角色卡数据（chara_card_v2 / ccv3）。\n` +
          `可尝试：长按页面里的角色卡 PNG 图片直接保存，再到「角色卡获取 → 导入」里选该图片。`,
      );
    }
  }, [onDownloadImage, onExtractCharacter]);

  const handleNavigate = useCallback((newUrl: string) => {
    let finalUrl = newUrl.trim();
    if (!finalUrl) return;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = 'https://' + finalUrl;
      } else {
        // 用可达的搜索引擎，而不是 google
        finalUrl = `https://www.bing.com/search?q=${encodeURIComponent(finalUrl)}`;
      }
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);
    setLoading(true);
  }, []);

  const handleGoBack = () => {
    if (canGoBack) {
      webViewRef.current?.goBack();
    }
  };

  const handleGoForward = () => {
    if (canGoForward) {
      webViewRef.current?.goForward();
    }
  };

  const handleReload = () => {
    webViewRef.current?.reload();
  };

  /** 用系统浏览器打开当前页 —— 下载/登录/复杂页面在 WebView 里经常不可用 */
  const handleOpenExternally = async () => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('无法打开', '系统里没有可处理该链接的应用');
      }
    } catch {
      Alert.alert('无法打开', '调用系统浏览器失败');
    }
  };

  const handleHome = () => {
    handleNavigate(DEFAULT_HOME);
  };

  /** 扫描页面：角色卡数据 + 可下载图片，结果通过 postMessage 回传 */
  const handleScanPage = () => {
    if (!webViewRef.current) return;
    webViewRef.current.injectJavaScript(`
      (function() {
        var send = function(obj) {
          try { window.ReactNativeWebView.postMessage(JSON.stringify(obj)); } catch (e) {}
        };
        var pageUrl = location.href;

        // 1) 内嵌角色卡数据：<script id="chara-card-data"> / <div data-chara-card> / 任意含 chara_card_v2 的脚本
        try {
          var card = null;
          var byId = document.querySelector('#chara-card-data, [data-chara-card], [data-character-card]');
          if (byId) card = byId.textContent || byId.getAttribute('data-chara-card');
          if (!card) {
            var scripts = document.querySelectorAll('script');
            for (var i = 0; i < scripts.length; i++) {
              var t = scripts[i].textContent || '';
              if (t.indexOf('chara_card_v2') !== -1 || t.indexOf('chara_card_v3') !== -1 || t.indexOf('"first_mes"') !== -1) {
                card = t;
                break;
              }
            }
          }
          if (card) { send({ type: 'charadata', data: card, pageUrl: pageUrl }); return; }
        } catch (e) {}

        // 2) 收集图片
        try {
          var imgs = Array.prototype.slice.call(document.querySelectorAll('img'));
          var urls = imgs
            .filter(function(im) {
              var w = im.naturalWidth || im.width || 0;
              var h = im.naturalHeight || im.height || 0;
              return im.src && im.src.indexOf('data:') !== 0 && (w >= 80 || h >= 80);
            })
            .map(function(im) { return im.src; });
          var seen = {};
          urls = urls.filter(function(u) { if (seen[u]) return false; seen[u] = 1; return true; });
          if (urls.length > 0) { send({ type: 'images', data: urls, pageUrl: pageUrl }); return; }
        } catch (e) {}

        send({ type: 'pageinfo', title: document.title || '', pageUrl: pageUrl });
      })();
      true;
    `);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 顶部工具栏 */}
      <View style={[styles.toolbar, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.toolbarBtn}>
          <IconClose size={22} color={theme.textColor} />
        </TouchableOpacity>

        <View style={[styles.urlBar, { backgroundColor: theme.inputBgColor, borderColor: theme.borderColor }]}>
          <IconSearch size={16} color={theme.subTextColor} />
          <TextInput
            style={[styles.urlInput, { color: theme.textColor }]}
            value={inputUrl}
            onChangeText={setInputUrl}
            onSubmitEditing={() => handleNavigate(inputUrl)}
            placeholder="搜索或输入网址"
            placeholderTextColor={theme.subTextColor}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
          />
        </View>

        <TouchableOpacity
          onPress={handleReload}
          style={styles.toolbarBtn}
          disabled={loading}
        >
          <IconRefresh size={20} color={loading ? theme.subTextColor : theme.textColor} />
        </TouchableOpacity>
      </View>

      {/* 导航按钮栏 */}
      <View style={[styles.navBar, { backgroundColor: theme.primaryColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]}
          disabled={!canGoBack}
        >
          <IconBack size={20} color={canGoBack ? theme.textColor : theme.subTextColor} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleGoForward}
          style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]}
          disabled={!canGoForward}
        >
          <IconForward size={20} color={canGoForward ? theme.textColor : theme.subTextColor} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleHome} style={styles.navBtn}>
          <IconSearch size={18} color={theme.textColor} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleOpenExternally} style={styles.navBtn}>
          <IconForward size={18} color={theme.textColor} />
        </TouchableOpacity>

        {mode === 'character-hunter' ? (
          <>
            <TouchableOpacity
              onPress={handleScanPage}
              style={[styles.actionBtn, { backgroundColor: theme.accentColor }]}
            >
              <Text style={styles.actionBtnText}>扫描页面</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleScanPage}
              style={[styles.actionBtn, { backgroundColor: theme.secondaryColor }]}
              disabled={downloading}
            >
              {downloading ? (
                <ActivityIndicator size="small" color={theme.textColor} />
              ) : (
                <IconDownload size={18} color={theme.textColor} />
              )}
            </TouchableOpacity>

            {extractedCount > 0 && (
              <View style={[styles.extractBadge, { backgroundColor: theme.accentColor }]}>
                <Text style={styles.extractCount}>{extractedCount}</Text>
              </View>
            )}
          </>
        ) : null}
      </View>

      {/* 网页内容 */}
      <View style={styles.webviewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webview}
          onLoadingStart={() => setLoading(true)}
          onLoadingEnd={() => setLoading(false)}
          onMessage={handleWebViewMessage}
          onNavigationStateChange={(state: any) => {
            setCanGoBack(state.canGoBack);
            setCanGoForward(state.canGoForward);
            setUrl(state.url);
            setInputUrl(state.url);
          }}
          onShouldStartLoadWithRequest={(request: any) => {
            return true;
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
        />

        {loading && (
          <View style={[styles.loadingOverlay, { backgroundColor: 'rgba(0,0,0,0.1)' }]} pointerEvents="none">
            <ActivityIndicator size="large" color={theme.accentColor} />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  toolbarBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 6,
  },
  urlInput: {
    flex: 1,
    fontSize: 14,
    height: 36,
    padding: 0,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 12,
  },
  navBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  actionBtn: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  extractBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 4,
  },
  extractCount: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  webviewContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
