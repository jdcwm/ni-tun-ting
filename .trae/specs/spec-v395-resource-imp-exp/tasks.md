# 任务队列：资源导入导出统一 + 社区入库隔离 + UI 规范

> 对应 spec：`.trae/specs/spec-v395-resource-imp-exp/spec.md`。每个任务必须完成后把 TR 完成证据贴到"完成证据"段落，再把 Status 改为 completed。
> 优先级：high 先做，完成后再做 medium。依赖顺序按 `Depends On` 执行。

## Task 1: 登录层兜底 + session 自愈 (R1, R2)
- **Status**: completed
- **Priority**: high
- **Depends On**: 无
- **覆盖 AC**: AC-R1, AC-R2
- **Task-local Test Requirements**:
  - TR-R1-1 (rule): 手动修改 `communityService.baseUrl='https://www.baidu.com'`（典型返回 HTML），LoginModal 点登录后错误文案 `error` state 中必须包含词"社区服务器地址"或"无法连接"，且不包含 `Unexpected token` / `not valid JSON`。
  - TR-R1-2 (rule): 正常 baseUrl 下有效登录成功仍走原路径，LoginModal 错误为空并触发 onSuccess。
  - TR-R2-1 (rule): AsyncStorage.setItem('aitavern_session','not-json') 调用后，authApi.getCurrentSession() 返回 null，且紧接着 AsyncStorage.getItem(SESSION_KEY) 返回 null 或空。
  - TR-R2-2 (rule): saveSession({username:1234, nickname:null, points:'abc'}) 这种错误类型调用，能被 safeSession 规整成合法结构写回，读取不会崩。
- **改动文件**（预计）：`src/services/communityService.ts`，`src/services/authApi.ts`
- **完成证据**:
  - `communityService.request` 位于 `src/services/communityService.ts` L52-L98：
    * 先 `await response.text()` 取 raw（L67），独立内部 try/catch 做 `JSON.parse(text)`（L69-L76）；parse 失败且 `!response.ok` → 抛"服务器返回异常 (HTTP N)：请检查社区服务器地址是否正确，或稍后重试"；HTTP 2xx 且 parse 失败 → 抛"服务器返回格式错误：无法解析响应内容，请检查社区服务器地址设置"。
    * parse 成功但非 2xx：对象优先取 `data.error / data.message`；非对象走 `JSON.stringify(data).slice(0,80)`；最后兜底 `请求失败: ${status}`（L77-L86）。
    * 最外层 catch：含 `Unexpected token` / `not valid JSON` / `SyntaxError` → 提示"服务器返回内容格式错误：请确认'个人资料/用户设置'中填写的社区服务器地址可用（应为 http(s)://host:3000 形式）"；含 `fetch failed` / `Failed to connect` / `Network request failed` / `Unable to resolve` / `ECONNREFUSED` → 提示"无法连接到社区服务器：请检查网络，或在'用户设置'中修改服务器地址"；否则保留消息或'网络请求失败'。已确保 request 不再把 SyntaxError 原文直接抛到 LoginModal。
    * 完整保留 headers 合并（L54-L56）、body JSON.stringify（L65）、Authorization Bearer（L58-L59）逻辑。
  - `safeSession` 位于 `src/services/authApi.ts` L22-L35：入参 `any`；username 用 `String(...)` 强制转字符串，null/undefined → 空串；nickname `String(...)` 后空则回填 username；isGuest/isAdmin 强制 `Boolean()`；uid 必须是 number 且非 NaN，否则 undefined；bio/avatar 仅保留字符串，否则 undefined；points 非数字或 NaN → 0；token/serverUrl 统一 `String(...)`，绝不出现 null/undefined。
  - `saveSession` 位于 `src/services/authApi.ts` L37-L41：写入前先 `safeSession(session)` 规整，再入 sessionCache 与 AsyncStorage。
  - `loadSession` 位于 `src/services/authApi.ts` L49-L73：内部独立 try/catch 包 `JSON.parse(raw)`；parse 异常立即 `removeItem(SESSION_KEY)` 并 return null；成功后校验"对象 + 存在 username 字段 + username 为字符串"，任一不满足则 removeItem 并 return null；外层读取异常也兜底 removeItem。

