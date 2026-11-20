# 鲵吞亭 v3.9.5 转 v3.10：资源导入导出统一 + 社区入库隔离 + UI 规范 规格说明

## 1. 问题背景
两点触发：(a) 登录截图显示 `Unexpected token ", "{   "j"... is not valid JSON` —— 3.9.5 前序已做部分 hotfix，spec 做正式规则化验收；(b) 用户要求"世界书 / 正则 / 内置 CSS 都能导入导出；社区下载/购买的角色卡写入内部存储、操作记录进基础用户文件；本地云同步只同步玩家自主内容；图片可跟导入导出；玩家头像可设置；社区/导入/个人资料入口图标与 Ionicons 风格统一；右菜单角色选择改为左菜单独立完整页面"。

项目目录：`c:\Users\jdcwm\Desktop\jj\ai-tavern-project\ai-tavern`。

## 2. 目标用户
普通玩家、社区内容创作者、云同步重度用户、服务器地址配置错后需要清晰报错的用户。

## 3. 目标
登录层异常兜底、三大资源模块导入导出统一（世界书/正则/CSS）、社区资源入库走 resourceLibrary、云同步按"玩家自主 vs 社区获取"分层、图片走 assets bundle 往返打包、三界面可设置用户头像、LeftDrawer emoji 图标换 Ionicons outline、角色选择独立全屏页。

## 4. 非目标
不做构建 APK（spec 执行完再升版本），不做 DRM/版权校验，不改云同步服务端协议、不清除 RPG 预设里 emoji（只清 UI 入口 emoji）。

