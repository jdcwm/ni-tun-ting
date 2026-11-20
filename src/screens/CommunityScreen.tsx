import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Modal, Dimensions, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { communityService } from '../services/communityService';
import { storage } from '../utils/storage';
import * as imageUtils from '../utils/imageUtils';
import type { Character } from '../types';

interface CommunityScreenProps {
  onClose: () => void;
  user: any;
  onLogout: () => void;
  onUserUpdate: (user: any) => void;
  currentChat?: any; // 用于分享对话
  characters?: any[]; // 角色列表
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 8;
const CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_MARGIN) / 2;

type TabType = 'discuss' | 'publish' | 'ranking';
type PublishSubTab = 'chat' | 'market';
type SortType = 'latest' | 'hot' | 'recommended';
type RankSortType = 'score' | 'posts' | 'likes';

export const CommunityScreen: React.FC<CommunityScreenProps> = ({
  onClose, user, onLogout, onUserUpdate, currentChat, characters,
}) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('discuss');
  const [publishSubTab, setPublishSubTab] = useState<PublishSubTab>('chat');
  const [posts, setPosts] = useState<any[]>([]);
  const [marketCards, setMarketCards] = useState<any[]>([]);
  const [rankings, setRankings] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<SortType>('latest');
  const [rankSortBy, setRankSortBy] = useState<RankSortType>('score');
  const [loading, setLoading] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showPostDetail, setShowPostDetail] = useState<any>(null);
  const [commentText, setCommentText] = useState('');
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});
  const [marketCardsLoading, setMarketCardsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab, sortBy, rankSortBy, publishSubTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'discuss') {
        const data = await communityService.getPosts({ sort: sortBy });
        setPosts(data);
        try {
          const authorIds = Array.from(new Set(data.map((p: any) => p.authorUid ?? p.authorId).filter(Boolean)));
          const map: Record<string, boolean> = {};
          await Promise.all(authorIds.map(async (id: any) => {
            try {
              const res = await communityService.isFollowing(id);
              map[String(id)] = !!res?.isFollowing;
            } catch {}
          }));
          setFollowingMap(map);
        } catch {}
      } else if (activeTab === 'publish') {
        if (publishSubTab === 'chat') {
          const data = await communityService.getPosts({
            type: 'card',
            sort: sortBy,
            userId: user?.id,
          });
          setPosts(data);
        } else {
          const cards = await communityService.listCards();
          setMarketCards(cards);
        }
      } else if (activeTab === 'ranking') {
        const data = await communityService.getRankings(rankSortBy);
        setRankings(data);
      }
    } catch (err: any) {
      Alert.alert('加载失败', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = useCallback(async (post: any) => {
    const uid = post.authorUid ?? post.authorId ?? post?.uid ?? post?.userId;
    if (!uid || String(uid) === String(user?.uid)) return;
    const key = String(uid);
    if (followLoading[key]) return;
    setFollowLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const current = !!followingMap[key];
      const res = current
        ? await communityService.unfollow(uid)
        : await communityService.follow(uid);
      setFollowingMap((prev) => ({ ...prev, [key]: !current }));
    } catch (err: any) {
      Alert.alert('操作失败', err.message);
    } finally {
      setFollowLoading((prev) => ({ ...prev, [key]: false }));
    }
  }, [followingMap, followLoading, user?.uid]);

  // 从角色卡数据构造 Character 对象并保存（四步走：解包 assets → 社区资源表登记 → 角色库入库 → 日志）
  const saveCharacterFromCard = useCallback(async (
    cardData: any,
    charDataFallback?: any,
    opts?: { source?: 'community-purchase' | 'community-download' | 'manual-import'; ownerUid?: string | number; postId?: string; price?: number },
  ): Promise<Character | null> => {
    const charInfo = cardData?.characterData || charDataFallback || cardData?.data;
    if (!charInfo?.name && !cardData?.characterName && !charInfo?.characterName) {
      return null;
    }
    const now = Date.now();
    const name = charInfo.name || cardData.characterName || '导入角色';
    const builtCard: Character = {
      id: `imported-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      description: charInfo.description || '',
      systemPrompt: charInfo.systemPrompt || charInfo.system_prompt || '',
      greeting: charInfo.greeting || charInfo.firstMessage || charInfo.first_mes || '',
      messageExample: charInfo.mesExample || charInfo.mes_example || charInfo.messageExample || '',
      avatar: charInfo.avatar || cardData.characterAvatar || cardData.cover || undefined,
      tags: charInfo.tags || [],
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
      worldBookIds: charInfo.worldBookIds || undefined,
      personality: charInfo.personality || '',
      scenario: charInfo.scenario || '',
      firstMessage: charInfo.firstMessage || charInfo.first_mes || charInfo.greeting || '',
      mesExample: charInfo.mesExample || charInfo.mes_example || '',
      alternateGreetings: charInfo.alternateGreetings || charInfo.alternate_greetings || undefined,
      greetingEnabled: typeof charInfo.greetingEnabled === 'boolean' ? charInfo.greetingEnabled : true,
      creator: charInfo.creator || cardData.authorName || cardData.authorNickname || '',
      creatorNotes: charInfo.creatorNotes || charInfo.creator_notes || '',
      characterVersion: charInfo.characterVersion || charInfo.character_version || '',
      userPersona: charInfo.userPersona || '',
      prePrompt: charInfo.prePrompt || '',
      postPrompt: charInfo.postPrompt || charInfo.post_history_instructions || '',
    };

    setMarketCardsLoading(true);
    try {
      const source: 'community-purchase' | 'community-download' | 'manual-import' = opts?.source || 'community-download';
      // 1. 解析并保存 card 内所有 file:/// 图片为 appDir 下 resourceImages 子目录，返回本地新 uri 映射
      //    （若 imageUtils 尚未实现 unpackCharacterImages / applyAssetsMap / unpackAssets 则用空 map 占位，Task5 补实现）
      const iu: any = imageUtils;
      let assetsMap: Record<string, string> = {};
      if (typeof iu.unpackCharacterImages === 'function') {
        assetsMap = await iu.unpackCharacterImages(builtCard);
      } else if (typeof iu.unpackAssets === 'function') {
        assetsMap = await iu.unpackAssets(builtCard);
      }
      let resolved: Character = builtCard;
      if (typeof iu.applyAssetsMap === 'function') {
        resolved = iu.applyAssetsMap(builtCard, assetsMap);
      } else if (typeof iu.packAssets === 'function') {
        try {
          const packed = iu.packAssets(builtCard);
          if (packed && typeof packed === 'object') resolved = packed as Character;
        } catch { /* ignore pack fallback errors */ }
      }

      // 2. 写社区资源表（隐藏，不暴露给用户手动编辑 UI 入口上直接标记为"社区获取"即可）
      const meta: Record<string, any> = { cardName: resolved.name, source };
      if (opts?.postId) meta.postId = opts.postId;
      if (opts?.price != null) meta.price = opts.price;
      await storage.saveCommunityResource('character', {
        resourceId: resolved.id,
        source,
        ownerUid: opts?.ownerUid,
        metadata: meta,
      });

      // 3. 正常入角色库（用户仍然能看到并使用，但元数据是 communityOwned 标记：storage.getCommunityResources 可查）
      const existing = await storage.getCharacters();
      await storage.saveCharacters([...existing, resolved], true);

      // 4. 日志
      await storage.appendUserLog({
        type: source === 'community-purchase' ? 'purchase' : (source === 'manual-import' ? 'import' : 'download'),
        target: { kind: 'character', id: resolved.id, name: resolved.name },
        meta: {
          postId: opts?.postId,
          authorUid: opts?.ownerUid,
          price: opts?.price,
          assetsSaved: Object.keys(assetsMap).length,
        },
      });
      Alert.alert('导入成功', `已将《${resolved.name}》加入角色库（内部存储，不会写入公开文件夹）`);
      return resolved;
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '保存角色卡时发生错误');
      return null;
    } finally {
      setMarketCardsLoading(false);
    }
  }, []);

  const handleLike = async (postId: string) => {
    try {
      const result = await communityService.likePost(postId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: result.likes, liked: result.liked } : p));
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    try {
      await communityService.commentPost(showPostDetail.id, commentText);
      setCommentText('');
      loadData();
      Alert.alert('成功', '评论已发表');
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  // 发布区的卡片分享 - 分享对话
  const handleShareChatAsCard = async (options: {
    title: string;
    author: string;
    hideWorldBook: boolean;
    hideSystemPrompt: boolean;
    hideCharacterDesc: boolean;
    hideCharacterPersonality: boolean;
    hideCharacterScenario: boolean;
    hideAuthor: boolean;
    hideCSS: boolean;
    hideRegex: boolean;
    hideGreeting: boolean;
    previewMessageCount: number;
  }) => {
    if (!currentChat) {
      Alert.alert('提示', '没有可分享的对话');
      return;
    }
    try {
      const character = characters?.find((c: any) => c.id === currentChat.characterId);
      const allMessages = currentChat.messages || [];
      // 只取最近几条消息作为预览，不分享完整对话历史
      const previewMessages = allMessages.slice(-options.previewMessageCount).map((m: any) => ({
        role: m.role,
        content: m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content,
        timestamp: m.timestamp,
      }));

      // 构建角色卡片数据（根据隐藏选项过滤）
      const characterData = character ? {
        name: character.name,
        description: options.hideCharacterDesc ? null : (character.description || ''),
        personality: options.hideCharacterPersonality ? null : (character.personality || ''),
        scenario: options.hideCharacterScenario ? null : (character.scenario || ''),
        avatar: character.avatar || null,
        // 开场白（根据隐藏选项过滤）
        greeting: options.hideGreeting ? null : (character.greeting || character.firstMessage || ''),
        greetingEnabled: character.greetingEnabled,
        alternateGreetings: options.hideGreeting ? null : (character.alternateGreetings || []),
      } : null;

      const cardData = {
        id: `shared-${Date.now()}`,
        title: options.title,
        authorName: options.hideAuthor ? '匿名' : options.author,
        createdAt: Date.now(),
        characterName: character?.name || '',
        characterAvatar: character?.avatar || null,
        // 只保存预览消息，不保存完整对话历史
        previewMessages,
        totalMessageCount: allMessages.length,
        // 角色卡片数据（供导入时使用）
        characterData,
        // 可选隐藏的配置信息
        worldBook: options.hideWorldBook ? null : (currentChat.worldBookIds || []),
        systemPrompt: options.hideSystemPrompt ? null : (currentChat.settings?.systemPrompt || ''),
        // 内置CSS（根据隐藏选项过滤）
        customCSS: options.hideCSS ? null : (currentChat.settings?.customCSS || ''),
        globalCSS: options.hideCSS ? null : (currentChat.settings?.globalCSS || ''),
        cssEntries: options.hideCSS ? null : (currentChat.settings?.cssEntries || []),
        // 正则规则（根据隐藏选项过滤）
        regexRules: options.hideRegex ? null : (currentChat.settings?.regexRules || []),
        // 开场白（ChatSettings级别的）
        greeting: options.hideGreeting ? null : (currentChat.settings?.greeting || ''),
        greetingEnabled: currentChat.settings?.greetingEnabled,
        // 隐藏选项标记
        hideFlags: {
          worldBook: options.hideWorldBook,
          systemPrompt: options.hideSystemPrompt,
          characterDesc: options.hideCharacterDesc,
          characterPersonality: options.hideCharacterPersonality,
          characterScenario: options.hideCharacterScenario,
          author: options.hideAuthor,
          css: options.hideCSS,
          regex: options.hideRegex,
          greeting: options.hideGreeting,
        },
      };
      await communityService.createPost({
        title: options.title,
        content: `【对话卡片】角色：${character?.name || '未知'} · ${allMessages.length}条对话 · 预览${previewMessages.length}条`,
        type: 'card',
        tags: ['对话卡片', character?.name || ''],
        cardData,
      });
      setShowCardModal(false);
      Alert.alert('成功', '对话卡片已发布到社区');
      loadData();
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  const renderDiscussTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner}>
      {posts.map((post) => {
        const uid = post.authorUid ?? post.authorId;
        const key = String(uid ?? '');
        const isSelf = String(uid) === String(user?.uid);
        const followed = !!followingMap[key];
        return (
          <TouchableOpacity
            key={post.id}
            style={[styles.discussCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
            onPress={() => setShowPostDetail(post)}
          >
            <View style={styles.postHeader}>
              <View style={[styles.avatar, { backgroundColor: theme.accentColor + '30' }]}>
                <Text style={{ color: theme.accentColor, fontWeight: 'bold' }}>
                  {post.authorName?.[0] || 'U'}
                </Text>
              </View>
              <View style={styles.postMeta}>
                <Text style={[styles.authorName, { color: theme.textColor }]}>{post.authorName}</Text>
                <Text style={[styles.postTime, { color: theme.subTextColor }]}>
                  {uid ? `UID ${uid}` : ''}
                  {uid ? ' · ' : ''}
                  {new Date(post.createdAt).toLocaleString('zh-CN')}
                </Text>
              </View>
              {!isSelf && uid && (
                <TouchableOpacity
                  style={[
                    styles.followBtn,
                    followed
                      ? { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }
                      : { backgroundColor: theme.accentColor, borderColor: theme.accentColor },
                  ]}
                  disabled={!!followLoading[key]}
                  onPress={(e) => { e.stopPropagation(); handleFollowToggle(post); }}
                >
                  {followLoading[key] ? (
                    <ActivityIndicator size="small" color={followed ? theme.subTextColor : '#fff'} />
                  ) : (
                    <Ionicons
                      name={followed ? 'checkmark-done-outline' : 'person-add-outline'}
                      size={14}
                      color={followed ? theme.subTextColor : '#fff'}
                    />
                  )}
                  <Text
                    style={{
                      fontSize: 12,
                      color: followed ? theme.subTextColor : '#fff',
                      fontWeight: followed ? '500' : 'bold',
                      marginLeft: 4,
                    }}
                  >
                    {followed ? '已关注' : '关注'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.postTitle, { color: theme.textColor }]}>{post.title}</Text>
            <Text style={[styles.postContent, { color: theme.subTextColor }]} numberOfLines={3}>
              {post.content}
            </Text>
            <View style={styles.postActions}>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleLike(post.id); }} style={styles.actionBtn}>
                <Text style={{ color: post.liked ? '#ff6b6b' : theme.subTextColor }}>
                  {post.liked ? '❤️' : '🤍'} {post.likes || 0}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn}>
                <Text style={{ color: theme.subTextColor }}>💬 {post.commentsCount || 0}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderPublishMarketCards = () => (
    <View style={styles.cardGrid}>
      {marketCards.map((mc: any) => {
        const price = typeof mc.price === 'number' ? mc.price : 0;
        const isFree = price === 0;
        return (
          <TouchableOpacity
            key={mc.id || mc.cardId || mc._id}
            style={[styles.publishCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor, width: CARD_WIDTH }]}
            onPress={() => setShowPostDetail({ __kind: 'marketCard', ...mc })}
          >
            <View style={[styles.cardPreview, { backgroundColor: theme.secondaryColor, padding: 10, minHeight: 140, justifyContent: 'center' }]}>
              <View style={{ position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={[styles.marketTag, { backgroundColor: theme.accentColor + '20' }]}>
                  <Ionicons name="sparkles-outline" size={10} color={theme.accentColor} />
                  <Text style={{ color: theme.accentColor, fontSize: 10, marginLeft: 2 }}>角色卡</Text>
                </View>
                <View style={[
                  styles.marketTag,
                  { backgroundColor: isFree ? theme.accentColor : '#ff6b6b' },
                ]}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                    {isFree ? '免费' : `${price} 积分`}
                  </Text>
                </View>
              </View>

              <View style={{ alignItems: 'center', marginTop: 24 }}>
                <View style={[styles.marketCardAvatar, { backgroundColor: theme.accentColor + '30' }]}>
                  <Text style={{ fontSize: 22, color: theme.accentColor, fontWeight: 'bold' }}>
                    {(mc.name || mc.characterName || mc.cardData?.characterName || 'C')[0]}
                  </Text>
                </View>
                <Text style={[styles.cardCharName, { color: theme.textColor, marginTop: 8 }]} numberOfLines={1}>
                  {mc.name || mc.characterName || mc.cardData?.characterName || '角色卡'}
                </Text>
              </View>

              {mc.summary && (
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 6 }} numberOfLines={2}>
                  {mc.summary}
                </Text>
              )}

              <View style={styles.cardOverlay}>
                <Text style={[styles.cardTitle, { color: theme.textColor }]} numberOfLines={1}>
                  {mc.title || mc.name || mc.summary?.slice(0, 20) || '角色卡'}
                </Text>
                <View style={styles.cardAuthorRow}>
                  <Text style={[styles.cardAuthor, { color: theme.subTextColor }]} numberOfLines={1}>
                    @{mc.authorNickname || mc.authorName || '匿名'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.cardFooter, { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="download-outline" size={12} color={theme.subTextColor} />
                <Text style={{ color: theme.subTextColor, fontSize: 12, marginLeft: 3 }}>
                  {mc.downloads ?? mc.downloadCount ?? 0}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="heart-outline" size={12} color={theme.subTextColor} />
                <Text style={{ color: theme.subTextColor, fontSize: 12, marginLeft: 3 }}>
                  {mc.likes || 0}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderPublishTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner}>
      {/* 发布区子 Tab */}
      <View style={[styles.subTabBar, { borderBottomColor: theme.borderColor }]}>
        {([
          { key: 'chat', label: '对话卡片', icon: 'chatbubble-ellipses-outline' as const },
          { key: 'market', label: '角色卡市场', icon: 'pricetags-outline' as const },
        ] as const).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.subTabBtn, publishSubTab === t.key && { borderBottomColor: theme.accentColor }]}
            onPress={() => setPublishSubTab(t.key)}
          >
            <Ionicons
              name={t.icon}
              size={15}
              color={publishSubTab === t.key ? theme.accentColor : theme.subTextColor}
            />
            <Text
              style={{
                fontSize: 13,
                color: publishSubTab === t.key ? theme.accentColor : theme.subTextColor,
                marginTop: 2,
              }}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {publishSubTab === 'chat' ? (
        <View style={styles.cardGrid}>
          {posts.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={[styles.publishCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor, width: CARD_WIDTH }]}
              onPress={() => setShowPostDetail(post)}
            >
              {post.cardData && (
                <View style={[styles.cardPreview, { backgroundColor: theme.secondaryColor }]}>
                  <View style={{ position: 'absolute', top: 8, left: 8 }}>
                    <View style={[styles.marketTag, { backgroundColor: theme.primaryColor }]}>
                      <Ionicons name="chatbubbles-outline" size={10} color={theme.accentColor} />
                      <Text style={{ color: theme.accentColor, fontSize: 10, marginLeft: 2 }}>对话卡片</Text>
                    </View>
                  </View>
                  <Text style={[styles.cardCharName, { color: theme.textColor, marginTop: 30 }]} numberOfLines={1}>
                    {post.cardData.characterName}
                  </Text>
                  <View style={styles.cardMessagesPreview}>
                    {(post.cardData.previewMessages || post.cardData.messages || []).slice(0, 3).map((m: any, i: number) => (
                      <Text key={i} style={[styles.cardMsg, { color: theme.subTextColor }]} numberOfLines={1}>
                        {m.role === 'user' ? '👤' : '🤖'} {m.content}
                      </Text>
                    ))}
                  </View>
                  {post.cardData.totalMessageCount > 0 && (
                    <Text style={{ color: theme.subTextColor, fontSize: 10, marginTop: 2 }}>
                      共 {post.cardData.totalMessageCount} 条对话
                    </Text>
                  )}
                  <View style={styles.cardOverlay}>
                    <Text style={[styles.cardTitle, { color: theme.textColor }]} numberOfLines={1}>{post.title}</Text>
                    <View style={styles.cardAuthorRow}>
                      <Text style={[styles.cardAuthor, { color: theme.subTextColor }]} numberOfLines={1}>
                        @{post.cardData.authorName}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              <View style={styles.cardFooter}>
                <Text style={{ color: theme.subTextColor, fontSize: 12 }}>
                  ❤️ {post.likes || 0} · 💬 {post.commentsCount || 0}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        renderPublishMarketCards()
      )}
    </ScrollView>
  );

  const renderRankingTab = () => (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner}>
      <View style={styles.rankingHeader}>
        {(['score', 'posts', 'likes'] as RankSortType[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.rankTab, { backgroundColor: rankSortBy === s ? theme.accentColor : theme.secondaryColor }]}
            onPress={() => setRankSortBy(s)}
          >
            <Text style={{ color: rankSortBy === s ? '#fff' : theme.textColor, fontSize: 12 }}>
              {s === 'score' ? '综合' : s === 'posts' ? '发帖' : '获赞'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {rankings.map((item, index) => (
        <View key={item.id} style={[styles.rankItem, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <View style={[styles.rankNum, { backgroundColor: index < 3 ? theme.accentColor : theme.secondaryColor }]}>
            <Text style={{ color: index < 3 ? '#fff' : theme.textColor, fontWeight: 'bold' }}>
              {index + 1}
            </Text>
          </View>
          <View style={styles.rankAvatar}>
            <Text style={{ color: theme.accentColor, fontWeight: 'bold' }}>
              {item.nickname?.[0] || 'U'}
            </Text>
          </View>
          <View style={styles.rankInfo}>
            <Text style={[styles.rankName, { color: theme.textColor }]}>{item.nickname}</Text>
            <Text style={[styles.rankStats, { color: theme.subTextColor }]}>
              发帖 {item.postCount} · 获赞 {item.likeCount}
            </Text>
          </View>
          <View style={[styles.rankScore, { backgroundColor: theme.accentColor + '20' }]}>
            <Text style={{ color: theme.accentColor, fontWeight: 'bold' }}>{item.score}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const renderPublishModal = () => (
    <Modal visible={showPublishModal} animationType="slide" transparent>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowPublishModal(false)}>
            <Text style={{ color: theme.textColor, fontSize: 16 }}>取消</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.textColor }]}>发布</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <TouchableOpacity
            style={[styles.publishOption, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
            onPress={() => setShowCardModal(true)}
          >
            <Text style={{ fontSize: 28 }}>💬</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.optionTitle, { color: theme.textColor }]}>分享对话</Text>
              <Text style={[styles.optionDesc, { color: theme.subTextColor }]}>将当前对话分享为卡片，其他用户可导入</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.publishOption, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor, opacity: 0.5 }]}>
            <Text style={{ fontSize: 28 }}>📝</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.optionTitle, { color: theme.textColor }]}>发布帖子</Text>
              <Text style={[styles.optionDesc, { color: theme.subTextColor }]}>在讨论区发布文字帖子</Text>
            </View>
          </View>

          <View style={[styles.publishOption, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor, opacity: 0.5 }]}>
            <Text style={{ fontSize: 28 }}>🎬</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.optionTitle, { color: theme.textColor }]}>发布视频</Text>
              <Text style={[styles.optionDesc, { color: theme.subTextColor }]}>上传视频内容（即将开放）</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={{ color: theme.textColor, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>鲵吞亭社区</Text>
        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Text style={{ color: theme.subTextColor, fontSize: 14 }}>退出</Text>
        </TouchableOpacity>
      </View>

      {/* 用户栏 */}
      <View style={[styles.userBar, { backgroundColor: theme.primaryColor, borderBottomColor: theme.borderColor }]}>
        <View style={[styles.userAvatar, { backgroundColor: theme.accentColor + '30' }]}>
          <Text style={{ color: theme.accentColor, fontWeight: 'bold' }}>
            {user?.nickname?.[0] || user?.username?.[0] || 'U'}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: theme.textColor }]}>{user?.nickname || user?.username}</Text>
          <Text style={[styles.userBio, { color: theme.subTextColor }]} numberOfLines={1}>
            {user?.bio || '这个人很懒，没有签名'}
          </Text>
        </View>
      </View>

      {/* Tab 栏 */}
      <View style={[styles.tabBar, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        {[
          { key: 'discuss', label: '讨论区', icon: '💬' },
          { key: 'publish', label: '发布区', icon: '📢' },
          { key: 'ranking', label: '排行榜', icon: '🏆' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && { borderBottomColor: theme.accentColor }]}
            onPress={() => setActiveTab(tab.key as TabType)}
          >
            <Text style={{ fontSize: 16 }}>{tab.icon}</Text>
            <Text style={{ color: activeTab === tab.key ? theme.accentColor : theme.subTextColor, fontSize: 13, marginTop: 2 }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 排序栏 */}
      {activeTab !== 'ranking' && (
        <View style={styles.sortBar}>
          {(['latest', 'hot', 'recommended'] as SortType[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sortBtn, { backgroundColor: sortBy === s ? theme.accentColor : theme.secondaryColor }]}
              onPress={() => setSortBy(s)}
            >
              <Text style={{ color: sortBy === s ? '#fff' : theme.textColor, fontSize: 12 }}>
                {s === 'latest' ? '最新' : s === 'hot' ? '热门' : '推荐'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {loading && <ActivityIndicator style={styles.loader} color={theme.accentColor} />}
      {activeTab === 'discuss' && !loading && renderDiscussTab()}
      {activeTab === 'publish' && !loading && renderPublishTab()}
      {activeTab === 'ranking' && !loading && renderRankingTab()}

      {/* 发布按钮 */}
      {activeTab === 'publish' && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.accentColor }]}
          onPress={() => setShowPublishModal(true)}
        >
          <Text style={{ color: '#fff', fontSize: 24 }}>+</Text>
        </TouchableOpacity>
      )}

      {renderPublishModal()}

      {/* 卡片分享表单 */}
      {showCardModal && (
        <CardShareModal
          theme={theme}
          user={user}
          currentChat={currentChat}
          characters={characters}
          onClose={() => setShowCardModal(false)}
          onSubmit={handleShareChatAsCard}
        />
      )}

      {/* 帖子详情 */}
      {showPostDetail && (
        <PostDetailModal
          theme={theme}
          post={showPostDetail}
          user={user}
          onClose={() => setShowPostDetail(null)}
          onLike={() => handleLike(showPostDetail.id)}
          liked={showPostDetail.liked}
          onSaveCharacterFromCard={saveCharacterFromCard}
          onRefresh={loadData}
        />
      )}
    </SafeAreaView>
  );
};

// ============ 子组件 ============

interface CardShareModalProps {
  theme: any;
  user: any;
  currentChat?: any;
  characters?: any[];
  onClose: () => void;
  onSubmit: (opts: {
    title: string;
    author: string;
    hideWorldBook: boolean;
    hideSystemPrompt: boolean;
    hideCharacterDesc: boolean;
    hideCharacterPersonality: boolean;
    hideCharacterScenario: boolean;
    hideAuthor: boolean;
    hideCSS: boolean;
    hideRegex: boolean;
    hideGreeting: boolean;
    previewMessageCount: number;
  }) => void;
}

const CardShareModal: React.FC<CardShareModalProps> = ({ theme, user, currentChat, characters, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState(user?.nickname || user?.username || '');
  const [hideWorldBook, setHideWorldBook] = useState(true);
  const [hideSystemPrompt, setHideSystemPrompt] = useState(true);
  const [hideCharacterDesc, setHideCharacterDesc] = useState(false);
  const [hideCharacterPersonality, setHideCharacterPersonality] = useState(false);
  const [hideCharacterScenario, setHideCharacterScenario] = useState(false);
  const [hideAuthor, setHideAuthor] = useState(false);
  const [hideCSS, setHideCSS] = useState(false);
  const [hideRegex, setHideRegex] = useState(false);
  const [hideGreeting, setHideGreeting] = useState(false);
  const [previewMessageCount, setPreviewMessageCount] = useState(3);

  const character = characters?.find((c: any) => c.id === currentChat?.characterId);
  const messages = currentChat?.messages || [];
  const previewMessages = messages.slice(-previewMessageCount);

  const renderToggle = (label: string, value: boolean, onToggle: () => void, desc: string) => (
    <View style={{ marginBottom: 12 }}>
      <View style={styles.settingsRow}>
        <Text style={[styles.settingLabel, { color: theme.textColor }]}>{label}</Text>
        <TouchableOpacity
          style={[styles.toggleSwitch, { backgroundColor: value ? theme.accentColor : theme.secondaryColor }]}
          onPress={onToggle}
        >
          <View style={[styles.toggleThumb, { left: value ? 18 : 2 }]} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.settingDesc, { color: theme.subTextColor }]}>{desc}</Text>
    </View>
  );

  return (
    <Modal visible={true} animationType="slide" transparent>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.textColor, fontSize: 16 }}>取消</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.textColor }]}>分享对话卡片</Text>
          <TouchableOpacity onPress={() => onSubmit({
            title: title || '我的对话卡片',
            author,
            hideWorldBook,
            hideSystemPrompt,
            hideCharacterDesc,
            hideCharacterPersonality,
            hideCharacterScenario,
            hideAuthor,
            hideCSS,
            hideRegex,
            hideGreeting,
            previewMessageCount,
          })}>
            <Text style={{ color: theme.accentColor, fontSize: 16, fontWeight: 'bold' }}>发布</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* 卡片实时预览 */}
          <View style={[styles.cardLivePreview, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
            <View style={styles.cardLiveHeader}>
              <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: 'bold' }}>📋 对话卡片预览</Text>
            </View>
            {character && (
              <View style={styles.cardLiveCharRow}>
                {character.avatar && (
                  <View style={[styles.cardLiveAvatar, { backgroundColor: theme.accentColor + '20' }]}>
                    <Text style={{ fontSize: 16 }}>{character.name[0]}</Text>
                  </View>
                )}
                <View>
                  <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: 'bold' }}>
                    {character.name}
                  </Text>
                  <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                    {hideCharacterDesc ? '描述已隐藏' : (character.description?.substring(0, 30) || '')}
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.cardLiveMsgs}>
              {previewMessages.map((m: any, i: number) => (
                <View key={i} style={[
                  styles.cardLiveMsg,
                  { alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' },
                ]}>
                  <Text style={{
                    color: m.role === 'user' ? theme.accentColor : theme.textColor,
                    fontSize: 12,
                  }} numberOfLines={2}>
                    {m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.cardLiveFooter}>
              <Text style={{ color: theme.subTextColor, fontSize: 10 }}>
                共 {messages.length} 条对话 · 预览 {previewMessageCount} 条
              </Text>
              <Text style={{ color: theme.subTextColor, fontSize: 10 }}>
                {hideAuthor ? '匿名' : `@${author}`}
              </Text>
            </View>
          </View>

          {/* 基本信息输入 */}
          <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.subTextColor }]}>卡片标题</Text>
            <TextInput
              style={[styles.input, { color: theme.textColor }]}
              value={title}
              onChangeText={setTitle}
              placeholder="给卡片起个名字"
              placeholderTextColor={theme.subTextColor}
            />
          </View>

          <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.subTextColor }]}>作者署名</Text>
            <TextInput
              style={[styles.input, { color: theme.textColor, opacity: hideAuthor ? 0.5 : 1 }]}
              value={author}
              onChangeText={setAuthor}
              placeholder="显示的作者名"
              placeholderTextColor={theme.subTextColor}
              editable={!hideAuthor}
            />
          </View>

          {/* 预览消息数量选择 */}
          <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.subTextColor }]}>预览消息数量: {previewMessageCount}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              {[1, 3, 5, 8].map(n => (
                <TouchableOpacity
                  key={n}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: previewMessageCount === n ? theme.accentColor : theme.secondaryColor,
                  }}
                  onPress={() => setPreviewMessageCount(n)}
                >
                  <Text style={{ color: previewMessageCount === n ? '#fff' : theme.textColor, fontSize: 12 }}>
                    {n}条
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 隐藏选项 */}
          <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 8, marginBottom: 12 }]}>
            🔒 信息隐藏选项
          </Text>

          {renderToggle(
            '隐藏作者署名',
            hideAuthor,
            () => setHideAuthor(!hideAuthor),
            '开启后显示为"匿名"，不显示你的署名',
          )}

          {renderToggle(
            '隐藏角色描述',
            hideCharacterDesc,
            () => setHideCharacterDesc(!hideCharacterDesc),
            '隐藏角色的描述信息，其他用户导入时看不到',
          )}

          {renderToggle(
            '隐藏角色人设',
            hideCharacterPersonality,
            () => setHideCharacterPersonality(!hideCharacterPersonality),
            '隐藏角色的性格设定',
          )}

          {renderToggle(
            '隐藏角色场景',
            hideCharacterScenario,
            () => setHideCharacterScenario(!hideCharacterScenario),
            '隐藏角色的场景设定',
          )}

          {renderToggle(
            '隐藏世界书',
            hideWorldBook,
            () => setHideWorldBook(!hideWorldBook),
            '开启后，其他用户导入时将看不到世界书内容',
          )}

          {renderToggle(
            '隐藏系统设定',
            hideSystemPrompt,
            () => setHideSystemPrompt(!hideSystemPrompt),
            '开启后，其他用户导入时将看不到系统提示词',
          )}

          {renderToggle(
            '隐藏开场白',
            hideGreeting,
            () => setHideGreeting(!hideGreeting),
            '隐藏角色的开场白和备选开场白',
          )}

          {renderToggle(
            '隐藏内置CSS',
            hideCSS,
            () => setHideCSS(!hideCSS),
            '隐藏自定义CSS、全局CSS和CSS条目',
          )}

          {renderToggle(
            '隐藏正则规则',
            hideRegex,
            () => setHideRegex(!hideRegex),
            '隐藏输入/输出的正则替换规则',
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

interface PostDetailModalProps {
  theme: any;
  post: any;
  user: any;
  onClose: () => void;
  onLike: () => void;
  liked: boolean;
  onSaveCharacterFromCard?: (
    cardData: any,
    fallback?: any,
    opts?: { source?: 'community-purchase' | 'community-download' | 'manual-import'; ownerUid?: string | number; postId?: string; price?: number },
  ) => Promise<Character | null>;
  onRefresh?: () => void;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ theme, post, user, onClose, onLike, liked, onSaveCharacterFromCard, onRefresh }) => {
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<any[]>(post.comments || []);
  const [commenting, setCommenting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const isMarketCard = post?.__kind === 'marketCard';
  const price = isMarketCard ? (typeof post.price === 'number' ? post.price : 0) : 0;
  const isFree = price === 0;
  const hasPurchased = isMarketCard && !!post.purchased;
  const authorNickname = post.authorNickname || post.authorName || post.cardData?.authorName || '匿名';
  const authorUid = post.authorUid ?? post.authorId ?? '';
  const downloadCount = post.downloads ?? post.downloadCount ?? 0;

  const submitComment = async () => {
    if (!commentText.trim() || !post.id || isMarketCard) return;
    try {
      await communityService.commentPost(post.id, commentText);
      setCommentText('');
      Alert.alert('成功', '评论已发表');
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  const importCard = async () => {
    if (!post.cardData) return;
    if (onSaveCharacterFromCard) {
      setImporting(true);
      try {
        const saved = await onSaveCharacterFromCard(post.cardData, undefined, {
          source: 'community-download',
          ownerUid: post.authorUid ?? post.authorId,
          postId: post.id,
          price: 0,
        });
        if (saved) {
          Alert.alert('已导入', `角色「${saved.name}」已加入角色列表`);
        } else {
          const jsonStr = JSON.stringify(post.cardData, null, 2);
          Clipboard.setString(jsonStr);
          Alert.alert('已复制', '未识别到角色信息，卡片已复制到剪贴板');
        }
      } catch (err: any) {
        Alert.alert('导入失败', err.message);
      } finally {
        setImporting(false);
      }
    } else {
      const jsonStr = JSON.stringify(post.cardData, null, 2);
      Clipboard.setString(jsonStr);
      Alert.alert('成功', '卡片已复制到剪贴板，请到"导入对话卡片"页面粘贴导入');
    }
  };

  const handlePurchaseAndDownload = async () => {
    if (!isMarketCard) return;
    const cardId = post.id || post.cardId || post._id;
    if (!cardId) {
      Alert.alert('错误', '无效的卡片ID');
      return;
    }
    setPurchaseLoading(true);
    try {
      // 1. 购买（即使免费也登记）
      const purchaseRes = await communityService.purchaseCard(cardId);
      if (purchaseRes?.points != null && user) {
        (user as any).points = purchaseRes.points;
      }
      setPurchaseLoading(false);
      setDownloadLoading(true);
      // 2. 下载完整角色卡
      const { meta, card } = await communityService.downloadCard(cardId);
      // 3. 保存角色（免费卡→ community-download，付费卡→ community-purchase）
      if (onSaveCharacterFromCard) {
        const src = price > 0 ? 'community-purchase' : 'community-download';
        const saved = await onSaveCharacterFromCard(card, meta?.cardData || card?.data, {
          source: src,
          ownerUid: post.authorUid ?? post.authorId,
          postId: post.id,
          price: price,
        });
        if (saved) {
          Alert.alert('下载完成', `角色「${saved.name}」已加入角色列表`);
          if (onRefresh) onRefresh();
          return;
        }
      }
      // fallback：复制到剪贴板
      const jsonStr = JSON.stringify({ meta, card }, null, 2);
      Clipboard.setString(jsonStr);
      Alert.alert('已下载', '卡片数据已复制到剪贴板，未识别到角色则手动导入');
    } catch (err: any) {
      Alert.alert('操作失败', err.message);
    } finally {
      setPurchaseLoading(false);
      setDownloadLoading(false);
    }
  };

  return (
    <Modal visible={true} animationType="slide" transparent>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: theme.textColor, fontSize: 16 }}>关闭</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.textColor }]}>
            {isMarketCard ? '角色卡详情' : '卡片详情'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
          {/* 作者信息 + 标签 */}
          <View style={styles.postHeader}>
            <View style={[styles.avatar, { backgroundColor: theme.accentColor + '30' }]}>
              <Text style={{ color: theme.accentColor, fontWeight: 'bold' }}>
                {authorNickname?.[0] || 'U'}
              </Text>
            </View>
            <View style={styles.postMeta}>
              <Text style={[styles.authorName, { color: theme.textColor }]}>{authorNickname}</Text>
              <Text style={[styles.postTime, { color: theme.subTextColor }]}>
                {authorUid ? `UID ${authorUid}` : ''}
                {(authorUid && post.createdAt) ? ' · ' : ''}
                {post.createdAt ? new Date(post.createdAt).toLocaleString('zh-CN') : ''}
              </Text>
            </View>
          </View>

          {isMarketCard ? (
            <View style={[styles.marketInfoRow, { borderColor: theme.borderColor }]}>
              <View style={[styles.marketInfoTag, { backgroundColor: theme.accentColor + '20' }]}>
                <Ionicons name="person-outline" size={12} color={theme.accentColor} />
                <Text style={{ color: theme.accentColor, fontSize: 11, marginLeft: 3 }}>作者</Text>
                <Text style={{ color: theme.textColor, fontSize: 11, fontWeight: 'bold', marginLeft: 4 }}>
                  {authorNickname}
                </Text>
              </View>
              <View style={[styles.marketInfoTag, { backgroundColor: theme.secondaryColor }]}>
                <Ionicons name="download-outline" size={12} color={theme.subTextColor} />
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginLeft: 3 }}>
                  下载 {downloadCount}
                </Text>
              </View>
              <View style={[
                styles.marketInfoTag,
                { backgroundColor: isFree ? theme.accentColor + '20' : '#ff6b6b20' },
              ]}>
                <Ionicons name={isFree ? 'gift-outline' : 'pricetag-outline'} size={12} color={isFree ? theme.accentColor : '#ff6b6b'} />
                <Text style={{
                  color: isFree ? theme.accentColor : '#ff6b6b',
                  fontSize: 11, fontWeight: 'bold', marginLeft: 3,
                }}>
                  {isFree ? '免费' : `${price} 积分`}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={[styles.postTitle, { color: theme.textColor, fontSize: 20 }]}>
            {isMarketCard ? (post.title || post.name || '角色卡') : post.title}
          </Text>
          <Text style={[styles.postContent, { color: theme.subTextColor }]}>
            {isMarketCard ? (post.summary || post.content || '') : post.content}
          </Text>

          {/* 角色卡详情 - 市场卡可视化 */}
          {isMarketCard && (
            <View style={[styles.cardDetailView, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
              <View style={styles.cardDetailHeader}>
                <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: 'bold' }}>
                  <Ionicons name="sparkles-outline" size={12} color={theme.accentColor} /> 角色卡信息
                </Text>
                {hasPurchased && (
                  <Text style={{ color: theme.accentColor, fontSize: 11, fontWeight: 'bold' }}>已购买</Text>
                )}
              </View>
              <View style={styles.cardDetailCharRow}>
                <View style={[styles.cardDetailAvatar, { backgroundColor: theme.accentColor + '20' }]}>
                  <Text style={{ fontSize: 18, color: theme.accentColor, fontWeight: 'bold' }}>
                    {(post.name || post.characterName || 'C')[0]}
                  </Text>
                </View>
                <View style={styles.cardDetailCharInfo}>
                  <Text style={{ color: theme.textColor, fontSize: 15, fontWeight: 'bold' }}>
                    {post.name || post.characterName || '角色卡'}
                  </Text>
                  {post.summary && (
                    <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 2 }} numberOfLines={3}>
                      {post.summary}
                    </Text>
                  )}
                </View>
              </View>
              {post.tags && Array.isArray(post.tags) && post.tags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 4 }}>
                  {post.tags.map((t: string, i: number) => (
                    <View key={i} style={styles.hideBadge}>
                      <Text style={{ fontSize: 11, color: theme.textColor }}># {t}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.cardDetailFooter}>
                <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                  作者：{authorNickname}
                </Text>
                <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                  {String(authorUid) === String(user?.uid) ? '你发布的' :
                    (hasPurchased ? '你已购买' :
                      (isFree ? '免费获得' : `需 ${price} 积分`))}
                </Text>
              </View>
            </View>
          )}

          {/* 可视化卡片展示 - 对话卡片 */}
          {!isMarketCard && post.cardData && (
            <View style={[styles.cardDetailView, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
              {/* 卡片头部 */}
              <View style={styles.cardDetailHeader}>
                <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: 'bold' }}>📋 对话卡片</Text>
                {post.cardData.totalMessageCount > 0 && (
                  <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                    共 {post.cardData.totalMessageCount} 条对话
                  </Text>
                )}
              </View>

              {/* 角色信息 */}
              {post.cardData.characterName && (
                <View style={styles.cardDetailCharRow}>
                  <View style={[styles.cardDetailAvatar, { backgroundColor: theme.accentColor + '20' }]}>
                    <Text style={{ fontSize: 18, color: theme.accentColor }}>
                      {post.cardData.characterName[0]}
                    </Text>
                  </View>
                  <View style={styles.cardDetailCharInfo}>
                    <Text style={{ color: theme.textColor, fontSize: 15, fontWeight: 'bold' }}>
                      {post.cardData.characterName}
                    </Text>
                    {post.cardData.characterData?.description && (
                      <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                        {post.cardData.characterData.description}
                      </Text>
                    )}
                    {post.cardData.hideFlags?.characterDesc && (
                      <Text style={{ color: theme.subTextColor, fontSize: 10, fontStyle: 'italic' }}>
                        描述已隐藏
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* 隐藏信息标记 */}
              {post.cardData.hideFlags && (
                <View style={styles.cardDetailHideFlags}>
                  {post.cardData.hideFlags.worldBook && (
                    <Text style={styles.hideBadge}>🔒 世界书</Text>
                  )}
                  {post.cardData.hideFlags.systemPrompt && (
                    <Text style={styles.hideBadge}>🔒 系统设定</Text>
                  )}
                  {post.cardData.hideFlags.characterDesc && (
                    <Text style={styles.hideBadge}>🔒 角色描述</Text>
                  )}
                  {post.cardData.hideFlags.characterPersonality && (
                    <Text style={styles.hideBadge}>🔒 角色人设</Text>
                  )}
                  {post.cardData.hideFlags.characterScenario && (
                    <Text style={styles.hideBadge}>🔒 角色场景</Text>
                  )}
                  {post.cardData.hideFlags.greeting && (
                    <Text style={styles.hideBadge}>🔒 开场白</Text>
                  )}
                  {post.cardData.hideFlags.css && (
                    <Text style={styles.hideBadge}>🔒 内置CSS</Text>
                  )}
                  {post.cardData.hideFlags.regex && (
                    <Text style={styles.hideBadge}>🔒 正则规则</Text>
                  )}
                  {post.cardData.hideFlags.author && (
                    <Text style={styles.hideBadge}>🔒 匿名</Text>
                  )}
                </View>
              )}

              {/* 预览消息 */}
              {(post.cardData.previewMessages || post.cardData.messages || []).length > 0 && (
                <View style={styles.cardDetailMsgs}>
                  {(post.cardData.previewMessages || post.cardData.messages || []).map((m: any, i: number) => (
                    <View
                      key={i}
                      style={[
                        styles.cardDetailMsg,
                        {
                          alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                          backgroundColor: m.role === 'user' ? theme.accentColor : theme.primaryColor,
                        },
                      ]}
                    >
                      <Text style={{
                        color: m.role === 'user' ? '#fff' : theme.textColor,
                        fontSize: 13,
                      }}>
                        {m.content}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 卡片底部信息 */}
              <View style={styles.cardDetailFooter}>
                <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                  作者：{post.cardData.authorName}
                </Text>
                <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                  {new Date(post.cardData.createdAt || post.createdAt).toLocaleString('zh-CN')}
                </Text>
              </View>
            </View>
          )}

          {/* 市场角色卡：购买+下载+导入 按钮 */}
          {isMarketCard && (
            <View style={{ flexDirection: 'row', marginTop: 16, gap: 10 }}>
              <TouchableOpacity
                style={[
                  styles.importCardBtn,
                  {
                    flex: 1,
                    backgroundColor: String(authorUid) === String(user?.uid) || hasPurchased
                      ? theme.secondaryColor
                      : theme.accentColor,
                  },
                ]}
                disabled={purchaseLoading || downloadLoading}
                onPress={handlePurchaseAndDownload}
              >
                {purchaseLoading || downloadLoading ? (
                  <ActivityIndicator color={String(authorUid) === String(user?.uid) || hasPurchased ? theme.textColor : '#fff'} />
                ) : String(authorUid) === String(user?.uid) ? (
                  <>
                    <Ionicons name="download-outline" size={16} color={theme.textColor} />
                    <Text style={{ color: theme.textColor, fontWeight: 'bold', marginLeft: 6 }}>下载并导入角色</Text>
                  </>
                ) : hasPurchased ? (
                  <>
                    <Ionicons name="download-outline" size={16} color={theme.textColor} />
                    <Text style={{ color: theme.textColor, fontWeight: 'bold', marginLeft: 6 }}>下载并导入角色</Text>
                  </>
                ) : isFree ? (
                  <>
                    <Ionicons name="gift-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: 'bold', marginLeft: 6 }}>免费获取并导入</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="pricetag-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: 'bold', marginLeft: 6 }}>
                      购买 ({price}积分) 并导入
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* 对话卡片：导入按钮 */}
          {!isMarketCard && post.cardData && (
            <TouchableOpacity
              style={[styles.importCardBtn, { backgroundColor: theme.accentColor, flexDirection: 'row' }]}
              onPress={importCard}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: 'bold', marginLeft: 6 }}>
                    {post.cardData?.characterData?.name ? '直接导入角色到列表' : '导入对话卡片（复制）'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {!isMarketCard ? (
            <>
              <View style={styles.divider} />
              <View style={styles.commentSection}>
                <Text style={[styles.sectionLabel, { color: theme.textColor }]}>评论 ({comments.length})</Text>
                {comments.map((c) => (
                  <View key={c.id} style={styles.commentItem}>
                    <Text style={[styles.commentAuthor, { color: theme.textColor }]}>{c.authorName}</Text>
                    <Text style={[styles.commentContent, { color: theme.subTextColor }]}>{c.content}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
        {!isMarketCard && (
          <View style={styles.commentInputBar}>
            <TextInput
              style={[styles.commentInput, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="写评论..."
              placeholderTextColor={theme.subTextColor}
            />
            <TouchableOpacity
              style={[styles.commentSubmit, { backgroundColor: theme.accentColor }]}
              onPress={submitComment}
            >
              <Text style={{ color: '#fff' }}>发送</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

// ============ 样式 ============

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  logoutBtn: { paddingHorizontal: 8 },

  userBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: 'bold' },
  userBio: { fontSize: 12, marginTop: 2 },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },

  sortBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },

  tabContent: { flex: 1 },
  tabContentInner: { padding: 16, paddingBottom: 80 },

  loader: { marginTop: 20 },

  // 讨论区卡片
  discussCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  postMeta: { flex: 1 },
  authorName: { fontSize: 14, fontWeight: '500' },
  postTime: { fontSize: 11 },
  postTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  postContent: { fontSize: 14, lineHeight: 20 },
  postActions: { flexDirection: 'row', marginTop: 12, gap: 20 },
  actionBtn: { paddingVertical: 4 },

  // 发布区
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  publishCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: CARD_MARGIN * 2,
    overflow: 'hidden',
  },
  cardPreview: { padding: 10, minHeight: 140 },
  cardCharName: { fontSize: 14, fontWeight: 'bold', marginBottom: 6 },
  cardMessagesPreview: { marginBottom: 8 },
  cardMsg: { fontSize: 11, marginBottom: 2 },
  cardOverlay: { position: 'absolute', bottom: 10, left: 10, right: 10 },
  cardTitle: { fontSize: 13, fontWeight: 'bold' },
  cardAuthorRow: { flexDirection: 'row', alignItems: 'center' },
  cardAuthor: { fontSize: 10 },
  cardFooter: { padding: 8, alignItems: 'center' },

  // 排行榜
  rankingHeader: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  rankTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  rankNum: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  rankAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(100, 150, 255, 0.3)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  rankInfo: { flex: 1 },
  rankName: { fontSize: 15, fontWeight: '500' },
  rankStats: { fontSize: 12 },
  rankScore: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12,
  },

  // 发布按钮
  fab: {
    position: 'absolute',
    right: 20, bottom: 20,
    width: 56, height: 56,
    borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    elevation: 8,
  },

  // 模态框
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold' },

  // 发布选项
  publishOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  optionTitle: { fontSize: 15, fontWeight: '500' },
  optionDesc: { fontSize: 12, marginTop: 4 },

  // 表单
  inputGroup: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
  },
  label: { fontSize: 12, marginBottom: 4 },
  input: { fontSize: 15, paddingVertical: 4 },

  // 聊天预览
  chatPreview: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  previewTitle: { fontSize: 13, fontWeight: '500' },
  previewInfo: { fontSize: 12, marginTop: 4 },

  // 开关
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingLabel: { fontSize: 14 },
  settingDesc: { fontSize: 12, marginBottom: 12, lineHeight: 16 },
  toggleSwitch: {
    width: 44, height: 26, borderRadius: 13, position: 'relative',
  },
  toggleThumb: {
    position: 'absolute',
    top: 2,
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },

  // 帖子详情
  divider: { height: 1, backgroundColor: 'rgba(128,128,128,0.2)', marginVertical: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '500', marginBottom: 12 },
  commentSection: { paddingBottom: 80 },
  commentItem: { marginBottom: 12 },
  commentAuthor: { fontSize: 13, fontWeight: '500' },
  commentContent: { fontSize: 13, marginTop: 4, lineHeight: 18 },

  commentInputBar: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  commentInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  commentSubmit: {
    marginLeft: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
  },

  importCardBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  // 卡片实时预览
  cardLivePreview: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  cardLiveHeader: {
    marginBottom: 8,
  },
  cardLiveCharRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLiveAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  cardLiveMsgs: {
    marginBottom: 8,
    minHeight: 40,
  },
  cardLiveMsg: {
    maxWidth: '80%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 4,
  },
  cardLiveFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.15)',
    paddingTop: 6,
  },

  // 卡片详情视图
  cardDetailView: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  cardDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardDetailCharRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardDetailAvatar: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  cardDetailCharInfo: { flex: 1 },
  cardDetailHideFlags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  hideBadge: {
    fontSize: 10,
    color: '#888',
    backgroundColor: 'rgba(128,128,128,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 4,
    marginBottom: 4,
  },
  cardDetailMsgs: {
    marginBottom: 8,
  },
  cardDetailMsg: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 6,
  },
  cardDetailFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.15)',
    paddingTop: 8,
    marginTop: 4,
  },

  // 作者区关注按钮
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },

  // 发布区子 Tab
  subTabBar: {
    flexDirection: 'row',
    marginHorizontal: -16,
    marginVertical: -8,
    marginBottom: 8,
    borderBottomWidth: 1,
  },
  subTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },

  // 市场卡片通用
  marketTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  marketCardAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  marketInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 6,
    paddingVertical: 4,
  },
  marketInfoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
});
