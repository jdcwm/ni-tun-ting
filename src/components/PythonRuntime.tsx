import React, { useRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '../hooks/useTheme';

interface PythonRuntimeProps {
  /** Python 代码 */
  code: string;
  /** 运行时参数（如 API_KEY, MODEL, BASE_URL 等），注入到 Python 环境变量 */
  envVars?: Record<string, string>;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 执行结果回调 */
  onResult?: (result: { ok: boolean; output: string; error?: string; data?: any }) => void;
  /** 日志回调（print 输出） */
  onLog?: (text: string) => void;
  /** 组件挂载后是否自动执行 */
  autoRun?: boolean;
  /** 外部可通过 ref 调用 run() 和 stop() */
  innerRef?: React.RefObject<PythonRuntimeHandle | null>;
}

/** Skulpt 运行时 HTML 模板 */
const SKULPT_HTML = (envVarsJson: string, code: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js" type="text/javascript"></script>
  <script src="https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js" type="text/javascript"></script>
  <style>
    body { margin: 0; padding: 0; background: transparent; }
  </style>
</head>
<body>
<script>
  // React Native WebView 兼容
  if (typeof window.ReactNativeWebView === 'undefined') {
    window.ReactNativeWebView = {
      postMessage: function(data) {
        try { window.parent.postMessage(data, '*'); } catch(e) {}
      }
    };
  }

  // Python 环境变量注入
  var __envVars = ${envVarsJson};
  for (var k in __envVars) {
    Sk.configure[k] = __envVars[k];
  }

  // 网络桥接：Python 的 open() / fetch 通过此函数转发到 RN 端
  Sk.configure.__rnFetch = function(url, options, callback) {
    var id = Math.random().toString(36).slice(2);
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'fetch_request',
      id: id,
      url: url,
      options: options || {}
    }));
    window.__pendingFetch = window.__pendingFetch || {};
    window.__pendingFetch[id] = callback;
  };

  // 重定向 Python 的 print 到 RN
  Sk.configure.output = function(s) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'log',
      text: s
    }));
  };

  // 重定向 Python 的系统输出
  Sk.configure.read = function() {
    return '';
  };

  // 暴露执行函数
  window.__runPython = function(code) {
    try {
      var program = Sk.compile(code, 'main.py', 'exec');
      var module = Sk.importMainWithBody('main', false, program);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'result',
        ok: true,
        output: 'Python script executed successfully'
      }));
    } catch(e) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'result',
        ok: false,
        error: e.toString(),
        stack: e.stack
      }));
    }
  };

  // 暴露 HTTP 桥接回调
  window.__handleFetchResponse = function(id, result) {
    if (window.__pendingFetch && window.__pendingFetch[id]) {
      var cb = window.__pendingFetch[id];
      delete window.__pendingFetch[id];
      cb(result);
    }
  };
</script>
</body>
</html>
`;

/** 内建的 Python HTTP 请求桥接（在 Python 代码中可通过自定义模块调用） */
const PYTHON_HTTP_LIB = `
# 自建 HTTP 请求桥接模块
import json

class RNFetch:
    @staticmethod
    def fetch(url, method='GET', headers=None, data=None):
        """通过 React Native 桥接发送 HTTP 请求"""
        import sk
        payload = {
            'url': url,
            'method': method,
            'headers': headers or {},
            'data': data
        }
        # 调用 JS 层的 fetch 桥接
        result = sk.configure.__rnFetch(payload['url'], {
            'method': payload['method'],
            'headers': payload['headers'],
            'body': payload.get('data')
        })
        return result

class http_bridge:
    """HTTP 请求工具类，用于在 Python 中调用外部 API"""
    
    @staticmethod
    def request(url, method='GET', headers=None, json_data=None, text_data=None):
        """发送 HTTP 请求并返回解析后的结果"""
        import sk
        
        body = None
        if json_data is not None:
            body = json.dumps(json_data)
            headers = headers or {}
            headers['Content-Type'] = 'application/json'
        elif text_data is not None:
            body = text_data
            
        result = sk.configure.__rnFetch(url, {
            'method': method,
            'headers': headers or {},
            'body': body
        })
        return result

def post(url, json_data, headers=None):
    """快捷 POST 请求"""
    return http_bridge.request(url, 'POST', headers=headers, json_data=json_data)

def get(url, headers=None):
    """快捷 GET 请求"""
    return http_bridge.request(url, 'GET', headers=headers)

