/**
 * TG 多功能机器人 - 主入口
 * 参考 tgbot 架构 + 优化
 */
const express = require('express');
const cors = require('cors');
const winston = require('winston');
const { Telegraf } = require('telegraf');
const { loadSettings, saveSettings, getDataPath } = require('./settings');
const { loadCommands } = require('./commands/loader');
const RssScheduler = require('./scheduler');
const { parseRssFeed } = require('./rss-parser');
const { closeBrowser } = require('./puppeteer.service');
const storage = require('./storage');

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

// Middleware
app.use(cors());
app.use(express.json());

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

// 重启 Bot
app.post('/api/restart', async (req, res) => {
  try {
    await startBot();
    res.json({ success: true, message: 'Bot restarted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

// ==================== Reminders API ====================

app.get('/api/reminders', (req, res) => {
  const reminders = storage.getReminders();
  res.json({ success: true, data: reminders });
});

app.post('/api/reminders', (req, res) => {
  const { content, triggerAt, repeat } = req.body;
  if (!content || !triggerAt) {
    return res.status(400).json({ success: false, error: '缺少必要字段' });
  }
  const reminder = storage.addReminder(content, triggerAt, repeat);
  res.json({ success: true, data: reminder });
});

app.put('/api/reminders/:id', (req, res) => {
  const reminder = storage.updateReminder(req.params.id, req.body);
  if (!reminder) {
    return res.status(404).json({ success: false, error: '提醒不存在' });
  }
  res.json({ success: true, data: reminder });
});

app.delete('/api/reminders/:id', (req, res) => {
  const deleted = storage.deleteReminder(req.params.id);
  if (!deleted) {
    return res.status(404).json({ success: false, error: '提醒不存在' });
  }
  res.json({ success: true });
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

app.get('/api/backup', (req, res) => {
  try {
    const backupFile = storage.createBackup();
    res.download(backupFile);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Bot 启动 ====================

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
        const message = `📰 <b>${subscription.title}</b>\n\n` +
          `<b>${item.title}</b>\n` +
          `${item.description?.substring(0, 200) || ''}\n\n` +
          `🔗 <a href="${item.link}">阅读原文</a>`;

        await telegramApi.sendMessage(targetChatId, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
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
});

// 优雅退出
const stopSignals = ['SIGINT', 'SIGTERM'];
stopSignals.forEach(signal => {
  process.once(signal, async () => {
    logger.info('正在关闭服务...');
    scheduler?.stopAll();
    if (currentBot) {
      await currentBot.stop(signal);
    }
    await closeBrowser();
    process.exit(0);
  });
});
