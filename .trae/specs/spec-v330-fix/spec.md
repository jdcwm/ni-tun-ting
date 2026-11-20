# 鲵吞亭 v3.3.0 问题修复与功能完善 规格说明

## 问题背景

用户指出所有修改应当作用于正确项目目录 `c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern`（此前修改的是另一个副本目录，APK 也构建在错误项目）。
实际运行截图与用户反馈表明：虽然 ChatScreen 中存在 `usageTime/networkSpeed` 状态，但"使用时长"与"网速"两个功能未真正体现在 UI 可见位置；底部输入栏与导航栏之间存在空白区域；单条对话编辑 UI 缺少元数据卡片与表单标签；世界书封面无法选择显示部分（只能设置整张图，不能自定义裁切位置/缩放）；花式工具箱、整理世界观仍然出现在对话列表页面的头部按钮栏中（应只作为左菜单中的独立菜单项）；更多操作菜单没有与对话列表长按操作的完整功能对应；部分弹窗存在被遮挡风险（z-index）；登录功能仅存在 LoginModal 组件但 App 入口没有登录状态门控；聊天气泡皮肤系统需要确保"不是 QQ 视觉样式、是 QQ 技术原理（9-patch 切片 + 字体参数化 + 头像框本地绘制）"并删除任何"小尾巴"元素；AI 回复版本导航按钮必须是左箭头/右箭头加 `[1/3]` 形式（不得用"刷新"按钮）；右菜单世界书界面如果功能异常需要恢复可工作版本；同时删除菜单中的"主题设置"独立入口，只在左菜单设置 tab 里保留；最后必须以正确目录重新构建 APK（v3.3.0, versionCode 279, 包名 com.anonymous.aitavern），并把 `使用说明书-v3.3.md` 内容以说明书对话形式（置顶、不可删除）写入 AppContext。

## 目标用户 / 使用者

- 使用 Android APK 的实际用户（尤其是安装旧版再覆盖安装的用户）。
- 要求 UI 细节严格、功能"都能用，不是花架子"的产品使用者。

## 目标

1. 修正所有此前被错误应用到桌面副本（`C:\Users\jdcwm\Desktop\ai-tavern`）的修改，改为在正确项目 `c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern` 中实现或对齐。
2. 让用户提出的 12 大类 UI/功能问题全部被修复，做到：功能可用、UI 不被遮挡、布局贴合、与用户指定技术原理一致。
3. 保持旧版本向后兼容：旧气泡样式（classic/qq/classic_tail）映射为 default、旧设置键名不丢失、旧数据能被读取。
4. 说明书为 v3.3 最新内容，并在应用内以说明书对话形式存在。
5. 最终产出可覆盖安装的 APK（包名 com.anonymous.aitavern / versionCode 279 / versionName 3.3.0）。

## 非目标

- 不实现跨 App 全局字体替换（需要 root/越狱，不在需求）。
- 不改变主题系统的底层数据结构，不引入新的设置存储格式；只在"入口可见性"层面做调整。
- 不新增网络 API 对接；网速检测保持 ping gstatic.com/generate_204（用户可访问则正常，失败显示"离线"）。
- 不把气泡视觉改为 QQ 风格；仅是采用 QQ 的技术原理（9-patch、字体参数、头像框本地绘制）。

## 功能需求与非功能需求

### 需求列表（编号便于映射任务）

