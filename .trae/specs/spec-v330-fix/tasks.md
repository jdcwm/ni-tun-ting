# 鲵吞亭 v3.3.0 修复与完善 — 实现计划 (tasks.md)

> 所有文件修改均位于 `c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern`。任务按依赖顺序排序。

## Task 1: 版本号 & 构建配置对齐
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 核对 package.json version=3.3.0、app.json expo.version=3.3.0、android/app/build.gradle versionCode=279、versionName="3.3.0"、applicationId="com.anonymous.aitavern"。
  - 核对 gradle.properties jvmargs 至少 -Xmx4096m -XX:MaxMetaspaceSize=1024m。
  - 核对 NDK 路径/版本在 android/build.gradle 或 app/build.gradle 中显式设置。
- **Acceptance Criteria Addressed**: AC-R15
- **Test Requirements**:
  - `rule` TR-1.1: 读取 package.json 字段 version === "3.3.0"；读取 app.json expo.version === "3.3.0"、expo.android.package === "com.anonymous.aitavern"；读取 android/app/build.gradle 中 versionCode 279、versionName "3.3.0"。
  - `rule` TR-1.2: 读取 gradle.properties，org.gradle.jvmargs 包含 -Xmx4096m。

## Task 2: 注入使用说明书对话到 AppContext
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 读取项目根 `使用说明书-v3.3.md` 全文为内嵌常量字符串（嵌入 AppContext 源码，不运行时读文件）。
  - 在 AppContext 初始化 chats 时自动注入（若不存在 `conversationType === 'manual'` 且标题「使用说明书」的对话则新增）：首条 AI 消息 = v3.3 说明书全文；`isPinned=true`、`conversationType='manual'`、禁止删除（长按/更多操作里对该 chat 屏蔽删除按钮）。
  - 排序时说明书永远在首位（即使被取消置顶也排第一）。
- **Acceptance Criteria Addressed**: AC-R1, AC-R2
- **Test Requirements**:
  - `rule` TR-2.1: AppContext.tsx 内可定位 `presetManualText`（或等价）常量，内容匹配 `使用说明书-v3.3.md` 全文。
  - `rule` TR-2.2: 初始化逻辑中当 chats 不含 manual 对话时自动插入，且 `isPinned=true`、`conversationType='manual'`。
  - `rule` TR-2.3: ChatHistoryScreen 删除按钮、ChatScreen 更多操作菜单删除按钮在 manual 对话上不可见或禁用。

## Task 3: 底部输入栏紧贴导航栏
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - ChatInput.tsx 内 bottomPadding：Android 未弹键盘时 = `max(insets.bottom, 88 + Math.abs(screenH - windowH))`，保证与导航栏贴合无空白；键盘弹出时 = `keyboardHeight`。
  - iOS 保持 `Math.max(insets.bottom, 2)`。
  - ChatScreen.tsx ChatInput 外层去除多余 marginBottom/paddingBottom，paddingTop 改为 12（避免之前 50 的大空距）。
  - ChatInput 组件外层使用 SafeAreaView `edges={['bottom']}` 时只对 iOS 生效，Android 使用显式 padding 计算。
- **Acceptance Criteria Addressed**: AC-R3, AC-UX1
- **Test Requirements**:
  - `rule` TR-3.1: ChatInput.tsx bottomPadding 计算在 Platform.OS==='android' 时，keyboardHeight==0 的分支不再单独加固定 20~48 的底距，而是使用 88+|screenH-windowH| 保底 + insets.bottom 取大值。
  - `rule` TR-3.2: ChatScreen.tsx 外层容器/FlatList 下方 ChatInput 之间没有占位空 View 或 paddingBottom。
  - `rubric` TR-3.3: 贴合度评估，0-2，threshold>=1；证据来源于源码布局审查与 UI 逻辑推断。

