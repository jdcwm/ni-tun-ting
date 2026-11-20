import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { StatusVar, StatusBarConfig } from '../types';
import { useTheme } from '../hooks/useTheme';

interface StatusBarProps {
  vars: StatusVar[];
  config?: StatusBarConfig;
}

/**
 * 状态条字号。
 * `theme.statusBarSize` 之前是个死设置 —— 界面上能调，但没有任何渲染代码读它，
 * 所有字号都写死在组件里。这里统一由它推导：主字号 = statusBarSize，其余按比例缩放，
 * 保证 SettingScreen 里的「状态栏字号」真正生效。
 */
export const statusBarFonts = (theme: { statusBarSize?: number }) => {
  const base = theme.statusBarSize && theme.statusBarSize > 0 ? theme.statusBarSize : 12;
  return {
    base,
    label: Math.max(9, Math.round(base * 0.92)),
    value: Math.max(9, Math.round(base * 0.92)),
    compact: Math.max(8, Math.round(base * 0.83)),
    compactValue: Math.max(9, Math.round(base * 1.0)),
  };
};

type StatusBarFonts = ReturnType<typeof statusBarFonts>;

/**
 * 进度百分比。min === max 时原实现会算出 NaN，导致 Animated.timing 永远不动、进度条卡 0%。
 * 这里对退化区间直接按 0/100 处理。
 */
const progressPercent = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (max === min) return value >= max ? 100 : 0;
  const pct = ((value - min) / (max - min)) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
};

const ProgressBar: React.FC<{
  value: number;
  min: number;
  max: number;
  color?: string;
  label: string;
  icon?: string;
  animation?: string;
  fonts: StatusBarFonts;
}> = ({ value, min, max, color, label, icon, animation, fonts }) => {
  const theme = useTheme();
  const widthAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const percentage = progressPercent(value, min, max);
  const barColor = color || theme.accentColor;

  useEffect(() => {
    const anim = Animated.timing(widthAnim, {
      toValue: percentage,
      duration: 500,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [percentage]);

  useEffect(() => {
    let loopAnim: Animated.CompositeAnimation | null = null;
    if (animation === 'pulse') {
      loopAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      );
      loopAnim.start();
    } else if (animation === 'breathing') {
      loopAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, {
            toValue: 0.7,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(breatheAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      );
      loopAnim.start();
    } else if (animation === 'gradient') {
      // 高光条从左到右循环扫过，模拟渐变流动
      loopAnim = Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        })
      );
      loopAnim.start();
    }
    return () => {
      if (loopAnim) loopAnim.stop();
    };
  }, [animation]);

  const barOpacity = animation === 'breathing' ? breatheAnim : 1;

  return (
    <View style={styles.progressItem}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>
          {icon && <Text>{icon} </Text>}
          <Text style={{ color: theme.textColor, fontSize: fonts.label, fontWeight: '500' }}>
            {label}
          </Text>
        </Text>
        <Text style={{ color: theme.subTextColor, fontSize: fonts.value }}>
          {value}/{max}
        </Text>
      </View>
      <View style={[styles.progressBg, { backgroundColor: theme.inputBgColor }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: barColor,
              opacity: barOpacity,
              width: widthAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
              transform: animation === 'pulse' ? [{ scale: pulseAnim }] : [],
            },
          ]}
        />
        {animation === 'gradient' && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmerOverlay,
              {
                left: shimmerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-30%', '100%'],
                }),
                opacity: shimmerAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 0.8, 0],
                }),
              },
            ]}
          />
        )}
      </View>
    </View>
  );
};

const NumberVar: React.FC<{
  value: number;
  label: string;
  color?: string;
  icon?: string;
  fonts: StatusBarFonts;
}> = ({ value, label, color, icon, fonts }) => {
  const theme = useTheme();
  return (
    <View style={styles.numberItem}>
      <Text style={[styles.numberIcon, { fontSize: fonts.value }]}>{icon || '📊'}</Text>
      <Text style={[styles.numberValue, { color: color || theme.accentColor, fontSize: fonts.base }]}>{value}</Text>
      <Text style={[styles.numberLabel, { color: theme.subTextColor, fontSize: fonts.value }]}>{label}</Text>
    </View>
  );
};

const StringVar: React.FC<{
  value: string;
  label: string;
  color?: string;
  icon?: string;
  fonts: StatusBarFonts;
}> = ({ value, label, color, icon, fonts }) => {
  const theme = useTheme();
  return (
    <View style={styles.stringItem}>
      <Text style={{ marginRight: 4, fontSize: fonts.value }}>{icon || '◆'}</Text>
      <Text style={{ color: theme.subTextColor, fontSize: fonts.value }}>{label}:</Text>
      <Text style={[styles.stringValue, { color: color || theme.textColor, fontSize: fonts.value }]}>{value}</Text>
    </View>
  );
};