| ID | 分类 | 需求描述 |
|----|------|----------|
| R1 | 项目目录 | 所有修改作用于 `c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern`；所有实现、TypeScript 检查、APK 构建均以该目录为根。 |
| R2 | 说明书 | 在 AppContext 预置一条"使用说明书"对话，内容为同级目录的 `使用说明书-v3.3.md` 全文文本；对话 `conversationType='manual'`、置顶、不可删除；列表长按操作中禁止显示"删除"；排序时始终排在最前。 |
| R3 | 底部输入栏 | ChatScreen 的 ChatInput 在键盘未弹出时紧贴底部导航栏（无空白）；Android 使用 screen 与 window 高度差 + 88px 保底参与 ChatInput 的 bottomPadding 计算；iOS 保持 useSafeAreaInsets 行为；弹出键盘时以键盘高度为准，以避免旧内容被顶起后漏出空白。 |
| R4 | 单对话编辑 UI | ChatHistoryScreen 中的编辑弹窗升级为：顶部标题"编辑对话"；表单标签"标题"独立为一行 label（不是只用 placeholder）；标题输入 autoFocus；下方增加"元数据"卡片区域：显示消息数、创建时间、最后更新、对话类型（母/子/群）、母对话标题（如有）、封面缩略图；提供"复制标题/克隆对话/清空消息"三项快捷操作（与更多操作对齐）。 |
| R5 | 世界书封面裁剪 | 世界书支持"设置封面"（长按条目弹出），允许用户从相册选图，进入编辑界面后通过 4 个滑块调节：显示区域横向位置 X(-1~1)、纵向位置 Y(-1~1)、缩放 Scale(1~3)、圆角(0~32)；条目卡片缩略图按配置进行裁剪显示；设置持久化到 worldBook.coverConfig。 |
| R6 | 菜单结构 | "花式工具箱"和"整理世界观"从 ChatHistoryScreen 顶部按钮栏中移除；仅作为 LeftDrawerContent 菜单 tab 下的独立横向可滚动条目的 4 项中的 2 项（顺序：对话历史/花式工具箱/整理世界观/设置）；点击后跳转到对应用户设置屏幕（FancyToolBoxScreen / WorldOrganizerScreen）。 |
| R7 | 使用时长 & 网速可见 & 可用 | ChatScreen 顶部状态栏（"AI就绪/消息/世界书"条）右侧或两侧以 chip 形式增加"使用时长 HH:MM:SS"和"网速/延迟 ms 级别"两个显示项；每 1 秒刷新时长；每 30 秒 ping gstatic.com/generate_204 计算延迟分级；使用 `setInterval` 挂载在 `useEffect([])` 中并在 unmount 清理；chip 颜色按等级染色（离线-红/较慢-橙/正常-绿/极快-蓝）。 |
| R8 | 更多操作完整功能 | ChatScreen 顶部"..."更多操作菜单的条目必须包含对话列表长按菜单中的全部功能：编辑、收藏/取消收藏、设置封面、设置背景、设置用户头像、设置AI头像、子对话独立为对话/取消、切换母/子对话、置顶/取消置顶、导出JSON、导出Markdown、复制为Markdown、删除（仅非说明书）。 |
| R9 | 弹窗遮挡修复 | 统一管理 z-index / elevation / Modal presentation 层级：- Drawer 覆盖层 z 50；- 全屏半透明 overlay 类 100；- 用户菜单、ActionMenu、ActionSheet、编辑弹窗 200 或使用原生 Modal（自带最高层）；Long press 操作界面 ActionSheet/ManagementMenu 明确使用 bottom padding = max(insets.bottom, 88 + |screenH-windowH|) 防 Android 导航栏遮挡；edit sheet 同理处理。 |
| R10 | 登录功能恢复 | 从 App 入口引入"登录门控"：App.tsx 或 AppContext 导出 isLoggedIn、login(username,password)、register(username,password,nickname)、guestLogin()、logout()；数据以 AsyncStorage 持久化；首次启动无账号时显示 LoginScreen/LoginModal：注册/登录/游客三种入口；任何入口成功后进入 MainNavigator；登出按钮在左抽屉用户资料区；不做联网服务器验证；密码本地以 SHA-256（或同等可用算法）做 salted hash 存储。 |
| R11 | 聊天气泡皮肤系统（技术原理） | 确保气泡皮肤按 QQ 的技术原理（非视觉）工作：(1) 9-patch 切片：以 bubbleSkins.ts BubbleNinePatch 接口（四角 cornerRadius、四边 padding、边框、阴影、九宫格中心）驱动本地绘制，不能有 tail 字段、小尾巴已去除；(2) 字体参数化：BubbleFontConfig 支持 fontFamily、fontSize、fontWeight、color、lineHeight，应用到 MessageBubble 的文字层，且 MarkdownRenderer 也能接收 fontFamily/fontColor/fontWeight 参数后生效；(3) 头像框本地绘制：通过 avatarFrame.enabled/borderWidth/borderColor/shape（circle/rounded/square）+ 可选 borderRadius/shadow 在 avatar View 上绘制。保证 classic/qq/classic_tail 旧值全部兼容映射为 default；所有皮肤 cornerRadius 统一 18px；皮肤选择入口只出现在左抽屉设置 tab 下或 FancyToolBoxScreen。 |
| R12 | AI 回复版本导航 | MessageBubble 底部 AI 回复版本导航按钮：左 ◀ 箭头 + `[当前/总数]` + 右 ▶ 箭头；禁用时置灰；绝对禁止使用"刷新"图标或"刷新"文字按钮。 |
| R13 | 世界书右菜单恢复 | RightDrawerContent 中的 WorldBook 部分恢复为之前可工作版本：允许选择/取消选择世界书到当前对话；显示每本书的封面缩略图、名称、条目数；长按条目出现"设置封面"；条目级开关；有编辑/删除世界书入口。 |
| R14 | 移除菜单"主题设置" & 入口集中 | LeftDrawerContent 菜单 tab 里删除"主题设置"独立条目；只在设置 tab（activeTab='settings'）中保留主题相关、显示相关、气泡皮肤、日夜间切换的入口；避免重复入口或重复跳转页。 |
| R15 | 版本号对齐 | package.json version=3.3.0，app.json expo.version=3.3.0，android/app/build.gradle versionCode=279、versionName="3.3.0"、applicationId="com.anonymous.aitavern"。 |
| R16 | TypeScript 无错 | `npx tsc --noEmit` 在项目根运行通过 0 error。 |
| R17 | APK 构建 | 在正确项目目录 android 下通过 JDK17+gradle assembleRelease（或 gradlew）构建成功；产物：`android/app/build/outputs/apk/release/app-release.apk`，大小合理（>=80MB 合理区间），可覆盖安装旧版。 |

