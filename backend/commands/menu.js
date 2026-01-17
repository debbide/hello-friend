/**
 * Bot 命令菜单注册 - 将命令显示在 Telegram 菜单中
 */
function setup(bot, { logger }) {
  // 注册 Bot Commands 菜单
  const commands = [
    { command: 'start', description: '🏠 开始 / 主菜单' },
    { command: 'help', description: '❓ 帮助信息' },
    { command: 'rss', description: '📰 RSS 订阅管理' },
    { command: 'chat', description: '💬 AI 对话' },
    { command: 'sum', description: '📝 智能摘要' },
    { command: 'remind', description: '⏰ 设置提醒' },
    { command: 'reminders', description: '📋 查看提醒列表' },
    { command: 'stickers', description: '🎨 我的贴纸收藏' },
    { command: 'createpack', description: '📦 创建贴纸包' },
    { command: 'mypack', description: '📦 查看我的贴纸包' },
    { command: 'weather', description: '🌤️ 天气查询' },
    { command: 'rate', description: '💰 汇率换算' },
    { command: 'qr', description: '📱 生成二维码' },
    { command: 'ip', description: '🌍 IP 查询' },
    { command: 'short', description: '🔗 短链接生成' },
    { command: 'id', description: '🆔 获取 ID' },
    { command: 'ghhelp', description: '🐙 GitHub 监控帮助' },
    { command: 'ghwatch', description: '👁️ 监控 GitHub 仓库' },
    { command: 'ghlist', description: '📋 查看监控列表' },
  ];

  // 启动时设置菜单
  bot.telegram.setMyCommands(commands)
    .then(() => logger.info('📋 Bot 命令菜单已注册'))
    .catch(err => logger.error(`❌ 注册命令菜单失败: ${err.message}`));

  logger.info('📋 Menu 命令已加载');
}

module.exports = { setup };
