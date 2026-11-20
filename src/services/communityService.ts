// 社区 API 服务
// 服务器地址 - 可在设置中修改，默认使用局域网地址
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_SERVER_URL = 'http://192.168.1.6:3000';
const SERVER_URL_KEY = 'aitavern_server_url';

class CommunityService {
  private baseUrl = DEFAULT_SERVER_URL;
  private token: string | null = null;
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const saved = await AsyncStorage.getItem(SERVER_URL_KEY);
      if (saved) {
        this.baseUrl = saved.replace(/\/$/, '');
      }
      const token = await AsyncStorage.getItem('community_token');
      if (token) {
        this.token = token;
      }
    } catch {
      // ignore
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      AsyncStorage.setItem('community_token', token).catch(() => {});
    } else {
      AsyncStorage.removeItem('community_token').catch(() => {});
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
    await AsyncStorage.setItem(SERVER_URL_KEY, this.baseUrl);
  }

  private async request(path: string, options: any = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers: any = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const text = await response.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_parseErr: any) {
        if (!response.ok) {
          throw new Error(`服务器返回异常 (HTTP ${response.status})：请检查社区服务器地址是否正确，或稍后重试`);
        }
        throw new Error(`服务器返回格式错误：无法解析响应内容，请检查社区服务器地址设置`);
      }
      if (!response.ok) {
        const msg = typeof data === 'object' && data ? (data.error || data.message || JSON.stringify(data).slice(0, 80)) : `请求失败: ${response.status}`;
        throw new Error(msg);
      }
      return data;
    } catch (err: any) {
      const m = (err?.message || '').toString();
      if (m.includes('Unexpected token') || m.includes('not valid JSON') || m.includes('JSON')) {
        throw new Error('服务器返回内容格式错误：请确认"个人资料/用户设置"中填写的社区服务器地址可用（应为 http(s)://host:3000 形式）');
      }
      if (m.includes('fetch failed') || m.includes('Failed to connect') || m.includes('Network request failed') || m.includes('Unable to resolve') || m.includes('ECONNREFUSED')) {
        throw new Error('无法连接到社区服务器：请检查网络，或在"用户设置"中修改服务器地址');
      }
      throw new Error(m || '网络请求失败');
    }
  }

  // ============ 认证 ============
  async register(username: string, password: string, nickname?: string) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: { username, password, nickname },
    });
  }

  async login(username: string, password: string) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    if (data.token) this.setToken(data.token);
    return data;
  }

  logout() {
    this.setToken(null);
  }

  async getProfile() {
    return this.request('/api/user/profile');
  }

  async updateProfile(data: { nickname?: string; bio?: string; avatar?: string }) {
    return this.request('/api/user/profile', {
      method: 'PUT',
      body: data,
    });
  }

  // ============ 帖子 ============
  async getPosts(params?: { type?: string; tag?: string; sort?: string; authorId?: string; userId?: string }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/api/posts?${query}`);
  }

  async getPost(id: string) {
    return this.request(`/api/posts/${id}`);
  }

  async createPost(data: { title: string; content: string; type?: string; tags?: string[]; cardData?: any }) {
    return this.request('/api/posts', {
      method: 'POST',
      body: data,
    });
  }

  async likePost(id: string) {
    return this.request(`/api/posts/${id}/like`, {
      method: 'POST',
    });
  }

  async commentPost(id: string, content: string) {
    return this.request(`/api/posts/${id}/comments`, {
      method: 'POST',
      body: { content },
    });
  }

  async deletePost(id: string) {
    return this.request(`/api/posts/${id}`, {
      method: 'DELETE',
    });
  }

  // ============ 排行榜 ============
  async getRankings(sortBy: string = 'score') {
    return this.request(`/api/rankings?sortBy=${sortBy}`);
  }

  // ============ 对话卡片 ============
  async exportCard(data: { title: string; content: string; author?: string; hideWorldBook?: boolean; hideSystemPrompt?: boolean; cardData?: any }) {
    return this.request('/api/cards', {
      method: 'POST',
      body: data,
    });
  }

  /** 一站式发布角色卡：先建卡片文件（含完整 cardData），再登记索引（含价格/封面/简介） */
  async createCardWithIndex(payload: {
    title: string;
    content: string;
    author?: string;
    cardData?: any;
    price?: number;
    summary?: string;
    tags?: string[];
    cover?: string;
  }): Promise<{ card: any; index: any }> {
    const card = await this.request('/api/cards', {
      method: 'POST',
      body: {
        title: payload.title,
        content: payload.content,
        author: payload.author,
        cardData: payload.cardData,
      },
    });
    const index = await this.upsertCardIndex(card.id, {
      price: payload.price,
      name: payload.title,
      summary: payload.summary,
      tags: payload.tags,
      cover: payload.cover,
    });
    return { card, index };
  }

  async testConnection() {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ============ 管理员接口 ============

  async adminListUsers() {
    return this.request('/api/admin/users');
  }

  async adminDeleteUser(userId: string) {
    return this.request(`/api/admin/users/${userId}`, { method: 'DELETE' });
  }

  async adminSetUserRole(userId: string, isAdmin: boolean) {
    return this.request(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin }),
    });
  }

  async adminGetStats() {
    return this.request('/api/admin/stats');
  }

  async adminListPosts() {
    return this.request('/api/admin/posts');
  }

  async adminDeletePost(postId: string) {
    return this.request(`/api/admin/posts/${postId}`, { method: 'DELETE' });
  }

  // ============ 修改密码 ============
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.request('/api/auth/change-password', {
      method: 'POST',
      body: { oldPassword, newPassword },
    });
  }

  // ============ 用户数据 ============

  // 上传用户数据文件（.json），整体覆盖服务器上的用户数据
  async uploadUserDataFile(file: { uri: string; name: string; type: string }): Promise<{ success: boolean; size: number }> {
    const url = `${this.baseUrl}/api/user/upload-data`;
    const formData = new FormData();
    formData.append('file', file as any);
    const headers: any = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '上传失败');
    return data;
  }

  // 获取服务器上的用户数据
  async getUserData(): Promise<any> {
    return this.request('/api/user/data');
  }

  // 按 UID 查询用户公开信息
  async getUserByUid(uid: number | string): Promise<any> {
    return this.request(`/api/users/${uid}`);
  }

  // ============ 好友系统 ============

  // 获取我的好友列表
  async getFriends(): Promise<any[]> {
    return this.request('/api/friends');
  }

  // 发送好友申请
  async sendFriendRequest(toUid: number | string, message?: string): Promise<any> {
    return this.request('/api/friends/requests', {
      method: 'POST',
      body: { toUid, message },
    });
  }

  // 获取我的好友申请（incoming + outgoing）
  async getFriendRequests(): Promise<{ incoming: any[]; outgoing: any[] }> {
    return this.request('/api/friends/requests');
  }

  // 接受好友申请
  async acceptFriendRequest(requestId: string): Promise<any> {
    return this.request(`/api/friends/requests/${requestId}/accept`, { method: 'POST' });
  }

  // 拒绝好友申请
  async rejectFriendRequest(requestId: string): Promise<any> {
    return this.request(`/api/friends/requests/${requestId}/reject`, { method: 'POST' });
  }

  // 删除好友
  async removeFriend(uid: number | string): Promise<any> {
    return this.request(`/api/friends/${uid}`, { method: 'DELETE' });
  }

  // ============ 积分 & 签到 ============
  async checkIn(): Promise<any> {
    return this.request('/api/user/checkin', { method: 'POST', body: {} });
  }
  async getCheckInStatus(): Promise<any> {
    return this.request('/api/user/checkin');
  }
  async getPoints(): Promise<{ points: number }> {
    return this.request('/api/user/points');
  }

  // ============ 关注 ============
  async follow(authorUid: number | string): Promise<{ followed: boolean }> {
    return this.request(`/api/follows/${authorUid}`, {
      method: 'POST',
      body: { action: 'follow' },
    });
  }
  async unfollow(authorUid: number | string): Promise<{ followed: boolean }> {
    return this.request(`/api/follows/${authorUid}`, {
      method: 'POST',
      body: { action: 'unfollow' },
    });
  }
  async isFollowing(authorUid: number | string): Promise<{ isFollowing: boolean }> {
    return this.request(`/api/follows/${authorUid}/is-following`);
  }
  async getFollowing(): Promise<any[]> {
    return this.request('/api/follows/following');
  }
  async getFollowers(): Promise<any[]> {
    return this.request('/api/follows/followers');
  }

  // ============ 角色卡（作者/下载量/价格/购买/下载） ============
  /** 创建或更新角色卡索引，同时设置价格、封面、简介等 */
  async upsertCardIndex(
    cardId: string,
    payload: { price?: number; name?: string; summary?: string; tags?: string[]; cover?: string },
  ): Promise<any> {
    return this.request(`/api/cards/${cardId}/index`, {
      method: 'POST',
      body: payload,
    });
  }
  /** 角色卡列表（登录后获取，含已购状态） */
  async listCards(params?: { sort?: 'newest' | 'hot' | 'priceAsc' }): Promise<any[]> {
    const q = new URLSearchParams(params as any).toString();
    return this.request(`/api/cards${q ? '?' + q : ''}`);
  }
  /** 购买角色卡（免费也走这个做登记） */
  async purchaseCard(cardId: string): Promise<any> {
    return this.request(`/api/cards/${cardId}/purchase`, {
      method: 'POST',
      body: {},
    });
  }
  /** 下载角色卡：返回 { meta, card }，card 是可直接导入的角色卡 JSON */
  async downloadCard(cardId: string): Promise<{ meta: any; card: any }> {
    return this.request(`/api/cards/${cardId}/download`);
  }
}

export const communityService = new CommunityService();
