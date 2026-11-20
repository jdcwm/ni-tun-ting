import React, { useState } from 'react';
import { View, Modal, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { BrowserScreen } from '../screens/BrowserScreen';
import { ThemeSettingsScreen } from '../screens/ThemeSettingsScreen';
import { ThemeEditorScreen } from '../screens/ThemeEditorScreen';
import { RecycleBinScreen } from '../screens/RecycleBinScreen';
import { CharacterBrowserScreen } from '../screens/CharacterBrowserScreen';
import { WorldBookScreen } from '../screens/WorldBookScreen';
import { UserSettingsScreen } from '../screens/UserSettingsScreen';
import { SystemCheckScreen } from '../screens/SystemCheckScreen';
import { AIProviderScreen } from '../screens/AIProviderScreen';
import { ManagementMenu } from '../components/ManagementMenu';

const SCREEN_H = Dimensions.get('window').height;

export type ScreenType = 
  | 'browser'
  | 'themeSettings'
  | 'themeEditor'
  | 'recycleBin'
  | 'characterBrowser'
  | 'worldbook'
  | 'userSettings'
  | 'systemCheck'
  | 'aiProvider'
  | 'management'
  | null;

interface ScreenManagerProps {
  visible: boolean;
  screen: ScreenType;
  onClose: () => void;
  onNavigate?: (screen: ScreenType) => void;
}

export const ScreenManager: React.FC<ScreenManagerProps> = ({
  visible,
  screen,
  onClose,
  onNavigate,
}) => {
  const theme = useTheme();
  const [browserInitialUrl, setBrowserInitialUrl] = useState('https://www.google.com');

  const renderScreen = () => {
    switch (screen) {
      case 'browser':
        return (
          <BrowserScreen
            initialUrl={browserInitialUrl}
            onClose={onClose}
            onDownloadImage={(url) => {
              console.log('Downloading image:', url);
            }}
            onExtractCharacter={(result, url) => {
              console.log('Extracted from:', url, result);
            }}
          />
        );
      case 'themeSettings':
        return <ThemeSettingsScreen onClose={onClose} />;
      case 'themeEditor':
        return <ThemeEditorScreen onClose={onClose} />;
      case 'recycleBin':
        return <RecycleBinScreen onClose={onClose} />;
      case 'characterBrowser':
        return <CharacterBrowserScreen onClose={onClose} />;
      case 'worldbook':
        return <WorldBookScreen onClose={onClose} />;
      case 'userSettings':
        return <UserSettingsScreen onClose={onClose} />;
      case 'systemCheck':
        return <SystemCheckScreen onClose={onClose} />;
      case 'aiProvider':
        return <AIProviderScreen onClose={onClose} />;
      case 'management':
        return (
          <ManagementMenu
            onClose={onClose}
            onNavigate={(screenName) => {
              if (onNavigate) {
                const screenMap: Record<string, ScreenType> = {
                  character: 'characterBrowser',
                  worldbook: 'worldbook',
                  themeEditor: 'themeEditor',
                  themeSettings: 'themeSettings',
                  characterBrowser: 'characterBrowser',
                  userSettings: 'userSettings',
                  systemCheck: 'systemCheck',
                  recycleBin: 'recycleBin',
                  aiProvider: 'aiProvider',
                  browser: 'browser',
                };
                onNavigate(screenMap[screenName] || null);
              }
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible && screen !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
        {renderScreen()}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