## Task 4: 单对话编辑弹窗 UI 升级
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - ChatHistoryScreen.tsx 中 showEditModal 的 Modal：
    - 顶部标题「编辑对话」+ 关闭按钮。
    - 表单「标题」单独一行 label，TextInput autoFocus=true，placeholder 与 label 分离。
    - 「元数据」卡片，含消息数、创建时间、最后更新、对话类型标签（母/子/群/说明书）、母对话标题（parentId 存在时）、封面缩略图（coverImage 存在时）。
    - 底部快捷操作：复制标题、克隆对话（生成同内容新 chat）、清空消息（保留对话结构仅 messages=[]）。
    - paddingBottom 加导航栏高度，避免底部按钮被导航栏遮挡。
- **Acceptance Criteria Addressed**: AC-R4, AC-UX2
- **Test Requirements**:
  - `rule` TR-4.1: 编辑弹窗存在「标题」独立 label 行，TextInput autoFocus=true。
  - `rule` TR-4.2: 元数据卡片至少 6 项信息：消息数、创建时间、更新时间、类型标签、母对话标题（条件展示）、封面缩略图（条件展示）。
  - `rule` TR-4.3: 弹窗底部至少 3 个按钮/选项：复制标题、克隆对话、清空消息。
  - `rule` TR-4.4: 编辑弹窗 paddingBottom 或外层 ScrollView contentContainerStyle paddingBottom >= max(insets.bottom, 88+|screenH-windowH|)。
  - `rubric` TR-4.5: 信息完备 & 排版，0-2，threshold>=1。

## Task 5: 世界书封面裁剪（coverConfig + 4 滑块 + 缩略图按裁切渲染）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - types/index.ts 为 WorldBook 添加 coverConfig?: { scale: number, offsetX: number, offsetY: number, borderRadius: number }，默认 {scale:1,offsetX:0,offsetY:0,borderRadius:8}。
  - WorldBookScreen.tsx 长按条目 → ActionSheet 添加「设置封面」。设置封面流程：相册选图 → 打开封面编辑 Modal → 4 个 Slider（X:-1~1, Y:-1~1, Scale:1~3, Radius:0~32），预览区域居中裁剪显示；保存写入 worldBook.coverImage 与 coverConfig。
  - 列表卡片封面缩略图按 coverConfig 渲染（用 Image style transform: [{translateX},{translateY},{scale}] + overflow:'hidden' + borderRadius，配合 container 尺寸固定作为可视窗口）。
  - 同步更新 RightDrawerContent 世界书 tab：条目卡片显示封面、名称、条目数，长按也有设置封面入口。
- **Acceptance Criteria Addressed**: AC-R5, AC-R13
- **Test Requirements**:
  - `rule` TR-5.1: types/index.ts 中 WorldBook 包含 coverConfig 字段（scale/offsetX/offsetY/borderRadius）。
  - `rule` TR-5.2: WorldBookScreen.tsx 长按菜单出现「设置封面」选项；封面编辑 Modal 内 4 个 Slider 与预览区域。
  - `rule` TR-5.3: 世界书卡片封面 Image 的 style 应用了 coverConfig 的 scale/translateX/translateY 与容器 borderRadius。
  - `rule` TR-5.4: RightDrawerContent.tsx 世界书 tab：每本书显示封面缩略图、书名、条目数；长按条目能进入设置封面。

## Task 6: 左菜单结构调整（4 项横向 tab + 移除对话列表顶栏按钮 + 删除「主题设置」独立入口）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - LeftDrawerContent.tsx 菜单 tab（activeTab==='menu'）顶部增加横向可滚动 tab 栏（ScrollView horizontal），4 项：对话历史 / 花式工具箱 / 整理世界观 / 设置。点击切换展示区域（前 3 项在菜单 tab 内切换内容块，设置项直接切到 activeTab='settings'）。
  - 删除 LeftDrawerContent menuItems 里「主题设置」独立条目（保留设置 tab 内部的主题编辑器入口）。
  - ChatHistoryScreen.tsx 头部的 WorldViewOrganizer、FancyToolBox 入口按钮/Modal 状态移除（showWorldViewOrganizer、showFancyToolBox 及对应触发按钮删掉），避免重复入口。
  - LeftDrawerContent 中「花式工具箱」点击显示 FancyToolBox（或跳转 FancyToolBoxScreen），「整理世界观」点击显示 WorldViewOrganizer（或跳转 WorldOrganizerScreen）。
