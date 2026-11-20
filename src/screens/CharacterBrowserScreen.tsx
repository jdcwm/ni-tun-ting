import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Alert, Image, ActivityIndicator, Modal, Animated, FlatList, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { generateId } from '../constants/defaults';
import { Character } from '../types';
import { storage } from '../utils/storage';
import {
  IconClose, IconSettings, IconSearch, IconDownload, IconImage, IconPlus, IconTrash,
  IconGlobe, IconEye, IconImport, IconChevronLeft, IconRefresh, IconStop, IconForward,
  IconCheck, IconCommunity,
} from '../components/Icons';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const DRAWER_W = SCREEN_W * 0.82;

interface Website {
  id: string;
  name: string;
  url: string;
  icon: string;
  color?: string;
}

interface BrowserChar {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  tags: string[];
  source: string;
  isLocal?: boolean;
  characterData?: Partial<Character>;
}

interface Props {
  mode?: 'browse' | 'picker';
  currentCharacterId?: string;
  onSelectCharacter?: (character: Character) => void;
  onGoToCommunity?: () => void;
  onClose: () => void;
  onImportCharacter?: (character: Character) => void;
}

const BUILTIN_WEBSITES: Website[] = [
  { id: 'tavern', name: 'TavernAI', url: 'https://www.tavernai.net', icon: 'T', color: '#ff6b9d' },
  { id: 'characterai', name: 'Character.AI', url: 'https://character.ai', icon: 'C', color: '#4285f4' },
  { id: 'janitor', name: 'JanitorAI', url: 'https://janitorai.com', icon: 'J', color: '#ff9f43' },
  { id: 'sillytavern', name: 'SillyTavern', url: 'https://sillytavern.app', icon: 'S', color: '#a55eea' },
  { id: 'lobe', name: 'LobeHub', url: 'https://lobehub.com', icon: 'L', color: '#26de81' },
  { id: 'charahub', name: 'CharaHub', url: 'https://charahub.org', icon: 'H', color: '#fd9644' },
  { id: 'risuai', name: 'RisuAI', url: 'https://risuai.net', icon: 'R', color: '#fc5c65' },
  { id: 'realmrisu', name: 'Realm RisuAI', url: 'https://realm.risuai.net', icon: 'RR', color: '#eb3b5a' },
  { id: 'taverncard', name: 'TavernCard', url: 'https://taverncard.com', icon: 'TC', color: '#2d3436' },
  { id: 'chractertavern', name: 'Character-Tavern', url: 'https://character-tavern.com', icon: 'CT', color: '#00b894' },
  { id: 'aicharactercards', name: 'AICharacterCards', url: 'https://aicharactercards.com', icon: 'AC', color: '#6c5ce7' },
  { id: 'local', name: '本地素材库', url: 'local', icon: '本', color: '#20bf6b' },
  { id: 'import', name: '从文件导入', url: 'import', icon: '导', color: '#4b7bec' },
];

const b64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const extractScript = `
(function() {
  try {
    var chars = [];
    var baseUrl = window.location.origin;
    var seen = {};

    function resolveUrl(url) {
      if (!url) return '';
      try {
        return new URL(url, baseUrl).href;
      } catch(e) {
        return url;
      }
    }

    function findImgSrc(el) {
      if (!el) return '';
      var img = el.querySelector('img');
      if (img) {
        var src = img.getAttribute('src') || img.src || '';
        if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
          return resolveUrl(src);
        }
        var dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
        if (dataSrc) return resolveUrl(dataSrc);
        var srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
        if (srcset) {
          var parts = srcset.split(',');
          if (parts.length > 0) {
            var first = parts[0].trim().split(' ')[0];
            if (first) return resolveUrl(first);
          }
        }
        var style = window.getComputedStyle(img);
        var bg = style.backgroundImage;
        if (bg && bg !== 'none') {
          var m = bg.match(/url(["']?)([^"')]+)\\1/);
          if (m && m[2]) return resolveUrl(m[2]);
        }
      }
      var styleEl = el;
      var elStyle = window.getComputedStyle(styleEl);
      var elBg = elStyle.backgroundImage;
      if (elBg && elBg !== 'none') {
        var m2 = elBg.match(/url(["']?)([^"')]+)\\1/);
        if (m2 && m2[2]) return resolveUrl(m2[2]);
      }
      return '';
    }

    function getText(el, selectors, maxLen) {
      for (var i = 0; i < selectors.length; i++) {
        var found = el.querySelector(selectors[i]);
        if (found) {
          var t = found.textContent.trim();
          if (t) return maxLen ? t.substring(0, maxLen) : t;
        }
      }
      return '';
    }

    function addChar(c) {
      if (!c || !c.name) return;
      var key = c.name.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      chars.push(c);
    }

    var selectors = [
      '[data-character]',
      '[data-char]',
      '[data-card]',
      '[data-character-card]',
      '[data-type="character"]',
      '.character-card',
      '.character-item',
      '.character-item-card',
      '[class*="character-card"]',
      '[class*="character-item"]',
      '[class*="CharacterCard"]',
      '[class*="CharacterItem"]',
      '[class*="characterCard"]',
      '[class*="characterItem"]',
      '.char-card',
      '.char-item',
      '.charcard',
      '.charitem',
      '[class*="char-card"]',
      '[class*="char-item"]',
      '[class*="charCard"]',
      '[class*="charItem"]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      els.forEach(function(el) {
        try {
          var dataAttr = el.getAttribute('data-character') || el.getAttribute('data-char') || el.getAttribute('data-card') || el.getAttribute('data-character-card');
          if (dataAttr) {
            var parsed = JSON.parse(dataAttr);
            if (parsed && parsed.name) {
              var tags = parsed.tags || parsed.tag_list || [];
              if (typeof tags === 'string') tags = tags.split(',').map(function(s) { return s.trim(); });
              addChar({
                type: 'character',
                name: parsed.name,
                description: parsed.description || parsed.desc || '',
                avatar: resolveUrl(parsed.avatar || parsed.image || parsed.avatar_url || parsed.image_url || ''),
                tags: tags,
                systemPrompt: parsed.systemPrompt || parsed.system_prompt || parsed.system || '',
                greeting: parsed.greeting || parsed.firstMessage || parsed.first_message || '',
                personality: parsed.personality || '',
                scenario: parsed.scenario || '',
                creator: parsed.creator || parsed.author || ''
              });
              return;
            }
          }
        } catch(e) {}
      });
    }

    if (chars.length === 0) {
      var nameSelectors = [
        'h1', 'h2', 'h3', 'h4',
        '.name', '.char-name', '.character-name',
        '[class*="name"]', '[class*="Name"]',
        '[itemprop="name"]',
        '[data-testid="character-name"]'
      ];
      var descSelectors = [
        'p', '.description', '.desc', '.char-desc', '.character-desc',
        '[class*="description"]', '[class*="Desc"]', '[class*="desc"]',
        '[itemprop="description"]',
        '[data-testid="character-description"]'
      ];
      var tagSelectors = [
        '.tag', '.tags', '.chip', '[class*="tag"]', '[class*="Tag"]',
        '[itemprop="keywords"]'
      ];
      var cards = document.querySelectorAll('[class*="card"], [class*="Card"], [class*="item"], [class*="Item"], [class*="post"], [class*="Post"], article, [class*="grid-item"]');
      cards.forEach(function(card) {
        var nameEl = null;
        for (var j = 0; j < nameSelectors.length && !nameEl; j++) {
          nameEl = card.querySelector(nameSelectors[j]);
        }
        if (!nameEl) return;
        var name = nameEl.textContent.trim();
        if (!name || name.length > 100) return;

        var descEl = null;
        for (var k = 0; k < descSelectors.length && !descEl; k++) {
          descEl = card.querySelector(descSelectors[k]);
        }

        var tags = [];
        for (var t = 0; t < tagSelectors.length; t++) {
          var tagEls = card.querySelectorAll(tagSelectors[t]);
          tagEls.forEach(function(te) {
            var txt = te.textContent.trim();
            if (txt && txt.length < 30 && tags.indexOf(txt) === -1) tags.push(txt);
          });
          if (tags.length > 0) break;
        }

        var avatar = findImgSrc(card);
        if (!avatar && card.querySelector('img')) {
          avatar = resolveUrl(card.querySelector('img').getAttribute('src') || card.querySelector('img').src || '');
        }

        addChar({
          type: 'character',
          name: name,
          description: descEl ? descEl.textContent.trim().substring(0, 300) : '',
          avatar: avatar,
          tags: tags
        });
      });
    }

    if (chars.length === 0) {
      var pageTitle = document.title || '';
      var metaDesc = '';
      var metaEl = document.querySelector('meta[name="description"]') || document.querySelector('meta[property="og:description"]');
      if (metaEl) metaDesc = metaEl.getAttribute('content') || '';
      var ogTitle = '';
      var ogTitleEl = document.querySelector('meta[property="og:title"]');
      if (ogTitleEl) ogTitle = ogTitleEl.getAttribute('content') || '';
      var ogImage = '';
      var ogImgEl = document.querySelector('meta[property="og:image"]');
      if (ogImgEl) ogImage = resolveUrl(ogImgEl.getAttribute('content') || '');
      var twitterTitle = '';
      var twEl = document.querySelector('meta[name="twitter:title"]');
      if (twEl) twitterTitle = twEl.getAttribute('content') || '';
      var finalName = ogTitle || twitterTitle || pageTitle;
      if (finalName) {
        addChar({
          type: 'character',
          name: finalName.substring(0, 100),
          description: metaDesc.substring(0, 300),
          avatar: ogImage,
          tags: []
        });
      }
    }

    if (chars.length > 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'characters', count: chars.length, samples: chars.slice(0, 8) }));
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'no_chars', url: window.location.href }));
    }
  } catch(err) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: err.message }));
  }
})();
`;

