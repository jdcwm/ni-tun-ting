import React from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface SettingSliderProps {
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange: (value: number) => void;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  style?: ViewStyle;
}

export const SettingSlider: React.FC<SettingSliderProps> = ({
  label,
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onValueChange,
  formatValue,
  disabled = false,
  style,
}) => {
  const theme = useTheme();
  const panX = React.useRef(new Animated.Value(0)).current;
  const trackRef = React.useRef<View>(null);
  const trackWidth = React.useRef(0);

  React.useEffect(() => {
    const percentage = (value - minimumValue) / (maximumValue - minimumValue);
    const thumbPosition = percentage * (trackWidth.current - 28);
    panX.setValue(thumbPosition);
  }, [value, minimumValue, maximumValue, panX]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (_, gestureState) => {
          updateValueFromPosition(gestureState.x0);
        },
        onPanResponderMove: (_, gestureState) => {
          updateValueFromPosition(gestureState.moveX);
        },
      }),
    [disabled, minimumValue, maximumValue, step]
  );

  const updateValueFromPosition = (x: number) => {
    if (trackWidth.current === 0) return;
    const percentage = Math.max(0, Math.min(1, (x - 14) / (trackWidth.current - 28)));
    let newValue = minimumValue + percentage * (maximumValue - minimumValue);
    if (step > 0) {
      newValue = Math.round(newValue / step) * step;
    }
    newValue = Math.max(minimumValue, Math.min(maximumValue, newValue));
    onValueChange(newValue);
  };

  const handleLayout = () => {
    if (trackRef.current) {
      trackRef.current.measure((_, __, width) => {
        trackWidth.current = width;
        const percentage = (value - minimumValue) / (maximumValue - minimumValue);
        const thumbPosition = percentage * (width - 28);
        panX.setValue(thumbPosition);
      });
    }
  };

  const displayValue = formatValue ? formatValue(value) : value.toString();
  const percentage = (value - minimumValue) / (maximumValue - minimumValue);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: disabled ? theme.subTextColor : theme.textColor }]}>
          {label}
        </Text>
        <Text style={[styles.value, { color: disabled ? theme.subTextColor : theme.accentColor }]}>
          {displayValue}
        </Text>
      </View>
      <View
        ref={trackRef}
        style={[
          styles.track,
          { backgroundColor: disabled ? theme.borderColor : theme.secondaryColor },
        ]}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        <View
          style={[
            styles.fill,
            {
              backgroundColor: disabled ? theme.subTextColor : theme.accentColor,
              width: `${percentage * 100}%`,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: disabled ? theme.subTextColor : '#fff',
              transform: [{ translateX: panX }],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 2,
              elevation: 3,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
  },
  track: {
    height: 6,
    borderRadius: 3,
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    position: 'absolute',
    top: -11,
    left: 0,
  },
});
