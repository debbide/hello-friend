/**
 * 命令加载器 - 动态加载所有命令模块
 */
const storage = require('../storage');

function loadCommands(bot, ctx) {
  const { isAdmin, scheduler, logger, settings } = ctx;

  // 添加命令统计中间件 - 在所有命令处理前执行
  bot.use((ctx, next) => {
    if (ctx.message?.text) {
      const text = ctx.message.text;
      // 检测是否为命令
      if (text.startsWith('/')) {
        const command = text.split(' ')[0].split('@')[0]; // /rss@botname -> /rss
        storage.incrementCommand(command);
        storage.addLog('info', `命令执行: ${command}`, 'command');
      }
    }
    return next();
  });

  // 加载各命令模块
  require('./start').setup(bot, ctx);
  require('./rss').setup(bot, ctx);
  require('./tools').setup(bot, ctx);
  require('./ai').setup(bot, ctx);
  require('./remind').setup(bot, ctx);
  require('./inline').setup(bot, ctx);     // 内联模式
  require('./menu').setup(bot, ctx);       // 命令菜单注册
  require('./translate').setup(bot, ctx);  // 翻译
  require('./note').setup(bot, ctx);       // 备忘录
  require('./github').setup(bot, ctx);     // GitHub 仓库监控

  logger.info('✅ 所有命令模块已加载');
}

module.exports = { loadCommands };