# 导出到全局
__all__ = ['http_bridge', 'post', 'get', 'RNFetch']
`;

export interface PythonRuntimeHandle {
  run: () => void;
  stop: () => void;
  execute: (code: string, envVars?: Record<string, string>) => Promise<{ ok: boolean; output: string; error?: string; data?: any }>;
}

export const PythonRuntime: React.FC<PythonRuntimeProps> = ({
  code,
  envVars,
  timeoutMs = 30000,
  onResult,
  onLog,
  autoRun = false,
  innerRef,
}) => {
  const theme = useTheme();
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const pendingFetchResolvers = useRef<Map<string, (result: any) => void>>(new Map());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentCodeRef = useRef(code);
  const currentEnvRef = useRef(envVars || {});

  useEffect(() => {
    currentCodeRef.current = code;
  }, [code]);

  useEffect(() => {
    currentEnvRef.current = envVars || {};
  }, [envVars]);

  // 处理来自 Python 的 fetch 请求
  const handleFetchRequest = useCallback(async (payload: any) => {
    try {
      const { url, options } = payload;
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || undefined,
      });
      const text = await response.text();
      const result = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: text,
        ok: response.ok,
      };
      // 回传结果到 WebView
      webRef.current?.injectJavaScript(`
        (function() {
          if (window.__handleFetchResponse) {
            window.__handleFetchResponse('${payload.id}', ${JSON.stringify(result)});
          }
        })();
      `);
    } catch (e: any) {
      webRef.current?.injectJavaScript(`
        (function() {
          if (window.__handleFetchResponse) {
            window.__handleFetchResponse('${payload.id}', ${
              JSON.stringify({ error: e?.message || 'Network error' })
            });
          }
        })();
      `);
    }
  }, []);

  // 处理 WebView 消息
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'fetch_request':
          handleFetchRequest(data);
          break;
        case 'log':
          onLog?.(data.text);
          break;
        case 'result':
          setLoading(false);
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          onResult?.({
            ok: data.ok,
            output: data.output || '',
            error: data.error,
            data: data.data,
          });
          break;
        case 'ready':
          setReady(true);
          break;
      }
    } catch (e) {
      console.warn('PythonRuntime message parse error:', e);
    }
  }, [handleFetchRequest, onLog, onResult]);

  // 执行 Python 代码
  const run = useCallback(() => {
    if (!webRef.current) return;
    setLoading(true);
    
    const fullCode = `${PYTHON_HTTP_LIB}\n\n${currentCodeRef.current}`;
    const envJson = JSON.stringify(currentEnvRef.current || {});
    
    const injectedCode = `
      (function() {
        try {
          var envVars = ${envJson};
          // 注入环境变量
          for (var k in envVars) {
            Sk.configure[k] = envVars[k];
          }
          // 设置超时
          var timeoutId = setTimeout(function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'result',
              ok: false,
              error: 'Execution timed out (${timeoutMs}ms)'
            }));
          }, ${timeoutMs});
          
          // 执行
          var program = Sk.compile(${JSON.stringify(fullCode)}, 'main.py', 'exec');
          var module = Sk.importMainWithBody('main', false, program);
          
          clearTimeout(timeoutId);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'result',
            ok: true,
            output: 'Script executed successfully'
          }));
        } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'result',
            ok: false,
            error: e.toString(),
            stack: e.stack
          }));
        }
      })();
    `;
    
    webRef.current.injectJavaScript(injectedCode);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      onResult?.({
        ok: false,
        output: '',
        error: `Execution timed out (${timeoutMs}ms)`,
      });
    }, timeoutMs);
  }, [timeoutMs, onResult]);

  // 停止执行
  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLoading(false);
    // 重新加载页面来中断执行
    webRef.current?.reload();
  }, []);

  // 暴露方法给外部
  useEffect(() => {
    if (innerRef) {
      innerRef.current = {
        run,
        stop,
        execute: async (code: string, envVars?: Record<string, string>) => {
          currentCodeRef.current = code;
          if (envVars) {
            currentEnvRef.current = envVars;
          }
          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              resolve({ ok: false, output: '', error: 'Timeout' });
            }, timeoutMs);
            const wrappedResult = (r: any) => {
              clearTimeout(timeout);
              resolve(r);
            };
            // 临时替换
            (window as any).__onPythonResult = wrappedResult;
            // 设置回调后执行
            setTimeout(() => {
              run();
            }, 500);
          });
        },
      };
    }
  }, [innerRef, run, stop, timeoutMs]);

  // 自动执行
  useEffect(() => {
    if (autoRun && ready) {
      run();
    }
  }, [autoRun, ready, run]);

  const initialHtml = SKULPT_HTML(
    JSON.stringify(envVars || {}),
    code
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.secondaryColor }]}>
      {!ready && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={theme.accentColor} />
          <Text style={{ color: theme.subTextColor, marginTop: 8 }}>
            加载 Python 运行时...
          </Text>
        </View>
      )}
      {loading && (
        <View style={styles.runningOverlay}>
          <ActivityIndicator color={theme.accentColor} size="large" />
          <Text style={{ color: theme.subTextColor, marginTop: 8 }}>
            执行中...
          </Text>
        </View>
      )}
      <WebView
        ref={webRef}
        source={{ html: initialHtml, baseUrl: 'https://localhost' }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        style={styles.webview}
        onLoadEnd={() => setReady(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  runningOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
