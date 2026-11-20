import React from 'react';
import { View, Text, StyleSheet, ViewStyle, LayoutChangeEvent } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface ThemedCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  title?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
}

export const ThemedCard: React.FC<ThemedCardProps> = ({ children, style, title, onLayout }) => {
  const theme = useTheme();

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.card,
        {
          backgroundColor: theme.primaryColor,
          borderColor: theme.borderColor,
        },
        style,
      ]}
    >
      {title && (
        <Text style={[styles.title, { color: theme.textColor, fontSize: theme.fontSize + 2 }]}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginVertical: 8,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
});
