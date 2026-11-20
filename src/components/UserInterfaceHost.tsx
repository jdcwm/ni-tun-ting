import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import {
  buildUserInterfaceDocument,
  buildStateUpdateScript,
  buildChunkScript,
  UserInterfaceTemplate,
} from '../services/userInterfaceBridge';
import { mediaLibraryService } from '../services/mediaLibraryService';

/** 用户界面里可驱动的动作（WebView → RN） */
export interface UserInterfaceActions {
  onSend?: (text: string) => void;
  onStop?: () => void;
  onRegenerate?: () => void;
  onInputChanged?: (value: string) => void;
  onSetVar?: (key: string, value: any) => void;
  onInjectCss?: (css: string, id: string) => void;
  onSetBackground?: (value: string, opts: { kind: string; muted: boolean; loop: boolean }) => void;
  onToggleSidebar?: () => void;
  /** 把文字插入 App 自己的聊天输入框（内置 CSS 覆盖层用） */
  onInsertToChatInput?: (text: string) => void;
  /** 悬浮窗内拖动上报位移（RN 侧移动承载窗口的 View） */
  onMoveWidget?: (dx: number, dy: number) => void;
  onOpenRightMenu?: () => void;
  onOpenPanel?: (screen: string, section?: string) => void;
  onToast?: (text: string) => void;
  onToggleBackgroundPlay?: () => void;
  onSetBackgroundMuted?: (muted: boolean) => void;
  onReady?: () => void;
  /** 用户代码里出现的 media:// 引用需要解析时回调（可选，用于调试） */
  onUnresolvedMedia?: (name: string) => void;
}

interface Props {
  /** 用户界面模板 */
  template: UserInterfaceTemplate;
  /** 主题（转成 --aurora-* 变量） */
  theme: Record<string, any>;
  /** 下发给界面的状态 */
  state: Record<string, any>;
  /** 消息列表（用于增量推送） */
  messages: Array<{ id: string; role: string; content: string; images?: string[] }>;
  /** 流式追加的消息 id 与当前内容（用于 onChunk） */
  streaming?: { messageId: string; content: string } | null;
  actions: UserInterfaceActions;
  /** 初始渲染完成回调 */
  onLoaded?: () => void;
  /**
   * 覆盖层模式：不注入默认界面外壳，整页透明、可交互。
   * 用于「内置 CSS（全局）」这类只写 CSS + 少量 HTML 的二次渲染层。
   */
  bare?: boolean;
  /** 指针是否穿透（纯装饰层用）。默认 false，即可交互 */
  pointerEventsNone?: boolean;
  /** 自定义样式覆盖（例如给覆盖层设透明背景） */
  style?: any;
}

/**
 * 用户界面宿主。
 *
 * 这是「方案B」真正落地的地方：把一个用户模板渲染成可交互界面，
 * 并让模板里的 JS 通过 window.Aurora 反向驱动 App（发送消息、改背景、注入 CSS…）。
 *
 * RN 侧不重建 AI 逻辑，只做协议转换：状态用 injectJavaScript 下发，动作从 onMessage 收回。
 */
