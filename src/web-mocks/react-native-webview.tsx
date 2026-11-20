import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';

interface WebViewProps {
  source?: { html?: string; uri?: string };
  style?: any;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  onMessage?: (event: any) => void;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  originWhitelist?: string[];
  overScrollMode?: string;
  bounces?: boolean;
  textZoom?: number;
  allowFileAccess?: boolean;
  mixedContentMode?: string;
  nestedScrollEnabled?: boolean;
  injectedJavaScript?: string;
  onLoad?: () => void;
  onLoadEnd?: () => void;
  onLoadStart?: () => void;
  onError?: () => void;
  allowUniversalAccessFromFileURLs?: boolean;
  allowingReadAccessToURL?: string;
  setSupportMultipleWindows?: boolean;
  cacheEnabled?: boolean;
}

// 在 iframe 的 HTML 头部注入 ReactNativeWebView polyfill
const injectRNWVPolyfill = (html: string): string => {
  const polyfill = `<script>
(function(){
  if (typeof window.ReactNativeWebView !== 'undefined') return;
  window.ReactNativeWebView = {
    postMessage: function(data) {
      try {
        window.parent.postMessage(typeof data === 'string' ? data : JSON.stringify(data), '*');
      } catch(e) {}
    }
  };
})();
</script>`;
  return html.replace('<head>', '<head>' + polyfill);
};

export const WebView = forwardRef((props: WebViewProps, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onMessageRef = useRef(props.onMessage);
  onMessageRef.current = props.onMessage;

  useImperativeHandle(ref, () => ({
    injectJavaScript: (js: string) => {
      if (iframeRef.current?.contentWindow) {
        try {
          (iframeRef.current.contentWindow as any).eval?.(js);
        } catch (e) {
          iframeRef.current.contentWindow.postMessage({ type: 'injectJS', js }, '*');
        }
      }
    },
    postMessage: (data: string) => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(data, '*');
      }
    },
    reload: () => {
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }
    },
  }));

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source === iframeRef.current?.contentWindow && onMessageRef.current) {
        const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
        onMessageRef.current({ nativeEvent: { data } });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const src = props.source?.uri || 'about:blank';
  let srcDoc = props.source?.html || undefined;
  if (srcDoc && srcDoc.indexOf('ReactNativeWebView') === -1) {
    srcDoc = injectRNWVPolyfill(srcDoc);
  }

  return (
    <View style={[styles.container, props.style]}>
      <iframe
        ref={iframeRef}
        src={srcDoc ? undefined : src}
        srcDoc={srcDoc}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          overflow: props.scrollEnabled === false ? 'hidden' : 'auto',
          display: 'block',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        onLoad={props.onLoad || props.onLoadEnd}
        onError={props.onError}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});

export default WebView;
