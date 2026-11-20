import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { aiJSService, AIJSResult } from '../services/aiJSService';

interface AIJSRendererProps {
  code: string;
  statusVars: Record<string, number | string>;
  chatTitle?: string;
  messageCount?: number;
  onResult?: (result: AIJSResult) => void;
  onVarUpdate?: (vars: Record<string, number | string>) => void;
  maxheight?: number;
}

const { width: SCREEN_W } = Dimensions.get('window');

const MAX_HEIGHT = 600;
const MIN_HEIGHT = 40;

export const AIJSRenderer: React.FC<AIJSRendererProps> = ({
  code,
  statusVars,
  chatTitle = '',
  messageCount = 0,
  onResult,
  onVarUpdate,
  maxheight = MAX_HEIGHT,
}) => {
  const [contentHeight, setContentHeight] = useState(MIN_HEIGHT);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const html = useMemo(() => {
    if (!code) return null;
    return aiJSService.buildAIJSWebViewHtml(code, statusVars, chatTitle, messageCount);
  }, [code, statusVars, chatTitle, messageCount]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'aijs_height') {
        if (data.height && data.height > 0) {
          setContentHeight(Math.min(Math.max(data.height, MIN_HEIGHT), maxheight));
        }
      } else if (data.type === 'aijs_result') {
        if (data.height && data.height > 0) {
          setContentHeight(Math.min(Math.max(data.height, MIN_HEIGHT), maxheight));
        }
        if (!data.success && data.errors?.length) {
          setError(data.errors[0]);
        } else {
          setError(null);
        }
        const result: AIJSResult = {
          success: data.success ?? true,
          html: data.html,
          type: data.outputType,
          statusVarUpdates: data.vars,
          height: data.height,
          errors: data.errors,
        };
        onResult?.(result);
        if (data.vars && Object.keys(data.vars).length > 0) {
          onVarUpdate?.(data.vars);
        }
      } else if (data.type === 'aijs_event') {
        if (data.eventName === 'height_update' && data.data?.height) {
          setContentHeight(Math.min(Math.max(data.data.height, MIN_HEIGHT), maxheight));
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }, [onResult, onVarUpdate, maxheight]);

  if (!html) {
    return null;
  }

  return (
    <View style={[styles.container, { height: contentHeight }]}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        allowUniversalAccessFromFileURLs
        allowFileAccess
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
        cacheEnabled={false}
        incognito={false}
      />
      {error && (
        <View style={styles.errorBadge}>
          <View />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SCREEN_W - 32,
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 6,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  errorBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff6b6b',
  },
});