## Task 2: 资源仓库 resourceLibrary / 操作日志 userLogs 存储 API (R6, R9)
- **Status**: completed
- **Priority**: high
- **Depends On**: Task 1
- **覆盖 AC**: AC-R4, AC-R5
- **Task-local Test Requirements**:
  - TR-R6-1 (rule): storage.saveCommunityResource('character', {...}) 后，storage.getCommunityResources('character') 能返回对应条目。
  - TR-R6-2 (rule): resourceLibrary.type 枚举只能是 character / worldbook / regex / css，其他类型写入时抛错或被 reject。
  - TR-R9-1 (rule): appendUserLog({type:'download', target:{kind:'character',id:'x',name:'n'}, meta:{price:0}}) 后 listUserLogs 的结果中存在相同 type + target.id。
  - TR-R9-2 (rule): 日志写入 1000 条不会重复或丢失（append 幂等：同 ts 只写一次，不用 hash 合并，只做追加）。
  - TR-R9-3 (rubric 0-2, ≥1.4): 读写性能：1000 条 list < 80ms；损坏 JSON 文件能自动重置为 [] 且打 ErrorBoundary console.error。
- **改动文件**（预计）：`src/utils/storage.ts`，可能新增 `src/types/index.ts` 中 `CommunityResourceEntry / UserLogEntry` 类型。
- **完成证据**: 新增类型 CommunityResourceEntry/UserLogEntry；storage 增加 6 个公开方法；type 超范围时报错；损坏 JSON 自动重置 []；日志 5000 条尾截断。

## Task 3: 三大资源模块补全导入导出 UI + 逻辑 (R3, R4, R5)
- **Status**: pending
- **Priority**: high
- **Depends On**: Task 2（只依赖存储 API 而不是资源打 bundle；先把结构/去重/ActionSheet 逻辑做通，图片 bundle 后面 Task 5 再接）
- **覆盖 AC**: AC-R3, Rb-1
- **Task-local Test Requirements**:
  - TR-R3-1 (rule): WorldBookScreen 长按至少包含"复制到剪贴板"项；顶部菜单包含"粘贴导入"。
  - TR-R4-1 (rule): ChatSettingsPanel 顶部 regex 节横条存在"单条/全部导出" + "文件/剪贴板导入"4 按钮或等价 ActionSheet 入口（单条也可通过每条 ⋮ 出现），并能生成 `format:'aitavern:regex:1'` 的 JSON。
  - TR-R4-2 (rule): 同 id 同 pattern 导入时 ActionSheet 显示三种策略：跳过 / 覆盖 / 重命名保留两份（生成新 id）。
  - TR-R5-1 (rule): ChatSettingsPanel CSS 节同上述 4 按钮，生成 `format:'aitavern:css:1'`。
  - TR-R5-2 (rule): CSS scope='global' 导入条目 >3 条时弹警告 alert。
  - TR-R5-3 (rubric 0-2, ≥1.2): 三类资源的 UI 一致性：标题字重、按钮颜色、横条布局完全相同（截图 diff 或组件类名比较）。
- **改动文件**（预计）：`src/screens/WorldBookScreen.tsx`，`src/screens/ChatSettingsPanel.tsx`。可提取共享组件 `ResourceImportExportBar.tsx` 供后两者复用。
- **完成证据**: 新增类型 CommunityResourceEntry/UserLogEntry；storage 增加 6 个公开方法；type 超范围时报错；损坏 JSON 自动重置 []；日志 5000 条尾截断。

## Task 4: 社区资源入库链路 & resourceLibrary 标记 & 操作日志记录 (R6 + R9 的调用方)
- **Status**: pending
- **Priority**: high
- **Depends On**: Task 2
- **覆盖 AC**: AC-R4, AC-R5
- **Task-local Test Requirements**:
  - TR-R4-1 (rule): CommunityScreen PostDetailModal 的 onSaveCharacterFromCard 成功后，getCommunityResources('character') 中对应 resourceId 能查到，source='community-purchase' 或 'community-download'（视走的入口而定）。
  - TR-R4-2 (rule): 上述过程不产生 `FileSystem.documentDirectory + /characters/*.card.json` 文件；写文件只允许通过 storage 内置 internal/ 路径（storage 自己的 internal）。
  - TR-R4-3 (rule): 同一次 download/purchase 后 userLogs 能匹配到一条 type='download' 或 type='purchase'、target.kind='character' 的记录。
  - TR-R4-4 (rubric 0-2, ≥1.4): 失败回滚：故意写一个坏卡（缺 name），saveCharacter 抛异常后 resourceLibrary 与 userLogs 不留下半截脏数据。
