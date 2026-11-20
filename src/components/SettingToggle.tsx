import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface SettingToggleProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export const SettingToggle: React.FC<SettingToggleProps> = ({
  label,
  description,
  value,
  onValueChange,
}) => {
  const theme = useTheme();

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: theme.borderColor }]}
      onPress={() => onValueChange(!value)}
      activeOpacity={0.7}
    >
      <View style={styles.textContainer}>
        <Text style={[styles.label, { color: theme.textColor }]}>{label}</Text>
        {description && (
          <Text style={[styles.description, { color: theme.subTextColor }]}>
            {description}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.toggleContainer,
          {
            backgroundColor: value ? theme.accentColor : theme.secondaryColor,
          },
        ]}
      >
        <View
          style={[
            styles.toggleThumb,
            {
              backgroundColor: '#fff',
              transform: [{ translateX: value ? 22 : 2 }],
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  textContainer: {
    flex: 1,
    paddingRight: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
  },
  description: {
    fontSize: 12,
    marginTop: 2,
  },
  toggleContainer: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    position: 'absolute',
  },
});
