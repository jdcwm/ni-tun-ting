import AsyncStorage from '@react-native-async-storage/async-storage';
import { communityService } from './communityService';

const SESSION_KEY = 'aitavern_session';
const PROFILE_KEY = 'aitavern_profile';

interface Session {
  username: string;
  nickname: string;
  isGuest: boolean;
  isAdmin: boolean;
  uid?: number;
  bio?: string;
  avatar?: string;
  points?: number;
  token: string;
  serverUrl: string;
}

let sessionCache: Session | null = null;

const safeSession = (s: Session): Session => ({
  username: typeof s.username === 'string' ? s.username : '',
  nickname: typeof s.nickname === 'string' ? s.nickname : s.username || '',
  isGuest: !!s.isGuest,
  isAdmin: !!s.isAdmin,
  uid: typeof s.uid === 'number' ? s.uid : undefined,
  bio: typeof s.bio === 'string' ? s.bio : undefined,
  avatar: typeof s.avatar === 'string' ? s.avatar : undefined,
  points: typeof s.points === 'number' ? s.points : 0,
  token: typeof s.token === 'string' ? s.token : '',
  serverUrl: typeof s.serverUrl === 'string' ? s.serverUrl : '',
});
const saveSession = async (session: Session) => {
  const safe = safeSession(session);
  sessionCache = safe;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(safe));
};

const clearSession = async () => {
  sessionCache = null;
  await AsyncStorage.removeItem(SESSION_KEY);
  await AsyncStorage.removeItem(PROFILE_KEY);
};

const loadSession = async (): Promise<Session | null> => {
  if (sessionCache) return sessionCache;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && typeof parsed.username === 'string') {
        sessionCache = parsed as Session;
        return sessionCache;
      }
      // 结构损坏：清掉，避免启动后用脏数据渲染
      await AsyncStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // JSON 解析失败：清理损坏内容
    try { await AsyncStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
  sessionCache = null;
  return null;
};

export interface AuthResult {
  username: string;
  nickname: string;
  isAdmin: boolean;
  isGuest: boolean;
  uid?: number;
  bio?: string;
  avatar?: string;
  points?: number;
}