- **Acceptance Criteria Addressed**: AC-R6, AC-R14
- **Test Requirements**:
  - `rule` TR-6.1: LeftDrawerContent 菜单 tab 顶部有 4 项横向滚动 tab（对话历史、花式工具箱、整理世界观、设置）。
  - `rule` TR-6.2: ChatHistoryScreen.tsx 顶部按钮栏不再包含「整理世界观」「花式工具箱」按钮（grep showWorldViewOrganizer/showFancyToolBox 引用仅保留 LeftDrawerContent 内）。
  - `rule` TR-6.3: LeftDrawerContent menuItems 不存在 key/title 为「主题设置」的条目。
  - `rule` TR-6.4: 设置 tab（activeTab==='settings'）内仍保留主题编辑器、日夜间切换、气泡皮肤等入口。

## Task 7: 使用时长 + 网速芯片真正可见 & 颜色分级
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - ChatScreen.tsx 顶部「AI 就绪」状态行（StatusBarComponent 或自定义 header row）内新增 2 个 chip：
    - 使用时长：HH:MM:SS 格式（h=`Math.floor(s/3600)` 也显示，非 24h 制），每秒 setInterval 更新。
    - 网速/延迟：显示 `${latency}ms ${level}`；chip 背景色按等级染色：离线=红底白字，较慢=橙，正常=绿，极快=蓝，检测中=灰；
  - testNetwork 函数：fetch `https://www.gstatic.com/generate_204`（中国大陆更稳定）替代 google.com，AbortController 超时 5000ms；失败即离线。
  - useEffect 清理：return 时 clearInterval 两个 timer。
- **Acceptance Criteria Addressed**: AC-R7
- **Test Requirements**:
  - `rule` TR-7.1: ChatScreen render 的顶部 header 行包含两个 chip：usageTime（HH:MM:SS）和 networkSpeed（延迟+等级）。
  - `rule` TR-7.2: useEffect 启动 1s 间隔 usageTimer 与 30s 间隔 networkTimer；return 清理。
  - `rule` TR-7.3: networkSpeed 分级 chip 颜色：离线红 / 较慢橙 / 正常绿 / 极快蓝 / 检测中灰。
  - `rule` TR-7.4: testNetwork 请求 URL 为 `https://www.gstatic.com/generate_204` 或等价 204 端点，含超时控制。

## Task 8: ChatScreen 更多操作菜单与长按操作对齐
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4 (删除入口共用 disable 逻辑)
- **Description**:
  - ChatScreen.tsx showMoreMenu / ActionMenu 的 items 完全覆盖 ChatHistoryScreen 长按动作：编辑、收藏/取消收藏、设置封面、设置背景、设置用户头像、设置AI头像、子对话独立（仅子对话）、切换母/子、置顶/取消置顶、导出JSON、导出Markdown、复制为Markdown、删除（非说明书禁用）。
  - 复用 ChatHistoryScreen 中的 setChatCover/setChatWallpaper/setChatUserAvatar/setChatAssistantAvatar/independentChildChat/toggleConversationType 等函数或抽取到 AppContext。
- **Acceptance Criteria Addressed**: AC-R8
- **Test Requirements**:
  - `rule` TR-8.1: 更多操作菜单条目列表 ⊇ 长按操作列表（除合理的对称分组），至少包含用户明确要求的 13 项中的 12 项以上（封面/背景/头像设置/母子/置顶/导出/删除/收藏/编辑）。
  - `rule` TR-8.2: 说明书对话（conversationType==='manual'）的更多操作菜单删除项隐藏或禁用。

