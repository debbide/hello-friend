/**
 * 内联模式支持 - @bot query 在任意聊天中使用
 */
const storage = require('../storage');

function setup(bot, { logger }) {
  // 内联查询处理
  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    const userId = ctx.from.id.toString();

    if (!query) {
      // 空查询时显示收藏的贴纸（最近使用的前20个）
      const stickers = storage.getStickers(userId);

      if (stickers.length > 0) {
        // 按使用次数和最近使用时间排序
        const sortedStickers = [...stickers].sort((a, b) => {
          if (b.usageCount !== a.usageCount) {
            return (b.usageCount || 0) - (a.usageCount || 0);
          }
          return new Date(b.lastUsed || b.createdAt) - new Date(a.lastUsed || a.createdAt);
        }).slice(0, 20);

        const results = sortedStickers.map((sticker, index) => ({
          type: 'sticker',
          id: `sticker_${sticker.id}_${index}`,
          sticker_file_id: sticker.fileId,
        }));

        return ctx.answerInlineQuery(results, {
          cache_time: 10,
          is_personal: true,
        });
      }

      // 没有收藏贴纸时显示使用提示
      return ctx.answerInlineQuery([
        {
          type: 'article',
          id: 'help',
          title: '💡 输入内容开始搜索',
          description: '支持: 贴纸、天气、汇率、翻译、二维码等',
          input_message_content: {
            message_text: '📚 <b>内联模式帮助</b>\n\n' +
              '在任意聊天中输入 @机器人名 + 关键词：\n\n' +
              '🎨 <code>直接输入</code> - 搜索收藏的贴纸\n' +
              '🌤️ <code>天气 北京</code> - 查询天气\n' +
              '💰 <code>汇率 100 USD CNY</code> - 汇率换算\n' +
              '📱 <code>二维码 内容</code> - 生成二维码\n' +
              '🌐 <code>IP 8.8.8.8</code> - IP查询',
            parse_mode: 'HTML',
          },
        },
      ], { cache_time: 60 });
    }

    const results = [];
    const lowerQuery = query.toLowerCase();

    // 贴纸搜索（优先级最高）
    const stickers = storage.getStickers(userId);
    const matchedStickers = stickers.filter(sticker => {
      // 搜索表情
      if (sticker.emoji && sticker.emoji.includes(query)) return true;
      // 搜索贴纸包名
      if (sticker.setName && sticker.setName.toLowerCase().includes(lowerQuery)) return true;
      // 搜索标签
      if (sticker.tags && sticker.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) return true;
      return false;
    }).slice(0, 20);

    if (matchedStickers.length > 0) {
      matchedStickers.forEach((sticker, index) => {
        results.push({
          type: 'sticker',
          id: `sticker_${sticker.id}_${index}`,
          sticker_file_id: sticker.fileId,
        });
      });

      return ctx.answerInlineQuery(results, {
        cache_time: 10,
        is_personal: true,
      });
    }

    // 天气查询
    if (lowerQuery.startsWith('天气 ') || lowerQuery.startsWith('weather ')) {
      const city = query.split(' ').slice(1).join(' ');
      if (city) {
        results.push({
          type: 'article',
          id: `weather_${city}`,
          title: `🌤️ 查询 ${city} 天气`,
          description: '点击发送天气查询结果',
          input_message_content: {
            message_text: `🔄 正在查询 ${city} 天气...\n\n<i>请稍候...</i>`,
            parse_mode: 'HTML',
          },
        });
      }
    }

    // 汇率查询
    if (lowerQuery.startsWith('汇率 ') || lowerQuery.startsWith('rate ')) {
      const parts = query.split(' ').slice(1);
      if (parts.length >= 3) {
        const [amount, from, to] = parts;
        results.push({
          type: 'article',
          id: `rate_${amount}_${from}_${to}`,
          title: `💰 ${amount} ${from.toUpperCase()} → ${to.toUpperCase()}`,
          description: '点击发送汇率换算结果',
          input_message_content: {
            message_text: `💰 正在换算 ${amount} ${from.toUpperCase()} → ${to.toUpperCase()}...`,
            parse_mode: 'HTML',
          },
        });
      }
    }

    // 二维码生成
    if (lowerQuery.startsWith('二维码 ') || lowerQuery.startsWith('qr ')) {
      const content = query.split(' ').slice(1).join(' ');
      if (content) {
        results.push({
          type: 'article',
          id: `qr_${Date.now()}`,
          title: `📱 生成二维码`,
          description: content.substring(0, 50),
          input_message_content: {
            message_text: `📱 <b>二维码内容</b>\n\n<code>${content}</code>\n\n<i>请使用 /qr ${content} 生成图片</i>`,
            parse_mode: 'HTML',
          },
        });
      }
    }

    // IP 查询
    if (lowerQuery.startsWith('ip ')) {
      const ip = query.split(' ').slice(1).join(' ');
      if (ip) {
        results.push({
          type: 'article',
          id: `ip_${ip}`,
          title: `🌍 查询 IP: ${ip}`,
          description: '点击发送IP查询结果',
          input_message_content: {
            message_text: `🔄 正在查询 ${ip}...\n\n<i>请稍候...</i>`,
            parse_mode: 'HTML',
          },
        });
      }
    }

    // 默认：搜索/AI 回答
    if (results.length === 0) {
      results.push({
        type: 'article',
        id: `chat_${Date.now()}`,
        title: `🤖 AI 回答: ${query.substring(0, 30)}`,
        description: '点击发送 AI 对话',
        input_message_content: {
          message_text: `🤖 <b>问题</b>\n${query}\n\n<i>请使用 /chat ${query} 获取 AI 回答</i>`,
          parse_mode: 'HTML',
        },
      });
    }

    await ctx.answerInlineQuery(results, { cache_time: 10, is_personal: true });
  });

  // 记录贴纸使用
  bot.on('chosen_inline_result', async (ctx) => {
    const resultId = ctx.chosenInlineResult.result_id;
    if (resultId.startsWith('sticker_')) {
      const parts = resultId.split('_');
      const stickerId = parts.slice(1, -1).join('_'); // 去掉最后的 index
      const userId = ctx.from.id.toString();
      storage.incrementStickerUsage(stickerId, userId);
    }
  });

  logger.info('🔍 Inline 模式已加载');
}

module.exports = { setup };