export const authApi = {
  /**
   * 登录 - 优先服务器，失败则本地
   */
  async login(username: string, password: string): Promise<AuthResult> {
    const trimmed = username.trim();
    if (!trimmed) throw new Error('用户名不能为空');
    if (!password) throw new Error('密码不能为空');

    // 本地测试账号，仅限开发构建。
    // 用 __DEV__ 兜住：release APK 里 __DEV__ 恒为 false，整个分支会被打掉，
    // 拿到发布包的人无法用 111/0000 拿到 isAdmin 权限。
    if (__DEV__ && trimmed === '111' && password === '0000') {
      const session: Session = {
        username: '111',
        nickname: '测试账号（开发）',
        isGuest: false,
        isAdmin: true,
        uid: 99999,
        bio: '本地测试账号（仅开发构建可用）',
        avatar: '',
        points: 9999,
        token: 'local-fake-token-111',
        serverUrl: 'local://fake-server',
      };
      await saveSession(session);
      return {
        username: '111',
        nickname: '测试账号（开发）',
        isAdmin: true,
        isGuest: false,
        uid: 99999,
        bio: '本地测试账号（仅开发构建可用）',
        points: 9999,
      };
    }


    try {
      const result = await communityService.login(trimmed, password);
      const session: Session = {
        username: result.user.username,
        nickname: result.user.nickname || result.user.username,
        isGuest: false,
        isAdmin: !!result.user.isAdmin,
        uid: result.user.uid,
        bio: result.user.bio,
        avatar: result.user.avatar,
        points: typeof result.user.points === 'number' ? result.user.points : 0,
        token: result.token,
        serverUrl: communityService.getBaseUrl(),
      };
      await saveSession(session);
      return {
        username: session.username,
        nickname: session.nickname,
        isAdmin: session.isAdmin,
        isGuest: false,
        uid: session.uid,
        bio: session.bio,
        avatar: session.avatar,
        points: session.points,
      };
    } catch (err: any) {
      if (err.message?.includes('fetch failed') || err.message?.includes('Failed to connect') || err.message?.includes('Network')) {
        throw new Error('无法连接到服务器，请在"个人资料"中检查服务器地址设置');
      }
      throw err;
    }
  },

  /**
   * 注册
   */
  async register(username: string, password: string, nickname?: string): Promise<AuthResult> {
    const trimmed = username.trim();
    if (!trimmed) throw new Error('用户名不能为空');
    if (!password) throw new Error('密码不能为空');

    try {
      const result = await communityService.register(trimmed, password, nickname);
      const session: Session = {
        username: result.user.username,
        nickname: result.user.nickname || result.user.username,
        isGuest: false,
        isAdmin: !!result.user.isAdmin,
        uid: result.user.uid,
        bio: result.user.bio,
        avatar: result.user.avatar,
        points: typeof result.user.points === 'number' ? result.user.points : 0,
        token: result.token,
        serverUrl: communityService.getBaseUrl(),
      };
      await saveSession(session);
      return {
        username: session.username,
        nickname: session.nickname,
        isAdmin: session.isAdmin,
        isGuest: false,
        uid: session.uid,
        bio: session.bio,
        avatar: session.avatar,
        points: session.points,
      };
    } catch (err: any) {
      if (err.message?.includes('fetch failed') || err.message?.includes('Failed to connect')) {
        throw new Error('无法连接到服务器，请先在"个人资料"中设置服务器地址');
      }
      throw err;
    }
  },

  /**
   * 游客登录
   */
  async guestLogin(): Promise<AuthResult> {
    const session: Session = {
      username: 'guest',
      nickname: '游客',
      isGuest: true,
      isAdmin: false,
      token: '',
      serverUrl: communityService.getBaseUrl(),
    };
    await saveSession(session);
    return { username: 'guest', nickname: '游客', isAdmin: false, isGuest: true };
  },

  /**
   * 退出登录
   */
  async logout(): Promise<void> {
    communityService.logout();
    await clearSession();
  },

  /**
   * 获取当前会话（应用启动时调用）：恢复 communityService 的 token + 服务器地址
   */
  async getCurrentSession(): Promise<AuthResult | null> {
    const session = await loadSession();
    if (!session) return null;
    if (session.serverUrl) {
      await communityService.setBaseUrl(session.serverUrl);
    }
    if (session.token) {
      communityService.setToken(session.token);
    }
    return {
      username: session.username,
      nickname: session.nickname,
      isGuest: session.isGuest,
      isAdmin: session.isAdmin,
      uid: session.uid,
      bio: session.bio,
      avatar: session.avatar,
      points: session.points,
    };
  },

  /**
   * 更新本地会话资料（昵称/头像），可选地更新积分
   */
  async updateProfile(data: { nickname?: string; bio?: string; avatar?: string; points?: number }) {
    const session = await loadSession();
    if (!session) throw new Error('未登录');

    try {
      const { points, ...restData } = data as any;
      let serverResult: any = { ...session };
      if (Object.keys(restData).length > 0) {
        serverResult = await communityService.updateProfile(restData);
      }
      const updated: Session = {
        ...session,
        nickname: serverResult.nickname || session.nickname,
        bio: serverResult.bio ?? session.bio,
        avatar: serverResult.avatar ?? session.avatar,
        points: typeof points === 'number' ? points : session.points,
      };
      await saveSession(updated);
      return { ...serverResult, points: updated.points };
    } catch {
      const updated: Session = { ...session, ...(data as any) };
      await saveSession(updated);
      return { ...updated };
    }
  },

  /**
   * 仅更新会话里的积分（不做网络请求，避免打断UI）
   */
  async updatePoints(points: number) {
    const session = await loadSession();
    if (!session) return;
    await saveSession({ ...session, points });
  },

  /**
   * 修改密码
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    return communityService.changePassword(oldPassword, newPassword);
  },

  /**
   * 检查服务器连接状态
   */
  async checkConnection(): Promise<{ connected: boolean; serverUrl: string }> {
    const serverUrl = communityService.getBaseUrl();
    const connected = await communityService.testConnection();
    return { connected, serverUrl };
  },
};