## Task 9: 弹窗遮挡 & z-index/elevation 统一修复
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4（编辑弹窗）、Task 8（更多操作）
- **Description**:
  - 将 ActionMenu、ManagementMenu、ChatHistoryScreen 编辑弹窗、ChatScreen 消息 ActionSheet、LongPress 菜单所有涉及底部弹出 UI 的容器统一添加：`paddingBottom = Math.max(insets.bottom, 88 + Math.abs(screenH - windowH))`（Android 导航栏高度保底）。
  - 非 Modal 的绝对定位菜单（ActionMenu 用户弹出、用户菜单下拉）zIndex/elevation ≥ 200；Drawer overlay z=50，普通全屏半透明 overlay z=100，确保不与下层重叠。
  - 检查 LeftDrawerContent、RightDrawerContent、ActionSheet 内部不使用低 z 值容器包裹弹出内容。
- **Acceptance Criteria Addressed**: AC-R9, AC-UX3
- **Test Requirements**:
  - `rule` TR-9.1: ActionSheet、ActionMenu、ManagementMenu、编辑 Modal 的内容容器 paddingBottom 计算包含 88+|screenH-windowH| 或使用 Modal + safeArea。
  - `rule` TR-9.2: 绝对定位的弹出菜单 style zIndex ≥ 200（或 elevation ≥ 10）。
  - `rule` TR-9.3: drawer overlay = 50 / overlay = 100 / menu = 200 三级数值不混乱（至少升序）。
  - `rubric` TR-9.4: 遮挡体验，0-2，threshold>=1。

## Task 10: 登录功能恢复（App 入口门控 + 本地账号持久化）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - AppContext 增加：isLoggedIn、currentUser、login(username,password)、register(username,password,nickname)、guestLogin()、logout() 四个函数 + 状态。
  - 使用 AsyncStorage 存储：`aitavern_users`（用户表 [{username, nickname, salt, passwordHash}]）、`aitavern_session`（当前会话 {username, isGuest}）。
  - 密码使用随机 salt + SHA-256（可借助 crypto.subtle 或轻量 hash 函数 + btoa 实现 salted hash）存。
  - App.tsx：SplashScreen 结束后根据 isLoggedIn 渲染 LoginModal（未登录）或 MainNavigator（已登录）；LoginModal 有三个 tab / 三个按钮：注册 / 登录 / 游客进入。
  - LeftDrawerContent 用户区域：显示 nickname（或「游客」），非游客时增加「退出登录」按钮调用 logout。
- **Acceptance Criteria Addressed**: AC-R10, AC-Func1
- **Test Requirements**:
  - `rule` TR-10.1: AppContext 暴露 isLoggedIn、login、register、guestLogin、logout。
  - `rule` TR-10.2: 用户表存储带 salt + 哈希（AsyncStorage key `aitavern_users` 能在 storage 中保存）。
  - `rule` TR-10.3: App 入口（Splash 之后）未登录显示 LoginModal / LoginScreen，不直接进 MainNavigator。
  - `rule` TR-10.4: 左抽屉用户区有「退出登录」按钮（非游客时）。
  - `rubric` TR-10.5: 三入口流程完整度 0-2，threshold>=1。

## Task 11: 气泡皮肤系统（确保 QQ 技术原理 + 旧值兼容 + 无小尾巴）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - bubbleSkins.ts：
    - BubbleNinePatch 接口确认无 tail 字段。
    - 所有预设皮肤 cornerRadius = 18（四角统一）。
    - `getSkinById(id)` 若 id ∈ {'classic','qq','classic_tail'} 一律返回 defaultBubbleSkin（兼容旧配置）。
    - 新增 2 个皮肤：暖樱粉（warm_cherry）、深海蓝（deep_ocean），供 Toolbox 选择。
  - MessageBubble.tsx：
    - 确保 bubbleStyle 经 getSkinById 兼容映射后再绘制。
    - applyFontConfig 透传到 MarkdownRenderer fontFamily/fontSize/color/fontWeight（MarkdownRenderer Props 未含则补齐）。
    - 头像区按 avatarFrame.shape + borderWidth + borderColor 本地绘制（无需小尾巴 view，删除 renderBubbleTail 函数与任何 tail 输出）。
    - renderVersionNav 严格 ◀ + `[cur/total]` + ▶，禁用置灰；绝不出现「刷新」图标或文字按钮。
  - FancyToolBoxScreen（或设置 tab）展示气泡皮肤选择器（不放在菜单 tab）。