## 约束 / 依赖 / 假设

- 构建环境约束：使用 JDK 17（已验证路径 `C:\Users\jdcwm\AppData\Local\Programs\Microsoft\jdk-17.0.11.9-hotspot\jdk-17.0.11+9`），ANDROID_HOME=`C:\Users\jdcwm\AppData\Local\Android\Sdk`；gradle.properties jvmargs 至少 -Xmx4096m，防止 Kotlin daemon OOM。
- 路径长度：Windows 限制 260 字符，React Native 手势库等中间文件可能超长；若构建失败则使用短路径 junction `C:\ai2` 指向项目。
- 向后兼容：任何旧 bubbleStyle 值（classic/qq/classic_tail）必须在运行时被映射为 'default'，不能让用户 UI 变成空白气泡。
- 数据持久化：所有新增设置字段（bubbleSkin id、封面配置、登录态）必须通过 storage.saveSettings 或对应存储方法落盘。
- 禁用 emoji 约束：全局 UI 不能用 emoji（状态栏 RPG 角色预设中的 emoji 属于用户选择内容，预设可保留；但组件/UI 菜单不可用 emoji）。
- 说明书文件 `使用说明书-v3.3.md` 假定位于项目根，以 UTF-8 文本读取嵌入字符串，不运行时加载。

## 开放性问题

- Q: 花式工具箱、整理世界观的 4 项横向滚动条位置：确认在 LeftDrawerContent 菜单 tab 的顶部代替原本"对话历史"纵向条目吗？A：按照左抽屉顶部 tab 栏下方的横向可滚动项（4 个），对应点击后切换到对应用户设置屏幕或展开为对应视图。具体形式由实现时采用"tab bar + active indicator"形式。
- Q: 说明书对话在用户清空所有数据时是否重置？A：每次 AppContext 初始化，如果未检测到 manual 对话存在，自动重新注入。

---

## 验收标准 Acceptance Criteria

### rule 类（客观可验证）

AC-R1（目录正确）：所有修改文件路径均以 `c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern` 开头，没有在其他并行目录写入相同代码。
验证：搜索变更列表，不应出现 `C:\Users\jdcwm\Desktop\ai-tavern` 开头的变更路径。

