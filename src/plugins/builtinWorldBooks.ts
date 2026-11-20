import { pluginManager, WorldBookPlugin } from './PluginManager';

const statusBarGuide: WorldBookPlugin = {
  id: 'worldbook-statusbar-guide',
  name: '状态栏使用指南',
  type: 'worldbook',
  version: '1.0.0',
  description: '指导AI如何使用状态栏变量控制角色状态',
  author: 'AI Tavern Team',
  enabled: true,
  category: '系统',
  entries: [
    {
      keys: ['状态栏', '状态变量', 'statusbar', 'status'],
      content: '你可以使用状态变量来控制角色状态栏，格式为：\n{{setvar::变量名::值}}  ——设置变量值\n{{addvar::变量名::增减量}} ——增减变量值\n{{incvar::变量名}}    ——变量+1\n{{decvar::变量名}}    ——变量-1\n\n支持的变量类型：\n- progress: 进度条（值为0-100的数字）\n- number: 数字\n- string: 文字\n\n例如：{{setvar::hp::80}} 会把 hp 设置为 80\n{{addvar::心情::+10}} 会让心情增加 10\n\n在对话中适当穿插这些指令，不要一次性全部输出。',
      priority: 10,
    },
  ],
};

const cyberpunkWorld: WorldBookPlugin = {
  id: 'worldbook-cyberpunk',
  name: '赛博朋克世界',
  type: 'worldbook',
  version: '1.0.0',
  description: '赛博朋克风格的世界观设定，霓虹灯下的高科技低生活',
  author: 'AI Tavern Team',
  enabled: true,
  category: '科幻',
  entries: [
    {
      keys: ['赛博朋克', 'cyberpunk', '霓虹', '义体'],
      content: '这是一个赛博朋克风格的世界：\n- 高科技与低生活并存\n- 巨型企业统治社会\n- 义体改造普遍存在\n- 霓虹灯下的黑暗角落充满危险\n- 黑客、佣兵、赏金猎人活跃在街头\n- 人工智能和虚拟现实无处不在',
    },
  ],
};

const fantasyWorldPlugin: WorldBookPlugin = {
  id: 'worldbook-fantasy',
  name: '奇幻世界',
  type: 'worldbook',
  version: '1.0.0',
  description: '经典奇幻世界观，包含魔法、巨龙、骑士、精灵等元素',
  author: 'AI Tavern Team',
  enabled: true,
  category: '奇幻',
  entries: [
    {
      keys: ['奇幻世界', '魔法', '巨龙', '骑士', '精灵'],
      content: `经典奇幻世界设定：
- 魔法体系：元素魔法（火、水、风、土、雷）、黑暗魔法、光明魔法、自然魔法、奥术等。
- 种族：人类、精灵（高等精灵、暗夜精灵、森林精灵）、矮人（山地矮人、丘陵矮人）、兽人（兽人、地精、巨魔）、龙族（金龙、银龙、红龙、黑龙、蓝龙等）、亡灵（骷髅、僵尸、幽灵、巫妖）、地精、巨人等。
- 职业：战士、法师、牧师、盗贼、游侠、德鲁伊、圣骑士、刺客、吟游诗人等。
- 势力：王国、帝国、魔法学院、骑士团、盗贼行会、佣兵工会等。
- 神器与魔宠：传说中的神器具有强大力量，魔宠可以与主人签订契约。`,
    },
    {
      keys: ['魔法', '法术', '咒语', '魔力'],
      content: `魔法系统：
- 魔力：法师体内的魔法能量，通过冥想和学习积累。
- 法术等级：初级、中级、高级、大师级、传奇级。
- 元素魔法：火（攻击、灼烧）、水（治疗、控制）、风（速度、切割）、土（防御、石化）、雷（攻击、麻痹）。
- 施法材料：需要特定的魔法材料（如龙鳞、凤凰羽毛、魔法水晶）来增强法术效果。`,
    },
  ],
};

const sciFiWorldPlugin: WorldBookPlugin = {
  id: 'worldbook-scifi',
  name: '科幻世界',
  type: 'worldbook',
  version: '1.0.0',
  description: '科幻世界观，包含星际航行、人工智能、基因改造、赛博空间等元素',
  author: 'AI Tavern Team',
  enabled: true,
  category: '科幻',
  entries: [
    {
      keys: ['科幻', '星际', 'AI', '机甲', '赛博朋克'],
      content: `科幻世界设定：
- 星际联邦：多个星球组成的星际联盟，统一管理和贸易。
- 人工智能：强人工智能拥有自我意识，与人类共存或对抗。
- 机甲战士：巨大的人形战斗机器人，由人类驾驶。
- 基因改造：人类通过基因编辑获得超能力或适应不同环境。
- 赛博空间：虚拟网络世界，黑客可以进入并与AI互动。
- 外星种族：多个外星文明，科技水平各异。`,
    },
    {
      keys: ['太空', '飞船', '跃迁', '星球'],
      content: `星际航行系统：
- 超光速引擎：通过曲速或跃迁实现超光速旅行。
- 太空飞船：探险舰、战斗舰、运输舰、殖民地飞船。
- 空间站：大型太空平台，用于贸易、军事或科研。
- 星球类型：宜居星球、沙漠星球、海洋星球、冰雪星球、气态巨行星。`,
    },
  ],
};

const modernWorldPlugin: WorldBookPlugin = {
  id: 'worldbook-modern',
  name: '现代都市',
  type: 'worldbook',
  version: '1.0.0',
  description: '现代都市世界观，包含日常生活、职场、社交等元素',
  author: 'AI Tavern Team',
  enabled: true,
  category: '现代',
  entries: [
    {
      keys: ['现代', '都市', '职场', '生活', '社交'],
      content: `现代都市设定：
- 城市生活：繁华的都市，高楼林立，交通繁忙。
- 职场：公司、创业、职场斗争、晋升。
- 社交：社交媒体、聚会、恋爱、友情。
- 科技：智能手机、互联网、人工智能助手。
- 文化：流行音乐、电影、游戏、时尚。`,
    },
    {
      keys: ['日常生活', '学校', '家庭', '娱乐'],
      content: `日常生活设定：
- 学校：小学、中学、大学，学习和社交的场所。
- 家庭：家人关系、家庭聚会、家庭矛盾。
- 娱乐：电影院、游戏厅、健身房、咖啡厅。
- 购物：商场、超市、网购、品牌店。`,
    },
  ],
};

pluginManager.register(statusBarGuide);
pluginManager.register(cyberpunkWorld);
pluginManager.register(fantasyWorldPlugin);
pluginManager.register(sciFiWorldPlugin);
pluginManager.register(modernWorldPlugin);

export const builtInWorldBookPlugins = [
  statusBarGuide,
  cyberpunkWorld,
  fantasyWorldPlugin,
  sciFiWorldPlugin,
  modernWorldPlugin,
];