export const CharacterBrowserScreen: React.FC<Props> = ({
  mode = 'browse',
  currentCharacterId,
  onSelectCharacter,
  onGoToCommunity,
  onClose,
  onImportCharacter,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get('screen').height;
  const windowH = Dimensions.get('window').height;
  const navDiff = Math.abs(screenH - windowH);
  const bottomNavInset = Platform.OS === 'android' ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 8);
  const topInset = Math.max(insets.top, 8);
  const { characters: appCharacters, setCharacters: setAppCharacters } = useApp();
  const [activeSite, setActiveSite] = useState<Website>(BUILTIN_WEBSITES[0]);
  const [customSites] = useState<Website[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState(BUILTIN_WEBSITES[0].url);
  const [webLoading, setWebLoading] = useState(false);
  const [selectedSiteForChars, setSelectedSiteForChars] = useState<string>('全部');
  const [extractedChars, setExtractedChars] = useState<BrowserChar[]>([]);
  const [showImportFile, setShowImportFile] = useState(false);
  const [navigationKey, setNavigationKey] = useState(0);
  const [webError, setWebError] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [lastImportResult, setLastImportResult] = useState<{ chars: Character[]; message: string } | null>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [extractionFailed, setExtractionFailed] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const leftDrawerAnim = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageErrorRef = useRef<Set<string>>(new Set());
  const [imageErrorTick, setImageErrorTick] = useState(0);

  const handleImageError = useCallback((url: string) => {
    if (!imageErrorRef.current.has(url)) {
      imageErrorRef.current.add(url);
      setImageErrorTick((t) => t + 1);
    }
  }, []);

  const openLeftDrawer = useCallback(() => {
    setLeftDrawerOpen(true);
    Animated.timing(leftDrawerAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [leftDrawerAnim]);

  const closeLeftDrawer = useCallback(() => {
    Animated.timing(leftDrawerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setLeftDrawerOpen(false));
  }, [leftDrawerAnim]);

  const base64ToBytes = useCallback((b64: string): Uint8Array => {
    const bytes: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < b64.length; i++) {
      const c = b64[i];
      if (c === '=') break;
      const idx = b64Chars.indexOf(c);
      if (idx === -1) continue;
      buffer = (buffer << 6) | idx;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buffer >> bits) & 0xFF);
      }
    }
    return new Uint8Array(bytes);
  }, []);

  // Helper: bytes to base64 string
  const bytesToBase64 = useCallback((bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, []);

  // Helper: decode standard base64
  const decodeBase64 = useCallback((b64: string): string => {
    try {
      // Add padding if needed
      let padded = b64;
      while (padded.length % 4 !== 0) padded += '=';
      const decoded = atob(padded);
      return decoded;
    } catch {
      // Manual decode
      const bytes = base64ToBytes(b64);
      return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    }
  }, [base64ToBytes]);

  const localChars: BrowserChar[] = useMemo(() => appCharacters.map((char) => ({
    id: char.id,
    name: char.name,
    description: char.description || char.systemPrompt?.substring(0, 50) || '无描述',
    avatar: char.avatar,
    tags: char.tags || [],
    source: '本地素材库',
    isLocal: true,
    characterData: char,
  })), [appCharacters]);

  const allChars: BrowserChar[] = useMemo(() => [
    ...extractedChars,
    ...localChars.filter(lc => !extractedChars.find(ec => ec.id === lc.id)),
  ], [extractedChars, localChars]);

  const filterSites = useMemo(() => ['全部', ...Array.from(new Set(allChars.map(c => c.source)))], [allChars]);

  const filteredChars = useMemo(() => {
    return allChars.filter((c) => {
      const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase());
      if (selectedSiteForChars === '全部') return matchesSearch;
      return matchesSearch && c.source === selectedSiteForChars;
    });
  }, [allChars, searchQuery, selectedSiteForChars]);

  // Picker 模式：独立搜索框 + 过滤排序（仅用本地角色库）
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const pickerChars: Character[] = useMemo(() => {
    const q = pickerSearchQuery.trim().toLowerCase();
    const filtered = !q
      ? appCharacters
      : appCharacters.filter((c) => {
        const nameOk = c.name?.toLowerCase().includes(q);
        const descOk = c.description?.toLowerCase().includes(q);
        let tagsOk = false;
        if (c.tags && Array.isArray(c.tags)) {
          tagsOk = c.tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(q));
        }
        return nameOk || descOk || tagsOk;
      });
    return [...filtered].sort((a, b) => {
      const favA = a.isFavorite ? -1 : 1;
      const favB = b.isFavorite ? -1 : 1;
      if (favA !== favB) return favA - favB;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }, [appCharacters, pickerSearchQuery]);

  const handlePickerSelectChar = (character: Character) => {
    if (mode !== 'picker') return;
    if (typeof onSelectCharacter === 'function') {
      onSelectCharacter(character);
    }
    onClose();
  };

  const renderPickerCharItem = useCallback(({ item }: { item: Character }) => {
    const hasError = item.avatar && imageErrorRef.current.has(item.avatar);
    const isCurrent = mode === 'picker' && item.id === currentCharacterId;
    const descText = item.description || item.systemPrompt || '';
    return (
      <TouchableOpacity
        style={[
          styles.pickerCard,
          { backgroundColor: theme.primaryColor, borderColor: isCurrent ? theme.accentColor : theme.borderColor },
          isCurrent && { borderWidth: 2 },
        ]}
        onPress={() => handlePickerSelectChar(item)}
        activeOpacity={0.8}
      >
        {item.avatar && !hasError ? (
          <View style={styles.pickerAvatarWrap}>
            <Image
              source={{ uri: item.avatar }}
              style={styles.pickerAvatar}
              resizeMode="cover"
              onError={() => handleImageError(item.avatar!)}
            />
          </View>
        ) : (
          <View style={styles.pickerAvatarWrap}>
            <View style={[styles.pickerAvatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.pickerAvatarInitial, { color: theme.subTextColor }]}>
                {item.name ? item.name[0] : '?'}
              </Text>
            </View>
          </View>
        )}
        <View style={styles.pickerCardBody}>
          <View style={styles.pickerCardHeader}>
            <Text style={[styles.pickerCardName, { color: theme.textColor }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.isFavorite && (
              <Text style={{ color: theme.accentColor, fontSize: 14, marginLeft: 6 }}>★</Text>
            )}
          </View>
          {descText ? (
            <Text style={[styles.pickerCardDesc, { color: theme.subTextColor }]} numberOfLines={2}>
              {descText}
            </Text>
          ) : null}
          {item.tags && Array.isArray(item.tags) && item.tags.length > 0 ? (
            <View style={styles.pickerCardTags}>
              {item.tags.slice(0, 6).map((t, i) => (
                <View
                  key={`${t}-${i}`}
                  style={[styles.pickerTagChip, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
                >
                  <Text style={[styles.pickerTagChipText, { color: theme.subTextColor }]} numberOfLines={1}>
                    {t}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {isCurrent && (
          <View style={[styles.pickerCheckBadge, { backgroundColor: theme.accentColor }]}>
            <IconCheck size={14} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [theme, mode, currentCharacterId, handleImageError, imageErrorTick]);

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.timing(drawerAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setDrawerOpen(false));
  };

  const allSites = useMemo(() => [...BUILTIN_WEBSITES, ...customSites], [customSites]);

  const switchSite = useCallback((site: Website) => {
    setActiveSite(site);
    setUrlInput(site.url);
    setWebError(null);
    if (site.url === 'local') {
      setSelectedSiteForChars('本地素材库');
      setWebLoading(false);
    } else if (site.url === 'import') {
      setSelectedSiteForChars('全部');
      setWebLoading(false);
    } else {
      setSelectedSiteForChars(site.name);
      setNavigationKey(k => k + 1);
      setWebLoading(true);
    }
  }, []);

  const loadUrl = useCallback(() => {
    if (!urlInput.trim()) return;
    setWebError(null);
    setNavigationKey(k => k + 1);
    setWebLoading(true);
  }, [urlInput]);

  const reloadPage = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  }, []);

  const stopLoading = useCallback(() => {
    setWebLoading(false);
  }, []);

  const handleNavStateChange = useCallback((navState: WebViewNavigation) => {
    if (navState.loading) {
      setWebLoading(true);
      setWebError(null);
    } else {
      setWebLoading(false);
    }
  }, []);

  const importCharacter = useCallback((char: BrowserChar) => {
    if (char.isLocal && char.characterData) {
      Alert.alert('提示', `${char.name} 已存在于角色库中`);
      return;
    }
    Alert.alert(
      '导入角色',
      `将 "${char.name}" 导入到角色库？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '导入',
          onPress: async () => {
            const exists = appCharacters.some((c: Character) => c.name === char.name);
            if (exists) {
              Alert.alert('提示', `${char.name} 已存在于角色库中`);
              return;
            }
            const newChar: Character = {
              id: generateId(),
              name: char.name,
              description: char.description,
              systemPrompt: char.characterData?.systemPrompt || `You are ${char.name}. ${char.description}`,
              greeting: char.characterData?.greeting || `你好，我是${char.name}，很高兴见到你。`,
              tags: char.tags,
              avatar: char.avatar,
              isFavorite: false,
              createdAt: Date.now(),
              ...(char.characterData || {}),
            };

            // 社区资源表登记（手动导入/网页来源标记）+ import 日志
            try {
              await storage.saveCommunityResource('character', {
                resourceId: newChar.id,
                source: 'manual-import',
                metadata: { cardName: newChar.name, manual: true, via: char.source || 'browser' },
              });
              await storage.appendUserLog({
                type: 'import',
                target: { kind: 'character', id: newChar.id, name: newChar.name },
                meta: { via: char.source || 'browser' },
              });
            } catch (_logErr) { /* 登记失败不影响导入 */ }

            setAppCharacters([...appCharacters, newChar]);
            if (onImportCharacter) {
              onImportCharacter(newChar);
            }
            Alert.alert('成功', `${char.name} 已导入角色库`);
          },
        },
      ]
    );
  }, [appCharacters, setAppCharacters, onImportCharacter]);

  const extractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const extractCharsFromWeb = useCallback(() => {
    if (activeSite.url === 'local' || activeSite.url === 'import') {
      return;
    }
    setExtractionFailed(false);
    setExtractionLoading(true);
    if (extractTimerRef.current) {
      clearTimeout(extractTimerRef.current);
    }
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(extractScript);
    }
    extractTimerRef.current = setTimeout(() => {
      setExtractionLoading(false);
      setExtractionFailed(true);
    }, 5000);
  }, [activeSite]);

  const retryExtraction = useCallback(() => {
    setExtractionFailed(false);
    if (webViewRef.current) {
      webViewRef.current.reload();
      setTimeout(() => {
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(extractScript);
        }
      }, 1500);
    }
    setExtractionLoading(true);
    if (extractTimerRef.current) {
      clearTimeout(extractTimerRef.current);
    }
    extractTimerRef.current = setTimeout(() => {
      setExtractionLoading(false);
      setExtractionFailed(true);
    }, 5000);
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setSuccessMessage(message);
    setShowSuccessToast(true);
    toastTimerRef.current = setTimeout(() => {
      setShowSuccessToast(false);
    }, 2500);
  }, []);

  const handleWebMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'characters' && data.samples) {
        if (extractTimerRef.current) {
          clearTimeout(extractTimerRef.current);
          extractTimerRef.current = null;
        }
        setExtractionLoading(false);
        setExtractionFailed(false);
        const newChars: BrowserChar[] = data.samples.map((item: any, index: number) => ({
          id: `web_${Date.now()}_${index}`,
          name: item.name || '未命名角色',
          description: item.description || '',
          avatar: item.avatar,
          tags: item.tags || [],
          source: activeSite.name,
          isLocal: false,
          characterData: {
            systemPrompt: item.systemPrompt,
            greeting: item.greeting,
            description: item.description,
            avatar: item.avatar,
            tags: item.tags,
            personality: item.personality,
            scenario: item.scenario,
            creator: item.creator,
          },
        }));
        setExtractedChars(prev => [...newChars, ...prev.filter(p => !newChars.find(nc => nc.id === p.id))]);
        setSelectedSiteForChars(activeSite.name);
        if (newChars.length > 0) {
          showToast(`✓ 发现 ${newChars.length} 个角色卡`);
          openDrawer();
        } else {
          setExtractionFailed(true);
        }
      } else if (data.type === 'no_chars') {
        if (extractTimerRef.current) {
          clearTimeout(extractTimerRef.current);
          extractTimerRef.current = null;
        }
        setExtractionLoading(false);
        setExtractionFailed(true);
        Alert.alert('提示', '未能在当前页面检测到角色卡数据。请尝试在网站中打开具体的角色卡页面后再提取。');
      } else if (data.type === 'error') {
        if (extractTimerRef.current) {
          clearTimeout(extractTimerRef.current);
          extractTimerRef.current = null;
        }
        setExtractionLoading(false);
        setExtractionFailed(true);
        Alert.alert('提取错误', data.message || '未知错误');
      }
    } catch (e) {
      // ignore non-JSON messages
    }
  }, [activeSite, showToast]);

  const handleWebError = useCallback((syntheticEvent: any) => {
    setWebError(syntheticEvent?.nativeEvent?.description || '网页加载失败，请检查网络连接或URL是否正确');
    setWebLoading(false);
  }, []);

  const deleteCustomSite = (_site: Website) => {
    // Custom site management disabled
    Alert.alert('提示', '自定义网站已禁用。');
  };

  // Simple inflate for zlib/deflate decompression (needed for zTXt/iTXt PNG chunks)
  // This implementation handles fixed Huffman codes (most common for zTXt data)
  const simpleInflate = useCallback((compressed: Uint8Array): Uint8Array => {
    // Skip zlib header if present
    let src = compressed;
    if (compressed.length >= 2 && compressed[0] === 0x78) {
      src = compressed.slice(2);
      // Skip adler32 checksum (last 4 bytes)
      src = src.slice(0, src.length - 4);
    }

    // Raw deflate decompressor (fixed Huffman only, sufficient for most zTXt data)
    const output: number[] = [];
    let bitBuf = 0;
    let bitCount = 0;
    let bytePos = 0;

    const readBits = (count: number): number => {
      let val = 0;
      for (let i = 0; i < count; i++) {
        if (bitCount === 0) {
          if (bytePos >= src.length) return -1;
          bitBuf = src[bytePos++];
          bitCount = 8;
        }
        val = (val << 1) | ((bitBuf >> 7) & 1);
        bitBuf <<= 1;
        bitCount--;
      }
      return val;
    };

    const readCode = (tree: number[]): number => {
      let code = 0;
      for (let i = 0; i < 15; i++) {
        const bit = readBits(1);
        if (bit === -1) return -1;
        code = (code << 1) | bit;
        if (tree[code] !== undefined) return tree[code];
      }
      return -1;
    };

    // Build fixed Huffman code tables
    const litLenTree: number[] = new Array(512).fill(-1);
    const distTree: number[] = new Array(32).fill(-1);

    // Fixed Huffman for lit/len: 0-143 (8 bits), 144-255 (9 bits), 256-279 (7 bits), 280-287 (8 bits)
    // We need a binary tree lookup
    const buildFixedLitLen = (): number[] => {
      const table: number[] = [];
      for (let code = 0; code < 288; code++) {
        let bits: number;
        if (code < 144) bits = 8;
        else if (code < 256) bits = 9;
        else if (code < 280) bits = 7;
        else bits = 8;
        // Reverse bits
        let rev = 0;
        let c = code;
        for (let i = 0; i < bits; i++) {
          rev = (rev << 1) | (c & 1);
          c >>= 1;
        }
        // Insert into table
        const maxSize = 1 << 15;
        while (table.length < maxSize) table.push(-1);
        table[rev] = code;
      }
      return table;
    };

    const buildFixedDist = (): number[] => {
      const table: number[] = new Array(32768).fill(-1);
      for (let code = 0; code < 30; code++) {
        // Fixed distance codes: all 5 bits, but code 2-29 are used
        if (code < 2) continue;
        let rev = 0;
        let c = code;
        for (let i = 0; i < 5; i++) {
          rev = (rev << 1) | (c & 1);
          c >>= 1;
        }
        table[rev] = code;
      }
      return table;
    };

    const litLenTable = buildFixedLitLen();
    const distTable = buildFixedDist();

    // Process blocks
    while (bytePos < src.length - 4) {
      const bfinal = readBits(1);
      const btype = readBits(2);

      if (bfinal === -1 || btype === -1) break;

      if (btype === 0) {
        // Stored block
        // Align to byte
        if (bitCount > 0 && bitCount < 8) {
          bytePos++;
          bitCount = 0;
        }
        const len = (src[bytePos] << 8) | src[bytePos + 1];
        bytePos += 4; // skip length + ~length
        for (let i = 0; i < len && bytePos + i < src.length; i++) {
          output.push(src[bytePos + i]);
        }
        bytePos += len;
      } else if (btype === 1) {
        // Fixed Huffman
        while (true) {
          let code = readCode(litLenTable);
          if (code === -1) break;
          if (code < 256) {
            output.push(code);
          } else if (code === 256) {
            break; // end of block
          } else {
            // Length code 257-285
            let length = 0;
            let extraBits = 0;
            if (code >= 257 && code <= 264) {
              length = code - 257 + 3;
              extraBits = 0;
            } else if (code === 265) { length = 11; extraBits = 1; }
            else if (code === 266) { length = 13; extraBits = 2; }
            else if (code === 267) { length = 17; extraBits = 3; }
            else if (code === 268) { length = 25; extraBits = 4; }
            else if (code === 269) { length = 33; extraBits = 5; }
            else if (code === 270) { length = 49; extraBits = 6; }
            else if (code === 271) { length = 65; extraBits = 7; }
            else if (code === 272) { length = 97; extraBits = 8; }
            else if (code === 273) { length = 129; extraBits = 9; }
            else if (code === 274) { length = 193; extraBits = 10; }
            else if (code === 275) { length = 257; extraBits = 11; }
            else if (code === 276) { length = 385; extraBits = 12; }
            else { length = 258; extraBits = 0; }

            if (extraBits > 0) {
              const extra = readBits(extraBits);
              if (extra === -1) break;
              length += extra;
            }

            // Distance code
            const distCode = readCode(distTable);
            if (distCode === -1) break;

            let distance = 0;
            let distExtraBits = 0;
            const distBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
            if (distCode < distBase.length) {
              distance = distBase[distCode];
              distExtraBits = distCode < 2 ? 0 : Math.floor((distCode - 2) / 2 + 1);
            }

            if (distExtraBits > 0) {
              const extra = readBits(distExtraBits);
              if (extra === -1) break;
              distance += extra;
            }

            // Copy from output
            for (let i = 0; i < length; i++) {
              const idx = output.length - distance;
              if (idx >= 0 && idx < output.length) {
                output.push(output[idx]);
              } else {
                output.push(0);
              }
            }
          }
        }
      } else {
        // Dynamic Huffman - not supported
        break;
      }
    }

    return new Uint8Array(output);
  }, []);

  const parsePngCharacterCard = useCallback(async (uri: string): Promise<any | null> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = base64ToBytes(base64);
      if (bytes.length < 8) return null;
      const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
      for (let i = 0; i < 8; i++) {
        if (bytes[i] !== pngSignature[i]) return null;
      }

      const allTextChunks: { keyword: string; data: string; compressed: boolean; rawData?: Uint8Array }[] = [];
      let offset = 8;
      while (offset < bytes.length) {
        if (offset + 8 > bytes.length) break;
        const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

        if (type === 'tEXt') {
          // tEXt chunk: keyword\0text
          let nullIdx = -1;
          for (let i = offset + 8; i < offset + 8 + length && i < bytes.length; i++) {
            if (bytes[i] === 0) { nullIdx = i; break; }
          }
          if (nullIdx > offset + 8) {
            const keyword = String.fromCharCode(...bytes.slice(offset + 8, nullIdx));
            const textData = String.fromCharCode(...bytes.slice(nullIdx + 1, offset + 8 + length));
            allTextChunks.push({ keyword, data: textData, compressed: false });
          }
        } else if (type === 'zTXt') {
          // zTXt chunk: keyword\0compressionMethod(1byte) + compressedData
          let nullIdx = -1;
          for (let i = offset + 8; i < offset + 8 + length && i < bytes.length; i++) {
            if (bytes[i] === 0) { nullIdx = i; break; }
          }
          if (nullIdx > offset + 8 && nullIdx + 1 < offset + 8 + length) {
            const keyword = String.fromCharCode(...bytes.slice(offset + 8, nullIdx));
            // compression method byte at nullIdx+1
            const compressedData = bytes.slice(nullIdx + 2, offset + 8 + length);
            allTextChunks.push({ keyword, data: '', compressed: true, rawData: compressedData });
          }
        } else if (type === 'iTXt') {
          // iTXt chunk: keyword\0compressionFlag(1byte)compressionMethod(1byte)languageTag\0translatedKeyword\0text
          const chunkData = bytes.slice(offset + 8, offset + 8 + length);
          // Parse: keyword\0
          let keywordEnd = -1;
          for (let i = 0; i < chunkData.length; i++) {
            if (chunkData[i] === 0) { keywordEnd = i; break; }
          }
          if (keywordEnd > 0) {
            const keyword = String.fromCharCode(...chunkData.slice(0, keywordEnd));
            let pos = keywordEnd + 1;
            if (pos >= chunkData.length) break;

            const compressionFlag = chunkData[pos];
            pos++;
            if (pos >= chunkData.length) break;

            const compressionMethod = chunkData[pos];
            pos++;

            // languageTag\0
            let langEnd = -1;
            for (let i = pos; i < chunkData.length; i++) {
              if (chunkData[i] === 0) { langEnd = i; break; }
            }
            if (langEnd === -1) break;
            pos = langEnd + 1;

            // translatedKeyword\0
            let transEnd = -1;
            for (let i = pos; i < chunkData.length; i++) {
              if (chunkData[i] === 0) { transEnd = i; break; }
            }
            if (transEnd === -1) break;
            pos = transEnd + 1;

            // Rest is text
            const textBytes = chunkData.slice(pos);
            if (compressionFlag === 1) {
              // Compressed text
              allTextChunks.push({ keyword, data: '', compressed: true, rawData: textBytes });
            } else {
              const textData = String.fromCharCode(...textBytes);
              allTextChunks.push({ keyword, data: textData, compressed: false });
            }
          }
        }

        if (type === 'iEND') break;
        offset += 8 + length + 4;
      }

      // Decompress compressed chunks
      for (const chunk of allTextChunks) {
        if (chunk.compressed && chunk.rawData) {
          try {
            const decompressed = simpleInflate(chunk.rawData);
            chunk.data = String.fromCharCode.apply(null, Array.from(decompressed));
            chunk.compressed = false;
          } catch {
            // Decompression failed, try as base64-encoded compressed
            try {
              const b64 = bytesToBase64(chunk.rawData);
              const decoded = decodeBase64(b64);
              chunk.data = decoded;
              chunk.compressed = false;
            } catch {
              chunk.data = '';
            }
          }
        }
      }

      // Helper: try extract character fields from parsed JSON
      const extractCharacterData = (parsed: any): any | null => {
        if (!parsed) return null;
        // V2 spec: wrapped in {"spec": "chara_card_v2", "spec_version": "2.0", "data": {...}}
        if (parsed.spec === 'chara_card_v2' && parsed.data) {
          const d = parsed.data;
          return {
            name: d.name || '',
            description: d.description || '',
            personality: d.personality || '',
            scenario: d.scenario || '',
            first_mes: d.first_mes || '',
            mes_example: d.mes_example || '',
            system_prompt: d.system_prompt || '',
            post_history_instructions: d.post_history_instructions || '',
            alternate_greetings: d.alternate_greetings || [],
            tags: d.tags || [],
            creator: d.creator || '',
            character_version: d.character_version || '',
            creator_notes: d.creator_notes || '',
            extensions: d.extensions || {},
          };
        }
        // Flat V1/legacy format
        if (parsed.name || parsed.description || parsed.personality || parsed.first_mes) {
          return {
            name: parsed.name || '',
            description: parsed.description || '',
            personality: parsed.personality || '',
            scenario: parsed.scenario || '',
            first_mes: parsed.first_mes || parsed.greeting || '',
            mes_example: parsed.mes_example || parsed.messageExample || '',
            system_prompt: parsed.system_prompt || parsed.systemPrompt || '',
            post_history_instructions: parsed.post_history_instructions || '',
            alternate_greetings: parsed.alternate_greetings || [],
            tags: parsed.tags || [],
            creator: parsed.creator || '',
            character_version: parsed.character_version || '',
            creator_notes: parsed.creator_notes || '',
          };
        }
        return null;
      };

      const tryParseJSON = (text: string): any | null => {
        try {
          const parsed = JSON.parse(text);
          const extracted = extractCharacterData(parsed);
          if (extracted) return extracted;
        } catch { /* not JSON */ }
        return null;
      };

      // Priority: tavern (V1) > chara (V2 base64) > character > prompt
      const tavernChunk = allTextChunks.find(c => c.keyword === 'tavern');
      const charaChunk = allTextChunks.find(c => c.keyword === 'chara');
      const characterChunk = allTextChunks.find(c => c.keyword === 'character');
      const promptChunk = allTextChunks.find(c => c.keyword === 'prompt');
      const specChunk = allTextChunks.find(c => c.keyword === 'chara_card_v2');

      // V1 spec: keyword "tavern" contains raw JSON
      if (tavernChunk && !tavernChunk.compressed && tavernChunk.data) {
        const parsed = tryParseJSON(tavernChunk.data);
        if (parsed) return parsed;
        // Try as plain text character
        if (tavernChunk.data.length > 10) {
          return { name: 'TavernAI角色卡', description: tavernChunk.data.substring(0, 300), avatar: uri, system_prompt: tavernChunk.data };
        }
      }

      // V2 spec: keyword "chara" contains base64-encoded JSON
      if (charaChunk && charaChunk.data) {
        try {
          const decoded = decodeBase64(charaChunk.data);
          const parsed = tryParseJSON(decoded);
          if (parsed) return parsed;
        } catch { /* fallback */ }
        // Try raw data (not base64)
        const parsed = tryParseJSON(charaChunk.data);
        if (parsed) return parsed;
      }

      // Spec keyword "chara_card_v2"
      if (specChunk && specChunk.data) {
        const parsed = tryParseJSON(specChunk.data);
        if (parsed) return parsed;
      }

      // Legacy: keyword "character" or "prompt"
      if (characterChunk && characterChunk.data) {
        const parsed = tryParseJSON(characterChunk.data);
        if (parsed) return parsed;
        return { name: '角色卡', description: characterChunk.data.substring(0, 300), avatar: uri, system_prompt: characterChunk.data };
      }
      if (promptChunk && promptChunk.data) {
        return { name: '角色卡', description: promptChunk.data.substring(0, 300), avatar: uri, system_prompt: promptChunk.data };
      }

      // No character data found in PNG chunks - create a proper character card from the image
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists && fileInfo.size > 0) {
        return {
          name: '图片角色卡',
          description: `从图片导入的角色卡`,
          avatar: uri,
          personality: '',
          scenario: '',
          first_mes: '',
          mes_example: '',
          system_prompt: '',
        };
      }

      return null;
    } catch {
      return null;
    }
  }, [base64ToBytes, bytesToBase64, decodeBase64, simpleInflate]);

  const importFromFile = useCallback(async () => {
    try {
      const { importCharacterCardFile, normalizeCharacterCard } = await import('../utils/characterCardImport');
      const result = await importCharacterCardFile();
      if (!result) return;

      if (result.chatImported) {
        Alert.alert('提示', '检测到对话 JSON，请在对话列表中使用导入功能');
        return;
      }

      if (result.characters.length > 0) {
        // 社区资源表登记（手动导入文件）+ import 日志：为每个导入角色逐条写入
        try {
          await Promise.all(result.characters.map(async (ch: Character) => {
            try {
              await storage.saveCommunityResource('character', {
                resourceId: ch.id,
                source: 'manual-import',
                metadata: { cardName: ch.name, manual: true, via: 'file' },
              });
              await storage.appendUserLog({
                type: 'import',
                target: { kind: 'character', id: ch.id, name: ch.name },
                meta: { via: 'file' },
              });
            } catch { /* 单条失败不影响其他 */ }
          }));
        } catch (_logErr) { /* 登记失败不影响导入 */ }

        setAppCharacters([...appCharacters, ...result.characters]);
        setLastImportResult({ chars: result.characters, message: `已成功导入 ${result.characters.length} 个角色` });
        showToast(`已导入 ${result.characters.length} 个角色`);
      } else {
        Alert.alert('提示', '未找到有效的角色数据');
      }
    } catch (error: any) {
      Alert.alert('导入失败', error.message || '未知错误');
    }
  }, [appCharacters, setAppCharacters, showToast]);

  const quickImportLastFile = useCallback(async () => {
    if (!lastImportResult || lastImportResult.chars.length === 0) return;
    try {
      await Promise.all(lastImportResult.chars.map(async (ch: Character) => {
        try {
          await storage.saveCommunityResource('character', {
            resourceId: ch.id,
            source: 'manual-import',
            metadata: { cardName: ch.name, manual: true, via: 'file-reimport' },
          });
          await storage.appendUserLog({
            type: 'import',
            target: { kind: 'character', id: ch.id, name: ch.name },
            meta: { via: 'file-reimport' },
          });
        } catch { /* ignore */ }
      }));
    } catch { /* ignore */ }
    setAppCharacters([...appCharacters, ...lastImportResult.chars]);
    showToast(`✓ 重新导入 ${lastImportResult.chars.length} 个角色`);
  }, [appCharacters, setAppCharacters, lastImportResult, showToast]);

  const drawerTranslateX = drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [DRAWER_W, 0] });
  const overlayOpacity = drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

  const renderCharItem = useCallback(({ item }: { item: BrowserChar }) => {
    const hasError = item.avatar && imageErrorRef.current.has(item.avatar);
    return (
      <View style={[styles.gridCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        {item.avatar && !hasError ? (
          <View style={styles.gridCardAvatar}>
            <Image
              source={{ uri: item.avatar }}
              style={styles.gridCardAvatarImg}
              resizeMode="cover"
              onError={() => handleImageError(item.avatar!)}
            />
          </View>
        ) : (
          <View style={styles.gridCardAvatar}>
            <View style={[styles.gridCardAvatarBg, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.gridCardInitial, { color: theme.subTextColor }]}>{item.name ? item.name[0] : '?'}</Text>
            </View>
          </View>
        )}
        <Text style={[styles.gridCardName, { color: theme.textColor }]} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
        {item.description ? (
          <Text style={[styles.gridCardDesc, { color: theme.subTextColor }]} numberOfLines={2} ellipsizeMode="tail">{item.description}</Text>
        ) : null}
        <View style={styles.gridCardSource}>
          <Text style={[styles.gridCardSourceText, { color: theme.subTextColor }]} numberOfLines={1} ellipsizeMode="tail">{item.source}</Text>
        </View>
        {item.isLocal ? (
          <View style={[styles.gridStatusBadge, { backgroundColor: theme.secondaryColor }]}>
            <Text style={{ color: theme.subTextColor, fontSize: 11 }}>✓ 已在库中</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.gridImportBtn, { backgroundColor: theme.accentColor }]}
            onPress={() => importCharacter(item)}
            activeOpacity={0.7}
          >
            <IconImport size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4 }}>导入</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [theme, handleImageError, importCharacter]);

  // ===================== Picker Mode（角色库 / 选择角色全屏页） =====================
  if (mode === 'picker') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top', 'left', 'right', 'bottom']}>
        {/* 顶部栏：标题 / 取消按钮 + 从社区获取 */}
        <View style={[styles.pickerTopBar, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor, paddingTop: topInset + 2 }]}>
          <TouchableOpacity style={styles.pickerCancelBtn} onPress={onClose}>
            <Text style={{ color: theme.subTextColor, fontSize: 14 }}>取消</Text>
          </TouchableOpacity>
          <Text style={[styles.pickerTitle, { color: theme.textColor }]}>选择角色</Text>
          <View style={styles.pickerTopRight}>
            {onGoToCommunity && (
              <TouchableOpacity
                style={[styles.pickerCommunityBtn, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
                onPress={onGoToCommunity}
              >
                <IconCommunity size={14} color={theme.accentColor} />
                <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '500', marginLeft: 4 }}>从社区获取</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 搜索框 */}
        <View style={[styles.pickerSearchWrap, { backgroundColor: theme.backgroundColor, borderBottomColor: theme.borderColor }]}>
          <View style={[styles.pickerSearchBox, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
            <IconSearch size={16} color={theme.subTextColor} />
            <TextInput
              style={[styles.pickerSearchInput, { color: theme.textColor }]}
              value={pickerSearchQuery}
              onChangeText={setPickerSearchQuery}
              placeholder="搜索角色名称 / 标签"
              placeholderTextColor={theme.subTextColor}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* 角色列表 */}
        {pickerChars.length === 0 ? (
          <View style={styles.pickerEmpty}>
            <IconGlobe size={48} color={theme.subTextColor} />
            <Text style={{ color: theme.subTextColor, fontSize: 14, marginTop: 16 }}>
              {pickerSearchQuery ? '未找到匹配的角色' : '角色库为空'}
            </Text>
            {onGoToCommunity && !pickerSearchQuery && (
              <TouchableOpacity
                style={[styles.pickerEmptyBtn, { backgroundColor: theme.accentColor, marginTop: 20 }]}
                onPress={onGoToCommunity}
              >
                <IconCommunity size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>去社区获取角色</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            style={styles.pickerList}
            contentContainerStyle={{ padding: 12, paddingBottom: bottomNavInset + 24 }}
            data={pickerChars}
            renderItem={renderPickerCharItem}
            keyExtractor={(item) => item.id}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== 'web'}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            extraData={imageErrorTick}
            ListFooterComponent={<View style={{ height: 24 }} />}
          />
        )}
      </SafeAreaView>
    );
  }

  // ===================== Browse Mode（原有浏览/导入页面） =====================
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top']}>
      {/* 布局层级（从低到高）：Content < overlay(50) < drawer(100) < closeFloatBtn(200) */}
      {/* 顶部搜索框（browse 模式也提供角色搜索） */}
      <View style={[styles.browseTopSearch, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor, paddingTop: topInset + 2 }]}>
        <View style={[styles.browseTopSearchBox, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
          <IconSearch size={16} color={theme.subTextColor} />
          <TextInput
            style={[styles.browseTopSearchInput, { color: theme.textColor }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜索角色名称 / 标签"
            placeholderTextColor={theme.subTextColor}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>
      {/* Left Panel - Browser */}
      <View style={styles.leftPanel}>
        {/* Header: Close | URL Bar | Site List / View Chars */}
        <View style={[styles.topHeader, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor, paddingBottom: 6 }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
            <IconClose size={18} color={theme.textColor} />
          </TouchableOpacity>
          <View style={styles.urlBarWrap}>
            <TextInput
              style={[styles.urlBar, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
              value={urlInput}
              onChangeText={setUrlInput}
              onSubmitEditing={loadUrl}
              placeholder="输入网址或选择网站"
              placeholderTextColor={theme.subTextColor}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          {webLoading ? (
            <TouchableOpacity style={styles.headerBtn} onPress={stopLoading}>
              <IconStop size={16} color={theme.accentColor} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.headerBtn} onPress={openLeftDrawer}>
              <IconGlobe size={18} color={theme.accentColor} />
            </TouchableOpacity>
          )}
        </View>

        {/* Browser / Web Content */}
        <View style={[styles.browserArea, { backgroundColor: theme.backgroundColor }]}>
          {activeSite.url === 'local' ? (
            <View style={styles.localLib}>
              <View style={[styles.localIconCircle, { backgroundColor: theme.secondaryColor }]}>
                <IconGlobe size={48} color={theme.subTextColor} />
              </View>
              <Text style={[styles.localTitle, { color: theme.textColor }]}>本地素材库</Text>
              <Text style={[styles.localDesc, { color: theme.subTextColor }]}>点击右侧"查看"按钮浏览和管理本地角色卡</Text>
              <TouchableOpacity style={[styles.localOpenBtn, { backgroundColor: theme.accentColor }]} onPress={openDrawer}>
                <IconEye size={18} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '600' }}>查看角色卡</Text>
              </TouchableOpacity>
              {appCharacters.length > 0 && (
                <Text style={[styles.localCount, { color: theme.subTextColor }]}>
                  已有 {appCharacters.length} 个角色
                </Text>
              )}
            </View>
          ) : activeSite.url === 'import' ? (
            <View style={styles.localLib}>
              <View style={[styles.localIconCircle, { backgroundColor: theme.secondaryColor }]}>
                <IconImport size={48} color={theme.subTextColor} />
              </View>
              <Text style={[styles.localTitle, { color: theme.textColor }]}>从文件导入</Text>
              <Text style={[styles.localDesc, { color: theme.subTextColor }]}>导入角色卡文件（支持 JSON 和 PNG 格式）</Text>
              <TouchableOpacity style={[styles.localOpenBtn, { backgroundColor: theme.accentColor }]} onPress={importFromFile}>
                <IconImport size={18} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '600' }}>选择文件导入</Text>
              </TouchableOpacity>
              {lastImportResult && lastImportResult.chars.length > 0 && (
                <TouchableOpacity style={[styles.quickImportBtn, { backgroundColor: theme.secondaryColor, borderColor: theme.accentColor }]} onPress={quickImportLastFile}>
                  <IconRefresh size={16} color={theme.accentColor} />
                  <Text style={{ color: theme.accentColor, marginLeft: 6, fontWeight: '600', fontSize: 13 }}>快速导入上次文件 ({lastImportResult.chars.length}个)</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.localHint, { color: theme.subTextColor }]}>支持格式：JSON, PNG (TavernAI角色卡)</Text>
            </View>
          ) : (
            <>
              <WebView
                ref={webViewRef}
                key={`${urlInput}-${navigationKey}`}
                source={{ uri: urlInput }}
                style={styles.webview}
                onLoadStart={() => setWebLoading(true)}
                onLoadEnd={() => setWebLoading(false)}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
                onNavigationStateChange={handleNavStateChange}
                onError={handleWebError}
                originWhitelist={['*']}
                setSupportMultipleWindows={false}
              />
              {webLoading && (
                <View style={styles.webLoadingOverlay}>
                  <ActivityIndicator size="large" color={theme.accentColor} />
                  <Text style={[styles.webLoadingText, { color: theme.subTextColor }]}>加载中...</Text>
                </View>
              )}
              {webError && !webLoading && (
                <View style={styles.webErrorOverlay}>
                  <Text style={[styles.webErrorText, { color: theme.textColor }]}>加载失败</Text>
                  <Text style={[styles.webErrorDesc, { color: theme.subTextColor }]}>{webError}</Text>
                  <TouchableOpacity style={[styles.webErrorBtn, { backgroundColor: theme.accentColor }]} onPress={loadUrl}>
                    <IconRefresh size={16} color="#fff" />
                    <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '600' }}>重试</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* Minimal floating actions */}
              <View style={[styles.floatingActions, { bottom: 12 + bottomNavInset }]}>
                <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]} onPress={reloadPage}>
                  <IconRefresh size={16} color={theme.textColor} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.floatingBtn, { backgroundColor: theme.accentColor }]} onPress={openDrawer}>
                  <IconEye size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Bottom action */}
        <View style={[styles.bottomBar, { backgroundColor: theme.menuBgColor, borderTopColor: theme.borderColor, paddingBottom: bottomNavInset }]}>
          <TouchableOpacity style={[styles.bottomBtn, { backgroundColor: theme.accentColor }]} onPress={openDrawer}>
            <IconEye size={16} color="#fff" />
            <Text style={{ color: '#fff', marginLeft: 4, fontWeight: '600', fontSize: 13 }}>查看角色卡 ({filteredChars.length})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Overlay */}
      {(drawerOpen || leftDrawerOpen) && (
        <TouchableOpacity
          style={[styles.overlay, { zIndex: 50 }]}
          activeOpacity={1}
          onPress={() => { closeDrawer(); closeLeftDrawer(); }}
        >
          <Animated.View style={[styles.overlayFill, { opacity: Animated.add(overlayOpacity, leftDrawerAnim), backgroundColor: '#000' }]} />
        </TouchableOpacity>
      )}

      {/* Left Drawer - Site List (swipe right to open) */}
      {leftDrawerOpen && (
        <Animated.View
          style={[
            styles.leftDrawer,
            { backgroundColor: theme.menuBgColor, borderRightColor: theme.borderColor, zIndex: 100 },
            { transform: [{ translateX: leftDrawerAnim.interpolate({ inputRange: [0, 1] as [number, number], outputRange: [-DRAWER_W, 0] as [number, number] }) }] },
          ]}
        >
          <View style={[styles.drawerHeader, { backgroundColor: theme.primaryColor, borderBottomColor: theme.borderColor, paddingTop: topInset + 2 }]}>
            <Text style={[styles.drawerHeaderTitle, { color: theme.textColor }]}>角色卡网站</Text>
            <TouchableOpacity onPress={closeLeftDrawer} style={styles.drawerCloseBtn}>
              <IconClose size={20} color={theme.textColor} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: bottomNavInset + 24 }}>
            {/* 便捷导入按钮 - 直接触发文件选择 */}
            <TouchableOpacity
              style={[styles.quickImportBtn, { backgroundColor: theme.accentColor, borderColor: theme.borderColor }]}
              onPress={async () => { closeLeftDrawer(); await importFromFile(); }}
              activeOpacity={0.7}
            >
              <IconImport size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginLeft: 8 }}>导入角色卡</Text>
            </TouchableOpacity>
            <View style={{ height: 12 }} />
            <Text style={[styles.drawerSectionLabel, { color: theme.subTextColor }]}>角色卡网站</Text>
            <View style={{ height: 8 }} />
            {BUILTIN_WEBSITES.filter(s => s.url !== 'local' && s.url !== 'import').map((site) => {
              const isActive = activeSite.id === site.id;
              return (
                <TouchableOpacity
                  key={site.id}
                  style={[
                    styles.siteRowItem,
                    {
                      backgroundColor: isActive ? (site.color || theme.accentColor) : theme.secondaryColor,
                      borderColor: isActive ? (site.color || theme.accentColor) : theme.borderColor,
                    },
                  ]}
                  onPress={() => { switchSite(site); closeLeftDrawer(); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.siteRowIcon, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : (site.color || theme.primaryColor) }]}>
                    <Text style={[styles.siteRowTextIcon, { color: isActive ? '#fff' : theme.textColor }]}>{site.icon}</Text>
                  </View>
                  <Text style={{ color: isActive ? '#fff' : theme.textColor, fontSize: 14, fontWeight: '500', flex: 1 }}>{site.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}

      {/* Right Drawer - Character Grid */}
      {drawerOpen && (
        <Animated.View style={[styles.drawer, { backgroundColor: theme.menuBgColor, borderLeftColor: theme.borderColor, zIndex: 100 }, { transform: [{ translateX: drawerTranslateX }] }]}>
          {/* Drawer Header */}
          <View style={[styles.drawerHeader, { backgroundColor: theme.primaryColor, borderBottomColor: theme.borderColor, paddingTop: topInset + 2 }]}>
            <Text style={[styles.drawerHeaderTitle, { color: theme.textColor }]}>{selectedSiteForChars}</Text>
            <TouchableOpacity onPress={closeDrawer} style={styles.drawerCloseBtn}>
              <IconClose size={20} color={theme.textColor} />
            </TouchableOpacity>
          </View>

          {/* Filter Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs} contentContainerStyle={styles.filterTabsContent}>
            {filterSites.map((site) => (
              <TouchableOpacity
                key={site}
                style={[styles.filterTab, { backgroundColor: selectedSiteForChars === site ? theme.accentColor : theme.secondaryColor, borderColor: theme.borderColor }]}
                onPress={() => setSelectedSiteForChars(site)}
              >
                <Text style={{ color: selectedSiteForChars === site ? '#fff' : theme.textColor, fontSize: 12, fontWeight: '500' }}>{site}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Search */}
          <View style={[styles.drawerSearch, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
            <IconSearch size={16} color={theme.subTextColor} />
            <TextInput
              style={[styles.drawerSearchInput, { color: theme.textColor }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="搜索角色..."
              placeholderTextColor={theme.subTextColor}
            />
          </View>

          {/* Character Grid */}
          {filteredChars.length === 0 ? (
            <View style={styles.drawerEmpty}>
              <IconGlobe size={48} color={theme.subTextColor} />
              <Text style={{ color: theme.subTextColor, fontSize: 14, marginTop: 16 }}>暂无角色卡</Text>
              <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
                {selectedSiteForChars === '本地素材库'
                  ? '您还没有导入任何角色，点击右上角图标打开网站列表，或选择"从文件导入"开始'
                  : '在浏览器中打开角色卡网站后，点击右侧按钮查看提取的角色卡'}
              </Text>
              <TouchableOpacity
                style={[styles.emptyActionBtn, { backgroundColor: theme.accentColor }]}
                onPress={() => { closeDrawer(); switchSite(BUILTIN_WEBSITES.find(s => s.url === 'import') || BUILTIN_WEBSITES[0]); }}
              >
                <IconImport size={16} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '600' }}>从文件导入</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              style={styles.drawerGridScroll}
              contentContainerStyle={[styles.drawerGridContent, { paddingBottom: bottomNavInset + 24 }]}
              data={filteredChars}
              renderItem={renderCharItem}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={{ gap: 10 }}
              scrollEnabled
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews
              ListFooterComponent={<View style={{ height: 24 }} />}
              extraData={imageErrorTick}
            />
          )}
        </Animated.View>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <Animated.View style={[styles.successToast, { backgroundColor: theme.accentColor, zIndex: 210, bottom: 80 + bottomNavInset }]}>
          <Text style={styles.successToastText}>{successMessage}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  leftPanel: { flex: 1 },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
  floatingActions: {
    position: 'absolute',
    right: 12,
    flexDirection: 'column',
    gap: 8,
    zIndex: 4,
  },
  floatingBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  leftDrawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_W,
    borderRightWidth: 1,
    flexDirection: 'column',
    elevation: 8,
  },
  siteRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  quickImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  drawerSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  siteRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  siteRowTextIcon: { fontSize: 14, fontWeight: '700', color: '#fff' },
  urlBarWrap: { flex: 1, marginHorizontal: 8 },
  urlBar: { height: 36, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontSize: 13 },
  siteScrollerContainer: { paddingVertical: 6, borderBottomWidth: 1 },
  siteScrollerContent: { paddingHorizontal: 12, paddingVertical: 4 },
  siteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  siteChipIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  siteChipIcon: { fontSize: 12, fontWeight: '700' },
  siteChipName: { fontSize: 12, fontWeight: '500' },
  browserArea: { flex: 1, position: 'relative' },
  webview: { flex: 1 },
  webLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 5 },
  webLoadingText: { marginTop: 8, fontSize: 13 },
  webErrorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 5 },
  webErrorText: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  webErrorDesc: { fontSize: 13, textAlign: 'center', marginBottom: 16, paddingHorizontal: 32 },
  webErrorBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  browserControls: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 4,
  },
  browserCtrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  extractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#666',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  localLib: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  localIconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  localTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  localDesc: { fontSize: 14, textAlign: 'center', marginBottom: 24, paddingHorizontal: 32 },
  localOpenBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  bottomBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  bottomBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlayFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: DRAWER_W,
    borderLeftWidth: 1,
    flexDirection: 'column',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1 },
  drawerHeaderTitle: { fontSize: 16, fontWeight: '600' },
  drawerCloseBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  drawerSearch: { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 12, height: 40, borderRadius: 20, borderWidth: 1 },
  drawerSearchInput: { flex: 1, fontSize: 14, height: 40, marginLeft: 8 },
  drawerGridScroll: { flex: 1 },
  drawerGridContent: { padding: 12, paddingBottom: 32 },
  drawerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    width: (DRAWER_W - 34) / 2,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 180,
  },
  gridCardAvatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden' },
  gridCardAvatarBg: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', borderRadius: 28 },
  gridCardInitial: { fontSize: 22, fontWeight: '700' },
  gridCardName: { fontSize: 13, fontWeight: '600', textAlign: 'center', width: '100%', marginTop: 8 },
  gridCardDesc: { fontSize: 11, textAlign: 'center', lineHeight: 14, marginTop: 4 },
  gridCardSource: { width: '100%', alignItems: 'center', marginTop: 4 },
  gridCardSourceText: { fontSize: 10 },
  gridImportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 10, width: '100%', marginTop: 8 },
  gridStatusBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, width: '100%', marginTop: 8 },
  gridCardAvatarImg: { width: '100%', height: '100%' },
  filterTabs: { paddingHorizontal: 12, paddingVertical: 8 },
  filterTabsContent: { paddingRight: 16 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 6, borderWidth: 1 },
  drawerEmpty: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center' },
  closeFloatBtn: {
    position: 'absolute',
    left: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsModal: { flex: 1 },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  settingsTitle: { fontSize: 18, fontWeight: '700' },
  settingsBody: { flex: 1, padding: 16 },
  settingsSection: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  siteRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 12 },
  siteRowIconWrap: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  siteRowText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  siteRowName: { fontSize: 14, fontWeight: '500' },
  siteRowUrl: { fontSize: 11 },
  badge: { fontSize: 11, fontWeight: '600' },
  addSiteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 16, paddingVertical: 14, borderRadius: 14 },
  addSiteOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  addSiteModal: { width: '100%', maxWidth: 380, borderRadius: 20, padding: 20 },
  addSiteTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  addSiteField: { borderBottomWidth: 1, paddingVertical: 8, marginBottom: 4 },
  addSiteLabel: { fontSize: 12, marginBottom: 4 },
  addSiteInput: { fontSize: 15, paddingVertical: 4 },
  addSiteActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  addSiteCancel: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  addSiteConfirm: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  localCount: { fontSize: 13, marginTop: 16, opacity: 0.7 },
  localHint: { fontSize: 12, marginTop: 12, opacity: 0.6, textAlign: 'center' },
  extractionLoadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 6,
  },
  extractionLoadingText: { marginTop: 12, fontSize: 14 },
  extractionCancelBtn: { marginTop: 20, padding: 8, paddingHorizontal: 16 },
  extractionFailedOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 6,
  },
  extractionFailedActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  successToast: {
    position: 'absolute',
    bottom: 100,
    left: 32,
    right: 32,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    zIndex: 100,
  },
  successToastText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  // 顶部独立搜索框（browse 模式）
  browseTopSearch: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  browseTopSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
  },
  browseTopSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    height: 38,
  },
  // Picker 模式样式
  pickerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  pickerCancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 52,
    alignItems: 'flex-start',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  pickerTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 52,
    justifyContent: 'flex-end',
  },
  pickerCommunityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  pickerSearchWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  pickerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
  },
  pickerSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    height: 40,
  },
  pickerList: {
    flex: 1,
  },
  pickerEmpty: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  pickerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickerAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  pickerAvatar: {
    width: 80,
    height: 80,
  },
  pickerAvatarPlaceholder: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  pickerAvatarInitial: {
    fontSize: 28,
    fontWeight: '700',
  },
  pickerCardBody: {
    flex: 1,
    paddingRight: 20,
  },
  pickerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerCardName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  pickerCardDesc: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  pickerCardTags: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pickerTagChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 6,
    marginTop: 4,
  },
  pickerTagChipText: {
    fontSize: 10,
  },
  pickerCheckBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
