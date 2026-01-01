/**
 * NodeSeek 抽奖监控模块
 * 定期检查抽奖结果，通知中奖用户
 */
const cheerio = require('cheerio');
const storage = require('./storage');

class NodeSeekLotteryMonitor {
  constructor(logger, onWinnerFound) {
    this.logger = logger;
    this.onWinnerFound = onWinnerFound;
    this.timer = null;
    this.checkInterval = 5 * 60 * 1000; // 默认 5 分钟检查一次
  }

  /**
   * 启动监控
   */
  start() {
    if (this.timer) {
      this.stop();
    }

    this.logger.info('🎰 启动 NodeSeek 抽奖监控');

    // 立即执行一次
    this.checkAllLotteries();

    // 定时检查
    this.timer = setInterval(() => {
      this.checkAllLotteries();
    }, this.checkInterval);
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('⏹️ 停止 NodeSeek 抽奖监控');
    }
  }

  /**
   * 检查所有监控的抽奖帖
   */
  async checkAllLotteries() {
    const lotteries = storage.getNodeSeekLotteries();

    if (lotteries.length === 0) {
      return;
    }

    this.logger.info(`🔄 检查 ${lotteries.length} 个抽奖帖...`);

    for (const lottery of lotteries) {
      try {
        await this.checkLottery(lottery);
      } catch (error) {
        this.logger.error(`检查抽奖 ${lottery.postId} 失败: ${error.message}`);
        storage.addLog('error', `检查抽奖 #${lottery.postId} 失败: ${error.message}`, 'nodeseek');
      }
    }
  }

  /**
   * 检查单个抽奖帖
   */
  async checkLottery(lottery) {
    const luckyUrl = this.buildLuckyUrl(lottery.postId, lottery.luckyUrl);

    this.logger.info(`🎲 检查抽奖: ${lottery.title} (${luckyUrl})`);

    try {
      const winners = await this.fetchLotteryWinners(luckyUrl);

      // 更新检查时间
      storage.updateNodeSeekLottery(lottery.postId, {
        lastCheck: new Date().toISOString(),
      });

      if (winners.length === 0) {
        this.logger.info(`  ⏳ 暂无中奖者或抽奖未开始`);
        return;
      }

      this.logger.info(`  🎉 发现 ${winners.length} 位中奖者`);

      // 获取所有绑定的用户
      const allBindings = storage.getAllNodeSeekUsernames();

      // 检查中奖者中是否有绑定的用户
      for (const winner of winners) {
        // 检查是否已通知过
        if (storage.hasNodeSeekWinnerNotified(lottery.postId, winner.username)) {
          continue;
        }

        // 查找对应的 Telegram 用户
        const telegramId = storage.findTelegramIdByNodeSeekUsername(winner.username);

        if (telegramId) {
          this.logger.info(`  📣 中奖通知: ${winner.username} -> TG ${telegramId}`);

          // 调用回调发送通知
          if (this.onWinnerFound) {
            await this.onWinnerFound({
              telegramId,
              lottery,
              winner,
            });
          }

          // 标记已通知
          storage.addNodeSeekWinner(lottery.postId, winner.username);
          storage.addLog('info', `中奖通知: ${winner.username} 在 #${lottery.postId} 中奖`, 'nodeseek');
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * 构建 Lucky 页面 URL
   */
  buildLuckyUrl(postId, savedUrl) {
    // 如果已保存完整的 lucky URL，直接使用
    if (savedUrl && savedUrl.includes('lucky')) {
      return savedUrl;
    }
    // 否则构建一个基础 URL
    return `https://www.nodeseek.com/lucky?post=${postId}`;
  }

  /**
   * 抓取抽奖页面，解析中奖者
   */
  async fetchLotteryWinners(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://www.nodeseek.com/',
        },
        timeout: 30000,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parseWinners(html);
    } catch (error) {
      this.logger.error(`抓取页面失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 解析页面 HTML，提取中奖者信息
   */
  parseWinners(html) {
    const $ = cheerio.load(html);
    const winners = [];

    // NodeSeek 抽奖页面的可能结构
    // 1. 尝试查找中奖者列表 - 常见的表格结构
    $('table tbody tr').each((i, el) => {
      const cells = $(el).find('td');
      if (cells.length >= 2) {
        const usernameCell = $(cells[0]);
        const prizeCell = $(cells[1]);

        // 提取用户名（可能在链接中）
        let username = usernameCell.find('a').text().trim() || usernameCell.text().trim();
        let prize = prizeCell.text().trim();

        if (username) {
          winners.push({ username, prize, position: i + 1 });
        }
      }
    });

    // 2. 尝试查找卡片式布局的中奖者
    if (winners.length === 0) {
      $('.winner-item, .lottery-winner, .lucky-user').each((i, el) => {
        const $el = $(el);
        const username = $el.find('.username, .user-name, a[href*="profile"]').text().trim()
          || $el.find('a').first().text().trim();
        const prize = $el.find('.prize, .reward').text().trim() || '中奖';

        if (username) {
          winners.push({ username, prize, position: i + 1 });
        }
      });
    }

    // 3. 尝试通用的列表结构
    if (winners.length === 0) {
      $('.list-group-item, .result-item').each((i, el) => {
        const $el = $(el);
        const text = $el.text();
        // 尝试从文本中提取用户名
        const match = text.match(/(?:用户|@)?([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*(?:中奖|获得|抽中)/);
        if (match) {
          winners.push({ username: match[1], prize: '中奖', position: i + 1 });
        }
      });
    }

    // 4. 检查是否有 JSON 数据嵌入页面
    if (winners.length === 0) {
      const scriptContent = $('script:not([src])').text();
      const jsonMatch = scriptContent.match(/(?:winners|luckyUsers|result)\s*[=:]\s*(\[[^\]]+\])/);
      if (jsonMatch) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          for (const item of data) {
            if (typeof item === 'string') {
              winners.push({ username: item, prize: '中奖', position: winners.length + 1 });
            } else if (item.username || item.name || item.user) {
              winners.push({
                username: item.username || item.name || item.user,
                prize: item.prize || item.reward || '中奖',
                position: winners.length + 1,
              });
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    // 5. NodeSeek 特定结构 - 基于已知页面结构
    if (winners.length === 0) {
      // 尝试匹配 NodeSeek 的抽奖结果样式
      $('.nsk-card, .post-content').find('strong, b').each((i, el) => {
        const text = $(el).parent().text();
        if (text.includes('中奖') || text.includes('获奖') || text.includes('抽中')) {
          const username = $(el).text().trim();
          if (username && !username.includes('中奖') && !username.includes('恭喜')) {
            winners.push({ username, prize: '中奖', position: i + 1 });
          }
        }
      });
    }

    // 6. 处理 "@用户名" 格式
    if (winners.length === 0) {
      const bodyText = $('body').text();
      const atMatches = bodyText.match(/@([a-zA-Z0-9_]+)/g);
      if (atMatches) {
        // 去重
        const uniqueUsers = [...new Set(atMatches.map(m => m.substring(1)))];
        // 检查上下文是否包含中奖相关词
        for (const username of uniqueUsers) {
          const context = bodyText.substring(
            Math.max(0, bodyText.indexOf(`@${username}`) - 50),
            bodyText.indexOf(`@${username}`) + username.length + 50
          );
          if (context.includes('中奖') || context.includes('恭喜') || context.includes('获得') || context.includes('抽中')) {
            winners.push({ username, prize: '中奖', position: winners.length + 1 });
          }
        }
      }
    }

    return winners;
  }

  /**
   * 手动检查单个抽奖帖
   */
  async refreshLottery(postId) {
    const lotteries = storage.getNodeSeekLotteries();
    const lottery = lotteries.find(l => l.postId === postId);

    if (!lottery) {
      throw new Error('抽奖帖不存在');
    }

    return await this.checkLottery(lottery);
  }

  /**
   * 获取抽奖帖详情（包含中奖者）
   */
  async getLotteryDetails(postId) {
    const lotteries = storage.getNodeSeekLotteries();
    const lottery = lotteries.find(l => l.postId === postId);

    if (!lottery) {
      return null;
    }

    const luckyUrl = this.buildLuckyUrl(lottery.postId, lottery.luckyUrl);

    try {
      const winners = await this.fetchLotteryWinners(luckyUrl);
      return {
        ...lottery,
        currentWinners: winners,
      };
    } catch (error) {
      return {
        ...lottery,
        currentWinners: [],
        error: error.message,
      };
    }
  }

  /**
   * 格式化中奖通知消息
   */
  formatWinnerMessage(data) {
    const { lottery, winner } = data;
    const postUrl = `https://www.nodeseek.com/post-${lottery.postId}`;

    const lines = [
      `🎉 <b>恭喜中奖！</b>`,
      ``,
      `📌 <b>抽奖帖：</b>${lottery.title}`,
      `👤 <b>中奖用户：</b>${winner.username}`,
      winner.prize ? `🎁 <b>奖品：</b>${winner.prize}` : '',
      winner.position ? `📊 <b>名次：</b>第 ${winner.position} 位` : '',
      ``,
      `🔗 <a href="${postUrl}">查看帖子</a>`,
      ``,
      `<i>检测于 ${new Date().toLocaleString('zh-CN')}</i>`,
    ];

    return lines.filter(Boolean).join('\n');
  }
}

module.exports = NodeSeekLotteryMonitor;