## 5. 需求表
| ID | 分类 | 内容 |
|---|---|---|
| R1 | 登录崩溃兜底 | communityService.request 先 text() 再 JSON.parse，非 JSON 时提示用户友好中文，禁止把 SyntaxError 原文甩到 LoginModal。 |
| R2 | session 自愈 | authApi.loadSession 解析失败/结构损坏 → removeItem(SESSION_KEY)；saveSession 前 safeSession 字段规整。 |
| R3 | 世界书导入导出双通道 | WorldBookScreen 已有文件导入导出，再补"复制到剪贴板 / 从剪贴板粘贴导入"；封面图随 assets 打包。 |
| R4 | 正则导入导出 | ChatSettingsPanel RegexRule 区上方加横条：单条导出 / 全部导出 / 文件导入 / 剪贴板导入，格式 `{ format:'aitavern:regex:1', rules:RegexRule[] }`，同 id/name 去重冲突策略。 |
| R5 | CSS 导入导出 | ChatSettingsPanel CSSEntry 区与 R4 同 UI/同逻辑，格式 `{ format:'aitavern:css:1', entries:CSSEntry[] }`。 |
| R6 | 社区资源入库走内部仓库 | storage.ts 新增 resourceLibrary API；角色卡从社区下载后不再写公开 documentDirectory 的 *.json/*.png；resourceLibrary 记录 `{ id, resourceId, source, ownerUid?, metadata, createdAt, isCommunityOwned:true }`。 |
| R7 | 图片随 JSON 打包 | exportService 新增 `packAssets(json)` / `unpackAssets(json)`；dataURL 或 `assets[sha1]` 映射。支持 character.avatar / worldBook.coverImage / 主题 wallpaper / chatMessage.imageUri / 用户 avatar 五类。 |
| R8 | 云同步分层 | backupService.exportAll 导出时，凡与 resourceLibrary.isCommunityOwned=true 关联的 resources / characters / worldBooks / cssEntries / regexRules 都不写备份；顶层 `_meta.skippedCommunityResourceCount` 记录。玩家改过的社区资源 userModified=true 仍然同步（衍生作品）。 |
| R9 | 基础用户文件操作日志 | storage.ts 新增 `appendUserLog(entry)` / `listUserLogs()`。每次成功的 import/export/download/purchase/cloud-sync/avatar-change 都追加一条 `{ts, type, target:{kind,id,name?}, meta}`。 |
| R10 | 用户头像三入口可设置 | LeftDrawerContent 头像、ProfileScreen 头像、UserSettingsScreen 头像都可 ActionSheet 选图/拍照/移除，经 imageUtils save 到 avatars 目录，authApi.updateProfile({avatar}) + AppContext.updateCurrentUser 同步。 |
| R11 | 图标风格统一 | LeftDrawerContent 把 🏘️ 鲵吞亭社区、📥 导入对话卡片、👤 个人资料三枚 emoji 换为 Icons.tsx 对应 Ionicons outline（没对应图标的通过 Ion renderer 封装并命名导出）。SettingsScreen/CommunityScreen 图标同步检视一遍。 |
| R12 | 角色选择独立全屏页 | 新建 CharacterPicker（或 CharacterBrowserScreen 新增 mode=picker）。LeftDrawerContent 菜单 tab 新增一级条目"角色库"（Ionicons people-outline）。MainNavigator 增加路由 case。ChatSettingsPanel 原"角色选择"section 改成跳转卡片。 |
| R13 | TS 与稳健性 | tsc --noEmit 0 error；resourceLibrary / userLogs 读写 try/catch；损坏自动重置 + ErrorBoundary 日志。 |

## 6. 约束
所有持久化通过 storage.ts，不另写裸 AsyncStorage；图片采用 dataURL 打包不加依赖；图标大小统一 ICON_DEFAULT_SIZE=18；不保留两套角色选择 UI。

## 7. 开放问题默认决策
1) 操作日志本次对玩家不可见（仅写入链路完整），下一期在 ProfileScreen 我的活动 Tab 再展示。
2) 允许导出社区下载资源（不做 DRM），导出时给小字"请勿二次分发/商用"提示。
3) 角色库独立页与 CharacterBrowserScreen 复用同组件，mode='picker'/'browse' 切换行为。
4) 社区资源如果被玩家 userModified=true 主动编辑过，视为衍生作品，仍上传云端。

## 8. 验收标准
### rule
- AC-R1：communityService 对返回非 JSON 网站的登录请求，LoginModal 文案只出现中文提示，禁止出现 `Unexpected token` / `not valid JSON`。
- AC-R2：向 AsyncStorage 写入 `aitavern_session="hello world"` 脏数据，重启不白屏，getCurrentSession() 返回 null 且 key 被 remove。
- AC-R3：WorldBook / 正则 / CSS 三类资源各自的管理界面都存在导入/导出可见按钮。
- AC-R4：社区下载角色卡后，documentDirectory 下可浏览的 `characters/*.card.json` `*_avatar.png` 公开文件都不存在。
- AC-R5：社区下载后 storage.listUserLogs 有 type=download/purchase 的记录。
- AC-R6：构造两个角色（一条社区获取、一条玩家自建），backupService.exportAll 的产物中 characters 数组不包含 isCommunityOwned=true 的那一条。
- AC-R7：导出一张含 avatar 的 character → 清空 app 导入后 `<Image source={{uri}}>` 能正常渲染。
- AC-R8：三个界面（左抽屉/Profile/UserSettings）点头像都能弹 ActionSheet 并成功选图保存后重启仍显示。
- AC-R9：LeftDrawerContent.tsx Grep 不到字符串 `🏘️` / `📥` / `👤` 三个 emoji（图标区）。
- AC-R10：LeftDrawer 菜单 Tab 有"角色库"条目；MainNavigator 能打开 characterPicker 全屏；ChatSettingsPanel 角色选择 section 点按钮后能跳转全屏并回写。

### rubric（阈值 1.2）
- Rb-1 资源导入导出一致性：0=三类 UI 完全不一致；1=至少 2/3 类一致；2=三类"单条导出/全部导出/文件导入/剪贴板导入"四按钮横条 UI 完全一致，且每条记录 ActionSheet 有单条导出。
- Rb-2 云同步分层清晰度：0=仍把社区资源打包或无 _meta 字段；1=isCommunityOwned 生效但 userModified 分支缺失；2=isCommunityOwned + userModified 双字段齐全，导出日志打印跳过数量。
- Rb-3 图片打包稳健性：0=大图片崩溃或截断；1=1MB 以下往返 OK，>=2MB 无警告但能用；2=往返 OK，>=2MB 警告，导入失败自动回滚半截 assets 文件。
- Rb-4 角色库全屏页可用性：0=仍在右抽屉半屏里；1=能跳转全屏但缺搜索/收藏置顶；2=头像描述标签预览齐全、搜索/收藏置顶/当前对话绑定高亮/从 ChatSettingsPanel 来回跳转都正确。