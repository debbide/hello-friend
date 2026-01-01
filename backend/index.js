/**
 * TG 多功能机器人 - 主入口
 * 参考 tgbot 架构 + 优化
 */
const express = require('express');
const cors = require('cors');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const { Telegraf } = require('telegraf');
const { loadSettings, saveSettings, getDataPath } = require('./settings');
const { loadCommands } = require('./commands/loader');
const RssScheduler = require('./scheduler');
const { parseRssFeed } = require('./rss-parser');
const { closeBrowser } = require('./puppeteer.service');
const storage = require('./storage');
const NodeSeekLotteryMonitor = require('./nodeseek-lottery');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

const app = express();
let currentBot = null;
let scheduler = null;
let nodeseekMonitor = null;

// Middleware
app.use(cors());
app.use(express.json());

// ==================== API 限流配置 ====================

// 通用 API 限流：每个 IP 每分钟最多 100 次请求
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 100,
  message: { success: false, error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 登录接口限流：每个 IP 每分钟最多 5 次（防暴力破解）
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 5,
  message: { success: false, error: '登录尝试过于频繁，请 1 分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 应用限流中间件
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// 静态文件服务（合并部署时使用）
const path = require('path');
const fs = require('fs');
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// ==================== Web API ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    botRunning: !!currentBot,
    timestamp: new Date().toISOString()
  });
});

// 获取设置
app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  // 隐藏敏感信息
  res.json({
    ...settings,
    botToken: settings.botToken ? '***已配置***' : '',
    openaiKey: settings.openaiKey ? '***已配置***' : '',
  });
});

// 更新设置
app.post('/api/settings', async (req, res) => {
  try {
    const currentSettings = loadSettings();
    const newSettings = { ...currentSettings, ...req.body };
    saveSettings(newSettings);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 重启 Bot
app.post('/api/restart', async (req, res) => {
  try {
    logger.info('🔄 正在重启 Bot...');

    // 停止当前 Bot
    if (currentBot) {
      scheduler?.stopAll();
      await currentBot.stop('RESTART');
      currentBot = null;
    }

    // 等待一秒再启动
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 重新启动 Bot
    await startBot();

    res.json({ success: true, message: 'Bot 重启成功' });
  } catch (error) {
    logger.error(`❌ Bot 重启失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Auth API ====================

// 默认管理员账号
const DEFAULT_ADMIN = { username: 'admin', password: 'admin' };

// 简单的 token 存储（生产环境应使用 JWT 或 session）
let authTokens = new Map();

// ==================== 认证中间件 ====================

// 不需要认证的公开接口
const publicPaths = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/verify',
  '/api/health',
];

// 认证中间件
function authMiddleware(req, res, next) {
  // 检查是否是公开接口
  if (publicPaths.includes(req.path)) {
    return next();
  }

  // 非 /api 路径不需要认证（静态文件等）
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // 从请求头获取 Token
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: '未登录，请先登录' });
  }

  const token = authHeader.replace('Bearer ', '');
  const user = authTokens.get(token);

  if (!user) {
    return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
  }

  // 将用户信息挂载到请求对象
  req.user = user;
  next();
}

// 应用认证中间件到所有路由
app.use(authMiddleware);

// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const settings = loadSettings();

  // 检查是否匹配配置的账号或默认账号
  const adminUser = settings.webUser || DEFAULT_ADMIN.username;
  const adminPass = settings.webPassword || DEFAULT_ADMIN.password;

  if (username === adminUser && password === adminPass) {
    const token = `token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    authTokens.set(token, { username, isAdmin: true });
    res.json({
      success: true,
      data: {
        token,
        user: { username, isAdmin: true }
      }
    });
  } else {
    res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
});

// 登出
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    authTokens.delete(token);
  }
  res.json({ success: true });
});

// 验证 token
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.json({ valid: false });
  }
  const token = authHeader.replace('Bearer ', '');
  const user = authTokens.get(token);
  if (user) {
    res.json({ valid: true, user });
  } else {
    res.json({ valid: false });
  }
});

// Bot 状态
app.get('/api/status', (req, res) => {
  const settings = loadSettings();
  res.json({
    running: !!currentBot,
    configured: !!settings.botToken,
    subscriptions: scheduler?.getSubscriptions()?.length || 0,
  });
});

// ==================== RSS API ====================

app.post('/api/rss/parse', async (req, res) => {
  try {
    const { url, keywords } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    const result = await parseRssFeed(url, keywords);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/rss/validate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ valid: false, error: 'URL is required' });
    }
    const result = await parseRssFeed(url);
    if (result.success) {
      res.json({ valid: true, title: result.title, itemCount: result.items?.length || 0 });
    } else {
      res.json({ valid: false, error: result.error });
    }
  } catch (error) {
    res.json({ valid: false, error: error.message });
  }
});

// 订阅管理 API
app.get('/api/subscriptions', (req, res) => {
  const subscriptions = scheduler?.getSubscriptions() || [];
  res.json({ success: true, data: subscriptions });
});

