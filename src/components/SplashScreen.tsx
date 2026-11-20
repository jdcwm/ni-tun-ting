import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image, useColorScheme } from 'react-native';
import { useApp } from '../context/AppContext';

interface SplashScreenProps {
  onFinish: () => void;
  duration?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { settings } = useApp();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { conversation: splash, theme } = settings;

  // 是否启用独立的日间/夜间配置
  const separateDark = splash.splashSeparateDark ?? false;

  // 根据当前主题选择配置
  const effectiveBgColor = isDark && separateDark
    ? (splash.splashBackgroundColorDark || splash.splashBackgroundColor || '#0d0d1a')
    : (splash.splashBackgroundColor || (isDark ? '#0d0d1a' : '#fff5f6'));

  const effectiveImage = isDark && separateDark
    ? (splash.splashImageDark || splash.splashImage)
    : splash.splashImage;

  const effectiveTitle = isDark && separateDark
    ? (splash.splashTitleDark || splash.splashTitle || '鲵吞亭')
    : (splash.splashTitle || '鲵吞亭');

  const effectiveSubtitle = isDark && separateDark
    ? (splash.splashSubtitleDark || splash.splashSubtitle || '少女开张中~')
    : (splash.splashSubtitle || '少女开张中~');

  const duration = splash.splashDuration || 2000;
  const animation = splash.splashAnimation || 'scale';
  const resizeMode = splash.splashResizeMode || 'contain';
  const showTitle = splash.showSplashTitle ?? true;
  const imageSize = splash.splashImageSize || 200;
  const imageOffsetX = splash.splashImageOffsetX || 0;
  const imageOffsetY = splash.splashImageOffsetY || 0;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(animation === 'scale' ? 0.7 : 1)).current;
  const slideAnim = useRef(new Animated.Value(animation === 'slide' ? 50 : 0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;

  const customSplash = effectiveImage;
  const splashSource = customSplash
    ? { uri: customSplash }
    : require('../../assets/splash-icon.png');

  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, duration);

    const animations: Animated.CompositeAnimation[] = [];

    if (animation === 'none') {
      fadeAnim.setValue(1);
      scaleAnim.setValue(1);
      slideAnim.setValue(0);
      titleAnim.setValue(1);
      subtitleAnim.setValue(1);
    } else {
      animations.push(
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ])
      );

      if (animation === 'scale') {
        animations.push(
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 8,
            tension: 40,
            useNativeDriver: true,
          })
        );
      } else if (animation === 'slide') {
        animations.push(
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          })
        );
      }

      if (showTitle) {
        animations.push(
          Animated.timing(titleAnim, {
            toValue: 1,
            duration: 500,
            delay: 200,
            useNativeDriver: true,
          })
        );
        animations.push(
          Animated.timing(subtitleAnim, {
            toValue: 1,
            duration: 500,
            delay: 400,
            useNativeDriver: true,
          })
        );
      }

      Animated.sequence(animations).start();
    }

    return () => clearTimeout(timer);
  }, [onFinish, duration, animation, showTitle, fadeAnim, scaleAnim, slideAnim, titleAnim, subtitleAnim]);

  const bgColor = effectiveBgColor;
  const titleColor = isDark ? '#e0e0e0' : '#333333';
  const subtitleColor = isDark ? '#ff6b9d' : '#ff6b9d';

  const getAnimatedStyle = () => {
    const style: any = {
      opacity: fadeAnim,
    };

    if (animation === 'scale') {
      style.transform = [{ scale: scaleAnim }];
    } else if (animation === 'slide') {
      style.transform = [{ translateY: slideAnim }];
    }

    return style;
  };

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={{ transform: [{ translateX: imageOffsetX }, { translateY: imageOffsetY }] }}>
        <Animated.View style={[styles.logoContainer, { width: imageSize, height: imageSize }, getAnimatedStyle()]}>
          <Image
            source={splashSource}
            style={styles.logoImage}
            resizeMode={resizeMode}
          />
        </Animated.View>
      </View>

      {showTitle && (
        <>
          <Animated.Text
            style={[
              styles.title,
              {
                color: titleColor,
                opacity: titleAnim,
                transform: [{ translateY: titleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }) }],
              },
            ]}
          >
            {effectiveTitle}
          </Animated.Text>

          <Animated.Text
            style={[
              styles.subtitle,
              {
                color: subtitleColor,
                opacity: subtitleAnim,
                transform: [{ translateY: subtitleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }) }],
              },
            ]}
          >
            {effectiveSubtitle}
          </Animated.Text>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 16,
    letterSpacing: 2,
  },
});
