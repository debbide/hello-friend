/**
 * 后端 API 客户端 - 连接 TG Bot 后端
 */

// 获取后端 API 地址
function getBackendUrl(): string {
  // 优先使用环境变量
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  // 开发模式下使用 localhost
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }

  // 生产环境下使用空字符串（同源部署，endpoint 已包含 /api）
  return '';
}

const BACKEND_URL = getBackendUrl();

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `${BACKEND_URL}${endpoint}`;

    // 自动附加 Authorization header
    const token = localStorage.getItem('bot_admin_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    // 直接返回后端的响应格式（后端已包含 success/data/error）
    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    // 如果后端返回了 success 字段，直接透传
    if ('success' in data) {
      return data;
    }

    // 兼容没有 success 字段的响应
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// ==================== Settings API ====================

export interface BotSettings {
  botToken?: string;
  adminId?: string;
  groupId?: string;
  tgApiBase?: string;
  webPort?: number;
  logLevel?: string;
  autoStart?: boolean;
  notifications?: boolean;
  // AI 配置
  ai?: {
    providerType?: 'official' | 'thirdparty';
    apiKey?: string;
    apiUrl?: string;
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    streamEnabled?: boolean;
  };
}

export const settingsApi = {
  async get(): Promise<ApiResponse<BotSettings>> {
    return request<BotSettings>('/api/settings');
  },

  async update(settings: Partial<BotSettings>): Promise<ApiResponse<{ success: boolean }>> {
    return request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },
};

// ==================== Status API ====================

export interface BotStatus {
  running: boolean;
  configured: boolean;
  subscriptions: number;
}

export const statusApi = {
  async get(): Promise<ApiResponse<BotStatus>> {
    return request<BotStatus>('/api/status');
  },

  async restart(): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return request('/api/restart', { method: 'POST' });
  },

  async health(): Promise<ApiResponse<{ status: string; botRunning: boolean; timestamp: string }>> {
    return request('/health');
  },
};

// ==================== Subscriptions API ====================

export interface Subscription {
  id: string;
  url: string;
  title: string;
  interval: number;
  enabled: boolean;
  chatId?: string;
  userId?: string;
  keywords?: {
    whitelist: string[];
    blacklist: string[];
  };
  lastCheck?: string;
  lastError?: string;
  createdAt?: string;
}

