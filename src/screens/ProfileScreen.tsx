import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, Modal, FlatList, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { communityService } from '../services/communityService';
import { backupService, filterCloudSnapshot } from '../services/backupService';
import { storage } from '../utils/storage';
import { UserAvatar } from '../components/UserAvatar';

interface ProfileScreenProps {
  onClose: () => void;
  user: any;
  onUserUpdate: (user: any) => void;
  onLogout: () => void;
}

type FriendTab = 'friends' | 'requests';
type ProfileTab = 'checkin' | 'following' | 'followers' | 'myposts' | 'purchased';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onClose, user, onUserUpdate, onLogout }) => {
  const theme = useTheme();
  const { buildSnapshot } = useApp();
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [adminPanelVisible, setAdminPanelVisible] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // ========== 新增：积分、签到、Profile Tab ==========
  const [profileTab, setProfileTab] = useState<ProfileTab>('checkin');
  const [points, setPoints] = useState<number>(typeof user?.points === 'number' ? user.points : 0);
  const [checkinStatus, setCheckinStatus] = useState<any>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [purchasedCards, setPurchasedCards] = useState<any[]>([]);

  // 好友系统
  const [friendTab, setFriendTab] = useState<FriendTab>('friends');
  const [friends, setFriends] = useState<any[]>([]);
  const [incomingReqs, setIncomingReqs] = useState<any[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<any[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [addUidInput, setAddUidInput] = useState('');
  const [addMsgInput, setAddMsgInput] = useState('');
  const [friendsPanelVisible, setFriendsPanelVisible] = useState(false);

  // 修改密码
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  // 用户数据
  const [dataLoading, setDataLoading] = useState(false);

  const loadFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const [friendList, reqs] = await Promise.all([
        communityService.getFriends(),
        communityService.getFriendRequests(),
      ]);
      setFriends(friendList || []);
      setIncomingReqs(reqs?.incoming || []);
      setOutgoingReqs(reqs?.outgoing || []);
    } catch (err: any) {
      // 静默处理，避免打开时弹窗
      setFriends([]);
      setIncomingReqs([]);
      setOutgoingReqs([]);
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFriends();
    loadPointsAndCheckin();
  }, [loadFriends]);

  useEffect(() => {
    loadProfileTabData(profileTab);
  }, [profileTab]);

  // ========== 积分 + 签到 ==========
  const loadPointsAndCheckin = useCallback(async () => {
    try {
      const [pt, st] = await Promise.all([
        communityService.getPoints().catch(() => ({ points: typeof user?.points === 'number' ? user.points : 0 })),
        communityService.getCheckInStatus().catch(() => null),
      ]);
      if (pt && typeof pt.points === 'number') {
        setPoints(pt.points);
        if (user) {
          const updated = { ...(user || {}), points: pt.points };
          onUserUpdate(updated);
        }
      }
      setCheckinStatus(st);
    } catch {}
  }, [user, onUserUpdate]);

  const handleCheckIn = async () => {
    if (checkinLoading) return;
    setCheckinLoading(true);
    try {
      const res = await communityService.checkIn();
      if (res?.points != null) {
        setPoints(res.points);
        if (user) {
          const updated = { ...(user || {}), points: res.points };
          onUserUpdate(updated);
        }
      }
      setCheckinStatus(res?.status || { checkedInToday: true, streak: (checkinStatus?.streak || 0) + 1 });
      Alert.alert('签到成功', `获得 ${res?.reward ?? res?.pointsGained ?? 10} 积分${res?.streak ? ` · 连续 ${res.streak} 天` : ''}`);
    } catch (err: any) {
      Alert.alert('签到失败', err.message || '请稍后重试');
    } finally {
      setCheckinLoading(false);
    }
  };

  // ========== Profile Tab 数据加载 ==========
  const loadProfileTabData = useCallback(async (tab: ProfileTab) => {
    setTabLoading(true);
    try {
      if (tab === 'following') {
        const list = await communityService.getFollowing();
        setFollowingList(Array.isArray(list) ? list : []);
      } else if (tab === 'followers') {
        const list = await communityService.getFollowers();
        setFollowersList(Array.isArray(list) ? list : []);
      } else if (tab === 'myposts') {
        const list = await communityService.getPosts({ userId: user?.id, authorId: user?.id });
        setMyPosts(Array.isArray(list) ? list : []);
      } else if (tab === 'purchased') {
        // 用 listCards 取带 purchased 标记的，然后过滤 purchased=true
        const allCards = await communityService.listCards().catch(() => []);
        setPurchasedCards(Array.isArray(allCards) ? allCards.filter((c: any) => c.purchased) : []);
      }
    } catch (err: any) {
      // 静默
    } finally {
      setTabLoading(false);
    }
  }, [user?.id]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const data = await communityService.updateProfile({ nickname, bio });
      onUserUpdate(data);
      Alert.alert('成功', '资料已更新');
    } catch (err: any) {
      Alert.alert('错误', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateServer = () => {
    if (!serverUrl.trim()) {
      Alert.alert('错误', '请输入服务器地址');
      return;
    }
    communityService.setBaseUrl(serverUrl.trim());
    Alert.alert('成功', '服务器地址已更新');
  };

  const handleTestConnection = async () => {
    const ok = await communityService.testConnection();
    Alert.alert(ok ? '连接成功' : '连接失败', ok ? '已成功连接到社区服务器' : '无法连接到社区服务器，请检查地址是否正确');
  };

  // ===== 好友操作 =====
  const handleSendFriendRequest = async () => {
    const uidStr = addUidInput.trim();
    if (!uidStr) {
      Alert.alert('提示', '请输入对方 UID');
      return;
    }
    const uidNum = Number(uidStr);
    if (!Number.isFinite(uidNum) || uidNum <= 0) {
      Alert.alert('错误', 'UID 必须是正整数');
      return;
    }
    try {
      await communityService.sendFriendRequest(uidNum, addMsgInput.trim() || undefined);
      Alert.alert('已发送', '好友申请已发送');
      setAddUidInput('');
      setAddMsgInput('');
      loadFriends();
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await communityService.acceptFriendRequest(requestId);
      loadFriends();
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await communityService.rejectFriendRequest(requestId);
      loadFriends();
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  const handleRemoveFriend = (uid: number, name: string) => {
    Alert.alert('确认', `确定删除好友「${name}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          try {
            await communityService.removeFriend(uid);
            loadFriends();
          } catch (err: any) {
            Alert.alert('错误', err.message);
          }
        },
      },
    ]);
  };

  // ===== 修改密码 =====
  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) {
      Alert.alert('提示', '请填写完整');
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('错误', '两次输入的新密码不一致');
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert('提示', '新密码至少 6 位');
      return;
    }
    setPwdLoading(true);
    try {
      await communityService.changePassword(oldPwd, newPwd);
      Alert.alert('成功', '密码已修改');
      setPwdModalVisible(false);
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      Alert.alert('错误', err.message);
    } finally {
      setPwdLoading(false);
    }
  };

  // ===== 用户数据上传/下载 =====
  // Task 6: 云同步分层过滤 —— 自动从当前状态构建快照 → 过滤社区资源/敏感数据 → 上传 → 记日志
  const handleUploadUserData = async () => {
    setDataLoading(true);
    try {
      // 1. const snap = 现有 buildSnapshot
      const snap = buildSnapshot();
      // 2. crs = storage.getCommunityResources()
      const crs = await storage.getCommunityResources();
      // 3. communityOwnedIds = 仅 community-purchase / community-download 的 resourceId
      const communityOwned = crs.filter(
        (r) => r.source === 'community-purchase' || r.source === 'community-download',
      );
      const communityResourceIds = communityOwned.map((r) => r.resourceId);
      const communityResourceMap = new Map(
        crs.map((r) => [r.resourceId, { source: r.source, userModified: r.userModified }]),
      );
      // 4. cloudPayload = filterCloudSnapshot(snap, { communityResourceIds, communityResourceMap })
      const cloudPayload = filterCloudSnapshot(snap, { communityResourceIds, communityResourceMap });
      const jsonStr = JSON.stringify(cloudPayload, null, 2);

      // 写入缓存文件再通过 uploadUserDataFile 提交
      const fileName = `cloud-sync-${user?.uid || 'guest'}-${Date.now()}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, jsonStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // 5. 上传 cloudPayload（过滤后的文件）
      const resp = await communityService.uploadUserDataFile({
        uri: fileUri,
        name: fileName,
        type: 'application/json',
      });

      // 6. appendUserLog type:'cloud-sync'
      const uploadedCharCount = Array.isArray(cloudPayload.characters) ? cloudPayload.characters.length : 0;
      const excluded = communityResourceIds.length;
      const skipped = (cloudPayload._meta?.skippedCommunityResourceCount) as number ?? 0;
      await storage.appendUserLog({
        type: 'cloud-sync',
        target: { kind: 'cloud', id: 'upload', name: '自动过滤' },
        meta: {
          uploadedCharCount,
          excluded,
          skippedCommunityResourceCount: skipped,
          size: resp.size,
          uid: user?.uid ?? null,
        },
      });

      const kb = (resp.size / 1024).toFixed(1);
      Alert.alert(
        '上传成功',
        `数据已上传（${kb} KB）\n已排除 ${excluded} 条社区资源登记，实际跳过 ${skipped} 条副本\n上传角色：${uploadedCharCount} 张`,
      );
    } catch (err: any) {
      Alert.alert('上传失败', err.message);
    } finally {
      setDataLoading(false);
    }
  };

  const handleDownloadUserData = async () => {
    setDataLoading(true);
    try {
      const data = await communityService.getUserData();
      const jsonStr = JSON.stringify(data, null, 2);
      const fileName = `user-data-${user?.uid || 'unknown'}-${Date.now()}.json`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, jsonStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '保存用户数据',
        });
      } else {
        Alert.alert('已下载', `数据已保存到缓存：${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('下载失败', err.message);
    } finally {
      setDataLoading(false);
    }
  };

  // ===== 管理员功能 =====
  const loadAdminData = async () => {
    setAdminLoading(true);
    try {
      const [users, stats] = await Promise.all([
        communityService.adminListUsers(),
        communityService.adminGetStats(),
      ]);
      setAdminUsers(users);
      setAdminStats(stats);
    } catch (err: any) {
      Alert.alert('错误', err.message || '加载管理员数据失败');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    Alert.alert('确认', '确定要删除此用户及其所有帖子和评论吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          try {
            await communityService.adminDeleteUser(userId);
            Alert.alert('成功', '用户已删除');
            loadAdminData();
          } catch (err: any) {
            Alert.alert('错误', err.message);
          }
        },
      },
    ]);
  };

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    try {
      await communityService.adminSetUserRole(userId, !currentIsAdmin);
      Alert.alert('成功', `已${currentIsAdmin ? '取消' : '设置'}管理员权限`);
      loadAdminData();
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  const renderFriendItem = ({ item }: { item: any }) => (
    <View style={[styles.friendItem, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
      <View style={[styles.friendAvatar, { backgroundColor: theme.secondaryColor }]}>
        <Text style={{ color: theme.textColor, fontWeight: 'bold' }}>
          {(item.nickname || item.username || 'U')[0].toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '500' }}>
          {item.nickname || item.username || '未命名'}
        </Text>
        <Text style={{ color: theme.subTextColor, fontSize: 12 }}>UID: {item.uid}</Text>
      </View>
      <TouchableOpacity
        style={[styles.removeBtn, { borderColor: '#ff6b6b' }]}
        onPress={() => handleRemoveFriend(item.uid, item.nickname || item.username || '用户')}
      >
        <Text style={{ color: '#ff6b6b', fontSize: 12 }}>删除</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRequestItem = ({ item }: { item: any }) => (
    <View style={[styles.friendItem, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
      <View style={[styles.friendAvatar, { backgroundColor: theme.secondaryColor }]}>
        <Text style={{ color: theme.textColor, fontWeight: 'bold' }}>
          {(item.nickname || item.username || 'U')[0].toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '500' }}>
          {item.nickname || item.username || '未命名'}
        </Text>
        <Text style={{ color: theme.subTextColor, fontSize: 12 }}>UID: {item.uid}</Text>
        {item.message ? (
          <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
            验证消息：{item.message}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <TouchableOpacity
          style={[styles.acceptBtn, { borderColor: theme.accentColor }]}
          onPress={() => handleAcceptRequest(item.id)}
        >
          <Text style={{ color: theme.accentColor, fontSize: 12 }}>接受</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.removeBtn, { borderColor: '#ff6b6b', marginLeft: 6 }]}
          onPress={() => handleRejectRequest(item.id)}
        >
          <Text style={{ color: '#ff6b6b', fontSize: 12 }}>拒绝</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={{ color: theme.textColor, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textColor }]}>个人资料</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={theme.accentColor} />
          ) : (
            <Text style={{ color: theme.accentColor, fontSize: 16, fontWeight: 'bold' }}>保存</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* 头像 + UID + 积分 + 签到入口 */}
        <View style={[styles.avatarSection, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <UserAvatar size={96} showEditHint />
          <Text style={[styles.username, { color: theme.textColor }]}>@{user?.username}</Text>
          {user?.uid != null && (
            <View style={[styles.uidBadge, { backgroundColor: theme.secondaryColor }]}>
              <Text style={{ color: theme.subTextColor, fontSize: 12 }}>UID: </Text>
              <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: 'bold' }}>{user.uid}</Text>
              {user?.isAdmin ? (
                <Text style={{ color: theme.accentColor, fontSize: 12, marginLeft: 8 }}>管理员</Text>
              ) : null}
            </View>
          )}

          {/* 积分 + 签到入口 */}
          <View style={[styles.pointsRow, { marginTop: 16 }]}>
            <TouchableOpacity
              style={[styles.pointsBox, { backgroundColor: theme.accentColor + '15' }]}
              activeOpacity={0.7}
            >
              <Ionicons name="wallet-outline" size={20} color={theme.accentColor} />
              <Text style={{ color: theme.textColor, fontWeight: 'bold', fontSize: 18, marginLeft: 6 }}>
                {points}
              </Text>
              <Text style={{ color: theme.subTextColor, fontSize: 12, marginLeft: 4 }}>积分</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.checkinBtn,
                {
                  backgroundColor: checkinStatus?.checkedInToday ? theme.secondaryColor : theme.accentColor,
                  borderColor: checkinStatus?.checkedInToday ? theme.borderColor : theme.accentColor,
                },
              ]}
              onPress={handleCheckIn}
              disabled={checkinLoading || !!checkinStatus?.checkedInToday}
            >
              {checkinLoading ? (
                <ActivityIndicator size="small" color={checkinStatus?.checkedInToday ? theme.subTextColor : '#fff'} />
              ) : (
                <Ionicons
                  name={checkinStatus?.checkedInToday ? 'checkmark-circle-outline' : 'calendar-outline'}
                  size={16}
                  color={checkinStatus?.checkedInToday ? theme.subTextColor : '#fff'}
                />
              )}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: 'bold',
                  marginLeft: 5,
                  color: checkinStatus?.checkedInToday ? theme.subTextColor : '#fff',
                }}
              >
                {checkinStatus?.checkedInToday
                  ? (checkinStatus?.streak ? `已签到 · 连续${checkinStatus.streak}天` : '今日已签到')
                  : '立即签到'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Profile Tabs（签到、关注、粉丝、我的发布、已购角色卡） */}
        <View style={[styles.profileTabsRow, { backgroundColor: theme.menuBgColor, borderColor: theme.borderColor }]}>
          {([
            { key: 'checkin' as const, label: '签到', icon: 'calendar-outline' as const },
            { key: 'following' as const, label: '关注', icon: 'people-outline' as const },
            { key: 'followers' as const, label: '粉丝', icon: 'person-add-outline' as const },
            { key: 'myposts' as const, label: '我的发布', icon: 'create-outline' as const },
            { key: 'purchased' as const, label: '已购卡片', icon: 'card-outline' as const },
          ] as const).map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.profileTabBtn, profileTab === t.key && { borderBottomColor: theme.accentColor }]}
              onPress={() => setProfileTab(t.key)}
            >
              <Ionicons
                name={t.icon}
                size={16}
                color={profileTab === t.key ? theme.accentColor : theme.subTextColor}
              />
              <Text
                style={{
                  fontSize: 11,
                  marginTop: 2,
                  color: profileTab === t.key ? theme.accentColor : theme.subTextColor,
                }}
                numberOfLines={1}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Profile Tab 内容区 */}
        <View style={styles.profileTabContent}>
          {tabLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={theme.accentColor} />
          ) : profileTab === 'checkin' ? (
            <CheckInPanel
              theme={theme}
              status={checkinStatus}
              onCheckIn={handleCheckIn}
              checking={checkinLoading}
              points={points}
            />
          ) : profileTab === 'following' ? (
            <FollowListPanel theme={theme} list={followingList} type="following" />
          ) : profileTab === 'followers' ? (
            <FollowListPanel theme={theme} list={followersList} type="followers" />
          ) : profileTab === 'myposts' ? (
            <PostsListPanel theme={theme} list={myPosts} />
          ) : (
            <PurchasedCardsPanel theme={theme} list={purchasedCards} />
          )}
        </View>

        {/* 基本信息 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>基本信息</Text>
          <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.subTextColor }]}>昵称</Text>
            <TextInput
              style={[styles.input, { color: theme.textColor }]}
              value={nickname}
              onChangeText={setNickname}
              placeholder="显示的昵称"
              placeholderTextColor={theme.subTextColor}
            />
          </View>
          <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.subTextColor }]}>个性签名</Text>
            <TextInput
              style={[styles.input, { color: theme.textColor, minHeight: 80 }]}
              value={bio}
              onChangeText={setBio}
              placeholder="介绍一下自己..."
              placeholderTextColor={theme.subTextColor}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* 好友 */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>好友</Text>
            <TouchableOpacity onPress={() => { setFriendsPanelVisible(true); loadFriends(); }}>
              <Text style={{ color: theme.accentColor, fontSize: 14 }}>管理</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.hint, { color: theme.subTextColor }]}>
            共 {friends.length} 位好友
            {incomingReqs.length > 0 ? `，${incomingReqs.length} 条待处理申请` : ''}
          </Text>
        </View>

        {/* 用户数据 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>用户数据</Text>
          <Text style={[styles.hint, { color: theme.subTextColor }]}>
            可将本地导出的数据 JSON 上传到服务器备份，或从服务器下载你的数据。
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={handleDownloadUserData}
              disabled={dataLoading}
            >
              {dataLoading ? <ActivityIndicator color={theme.textColor} /> : (
                <Text style={{ color: theme.textColor }}>下载数据</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.accentColor }]}
              onPress={handleUploadUserData}
              disabled={dataLoading}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>上传数据</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 服务器设置 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>服务器设置</Text>
          <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.subTextColor }]}>社区服务器地址</Text>
            <TextInput
              style={[styles.input, { color: theme.textColor }]}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://192.168.x.x:3000"
              placeholderTextColor={theme.subTextColor}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <Text style={[styles.hint, { color: theme.subTextColor }]}>
            手机需连接到电脑同一WiFi。电脑局域网IP可通过 ipconfig 查询。默认端口 3000。
          </Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={handleTestConnection}
            >
              <Text style={{ color: theme.textColor }}>测试连接</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.accentColor }]}
              onPress={handleUpdateServer}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>保存地址</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 管理员面板 */}
        {user?.isAdmin && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>管理员面板</Text>
            {adminStats && (
              <View style={[styles.statsRow, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: theme.accentColor }]}>{adminStats.totalUsers}</Text>
                  <Text style={[styles.statLabel, { color: theme.subTextColor }]}>用户</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: theme.accentColor }]}>{adminStats.totalPosts}</Text>
                  <Text style={[styles.statLabel, { color: theme.subTextColor }]}>帖子</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: theme.accentColor }]}>{adminStats.totalLikes}</Text>
                  <Text style={[styles.statLabel, { color: theme.subTextColor }]}>点赞</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: theme.accentColor }]}>{adminStats.totalComments}</Text>
                  <Text style={[styles.statLabel, { color: theme.subTextColor }]}>评论</Text>
                </View>
              </View>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.accentColor, marginBottom: 12 }]}
              onPress={() => { setAdminPanelVisible(true); loadAdminData(); }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>管理用户</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 安全 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>安全</Text>
          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: theme.secondaryColor, marginBottom: 12 }]}
            onPress={() => setPwdModalVisible(true)}
          >
            <Text style={{ color: theme.textColor }}>修改密码</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dangerBtn, { backgroundColor: '#ff6b6b20' }]}
            onPress={() => {
              Alert.alert('确认', '确定要退出登录吗？', [
                { text: '取消', style: 'cancel' },
                { text: '确定', style: 'destructive', onPress: onLogout },
              ]);
            }}
          >
            <Text style={{ color: '#ff6b6b', fontWeight: 'bold' }}>退出登录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 好友管理 Modal */}
      <Modal visible={friendsPanelVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setFriendsPanelVisible(false)} style={styles.closeBtn}>
              <Text style={{ color: theme.textColor, fontSize: 16 }}>←</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.textColor }]}>好友</Text>
            <TouchableOpacity onPress={loadFriends}>
              <Text style={{ color: theme.accentColor, fontSize: 14 }}>刷新</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.tabRow, { borderColor: theme.borderColor }]}>
            <TouchableOpacity
              style={[styles.tabBtn, friendTab === 'friends' && { backgroundColor: theme.accentColor }]}
              onPress={() => setFriendTab('friends')}
            >
              <Text style={{ color: friendTab === 'friends' ? '#fff' : theme.textColor, fontSize: 14 }}>
                好友 ({friends.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, friendTab === 'requests' && { backgroundColor: theme.accentColor }]}
              onPress={() => setFriendTab('requests')}
            >
              <Text style={{ color: friendTab === 'requests' ? '#fff' : theme.textColor, fontSize: 14 }}>
                申请 ({incomingReqs.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* 添加好友 */}
          <View style={[styles.addFriendBox, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.subTextColor }]}>按 UID 添加好友</Text>
            <TextInput
              style={[styles.input, { color: theme.textColor }]}
              value={addUidInput}
              onChangeText={setAddUidInput}
              placeholder="输入对方 UID"
              placeholderTextColor={theme.subTextColor}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, { color: theme.textColor, minHeight: 40 }]}
              value={addMsgInput}
              onChangeText={setAddMsgInput}
              placeholder="验证消息（可选）"
              placeholderTextColor={theme.subTextColor}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.accentColor, marginTop: 8 }]}
              onPress={handleSendFriendRequest}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>发送申请</Text>
            </TouchableOpacity>
          </View>

          {friendsLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.accentColor} />
            </View>
          ) : friendTab === 'friends' ? (
            <FlatList
              data={friends}
              keyExtractor={(item, idx) => String(item.uid ?? idx)}
              contentContainerStyle={{ padding: 16 }}
              renderItem={renderFriendItem}
              refreshControl={<RefreshControl refreshing={friendsLoading} onRefresh={loadFriends} />}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.subTextColor }]}>暂无好友，试试按 UID 添加</Text>
              }
            />
          ) : (
            <FlatList
              data={incomingReqs}
              keyExtractor={(item, idx) => String(item.id ?? idx)}
              contentContainerStyle={{ padding: 16 }}
              renderItem={renderRequestItem}
              refreshControl={<RefreshControl refreshing={friendsLoading} onRefresh={loadFriends} />}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.subTextColor }]}>暂无待处理的好友申请</Text>
              }
            />
          )}

          {outgoingReqs.length > 0 && (
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.borderColor }}>
              <Text style={[styles.label, { color: theme.subTextColor, marginBottom: 8 }]}>
                已发送申请（{outgoingReqs.length}）
              </Text>
              {outgoingReqs.map((r, i) => (
                <Text key={i} style={{ color: theme.subTextColor, fontSize: 12 }}>
                  · UID {r.uid} {r.nickname ? `(${r.nickname})` : ''} - 等待对方确认
                </Text>
              ))}
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* 修改密码 Modal */}
      <Modal visible={pwdModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.pwdModal, { backgroundColor: theme.backgroundColor }]}>
            <Text style={[styles.title, { color: theme.textColor, textAlign: 'center', marginBottom: 16 }]}>
              修改密码
            </Text>
            <TextInput
              style={[styles.pwdInput, { color: theme.textColor, borderColor: theme.borderColor }]}
              value={oldPwd}
              onChangeText={setOldPwd}
              placeholder="原密码"
              placeholderTextColor={theme.subTextColor}
              secureTextEntry
            />
            <TextInput
              style={[styles.pwdInput, { color: theme.textColor, borderColor: theme.borderColor }]}
              value={newPwd}
              onChangeText={setNewPwd}
              placeholder="新密码（至少 6 位）"
              placeholderTextColor={theme.subTextColor}
              secureTextEntry
            />
            <TextInput
              style={[styles.pwdInput, { color: theme.textColor, borderColor: theme.borderColor }]}
              value={confirmPwd}
              onChangeText={setConfirmPwd}
              placeholder="确认新密码"
              placeholderTextColor={theme.subTextColor}
              secureTextEntry
            />
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={() => { setPwdModalVisible(false); setOldPwd(''); setNewPwd(''); setConfirmPwd(''); }}
                disabled={pwdLoading}
              >
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.accentColor }]}
                onPress={handleChangePassword}
                disabled={pwdLoading}
              >
                {pwdLoading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>确认</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 管理员 Modal */}
      <Modal visible={adminPanelVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setAdminPanelVisible(false)} style={styles.closeBtn}>
              <Text style={{ color: theme.textColor, fontSize: 16 }}>←</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { color: theme.textColor }]}>用户管理</Text>
            <TouchableOpacity onPress={loadAdminData}>
              <Text style={{ color: theme.accentColor, fontSize: 14 }}>刷新</Text>
            </TouchableOpacity>
          </View>
          {adminLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.accentColor} />
            </View>
          ) : (
            <FlatList
              data={adminUsers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View style={[styles.userCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
                  <View style={styles.userInfo}>
                    <View style={[styles.avatar, { backgroundColor: theme.secondaryColor, width: 44, height: 44, borderRadius: 22 }]}>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                        {(item.username || 'U')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: theme.textColor }]}>
                        @{item.username}
                        {item.isAdmin ? <Text style={{ color: theme.accentColor, fontSize: 12 }}> 管理员</Text> : null}
                      </Text>
                      <Text style={[styles.userMeta, { color: theme.subTextColor }]}>
                        {item.nickname || '无昵称'} · UID {item.uid ?? '-'} · {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.userActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: theme.borderColor }]}
                      onPress={() => handleToggleAdmin(item.id, !!item.isAdmin)}
                    >
                      <Text style={{ color: theme.textColor, fontSize: 12 }}>
                        {item.isAdmin ? '取消管理员' : '设为管理员'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: '#ff6b6b', marginLeft: 8 }]}
                      onPress={() => handleDeleteUser(item.id)}
                    >
                      <Text style={{ color: '#ff6b6b', fontSize: 12 }}>删除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: theme.subTextColor }]}>暂无用户</Text>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

// ==========================================================
// 子组件：签到面板、关注列表、粉丝列表、我的发布、已购卡片
// ==========================================================

const CheckInPanel: React.FC<{
  theme: any;
  status: any;
  onCheckIn: () => void;
  checking: boolean;
  points: number;
}> = ({ theme, status, onCheckIn, checking, points }) => {
  const streak = status?.streak || 0;
  const checkedInToday = !!status?.checkedInToday;
  const totalPoints = status?.totalPoints ?? points;
  const week = [1, 2, 3, 4, 5, 6, 7];
  return (
    <View>
      <View style={[
        styles.checkinCard,
        { backgroundColor: theme.primaryColor, borderColor: theme.borderColor },
      ]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <View>
            <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: 'bold' }}>每日签到</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 2 }}>
              连续签到奖励更多积分
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.bigCheckinBtn,
              {
                backgroundColor: checkedInToday ? theme.secondaryColor : theme.accentColor,
                borderColor: checkedInToday ? theme.borderColor : theme.accentColor,
              },
            ]}
            onPress={onCheckIn}
            disabled={checking || checkedInToday}
          >
            {checking ? (
              <ActivityIndicator size="small" color={checkedInToday ? theme.subTextColor : '#fff'} />
            ) : (
              <Text style={{
                color: checkedInToday ? theme.subTextColor : '#fff',
                fontSize: 13,
                fontWeight: 'bold',
              }}>
                {checkedInToday ? '今日已签到' : '立即签到 +10'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: theme.accentColor, fontSize: 20, fontWeight: 'bold' }}>{streak}</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>连续天数</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: theme.accentColor, fontSize: 20, fontWeight: 'bold' }}>{totalPoints}</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>累计积分</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: theme.accentColor, fontSize: 20, fontWeight: 'bold' }}>
              {status?.totalDays ?? 0}
            </Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>累计签到</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.map((d, i) => {
            const hit = typeof streak === 'number' ? i < (streak % 7 || 7) && i < 7 : false;
            return (
              <View key={d} style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ color: theme.subTextColor, fontSize: 10, marginBottom: 6 }}>
                  {['一', '二', '三', '四', '五', '六', '日'][i]}
                </Text>
                <View style={[
                  styles.weekDot,
                  {
                    backgroundColor: hit ? theme.accentColor : theme.secondaryColor,
                    borderColor: checkedInToday && i === ((streak - 1) % 7 + 7) % 7
                      ? theme.accentColor
                      : 'transparent',
                  },
                ]}>
                  {hit ? (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500', marginBottom: 8 }}>
          签到规则
        </Text>
        {[
          '每日签到可获得 10 积分',
          '连续 3 天签到额外奖励 5 积分',
          '连续 7 天签到额外奖励 20 积分',
          '购买 / 发布角色卡都需要积分',
        ].map((rule, i) => (
          <Text key={i} style={{ color: theme.subTextColor, fontSize: 12, lineHeight: 22 }}>
            · {rule}
          </Text>
        ))}
      </View>
    </View>
  );
};

const FollowListPanel: React.FC<{ theme: any; list: any[]; type: 'following' | 'followers' }> = ({ theme, list, type }) => (
  <FlatList
    data={list}
    keyExtractor={(item, idx) => String(item.uid ?? item.id ?? idx)}
    scrollEnabled={false}
    ListEmptyComponent={
      <Text style={{ color: theme.subTextColor, textAlign: 'center', paddingVertical: 30, fontSize: 13 }}>
        {type === 'following' ? '还没有关注的用户' : '还没有粉丝'}
      </Text>
    }
    renderItem={({ item }) => (
      <View style={[styles.followCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        <View style={[styles.followAvatar, { backgroundColor: theme.accentColor + '30' }]}>
          <Text style={{ color: theme.accentColor, fontWeight: 'bold' }}>
            {(item.nickname || item.username || 'U')[0]}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '500' }}>
            {item.nickname || item.username || '未命名用户'}
          </Text>
          <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 2 }}>
            UID: {item.uid ?? '-'}
            {item.bio ? ` · ${String(item.bio).slice(0, 20)}` : ''}
          </Text>
        </View>
      </View>
    )}
  />
);

const PostsListPanel: React.FC<{ theme: any; list: any[] }> = ({ theme, list }) => (
  <FlatList
    data={list}
    keyExtractor={(item, idx) => String(item.id ?? idx)}
    scrollEnabled={false}
    ListEmptyComponent={
      <Text style={{ color: theme.subTextColor, textAlign: 'center', paddingVertical: 30, fontSize: 13 }}>
        你还没有发布过内容
      </Text>
    }
    renderItem={({ item }) => (
      <View style={[styles.postCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '500' }} numberOfLines={2}>
          {item.title || '（无标题）'}
        </Text>
        <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
          {item.content || ''}
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 8, justifyContent: 'space-between' }}>
          <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : ''}
          </Text>
          <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
            ❤️ {item.likes || 0} · 💬 {item.commentsCount || 0}
          </Text>
        </View>
      </View>
    )}
  />
);

const PurchasedCardsPanel: React.FC<{ theme: any; list: any[] }> = ({ theme, list }) => (
  list.length === 0 ? (
    <Text style={{ color: theme.subTextColor, textAlign: 'center', paddingVertical: 30, fontSize: 13 }}>
      还没有购买过角色卡
    </Text>
  ) : (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      {list.map((c: any) => {
        const price = typeof c.price === 'number' ? c.price : 0;
        return (
          <View
            key={c.id || c.cardId || c._id}
            style={[styles.purchCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
          >
            <View style={[styles.purchCardHead, { backgroundColor: theme.secondaryColor }]}>
              <Text style={{ fontSize: 22, color: theme.accentColor, fontWeight: 'bold' }}>
                {(c.name || c.characterName || c.title || 'C')[0]}
              </Text>
              <View style={{
                position: 'absolute', top: 6, right: 6,
                paddingHorizontal: 6, paddingVertical: 2,
                backgroundColor: price === 0 ? theme.accentColor : '#ff6b6b',
                borderRadius: 8,
              }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                  {price === 0 ? '免费' : `${price}`}
                </Text>
              </View>
            </View>
            <View style={{ padding: 8 }}>
              <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                {c.name || c.characterName || c.title || '角色卡'}
              </Text>
              <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                @{c.authorNickname || c.authorName || '匿名'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  )
);


const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: { width: 32, height: 32, justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1 },
  contentInner: { padding: 16 },

  avatarSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  username: { fontSize: 16, fontWeight: '500' },
  uidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 10,
  },

  section: { marginBottom: 24 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 12 },

  inputGroup: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
  },
  label: { fontSize: 12, marginBottom: 4 },
  input: { fontSize: 15, paddingVertical: 4 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 12 },

  btnRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerBtn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 管理员面板
  statsRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: 'bold' },
  statLabel: { fontSize: 12, marginTop: 4 },

  userCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  userName: { fontSize: 15, fontWeight: '500' },
  userMeta: { fontSize: 12, marginTop: 2 },
  userActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyText: { textAlign: 'center', marginTop: 40 },

  // 好友
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addFriendBox: {
    margin: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  friendAvatar: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  acceptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },

  // 修改密码
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  pwdModal: {
    borderRadius: 16,
    padding: 20,
  },
  pwdInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },

  // ======= 积分 + 签到 =======
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  pointsBox: {
    flex: 1,
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  checkinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },

  // ======= Profile Tabs =======
  profileTabsRow: {
    marginTop: 14,
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  profileTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  profileTabContent: {
    marginTop: 12,
  },

  // 签到卡片
  checkinCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  bigCheckinBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },

  // 关注 / 粉丝卡片
  followCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  followAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 我的发布
  postCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },

  // 已购卡片
  purchCard: {
    width: '48%',
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  purchCardHead: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