app.post('/api/subscriptions', async (req, res) => {
  try {
    const { url, title, interval, keywords, enabled, chatId } = req.body;
    const settings = loadSettings();
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    const result = await parseRssFeed(url);
    if (!result.success) {
      return res.json({ success: false, error: result.error });
    }
    const subscription = scheduler.addSubscription({
      url,
      title: title || result.title,
      interval: interval || 30,
      keywords,
      enabled: enabled !== false,
      chatId: chatId || settings.adminId, // 默认推送到管理员
    });
    res.json({ success: true, data: subscription });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/subscriptions/:id', (req, res) => {
  const subscription = scheduler.updateSubscription(req.params.id, req.body);
  if (!subscription) {
    return res.status(404).json({ success: false, error: 'Subscription not found' });
  }
  res.json({ success: true, data: subscription });
});

app.delete('/api/subscriptions/:id', (req, res) => {
  const deleted = scheduler.deleteSubscription(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Subscription not found' });
  }
  res.json({ success: true });
});

app.post('/api/subscriptions/refresh', async (req, res) => {
  await scheduler?.refreshAll();
  res.json({ success: true });
});

// Bot Token 测试 API
app.post('/api/bot/test', async (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    const token = botToken || loadSettings().botToken;

    if (!token) {
      return res.status(400).json({ success: false, error: '未提供 Bot Token' });
    }

    const testBot = new Telegraf(token);
    const botInfo = await testBot.telegram.getMe();

    // 如果提供了 chatId，发送测试消息
    if (chatId) {
      await testBot.telegram.sendMessage(chatId, `✅ 测试成功！\n\n🤖 Bot: @${botInfo.username}\n📍 目标: ${chatId}\n⏱ 时间: ${new Date().toLocaleString('zh-CN')}`);
    }

    res.json({
      success: true,
      data: {
        username: botInfo.username,
        firstName: botInfo.first_name,
        messageSent: !!chatId
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/subscriptions/:id/refresh', async (req, res) => {
  try {
    await scheduler?.refreshSubscription(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

app.get('/api/subscriptions/history', (req, res) => {
  const history = scheduler?.getNewItemsHistory() || [];
  res.json({ success: true, data: history });
});

// ==================== Message API ====================

app.post('/api/send', async (req, res) => {
  try {
    const { chatId, text } = req.body;
    if (!chatId || !text) {
      return res.status(400).json({ success: false, error: '缺少 chatId 或 text' });
    }
    if (!currentBot) {
      return res.status(503).json({ success: false, error: 'Bot 未连接' });
    }
    const result = await currentBot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    res.json({ success: true, messageId: result.message_id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send/admin', async (req, res) => {
  try {
    const { text } = req.body;
    const settings = loadSettings();
    if (!text) {
      return res.status(400).json({ success: false, error: '消息内容不能为空' });
    }
    if (!settings.adminId) {
      return res.status(400).json({ success: false, error: '未配置管理员 ID' });
    }
    if (!currentBot) {
      return res.status(503).json({ success: false, error: 'Bot 未连接' });
    }
    const result = await currentBot.telegram.sendMessage(settings.adminId, text, { parse_mode: 'HTML' });
    res.json({ success: true, messageId: result.message_id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Stats API ====================

app.get('/api/stats', (req, res) => {
  const stats = storage.getStats();
  const reminders = storage.getReminders();
  const notes = storage.getNotes();
  const today = new Date().toISOString().split('T')[0];
  const todayStats = stats.dailyStats?.[today] || { total: 0 };

  // 构建命令统计数组
  const commandStats = Object.entries(stats.commandCounts || {}).map(([cmd, count]) => ({
    command: cmd,
    label: cmd.replace('/', ''),
    count,
    icon: '📊',
  })).sort((a, b) => b.count - a.count).slice(0, 6);

  // 构建最近 7 天趋势
  const commandTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayStats = stats.dailyStats?.[dateStr] || { total: 0 };
    commandTrend.push({
      date: `${d.getMonth() + 1}-${d.getDate()}`,
      total: dayStats.total || 0,
    });
  }

  res.json({
    success: true,
    data: {
      online: !!currentBot,
      uptime: process.uptime() > 3600
        ? `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`
        : `${Math.floor(process.uptime() / 60)}m`,
      memory: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100),
      lastRestart: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      totalCommands: stats.totalCommands || 0,
      commandsToday: todayStats.total || 0,
      aiTokensUsed: stats.aiTokensUsed || 0,
      rssFeeds: scheduler?.getSubscriptions()?.length || 0,
      pendingReminders: reminders.filter(r => r.status === 'pending').length,
      activeNotes: notes.filter(n => !n.completed).length,
      commandStats,
      commandTrend,
      recentActivity: [],
    }
  });
});

// ==================== Notifications API ====================

app.get('/api/notifications', (req, res) => {
  res.json({ success: true, data: [] });
});

app.post('/api/notifications/:id/read', (req, res) => {
  res.json({ success: true });
});

app.post('/api/notifications/read-all', (req, res) => {
  res.json({ success: true });
});

app.delete('/api/notifications/:id', (req, res) => {
  res.json({ success: true });
});

app.delete('/api/notifications', (req, res) => {
  res.json({ success: true });
});

app.post('/api/notifications/test', async (req, res) => {
  try {
    const settings = loadSettings();
    if (!settings.adminId || !currentBot) {
      return res.status(400).json({ success: false, error: 'Bot 未连接或未配置管理员 ID' });
    }

    await currentBot.telegram.sendMessage(settings.adminId, '🔔 这是一条来自 Web 面板的测试通知');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Reminders API ====================

app.get('/api/reminders', (req, res) => {
  const reminders = storage.getReminders();
  res.json({ success: true, data: reminders });
});

app.post('/api/reminders', (req, res) => {
  const { content, triggerAt, repeat } = req.body;
  if (!content || !triggerAt) {
    return res.status(400).json({ success: false, error: '内容和时间不能为空' });
  }

  const settings = loadSettings();
  const userId = settings.adminId ? settings.adminId.toString() : null;
  const chatId = userId; // 默认发给管理员

  const reminder = storage.addReminder(content, triggerAt, repeat, userId, chatId);
  storage.addLog('info', `添加提醒: ${content}`, 'reminder');
  res.json({ success: true, data: reminder });
});

app.delete('/api/reminders/:id', (req, res) => {
  const success = storage.deleteReminder(req.params.id);
  if (success) {
    storage.addLog('info', `删除提醒: ${req.params.id}`, 'reminder');
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: '提醒不存在' });
  }
});

app.put('/api/reminders/:id', (req, res) => {
  const reminder = storage.updateReminder(req.params.id, req.body);
  if (!reminder) {
    return res.status(404).json({ success: false, error: '提醒不存在' });
  }
  storage.addLog('info', `更新提醒: ${req.params.id}`, 'reminder');
  res.json({ success: true, data: reminder });
});

// ... (Logs API omitted) ...

async function checkReminders(bot) {
  const settings = loadSettings();
  if (!settings.features.reminders) return;

  const reminders = storage.getReminders();
  const now = new Date();

  // 兼容 targetTime 和 triggerAt
  const pendingReminders = reminders.filter(r => {
    const time = r.targetTime || r.triggerAt;
    return r.status === 'pending' && new Date(time) <= now;
  });

  for (const reminder of pendingReminders) {
    try {
      // 优先使用 reminder 中的 chatId，如果没有则发给 adminId
      const targetChatId = reminder.chatId || settings.adminId;

      if (targetChatId) {
        const content = reminder.message || reminder.content;
        await bot.telegram.sendMessage(targetChatId, `⏰ <b>提醒</b>\n\n${content}`, { parse_mode: 'HTML' });
        storage.addLog('info', `触发提醒: ${content}`, 'reminder');

        // 更新状态或设置下次提醒
        if (reminder.repeat === 'daily') {
          const time = reminder.targetTime || reminder.triggerAt;
          const nextTime = new Date(time);
          nextTime.setDate(nextTime.getDate() + 1);

          // 更新时同时更新两个字段以保持兼容
          storage.updateReminder(reminder.id, {
            targetTime: nextTime.toISOString(),
            triggerAt: nextTime.toISOString()
          });
        } else {
          storage.updateReminder(reminder.id, { status: 'completed' });
        }
      }
    } catch (e) {
      storage.addLog('error', `提醒发送失败: ${e.message}`, 'reminder');
    }
  }
}

// ==================== Logs API ====================

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = storage.getLogs().slice(-limit).reverse();
  res.json({ success: true, data: logs });
});

app.delete('/api/logs', (req, res) => {
  storage.clearLogs();
  res.json({ success: true });
});

// ==================== Auth API Extensions ====================

app.post('/api/auth/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const settings = loadSettings();
  const currentPassword = settings.webPassword || DEFAULT_ADMIN.password;

  if (oldPassword !== currentPassword) {
    return res.status(401).json({ success: false, error: '旧密码错误' });
  }

  settings.webPassword = newPassword;
  saveSettings(settings);
  res.json({ success: true });
});

// ==================== AI Providers API ====================

// 获取所有 AI 配置
app.get('/api/ai-providers', (req, res) => {
  const settings = loadSettings();
  const providers = (settings.aiProviders || []).map(p => ({
    ...p,
    apiKey: p.apiKey ? '***已配置***' : '', // 隐藏 API Key
    isActive: p.id === settings.activeAiProvider,
  }));
  res.json({ success: true, data: providers });
});

// 添加 AI 配置
app.post('/api/ai-providers', (req, res) => {
  const { name, apiKey, baseUrl, model } = req.body;
  if (!name || !apiKey || !baseUrl) {
    return res.status(400).json({ success: false, error: '名称、API Key 和 Base URL 不能为空' });
  }

  const settings = loadSettings();
  if (!settings.aiProviders) {
    settings.aiProviders = [];
  }

  const newProvider = {
    id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name,
    apiKey,
    baseUrl,
    model: model || 'gpt-3.5-turbo',
  };

  settings.aiProviders.push(newProvider);

  // 如果是第一个配置，自动激活
  if (settings.aiProviders.length === 1) {
    settings.activeAiProvider = newProvider.id;
  }

  saveSettings(settings);
  res.json({
    success: true,
    data: {
      ...newProvider,
      apiKey: '***已配置***',
      isActive: newProvider.id === settings.activeAiProvider,
    }
  });
});

// 更新 AI 配置
app.put('/api/ai-providers/:id', (req, res) => {
  const { id } = req.params;
  const { name, apiKey, baseUrl, model } = req.body;

  const settings = loadSettings();
  const index = (settings.aiProviders || []).findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, error: '配置不存在' });
  }

  // 更新字段（只更新提供的字段）
  if (name) settings.aiProviders[index].name = name;
  if (apiKey) settings.aiProviders[index].apiKey = apiKey;
  if (baseUrl) settings.aiProviders[index].baseUrl = baseUrl;
  if (model) settings.aiProviders[index].model = model;

  saveSettings(settings);
  res.json({
    success: true,
    data: {
      ...settings.aiProviders[index],
      apiKey: '***已配置***',
      isActive: settings.aiProviders[index].id === settings.activeAiProvider,
    }
  });
});

// 删除 AI 配置
app.delete('/api/ai-providers/:id', (req, res) => {
  const { id } = req.params;
  const settings = loadSettings();

  const index = (settings.aiProviders || []).findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '配置不存在' });
  }

  // 不能删除当前激活的配置（除非只剩这一个）
  if (id === settings.activeAiProvider && settings.aiProviders.length > 1) {
    return res.status(400).json({ success: false, error: '不能删除当前激活的配置，请先切换到其他配置' });
  }

  settings.aiProviders.splice(index, 1);

  // 如果删除的是激活配置，清除激活状态
  if (id === settings.activeAiProvider) {
    settings.activeAiProvider = settings.aiProviders[0]?.id || null;
  }

  saveSettings(settings);
  res.json({ success: true });
});

// 激活 AI 配置
app.post('/api/ai-providers/:id/activate', (req, res) => {
  const { id } = req.params;
  const settings = loadSettings();

  const provider = (settings.aiProviders || []).find(p => p.id === id);
  if (!provider) {
    return res.status(404).json({ success: false, error: '配置不存在' });
  }

  settings.activeAiProvider = id;
  saveSettings(settings);
  res.json({ success: true, message: `已切换到: ${provider.name}` });
});

// ==================== Tools API ====================

app.get('/api/tools', (req, res) => {
  const tools = storage.getTools();
  res.json({ success: true, data: tools });
});

app.put('/api/tools/:id', (req, res) => {
  const tool = storage.updateTool(req.params.id, req.body);
  if (!tool) {
    return res.status(404).json({ success: false, error: '工具不存在' });
  }
  res.json({ success: true, data: tool });
});

app.post('/api/tools/:id/toggle', (req, res) => {
  const { enabled } = req.body;
  const tool = storage.updateTool(req.params.id, { enabled });
  if (!tool) {
    return res.status(404).json({ success: false, error: '工具不存在' });
  }
  res.json({ success: true, data: tool });
});

app.get('/api/tools/stats', (req, res) => {
  const tools = storage.getTools();
  const stats = tools.map(t => ({ command: t.command, count: t.usage || 0 }));
  res.json({ success: true, data: stats });
});

// ==================== Scheduled Tasks API ====================

app.get('/api/scheduled-tasks', (req, res) => {
  const settings = loadSettings();
  const tasks = [];

  // 1. RSS 订阅检查任务
  const subscriptions = scheduler?.getSubscriptions() || [];
  for (const sub of subscriptions) {
    if (sub.enabled) {
      const lastCheck = sub.lastCheck ? new Date(sub.lastCheck) : null;
      const intervalMs = (sub.interval || 30) * 60 * 1000;
      const nextCheck = lastCheck ? new Date(lastCheck.getTime() + intervalMs) : new Date();

      tasks.push({
        id: `rss_${sub.id}`,
        type: 'rss',
        name: `RSS: ${sub.title}`,
        description: `检查订阅 "${sub.title}"`,
        interval: `${sub.interval} 分钟`,
        lastRun: sub.lastCheck || null,
        nextRun: nextCheck.toISOString(),
        status: sub.lastError ? 'error' : 'active',
        error: sub.lastError || null,
      });
    }
  }

  // 2. 提醒检查任务 (每分钟)
  tasks.push({
    id: 'reminder_check',
    type: 'system',
    name: '提醒检查器',
    description: '检查并发送到期的提醒',
    interval: '1 分钟',
    lastRun: null,
    nextRun: null,
    status: settings.features?.reminders ? 'active' : 'paused',
    error: null,
  });

  // 3. WebDAV 自动备份任务
  const webdavConfig = settings.webdav || {};
  if (webdavConfig.autoBackup && webdavConfig.url) {
    tasks.push({
      id: 'webdav_backup',
      type: 'backup',
      name: 'WebDAV 自动备份',
      description: '备份数据到 WebDAV 服务器',
      interval: `${webdavConfig.autoBackupInterval || 24} 小时`,
      lastRun: null,
      nextRun: null,
      status: 'active',
      error: null,
    });
  }

  res.json({ success: true, data: tasks });
});

// ==================== Trending API ====================

const trending = require('./trending');

// 缓存热榜数据，避免频繁请求
let trendingCache = {};
let trendingCacheTime = null;
const TRENDING_CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

// 获取所有热榜源
app.get('/api/trending/sources', (req, res) => {
  res.json({
    success: true,
    data: Object.values(trending.TRENDING_SOURCES),
  });
});

// 获取指定源的热榜
app.get('/api/trending/:source', async (req, res) => {
  const { source } = req.params;

  if (!trending.TRENDING_SOURCES[source]) {
    return res.status(404).json({ success: false, error: '不支持的热榜源' });
  }

  try {
    // 检查缓存
    const now = Date.now();
    if (
      trendingCache[source] &&
      trendingCacheTime &&
      now - trendingCacheTime < TRENDING_CACHE_TTL
    ) {
      return res.json({ success: true, data: trendingCache[source], cached: true });
    }

    const items = await trending.fetchTrending(source);
    trendingCache[source] = {
      ...trending.TRENDING_SOURCES[source],
      items,
      updatedAt: new Date().toISOString(),
    };
    trendingCacheTime = now;

    res.json({ success: true, data: trendingCache[source] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有热榜
app.get('/api/trending', async (req, res) => {
  try {
    // 检查缓存
    const now = Date.now();
    if (
      Object.keys(trendingCache).length > 0 &&
      trendingCacheTime &&
      now - trendingCacheTime < TRENDING_CACHE_TTL
    ) {
      return res.json({ success: true, data: trendingCache, cached: true });
    }

    const data = await trending.fetchAllTrending();
    trendingCache = data;
    trendingCacheTime = now;

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 推送热榜到 Telegram
app.post('/api/trending/:source/push', async (req, res) => {
  const { source } = req.params;
  const { limit = 10 } = req.body;

  if (!trending.TRENDING_SOURCES[source]) {
    return res.status(404).json({ success: false, error: '不支持的热榜源' });
  }

  if (!currentBot) {
    return res.status(503).json({ success: false, error: 'Bot 未运行' });
  }

  try {
    const items = await trending.fetchTrending(source);
    const message = trending.formatTrendingMessage(source, items, limit);

    if (!message) {
      return res.status(500).json({ success: false, error: '获取热榜数据失败' });
    }

    const settings = loadSettings();
    const chatId = settings.adminId;

    if (!chatId) {
      return res.status(400).json({ success: false, error: '未配置管理员 ID' });
    }

    await currentBot.telegram.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    storage.addLog('info', `推送热榜: ${trending.TRENDING_SOURCES[source].name}`, 'trending');
    res.json({ success: true, message: '推送成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Price Monitor API ====================

const PriceMonitor = require('./price-monitor');

// 初始化价格监控器
let priceMonitor = null;

function initPriceMonitor() {
  if (priceMonitor) return;

  priceMonitor = new PriceMonitor(logger, async (data) => {
    // 价格变动回调 - 推送到 Telegram
    if (!currentBot) return;

    try {
      const settings = loadSettings();
      const chatId = settings.adminId;
      if (!chatId) return;

      const message = priceMonitor.formatPriceChangeMessage(data);
      await currentBot.telegram.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      });

      storage.addLog('info', `价格变动提醒: ${data.item.name} ¥${data.oldPrice} → ¥${data.newPrice}`, 'price');
    } catch (error) {
      logger.error(`推送价格变动失败: ${error.message}`);
    }
  });

  priceMonitor.startAll();
}

// 在服务启动时初始化
setTimeout(initPriceMonitor, 3000);

// 获取所有监控项
app.get('/api/price-monitors', (req, res) => {
  initPriceMonitor();
  const items = priceMonitor.getItems();
  res.json({ success: true, data: items });
});

// 获取单个监控项
app.get('/api/price-monitors/:id', (req, res) => {
  initPriceMonitor();
  const items = priceMonitor.getItems();
  const item = items.find(i => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, error: '监控项不存在' });
  }
  res.json({ success: true, data: item });
});

// 获取价格历史
app.get('/api/price-monitors/:id/history', (req, res) => {
  initPriceMonitor();
  const history = priceMonitor.getHistory(req.params.id);
  res.json({ success: true, data: history });
});

// 添加监控项
app.post('/api/price-monitors', (req, res) => {
  initPriceMonitor();
  const { url, selector, name, interval, targetPrice, notifyOnAnyChange, notifyOnDrop, dropThreshold } = req.body;

  if (!url || !selector) {
    return res.status(400).json({ success: false, error: '请提供商品链接和价格选择器' });
  }

  try {
    const item = priceMonitor.addItem({
      url,
      selector,
      name,
      interval: interval || 60,
      targetPrice: targetPrice || null,
      notifyOnAnyChange: notifyOnAnyChange !== false,
      notifyOnDrop: notifyOnDrop || false,
      dropThreshold: dropThreshold || 0,
    });
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新监控项
app.put('/api/price-monitors/:id', (req, res) => {
  initPriceMonitor();
  const item = priceMonitor.updateItem(req.params.id, req.body);
  if (!item) {
    return res.status(404).json({ success: false, error: '监控项不存在' });
  }
  res.json({ success: true, data: item });
});

// 删除监控项
app.delete('/api/price-monitors/:id', (req, res) => {
  initPriceMonitor();
  const deleted = priceMonitor.deleteItem(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: '监控项不存在' });
  }
  res.json({ success: true });
});

// 手动刷新价格
app.post('/api/price-monitors/:id/refresh', async (req, res) => {
  initPriceMonitor();
  try {
    const item = await priceMonitor.refreshItem(req.params.id);
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试价格提取
app.post('/api/price-monitors/test', async (req, res) => {
  initPriceMonitor();
  const { url, selector } = req.body;

  if (!url || !selector) {
    return res.status(400).json({ success: false, error: '请提供商品链接和价格选择器' });
  }

  try {
    const price = await priceMonitor.fetchPrice(url, selector);
    if (price === null) {
      return res.json({ success: false, error: '无法提取价格，请检查选择器是否正确' });
    }
    res.json({ success: true, data: { price } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== NodeSeek 抽奖监控 API ====================

// 初始化 NodeSeek 抽奖监控器
function initNodeSeekMonitor() {
  if (nodeseekMonitor) return;

  nodeseekMonitor = new NodeSeekLotteryMonitor(logger, async (data) => {
    // 中奖回调 - 推送到绑定用户的 Telegram
    if (!currentBot) return;

    try {
      const message = nodeseekMonitor.formatWinnerMessage(data);
      await currentBot.telegram.sendMessage(data.telegramId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      });

      storage.addLog('info', `NodeSeek 中奖通知: ${data.winner.username} -> TG ${data.telegramId}`, 'nodeseek');
    } catch (error) {
      logger.error(`推送中奖通知失败: ${error.message}`);
      storage.addLog('error', `推送中奖通知失败: ${error.message}`, 'nodeseek');
    }
  });

  nodeseekMonitor.start();
}

// 在服务启动时初始化
setTimeout(initNodeSeekMonitor, 5000);

// 获取所有监控的抽奖帖
app.get('/api/nodeseek/lotteries', (req, res) => {
  initNodeSeekMonitor();
  const lotteries = storage.getNodeSeekLotteries();
  res.json({ success: true, data: lotteries });
});

// 获取单个抽奖帖详情（包含中奖者）
app.get('/api/nodeseek/lotteries/:postId', async (req, res) => {
  initNodeSeekMonitor();
  try {
    const details = await nodeseekMonitor.getLotteryDetails(req.params.postId);
    if (!details) {
      return res.status(404).json({ success: false, error: '抽奖帖不存在' });
    }
    res.json({ success: true, data: details });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加抽奖帖监控
app.post('/api/nodeseek/lotteries', (req, res) => {
  initNodeSeekMonitor();
  const { url, title } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: '请提供抽奖链接' });
  }

  // 解析帖子 ID
  let postId = null;
  let luckyUrl = null;

  // 尝试从 lucky 链接解析
  const luckyMatch = url.match(/[?&]post=(\d+)/);
  if (luckyMatch) {
    postId = luckyMatch[1];
    luckyUrl = url;
  }

  // 尝试从帖子链接解析
  const postMatch = url.match(/post-(\d+)/);
  if (postMatch) {
    postId = postMatch[1];
  }

  if (!postId) {
    return res.status(400).json({ success: false, error: '无法解析帖子 ID，请检查链接格式' });
  }

  const result = storage.addNodeSeekLottery(postId, title || `帖子 #${postId}`, luckyUrl || url);

  if (result.success) {
    storage.addLog('info', `NodeSeek 添加监控: 帖子 #${postId}`, 'nodeseek');
    res.json({ success: true, data: result.data });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

// 删除抽奖帖监控
app.delete('/api/nodeseek/lotteries/:postId', (req, res) => {
  initNodeSeekMonitor();
  const deleted = storage.deleteNodeSeekLottery(req.params.postId);

  if (deleted) {
    storage.addLog('info', `NodeSeek 取消监控: 帖子 #${req.params.postId}`, 'nodeseek');
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: '未找到该帖子的监控记录' });
  }
});

// 手动刷新单个抽奖帖
app.post('/api/nodeseek/lotteries/:postId/refresh', async (req, res) => {
  initNodeSeekMonitor();
  try {
    await nodeseekMonitor.refreshLottery(req.params.postId);
    const details = await nodeseekMonitor.getLotteryDetails(req.params.postId);
    res.json({ success: true, data: details });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 刷新所有抽奖帖
app.post('/api/nodeseek/lotteries/refresh-all', async (req, res) => {
  initNodeSeekMonitor();
  try {
    await nodeseekMonitor.checkAllLotteries();
    res.json({ success: true, message: '刷新完成' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取所有绑定的用户
app.get('/api/nodeseek/bindings', (req, res) => {
  const bindings = storage.getAllNodeSeekUsernames();
  res.json({ success: true, data: bindings });
});

// ==================== Notes API ====================

app.get('/api/notes', (req, res) => {
  const notes = storage.getNotes();
  res.json({ success: true, data: notes });
});

app.post('/api/notes', (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ success: false, error: '内容不能为空' });
  }
  const note = storage.addNote(content);
  res.json({ success: true, data: note });
});

app.put('/api/notes/:id', (req, res) => {
  const note = storage.updateNote(req.params.id, req.body);
  if (!note) {
    return res.status(404).json({ success: false, error: '笔记不存在' });
  }
  res.json({ success: true, data: note });
});

app.delete('/api/notes/:id', (req, res) => {
  const deleted = storage.deleteNote(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: '笔记不存在' });
  }
  res.json({ success: true });
});

// ==================== Backup API ====================

const webdav = require('./webdav');

// 下载本地备份
app.get('/api/backup', (req, res) => {
  try {
    const backupFile = storage.createBackup();
    res.download(backupFile);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 测试 WebDAV 连接
app.post('/api/backup/webdav/test', async (req, res) => {
  const settings = loadSettings();
  const config = settings.webdav || {};

  if (!config.url || !config.username || !config.password) {
    return res.status(400).json({ success: false, error: '请先配置 WebDAV 连接信息' });
  }

  const result = await webdav.testConnection(config);
  res.json(result);
});

// 备份到 WebDAV
app.post('/api/backup/webdav/upload', async (req, res) => {
  try {
    const settings = loadSettings();
    const config = settings.webdav || {};

    if (!config.url || !config.username || !config.password) {
      return res.status(400).json({ success: false, error: '请先配置 WebDAV 连接信息' });
    }

    // 创建备份数据
    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      config: { ...settings, webdav: { ...settings.webdav, password: '***' } }, // 隐藏密码
      notes: storage.getNotes(),
      reminders: storage.getReminders(),
      stats: storage.getStats(),
      tools: storage.getTools(),
      subscriptions: scheduler?.getSubscriptions() || [], // RSS 订阅
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const remotePath = `${config.remotePath || '/tgbot-backup'}/backup_${timestamp}.json`;
    const content = JSON.stringify(backupData, null, 2);

    const result = await webdav.uploadFile(config, remotePath, content);

    if (result.success) {
      storage.addLog('info', `WebDAV 备份成功: ${remotePath}`, 'backup');
      res.json({ success: true, message: '备份成功', path: remotePath });
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 列出 WebDAV 备份
app.get('/api/backup/webdav/list', async (req, res) => {
  const settings = loadSettings();
  const config = settings.webdav || {};

  if (!config.url) {
    return res.json({ success: true, data: [] });
  }

  const remotePath = config.remotePath || '/tgbot-backup';
  const result = await webdav.listFiles(config, remotePath);
  res.json(result);
});

// 从 WebDAV 恢复备份
app.post('/api/backup/webdav/restore', async (req, res) => {
  try {
    const { path: remotePath } = req.body;
    const settings = loadSettings();
    const config = settings.webdav || {};

    if (!remotePath) {
      return res.status(400).json({ success: false, error: '请指定备份文件路径' });
    }

    const result = await webdav.downloadFile(config, remotePath);

    if (!result.success) {
      return res.json(result);
    }

    const backupData = JSON.parse(result.data);

    // 恢复数据（保留当前的 webdav 配置）
    if (backupData.config) {
      const currentWebdav = settings.webdav;
      const newSettings = { ...settings, ...backupData.config, webdav: currentWebdav };
      saveSettings(newSettings);
    }

    // 恢复其他数据需要更复杂的逻辑，暂时只恢复配置
    storage.addLog('info', `从 WebDAV 恢复备份: ${remotePath}`, 'backup');

    res.json({ success: true, message: '恢复成功，请重启 Bot 使配置生效' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除 WebDAV 备份
app.delete('/api/backup/webdav/:filename', async (req, res) => {
  const settings = loadSettings();
  const config = settings.webdav || {};
  const remotePath = `${config.remotePath || '/tgbot-backup'}/${req.params.filename}`;

  const result = await webdav.deleteFile(config, remotePath);
  res.json(result);
});

// ==================== 定时 WebDAV 备份 ====================

let backupTimer = null;

async function runAutoBackup() {
  const settings = loadSettings();
  const config = settings.webdav || {};

  if (!config.autoBackup || !config.url || !config.username || !config.password) {
    return;
  }

  logger.info('⏰ 执行定时 WebDAV 备份...');

  try {
    // 创建备份数据
    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      config: { ...settings, webdav: { ...settings.webdav, password: '***' } },
      notes: storage.getNotes(),
      reminders: storage.getReminders(),
      stats: storage.getStats(),
      tools: storage.getTools(),
      subscriptions: scheduler?.getSubscriptions() || [],
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const remotePath = `${config.remotePath || '/tgbot-backup'}/backup_${timestamp}.json`;
    const content = JSON.stringify(backupData, null, 2);

    const result = await webdav.uploadFile(config, remotePath, content);

    if (result.success) {
      logger.info(`✅ 定时备份成功: ${remotePath}`);
      storage.addLog('info', `定时备份成功: ${remotePath}`, 'backup');

      // 清理过期备份（保留 3 天）
      await cleanOldBackups(config);
    } else {
      logger.error(`❌ 定时备份失败: ${result.error}`);
      storage.addLog('error', `定时备份失败: ${result.error}`, 'backup');
    }
  } catch (error) {
    logger.error(`❌ 定时备份异常: ${error.message}`);
    storage.addLog('error', `定时备份异常: ${error.message}`, 'backup');
  }
}

async function cleanOldBackups(config) {
  try {
    const remotePath = config.remotePath || '/tgbot-backup';
    const result = await webdav.listFiles(config, remotePath);

    if (!result.success || !result.data) return;

    const now = new Date();
    const maxAge = 3 * 24 * 60 * 60 * 1000; // 3 天

    for (const file of result.data) {
      if (file.modified) {
        const fileDate = new Date(file.modified);
        if (now - fileDate > maxAge) {
          logger.info(`🗑️ 清理过期备份: ${file.name}`);
          await webdav.deleteFile(config, file.path);
          storage.addLog('info', `清理过期备份: ${file.name}`, 'backup');
        }
      }
    }
  } catch (error) {
    logger.error(`清理备份失败: ${error.message}`);
  }
}

function startBackupScheduler() {
  if (backupTimer) {
    clearInterval(backupTimer);
  }

  const settings = loadSettings();
  const config = settings.webdav || {};

  if (config.autoBackup && config.url) {
    const interval = (config.autoBackupInterval || 24) * 60 * 60 * 1000; // 小时转毫秒
    logger.info(`📅 启动定时备份，间隔: ${config.autoBackupInterval || 24} 小时`);

    // 立即执行一次
    setTimeout(runAutoBackup, 5000);

    // 定时执行
    backupTimer = setInterval(runAutoBackup, interval);
  }
}

async function startBot() {
  // 停止旧实例
  if (currentBot) {
    try {
      scheduler?.stopAll();
      await currentBot.stop();
      logger.info('🛑 旧 Bot 实例已停止');
    } catch (e) {
      logger.error(`停止旧实例失败: ${e.message}`);
    }
    currentBot = null;
  }

  let settings = loadSettings();

  // 首次启动时从环境变量读取并保存（仅当 config.json 中未配置时）
  if (!settings.botToken && process.env.BOT_TOKEN) {
    settings.botToken = process.env.BOT_TOKEN;
    settings.adminId = process.env.ADMIN_ID || settings.adminId;
    saveSettings(settings);
    logger.info('📝 已从环境变量导入初始配置到 config.json');
  }

  if (!settings.botToken) {
    logger.warn('❌ 未配置 Bot Token，请在面板中配置');
    return;
  }

  // 创建 Bot 实例
  const botOptions = {};
  if (settings.tgApiBase) {
    botOptions.telegram = { apiRoot: settings.tgApiBase };
  }
  const bot = new Telegraf(settings.botToken, botOptions);

  // 管理员检查函数
  const isAdmin = (ctx) => {
    if (!settings.adminId) return false;
    return String(ctx.from?.id) === String(settings.adminId);
  };

  // 初始化调度器
  scheduler = new RssScheduler(parseRssFeed, logger, async (subscription, newItems) => {
    const currentSettings = loadSettings();
    const globalRss = currentSettings.rss || {};

    // 优先级：订阅独立配置（需开启 useCustomPush）> 全局 RSS 配置 > 系统默认
    let targetToken = null;
    let targetChatId = null;
    let botLabel = '系统 Bot';

    // 1. 检查订阅是否启用独立配置
    if (subscription.useCustomPush && subscription.customBotToken) {
      targetToken = subscription.customBotToken;
      targetChatId = subscription.customChatId || subscription.chatId;
      botLabel = '订阅独立 Bot';
    }
    // 2. 检查全局 RSS 配置
    else if (globalRss.customBotToken) {
      targetToken = globalRss.customBotToken;
      targetChatId = globalRss.customChatId || subscription.chatId;
      botLabel = '全局 RSS Bot';
    }
    // 3. 使用系统默认
    else {
      targetChatId = subscription.chatId;
    }

    if (!targetChatId) {
      logger.warn(`[${subscription.title}] 无推送目标，跳过`);
      return;
    }

    // 确定使用哪个 Telegram API
    let telegramApi;

    if (targetToken) {
      try {
        const tempBot = new Telegraf(targetToken);
        telegramApi = tempBot.telegram;
      } catch (e) {
        logger.error(`[${subscription.title}] Bot Token 无效: ${e.message}`);
        storage.addLog('error', `${botLabel} Token 无效: ${e.message}`, 'rss');
        return;
      }
    } else if (currentBot) {
      telegramApi = currentBot.telegram;
    } else {
      logger.warn(`[${subscription.title}] 系统 Bot 未就绪，跳过推送`);
      return;
    }

    // 推送新内容
    for (const item of newItems.slice(0, 5)) { // 最多推送 5 条
      try {
        // 使用消息模板
        const template = globalRss.messageTemplate || '📰 <b>{feed_title}</b>\n{title}\n{link}';
        const message = template
          .replace(/{feed_title}/g, subscription.title || '')
          .replace(/{title}/g, item.title || '')
          .replace(/{link}/g, item.link || '')
          .replace(/{description}/g, (item.description || '').substring(0, 200))
          .replace(/{date}/g, item.pubDate ? new Date(item.pubDate).toLocaleString('zh-CN') : '');

        await telegramApi.sendMessage(targetChatId, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: false,  // 显示链接预览
        });
        // 记录日志
        storage.addLog('info', `[${botLabel}] 推送: [${subscription.title}] ${item.title}`, 'rss');
      } catch (e) {
        logger.error(`推送失败: ${e.message}`);
        storage.addLog('error', `[${botLabel}] 推送失败: ${e.message}`, 'rss');
      }
    }

    // 保存到历史
    for (const item of newItems) {
      scheduler.saveNewItemToHistory(subscription, item);
    }
  });

  // 加载命令
  loadCommands(bot, { isAdmin, scheduler, logger, settings });

  currentBot = bot;

  // 启动 (带重试)
  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`🚀 正在启动 Bot... (尝试 ${attempt}/${MAX_RETRIES})`);
      const botInfo = await bot.telegram.getMe();
      logger.info(`✅ 连接成功: @${botInfo.username}`);

      bot.launch({ dropPendingUpdates: true }).catch(err => {
        logger.error(`❌ Bot 运行时错误: ${err.message}`);
      });

      logger.info('✅ Bot 轮询已开始');
      storage.addLog('info', `Bot 启动成功: @${botInfo.username}`, 'bot');

      // 启动调度器
      scheduler.startAll();

      // 启动提醒检查
      setInterval(() => checkReminders(bot), 60000);
      checkReminders(bot); // 立即检查一次

      // 发送启动通知
      if (settings.adminId) {
        try {
          await bot.telegram.sendMessage(
            settings.adminId,
            `✅ <b>Bot 已成功启动</b>\n\n⏱ 启动时间: ${new Date().toLocaleString('zh-CN')}\n📊 所有功能正常运行`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          logger.warn(`发送启动通知失败: ${e.message}`);
        }
      }

      // 启动成功，退出重试循环
      return;
    } catch (err) {
      logger.error(`❌ 启动失败 (${attempt}/${MAX_RETRIES}): ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, attempt * 3000));
      }
    }
  }

  logger.error('❌ Bot 启动失败，已达到最大重试次数');
  storage.addLog('error', 'Bot 启动失败，已达最大重试次数', 'bot');
}


// ==================== 主函数 ====================

const PORT = process.env.PORT || 3001;

// SPA fallback - 必须放在所有 API 路由之后
if (fs.existsSync(publicPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`🚀 Backend server running on port ${PORT}`);
  logger.info(`📋 Web Panel: http://localhost:${PORT}`);

  // 尝试启动 Bot
  try {
    await startBot();
  } catch (err) {
    logger.error(`初始启动失败: ${err.message}`);
  }

  // 启动定时备份
  startBackupScheduler();
});

// 优雅退出
const stopSignals = ['SIGINT', 'SIGTERM'];
stopSignals.forEach(signal => {
  process.once(signal, async () => {
    logger.info('正在关闭服务...');
    scheduler?.stopAll();
    nodeseekMonitor?.stop();
    if (currentBot) {
      await currentBot.stop(signal);
    }
    await closeBrowser();
    process.exit(0);
  });
});