export const subscriptionsApi = {
  async list(): Promise<ApiResponse<Subscription[]>> {
    return request<Subscription[]>('/api/subscriptions');
  },

  async create(subscription: Partial<Subscription>): Promise<ApiResponse<Subscription>> {
    return request('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });
  },

  async update(id: string, updates: Partial<Subscription>): Promise<ApiResponse<Subscription>> {
    return request(`/api/subscriptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return request(`/api/subscriptions/${id}`, { method: 'DELETE' });
  },

  async refresh(id?: string): Promise<ApiResponse<{ success: boolean }>> {
    const endpoint = id ? `/api/subscriptions/${id}/refresh` : '/api/subscriptions/refresh';
    return request(endpoint, { method: 'POST' });
  },
};

// ==================== RSS Parse API ====================

export interface ParseResult {
  success: boolean;
  title?: string;
  items?: Array<{
    id: string;
    title: string;
    link: string;
    description?: string;
    pubDate: string;
  }>;
  error?: string;
}

export const rssParseApi = {
  async parse(url: string, keywords?: { whitelist?: string[]; blacklist?: string[] }): Promise<ApiResponse<ParseResult>> {
    return request('/api/rss/parse', {
      method: 'POST',
      body: JSON.stringify({ url, keywords }),
    });
  },

  async validate(url: string): Promise<ApiResponse<{ valid: boolean; title?: string; error?: string }>> {
    return request('/api/rss/validate', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },
};

// ==================== History API ====================

export interface HistoryItem {
  feedId: string;
  feedTitle: string;
  item: {
    id: string;
    title: string;
    link: string;
    description?: string;
    pubDate: string;
  };
  foundAt: string;
}

export const historyApi = {
  async get(): Promise<ApiResponse<HistoryItem[]>> {
    return request<HistoryItem[]>('/api/subscriptions/history');
  },
};

// ==================== Logs API ====================

export interface LogEntry {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  source: string;
}

export const logsApi = {
  async get(limit?: number): Promise<ApiResponse<LogEntry[]>> {
    const query = limit ? `?limit=${limit}` : '';
    return request<LogEntry[]>(`/api/logs${query}`);
  },

  async clear(): Promise<ApiResponse<{ success: boolean }>> {
    return request('/api/logs', { method: 'DELETE' });
  },
};

// ==================== Message API ====================

export const messageApi = {
  async send(chatId: string, text: string): Promise<ApiResponse<{ success: boolean; messageId?: number }>> {
    return request('/api/send', {
      method: 'POST',
      body: JSON.stringify({ chatId, text }),
    });
  },

  async sendToAdmin(text: string): Promise<ApiResponse<{ success: boolean; messageId?: number }>> {
    return request('/api/send/admin', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },
};

// ==================== Stats API ====================

export interface DashboardStats {
  online: boolean;
  uptime: string;
  memory: number;
  lastRestart: string;
  totalCommands: number;
  commandsToday: number;
  aiTokensUsed: number;
  rssFeeds: number;
  pendingReminders: number;
  activeNotes: number;
  commandStats?: Array<{
    command: string;
    label: string;
    count: number;
    icon: string;
  }>;
  commandTrend?: Array<{
    date: string;
    chat: number;
    rss: number;
    tools: number;
  }>;
  recentActivity?: Array<{
    id: string;
    type: string;
    description: string;
    time: string;
    icon: string;
  }>;
}

export const statsApi = {
  async get(): Promise<ApiResponse<DashboardStats>> {
    return request<DashboardStats>('/api/stats');
  },
};

// ==================== Notes API ====================

export interface Note {
  id: string;
  content: string;
  createdAt: string;
  completed: boolean;
}

export const notesApi = {
  async list(): Promise<ApiResponse<Note[]>> {
    return request<Note[]>('/api/notes');
  },

  async create(content: string): Promise<ApiResponse<Note>> {
    return request('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  async update(id: string, updates: Partial<Note>): Promise<ApiResponse<Note>> {
    return request(`/api/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return request(`/api/notes/${id}`, { method: 'DELETE' });
  },
};

// ==================== Reminders API ====================

export interface Reminder {
  id: string;
  content: string;
  triggerAt: string;
  repeat?: 'once' | 'daily' | 'weekly';
  status: 'pending' | 'triggered' | 'cancelled';
}

export const remindersApi = {
  async list(): Promise<ApiResponse<Reminder[]>> {
    return request<Reminder[]>('/api/reminders');
  },

  async create(reminder: Partial<Reminder>): Promise<ApiResponse<Reminder>> {
    return request('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(reminder),
    });
  },

  async update(id: string, updates: Partial<Reminder>): Promise<ApiResponse<Reminder>> {
    return request(`/api/reminders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async delete(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return request(`/api/reminders/${id}`, { method: 'DELETE' });
  },
};

// ==================== Notifications API ====================

export interface Notification {
  id: string;
  type: 'reminder' | 'rss' | 'system' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export const notificationsApi = {
  async list(): Promise<ApiResponse<Notification[]>> {
    return request<Notification[]>('/api/notifications');
  },

  async markAsRead(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return request(`/api/notifications/${id}/read`, { method: 'POST' });
  },

  async markAllRead(): Promise<ApiResponse<{ success: boolean }>> {
    return request('/api/notifications/read-all', { method: 'POST' });
  },

  async delete(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return request(`/api/notifications/${id}`, { method: 'DELETE' });
  },

  async clear(): Promise<ApiResponse<{ success: boolean }>> {
    return request('/api/notifications', { method: 'DELETE' });
  },

  async sendTest(): Promise<ApiResponse<{ success: boolean }>> {
    return request('/api/notifications/test', { method: 'POST' });
  },
};

// ==================== Tools API ====================

export interface Tool {
  id: string;
  command: string;
  label: string;
  description: string;
  emoji: string;
  enabled: boolean;
  usage: number;
}

export const toolsApi = {
  async list(): Promise<ApiResponse<Tool[]>> {
    return request<Tool[]>('/api/tools');
  },

  async toggle(id: string, enabled: boolean): Promise<ApiResponse<Tool>> {
    return request(`/api/tools/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  },

  async getStats(): Promise<ApiResponse<Array<{ command: string; count: number }>>> {
    return request('/api/tools/stats');
  },
};

// ==================== Auth API ====================

export interface AuthUser {
  username: string;
  isAdmin: boolean;
}

export const authApi = {
  async login(username: string, password: string): Promise<ApiResponse<{ token: string; user: AuthUser }>> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async logout(): Promise<ApiResponse<{ success: boolean }>> {
    return request('/api/auth/logout', { method: 'POST' });
  },

  async verify(): Promise<ApiResponse<{ valid: boolean; user?: AuthUser }>> {
    return request('/api/auth/verify');
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse<{ success: boolean }>> {
    return request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },
};

// ==================== WebSocket URL ====================

export function getWebSocketUrl(): string {
  const backendUrl = getBackendUrl();
  return backendUrl.replace(/^http/, 'ws') + '/ws';
}

export default {
  settings: settingsApi,
  status: statusApi,
  subscriptions: subscriptionsApi,
  rssParse: rssParseApi,
  history: historyApi,
  logs: logsApi,
  message: messageApi,
  stats: statsApi,
  notes: notesApi,
  reminders: remindersApi,
  notifications: notificationsApi,
  tools: toolsApi,
  auth: authApi,
};