export const StatusBarComponent: React.FC<StatusBarProps> = ({ vars, config }) => {
  const theme = useTheme();
  const fonts = statusBarFonts(theme);

  if (!config || !config.enabled || vars.length === 0) {
    return null;
  }

  const bgColor = config.backgroundColor || theme.secondaryColor;
  const textColor = config.textColor || theme.textColor;
  const animation = config.animation || 'none';

  const progressVars = vars.filter((v) => v.type === 'progress');
  const numberVars = vars.filter((v) => v.type === 'number');
  const stringVars = vars.filter((v) => v.type === 'string');

  // 单行紧凑样式：「信用点 1000 · 好感度 0」，高度约 24-28dp，不显示图标/大数字/大标签
  if (config.style === 'inline') {
    const fs = Math.max(10, Math.min(12, fonts.label || 12));
    const items = vars.slice(0, 6);
    return (
      <View style={[styles.inlineContainer, { backgroundColor: bgColor }]}>
        <Text numberOfLines={1} style={[styles.inlineText, { color: textColor, fontSize: fs }]}>
          {items.map((v, idx) => (
            <React.Fragment key={v.name}>
              {idx > 0 ? <Text style={{ color: theme.subTextColor }}>{'  ·  '}</Text> : null}
              <Text style={{ color: v.color || textColor }}>
                {v.icon ? v.icon + ' ' : ''}{v.label} {String(v.value)}
              </Text>
            </React.Fragment>
          ))}
        </Text>
      </View>
    );
  }

  if (config.style === 'compact') {
    return (
      <View style={[styles.compactContainer, { backgroundColor: bgColor }]}>
        <View style={styles.compactRow}>
          {progressVars.slice(0, 4).map((v, idx) => (
            <View key={v.name} style={styles.compactProgressItem}>
              <Text style={{ fontSize: fonts.compact, color: theme.subTextColor }}>
                {v.icon} {v.label}
              </Text>
              <View style={[styles.compactProgressBg, { backgroundColor: theme.inputBgColor }]}>
                <View
                  style={[
                    styles.compactProgressFill,
                    {
                      backgroundColor: v.color || theme.accentColor,
                      width: `${progressPercent(Number(v.value), v.min || 0, v.max || 100)}%`,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
          {numberVars.slice(0, 4).map((v) => (
            <View key={v.name} style={styles.compactNumberItem}>
              <Text style={{ fontSize: fonts.compact, color: theme.subTextColor }}>{v.icon}</Text>
              <Text style={{ fontSize: fonts.compactValue, fontWeight: 'bold', color: v.color || theme.accentColor }}>
                {v.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (config.style === 'full') {
    return (
      <View style={[styles.fullContainer, { backgroundColor: bgColor }]}>
        {progressVars.length > 0 && (
          <View style={styles.section}>
            {progressVars.map((v) => (
              <ProgressBar
                key={v.name}
                value={Number(v.value)}
                min={v.min || 0}
                max={v.max || 100}
                color={v.color}
                label={v.label}
                icon={v.icon}
                animation={animation}
                fonts={fonts}
              />
            ))}
          </View>
        )}
        {numberVars.length > 0 && (
          <View style={styles.numberRow}>
            {numberVars.map((v) => (
              <NumberVar
                key={v.name}
                value={Number(v.value)}
                label={v.label}
                color={v.color}
                icon={v.icon}
                fonts={fonts}
              />
            ))}
          </View>
        )}
        {stringVars.length > 0 && (
          <View style={styles.stringSection}>
            {stringVars.map((v) => (
              <StringVar
                key={v.name}
                value={String(v.value)}
                label={v.label}
                color={v.color}
                icon={v.icon}
                fonts={fonts}
              />
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.barContainer, { backgroundColor: bgColor }]}>
      <View style={styles.barRow}>
        {progressVars.length > 0 && (
          <View style={styles.barProgresses}>
            {progressVars.slice(0, 3).map((v) => (
              <ProgressBar
                key={v.name}
                value={Number(v.value)}
                min={v.min || 0}
                max={v.max || 100}
                color={v.color}
                label={v.label}
                icon={v.icon}
                animation={animation}
                fonts={fonts}
              />
            ))}
          </View>
        )}
        {numberVars.length > 0 && (
          <View style={styles.barNumbers}>
            {numberVars.slice(0, 4).map((v) => (
              <NumberVar
                key={v.name}
                value={Number(v.value)}
                label={v.label}
                color={v.color}
                icon={v.icon}
                fonts={fonts}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  barContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  barRow: {
    gap: 8,
  },
  barProgresses: {
    gap: 6,
  },
  barNumbers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inlineContainer: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  inlineText: {
    fontWeight: '500',
  },
  compactContainer: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  compactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  compactProgressItem: {
    flex: 1,
    minWidth: 80,
    maxWidth: 120,
  },
  compactProgressBg: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  compactProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  compactNumberItem: {
    alignItems: 'center',
  },
  fullContainer: {
    padding: 12,
    borderRadius: 12,
    margin: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  section: {
    gap: 8,
    marginBottom: 12,
  },
  progressItem: {},
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 12,
  },
  progressBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '30%',
    backgroundColor: '#ffffff',
  },
  numberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 8,
  },
  numberItem: {
    alignItems: 'center',
    minWidth: 50,
  },
  numberIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  numberValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  numberLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  stringSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  stringItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stringValue: {
    fontSize: 12,
    fontWeight: '500',
  },
});