AC-R2（说明书对话预置）：AppContext 启动后 chats 中存在一条 `conversationType === 'manual'` 或其他明确标识字段的对话；标题为"使用说明书"；其首条 AI 消息文本与 `使用说明书-v3.3.md` 文本内容一致（或去除了不支持的 markdown 标记但内容全匹配）。
验证：在 AppContext 内定位 presetManualChat 常量，文本对比 md 文件。

AC-R3（输入栏无底部空白）：
- ChatInput.tsx 的 bottomPadding 计算方式：Platform.OS==='android' 时，未弹出键盘为 0 或仅含 screen/window 高度差；弹出键盘时使用 keyboardHeight。
- ChatScreen.tsx 的 FlatList 与 ChatInput 之间不出现空 View。
验证：代码审查 ChatInput bottomPadding 与 ChatScreen 布局层次。

AC-R4（单对话编辑 UI 升级）：
- 编辑 Modal 含"标题"label 行 + TextInput（autoFocus=true）；
- 元数据卡片区域：消息数、创建、更新、类型、母对话标题（如适用）、封面缩略图；
- 底部按钮区提供：复制标题、克隆对话、清空消息 三个按钮或选项。
验证：源码检查 showEditModal 的 JSX。

AC-R5（世界书封面裁剪区域）：
- WorldBook 类型存在 coverConfig（或等价字段）：包含 scale、offsetX、offsetY、borderRadius 数值；
- 编辑封面页面提供 4 个 slider；
- 世界书列表卡片按 coverConfig 渲染缩略图（image style transform:translate + scale 或使用 display area 裁剪）。
验证：types/index.ts + WorldBookScreen.tsx + 长按菜单入口。

AC-R6（4 项菜单 tab）：
- LeftDrawerContent 菜单 tab 顶部存在可横向滚动的 4 个 tab：对话历史、花式工具箱、整理世界观、设置；
- 点击后分别激活对应内容区域或跳转对应 Screen；
- ChatHistoryScreen 头部不再出现"整理世界观"、"花式工具箱"按钮。
验证：LeftDrawerContent & ChatHistoryScreen 源码。

AC-R7（时长 + 网速真实可见 & 更新）：
- ChatScreen 顶部状态栏（"AI就绪..."那一行）增加 2 个 chip：使用时长（HH:MM:SS 格式）和 网速/延迟+等级；
- 每秒 setInterval 更新 usageTime；
- 每 30 秒 setInterval 调 testNetwork；
- chip 颜色：离线红、较慢橙、正常绿、极快蓝。
验证：ChatScreen 源码 render 这两项；且 useEffect 包含两个 interval 初始化+清理。

AC-R8（更多操作对齐）：
ChatScreen 顶部更多操作菜单条目集合 ⊇ ChatHistoryScreen 长按动作集合（除封面与背景相关仅对列表操作合理的差异部分，但用户明确要求全部加进更多操作）。
验证：两个菜单操作项列表对比，"更多操作"至少包含：编辑、收藏、设置封面、设置背景、用户头像设置、AI 头像设置、子对话独立、切换母子、置顶、导出JSON、导出MD、复制MD、删除（非说明书）。

AC-R9（遮挡 & 弹窗层级）：
- ActionMenu / ActionSheet / 编辑 Modal 都使用 React Native Modal（透明动画），或在底部 padding 中明确加入导航栏高度（88+|screenH-windowH|）；
- 任何绝对定位用户菜单/弹出层 zIndex/elevation >= 200；
- drawer / overlay / menu 层级数值不混乱。
验证：检查 ActionMenu、ActionSheet、ChatHistoryScreen 编辑 Modal、ChatScreen 编辑 Modal 的 paddingBottom 计算和 Modal 使用。

AC-R10（登录功能）：
- 存在 isLoggedIn 状态；
- login / register / guest / logout 四个函数；
- 密码使用 hash + salt 存 AsyncStorage；
- App 入口如果未登录，显示 LoginModal / LoginScreen（不是直接进 MainNavigator）；
- 左抽屉用户区有"退出登录"按钮（仅非游客）。
验证：App.tsx / AppContext 源码 + LoginModal 使用处。

