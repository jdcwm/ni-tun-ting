const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    const webMocks = {
      'expo-media-library': path.resolve(__dirname, 'src/web-mocks/expo-media-library.ts'),
      'expo-sharing': path.resolve(__dirname, 'src/web-mocks/expo-sharing.ts'),
      'react-native-view-shot': path.resolve(__dirname, 'src/web-mocks/react-native-view-shot.ts'),
      'expo-clipboard': path.resolve(__dirname, 'src/web-mocks/expo-clipboard.ts'),
      'react-native-webview': path.resolve(__dirname, 'src/web-mocks/react-native-webview.tsx'),
      'expo-document-picker': path.resolve(__dirname, 'src/web-mocks/expo-document-picker.ts'),
      'expo-image-picker': path.resolve(__dirname, 'src/web-mocks/expo-image-picker.ts'),
      'expo-file-system': path.resolve(__dirname, 'src/web-mocks/expo-file-system.ts'),
      'expo-font': path.resolve(__dirname, 'src/web-mocks/expo-font.ts'),
      'expo-image-picker/': path.resolve(__dirname, 'src/web-mocks/expo-image-picker.ts'),
    };
    if (webMocks[moduleName]) {
      return context.resolveRequest(context, webMocks[moduleName], platform);
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
