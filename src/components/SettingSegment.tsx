import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface SegmentOption<T extends string> {
  label: string;
  value: T;
}

interface SettingSegmentProps<T extends string> {
  label?: string;
  options: SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  style?: ViewStyle;
}

export function SettingSegment<T extends string>({
  label,
  options,
  value,
  onValueChange,
  style,
}: SettingSegmentProps<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={[styles.label, { color: theme.textColor }]}>{label}</Text>}
      <View style={[styles.segmentContainer, { backgroundColor: theme.secondaryColor }]}>
        {options.map((option, index) => {
          const isActive = value === option.value;
          const isFirst = index === 0;
          const isLast = index === options.length - 1;

          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.segmentButton,
                isFirst && styles.firstButton,
                isLast && styles.lastButton,
                {
                  backgroundColor: isActive ? theme.accentColor : 'transparent',
                },
              ]}
              onPress={() => onValueChange(option.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.segmentText,
                  {
                    color: isActive ? theme.buttonTextColor : theme.textColor,
                    fontWeight: isActive ? '600' : '500',
                  },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  firstButton: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  lastButton: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  segmentText: {
    fontSize: 13,
  },
});
