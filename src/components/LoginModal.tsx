import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Platform, KeyboardAvoidingView, ScrollView, Pressable } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LoginModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ visible, onClose: _onClose, onSuccess }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { login, register, guestLogin } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 强制登录门控：除非成功（login/register/guestLogin），否则禁止任何渠道关闭
  // 返回键 → 不调用 onClose（无操作），遮罩点击无关闭；仅 success 路径内部主动处理
  const noop = () => { /* 禁止关闭，保持门控 */ };

  // 仅在成功后允许关闭（由 useApp 状态变更触发父组件隐藏 visible）
  const handleSubmit = async () => {
    setError('');
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }
    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
      if (password.length < 6) {
        setError('密码至少6个字符');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      if (onSuccess) onSuccess();
    } catch (e: any) {
      setError(e.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    try {
      await guestLogin();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      setError(e.message || '游客登录失败');
    } finally {
      setLoading(false);
    }
  };

  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 0 : 34);

  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }} onClick={noop}>
        <div
          style={{
            backgroundColor: theme.menuBgColor, borderRadius: 16, padding: 24,
            paddingBottom: 24,
            width: 360, maxWidth: '90%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={{ color: theme.textColor, textAlign: 'center', marginBottom: 20, fontSize: 20, fontWeight: '600' }}>
            {mode === 'login' ? '登录账号' : '注册账号'}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'row', marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: `1px solid ${theme.borderColor}` }}>
            <button
              onClick={() => setMode('login')}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                backgroundColor: mode === 'login' ? theme.accentColor : 'transparent',
                color: mode === 'login' ? '#fff' : theme.textColor,
                fontSize: 14, fontWeight: '500',
              }}
            >登录</button>
            <button
              onClick={() => setMode('register')}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                backgroundColor: mode === 'register' ? theme.accentColor : 'transparent',
                color: mode === 'register' ? '#fff' : theme.textColor,
                fontSize: 14, fontWeight: '500',
              }}
            >注册</button>
          </div>

          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: '100%', padding: '12px 14px', marginBottom: 12,
              borderRadius: 10, border: `1px solid ${theme.borderColor}`,
              backgroundColor: theme.secondaryColor, color: theme.textColor,
              fontSize: 15, outline: 'none', boxSizing: 'border-box',
            }}
          />

          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%', padding: '12px 14px', marginBottom: 12,
              borderRadius: 10, border: `1px solid ${theme.borderColor}`,
              backgroundColor: theme.secondaryColor, color: theme.textColor,
              fontSize: 15, outline: 'none', boxSizing: 'border-box',
            }}
          />

          {mode === 'register' && (
            <input
              type="password"
              placeholder="确认密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', marginBottom: 12,
                borderRadius: 10, border: `1px solid ${theme.borderColor}`,
                backgroundColor: theme.secondaryColor, color: theme.textColor,
                fontSize: 15, outline: 'none', boxSizing: 'border-box',
              }}
            />
          )}

          {error && (
            <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12, marginTop: -4 }}>{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10,
              backgroundColor: theme.accentColor, color: '#fff',
              border: 'none', fontSize: 16, fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>

          <p style={{ color: theme.subTextColor, fontSize: 12, textAlign: 'center', marginTop: 14 }}>
            账号数据存储在本地设备，登录后可保存你的个人设置
          </p>

          <button
            onClick={handleGuest}
            disabled={loading}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10,
              backgroundColor: 'transparent', color: theme.subTextColor,
              border: `1px solid ${theme.borderColor}`, fontSize: 14, fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              marginTop: 8,
            }}
          >
            以游客身份进入
          </button>
        </div>
      </div>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={noop}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left + 20,
            paddingRight: insets.right + 20,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
            onPress={noop}
          >
            <View
              style={[styles.container, { backgroundColor: theme.menuBgColor, paddingBottom: 16 }]}
              onStartShouldSetResponder={() => true}
            >
              <Text style={[styles.title, { color: theme.textColor }]}>
                {mode === 'login' ? '登录账号' : '注册账号'}
              </Text>

              <View style={[styles.tabBar, { borderColor: theme.borderColor }]}>
                <TouchableOpacity
                  style={[styles.tab, mode === 'login' && { backgroundColor: theme.accentColor }]}
                  onPress={() => setMode('login')}
                >
                  <Text style={[styles.tabText, { color: mode === 'login' ? '#fff' : theme.textColor }]}>登录</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, mode === 'register' && { backgroundColor: theme.accentColor }]}
                  onPress={() => setMode('register')}
                >
                  <Text style={[styles.tabText, { color: mode === 'register' ? '#fff' : theme.textColor }]}>注册</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.input, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor, color: theme.textColor }]}
                placeholder="用户名"
                placeholderTextColor={theme.subTextColor}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />

              <TextInput
                style={[styles.input, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor, color: theme.textColor }]}
                placeholder="密码"
                placeholderTextColor={theme.subTextColor}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              {mode === 'register' && (
                <TextInput
                  style={[styles.input, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor, color: theme.textColor }]}
                  placeholder="确认密码"
                  placeholderTextColor={theme.subTextColor}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              )}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: theme.accentColor, opacity: loading ? 0.6 : 1 }]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.submitText}>
                  {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
                </Text>
              </TouchableOpacity>

              <Text style={[styles.hint, { color: theme.subTextColor }]}>
                账号数据存储在本地设备，登录后可同步你的个人设置
              </Text>

              <TouchableOpacity
                style={[styles.guestBtn, { borderColor: theme.borderColor, opacity: loading ? 0.6 : 1 }]}
                onPress={handleGuest}
                disabled={loading}
              >
                <Text style={[styles.guestBtnText, { color: theme.subTextColor }]}>
                  以游客身份进入
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  tabBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 20,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    marginBottom: 12,
    marginTop: -4,
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
  guestBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
  },
  guestBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
