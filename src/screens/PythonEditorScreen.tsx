import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import {
  IconClose,
  IconSend,
  IconDownload,
  IconCopy,
  IconChevronDown,
  IconTrash,
  IconPlus,
  IconEdit,
  IconCheck,
  IconBolt,
} from '../components/Icons';
import { PythonRuntime, PythonRuntimeHandle } from '../components/PythonRuntime';
import { PythonProxyConfig } from '../types';
import * as FileSystem from 'expo-file-system/legacy';

interface PythonEditorScreenProps {
  initialConfig?: PythonProxyConfig;
  onSave: (config: PythonProxyConfig) => void;
  onClose: () => void;
}

const { width: SCREEN_W } = Dimensions.get('window');

/** 预设模板 */
const TEMPLATES = [
  {
    key: 'novelai',
    name: 'NovelAI 4.5 图片生成',
    description: '通过 NovelAI V4.5 API 生成角色图片（完整参数版）',
    code: `# NovelAI 4.5 图片生成中转
# 使用方法：设置 API_KEY 为你的 NovelAI Token
# 模型选项: nai-v4-5 (完整版), nai-v4-5-cur (精选版)
# 支持参数：prompt, model, steps, width, height, seed, cfg_scale, sampler
# 文档: https://docs.novelai.net

import json

# 模型常量
MODELS = {
    "v4_5": "nai-v4-5",      # V4.5 完整版
    "v4_5_cur": "nai-v4-5-cur",  # V4.5 精选版
}

# 分辨率预设
RESOLUTIONS = {
    "portrait": (832, 1216),      # 竖向肖像
    "landscape": (1216, 832),     # 横向风景
    "square": (1024, 1024),       # 正方形
    "small": (512, 768),          # 小头像
}

def generate_image(
    prompt,
    model="nai-v4-5",
    steps=28,
    width=832,
    height=1216,
    seed=-1,
    cfg_scale=12,
    sampler="k_dpmpp_2s_ancestral",
    negative_prompt="",
    reference_image=None,
    reference_strength=0.6,
):
    """
    调用 NovelAI V4.5 API 生成图片
    
    参数:
        prompt: 正向提示词
        model: 模型名称 (nai-v4-5 或 nai-v4-5-cur)
        steps: 迭代步数 (推荐 28)
        width: 图片宽度
        height: 图片高度
        seed: 随机种子 (-1 为随机)
        cfg_scale: CFG 引导强度
        sampler: 采样器
        negative_prompt: 负向提示词
        reference_image: 参考图片(base64)
        reference_strength: 参考图强度
    """
    import os
    import base64
    
    api_key = os.environ.get("API_KEY", "")
    if not api_key:
        return {"error": "请设置 API_KEY 环境变量"}
    
    # NovelAI API 端点
    url = "https://api.novelai.net/ai/generate-image"
    
    # 构建参数体
    parameters = {
        "controlnet_strength": 1,
        "dynamic_cfg": False,
        "format": "png",
        "sampler": sampler,
        "scale": cfg_scale,
        "steps": steps,
    }
    
    # 如果有参考图片，添加图像到图像参数
    if reference_image:
        parameters["image"] = reference_image
        parameters["strength"] = reference_strength
        parameters["controlnet"] = "canvas"
    
    # 构建请求体
    body = {
        "input": {
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "width": width,
            "height": height,
            "steps": steps,
            "seed": seed if seed != -1 else 0,
        },
        "model": model,
        "parameters": parameters,
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "ai-tavern-novelai-proxy/2.0",
    }
    
    # 发送请求
    result = http_bridge.request(url, "POST", headers=headers, json_data=body)
    return result


def generate_with_reference(
    prompt,
    reference_image_base64,
    model="nai-v4-5",
    strength=0.6,
    steps=28,
    width=832,
    height=1216,
):
    """使用参考图片进行图生图"""
    return generate_image(
        prompt=prompt,
        model=model,
        steps=steps,
        width=width,
        height=height,
        seed=-1,
        reference_image=reference_image_base64,
        reference_strength=strength,
    )


# 自动执行示例
if __name__ == "__main__":
    # 基础示例：生成角色图
    result = generate_image(
        prompt="1girl, silver hair, blue eyes, white dress, flower garden, detailed, masterpiece",
        model="nai-v4-5",
        steps=28,
        width=832,
        height=1216,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
`,
  },
  {
    key: 'novelai_nekoai',
    name: 'NovelAI (nekoai-sdk)',
    description: '使用 nekoai-api SDK 的 NovelAI 中转',
    code: `# NovelAI 4.5 使用 nekoai-api SDK 中转
# pip 安装: pip install -U nekoai-api
# 使用方法：设置 API_KEY 为你的 NovelAI Token
# 这是基于官方 SDK 的封装，功能更完整

import json
import os

# ====== 模型配置 ======
MODELS = {
    "v4_5": "nai-v4-5",
    "v4_5_cur": "nai-v4-5-cur",
}

RESOLUTIONS = {
    "portrait": (832, 1216),
    "landscape": (1216, 832),
    "square": (1024, 1024),
}

# ====== 核心函数 ======
def create_client():
    """创建 NovelAI 客户端"""
    api_key = os.environ.get("API_KEY", "")
    if not api_key:
        return {"error": "请设置 API_KEY 环境变量"}
    
    # 使用 HTTP 桥接模拟 nekoai 客户端
    return {
        "api_key": api_key,
        "base_url": "https://api.novelai.net",
    }


def generate_image(
    prompt,
    model_key="v4_5",
    steps=28,
    width=832,
    height=1216,
    seed=-1,
    cfg_scale=12,
    sampler="k_dpmpp_2s_ancestral",
):
    """
    生成 NovelAI 图片
    
    参数:
        prompt: 正向提示词 (支持 Danbooru 标签)
        model_key: 模型键名 (v4_5 / v4_5_cur)
        steps: 采样步数 (推荐 28)
        width: 宽度 (需为 64 的倍数)
        height: 高度 (需为 64 的倍数)
        seed: 随机种子 (-1 为自动)
        cfg_scale: CFG 引导强度 (1-30)
        sampler: 采样算法
    """
    api_key = os.environ.get("API_KEY", "")
    if not api_key:
        return {"error": "请设置 API_KEY 环境变量"}
    
    model = MODELS.get(model_key, model_key)
    
    # 验证尺寸
    if width % 64 != 0 or height % 64 != 0:
        return {"error": "宽度和高度必须是 64 的倍数"}
    
    url = "https://api.novelai.net/ai/generate-image"
    
    body = {
        "input": {
            "prompt": prompt,
            "width": width,
            "height": height,
            "steps": steps,
            "seed": seed if seed != -1 else 0,
        },
        "model": model,
        "parameters": {
            "controlnet_strength": 1,
            "dynamic_cfg": False,
            "format": "png",
            "image": "",
            "sampler": sampler,
            "scale": cfg_scale,
            "steps": steps,
        },
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "ai-tavern-nekoai-proxy/1.0",
    }
    
    result = http_bridge.request(url, "POST", headers=headers, json_data=body)
    return result


def generate_character(
    character_description,
    style_anime=True,
    model_key="v4_5",
    **kwargs
):
    """
    生成角色图的便捷函数
    
    参数:
        character_description: 角色描述
        style_anime: 是否使用动漫风格优化
        model_key: 模型键名
        **kwargs: 其他 generate_image 参数
    """
    # 构建优化的提示词
    if style_anime:
        prompt = f"{character_description}, anime style, detailed, masterpiece, best quality"
    else:
        prompt = f"{character_description}, detailed, masterpiece, best quality"
    
    # 默认使用肖像尺寸
    if "width" not in kwargs:
        kwargs["width"] = 832
    if "height" not in kwargs:
        kwargs["height"] = 1216
    
    return generate_image(prompt=prompt, model_key=model_key, **kwargs)


# ====== 批量生成 ======
def batch_generate(prompts, **kwargs):
    """批量生成图片"""
    results = []
    for i, prompt in enumerate(prompts):
        result = generate_image(prompt=prompt, **kwargs)
        results.append({
            "index": i,
            "prompt": prompt,
            "result": result,
        })
    return results


# ====== 自动执行 ======
if __name__ == "__main__":
    # 示例1：单张角色图
    print("=== 示例1：生成角色图 ===")
    result = generate_character(
        character_description="1girl, silver hair, blue eyes, white dress, flower garden",
        model_key="v4_5",
        steps=28,
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    
    # 示例2：使用精选版模型
    print("\\n=== 示例2：使用 V4.5 精选版 ===")
    result2 = generate_image(
        prompt="1boy, black hair, red eyes, school uniform, detailed",
        model_key="v4_5_cur",
        steps=28,
    )
    print(json.dumps(result2, indent=2, ensure_ascii=False))
`,
  },
  {
    key: 'openai_chat',
    name: 'OpenAI 对话中转',
    description: '标准 OpenAI 兼容的对话中转',
    code: `# OpenAI 兼容 API 对话中转
# 将请求转发到自定义的 OpenAI 兼容服务

import json
import os

def chat(messages, model=None, temperature=0.7, max_tokens=2048):
    """发送聊天请求到 OpenAI 兼容 API"""
    api_key = os.environ.get("API_KEY", "")
    base_url = os.environ.get("BASE_URL", "https://api.openai.com/v1")
    model = model or os.environ.get("MODEL", "gpt-4")
    
    url = f"{base_url}/chat/completions"
    
    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    result = http_bridge.request(url, "POST", headers=headers, json_data=body)
    return result

# 示例调用
if __name__ == "__main__":
    messages = [
        {"role": "system", "content": "你是一个有用的助手"},
        {"role": "user", "content": "你好，请介绍一下自己"}
    ]
    result = chat(messages)
    print(json.dumps(result, indent=2, ensure_ascii=False))
`,
  },
  {
    key: 'custom_relay',
    name: '自定义中继模板',
    description: '基础 HTTP 中继模板，可自定义逻辑',
    code: `# 自定义 API 中继模板
# 在此编写你自己的 API 调用逻辑
# 可用工具：http_bridge.request(url, method, headers, json_data, text_data)
#           post(url, json_data, headers)
#           get(url, headers)
# 环境变量：API_KEY, BASE_URL, MODEL 等

import json
import os

# 在此编写你的 API 调用函数
def my_api_call(user_input, **kwargs):
    """
    你的自定义 API 调用逻辑
    
    参数:
        user_input: 用户输入文本
        **kwargs: 其他参数（如 temperature, max_tokens 等）
    
    返回:
        API 响应的字典对象
    """
    api_key = os.environ.get("API_KEY", "")
    base_url = os.environ.get("BASE_URL", "")
    model = os.environ.get("MODEL", "")
    
    # TODO: 在此实现你的 API 调用逻辑
    # 示例：调用一个 HTTP API
    # result = http_bridge.request(
    #     f"{base_url}/your-endpoint",
    #     "POST",
    #     headers={"Authorization": f"Bearer {api_key}"},
    #     json_data={"input": user_input, "model": model}
    # )
    # return result
    
    # 暂时返回一个示例响应
    return {
        "status": "ok",
        "message": "请在此编写你的 API 逻辑",
        "received_input": user_input,
        "config": {
            "api_key_set": bool(api_key),
            "base_url": base_url,
            "model": model
        }
    }

# 执行入口
if __name__ == "__main__":
    result = my_api_call("你好世界")
    print(json.dumps(result, indent=2, ensure_ascii=False))
`,
  },
];

