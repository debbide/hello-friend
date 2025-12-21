/**
 * 内联模式支持 - @bot query 在任意聊天中使用
 */
function setup(bot, { logger }) {
  // 内联查询处理
  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    
    if (!query) {
      // 空查询时显示使用提示
      return ctx.answerInlineQuery([
        {
          type: 'article',
          id: 'help',
          title: '💡 输入内容开始搜索',
          description: '支持: 天气、汇率、翻译、二维码等',
          input_message_content: {
            message_text: '📚 <b>内联模式帮助</b>\n\n' +
              '在任意聊天中输入 @机器人名 + 关键词：\n\n' +
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

    await ctx.answerInlineQuery(results, { cache_time: 10 });
  });

  logger.info('🔍 Inline 模式已加载');
}

module.exports = { setup };
