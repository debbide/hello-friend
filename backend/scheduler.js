/**
 * RSS 定时任务调度器
 */
const fs = require('fs');
const path = require('path');
const storage = require('./storage');

class RssScheduler {
  constructor(parseRssFeed, logger, onNewItems) {
    this.parseRssFeed = parseRssFeed;
    this.logger = logger;
    this.onNewItems = onNewItems;
    this.timers = new Map(); // feedId -> timer
    this.seenItems = new Map(); // feedId -> Set of item ids
    this.dataPath = process.env.DATA_PATH || './data';
    this.subscriptionsFile = path.join(this.dataPath, 'subscriptions.json');
    this.seenItemsFile = path.join(this.dataPath, 'seen_items.json');

    this.ensureDataDir();
    this.loadSeenItems();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  /**
   * 获取所有订阅
   */
  getSubscriptions() {
    try {
      if (fs.existsSync(this.subscriptionsFile)) {
        const data = fs.readFileSync(this.subscriptionsFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      this.logger.error(`读取订阅失败: ${error.message}`);
    }
    return [];
  }

  /**
   * 保存订阅
   */
  saveSubscriptions(subscriptions) {
    try {
      fs.writeFileSync(this.subscriptionsFile, JSON.stringify(subscriptions, null, 2));
    } catch (error) {
      this.logger.error(`保存订阅失败: ${error.message}`);
    }
  }

  /**
   * 加载已读项目
   */
  loadSeenItems() {
    try {
      if (fs.existsSync(this.seenItemsFile)) {
        const data = fs.readFileSync(this.seenItemsFile, 'utf-8');
        const parsed = JSON.parse(data);
        for (const [feedId, items] of Object.entries(parsed)) {
          this.seenItems.set(feedId, new Set(items));
        }
      }
    } catch (error) {
      this.logger.error(`加载已读项目失败: ${error.message}`);
    }
  }

  /**
   * 保存已读项目
   */
  saveSeenItems() {
    try {
      const obj = {};
      for (const [feedId, items] of this.seenItems.entries()) {
        // 只保留最近 500 条
        const arr = Array.from(items);
        obj[feedId] = arr.slice(-500);
      }
      fs.writeFileSync(this.seenItemsFile, JSON.stringify(obj, null, 2));
    } catch (error) {
      this.logger.error(`保存已读项目失败: ${error.message}`);
    }
  }

  /**
   * 添加订阅
   */
  addSubscription(subscription) {
    const subscriptions = this.getSubscriptions();
    const id = subscription.id || `feed_${Date.now()}`;
    const newSub = {
      id,
      url: subscription.url,
      title: subscription.title || 'Unknown',
      interval: subscription.interval || 30, // 默认 30 分钟
      keywords: subscription.keywords || { whitelist: [], blacklist: [] },
      enabled: subscription.enabled !== false,
      chatId: subscription.chatId || null, // 推送目标
      userId: subscription.userId || null, // 用户 ID
      useCustomPush: subscription.useCustomPush || false, // 是否使用独立推送配置
      customBotToken: subscription.customBotToken || null, // 自定义 Bot Token
      customChatId: subscription.customChatId || null,     // 自定义推送目标
      isFirstCheck: true, // 标记首次检查，用于避免刷屏
      createdAt: new Date().toISOString(),
      lastCheck: null,
      lastError: null,
    };

    subscriptions.push(newSub);
    this.saveSubscriptions(subscriptions);

    this.logger.info(`✅ 添加订阅 [${newSub.title}] URL: ${newSub.url}`);
    storage.addLog('info', `添加订阅: ${newSub.title} (${newSub.url})`, 'rss');

    if (newSub.enabled) {
      this.scheduleCheck(newSub);
    }

    return newSub;
  }

  /**
   * 更新订阅
   */
  updateSubscription(id, updates) {
    const subscriptions = this.getSubscriptions();
    const index = subscriptions.findIndex(s => s.id === id);
    if (index === -1) {
      return null;
    }

    const oldSub = subscriptions[index];
    const newSub = { ...oldSub, ...updates, id };
    subscriptions[index] = newSub;
    this.saveSubscriptions(subscriptions);

    // 重新调度
    this.cancelCheck(id);
    if (newSub.enabled) {
      this.scheduleCheck(newSub);
    }

    return newSub;
  }

  /**
   * 删除订阅
   */
  deleteSubscription(id) {
    const subscriptions = this.getSubscriptions();
    const filtered = subscriptions.filter(s => s.id !== id);
    if (filtered.length === subscriptions.length) {
      return false;
    }

    this.saveSubscriptions(filtered);
    this.cancelCheck(id);
    this.seenItems.delete(id);
    this.saveSeenItems();

    return true;
  }

  /**
   * 调度单个订阅的检查
   */
  scheduleCheck(subscription) {
    const intervalMs = (subscription.interval || 30) * 60 * 1000;
    const subId = subscription.id;

    this.logger.info(`⏰ 调度订阅 [${subscription.title}] 每 ${subscription.interval} 分钟检查一次`);

    // 立即执行一次（使用最新配置）
    this.checkFeedById(subId);

    // 设置定时器 - 每次从文件读取最新配置
    const timer = setInterval(() => {
      this.checkFeedById(subId);
    }, intervalMs);

    this.timers.set(subId, timer);
  }

  /**
   * 根据 ID 检查 Feed（从文件读取最新配置）
   */
  async checkFeedById(id) {
    const subscription = this.getSubscriptions().find(s => s.id === id);
    if (!subscription) {
      this.logger.warn(`⚠️ 订阅 ${id} 不存在，取消检查`);
      this.cancelCheck(id);
      return;
    }
    if (!subscription.enabled) {
      this.logger.info(`⏸️ 订阅 [${subscription.title}] 已禁用，跳过检查`);
      return;
    }
    await this.checkFeed(subscription);
  }

  /**
   * 取消调度
   */
  cancelCheck(id) {
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }

  /**
   * 检查单个 Feed
   */
  async checkFeed(subscription) {
    this.logger.info(`🔄 检查订阅: ${subscription.title} (${subscription.url})`);

    try {
      const result = await this.parseRssFeed(subscription.url);

      if (!result.success) {
        this.updateSubscriptionStatus(subscription.id, null, result.error);
        return;
      }

      let items = result.items || [];

      // 应用关键词过滤
      if (subscription.keywords) {
        const { whitelist, blacklist } = subscription.keywords;

        if (whitelist && whitelist.length > 0) {
          items = items.filter(item => {
            const text = `${item.title} ${item.description} ${item.content}`.toLowerCase();
            return whitelist.some(kw => text.includes(kw.toLowerCase()));
          });
        }

        if (blacklist && blacklist.length > 0) {
          items = items.filter(item => {
            const text = `${item.title} ${item.description} ${item.content}`.toLowerCase();
            return !blacklist.some(kw => text.includes(kw.toLowerCase()));
          });
        }
      }

      // 检查新项目
      const seenSet = this.seenItems.get(subscription.id) || new Set();
      const newItems = items.filter(item => !seenSet.has(item.id));

      if (newItems.length > 0) {
        // 标记为已读
        for (const item of newItems) {
          seenSet.add(item.id);
        }
        this.seenItems.set(subscription.id, seenSet);
        this.saveSeenItems();

        // 首次检查时只标记不推送，避免刷屏
        if (subscription.isFirstCheck) {
          this.logger.info(`🆕 [${subscription.title}] 首次检查，标记 ${newItems.length} 条已读（不推送）`);
          storage.addLog('info', `[${subscription.title}] 首次检查，标记 ${newItems.length} 条已读`, 'rss');
          // 清除首次检查标志
          this.updateSubscription(subscription.id, { isFirstCheck: false });
        } else {
          this.logger.info(`📰 [${subscription.title}] 发现 ${newItems.length} 条新内容`);
          storage.addLog('info', `[${subscription.title}] 发现 ${newItems.length} 条新内容`, 'rss');
          // 触发回调推送
          if (this.onNewItems) {
            this.onNewItems(subscription, newItems);
          }
        }
      } else {
        this.logger.info(`✓ [${subscription.title}] 无新内容`);
        // 首次检查完成后也要清除标志
        if (subscription.isFirstCheck) {
          storage.addLog('info', `[${subscription.title}] 首次检查完成，无新内容`, 'rss');
          this.updateSubscription(subscription.id, { isFirstCheck: false });
        }
      }

      this.updateSubscriptionStatus(subscription.id, new Date().toISOString(), null);
    } catch (error) {
      this.logger.error(`❌ 检查订阅失败 [${subscription.title}]: ${error.message}`);
      storage.addLog('error', `[${subscription.title}] 检查失败: ${error.message}`, 'rss');
      this.updateSubscriptionStatus(subscription.id, null, error.message);
    }
  }

  /**
   * 更新订阅状态
   */
  updateSubscriptionStatus(id, lastCheck, lastError) {
    const subscriptions = this.getSubscriptions();
    const index = subscriptions.findIndex(s => s.id === id);
    if (index !== -1) {
      if (lastCheck) subscriptions[index].lastCheck = lastCheck;
      if (lastError !== undefined) subscriptions[index].lastError = lastError;
      this.saveSubscriptions(subscriptions);
    }
  }

  /**
   * 启动所有订阅的调度
   */
  startAll() {
    const subscriptions = this.getSubscriptions();
    this.logger.info(`🚀 启动 RSS 调度器，共 ${subscriptions.length} 个订阅`);

    for (const sub of subscriptions) {
      if (sub.enabled) {
        this.scheduleCheck(sub);
      }
    }
  }

  /**
   * 停止所有调度
   */
  stopAll() {
    this.logger.info('⏹️ 停止所有 RSS 调度');
    for (const [id, timer] of this.timers.entries()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /**
   * 立即刷新所有订阅
   */
  async refreshAll() {
    const subscriptions = this.getSubscriptions();
    this.logger.info(`🔄 手动刷新全部 ${subscriptions.length} 个订阅`);

    for (const sub of subscriptions) {
      if (sub.enabled) {
        await this.checkFeed(sub);
      }
    }
  }

  /**
   * 立即刷新单个订阅
   */
  async refreshSubscription(id) {
    const sub = this.getSubscriptions().find(s => s.id === id);
    if (!sub) {
      throw new Error('订阅不存在');
    }
    this.logger.info(`🔄 手动刷新订阅: ${sub.title}`);
    await this.checkFeed(sub);
  }

  /**
   * 获取新项目历史
   */
  getNewItemsHistory() {
    // 从文件读取最近的新项目
    const historyFile = path.join(this.dataPath, 'new_items_history.json');
    try {
      if (fs.existsSync(historyFile)) {
        return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
      }
    } catch (error) {
      this.logger.error(`读取历史失败: ${error.message}`);
    }
    return [];
  }

  /**
   * 保存新项目到历史
   */
  saveNewItemToHistory(subscription, item) {
    const historyFile = path.join(this.dataPath, 'new_items_history.json');
    try {
      let history = this.getNewItemsHistory();
      history.unshift({
        feedId: subscription.id,
        feedTitle: subscription.title,
        item,
        foundAt: new Date().toISOString(),
      });
      // 只保留最近 200 条
      history = history.slice(0, 200);
      fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      this.logger.error(`保存历史失败: ${error.message}`);
    }
  }
}

module.exports = RssScheduler;