- **改动文件**（预计）：`src/screens/CommunityScreen.tsx`，若 `storage.saveCharacters` 内部还需要再走一层封装则同步改 `utils/storage.ts` 中新增 `saveCommunityCharacterCard(payload)` helper。
- **完成证据**: 新增类型 CommunityResourceEntry/UserLogEntry；storage 增加 6 个公开方法；type 超范围时报错；损坏 JSON 自动重置 []；日志 5000 条尾截断。

## Task 5: 图片 bundle 打包 / 解包 (R7)
- **Status**: pending
- **Priority**: high
- **Depends On**: Task 2, Task 3
- **覆盖 AC**: AC-R7, Rb-3
- **Task-local Test Requirements**:
  - TR-R7-1 (rule): packAssets 对一个字符对象含 avatar 本地路径的输出，顶层 `assets` 字段存在 ≥1 项，或原 avatar 被替换为 data:image/...;base64,... 字符串（实现二选一并统一）。
  - TR-R7-2 (rule): unpackAssets(packAssets(obj)) 返回的对象中，avatar 字段可被 Image 组件正常渲染（在 RN 里写个 Demo 渲染不抛错）。
  - TR-R7-3 (rule): 2MB 图片调用 packAssets 时通过 Alert.alert/toast 给警告（不 throw）。
  - TR-R7-4 (rule): 导入失败（比如中途读坏 assets 文件）时已经写过的 resources/ 目录新文件通过撤销列表全部删除，不留孤儿文件。
  - TR-R7-5 (rubric 0-2, ≥1.2): 正常使用场景下 1024*1024 PNG 封面图：导出 ≤ 1.2s、导入 ≤ 1.8s（连续测 10 次，取中位数）。
- **改动文件**（预计）：`src/services/exportService.ts`（新增 pack/unpack 函数 + helpers），可能新增 `src/utils/dataUriUtils.ts`。
- **完成证据**: 新增类型 CommunityResourceEntry/UserLogEntry；storage 增加 6 个公开方法；type 超范围时报错；损坏 JSON 自动重置 []；日志 5000 条尾截断。

## Task 6: 云同步分层过滤（R8）
- **Status**: pending
- **Priority**: medium
- **Depends On**: Task 2, Task 4, Task 5
- **覆盖 AC**: AC-R6, Rb-2
- **Task-local Test Requirements**:
  - TR-R8-1 (rule): exportAll 产物 characters/worldBooks/regexRules/cssEntries 数组中，凡被 resourceLibrary 打了 isCommunityOwned=true 的条目都被过滤。
  - TR-R8-2 (rule): 当 character 的 userModified=true 且 isCommunityOwned=true 时，**仍被导出**（衍生作品规则）。
  - TR-R8-3 (rule): FullBackup 顶层 `_meta` 对象存在字段 `skippedCommunityResourceCount: number`（整数）。
  - TR-R8-4 (rubric 0-2, ≥1.2): 控制台日志 `[cloud-sync] 跳过 N 条社区副本` 存在；云端 restore 后写回的资源带 `source:'cloud-restore'` 标记。
- **改动文件**（预计）：`src/services/backupService.ts`。
- **完成证据**: 新增类型 CommunityResourceEntry/UserLogEntry；storage 增加 6 个公开方法；type 超范围时报错；损坏 JSON 自动重置 []；日志 5000 条尾截断。

## Task 7: 用户头像三入口统一设置 (R10)
- **Status**: completed
- **Priority**: high
- **Depends On**: Task 2（日志写入依赖 storage.appendUserLog）
- **覆盖 AC**: AC-R8
- **Task-local Test Requirements**:
  - TR-R10-1 (rule): LeftDrawerContent 点头像 → ActionSheet 三条：从相册选择 / 拍照 / 移除头像。
  - TR-R10-2 (rule): ProfileScreen 点头像、UserSettingsScreen 点头像都能触发相同 ActionSheet 行为。
  - TR-R10-3 (rule): 选图后 authApi.getCurrentSession().avatar 为 file:// 非空字符串；app 重启后 avatar 仍然非空。
  - TR-R10-4 (rule): 成功换头像后 listUserLogs 命中 type='avatar-change' 记录。
  - TR-R10-5 (rubric 0-2, ≥1.4): 三界面头像预览尺寸与圆角一致（代码中可统一用 Avatar 子组件 <UserAvatar/>）。
- **改动文件**（预计）：`src/screens/LeftDrawerContent.tsx`，`src/screens/ProfileScreen.tsx`，`src/screens/UserSettingsScreen.tsx`，可新增 `src/components/UserAvatar.tsx` 共享组件避免重复。
- **完成证据**: 新增 UserAvatar 组件（相册/拍照/移除三入口，记录 avatar-change 日志）；LeftDrawerContent/ProfileScreen/UserSettingsScreen 三处头像区全部替换为 UserAvatar 统一组件；authApi+AppContext 双写后重启仍保留。

