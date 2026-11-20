import React from 'react';
import { ChatMessage, Chat, AIProvider } from '../types';
import { MessageBubble } from './MessageBubble';

export interface MessageBubbleItemActions {
  handleLongPress: (msg: ChatMessage) => void;
  handleImagePress: (uri: string) => void;
  handleRegenerate: (msg: ChatMessage) => void;
  handlePrevVersion: (msg: ChatMessage) => void;
  handleNextVersion: (msg: ChatMessage) => void;
  handleContinue: () => void;
  handleEdit: (msg: ChatMessage) => void;
  handleCopy: (msg: ChatMessage) => void;
  handleMore: (msg: ChatMessage) => void;
  handleSuggestedQuestion: (text: string) => void;
  handleChangeContent: (msgId: string, next: string) => void;
  handleChangeThinkingContent: (msgId: string, next: string) => void;
  handleVarUpdate: (vars: Record<string, number | string>) => void;
}

export interface MessageBubbleItemEnv {
  chat: Chat | undefined;
  parentChat: Chat | undefined;
  chats: Chat[];
  providers: AIProvider[];
  settings: any;
  userAvatar: string | undefined;
  assistantAvatar: string | undefined;
  textProviderAvatar?: string;
  messageCustomCSS: string;
  isLoading: boolean;
  streamingMessageId: string | null;
  chatMessagesLength: number;
  lastMessageId: string | null;
  conversationType?: string;
  bubbleStyle: string;
}

export interface MessageBubbleItemProps {
  item: ChatMessage;
  index: number;
  actions: MessageBubbleItemActions;
  env: MessageBubbleItemEnv;
}

