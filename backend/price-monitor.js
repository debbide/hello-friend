/**
 * 价格监控模块
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

class PriceMonitor {
  constructor(logger, onPriceChange) {
    this.logger = logger;
    this.onPriceChange = onPriceChange;
    this.dataPath = process.env.DATA_PATH || './data';
    this.itemsFile = path.join(this.dataPath, 'price_monitors.json');
    this.historyFile = path.join(this.dataPath, 'price_history.json');
    this.timers = new Map();

    this.ensureDataDir();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  /**
   * 获取所有监控项
   */
  getItems() {
    try {
      if (fs.existsSync(this.itemsFile)) {
        return JSON.parse(fs.readFileSync(this.itemsFile, 'utf-8'));
      }
    } catch (error) {
      this.logger.error(`读取价格监控列表失败: ${error.message}`);
    }
    return [];
  }

  /**
   * 保存监控项
   */
  saveItems(items) {
    try {
      fs.writeFileSync(this.itemsFile, JSON.stringify(items, null, 2));
    } catch (error) {
      this.logger.error(`保存价格监控列表失败: ${error.message}`);
    }
  }

  /**
   * 获取价格历史
   */
  getHistory(itemId) {
    try {
      if (fs.existsSync(this.historyFile)) {
        const history = JSON.parse(fs.readFileSync(this.historyFile, 'utf-8'));
        if (itemId) {
          return history[itemId] || [];
        }
        return history;
      }
    } catch (error) {
      this.logger.error(`读取价格历史失败: ${error.message}`);
    }
    return itemId ? [] : {};
  }

  /**
   * 保存价格到历史
   */
  saveToHistory(itemId, price) {
    try {
      const history = this.getHistory();
      if (!history[itemId]) {
        history[itemId] = [];
      }
      history[itemId].push({
        price,
        timestamp: new Date().toISOString(),
      });
      // 每个商品只保留最近 100 条记录
      if (history[itemId].length > 100) {
        history[itemId] = history[itemId].slice(-100);
      }
      fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
    } catch (error) {
      this.logger.error(`保存价格历史失败: ${error.message}`);
    }
  }

  /**
   * 添加监控项
   */
  addItem(item) {
    const items = this.getItems();
    const id = `price_${Date.now()}`;
    const newItem = {
      id,
      name: item.name || '未命名商品',
      url: item.url,
      selector: item.selector,
      interval: item.interval || 60, // 默认 60 分钟
      enabled: item.enabled !== false,
      notifyOnAnyChange: item.notifyOnAnyChange !== false,
      notifyOnDrop: item.notifyOnDrop || false,
      dropThreshold: item.dropThreshold || 0, // 降价百分比阈值
      targetPrice: item.targetPrice || null, // 目标价格
      currentPrice: null,
      lastPrice: null,
      lastCheck: null,
      lastError: null,
      createdAt: new Date().toISOString(),
    };

    items.push(newItem);
    this.saveItems(items);

    this.logger.info(`✅ 添加价格监控: ${newItem.name} (${newItem.url})`);

    if (newItem.enabled) {
      this.scheduleCheck(newItem);
    }

    return newItem;
  }

  /**
   * 更新监控项
   */
  updateItem(id, updates) {
    const items = this.getItems();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) {
      return null;
    }

    const oldItem = items[index];
    const newItem = { ...oldItem, ...updates, id };
    items[index] = newItem;
    this.saveItems(items);

    // 重新调度
    this.cancelCheck(id);
    if (newItem.enabled) {
      this.scheduleCheck(newItem);
    }

    return newItem;
  }

  /**
   * 删除监控项
   */
  deleteItem(id) {
    const items = this.getItems();
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length === items.length) {
      return false;
    }

    this.saveItems(filtered);
    this.cancelCheck(id);

    // 清除历史
    const history = this.getHistory();
    delete history[id];
    fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));

    return true;
  }

  /**
   * 调度价格检查
   */
  scheduleCheck(item) {
    const intervalMs = (item.interval || 60) * 60 * 1000;

    this.logger.info(`⏰ 调度价格监控 [${item.name}] 每 ${item.interval} 分钟检查一次`);

    // 立即执行一次
    this.checkPrice(item.id);

    // 设置定时器
    const timer = setInterval(() => {
      this.checkPrice(item.id);
    }, intervalMs);

    this.timers.set(item.id, timer);
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
   * 检查单个商品价格
   */
  async checkPrice(id) {
    const item = this.getItems().find(i => i.id === id);
    if (!item) {
      this.cancelCheck(id);
      return;
    }

    if (!item.enabled) {
      return;
    }

    this.logger.info(`🔍 检查价格: ${item.name}`);

    try {
      const price = await this.fetchPrice(item.url, item.selector);

      if (price === null) {
        this.updateItemStatus(id, null, '无法提取价格');
        return;
      }

      const lastPrice = item.currentPrice;
      const priceChanged = lastPrice !== null && lastPrice !== price;
      const priceDropped = lastPrice !== null && price < lastPrice;
      const dropPercent = lastPrice ? ((lastPrice - price) / lastPrice * 100) : 0;

      // 更新当前价格
      this.updateItemStatus(id, price, null);
      this.saveToHistory(id, price);

      // 检查是否需要通知
      let shouldNotify = false;
      let notifyReason = '';

      if (item.targetPrice && price <= item.targetPrice) {
        shouldNotify = true;
        notifyReason = `已达到目标价格 ¥${item.targetPrice}`;
      } else if (item.notifyOnDrop && priceDropped && dropPercent >= (item.dropThreshold || 0)) {
        shouldNotify = true;
        notifyReason = `降价 ${dropPercent.toFixed(1)}%`;
      } else if (item.notifyOnAnyChange && priceChanged) {
        shouldNotify = true;
        notifyReason = priceDropped ? '价格下降' : '价格上涨';
      }

      if (shouldNotify && this.onPriceChange) {
        this.onPriceChange({
          item: { ...item, currentPrice: price, lastPrice },
          oldPrice: lastPrice,
          newPrice: price,
          reason: notifyReason,
        });
      }

      this.logger.info(`✓ [${item.name}] 当前价格: ¥${price}${priceChanged ? ` (之前: ¥${lastPrice})` : ''}`);
    } catch (error) {
      this.logger.error(`❌ 检查价格失败 [${item.name}]: ${error.message}`);
      this.updateItemStatus(id, null, error.message);
    }
  }

  /**
   * 从网页提取价格
   */
  async fetchPrice(url, selector) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        timeout: 30000,
      });

      const html = await response.text();
      const $ = cheerio.load(html);

      // 获取价格文本
      let priceText = $(selector).text().trim();

      if (!priceText) {
        // 尝试获取属性值
        priceText = $(selector).attr('content') || $(selector).attr('data-price') || '';
      }

      if (!priceText) {
        return null;
      }

      // 提取数字
      const price = this.parsePrice(priceText);
      return price;
    } catch (error) {
      this.logger.error(`获取价格失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 解析价格字符串
   */
  parsePrice(text) {
    // 移除货币符号和空格
    const cleaned = text.replace(/[¥$€£￥\s,]/g, '');
    // 匹配数字（包括小数）
    const match = cleaned.match(/(\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return null;
  }

  /**
   * 更新监控项状态
   */
  updateItemStatus(id, price, error) {
    const items = this.getItems();
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
      if (price !== null) {
        items[index].lastPrice = items[index].currentPrice;
        items[index].currentPrice = price;
      }
      items[index].lastCheck = new Date().toISOString();
      items[index].lastError = error;
      this.saveItems(items);
    }
  }

  /**
   * 启动所有监控
   */
  startAll() {
    const items = this.getItems();
    this.logger.info(`🚀 启动价格监控，共 ${items.length} 个商品`);

    for (const item of items) {
      if (item.enabled) {
        this.scheduleCheck(item);
      }
    }
  }

  /**
   * 停止所有监控
   */
  stopAll() {
    this.logger.info('⏹️ 停止所有价格监控');
    for (const [id, timer] of this.timers.entries()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /**
   * 手动刷新单个商品
   */
  async refreshItem(id) {
    const item = this.getItems().find(i => i.id === id);
    if (!item) {
      throw new Error('商品不存在');
    }
    await this.checkPrice(id);
    return this.getItems().find(i => i.id === id);
  }

  /**
   * 格式化价格变动消息
   */
  formatPriceChangeMessage(data) {
    const { item, oldPrice, newPrice, reason } = data;
    const arrow = newPrice < oldPrice ? '📉' : '📈';
    const diff = newPrice - oldPrice;
    const diffPercent = oldPrice ? ((diff / oldPrice) * 100).toFixed(1) : 0;

    const lines = [
      `${arrow} <b>价格变动提醒</b>`,
      '',
      `📦 <b>${item.name}</b>`,
      '',
      `💰 当前价格: <b>¥${newPrice}</b>`,
      oldPrice ? `📊 之前价格: ¥${oldPrice}` : '',
      oldPrice ? `${diff < 0 ? '⬇️ 降价' : '⬆️ 涨价'}: ¥${Math.abs(diff).toFixed(2)} (${diffPercent}%)` : '',
      item.targetPrice ? `🎯 目标价格: ¥${item.targetPrice}` : '',
      '',
      `📝 ${reason}`,
      '',
      `🔗 <a href="${item.url}">查看商品</a>`,
      '',
      `<i>更新于 ${new Date().toLocaleString('zh-CN')}</i>`,
    ];

    return lines.filter(Boolean).join('\n');
  }
}

module.exports = PriceMonitor;
