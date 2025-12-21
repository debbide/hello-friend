/**
 * 命令加载器 - 动态加载所有命令模块
 */

function loadCommands(bot, ctx) {
  const { isAdmin, scheduler, logger, settings } = ctx;

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

  logger.info('✅ 所有命令模块已加载');
}

module.exports = { loadCommands };