- **Acceptance Criteria Addressed**: AC-R11, AC-R12, AC-Func2
- **Test Requirements**:
  - `rule` TR-11.1: BubbleNinePatch 接口无 tail 字段（grep 'tail.*:' BubbleNinePatch 无命中）。
  - `rule` TR-11.2: 所有预设皮肤 TL/TR/BL/BR 均为 18。
  - `rule` TR-11.3: getSkinById('classic') / getSkinById('qq') / getSkinById('classic_tail') 返回 defaultBubbleSkin。
  - `rule` TR-11.4: MessageBubble 内 MarkdownRenderer 调用点传入 fontConfig（fontFamily/fontSize/color/fontWeight）。
  - `rule` TR-11.5: MessageBubble 绘制头像时使用 avatarFrame.shape/borderWidth/borderColor 生成 style。
  - `rule` TR-11.6: renderVersionNav 的 JSX 仅包含 ◀ [N/M] ▶；无 IconRefresh / 文字「刷新」。
  - `rubric` TR-11.7: 技术原理实现到位度 0-2，threshold>=1。

## Task 12: 右菜单世界书恢复为可用版本（选择到当前对话 + 条目显示）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5
- **Description**:
  - RightDrawerContent.tsx worldbook tab 内：当前 chat.worldBookIds 受控通过 props onWorldBookIdsChange 回传；每本书一个卡片（封面缩略图、书名、条目数、启用总开关），卡片点击或 Switch 切换加入 worldBookIds；长按弹出 ActionSheet：设置封面、编辑、删除、加入对话。
  - 修复 WorldBookScreen props：新增 `worldBookIds`、`onWorldBookIdsChange`（或在 RightDrawerContent 自己包一层状态），保证 UI 选择立刻生效。
- **Acceptance Criteria Addressed**: AC-R13
- **Test Requirements**:
  - `rule` TR-12.1: RightDrawerContent 世界书 tab 卡片包含：封面缩略图、书名、条目数、总启用开关。
  - `rule` TR-12.2: Switch/选择 切换能通过 onWorldBookIdsChange 回写 chat.worldBookIds。
  - `rule` TR-12.3: 长按条目 → ActionSheet 有「设置封面」选项（Task 5 的封面编辑联动）。

## Task 13: TypeScript 编译校验（npx tsc --noEmit 通过）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
- **Description**:
  - 在正确项目根运行 `npx tsc --noEmit`；修复所有类型错误。
- **Acceptance Criteria Addressed**: AC-R16
- **Test Requirements**:
  - `rule` TR-13.1: 终端执行 `npx tsc --noEmit`（cwd = 项目根）返回 exit code 0。

## Task 14: 构建 Release APK（短路径 + JDK17 + Gradle assembleRelease）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 1, Task 13
- **Description**:
  - 确认 JDK 17 在 PATH（`JAVA_HOME=C:\Users\jdcwm\AppData\Local\Programs\Microsoft\jdk-17.0.11.9-hotspot\jdk-17.0.11+9`）。
  - 确认 `C:\ai2` junction 指向正确项目（如不存在则创建）；在短路径目录执行，避免 Windows 260 字符路径问题。
  - 执行 `gradlew.bat assembleRelease`（或 `cd android && gradlew assembleRelease`）。
  - 产物验证：`android/app/build/outputs/apk/release/app-release.apk` 存在且大小 >= 80MB。
- **Acceptance Criteria Addressed**: AC-R1, AC-R17
- **Test Requirements**:
  - `rule` TR-14.1: `java -version` 返回 17.x；`JAVA_HOME` 指向 jdk-17。
  - `rule` TR-14.2: `app-release.apk` 文件存在于 `android/app/build/outputs/apk/release/`。
  - `rule` TR-14.3: apk 大小 >= 80MB。
