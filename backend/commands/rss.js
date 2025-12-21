/**
 * RSS 订阅命令 - 增强版（内联按钮 + 分页 + 预览）
 */
const { parseRssFeed } = require('../rss-parser');

const PAGE_SIZE = 5;

// 生成订阅列表内联按钮
function generateListButtons(feeds, page = 0, chatId) {
  const totalPages = Math.ceil(feeds.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageFeeds = feeds.slice(start, start + PAGE_SIZE);
  
  const buttons = pageFeeds.map((f) => {
    const status = f.enabled ? '✅' : '⏸️';
    return [
      { text: `${status} ${(f.title || '未知').substring(0, 20)}`, callback_data: `rss_detail_${f.id}` },
      { text: f.enabled ? '⏸️' : '▶️', callback_data: `rss_toggle_${f.id}` },
      { text: '🔄', callback_data: `rss_refresh_${f.id}` },
      { text: '🗑️', callback_data: `rss_del_${f.id}` },
    ];
  });

  // 分页按钮
  const navRow = [];
  if (page > 0) {
    navRow.push({ text: '◀️ 上一页', callback_data: `rss_page_${page - 1}` });
  }
  navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'rss_noop' });
  if (page < totalPages - 1) {
    navRow.push({ text: '下一页 ▶️', callback_data: `rss_page_${page + 1}` });
  }
  
  if (navRow.length > 1) {
    buttons.push(navRow);
  }
  
  // 操作按钮
  buttons.push([
    { text: '🔄 刷新全部', callback_data: 'rss_refresh_all' },
    { text: '➕ 添加订阅', callback_data: 'rss_add_prompt' },
  ]);

  return buttons;
}

// 生成订阅详情按钮
function generateDetailButtons(sub) {
  return [
    [
      { text: sub.enabled ? '⏸️ 暂停' : '▶️ 启用', callback_data: `rss_toggle_${sub.id}` },
      { text: '🔄 立即刷新', callback_data: `rss_refresh_${sub.id}` },
    ],
    [
      { text: '⏱️ 修改间隔', callback_data: `rss_interval_${sub.id}` },
      { text: '🔑 关键词', callback_data: `rss_kw_${sub.id}` },
    ],
    [
      { text: '🗑️ 删除订阅', callback_data: `rss_del_confirm_${sub.id}` },
    ],
    [{ text: '🔙 返回列表', callback_data: 'rss_list_back' }],
  ];
}

