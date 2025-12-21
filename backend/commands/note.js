/**
 * 备忘录命令 - 支持内联按钮管理
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DATA_PATH || './data';
const NOTES_FILE = path.join(DATA_PATH, 'notes.json');

function loadNotes() {
  try {
    if (fs.existsSync(NOTES_FILE)) {
      return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function saveNotes(notes) {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(DATA_PATH, { recursive: true });
    }
    fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
  } catch (e) {}
}

const PAGE_SIZE = 5;

function generateNotesButtons(notes, page = 0) {
  const totalPages = Math.ceil(notes.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageNotes = notes.slice(start, start + PAGE_SIZE);

  const buttons = pageNotes.map((note, i) => [
    { 
      text: `📝 ${(note.content || '').substring(0, 25)}${note.content?.length > 25 ? '...' : ''}`, 
      callback_data: `note_view_${note.id}` 
    },
    { text: '🗑️', callback_data: `note_del_${note.id}` },
  ]);

  // 分页
  if (totalPages > 1) {
    const navRow = [];
    if (page > 0) {
      navRow.push({ text: '◀️ 上一页', callback_data: `notes_page_${page - 1}` });
    }
    navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'notes_noop' });
    if (page < totalPages - 1) {
      navRow.push({ text: '下一页 ▶️', callback_data: `notes_page_${page + 1}` });
    }
    buttons.push(navRow);
  }

  buttons.push([{ text: '➕ 添加备忘', callback_data: 'note_add_prompt' }]);

  return buttons;
}

function setup(bot, { logger }) {
  // /note 命令 - 添加备忘
  bot.command('note', async (ctx) => {
    const content = ctx.message.text.split(' ').slice(1).join(' ').trim();
    const userId = ctx.from.id.toString();

    if (!content) {
      return ctx.reply(
        '📝 <b>备忘录</b>\n\n' +
        '<code>/note 内容</code> - 添加备忘\n' +
        '<code>/notes</code> - 查看列表\n' +
        '<code>/delnote ID</code> - 删除备忘\n\n' +
        '💡 也可以回复消息发送 <code>/note</code> 保存该消息',
        { parse_mode: 'HTML' }
      );
    }

    const note = {
      id: `note_${Date.now()}`,
      userId,
      content,
      createdAt: new Date().toISOString(),
    };

    const notes = loadNotes();
    notes.unshift(note);
    saveNotes(notes);

    ctx.reply(
      `✅ <b>备忘已保存</b>\n\n` +
      `📝 ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\n` +
      `🆔 ID: <code>${note.id}</code>`,
      { 
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 查看全部', callback_data: 'notes_list' },
              { text: '🗑️ 删除', callback_data: `note_del_${note.id}` },
            ]
          ]
        }
      }
    );
  });

  // /notes 命令 - 查看备忘列表
  bot.command('notes', async (ctx) => {
    const userId = ctx.from.id.toString();
    const notes = loadNotes().filter(n => n.userId === userId);

    if (notes.length === 0) {
      return ctx.reply('📭 暂无备忘', {
        reply_markup: {
          inline_keyboard: [[{ text: '➕ 添加备忘', callback_data: 'note_add_prompt' }]]
        }
      });
    }

    ctx.reply(
      `📝 <b>备忘录</b>\n\n📊 共 ${notes.length} 条备忘\n\n点击查看详情，右侧按钮删除`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateNotesButtons(notes, 0) }
      }
    );
  });

  // /delnote 命令 - 删除备忘
  bot.command('delnote', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) {
      return ctx.reply('❌ 用法: /delnote <ID>');
    }

    const notes = loadNotes();
    const filtered = notes.filter(n => n.id !== id);

    if (filtered.length === notes.length) {
      return ctx.reply('❌ 未找到该备忘');
    }

    saveNotes(filtered);
    ctx.reply('✅ 备忘已删除');
  });

  // === 内联按钮回调 ===

  // 分页
  bot.action(/^notes_page_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id.toString();
    const notes = loadNotes().filter(n => n.userId === userId);

    await ctx.editMessageText(
      `📝 <b>备忘录</b>\n\n📊 共 ${notes.length} 条备忘`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateNotesButtons(notes, page) }
      }
    );
  });

  // 查看列表
  bot.action('notes_list', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const userId = ctx.from.id.toString();
    const notes = loadNotes().filter(n => n.userId === userId);

    if (notes.length === 0) {
      return ctx.editMessageText('📭 暂无备忘', {
        reply_markup: {
          inline_keyboard: [[{ text: '➕ 添加备忘', callback_data: 'note_add_prompt' }]]
        }
      });
    }

    await ctx.editMessageText(
      `📝 <b>备忘录</b>\n\n📊 共 ${notes.length} 条备忘`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateNotesButtons(notes, 0) }
      }
    );
  });

  // 查看详情
  bot.action(/^note_view_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];
    const note = loadNotes().find(n => n.id === id);

    if (!note) {
      return ctx.answerCbQuery('❌ 备忘不存在');
    }

    const createdAt = new Date(note.createdAt).toLocaleString('zh-CN');

    await ctx.editMessageText(
      `📝 <b>备忘详情</b>\n\n` +
      `${note.content}\n\n` +
      `🕐 创建时间: ${createdAt}\n` +
      `🆔 ID: <code>${note.id}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🗑️ 删除', callback_data: `note_del_confirm_${note.id}` },
              { text: '🔙 返回列表', callback_data: 'notes_list' },
            ]
          ]
        }
      }
    );
  });

  // 删除确认
  bot.action(/^note_del_confirm_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];

    await ctx.editMessageText(
      '⚠️ <b>确认删除</b>\n\n确定要删除这条备忘吗？',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ 确认删除', callback_data: `note_del_${id}` },
              { text: '❌ 取消', callback_data: `note_view_${id}` },
            ]
          ]
        }
      }
    );
  });

  // 执行删除
  bot.action(/^note_del_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const notes = loadNotes();
    const filtered = notes.filter(n => n.id !== id);

    if (filtered.length === notes.length) {
      return ctx.answerCbQuery('❌ 备忘不存在');
    }

    saveNotes(filtered);
    await ctx.answerCbQuery('✅ 已删除');

    // 返回列表
    const userId = ctx.from.id.toString();
    const userNotes = filtered.filter(n => n.userId === userId);

    if (userNotes.length === 0) {
      await ctx.editMessageText('📭 暂无备忘', {
        reply_markup: {
          inline_keyboard: [[{ text: '➕ 添加备忘', callback_data: 'note_add_prompt' }]]
        }
      });
    } else {
      await ctx.editMessageText(
        `📝 <b>备忘录</b>\n\n📊 共 ${userNotes.length} 条备忘`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: generateNotesButtons(userNotes, 0) }
        }
      );
    }
  });

  // 添加提示
  bot.action('note_add_prompt', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await ctx.editMessageText(
      '➕ <b>添加备忘</b>\n\n发送命令添加：\n<code>/note 备忘内容</code>',
      { parse_mode: 'HTML' }
    );
  });

  // 空操作
  bot.action('notes_noop', (ctx) => ctx.answerCbQuery());

  logger.info('📝 Note 命令已加载');
}

module.exports = { setup };
