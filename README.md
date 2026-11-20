# 鲵吞亭 · AI 角色扮演酒馆

一个基于 **Expo + React Native** 的 AI 角色扮演聊天应用（Android / 网页·电脑版）。

> 名字取自《东方 Project》人类村落那家「鲵吞亭」—— 一个可以坐下来慢慢聊的地方。

---

## 功能

- **多 AI 模型**：任意 OpenAI / Anthropic / Gemini 兼容接口，可分别指定「对话 / 生图 / 视觉 / 总结」用哪个模型
- **角色卡**：导入 SillyTavern V2 角色卡（PNG / JSON），支持世界书、开场白、对话示例
- **群聊**：多个角色同场对话，可设「群聊总设定」+「单角色设定」，支持自动推进
- **通讯录**：多本通讯录，可跨本拉人建群，不同通讯录角色互不串台
- **世界书**：关键词触发注入，支持递归、位置、深度、顺序等参数
- **状态栏**：信用点 / 好感度等变量，由 AI 通过隐藏指令增量更新
- **表情包**：AI 通过 `{{ui:img=名字}}` 直接发表情，就地渲染
- **内置 CSS / 自定义界面**：可用 HTML + CSS + JS 重做界面，通过 `window.Aurora` 反向驱动 App
- **自研模板引擎**：Handlebars / EJS / Nunjucks 三种语法自动识别（不依赖 `eval`，可在 Hermes 上运行）
- **ERA 游戏启动器**：导入 Emuera 的 `.zip` 包直接玩
- **多端**：Android APK + 网页版（可当电脑版用）

内置「碧蓝档案」（193 位角色）与「幻想入界」（东方 Project，49 地点 + 156 角色）两套完整资料。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 应用框架 | Expo SDK 57 |
| UI | React Native 0.86 / React 19 |
| 语言 | TypeScript（strict） |
| 导航 | React Navigation 7（stack / drawer / bottom-tabs） |
| 打包 | Metro ／ 原生用 Gradle 9 + AGP + Kotlin |
| 网页 | react-native-web 0.21 |
| 存储 | 文件系统（Android）／ IndexedDB（网页） |

### 两处自研实现

1. **`src/services/macroService.ts`（1669 行）**
   Hermes 不支持 `eval` / `new Function`，官方 ejs/handlebars/nunjucks 全都跑不起来。
   所以手写了：安全表达式求值器（白名单运算 + 递归下降）→ Handlebars 引擎 → EJS 引擎 → Nunjucks 引擎 + 过滤器库。
   靠 `while(changed)` 的迭代式正则替换来实现嵌套块处理（由内向外剥洋葱，最多 20 层）。

2. **`src/utils/zipUtils.ts`**
   手写的 gzip + tar 解析（靠魔数识别格式），用于 ERA 游戏包导入。

---

## 开发

```bash
npm install

npm run android   # 需要 Android SDK + JDK 17
npm run web       # 网页版，浏览器打开
```

打 APK：

```bash
cd android
./gradlew assembleRelease
```

> ⚠️ 构建前如遇 `Duplicate resources`，先删除 `android/app/build/generated/res/react`。

### 配置 AI Key

源码里**不包含**任何 API Key。首次启动后在「设置 → AI 模型设置」里填入自己的 Key 即可（保存在本地）。

如果希望开箱即用，可在构建时注入：

```bash
EXPO_PUBLIC_DEFAULT_API_KEY=sk-xxxx npm run android
```

---

## 目录结构

```
src/
├── screens/       界面（ChatScreen 是核心）
├── components/    组件
├── services/      业务：AI、存储、模板引擎、世界书、记忆…
├── data/          内置资料与预设（角色卡、世界书、表情包清单）
├── utils/         工具（storage、zip 解析…）
└── types/         类型定义
scripts/           资料生成与校验脚本
assets/            角色立绘、表情包
```

---

## 声明

- 本项目为**个人学习与非商业用途**。
- 「碧蓝档案」「东方 Project」的角色、剧情、图像版权归各自权利方所有，本项目不主张任何相关权利。
- 请勿将本项目用于商业用途或大规模分发内置素材。