export const UserInterfaceHost: React.FC<Props> = ({
  template,
  theme,
  state,
  messages,
  streaming,
  actions,
  onLoaded,
  bare = false,
  pointerEventsNone = false,
  style,
}) => {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  /**
   * 构建文档时需要把 media:// 解析成内嵌数据，这一步是异步的，
   * 所以文档在解析完成后才确定，只构建一次（后续靠 injectJavaScript 更新）。
   */
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 素材映射：让 Aurora.media(name) 拿到真实 uri（视频这类不适合内嵌 base64 的走 uri）
      let mediaMap: Record<string, string> = {};
      try {
        const list = await mediaLibraryService.list();
        for (const a of list) mediaMap[a.name] = a.uri;
      } catch {
        /* 素材读不到不影响界面渲染 */
      }

      const boot = { ...state, media: mediaMap, messages, splashDuration: template.splashDuration ?? 0 };
      // 把模板里的 media:// 引用换成可显示的内容
      const resolved: UserInterfaceTemplate = {
        html: await mediaLibraryService.resolveRefsInHtml(template.html || ''),
        css: await mediaLibraryService.resolveRefsInHtml(template.css || ''),
        js: template.js || '',
        splashHtml: await mediaLibraryService.resolveRefsInHtml(template.splashHtml || ''),
        splashCss: await mediaLibraryService.resolveRefsInHtml(template.splashCss || ''),
        sidebarHtml: await mediaLibraryService.resolveRefsInHtml(template.sidebarHtml || ''),
        sidebarCss: await mediaLibraryService.resolveRefsInHtml(template.sidebarCss || ''),
        floatingHtml: await mediaLibraryService.resolveRefsInHtml(template.floatingHtml || ''),
        floatingCss: await mediaLibraryService.resolveRefsInHtml(template.floatingCss || ''),
      };

      const doc = buildUserInterfaceDocument(resolved, theme, boot, { bare });
      if (!cancelled) setHtml(doc);
    })();
    return () => {
      cancelled = true;
    };
    // 模板/主题变化才重建文档；state 变化走 injectJavaScript，避免界面被反复重载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, theme, bare]);

  /** RN → 界面：状态与消息下发 */
  const push = useCallback((script: string) => {
    if (!ready) return;
    webRef.current?.injectJavaScript(script);
  }, [ready]);

  // 状态下发。触发条件要能覆盖「切换对话」和「新对话一条消息都没有」两种情况，
  // 所以既看 chat.id 也看「最后一条消息的 id」——只用 messages.length 会在
  // 「切到另一个条数相同的对话」时漏推，界面上还显示上一个对话的标题。
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : '';
  const chatId = (state.chat && state.chat.id) || '';

  useEffect(() => {
    if (!ready) return;
    push(
      buildStateUpdateScript({
        chat: state.chat,
        settings: state.settings,
        characters: state.characters,
        vars: state.vars,
        messages,
      }),
    );
    // 流式内容变化由 streaming 单独推，避免这里整表重推
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, chatId, lastMessageId, messages.length, push]);

  useEffect(() => {
    if (!ready || !streaming) return;
    push(buildChunkScript(streaming.messageId, streaming.content));
  }, [ready, streaming?.messageId, streaming?.content, push]);

  /** 界面 → RN：动作分发 */
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let payload: any;
    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!payload || payload.type !== 'action') return;
    const a = actionsRef.current;
    switch (payload.action) {
      case 'ready':
        setReady(true);
        a.onReady?.();
        break;
      case 'send':
        a.onSend?.(String(payload.text ?? ''));
        break;
      case 'stop':
        a.onStop?.();
        break;
      case 'regenerate':
        a.onRegenerate?.();
        break;
      case 'inputChanged':
        a.onInputChanged?.(String(payload.value ?? ''));
        break;
      case 'setVar':
        a.onSetVar?.(String(payload.key ?? ''), payload.value);
        break;
      case 'injectCss':
        a.onInjectCss?.(String(payload.css ?? ''), String(payload.id ?? 'aurora-user-css'));
        break;
      case 'setBackground':
        a.onSetBackground?.(String(payload.value ?? ''), {
          kind: String(payload.kind ?? 'auto'),
          muted: payload.muted !== false,
          loop: payload.loop !== false,
        });
        break;
      case 'toggleSidebar':
        a.onToggleSidebar?.();
        break;
      case 'insertToChatInput':
        // 内置 CSS 覆盖层专用：把文字插到 App 自己的聊天输入框
        a.onInsertToChatInput?.(String(payload.text ?? ''));
        break;
      case 'moveWidget':
        a.onMoveWidget?.(Number(payload.dx) || 0, Number(payload.dy) || 0);
        break;
      case 'openRightMenu':
        a.onOpenRightMenu?.();
        break;
      case 'openPanel':
        a.onOpenPanel?.(String(payload.screen ?? ''), payload.section);
        break;
      case 'toast':
        a.onToast?.(String(payload.text ?? ''));
        break;
      case 'toggleBackgroundPlay':
        a.onToggleBackgroundPlay?.();
        break;
      case 'setBackgroundMuted':
        a.onSetBackgroundMuted?.(!!payload.muted);
        break;
      default:
        break;
    }
  }, []);

  const source = useMemo(() => ({ html: html || '<html><body></body></html>' }), [html]);

  return (
    <View
      style={[styles.container, bare ? styles.bareContainer : null, style]}
      pointerEvents={pointerEventsNone ? 'none' : 'auto'}
    >
      <WebView
        ref={webRef}
        source={source}
        style={[styles.webview, bare ? styles.bareWebview : null]}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // 悬浮窗（小块 WebView）里要能上下滚动列表，必须开这个，
        // 否则页面内的滚动区域收不到竖向滑动手势。
        nestedScrollEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        onMessage={handleMessage}
        onLoadEnd={() => {
          // 文档里运行时会在 ready 时主动上报；这里兜底：万一那条消息丢了，
          // 也要允许后续状态/分块注入（否则界面永远停在初始内容）。
          setReady(true);
          onLoaded?.();
        }}
        // 让界面自身滚动，不在 RN 层拦截
        scrollEnabled
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  bareContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  bareWebview: { flex: 1, backgroundColor: 'transparent' },
});
