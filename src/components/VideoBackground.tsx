import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export type BackgroundKind = 'image' | 'gif' | 'video' | 'color' | 'none';

export interface VideoBackgroundState {
  muted: boolean;
  paused: boolean;
}

interface Props {
  /** 背景值：可以是 media://名字、file:// 路径、http(s) 链接，或颜色值（kind==='color'） */
  uri?: string;
  /** 自动推断，也可显式指定 */
  kind?: BackgroundKind;
  /** 图片/视频的叠加不透明度 */
  opacity?: number;
  /** 视频是否循环，默认 true */
  loop?: boolean;
  /** 外部控制的静音 / 暂停状态 */
  videoState?: VideoBackgroundState;
  /** WebView 内部控件（如用户点击视频）触发状态变化时回调，用于同步到 UI */
  onVideoStateChange?: (state: Partial<VideoBackgroundState>) => void;
}

/** 从 uri 推断背景类型 */
export const inferBackgroundKind = (uri?: string): BackgroundKind => {
  if (!uri) return 'none';
  const clean = uri.split('?')[0].split('#')[0].toLowerCase();
  if (/^#([0-9a-f]{3,8})$/.test(clean) || /^rgba?\(/.test(clean) || /^hsla?\(/.test(clean)) return 'color';
  if (/\.(mp4|webm|mov|m4v|mkv)$/.test(clean)) return 'video';
  if (/\.gif$/.test(clean)) return 'gif';
  if (/\.(png|jpe?g|webp|bmp|avif|svg|heic)$/.test(clean)) return 'image';
  if (clean.startsWith('data:video/')) return 'video';
  if (clean.startsWith('data:image/gif')) return 'gif';
  if (clean.startsWith('data:image/')) return 'image';
  // 没有扩展名时按图片兜底（素材库里多数是图片）
  return 'image';
};

/**
 * 视频背景 HTML。
 * 用 WebView 播放而不是引入 expo-av/expo-video：不需要新增原生依赖，
 * 且能直接播 file:// 路径，同时可以用 injectJavaScript 精确控制静音与暂停。
 */
const buildVideoHtml = (uri: string, opts: { loop: boolean; muted: boolean; paused: boolean; opacity: number }): string => `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  html, body { margin:0; padding:0; width:100%; height:100%; background:transparent; overflow:hidden; }
  video { width:100%; height:100%; object-fit:cover; display:block; background:transparent; opacity:${opts.opacity}; }
</style>
</head>
<body>
<video id="bgv" src="${uri}" playsinline webkit-playsinline
  ${opts.loop ? 'loop' : ''} ${opts.muted ? 'muted' : ''} preload="auto"></video>
<script>
  var v = document.getElementById('bgv');
  var sendState = function () {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'videostate', paused: v.paused, muted: v.muted, duration: v.duration || 0
      }));
    } catch (e) {}
  };
  v.addEventListener('pause', sendState);
  v.addEventListener('play', sendState);
  v.addEventListener('volumechange', sendState);
  v.addEventListener('loadedmetadata', sendState);
  // 默认静音自动播放；浏览器策略要求 muted 才能 autoplay
  v.muted = ${opts.muted ? 'true' : 'false'};
  var p = v.play();
  if (p && p.catch) { p.catch(function () { /* 自动播放被拦，等用户操作 */ }); }
  if (${opts.paused ? 'true' : 'false'}) { try { v.pause(); } catch (e) {} }
  sendState();
</script>
</body>
</html>`;

/**
 * 对话背景层。支持静态图 / GIF / 视频 / 纯色。视频默认静音、不自动播放声音。
 */
export const VideoBackground: React.FC<Props> = ({
  uri,
  kind,
  opacity = 0.3,
  loop = true,
  videoState,
  onVideoStateChange,
}) => {
  const resolvedKind = kind && kind !== 'none' ? kind : inferBackgroundKind(uri);
  const webRef = useRef<WebView>(null);
  const muted = videoState?.muted ?? true; // 默认静音（用户要求：默认都是关闭）
  const paused = videoState?.paused ?? false;

  const html = useMemo(() => {
    if (resolvedKind !== 'video' || !uri) return '';
    return buildVideoHtml(uri, { loop, muted, paused, opacity });
  }, [resolvedKind, uri, loop, muted, paused, opacity]);

  // 静音/暂停变化时，不重建 WebView，直接注入控制命令（避免视频重新加载闪一下）
  const applyControl = useCallback(() => {
    if (resolvedKind !== 'video') return;
    webRef.current?.injectJavaScript(`
      (function(){
        var v = document.getElementById('bgv');
        if (!v) return;
        v.muted = ${muted ? 'true' : 'false'};
        v.loop = ${loop ? 'true' : 'false'};
        if (${paused ? 'true' : 'false'}) { try { v.pause(); } catch(e){} }
        else { var p = v.play(); if (p && p.catch) p.catch(function(){}); }
      })();
      true;
    `);
  }, [resolvedKind, muted, loop, paused]);

  useEffect(() => {
    applyControl();
  }, [applyControl]);

  if (!uri || resolvedKind === 'none') return null;

  if (resolvedKind === 'color') {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: uri }]} pointerEvents="none" />;
  }

  if (resolvedKind === 'video') {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <WebView
          ref={webRef}
          source={{ html }}
          style={[styles.fill, { backgroundColor: 'transparent' }]}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Android 上允许 file:// 与混合内容，否则本地视频加载不出来
          allowFileAccess
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          scrollEnabled={false}
          onMessage={(e) => {
            try {
              const data = JSON.parse(e.nativeEvent.data);
              if (data.type === 'videostate') {
                onVideoStateChange?.({ muted: !!data.muted, paused: !!data.paused });
              }
            } catch {
              /* 忽略非 JSON 消息 */
            }
          }}
        />
      </View>
    );
  }

  // image / gif
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, { opacity }]}
        resizeMode="cover"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});
