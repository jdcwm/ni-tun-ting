import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { FancyWork } from '../types';

interface FancyWorkRendererProps {
  work: FancyWork;
  width?: number;
  height?: number;
}

const { width: SCREEN_W } = Dimensions.get('window');

export const FancyWorkRenderer: React.FC<FancyWorkRendererProps> = ({
  work,
  width = SCREEN_W - 32,
  height,
}) => {
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
body { margin: 0; padding: 0; background: transparent; font-family: -apple-system, sans-serif; overflow: hidden; }
${work.css}
</style>
</head>
<body>
${work.html}
<script>
${work.js}
</script>
</body>
</html>`;

  const getHeight = () => {
    if (height) return height;
    switch (work.type) {
      case 'sidebar':
        return 400;
      case 'greeting':
        return 280;
      case 'floating':
        return 200;
      case 'guide':
        return 500;
      case 'statusBar':
        return 180;
      default:
        return 300;
    }
  };

  return (
    <View style={[styles.container, { width, height: getHeight() }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html: fullHtml }}
        style={[styles.webview, { width, height: getHeight() }]}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  webview: {
    backgroundColor: 'transparent',
  },
});