function shallowStatusVars(
  a: Record<string, number | string> | undefined,
  b: Record<string, number | string> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

function envEqual(prev: MessageBubbleItemEnv, next: MessageBubbleItemEnv): boolean {
  if (prev.messageCustomCSS !== next.messageCustomCSS) return false;
  if (prev.isLoading !== next.isLoading) return false;
  if (prev.streamingMessageId !== next.streamingMessageId) return false;
  // 忽略 chatMessagesLength/lastMessageId：它们随每条消息变化，触发所有气泡重渲染造成闪烁
  // if (prev.chatMessagesLength !== next.chatMessagesLength) return false;
  // if (prev.lastMessageId !== next.lastMessageId) return false;
  if (prev.bubbleStyle !== next.bubbleStyle) return false;
  if (prev.userAvatar !== next.userAvatar) return false;
  if (prev.assistantAvatar !== next.assistantAvatar) return false;
  if (prev.textProviderAvatar !== next.textProviderAvatar) return false;
  if (prev.chat?.title !== next.chat?.title) return false;
  if (!shallowStatusVars(prev.chat?.statusVars as any, next.chat?.statusVars as any)) return false;
  return true;
}

function areItemPropsEqual(prev: MessageBubbleItemProps, next: MessageBubbleItemProps): boolean {
  if (prev.index !== next.index) return false;

  const prevItem = prev.item;
  const nextItem = next.item;
  if (prevItem.id !== nextItem.id) return false;

  const streaming = next.env.streamingMessageId === nextItem.id || prev.env.streamingMessageId === prevItem.id;
  if (streaming) {
    if (prevItem.content !== nextItem.content) return false;
    if (prevItem.thinkingContent !== nextItem.thinkingContent) return false;
    if (prevItem.isError !== nextItem.isError) return false;
    if (prevItem.firstTokenTime !== nextItem.firstTokenTime) return false;
    if (prevItem.totalElapsedTime !== nextItem.totalElapsedTime) return false;
    if ((prevItem.tokenUsage?.promptTokens ?? 0) !== (nextItem.tokenUsage?.promptTokens ?? 0)) return false;
    if ((prevItem.tokenUsage?.completionTokens ?? 0) !== (nextItem.tokenUsage?.completionTokens ?? 0)) return false;
    if (prevItem.providerId !== nextItem.providerId) return false;
    if (prevItem.senderMemberId !== nextItem.senderMemberId) return false;
  } else {
    if (prevItem !== nextItem) return false;
  }

  return envEqual(prev.env, next.env);
}

function computeAvatarAndSender(
  item: ChatMessage,
  env: MessageBubbleItemEnv,
): { avatar: string | undefined; senderName: string | undefined } {
  const isUser = item.role === 'user';
  let avatar = isUser ? env.userAvatar : env.assistantAvatar;
  if (!isUser && !avatar && env.textProviderAvatar) avatar = env.textProviderAvatar;
  let senderName: string | undefined;
  if (!isUser && item.senderMemberId && env.chat) {
    const groupChat = env.conversationType === 'group' ? env.chat : env.chats.find((ch) => ch.id === env.chat!.parentId);
    const member = groupChat?.groupMembers?.find((m) => m.id === item.senderMemberId);
    if (member) {
      avatar = member.avatar || avatar;
      senderName = member.name;
    }
  }
  return { avatar, senderName };
}

const MessageBubbleItemComponent: React.FC<MessageBubbleItemProps> = ({ item, index, actions, env }) => {
  const isUser = item.role === 'user';
  const { avatar, senderName } = computeAvatarAndSender(item, env);
  const providerName = item.providerId ? (env.providers?.find((p) => p && p.id === item.providerId)?.name || '') : '';
  const versionsLen = item.versions?.length ?? 0;
  const hasMultipleVersions = versionsLen > 1;
  const isLoading = env.isLoading;
  const streamingId = env.streamingMessageId;
  const showOps = !isLoading && !streamingId;
  const chat = env.chat;
  const isLastMessage = chat && chat.messages[chat.messages.length - 1]?.id === item.id;
  const convType = env.conversationType;

  return (
    <MessageBubble
      message={item}
      messageIndex={index}
      onLongPress={() => actions.handleLongPress(item)}
      onImagePress={actions.handleImagePress}
      providerName={providerName}
      senderName={senderName}
      onRegenerate={item.role === 'assistant' && showOps ? () => actions.handleRegenerate(item) : undefined}
      onPrevVersion={item.role === 'assistant' && showOps && hasMultipleVersions ? () => actions.handlePrevVersion(item) : undefined}
      onNextVersion={item.role === 'assistant' && showOps && hasMultipleVersions ? () => actions.handleNextVersion(item) : undefined}
      currentVersion={hasMultipleVersions ? (item.currentVersionIndex ?? 0) + 1 : undefined}
      totalVersions={hasMultipleVersions ? versionsLen : undefined}
      versionHistory={hasMultipleVersions ? item.versions!.map((v: any) => v.content) : undefined}
      onContinue={
        item.role === 'assistant' && showOps && isLastMessage && !!item.content && convType !== 'manual' && convType !== 'parent'
          ? actions.handleContinue
          : undefined
      }
      onEdit={showOps ? () => actions.handleEdit(item) : undefined}
      onCopy={item.content ? () => actions.handleCopy(item) : undefined}
      onMore={() => actions.handleMore(item)}
      isStreaming={streamingId === item.id}
      isUser={isUser}
      avatar={avatar}
      displayMode={env.settings.display.displayMode}
      showAvatar={env.settings.display.showAvatar}
      showTokenUsage={env.settings.display.showTokenUsage}
      showModelName={env.settings.display.showModelName}
      showWordCount={env.settings.display.showMessageWordCount}
      showTimestamp={env.settings.display.showTimestamp}
      showFirstTokenTime={env.settings.display.showFirstTokenTime}
      elapsedSeconds={item.totalElapsedTime}
      enableMarkdown={env.settings.features.markdownRendering || convType === 'manual'}
      enableLatex={env.settings.features.latexRendering}
      enableMermaid={env.settings.features.mermaidRendering}
      fullWidth={convType === 'manual'}
      customCSS={env.messageCustomCSS}
      suggestedQuestionsEnabled={chat?.settings?.suggestedQuestionsEnabled ?? true}
      onSuggestedQuestion={actions.handleSuggestedQuestion}
      statusVars={chat?.statusVars || {}}
      chatTitle={chat?.title}
      bubbleStyle={env.bubbleStyle}
      messageCount={env.chatMessagesLength}
      allowInlineEdit={true}
      thinkingIndicator={env.settings.thinkingIndicator}
      onChangeContent={(next: string) => actions.handleChangeContent(item.id, next)}
      onChangeThinkingContent={(next: string) => actions.handleChangeThinkingContent(item.id, next)}
      onVarUpdate={actions.handleVarUpdate}
    />
  );
};

export const MessageBubbleItem = React.memo(MessageBubbleItemComponent, areItemPropsEqual);
