import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface ThemedButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const ThemedButton: React.FC<ThemedButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const theme = useTheme();

  const getBgColor = () => {
    if (disabled) return theme.borderColor;
    switch (variant) {
      case 'primary':
        return theme.buttonColor;
      case 'secondary':
        return theme.secondaryColor;
      case 'outline':
        return 'transparent';
      default:
        return theme.buttonColor;
    }
  };

  const getTextColor = () => {
    if (disabled) return theme.subTextColor;
    switch (variant) {
      case 'primary':
        return theme.buttonTextColor;
      case 'secondary':
        return theme.textColor;
      case 'outline':
        return theme.buttonColor;
      default:
        return theme.buttonTextColor;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          backgroundColor: getBgColor(),
          borderColor: variant === 'outline' ? theme.buttonColor : 'transparent',
          borderWidth: variant === 'outline' ? 1 : 0,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text style={[styles.text, { color: getTextColor(), fontSize: theme.fontSize }, textStyle]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  text: {
    fontWeight: '600',
  },
});
