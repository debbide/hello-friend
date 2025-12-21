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
      chatId,
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

app.get('/api/subscriptions/history', (req, res) => {
  const history = scheduler?.getNewItemsHistory() || [];
  res.json({ success: true, data: history });
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
    // 推送新内容到 Telegram
    if (subscription.chatId && currentBot) {
      for (const item of newItems.slice(0, 5)) { // 最多推送 5 条
        try {
          const message = `📰 <b>${subscription.title}</b>\n\n` +
            `<b>${item.title}</b>\n` +
            `${item.description?.substring(0, 200) || ''}\n\n` +
            `🔗 <a href="${item.link}">阅读原文</a>`;

          await bot.telegram.sendMessage(subscription.chatId, message, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          });
        } catch (e) {
          logger.error(`推送失败: ${e.message}`);
        }
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
}

// ==================== 主函数 ====================

const PORT = process.env.PORT || 3001;

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