export const PythonEditorScreen: React.FC<PythonEditorScreenProps> = ({
  initialConfig,
  onSave,
  onClose,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [scriptCode, setScriptCode] = useState(
    initialConfig?.scriptCode || TEMPLATES[2].code
  );
  const [pythonPath, setPythonPath] = useState(
    initialConfig?.pythonPath || ''
  );
  const [launchCommand, setLaunchCommand] = useState(
    initialConfig?.launchCommand || ''
  );
  const [pipPackages, setPipPackages] = useState(
    initialConfig?.pipPackages || ''
  );

  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testInput, setTestInput] = useState('你好，世界！');
  const [testEnvVars, setTestEnvVars] = useState('API_KEY=test-key\nMODEL=test-model\nBASE_URL=https://api.example.com');

  const [logs, setLogs] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [runtimeVisible, setRuntimeVisible] = useState(false);

  const runtimeRef = useRef<PythonRuntimeHandle | null>(null);

  const appendLog = useCallback((text: string) => {
    setLogs((prev) => [...prev.slice(-50), text]);
  }, []);

  const handleSave = useCallback(() => {
    const config: PythonProxyConfig = {
      pythonPath: pythonPath.trim() || undefined,
      launchCommand: launchCommand.trim() || undefined,
      pipPackages: pipPackages.trim() || undefined,
      scriptCode: scriptCode,
      lastSavedAt: Date.now(),
    };
    onSave(config);
    Alert.alert('保存成功', 'Python 中转配置已保存');
  }, [pythonPath, launchCommand, pipPackages, scriptCode, onSave]);

  const handleLoadTemplate = useCallback((code: string) => {
    setScriptCode(code);
    setShowTemplatePicker(false);
  }, []);

  const handleTest = useCallback(async () => {
    if (!scriptCode.trim()) {
      Alert.alert('提示', '请先编写 Python 代码');
      return;
    }

    setTesting(true);
    setLogs([]);
    setTestResult(null);
    setRuntimeVisible(true);

    // 解析环境变量
    const envVars: Record<string, string> = {};
    testEnvVars.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key) envVars[key] = value;
      }
    });

    // 添加测试输入
    envVars['TEST_INPUT'] = testInput;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        setTesting(false);
        appendLog('⏰ 执行超时');
        resolve();
      }, 30000);

      const wrappedResult = (r: any) => {
        clearTimeout(timeout);
        setTestResult(r);
        setTesting(false);
        if (r.ok) {
          appendLog('✅ 执行成功');
          if (r.output) appendLog('输出: ' + r.output);
          if (r.data) appendLog('数据: ' + JSON.stringify(r.data));
        } else {
          appendLog('❌ 执行失败: ' + (r.error || '未知错误'));
        }
        resolve();
      };

      // 注入包装好的结果回调
      (window as any).__onPythonResult = wrappedResult;

      // 通过 runtime 执行
      setTimeout(() => {
        runtimeRef.current?.run();
      }, 500);
    });
  }, [scriptCode, testEnvVars, testInput, appendLog]);

  const handleCopyCode = useCallback(() => {
    Alert.alert('已复制', '代码已复制到剪贴板（请手动复制）');
  }, []);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
    setTestResult(null);
  }, []);

  const envVarsForRuntime = useCallback((): Record<string, string> => {
    const vars: Record<string, string> = {};
    testEnvVars.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key) vars[key] = value;
      }
    });
    return vars;
  }, [testEnvVars]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor, paddingTop: insets.top }]}>
      {/* 头部 */}
      <View style={[styles.header, { borderBottomColor: theme.borderColor, backgroundColor: theme.menuBgColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <IconClose size={24} color={theme.textColor} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>Python 中转编辑器</Text>
          <Text style={[styles.headerSubtitle, { color: theme.subTextColor }]}>
            编写 Python 代码自建 API 中转
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setShowTemplatePicker(true)}
            style={styles.headerBtn}
          >
            <IconChevronDown size={22} color={theme.subTextColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
              <IconDownload size={22} color={theme.accentColor} />
            </TouchableOpacity>
        </View>
      </View>

      {/* 主体 */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator
      >
        {/* 环境变量配置 */}
        <View style={[styles.section, { backgroundColor: theme.secondaryColor }]}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>环境配置</Text>

          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.subTextColor }]}>Python 路径（可选）</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.textColor, borderColor: theme.borderColor, backgroundColor: theme.backgroundColor },
              ]}
              value={pythonPath}
              onChangeText={setPythonPath}
              placeholder="python / python3"
              placeholderTextColor={theme.subTextColor}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.subTextColor }]}>启动命令（可选，优先于脚本）</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.textColor, borderColor: theme.borderColor, backgroundColor: theme.backgroundColor },
              ]}
              value={launchCommand}
              onChangeText={setLaunchCommand}
              placeholder="python -m my_proxy"
              placeholderTextColor={theme.subTextColor}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={[styles.fieldLabel, { color: theme.subTextColor }]}>pip 依赖（逗号分隔）</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: theme.textColor, borderColor: theme.borderColor, backgroundColor: theme.backgroundColor },
              ]}
              value={pipPackages}
              onChangeText={setPipPackages}
              placeholder="requests, numpy, nekoai-api"
              placeholderTextColor={theme.subTextColor}
            />
          </View>
        </View>

        {/* 代码编辑器 */}
        <View style={[styles.section, { backgroundColor: theme.secondaryColor }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>Python 代码</Text>
            <View style={styles.sectionActions}>
              <TouchableOpacity onPress={handleCopyCode} style={styles.actionBtn}>
                <IconCopy size={18} color={theme.subTextColor} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowTestPanel((v) => !v)}
              style={styles.actionBtn}
            >
              <IconBolt size={18} color={showTestPanel ? theme.accentColor : theme.subTextColor} />
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            style={[
              styles.codeEditor,
              { color: theme.textColor, borderColor: theme.borderColor, backgroundColor: theme.backgroundColor },
            ]}
            value={scriptCode}
            onChangeText={setScriptCode}
            placeholder="# 在此编写你的 Python 代码..."
            placeholderTextColor={theme.subTextColor}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            textAlignVertical="top"
          />
        </View>

        {/* 测试面板 */}
        {showTestPanel && (
          <View style={[styles.section, { backgroundColor: theme.secondaryColor }]}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>测试运行</Text>

            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: theme.subTextColor }]}>测试输入</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { color: theme.textColor, borderColor: theme.borderColor, backgroundColor: theme.backgroundColor },
                ]}
                value={testInput}
                onChangeText={setTestInput}
                placeholder="输入要传给 Python 的文本"
                placeholderTextColor={theme.subTextColor}
              />
            </View>

            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: theme.subTextColor }]}>
                环境变量（每行一个 KEY=VALUE）
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: theme.textColor,
                    borderColor: theme.borderColor,
                    backgroundColor: theme.backgroundColor,
                    minHeight: 80,
                    maxHeight: 220,
                  },
                ]}
                value={testEnvVars}
                onChangeText={setTestEnvVars}
                placeholder="API_KEY=xxx&#10;MODEL=gpt-4&#10;BASE_URL=https://api.example.com"
                placeholderTextColor={theme.subTextColor}
                multiline
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: theme.accentColor }]}
              onPress={handleTest}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <IconBolt size={18} color="#fff" />
                  <Text style={styles.testBtnText}>运行测试</Text>
                </>
              )}
            </TouchableOpacity>

            {/* 日志输出 */}
            {logs.length > 0 && (
              <View style={[styles.logContainer, { backgroundColor: theme.backgroundColor }]}>
                <View style={styles.logHeader}>
                  <Text style={[styles.logTitle, { color: theme.subTextColor }]}>运行日志</Text>
                  <TouchableOpacity onPress={handleClearLogs}>
                    <IconTrash size={16} color={theme.subTextColor} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.logScroll}>
                  {logs.map((log, i) => (
                    <Text
                      key={i}
                      style={[
                        styles.logLine,
                        {
                          color: log.includes('成功') || log.includes('✅')
                            ? '#22c55e'
                            : log.includes('失败') || log.includes('❌')
                            ? '#ef4444'
                            : theme.subTextColor,
                        },
                      ]}
                    >
                      {log}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            )}

            {testResult && (
              <View style={[styles.resultContainer, { backgroundColor: theme.backgroundColor }]}>
                <Text style={[styles.resultTitle, { color: theme.textColor }]}>执行结果</Text>
                <Text style={[styles.resultText, { color: theme.subTextColor }]}>
                  {JSON.stringify(testResult, null, 2)}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* 模板选择器 */}
      <Modal
        visible={showTemplatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTemplatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.secondaryColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>选择模板</Text>
              <TouchableOpacity onPress={() => setShowTemplatePicker(false)}>
                <IconClose size={22} color={theme.textColor} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {TEMPLATES.map((tpl) => (
                <TouchableOpacity
                  key={tpl.key}
                  style={[
                    styles.templateItem,
                    { borderBottomColor: theme.borderColor },
                  ]}
                  onPress={() => handleLoadTemplate(tpl.code)}
                >
                  <View style={styles.templateIcon}>
                    <IconChevronDown size={20} color={theme.accentColor} />
                  </View>
                  <View style={styles.templateInfo}>
                    <Text style={[styles.templateName, { color: theme.textColor }]}>{tpl.name}</Text>
                    <Text style={[styles.templateDesc, { color: theme.subTextColor }]}>
                      {tpl.description}
                    </Text>
                  </View>
                  <IconChevronDown size={16} color={theme.subTextColor} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Python 运行时（测试时可见） */}
      {runtimeVisible && (
        <Modal visible={runtimeVisible} transparent animationType="fade">
          <View style={styles.runtimeOverlay}>
            <PythonRuntime
              code={scriptCode}
              envVars={envVarsForRuntime()}
              onResult={(r) => {
                (window as any).__onPythonResult?.(r);
                setRuntimeVisible(false);
              }}
              onLog={(text) => appendLog(text)}
              innerRef={runtimeRef}
            />
            <TouchableOpacity
              style={styles.runtimeCloseBtn}
              onPress={() => setRuntimeVisible(false)}
            >
              <IconClose size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* 底部保存按钮 */}
      <View style={[styles.footer, { backgroundColor: theme.menuBgColor, borderTopColor: theme.borderColor }]}>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: theme.accentColor }]}
          onPress={handleSave}
        >
          <IconDownload size={20} color="#fff" />
          <Text style={styles.saveBtnText}>保存并返回</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 100,
    gap: 16,
  },
  section: {
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldRow: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  codeEditor: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 300,
    textAlignVertical: 'top',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 8,
    gap: 8,
  },
  testBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  logContainer: {
    borderRadius: 8,
    marginTop: 12,
    padding: 12,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  logScroll: {
    maxHeight: 150,
  },
  logLine: {
    fontSize: 12,
    fontFamily: 'monospace',
    paddingVertical: 2,
  },
  resultContainer: {
    borderRadius: 8,
    marginTop: 12,
    padding: 12,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  resultText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
    gap: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: SCREEN_W * 0.85,
    maxHeight: '70%',
    borderRadius: 16,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  templateIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
  },
  templateDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  runtimeOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  runtimeCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
});
