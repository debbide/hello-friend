/**
 * NodeSeek 抽奖监控命令
 */
const storage = require('../storage');

function setup(bot, { logger }) {
  // /start 或 /help 显示帮助（仅针对 nodeseek 相关）
  bot.command('nshelp', (ctx) => {
    ctx.reply(
      `🎰 <b>NodeSeek 抽奖监控</b>\n\n` +
      `<b>绑定命令：</b>\n` +
      `<code>/bindns 用户名</code> - 绑定 NodeSeek 用户名（支持多个）\n` +
      `<code>/unbindns 用户名</code> - 解除指定用户名绑定\n` +
      `<code>/unbindall</code> - 解除所有绑定\n` +
      `<code>/nsstatus</code> - 查看当前绑定状态\n\n` +
      `<b>监控命令：</b>\n` +
      `<code>/watchns 链接</code> - 添加抽奖帖监控\n` +
      `<code>/unwatchns 帖子ID</code> - 取消监控\n` +
      `<code>/nslist</code> - 查看监控列表\n\n` +
      `💡 绑定后，当您在 NodeSeek 抽奖中奖时，机器人会第一时间通知您！`,
      { parse_mode: 'HTML' }
    );
  });

  // 绑定用户名
  bot.command('bindns', (ctx) => {
    const username = ctx.message.text.split(' ').slice(1).join(' ').trim();
    const telegramId = ctx.from.id.toString();

    if (!username) {
      return ctx.reply(
        '❌ 请提供 NodeSeek 用户名\n\n' +
        '用法：<code>/bindns 用户名</code>',
        { parse_mode: 'HTML' }
      );
    }

    const result = storage.bindNodeSeekUser(telegramId, username);

    if (result.success) {
      storage.addLog('info', `NodeSeek 绑定: ${username} (TG: ${telegramId})`, 'nodeseek');
      ctx.reply(
        `✅ 已绑定 NodeSeek 用户名 '<b>${username}</b>'\n` +
        `当前共绑定 ${result.count} 个用户名。`,
        { parse_mode: 'HTML' }
      );
    } else {
      ctx.reply(`❌ ${result.error}`);
    }
  });

  // 解绑指定用户名
  bot.command('unbindns', (ctx) => {
    const username = ctx.message.text.split(' ').slice(1).join(' ').trim();
    const telegramId = ctx.from.id.toString();

    if (!username) {
      return ctx.reply(
        '❌ 请提供要解绑的用户名\n\n' +
        '用法：<code>/unbindns 用户名</code>',
        { parse_mode: 'HTML' }
      );
    }

    const result = storage.unbindNodeSeekUser(telegramId, username);

    if (result.success) {
      storage.addLog('info', `NodeSeek 解绑: ${username} (TG: ${telegramId})`, 'nodeseek');
      ctx.reply(
        `✅ 已解绑用户名 '<b>${username}</b>'\n` +
        `当前还绑定 ${result.count} 个用户名。`,
        { parse_mode: 'HTML' }
      );
    } else {
      ctx.reply(`❌ ${result.error}`);
    }
  });

  // 解绑所有用户名
  bot.command('unbindall', (ctx) => {
    const telegramId = ctx.from.id.toString();
    const result = storage.unbindAllNodeSeekUsers(telegramId);

    if (result.success) {
      storage.addLog('info', `NodeSeek 解绑全部: ${result.count}个 (TG: ${telegramId})`, 'nodeseek');
      ctx.reply(`✅ 已解除所有绑定（共 ${result.count} 个用户名）。`);
    } else {
      ctx.reply(`❌ ${result.error}`);
    }
  });

  // 查看绑定状态
  bot.command('nsstatus', (ctx) => {
    const telegramId = ctx.from.id.toString();
    const usernames = storage.getNodeSeekUserBindings(telegramId);

    if (usernames.length === 0) {
      return ctx.reply(
        '📋 您还没有绑定任何 NodeSeek 用户名。\n\n' +
        '使用 <code>/bindns 用户名</code> 来绑定。',
        { parse_mode: 'HTML' }
      );
    }

    const list = usernames.map((u, i) => `${i + 1}. ${u}`).join('\n');
    ctx.reply(
      `📋 <b>当前绑定的 NodeSeek 用户名（${usernames.length}个）：</b>\n\n${list}`,
      { parse_mode: 'HTML' }
    );
  });

  // 添加抽奖帖监控
  bot.command('watchns', async (ctx) => {
    const input = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!input) {
      return ctx.reply(
        '❌ 请提供抽奖帖链接\n\n' +
        '用法：<code>/watchns https://www.nodeseek.com/post-12345</code>\n' +
        '或者：<code>/watchns https://www.nodeseek.com/lucky?post=12345&...</code>',
        { parse_mode: 'HTML' }
      );
    }

    // 解析帖子 ID
    let postId = null;
    let luckyUrl = null;

    // 尝试从 lucky 链接解析
    const luckyMatch = input.match(/[?&]post=(\d+)/);
    if (luckyMatch) {
      postId = luckyMatch[1];
      luckyUrl = input;
    }

    // 尝试从帖子链接解析
    const postMatch = input.match(/post-(\d+)/);
    if (postMatch) {
      postId = postMatch[1];
    }

    if (!postId) {
      return ctx.reply('❌ 无法解析帖子 ID，请检查链接格式');
    }

    // 添加到监控
    const result = storage.addNodeSeekLottery(postId, `帖子 #${postId}`, luckyUrl || input);

    if (result.success) {
      storage.addLog('info', `NodeSeek 添加监控: 帖子 #${postId}`, 'nodeseek');
      ctx.reply(
        `✅ 已添加监控\n\n` +
        `📝 帖子 ID: ${postId}\n` +
        `🔗 链接: ${luckyUrl || input}\n\n` +
        `机器人将定期检查该抽奖结果。`,
        { parse_mode: 'HTML' }
      );
    } else {
      ctx.reply(`❌ ${result.error}`);
    }
  });

  // 取消监控
  bot.command('unwatchns', (ctx) => {
    const postId = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!postId) {
      return ctx.reply(
        '❌ 请提供帖子 ID\n\n' +
        '用法：<code>/unwatchns 12345</code>',
        { parse_mode: 'HTML' }
      );
    }

    const deleted = storage.deleteNodeSeekLottery(postId);

    if (deleted) {
      storage.addLog('info', `NodeSeek 取消监控: 帖子 #${postId}`, 'nodeseek');
      ctx.reply(`✅ 已取消监控帖子 #${postId}`);
    } else {
      ctx.reply('❌ 未找到该帖子的监控记录');
    }
  });

  // 查看监控列表
  bot.command('nslist', (ctx) => {
    const lotteries = storage.getNodeSeekLotteries();

    if (lotteries.length === 0) {
      return ctx.reply(
        '📋 当前没有监控任何抽奖帖。\n\n' +
        '使用 <code>/watchns 链接</code> 来添加监控。',
        { parse_mode: 'HTML' }
      );
    }

    const list = lotteries.map((l, i) => {
      const lastCheck = l.lastCheck
        ? new Date(l.lastCheck).toLocaleString('zh-CN')
        : '从未';
      return `${i + 1}. <b>${l.title}</b>\n   ID: ${l.postId} | 上次检查: ${lastCheck}`;
    }).join('\n\n');

    ctx.reply(
      `📋 <b>监控中的抽奖帖（${lotteries.length}个）：</b>\n\n${list}`,
      { parse_mode: 'HTML' }
    );
  });

  logger.info('🎰 NodeSeek 抽奖监控命令已加载');
}

module.exports = { setup };
