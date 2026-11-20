import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: true };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null, showDetails: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.icon}>⚠️</Text>
            <Text style={styles.title}>出了点小问题</Text>
            <Text style={styles.message}>
              {this.state.error?.message || '未知错误'}
            </Text>
            <TouchableOpacity
              style={styles.detailsBtn}
              onPress={this.toggleDetails}
            >
              <Text style={styles.detailsBtnText}>
                {this.state.showDetails ? '隐藏详情' : '查看详情'}
              </Text>
            </TouchableOpacity>
            {this.state.showDetails && (
              <View style={styles.detailsContainer}>
                <Text style={styles.detailsText}>
                  {this.state.error?.stack || '无堆栈信息'}
                </Text>
                {this.state.errorInfo && (
                  <Text style={styles.detailsText}>
                    {'\n'}组件树:{'\n'}
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </View>
            )}
            <TouchableOpacity
              style={styles.button}
              onPress={this.resetError}
            >
              <Text style={styles.buttonText}>尝试恢复</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#fff',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 20,
    color: '#aaa',
  },
  detailsBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  detailsBtnText: {
    fontSize: 12,
    color: '#888',
  },
  detailsContainer: {
    width: '100%',
    maxHeight: 200,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detailsText: {
    fontSize: 10,
    color: '#888',
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: '#6366f1',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
