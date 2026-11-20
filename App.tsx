import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/context/AppContext';
import { MainNavigator } from './src/navigation/MainNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { SplashScreen } from './src/components/SplashScreen';
import { LoginModal } from './src/components/LoginModal';
import { View, useColorScheme, Platform } from 'react-native';

/**
 * 电脑版 / 网页版：图标字体需要自己注册。
 *
 * `@expo/vector-icons` 在网页上**不会**主动调用 `expo-font.loadAsync`，
 * 它依赖打包器生成 @font-face —— 这一步没有生成，结果界面上所有图标
 * 都是 □（豆腐块）。所以这里在启动时把用到的图标字体显式加载一遍。
 */
function useWebIconFonts() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (async () => {
      try {
        const Font: any = require('expo-font');
        const icons: any = require('@expo/vector-icons');
        const families = ['Ionicons', 'MaterialCommunityIcons', 'Feather', 'FontAwesome', 'MaterialIcons'];
        for (const name of families) {
          const fam = icons?.[name];
          if (fam?.font) await Font.loadAsync(fam.font);
        }
      } catch {
        /* 字体加载失败不影响功能 */
      }
    })();
  }, []);
}

// Task 10.5: 内部组件，可访问 useApp 判断登录态
const AppContent: React.FC<{ showSplashDone: boolean; onSplashFinish: () => void }> = ({
  showSplashDone,
  onSplashFinish,
}) => {
  const { isLoading, isLoggedIn, login, register, guestLogin, settings } = useApp();
  useWebIconFonts();
  const [loginVisible, setLoginVisible] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // 当 Splash 已结束、数据已加载、且未登录时 → 显示登录弹窗
  useEffect(() => {
    if (showSplashDone && !isLoading && !isLoggedIn) {
      setLoginVisible(true);
    } else if (isLoggedIn) {
      setLoginVisible(false);
    }
  }, [showSplashDone, isLoading, isLoggedIn]);

  // 开屏背景色：与 SplashScreen 保持一致，避免闪屏
  const splashBg = settings.conversation.splashBackgroundColor || (isDark ? '#0d0d1a' : '#fff5f6');

  // 开屏只做「最短展示」，数据一加载完就立刻进主界面。
  // 之前是写死等 2~2.5 秒，跟加载进度无关 —— 这就是「启动好慢」的主因。
  const splashMinMs = Math.min(settings.conversation.splashDuration || 900, 900);

  if (!showSplashDone || isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: splashBg }}>
        <SplashScreen onFinish={onSplashFinish} duration={splashMinMs} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: settings.theme.backgroundColor }}>
      <MainNavigator />
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LoginModal
        visible={loginVisible}
        // 强制登录门控：仅登录成功后 useApp 的 isLoggedIn=true 触发 visible=false
        // 不允许通过 onClose 手动关闭
        onClose={() => { /* no-op, gate enforced */ }}
      />
    </View>
  );
};

export default function App() {
  const [showSplashDone, setShowSplashDone] = useState(false);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppProvider>
          <AppContent
            showSplashDone={showSplashDone}
            onSplashFinish={() => setShowSplashDone(true)}
          />
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
