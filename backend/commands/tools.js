/**
 * 实用工具命令
 */
const QRCode = require('qrcode');
const whois = require('whois');
const util = require('util');

// Promisify whois lookup
const whoisLookup = util.promisify(whois.lookup);

function setup(bot, { logger }) {
  // /id 命令 - 获取 ID
  bot.command('id', (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;

    let message = `🆔 <b>ID 信息</b>\n\n` +
      `👤 用户 ID: <code>${userId}</code>\n` +
      `💬 聊天 ID: <code>${chatId}</code>\n` +
      `📋 聊天类型: ${chatType}`;

    if (ctx.message.reply_to_message) {
      const replyUserId = ctx.message.reply_to_message.from.id;
      const replyUserName = ctx.message.reply_to_message.from.first_name;
      message += `\n\n↩️ 回复用户: ${replyUserName}\n   ID: <code>${replyUserId}</code>`;
    }

    ctx.reply(message, { parse_mode: 'HTML' });
  });

  // /qr 命令 - 生成二维码
  bot.command('qr', async (ctx) => {
    const text = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!text) {
      return ctx.reply('❌ 用法: /qr <内容>');
    }

    try {
      const qrBuffer = await QRCode.toBuffer(text, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });

      await ctx.replyWithPhoto({ source: qrBuffer }, {
        caption: `📱 二维码内容:\n<code>${text.substring(0, 200)}</code>`,
        parse_mode: 'HTML',
      });
    } catch (error) {
      ctx.reply(`❌ 生成失败: ${error.message}`);
    }
  });

  // /weather 命令 - 天气查询
  bot.command('weather', async (ctx) => {
    const city = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!city) {
      return ctx.reply('❌ 用法: /weather <城市>\n例如: /weather 北京');
    }

    try {
      const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      const data = await response.json();

      const current = data.current_condition[0];
      const area = data.nearest_area[0];

      const message = `🌤️ <b>${area.areaName[0].value} 天气</b>\n\n` +
        `🌡️ 温度: ${current.temp_C}°C (体感 ${current.FeelsLikeC}°C)\n` +
        `💧 湿度: ${current.humidity}%\n` +
        `🌬️ 风速: ${current.windspeedKmph} km/h ${current.winddir16Point}\n` +
        `☁️ 天气: ${current.weatherDesc[0].value}\n` +
        `👁️ 能见度: ${current.visibility} km`;

      ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      ctx.reply(`❌ 查询失败: ${error.message}`);
    }
  });

  // /ip 命令 - IP 查询
  bot.command('ip', async (ctx) => {
    const ip = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!ip) {
      return ctx.reply('❌ 用法: /ip <IP地址>');
    }

    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`);
      const data = await response.json();

      if (data.status === 'success') {
        const message = `🌍 <b>IP 查询结果</b>\n\n` +
          `📍 IP: <code>${data.query}</code>\n` +
          `🏳️ 国家: ${data.country}\n` +
          `🏙️ 地区: ${data.regionName}\n` +
          `🌆 城市: ${data.city}\n` +
          `📮 邮编: ${data.zip || '-'}\n` +
          `🌐 ISP: ${data.isp}\n` +
          `🏢 组织: ${data.org}`;
        ctx.reply(message, { parse_mode: 'HTML' });
      } else {
        ctx.reply(`❌ 查询失败: ${data.message}`);
      }
    } catch (error) {
      ctx.reply(`❌ 查询失败: ${error.message}`);
    }
  });

  // /rate 命令 - 汇率换算
  bot.command('rate', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 3) {
      return ctx.reply('❌ 用法: /rate <金额> <源货币> <目标货币>\n例如: /rate 100 USD CNY');
    }

    const amount = parseFloat(args[0]);
    const from = args[1].toUpperCase();
    const to = args[2].toUpperCase();

    if (isNaN(amount)) {
      return ctx.reply('❌ 金额格式错误');
    }

    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
      const data = await response.json();

      if (data.rates && data.rates[to]) {
        const rate = data.rates[to];
        const result = (amount * rate).toFixed(2);

        const message = `💰 <b>汇率换算</b>\n\n` +
          `📊 ${amount} ${from} = <b>${result} ${to}</b>\n` +
          `📈 汇率: 1 ${from} = ${rate.toFixed(4)} ${to}\n` +
          `🕐 更新时间: ${new Date(data.time_last_updated * 1000).toLocaleString('zh-CN')}`;
        ctx.reply(message, { parse_mode: 'HTML' });
      } else {
        ctx.reply(`❌ 不支持的货币: ${to}`);
      }
    } catch (error) {
      ctx.reply(`❌ 查询失败: ${error.message}`);
    }
  });

  // /short 命令 - 短链接
  bot.command('short', async (ctx) => {
    const url = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!url) {
      return ctx.reply('❌ 用法: /short <URL>');
    }

    try {
      const response = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
      const shortUrl = await response.text();

      if (shortUrl.startsWith('http')) {
        ctx.reply(`🔗 <b>短链接</b>\n\n原链接: ${url.substring(0, 50)}...\n短链接: ${shortUrl}`, { parse_mode: 'HTML' });
      } else {
        ctx.reply(`❌ 生成失败: ${shortUrl}`);
      }
    } catch (error) {
      ctx.reply(`❌ 生成失败: ${error.message}`);
    }
  });

  // /whois 命令 - 域名查询
  bot.command('whois', async (ctx) => {
    const input = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!input) {
      return ctx.reply('❌ 用法: /whois <域名>\n例如: /whois google.com');
    }

    // 清理域名格式
    let domain = input.toLowerCase()
      .replace(/^https?:\/\//, '')  // 移除协议
      .replace(/\/.*$/, '')          // 移除路径
      .replace(/^www\./, '');        // 移除 www 前缀

    await ctx.sendChatAction('typing');

    try {
      // 使用 whois 库查询
      const data = await whoisLookup(domain);

      // 截取前 2000 个字符避免消息过长
      const truncatedData = data.length > 2000
        ? data.substring(0, 2000) + '\n...(已截断)'
        : data;

      await ctx.reply(
        `🔍 <b>Whois 查询结果: ${domain}</b>\n\n<pre>${escapeHtml(truncatedData)}</pre>`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      logger.error(`WHOIS 查询失败: ${error.message}`);
      await ctx.reply(`❌ 查询失败: ${error.message || '未知错误'}`);
    }
  });

  // HTML 转义函数
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  logger.info('🛠️ Tools 命令已加载');
}

module.exports = { setup };