AC-R11（气泡皮肤系统技术）：
- BubbleNinePatch 接口无 tail 字段；
- 所有预设皮肤 cornerRadius 18；
- bubbleStyle 值 'classic' | 'qq' | 'classic_tail' 运行时被统一映射为 'default'；
- MessageBubble 使用 bubbleSkins.getSkinById + bubbleBodyStyle (9-patch borderRadius / padding / border / shadow) 画气泡；
- 字体 fontFamily/size/color/weight 通过 applyFontConfig 应用；
- MarkdownRenderer 能接收字体参数并应用；
- 头像框通过 avatarFrame 配置用 borderWidth + borderColor + shape 画出；
- 皮肤入口只在左抽屉设置 tab 或 FancyToolBoxScreen 出现。
验证：bubbleSkins.ts + MessageBubble.tsx + LeftDrawerContent（入口可见性）。

AC-R12（版本导航按钮）：
MessageBubble.renderVersionNav 只出现：◀ 箭头 + 当前/总数 + ▶ 箭头；无"刷新"按钮字样或图标。
验证：MessageBubble.tsx renderVersionNav 函数源码。

AC-R13（右菜单世界书恢复）：
RightDrawerContent 展示当前 chat.worldBookIds 选择状态；每本书显示封面缩略图、书名、条目数；长按世界书条目有"设置封面"。
验证：RightDrawerContent.tsx 源码。

AC-R14（主题入口集中）：
LeftDrawerContent 菜单 tab（activeTab==='menu'）中不含"主题设置"独立入口；所有主题、配色、气泡皮肤、日夜间切换入口全部集中在设置 tab（activeTab==='settings'）展开或跳转下。
验证：menuItems 数组无"主题设置"键；settingsItems 或 settings 跳转路径中有完整相关项。

AC-R15（版本对齐）：
package.json "version":"3.3.0"，app.json expo.version="3.3.0"，android/app/build.gradle versionCode 279 versionName "3.3.0" applicationId "com.anonymous.aitavern"。
验证：三个文件内容。

AC-R16（tsc 无错）：在正确项目根执行 `npx tsc --noEmit` 返回 exit 0。
验证：执行命令。

AC-R17（APK 产物）：
`c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern\android\app\build\outputs\apk\release\app-release.apk` 存在且大小 >= 80MB。
验证：Get-Item / ls 产物。

### rubric 类（评估）

AC-UX1：底部输入栏贴合度评估（0-2）
- 2=截图中输入栏下边距与导航/屏幕底部无缝，无空白条；
- 1=偶有 2~6px 空白（不明显）；
- 0=存在截图中明显空白（当前现象类似）。
证据来源：构建后运行/截图或审阅布局代码与间距策略。

AC-UX2：单条对话编辑 UI 美观与信息完备度（0-2）
- 2=元数据卡片整齐、表单有 label、操作按钮完整；
- 1=信息全但排版略乱；
- 0=仍只有标题输入框，信息缺失。

AC-UX3：弹窗无遮挡整体体验（0-2）
- 2=所有 ActionSheet/Modal 底部均避开导航栏，上层不被下层遮挡；
- 1=个别位置偶有遮挡但不影响操作；
- 0=存在明显被遮挡按钮或无法点击。

AC-Func1：登录/注册/游客 三入口流程完整度（0-2）
- 2=注册→登录→登出→游客 全部可走通，数据持久化重开后仍生效；
- 1=注册/登录可用但游客/登出部分瑕疵；
- 0=仍直接进主界面（只有 UI 花架子）。

AC-Func2：气泡皮肤系统的"技术原理实现到位度"（0-2）
- 2=9-patch corner/padding/border/shadow 分离、字体参数透传到 markdown 与 text、头像 frame 本地绘制；
- 1=只有部分（例如气泡有 9-patch，但 markdown 不接收字体参数）；
- 0=仍使用"固定 QQ 配色样式字符串+小尾巴"。
