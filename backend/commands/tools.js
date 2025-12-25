/**
 * 实用工具命令
 */
const QRCode = require('qrcode');

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

    const statusMsg = await ctx.reply(`🔍 正在查询 ${domain} 的域名信息...`);

    try {
      // 使用 RDAP (Registration Data Access Protocol) 查询
      // RDAP 是 WHOIS 的现代替代方案，返回 JSON 格式
      const rdapResponse = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`);

      if (rdapResponse.ok) {
        const rdapData = await rdapResponse.json();

        // 解析 RDAP 响应
        let registrar = '-';
        let creationDate = '-';
        let expirationDate = '-';
        let updatedDate = '-';
        let status = [];
        let nameServers = [];

        // 提取注册商
        if (rdapData.entities) {
          const registrarEntity = rdapData.entities.find(e => e.roles && e.roles.includes('registrar'));
          if (registrarEntity && registrarEntity.vcardArray) {
            const vcard = registrarEntity.vcardArray[1];
            const fnEntry = vcard.find(v => v[0] === 'fn');
            if (fnEntry) registrar = fnEntry[3];
          }
        }

        // 提取日期信息
        if (rdapData.events) {
          rdapData.events.forEach(event => {
            const date = new Date(event.eventDate).toLocaleDateString('zh-CN');
            switch (event.eventAction) {
              case 'registration': creationDate = date; break;
              case 'expiration': expirationDate = date; break;
              case 'last changed':
              case 'last update of RDAP database': updatedDate = date; break;
            }
          });
        }

        // 提取状态
        if (rdapData.status) {
          status = rdapData.status.slice(0, 3); // 只取前 3 个状态
        }

        // 提取 DNS 服务器
        if (rdapData.nameservers) {
          nameServers = rdapData.nameservers.map(ns => ns.ldhName).slice(0, 4);
        }

        // 构建消息
        let message = `🔍 <b>域名信息查询</b>\n\n`;
        message += `📋 <b>域名:</b> <code>${rdapData.ldhName || domain}</code>\n`;
        message += `🏢 <b>注册商:</b> ${registrar}\n`;
        message += `📅 <b>注册日期:</b> ${creationDate}\n`;
        message += `⏰ <b>到期日期:</b> ${expirationDate}\n`;
        message += `🔄 <b>更新日期:</b> ${updatedDate}\n`;

        if (status.length > 0) {
          message += `📊 <b>状态:</b> ${status.join(', ')}\n`;
        }

        if (nameServers.length > 0) {
          message += `\n🌐 <b>DNS 服务器:</b>\n`;
          nameServers.forEach(ns => {
            message += `  • <code>${ns}</code>\n`;
          });
        }

        message += `\n💡 更多详情: <a href="https://who.is/whois/${domain}">who.is</a>`;

        await ctx.telegram.editMessageText(
          ctx.chat.id, statusMsg.message_id, null,
          message, { parse_mode: 'HTML', disable_web_page_preview: true }
        );
      } else {
        // RDAP 查询失败，尝试备用方案
        throw new Error('RDAP 查询无结果');
      }
    } catch (error) {
      logger.error(`WHOIS 查询失败: ${error.message}`);

      // 提供备用查询方式
      const fallbackMessage = `🔍 <b>域名查询</b>\n\n` +
        `📋 域名: <code>${domain}</code>\n\n` +
        `⚠️ 无法直接获取 WHOIS 信息\n\n` +
        `💡 <b>在线查询工具:</b>\n` +
        `• <a href="https://who.is/whois/${domain}">Who.is</a>\n` +
        `• <a href="https://whois.domaintools.com/${domain}">DomainTools</a>\n` +
        `• <a href="https://lookup.icann.org/en/lookup?name=${domain}">ICANN Lookup</a>`;

      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, null,
        fallbackMessage, { parse_mode: 'HTML', disable_web_page_preview: true }
      );
    }
  });

  logger.info('🛠️ Tools 命令已加载');
}

module.exports = { setup };
