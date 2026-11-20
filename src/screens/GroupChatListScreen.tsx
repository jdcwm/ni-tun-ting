import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chat, GroupMember, Character } from '../types';
import { generateId, defaultChatSettings } from '../constants/defaults';
import { IconUp, IconDown } from '../components/Icons';
import { ActionMenu } from '../components/ActionMenu';
import { mergeChatSettings } from '../utils/chatSettingsMerge';

interface GroupChatListScreenProps {
  onSelectChat: (chatId: string) => void;
  currentChatId?: string;
  onCreateGroup: () => void;
}

export const GroupChatListScreen: React.FC<GroupChatListScreenProps> = ({
  onSelectChat,
  currentChatId,
  onCreateGroup,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { chats, setChats, characters, presetCharacters, setPlayingAs, settings, setSettings, createChatFromCharacter } = useApp();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingGroup, setRenamingGroup] = useState<Chat | null>(null);
  const [renameText, setRenameText] = useState('');
  const [viewTab, setViewTab] = useState<'groups' | 'contacts'>('groups');
  /** 通讯录「拉人建群」多选模式 */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  /** 当前打开的通讯录（null = 显示通讯录列表） */
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  /** 「添加角色到通讯录」弹窗 */
  const [showAddToBook, setShowAddToBook] = useState(false);
  const [bookDraftPick, setBookDraftPick] = useState<Set<string>>(new Set());
  /** 通讯录改名 */
  const [bookRenameTarget, setBookRenameTarget] = useState<string | null>(null);
  const [bookRenameText, setBookRenameText] = useState('');
  /** 长按通讯录角色弹出的菜单 */
  const [contactMenuTarget, setContactMenuTarget] = useState<Character | null>(null);

  const contactBooks = settings.conversation?.contactBooks || [];
  const openBook = contactBooks.find((b) => b.id === openBookId) || null;

  const saveContactBooks = (books: typeof contactBooks) => {
    setSettings({
      ...settings,
      conversation: { ...settings.conversation, contactBooks: books },
    } as any);
  };

  const createContactBook = () => {
    const now = Date.now();
    const book = { id: generateId(), name: `通讯录 ${contactBooks.length + 1}`, characterIds: [], createdAt: now };
    saveContactBooks([...contactBooks, book]);
    setOpenBookId(book.id);
  };

  const renameContactBook = (id: string, name: string) => {
    saveContactBooks(contactBooks.map((b) => (b.id === id ? { ...b, name } : b)));
  };

  const deleteContactBook = (id: string) => {
    saveContactBooks(contactBooks.filter((b) => b.id !== id));
    if (openBookId === id) setOpenBookId(null);
  };

  const addCharactersToBook = (id: string, ids: string[]) => {
    saveContactBooks(
      contactBooks.map((b) =>
        b.id === id ? { ...b, characterIds: Array.from(new Set([...b.characterIds, ...ids])) } : b,
      ),
    );
  };

  const removeCharacterFromBook = (id: string, charId: string) => {
    saveContactBooks(
      contactBooks.map((b) => (b.id === id ? { ...b, characterIds: b.characterIds.filter((c) => c !== charId) } : b)),
    );
  };

  /** 当前通讯录里的角色（不同通讯录互不共享）——定义放在 allCharacters 之后 */


  // 预设角色在首启时也会被写进 characters，直接拼接会出现两份 → 按 id 去重
  const allCharacters = useMemo(() => {
    const seen = new Set<string>();
    const out: Character[] = [];
    for (const c of [...(presetCharacters || []), ...(characters || [])]) {
      if (!c || !c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out;
  }, [presetCharacters, characters]);

  /** 当前通讯录里的角色（不同通讯录互不共享） */
  const bookCharacters = useMemo(
    () => (openBook ? allCharacters.filter((c) => openBook.characterIds.includes(c.id)) : []),
    [openBook, allCharacters],
  );

  // 通讯录：与某个角色私聊（单角色普通对话，复用已有或新建）
  const handlePrivateChatWithCharacter = (character: Character, asPuppet = false) => {
    const existing = chats.find(
      (c) => c.characterId === character.id && c.conversationType !== 'group' && c.conversationType !== 'group_private'
    );
    if (existing) {
      if (asPuppet) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === existing.id
              ? { ...c, settings: { ...c.settings, puppetCharacterId: character.id } }
              : c,
          ),
        );
      }
      onSelectChat(existing.id);
      return;
    }
    const newChat = createChatFromCharacter(character);
    if (asPuppet) {
      newChat.settings = { ...newChat.settings, puppetCharacterId: character.id };
    }
    setChats([newChat, ...chats]);
    onSelectChat(newChat.id);
  };

  /** 用选中的角色直接建一个群聊（通讯录「拉人建群」） */
  const createGroupFromSelection = () => {
    const chosen = allCharacters.filter((c) => selectedCharIds.has(c.id));
    if (chosen.length === 0) {
      setSelectMode(false);
      return;
    }
    const now = Date.now();
    const members: GroupMember[] = chosen.map((ch, i) => ({
      id: `m_${now}_${i}`,
      characterId: ch.id,
      name: ch.name,
      avatar: ch.avatar,
      settings: mergeChatSettings({
        ...defaultChatSettings,
        systemPrompt: ch.description || ch.systemPrompt || '',
        statusBar: ch.statusBar,
      }),
      isActive: true,
      autoRespond: true,
      joinOrder: i,
    }));
    const newChat: Chat = {
      id: generateId(),
      title: chosen.length <= 2 ? chosen.map((c) => c.name).join('、') : `${chosen[0].name} 等 ${chosen.length} 人`,
      messages: [],
      createdAt: now,
      updatedAt: now,
      worldBookIds: [],
      settings: { ...defaultChatSettings },
      conversationType: 'group',
      groupMembers: members,
    };
    setChats([newChat, ...chats]);
    setSelectMode(false);
    setSelectedCharIds(new Set());
    setViewTab('groups');
    onSelectChat(newChat.id);
  };

  const groupChats = useMemo(() =>
    chats.filter((c) => c.conversationType === 'group'),
    [chats]
  );

  const privateChats = useMemo(() =>
    chats.filter((c) => c.conversationType === 'group_private'),
    [chats]
  );

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const getMemberPrivateChat = (groupId: string, memberId: string): Chat | undefined => {
    return privateChats.find(
      (c) => c.parentId === groupId && c.activeMemberId === memberId
    );
  };

  const createPrivateChat = (groupChat: Chat, member: GroupMember): Chat => {
    const privateChat: Chat = {
      id: generateId(),
      title: `与 ${member.name} 私聊`,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      worldBookIds: [...groupChat.worldBookIds],
      settings: mergeChatSettings(member.settings),
      parentId: groupChat.id,
      conversationType: 'group_private',
      activeMemberId: member.id,
      assistantAvatar: member.avatar,
      userAvatar: groupChat.userAvatar,
    };
    setChats((prev) => [privateChat, ...prev]);
    return privateChat;
  };

  const handleSelectMember = (groupChat: Chat, member: GroupMember) => {
    let privateChat = getMemberPrivateChat(groupChat.id, member.id);
    if (!privateChat) {
      privateChat = createPrivateChat(groupChat, member);
    }
    onSelectChat(privateChat.id);
  };

  const handleAddMember = (groupId: string) => {
    setEditingGroupId(groupId);
    setShowAddMember(true);
  };

  const addMemberToGroup = (groupChat: Chat, character: Character) => {
    const member: GroupMember = {
      id: generateId(),
      characterId: character.id,
      name: character.name,
      avatar: character.avatar,
      settings: mergeChatSettings({
        ...defaultChatSettings,
        systemPrompt: character.systemPrompt,
        summaryPrompt: character.summaryPrompt || defaultChatSettings.summaryPrompt,
        statusBar: character.statusBar,
      }),
      isActive: true,
      autoRespond: true,
      joinOrder: (groupChat.groupMembers?.length || 0) + 1,
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === groupChat.id
          ? { ...c, groupMembers: [...(c.groupMembers || []), member], updatedAt: Date.now() }
          : c
      )
    );
    setShowAddMember(false);
    setEditingGroupId(null);
  };

  const removeMemberFromGroup = (groupChat: Chat, memberId: string) => {
    Alert.alert('移除成员', '确定要将此成员移出群聊吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: () => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === groupChat.id
                ? { ...c, groupMembers: (c.groupMembers || []).filter((m) => m.id !== memberId), updatedAt: Date.now() }
                : c
            )
          );
          // Also remove associated private chat
          const privateChat = getMemberPrivateChat(groupChat.id, memberId);
          if (privateChat) {
            setChats((prev) => prev.filter((c) => c.id !== privateChat.id));
          }
        },
      },
    ]);
  };

  const toggleMemberActive = (groupChat: Chat, memberId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== groupChat.id) return c;
        return {
          ...c,
          groupMembers: (c.groupMembers || []).map((m) =>
            m.id === memberId ? { ...m, isActive: !m.isActive } : m
          ),
        };
      })
    );
  };

  const handleRenameGroup = (group: Chat) => {
    setRenamingGroup(group);
    setRenameText(group.title);
    setShowRenameModal(true);
  };

  const saveRename = () => {
    if (renamingGroup && renameText.trim()) {
      setChats((prev) =>
        prev.map((c) =>
          c.id === renamingGroup.id ? { ...c, title: renameText.trim() } : c
        )
      );
    }
    setShowRenameModal(false);
    setRenamingGroup(null);
  };

  const deleteGroup = (group: Chat) => {
    Alert.alert('删除群聊', `确定删除"${group.title}"吗？所有私聊记录也会被删除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          const idsToDelete = new Set([group.id]);
          privateChats.forEach((pc) => {
            if (pc.parentId === group.id) idsToDelete.add(pc.id);
          });
          setChats((prev) => prev.filter((c) => !idsToDelete.has(c.id)));
        },
      },
    ]);
  };

  const getCharacterById = (id?: string) => allCharacters?.find((c) => c && c.id === id);

  const renderMember = (groupChat: Chat, member: GroupMember) => {
    const privateChat = getMemberPrivateChat(groupChat.id, member.id);
    const lastMsg = privateChat?.messages[privateChat.messages.length - 1];
    const isSelected = currentChatId === privateChat?.id;

    return (
      <View
        key={member.id}
        style={[
          styles.memberItem,
          {
            backgroundColor: isSelected ? theme.accentColor + '15' : 'transparent',
            borderLeftColor: member.isActive ? theme.accentColor : theme.borderColor,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.memberMain}
          onPress={() => handleSelectMember(groupChat, member)}
          onLongPress={() => {
            const isPlayingAs = member.characterId && settings.conversation?.playingAsCharacterId === member.characterId;
            Alert.alert(
              member.name,
              undefined,
              [
                { text: member.isActive ? '禁言' : '解除禁言', onPress: () => toggleMemberActive(groupChat, member.id) },
                {
                  text: isPlayingAs ? '取消扮演' : '扮演此角色',
                  onPress: () => setPlayingAs(isPlayingAs ? undefined : member.characterId),
                },
                { text: '移出群聊', style: 'destructive', onPress: () => removeMemberFromGroup(groupChat, member.id) },
                { text: '取消', style: 'cancel' },
              ]
            );
          }}
          delayLongPress={500}
        >
          <View style={styles.memberAvatarContainer}>
            {member.avatar ? (
              <Image source={{ uri: member.avatar }} style={styles.memberAvatar} />
            ) : (
              <View style={[styles.memberAvatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                <Text style={{ color: theme.subTextColor, fontSize: 16 }}>
                  {member.name.charAt(0)}
                </Text>
              </View>
            )}
            <View
              style={[
                styles.memberStatusDot,
                { backgroundColor: member.isActive ? '#4caf50' : '#999' },
              ]}
            />
          </View>
          <View style={styles.memberInfo}>
            <View style={styles.memberNameRow}>
              <Text style={{ color: theme.textColor, fontWeight: '500', fontSize: 14 }} numberOfLines={1}>
                {member.name}
              </Text>
              {!member.isActive && (
                <Text style={{ color: theme.subTextColor, fontSize: 11 }}> (禁言)</Text>
              )}
            </View>
            <Text style={{ color: theme.subTextColor, fontSize: 12 }} numberOfLines={1}>
              {lastMsg ? lastMsg.content.slice(0, 40) : '点击开始私聊'}
            </Text>
          </View>
          <Text style={{ color: theme.subTextColor, fontSize: 20 }}>{'>'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderGroupChat = ({ item }: { item: Chat }) => {
    const isExpanded = expandedGroups.has(item.id);
    const members = item.groupMembers || [];
    const activeCount = members.filter((m) => m.isActive).length;
    const isSelected = currentChatId === item.id;

    return (
      <View>
        <TouchableOpacity
          style={[
            styles.groupItem,
            {
              backgroundColor: isSelected ? theme.accentColor + '15' : 'transparent',
              borderBottomColor: theme.borderColor,
            },
          ]}
          onPress={() => {
            if (members.length === 0) {
              toggleExpand(item.id);
            } else {
              onSelectChat(item.id);
            }
          }}
          onLongPress={() => {
            Alert.alert(
              item.title,
              undefined,
              [
                { text: isExpanded ? '折叠' : '展开', onPress: () => toggleExpand(item.id) },
                { text: '重命名', onPress: () => handleRenameGroup(item) },
                { text: '删除群聊', style: 'destructive', onPress: () => deleteGroup(item) },
                { text: '取消', style: 'cancel' },
              ]
            );
          }}
          delayLongPress={500}
        >
          <View style={styles.groupMain}>
            <View style={[styles.groupIcon, { backgroundColor: theme.accentColor + '20' }]}>
              <Text style={{ fontSize: 18 }}>{isExpanded ? '📂' : '💬'}</Text>
            </View>
            <View style={styles.groupInfo}>
              <Text style={{ color: theme.textColor, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 2 }}>
                {members.length} 位成员 · {activeCount} 活跃
              </Text>
            </View>
          </View>
          <View style={styles.groupActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => toggleExpand(item.id)}
            >
              {isExpanded ? <IconUp size={18} color={theme.subTextColor} /> : <IconDown size={18} color={theme.subTextColor} />}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={[styles.memberList, { backgroundColor: theme.backgroundColor + '50' }]}>
            {members.length === 0 ? (
              <Text style={{ color: theme.subTextColor, fontSize: 12, padding: 12, textAlign: 'center' }}>
                暂无成员，点击下方添加
              </Text>
            ) : (
              members.map((m) => renderMember(item, m))
            )}
            <TouchableOpacity
              style={[styles.addMemberBtn, { backgroundColor: theme.accentColor + '15', borderColor: theme.accentColor }]}
              onPress={() => handleAddMember(item.id)}
            >
              <Text style={{ color: theme.accentColor, fontSize: 13, fontWeight: '500' }}>
                + 添加成员
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const editingGroup = groupChats.find((g) => g.id === editingGroupId);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>AI群聊</Text>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: theme.accentColor }]}
          onPress={onCreateGroup}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>+ 新群聊</Text>
        </TouchableOpacity>
      </View>

      {/* 群聊 / 通讯录 切换 */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.borderColor }}>
        {(['groups', 'contacts'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: viewTab === tab ? theme.accentColor : 'transparent' }}
            onPress={() => {
              setViewTab(tab);
              if (tab !== 'contacts') {
                setSelectMode(false);
                setSelectedCharIds(new Set());
              }
            }}
          >
            <Text style={{ color: viewTab === tab ? theme.accentColor : theme.subTextColor, fontSize: 14, fontWeight: viewTab === tab ? '600' : '400' }}>
              {tab === 'groups' ? '群聊' : '通讯录'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 通讯录操作条 */}
      {viewTab === 'contacts' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.borderColor }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {openBook ? (
              <TouchableOpacity
                onPress={() => {
                  setOpenBookId(null);
                  setSelectMode(false);
                  setSelectedCharIds(new Set());
                }}
                style={{ paddingRight: 10, paddingVertical: 4 }}
              >
                <Text style={{ color: theme.accentColor, fontSize: 13, fontWeight: '600' }}>← 通讯录</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={{ color: theme.subTextColor, fontSize: 12 }} numberOfLines={1}>
              {!openBook
                ? `共 ${contactBooks.length} 本通讯录`
                : selectMode
                  ? `已选 ${selectedCharIds.size} 人`
                  : `${openBook.name} · ${openBook.characterIds.length} 个角色`}
            </Text>
          </View>
          {!openBook ? (
            <TouchableOpacity
              style={[styles.newBtn, { backgroundColor: theme.accentColor }]}
              onPress={createContactBook}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>+ 新建通讯录</Text>
            </TouchableOpacity>
          ) : selectMode ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.newBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={() => {
                  setSelectMode(false);
                  setSelectedCharIds(new Set());
                }}
              >
                <Text style={{ color: theme.textColor, fontSize: 12, fontWeight: '600' }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.newBtn, { backgroundColor: theme.accentColor, opacity: selectedCharIds.size ? 1 : 0.5 }]}
                onPress={createGroupFromSelection}
                disabled={selectedCharIds.size === 0}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                  建群 ({selectedCharIds.size})
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.newBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={() => {
                  setBookDraftPick(new Set());
                  setShowAddToBook(true);
                }}
              >
                <Text style={{ color: theme.textColor, fontSize: 12, fontWeight: '600' }}>+ 添加角色</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.newBtn, { backgroundColor: theme.accentColor }]}
                onPress={() => setSelectMode(true)}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>拉人建群</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {viewTab === 'groups' ? (
        groupChats.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 14, textAlign: 'center' }}>
              还没有群聊{'\n'}点击右上角创建一个新群聊
            </Text>
          </View>
        ) : (
          <FlatList
            data={groupChats}
            keyExtractor={(item) => item.id}
            renderItem={renderGroupChat}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : !openBook ? (
        /* 通讯录列表：每本互相独立，角色不互通 */
        <FlatList
          data={contactBooks}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>📇</Text>
              <Text style={{ color: theme.subTextColor, fontSize: 14, textAlign: 'center' }}>
                还没有通讯录{'\n'}点上面的「+ 新建通讯录」建一本
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.characterItem, { borderBottomColor: theme.borderColor }]}
              onPress={() => setOpenBookId(item.id)}
            >
              <View style={styles.characterItemLeft}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: theme.secondaryColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>📇</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textColor, fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 2 }}>
                    {item.characterIds.length} 个角色
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.newBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={() => {
                  setBookRenameTarget(item.id);
                  setBookRenameText(item.name);
                }}
              >
                <Text style={{ color: theme.textColor, fontSize: 12 }}>改名</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        /* 某本通讯录的详情：里面只显示这本收录的角色 */
        <FlatList
          data={bookCharacters}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ color: theme.subTextColor, fontSize: 14, textAlign: 'center' }}>
                这本通讯录还是空的{'\n'}点上面的「+ 添加角色」把角色加进来
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isPlayingAs = settings.conversation?.playingAsCharacterId === item.id;
            const checked = selectedCharIds.has(item.id);
            return (
              <View style={[styles.characterItem, { borderBottomColor: theme.borderColor }]}>
                <TouchableOpacity
                  style={styles.characterItemLeft}
                  onPress={() => {
                    if (selectMode) {
                      setSelectedCharIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                      return;
                    }
                    handlePrivateChatWithCharacter(item);
                  }}
                  onLongPress={() => {
                    // 长按：弹出菜单（私聊 / 扮演 TA 给自己发消息 / 移出）
                    setContactMenuTarget(item);
                  }}
                  delayLongPress={350}
                >
                  {selectMode && (
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        marginRight: 10,
                        borderWidth: 2,
                        borderColor: checked ? theme.accentColor : theme.borderColor,
                        backgroundColor: checked ? theme.accentColor : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {checked && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text>}
                    </View>
                  )}
                  {item.avatar ? (
                    <Image source={{ uri: item.avatar }} style={styles.characterAvatar} />
                  ) : (
                    <View style={[styles.characterAvatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                      <Text style={{ color: theme.subTextColor, fontSize: 14 }}>{item.name.charAt(0)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textColor, fontWeight: '500' }}>{item.name}</Text>
                    {isPlayingAs && (
                      <Text style={{ color: theme.accentColor, fontSize: 11, marginTop: 2 }}>正在扮演</Text>
                    )}
                  </View>
                </TouchableOpacity>
                {!selectMode && (
                  <TouchableOpacity
                    style={[styles.newBtn, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => removeCharacterFromBook(openBook.id, item.id)}
                  >
                    <Text style={{ color: theme.subTextColor, fontSize: 12 }}>移出</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 添加角色到通讯录 */}
      <Modal
        visible={showAddToBook}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddToBook(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddToBook(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]} onStartShouldSetResponder={() => true}>
            {/* 标题居中 + 右上角关闭，跟 App 其它弹窗保持一致 */}
            <Text style={[styles.modalTitle, { color: theme.textColor }]} numberOfLines={1}>
              添加角色到「{openBook?.name}」
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowAddToBook(false);
                setBookDraftPick(new Set());
              }}
              style={{ position: 'absolute', right: 12, top: 12, padding: 6, zIndex: 2 }}
            >
              <Text style={{ color: theme.subTextColor, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {allCharacters.map((c) => {
                const already = !!openBook?.characterIds.includes(c.id);
                const picked = bookDraftPick.has(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    disabled={already}
                    style={[
                      styles.modalItem,
                      { borderBottomColor: theme.borderColor, opacity: already ? 0.4 : 1 },
                    ]}
                    onPress={() =>
                      setBookDraftPick((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  >
                    <Text style={{ color: theme.textColor, flex: 1 }}>
                      {already ? '✓ ' : picked ? '● ' : ''}
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.newBtn, { flex: 1, backgroundColor: theme.secondaryColor, paddingVertical: 10 }]}
                onPress={() => {
                  setShowAddToBook(false);
                  setBookDraftPick(new Set());
                }}
              >
                <Text style={{ color: theme.textColor, textAlign: 'center' }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.newBtn, { flex: 1, backgroundColor: theme.accentColor, paddingVertical: 10 }]}
                onPress={() => {
                  if (openBook) addCharactersToBook(openBook.id, Array.from(bookDraftPick));
                  setShowAddToBook(false);
                  setBookDraftPick(new Set());
                }}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>
                  加入（{bookDraftPick.size}）
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 长按通讯录角色的菜单 —— 用 App 标准 ActionMenu，风格与其它弹窗统一 */}
      <ActionMenu
        visible={!!contactMenuTarget}
        onClose={() => setContactMenuTarget(null)}
        title={contactMenuTarget?.name}
        subtitle="选择要做的操作"
        theme={theme}
        items={[
          {
            label: '💬 私聊',
            onPress: () => {
              const t = contactMenuTarget;
              setContactMenuTarget(null);
              if (t) handlePrivateChatWithCharacter(t);
            },
          },
          {
            label: '👥 用 TA 建群聊',
            onPress: () => {
              const t = contactMenuTarget;
              setContactMenuTarget(null);
              if (!t) return;
              // 直接把 TA 选进建群多选，再勾其他成员后点「建群」
              setSelectMode(true);
              setSelectedCharIds(new Set([t.id]));
            },
          },
          ...(openBook
            ? [
                {
                  label: '🗑 移出这本通讯录',
                  destructive: true,
                  onPress: () => {
                    const t = contactMenuTarget;
                    setContactMenuTarget(null);
                    if (t && openBook) removeCharacterFromBook(openBook.id, t.id);
                  },
                },
              ]
            : []),
        ]}
      />

      {/* 通讯录改名 */}
      <Modal
        visible={!!bookRenameTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setBookRenameTarget(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBookRenameTarget(null)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]} onStartShouldSetResponder={() => true}>
            {/* 标题居中 + 右上角关闭，跟 App 其它弹窗保持一致 */}
            <Text style={[styles.modalTitle, { color: theme.textColor }]}>通讯录改名</Text>
            <TouchableOpacity
              onPress={() => setBookRenameTarget(null)}
              style={{ position: 'absolute', right: 12, top: 12, padding: 6, zIndex: 2 }}
            >
              <Text style={{ color: theme.subTextColor, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
            <TextInput
              style={{
                color: theme.textColor,
                backgroundColor: theme.inputBgColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
              }}
              value={bookRenameText}
              onChangeText={setBookRenameText}
              placeholder="通讯录名字"
              placeholderTextColor={theme.subTextColor}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.newBtn, { flex: 1, backgroundColor: '#ef4444', paddingVertical: 10 }]}
                onPress={() => {
                  if (bookRenameTarget) deleteContactBook(bookRenameTarget);
                  setBookRenameTarget(null);
                }}
              >
                <Text style={{ color: '#fff', textAlign: 'center' }}>删除这本</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.newBtn, { flex: 1, backgroundColor: theme.accentColor, paddingVertical: 10 }]}
                onPress={() => {
                  if (bookRenameTarget && bookRenameText.trim()) {
                    renameContactBook(bookRenameTarget, bookRenameText.trim());
                  }
                  setBookRenameTarget(null);
                }}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        visible={showAddMember}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMember(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddMember(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
            <Text style={[styles.modalTitle, { color: theme.textColor }]}>选择角色加入群聊</Text>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {allCharacters.length === 0 ? (
                <Text style={{ color: theme.subTextColor, textAlign: 'center', padding: 20 }}>
                  暂无角色卡，请先在设置中导入角色
                </Text>
              ) : (
                allCharacters.map((character) => {
                  const alreadyInGroup = editingGroup?.groupMembers?.some(
                    (m) => m.characterId === character.id
                  );
                  return (
                    <TouchableOpacity
                      key={character.id}
                      style={[
                        styles.characterItem,
                        { borderBottomColor: theme.borderColor },
                        alreadyInGroup && { opacity: 0.4 },
                      ]}
                      disabled={alreadyInGroup}
                      onPress={() => editingGroup && addMemberToGroup(editingGroup, character)}
                    >
                      <View style={styles.characterItemLeft}>
                        {character.avatar ? (
                          <Image source={{ uri: character.avatar }} style={styles.characterAvatar} />
                        ) : (
                          <View style={[styles.characterAvatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                            <Text style={{ color: theme.subTextColor, fontSize: 14 }}>
                              {character.name.charAt(0)}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Text style={{ color: theme.textColor, fontWeight: '500' }}>
                            {character.name}
                          </Text>
                          {character.tags.length > 0 && (
                            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
                              {character.tags.slice(0, 3).join(' · ')}
                            </Text>
                          )}
                        </View>
                      </View>
                      {alreadyInGroup ? (
                        <Text style={{ color: theme.subTextColor, fontSize: 12 }}>已加入</Text>
                      ) : (
                        <Text style={{ color: theme.accentColor, fontSize: 20 }}>+</Text>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename Modal */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRenameModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowRenameModal(false)}
        >
          <KeyboardAvoidingView
            style={{ width: '100%', alignItems: 'center' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <View style={[styles.renameModal, { backgroundColor: theme.menuBgColor }]}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>重命名群聊</Text>
              <TextInput
                style={[styles.renameInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                value={renameText}
                onChangeText={setRenameText}
                placeholder="群聊名称"
                placeholderTextColor={theme.subTextColor}
                autoFocus
              />
              <View style={styles.renameActions}>
                <TouchableOpacity
                  style={[styles.renameBtn, { backgroundColor: theme.secondaryColor }]}
                  onPress={() => setShowRenameModal(false)}
                >
                  <Text style={{ color: theme.textColor }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.renameBtn, { backgroundColor: theme.accentColor }]}
                  onPress={saveRename}
                >
                  <Text style={{ color: '#fff' }}>确定</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  newBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
  },
  groupMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfo: {
    flex: 1,
  },
  groupActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    padding: 8,
  },
  memberList: {
    paddingVertical: 4,
  },
  memberItem: {
    borderLeftWidth: 3,
    marginLeft: 8,
    marginRight: 8,
    marginBottom: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  memberMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
  },
  memberAvatarContainer: {
    position: 'relative',
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  memberAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addMemberBtn: {
    margin: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  modalMenuItem: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  characterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  characterItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  characterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  characterAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameModal: {
    borderRadius: 16,
    padding: 20,
    width: '80%',
  },
  renameInput: {
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  renameActions: {
    flexDirection: 'row',
    gap: 10,
  },
  renameBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
});
