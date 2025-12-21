/**
 * 翻译命令 - 使用免费翻译 API
 */

// 语言代码映射
const LANG_MAP = {
  'zh': 'zh-CN', 'cn': 'zh-CN', 'chinese': 'zh-CN', '中文': 'zh-CN',
  'en': 'en', 'english': 'en', '英文': 'en', '英语': 'en',
  'ja': 'ja', 'jp': 'ja', 'japanese': 'ja', '日文': 'ja', '日语': 'ja',
  'ko': 'ko', 'korean': 'ko', '韩文': 'ko', '韩语': 'ko',
  'fr': 'fr', 'french': 'fr', '法语': 'fr',
  'de': 'de', 'german': 'de', '德语': 'de',
  'es': 'es', 'spanish': 'es', '西班牙语': 'es',
  'ru': 'ru', 'russian': 'ru', '俄语': 'ru',
  'pt': 'pt', 'portuguese': 'pt', '葡萄牙语': 'pt',
  'it': 'it', 'italian': 'it', '意大利语': 'it',
  'ar': 'ar', 'arabic': 'ar', '阿拉伯语': 'ar',
  'th': 'th', 'thai': 'th', '泰语': 'th',
  'vi': 'vi', 'vietnamese': 'vi', '越南语': 'vi',
};

const LANG_NAMES = {
  'zh-CN': '中文', 'en': '英语', 'ja': '日语', 'ko': '韩语',
  'fr': '法语', 'de': '德语', 'es': '西班牙语', 'ru': '俄语',
  'pt': '葡萄牙语', 'it': '意大利语', 'ar': '阿拉伯语', 'th': '泰语', 'vi': '越南语',
};

// 检测是否为中文
function isChinese(text) {
  return /[\u4e00-\u9fa5]/.test(text);
}

// 翻译函数 (使用 Google Translate 免费 API)
async function translate(text, targetLang = 'zh-CN', sourceLang = 'auto') {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // 提取翻译结果
    let translated = '';
    if (data[0]) {
      for (const item of data[0]) {
        if (item[0]) {
          translated += item[0];
        }
      }
    }
    
    // 检测到的源语言
    const detectedLang = data[2] || sourceLang;
    
    return {
      success: true,
      text: translated,
      sourceLang: detectedLang,
      targetLang,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

function setup(bot, { logger }) {
  // /tr 命令
  bot.command('tr', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    let text = '';
    let targetLang = 'zh-CN';

    if (args.length === 0) {
      // 检查是否回复了消息
      if (ctx.message.reply_to_message?.text) {
        text = ctx.message.reply_to_message.text;
      } else {
        return ctx.reply(
          '🌐 <b>翻译助手</b>\n\n' +
          '<code>/tr 文本</code> - 翻译到中文\n' +
          '<code>/tr en 文本</code> - 翻译到英语\n' +
          '<code>/tr ja 文本</code> - 翻译到日语\n\n' +
          '💡 也可以回复消息发送 <code>/tr</code> 翻译该消息\n\n' +
          '支持语言: 中文/英语/日语/韩语/法语/德语/西班牙语/俄语等',
          { parse_mode: 'HTML' }
        );
      }
    } else {
      // 检查第一个参数是否为语言代码
      const firstArg = args[0].toLowerCase();
      if (LANG_MAP[firstArg]) {
        targetLang = LANG_MAP[firstArg];
        text = args.slice(1).join(' ');
      } else {
        text = args.join(' ');
        // 自动判断：如果是中文，翻译到英文；否则翻译到中文
        targetLang = isChinese(text) ? 'en' : 'zh-CN';
      }
    }

    if (!text) {
      return ctx.reply('❌ 请提供要翻译的文本');
    }

    const loading = await ctx.reply('🔄 <i>正在翻译...</i>', { parse_mode: 'HTML' });

    const result = await translate(text, targetLang);

    if (result.success) {
      const sourceName = LANG_NAMES[result.sourceLang] || result.sourceLang;
      const targetName = LANG_NAMES[result.targetLang] || result.targetLang;
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loading.message_id,
        null,
        `🌐 <b>翻译结果</b>\n\n` +
        `📝 原文 (${sourceName}):\n<i>${text.substring(0, 200)}${text.length > 200 ? '...' : ''}</i>\n\n` +
        `✨ 译文 (${targetName}):\n<b>${result.text}</b>`,
        { 
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔄 反向翻译', callback_data: `tr_reverse_${result.targetLang}_${result.sourceLang}` },
                { text: '📋 复制', callback_data: 'tr_copy' },
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
        `❌ 翻译失败: ${result.error}`
      );
    }
  });

  // 反向翻译回调
  bot.action(/^tr_reverse_(.+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('暂不支持，请重新输入 /tr 命令');
  });

  bot.action('tr_copy', async (ctx) => {
    await ctx.answerCbQuery('请长按消息复制');
  });

  logger.info('🌐 Translate 命令已加载');
}

module.exports = { setup, translate };