function setup(bot, { scheduler, logger }) {
  // /rss 命令
  bot.command('rss', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1).filter(a => a.trim());
    const action = args[0];
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();

    if (!action) {
      const subs = scheduler.getSubscriptions().filter(s => s.chatId === chatId || s.userId === userId);
      
      if (subs.length === 0) {
        return ctx.reply(
          '📰 <b>RSS 订阅管理</b>\n\n' +
          '📭 暂无订阅\n\n' +
          '发送 <code>/rss add URL</code> 添加第一个订阅',
          { 
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '➕ 添加订阅', callback_data: 'rss_add_prompt' }]]
            }
          }
        );
      }
      
      return ctx.reply(
        `📰 <b>RSS 订阅管理</b>\n\n📊 共 ${subs.length} 个订阅\n\n点击订阅名查看详情，使用右侧按钮快速操作`,
        { 
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: generateListButtons(subs, 0, chatId) }
        }
      );
    }

    switch (action) {
      case 'add': {
        const url = args[1];
        if (!url) return ctx.reply('❌ 用法: /rss add <URL>');
        
        const loading = await ctx.reply('⏳ <i>正在解析 RSS 源...</i>', { parse_mode: 'HTML' });
        
        try {
          const result = await parseRssFeed(url);
          
          if (result.success) {
            const sub = scheduler.addSubscription({
              url,
              title: result.title,
              chatId,
              userId,
              interval: 30,
              enabled: true,
            });
            
            // 显示最新3条作为预览
            const preview = result.items?.slice(0, 3).map((item, i) => 
              `  ${i + 1}. ${(item.title || '无标题').substring(0, 40)}`
            ).join('\n') || '';
            
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              loading.message_id,
              null,
              `✅ <b>订阅成功</b>\n\n` +
              `📰 ${result.title}\n` +
              `🔗 <code>${url}</code>\n` +
              `🆔 ID: <code>${sub.id}</code>\n` +
              `⏱ 检查间隔: 30分钟\n\n` +
              `📋 <b>最新内容预览:</b>\n${preview || '(暂无)'}`,
              { 
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '🔄 立即刷新', callback_data: `rss_refresh_${sub.id}` },
                      { text: '📋 查看列表', callback_data: 'rss_list_back' },
                    ]
                  ]
                }
              }
            );
          } else {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              loading.message_id,
              null,
              `❌ <b>解析失败</b>\n\n${result.error}\n\n请检查 URL 是否正确`,
              { parse_mode: 'HTML' }
            );
          }
        } catch (e) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            loading.message_id,
            null,
            `❌ 解析出错: ${e.message}`
          );
        }
        break;
      }

      case 'list': {
        const feeds = scheduler.getSubscriptions().filter(s => s.chatId === chatId || s.userId === userId);
        if (feeds.length === 0) {
          return ctx.reply('📭 暂无订阅', {
            reply_markup: {
              inline_keyboard: [[{ text: '➕ 添加订阅', callback_data: 'rss_add_prompt' }]]
            }
          });
        }
        
        ctx.reply(
          `📰 <b>RSS 订阅列表</b>\n\n📊 共 ${feeds.length} 个订阅`,
          { 
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: generateListButtons(feeds, 0, chatId) }
          }
        );
        break;
      }

      case 'del': {
        const id = args[1];
        if (!id) return ctx.reply('❌ 用法: /rss del <ID>');
        
        const deleted = scheduler.deleteSubscription(id);
        ctx.reply(deleted ? `✅ 订阅已删除` : `❌ 未找到订阅`);
        break;
      }

      case 'interval': {
        const id = args[1];
        const minutes = parseInt(args[2]);
        if (!id || !minutes || minutes < 1 || minutes > 1440) {
          return ctx.reply('❌ 用法: /rss interval <ID> <分钟>\n范围: 1-1440');
        }
        
        const updated = scheduler.updateSubscription(id, { interval: minutes });
        if (updated) {
          ctx.reply(`✅ 检查间隔已设为 ${minutes} 分钟`);
        } else {
          ctx.reply('❌ 未找到订阅');
        }
        break;
      }

      case 'kw': {
        const id = args[1];
        const subAction = args[2];
        const input = args.slice(3).join(' ');
        
        if (!id || !subAction) {
          return ctx.reply('❌ 用法:\n/rss kw <ID> add 词1,词2\n/rss kw <ID> del 词1,词2\n/rss kw <ID> list');
        }

        const sub = scheduler.getSubscriptions().find(s => s.id === id);
        if (!sub) return ctx.reply('❌ 未找到订阅');

        const keywords = sub.keywords || { whitelist: [], blacklist: [] };

        if (subAction === 'add' && input) {
          const words = input.split(',').map(w => w.trim()).filter(Boolean);
          keywords.whitelist = [...new Set([...keywords.whitelist, ...words])];
          scheduler.updateSubscription(id, { keywords });
          ctx.reply(`✅ 已添加白名单: ${words.join(', ')}`);
        } else if (subAction === 'del' && input) {
          const words = input.split(',').map(w => w.trim()).filter(Boolean);
          keywords.whitelist = keywords.whitelist.filter(w => !words.includes(w));
          scheduler.updateSubscription(id, { keywords });
          ctx.reply(`✅ 已删除白名单: ${words.join(', ')}`);
        } else if (subAction === 'list') {
          ctx.reply(
            `📌 <b>关键词设置</b>\n\n` +
            `白名单: ${keywords.whitelist.length ? keywords.whitelist.join(', ') : '(无)'}\n` +
            `黑名单: ${keywords.blacklist.length ? keywords.blacklist.join(', ') : '(无)'}`,
            { parse_mode: 'HTML' }
          );
        }
        break;
      }

      case 'ex': {
        const id = args[1];
        const subAction = args[2];
        const input = args.slice(3).join(' ');
        
        if (!id || !subAction) {
          return ctx.reply('❌ 用法:\n/rss ex <ID> add 词1,词2\n/rss ex <ID> del 词1,词2');
        }

        const sub = scheduler.getSubscriptions().find(s => s.id === id);
        if (!sub) return ctx.reply('❌ 未找到订阅');

        const keywords = sub.keywords || { whitelist: [], blacklist: [] };

        if (subAction === 'add' && input) {
          const words = input.split(',').map(w => w.trim()).filter(Boolean);
          keywords.blacklist = [...new Set([...keywords.blacklist, ...words])];
          scheduler.updateSubscription(id, { keywords });
          ctx.reply(`✅ 已添加黑名单: ${words.join(', ')}`);
        } else if (subAction === 'del' && input) {
          const words = input.split(',').map(w => w.trim()).filter(Boolean);
          keywords.blacklist = keywords.blacklist.filter(w => !words.includes(w));
          scheduler.updateSubscription(id, { keywords });
          ctx.reply(`✅ 已删除黑名单: ${words.join(', ')}`);
        }
        break;
      }

      case 'refresh': {
        const msg = await ctx.reply('⏳ <i>正在刷新全部订阅...</i>', { parse_mode: 'HTML' });
        await scheduler.refreshAll();
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, '✅ 全部订阅刷新完成');
        break;
      }

      case 'enable': {
        const id = args[1];
        if (!id) return ctx.reply('❌ 用法: /rss enable <ID>');
        const updated = scheduler.updateSubscription(id, { enabled: true });
        ctx.reply(updated ? '✅ 订阅已启用' : '❌ 未找到订阅');
        break;
      }

      case 'disable': {
        const id = args[1];
        if (!id) return ctx.reply('❌ 用法: /rss disable <ID>');
        const updated = scheduler.updateSubscription(id, { enabled: false });
        ctx.reply(updated ? '✅ 订阅已暂停' : '❌ 未找到订阅');
        break;
      }

      default:
        ctx.reply('❌ 未知操作，发送 /rss 查看帮助');
    }
  });

  // === 内联按钮回调处理 ===

  // 分页
  bot.action(/^rss_page_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const page = parseInt(ctx.match[1]);
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();
    const feeds = scheduler.getSubscriptions().filter(s => s.chatId === chatId || s.userId === userId);
    
    await ctx.editMessageText(
      `📰 <b>RSS 订阅列表</b>\n\n📊 共 ${feeds.length} 个订阅`,
      { 
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateListButtons(feeds, page, chatId) }
      }
    );
  });

  // 返回列表
  bot.action('rss_list_back', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();
    const feeds = scheduler.getSubscriptions().filter(s => s.chatId === chatId || s.userId === userId);
    
    await ctx.editMessageText(
      `📰 <b>RSS 订阅列表</b>\n\n📊 共 ${feeds.length} 个订阅`,
      { 
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateListButtons(feeds, 0, chatId) }
      }
    );
  });

  // 订阅详情
  bot.action(/^rss_detail_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];
    const sub = scheduler.getSubscriptions().find(s => s.id === id);
    if (!sub) return ctx.answerCbQuery('❌ 订阅不存在');

    const lastCheck = sub.lastCheck ? new Date(sub.lastCheck).toLocaleString('zh-CN') : '从未';
    const keywords = sub.keywords || { whitelist: [], blacklist: [] };
    
    await ctx.editMessageText(
      `📰 <b>订阅详情</b>\n\n` +
      `📌 ${sub.title || '未知'}\n` +
      `🔗 <code>${sub.url}</code>\n` +
      `🆔 ID: <code>${sub.id}</code>\n\n` +
      `📊 状态: ${sub.enabled ? '✅ 启用' : '⏸️ 暂停'}\n` +
      `⏱ 检查间隔: ${sub.interval} 分钟\n` +
      `🕐 上次检查: ${lastCheck}\n\n` +
      `🔑 白名单: ${keywords.whitelist.length ? keywords.whitelist.join(', ') : '(无)'}\n` +
      `🚫 黑名单: ${keywords.blacklist.length ? keywords.blacklist.join(', ') : '(无)'}`,
      { 
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateDetailButtons(sub) }
      }
    );
  });

  // 切换启用/暂停
  bot.action(/^rss_toggle_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const sub = scheduler.getSubscriptions().find(s => s.id === id);
    if (!sub) return ctx.answerCbQuery('❌ 订阅不存在');

    const newEnabled = !sub.enabled;
    scheduler.updateSubscription(id, { enabled: newEnabled });
    await ctx.answerCbQuery(newEnabled ? '✅ 已启用' : '⏸️ 已暂停');
    
    // 刷新列表
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id.toString();
    const feeds = scheduler.getSubscriptions().filter(s => s.chatId === chatId || s.userId === userId);
    
    try {
      await ctx.editMessageText(
        `📰 <b>RSS 订阅列表</b>\n\n📊 共 ${feeds.length} 个订阅`,
        { 
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: generateListButtons(feeds, 0, chatId) }
        }
      );
    } catch (e) {}
  });

  // 刷新单个订阅
  bot.action(/^rss_refresh_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    await ctx.answerCbQuery('🔄 正在刷新...');
    
    try {
      await scheduler.refreshSubscription(id);
      await ctx.answerCbQuery('✅ 刷新完成');
    } catch (e) {
      await ctx.answerCbQuery('❌ 刷新失败');
    }
  });

  // 刷新全部
  bot.action('rss_refresh_all', async (ctx) => {
    await ctx.answerCbQuery('🔄 正在刷新全部...');
    await scheduler.refreshAll();
    await ctx.answerCbQuery('✅ 全部刷新完成');
  });

  // 删除确认
  bot.action(/^rss_del_confirm_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];
    const sub = scheduler.getSubscriptions().find(s => s.id === id);
    if (!sub) return;

    await ctx.editMessageText(
      `⚠️ <b>确认删除</b>\n\n确定要删除订阅 "${sub.title}" 吗？\n\n此操作不可恢复`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ 确认删除', callback_data: `rss_del_${id}` },
              { text: '❌ 取消', callback_data: `rss_detail_${id}` },
            ]
          ]
        }
      }
    );
  });

  // 执行删除
  bot.action(/^rss_del_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const deleted = scheduler.deleteSubscription(id);
    
    if (deleted) {
      await ctx.answerCbQuery('✅ 已删除');
      // 返回列表
      const chatId = ctx.chat.id.toString();
      const userId = ctx.from.id.toString();
      const feeds = scheduler.getSubscriptions().filter(s => s.chatId === chatId || s.userId === userId);
      
      if (feeds.length === 0) {
        await ctx.editMessageText('📭 暂无订阅', {
          reply_markup: {
            inline_keyboard: [[{ text: '➕ 添加订阅', callback_data: 'rss_add_prompt' }]]
          }
        });
      } else {
        await ctx.editMessageText(
          `📰 <b>RSS 订阅列表</b>\n\n📊 共 ${feeds.length} 个订阅`,
          { 
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: generateListButtons(feeds, 0, chatId) }
          }
        );
      }
    } else {
      await ctx.answerCbQuery('❌ 删除失败');
    }
  });

  // 添加订阅提示
  bot.action('rss_add_prompt', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await ctx.editMessageText(
      '➕ <b>添加 RSS 订阅</b>\n\n发送命令添加订阅：\n<code>/rss add https://example.com/feed.xml</code>',
      { parse_mode: 'HTML' }
    );
  });

  // 空操作
  bot.action('rss_noop', (ctx) => ctx.answerCbQuery());

  // 间隔设置提示
  bot.action(/^rss_interval_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];
    await ctx.editMessageText(
      `⏱ <b>修改检查间隔</b>\n\n发送命令设置间隔：\n<code>/rss interval ${id} 分钟数</code>\n\n范围: 1-1440 分钟`,
      { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 返回', callback_data: `rss_detail_${id}` }]]
        }
      }
    );
  });

  // 关键词设置提示
  bot.action(/^rss_kw_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];
    const sub = scheduler.getSubscriptions().find(s => s.id === id);
    const keywords = sub?.keywords || { whitelist: [], blacklist: [] };

    await ctx.editMessageText(
      `🔑 <b>关键词设置</b>\n\n` +
      `当前白名单: ${keywords.whitelist.length ? keywords.whitelist.join(', ') : '(无)'}\n` +
      `当前黑名单: ${keywords.blacklist.length ? keywords.blacklist.join(', ') : '(无)'}\n\n` +
      `命令：\n` +
      `<code>/rss kw ${id} add 词1,词2</code> - 添加白名单\n` +
      `<code>/rss kw ${id} del 词1,词2</code> - 删除白名单\n` +
      `<code>/rss ex ${id} add 词1,词2</code> - 添加黑名单\n` +
      `<code>/rss ex ${id} del 词1,词2</code> - 删除黑名单`,
      { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 返回', callback_data: `rss_detail_${id}` }]]
        }
      }
    );
  });

  logger.info('📰 RSS 命令已加载');
}

module.exports = { setup, generateListButtons, generateDetailButtons };