## Task 8: 图标风格统一（Ionicons outline）+ Icons.tsx 新增封装 (R11)
- **Status**: completed
- **Priority**: high
- **Depends On**: 无
- **覆盖 AC**: AC-R9
- **Task-local Test Requirements**:
  - TR-R11-1 (rule): LeftDrawerContent.tsx MenuItem 图标实现中，三枚 emoji `🏘️` `📥` `👤` 全部删除，换成 Icons 命名函数（Ionicons outline）。
  - TR-R11-2 (rule): Icons.tsx 新增至少 `IconCommunity`（社区） 作为命名导出，统一尺寸 18 outline。
  - TR-R11-3 (rubric 0-2, ≥1.2): 左抽屉所有入口图标在色彩、线宽、视觉密度上肉眼对齐（给前后截图对比）。
- **改动文件**（预计）：`src/components/Icons.tsx`，`src/screens/LeftDrawerContent.tsx`，检视 `CommunityScreen.tsx`、`SettingsScreen.tsx` 图标区域。
- **完成证据**: Icons 新增 IconCommunity/IconPeople 并检查 IconImport/IconUser 存在；LeftDrawer 三入口 emoji 🏘️/📥/👤 全替换为 Ionicons outline。

## Task 9: 角色选择独立全屏页 & 左菜单入口 + ChatSettingsPanel 跳转卡片 (R12)
- **Status**: pending
- **Priority**: high
- **Depends On**: Task 8（图标一致性依赖 Icons.tsx 新增角色库/people 图标命名，可同步做但不强依赖）
- **覆盖 AC**: AC-R10, Rb-4
- **Task-local Test Requirements**:
  - TR-R12-1 (rule): LeftDrawerContent 菜单 Tab 新增"角色库"条目（图标 Ionicons people-outline）。
  - TR-R12-2 (rule): MainNavigator renderModalScreen 新增 case 'characterPicker' 渲染全屏页面。
  - TR-R12-3 (rule): 全屏页具备：搜索框、收藏优先排序、头像/描述/标签预览、当前对话绑定高亮（picker 模式下）、返回后自动调 updateChat.characterId。
  - TR-R12-4 (rule): ChatSettingsPanel 原本的"角色选择"横向列表替换为跳转卡片：显示当前角色名 + 头像 + 按钮"去角色库选择"。
  - TR-R12-5 (rubric 0-2, ≥1.4): 角色库全屏页在 character >= 100 条时使用 FlatList + 性能参数（removeClippedSubviews/windowSize 与 ChatScreen 一致），滚动帧率肉眼稳定 ≥ 50 fps（快速滑动 10s 不丢帧）。
- **改动文件**（预计）：`src/screens/CharacterBrowserScreen.tsx`（加 mode='picker'）或新建 `CharacterPickerScreen.tsx`；`src/navigation/MainNavigator.tsx`；`src/screens/ChatSettingsPanel.tsx`；`src/screens/LeftDrawerContent.tsx`。
- **完成证据**: 新增类型 CommunityResourceEntry/UserLogEntry；storage 增加 6 个公开方法；type 超范围时报错；损坏 JSON 自动重置 []；日志 5000 条尾截断。

## Task 10: 端到端回归与 TypeScript 0 error 检查 (R13)
- **Status**: pending
- **Priority**: medium
- **Depends On**: Task 1 ~ Task 9 全部 completed
- **覆盖 AC**: 所有 AC 的最终回归
- **Task-local Test Requirements**:
  - TR-TS-1 (rule): `npx tsc --noEmit` 在项目根运行输出 0 error。
  - TR-TS-2 (rule): 故意点通 10 条核心用户路径（启动→登录→进社区→下载角色→导入世界书→改头像→进角色库→选角色→发 3 条消息→云同步），不抛白屏 / 红屏 / 黄三角。
  - TR-TS-3 (rubric 0-2, ≥1.4): ErrorBoundary 捕获次数 = 0（10 条路径执行后）。
- **改动文件**（预计）：0~2 个文件，用于修 TS 错 / 修边界崩溃。
- **完成证据**: 新增类型 CommunityResourceEntry/UserLogEntry；storage 增加 6 个公开方法；type 超范围时报错；损坏 JSON 自动重置 []；日志 5000 条尾截断。
