/**
 * 贴纸收藏命令 - 转发贴纸自动收藏
 */
const storage = require('../storage');

const PAGE_SIZE = 10;

function generateStickersButtons(stickers, page = 0) {
  const totalPages = Math.ceil(stickers.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageStickers = stickers.slice(start, start + PAGE_SIZE);

  const buttons = [];

  // 每行显示 5 个贴纸按钮
  for (let i = 0; i < pageStickers.length; i += 5) {
    const row = pageStickers.slice(i, i + 5).map((sticker, idx) => ({
      text: sticker.emoji || '🎨',
      callback_data: `sticker_view_${sticker.id}`,
    }));
    buttons.push(row);
  }

  // 分页导航
  if (totalPages > 1) {
    const navRow = [];
    if (page > 0) {
      navRow.push({ text: '◀️ 上一页', callback_data: `stickers_page_${page - 1}` });
    }
    navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: 'stickers_noop' });
    if (page < totalPages - 1) {
      navRow.push({ text: '下一页 ▶️', callback_data: `stickers_page_${page + 1}` });
    }
    buttons.push(navRow);
  }

  return buttons;
}

function setup(bot, { logger, settings }) {
  // 监听转发的贴纸消息 - 自动收藏
  bot.on('sticker', async (ctx) => {
    const sticker = ctx.message.sticker;
    const userId = ctx.from.id.toString();
    const chatType = ctx.chat.type;

    // 只在私聊中自动收藏（转发给 Bot）
    if (chatType !== 'private') {
      return;
    }

    // 检查是否已收藏
    const stickers = storage.getStickers(userId);
    const exists = stickers.some(s => s.fileId === sticker.file_id);

    if (exists) {
      return ctx.reply(
        '⚠️ 这个贴纸已经在收藏中了',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 查看收藏', callback_data: 'stickers_list' }]
            ]
          }
        }
      );
    }

    // 保存贴纸
    const saved = storage.addSticker({
      fileId: sticker.file_id,
      fileUniqueId: sticker.file_unique_id,
      setName: sticker.set_name || null,
      emoji: sticker.emoji || null,
      isAnimated: sticker.is_animated || false,
      isVideo: sticker.is_video || false,
      type: sticker.type || 'regular',
      width: sticker.width,
      height: sticker.height,
      userId,
    });

    logger.info(`贴纸已收藏: ${sticker.file_id.substring(0, 20)}... (用户: ${userId})`);

    ctx.reply(
      `✅ <b>贴纸已收藏</b>\n\n` +
      `${sticker.emoji ? `表情: ${sticker.emoji}` : ''}\n` +
      `${sticker.set_name ? `贴纸包: ${sticker.set_name}` : '单独贴纸'}\n` +
      `类型: ${sticker.is_animated ? '动态' : sticker.is_video ? '视频' : '静态'}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 查看收藏', callback_data: 'stickers_list' },
              { text: '🗑️ 撤销', callback_data: `sticker_del_${saved.id}` },
            ],
            [
              { text: '🏷️ 添加标签', callback_data: `sticker_tag_${saved.id}` },
            ]
          ]
        }
      }
    );
  });

  // /stickers 命令 - 查看贴纸收藏
  bot.command('stickers', async (ctx) => {
    const userId = ctx.from.id.toString();
    const stickers = storage.getStickers(userId);

    if (stickers.length === 0) {
      return ctx.reply(
        '📭 <b>暂无收藏的贴纸</b>\n\n' +
        '💡 将贴纸转发给我即可收藏',
        { parse_mode: 'HTML' }
      );
    }

    ctx.reply(
      `🎨 <b>贴纸收藏</b>\n\n` +
      `📊 共 ${stickers.length} 个贴纸\n\n` +
      `点击表情查看贴纸`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateStickersButtons(stickers, 0) }
      }
    );
  });

  // /sticker_groups 命令 - 查看贴纸分组
  bot.command('sticker_groups', async (ctx) => {
    const userId = ctx.from.id.toString();
    const groups = storage.getStickerGroups(userId);

    if (groups.length === 0) {
      return ctx.reply(
        '📭 <b>暂无分组</b>\n\n' +
        '💡 在查看贴纸详情时可以创建分组',
        { parse_mode: 'HTML' }
      );
    }

    const buttons = groups.map(group => [{
      text: `📁 ${group.name} (${group.count || 0})`,
      callback_data: `sticker_group_view_${group.id}`,
    }]);

    buttons.push([{ text: '➕ 创建分组', callback_data: 'sticker_group_add' }]);

    ctx.reply(
      `📁 <b>贴纸分组</b>\n\n共 ${groups.length} 个分组`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      }
    );
  });

  // === 内联按钮回调 ===

  // 查看贴纸列表
  bot.action('stickers_list', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const userId = ctx.from.id.toString();
    const stickers = storage.getStickers(userId);

    if (stickers.length === 0) {
      return ctx.editMessageText(
        '📭 <b>暂无收藏的贴纸</b>\n\n💡 将贴纸转发给我即可收藏',
        { parse_mode: 'HTML' }
      );
    }

    await ctx.editMessageText(
      `🎨 <b>贴纸收藏</b>\n\n📊 共 ${stickers.length} 个贴纸\n\n点击表情查看贴纸`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateStickersButtons(stickers, 0) }
      }
    );
  });

  // 分页
  bot.action(/^stickers_page_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const page = parseInt(ctx.match[1]);
    const userId = ctx.from.id.toString();
    const stickers = storage.getStickers(userId);

    await ctx.editMessageText(
      `🎨 <b>贴纸收藏</b>\n\n📊 共 ${stickers.length} 个贴纸\n\n点击表情查看贴纸`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: generateStickersButtons(stickers, page) }
      }
    );
  });

  // 查看贴纸详情
  bot.action(/^sticker_view_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];
    const userId = ctx.from.id.toString();
    const sticker = storage.getStickers(userId).find(s => s.id === id);

    if (!sticker) {
      return ctx.answerCbQuery('❌ 贴纸不存在');
    }

    // 发送贴纸
    await ctx.replyWithSticker(sticker.fileId);

    // 发送操作菜单
    const createdAt = new Date(sticker.createdAt).toLocaleString('zh-CN');
    const tags = sticker.tags?.length > 0 ? sticker.tags.join(', ') : '无';

    await ctx.reply(
      `🎨 <b>贴纸详情</b>\n\n` +
      `${sticker.emoji ? `表情: ${sticker.emoji}` : ''}\n` +
      `${sticker.setName ? `贴纸包: ${sticker.setName}` : '单独贴纸'}\n` +
      `标签: ${tags}\n` +
      `使用次数: ${sticker.usageCount || 0}\n` +
      `收藏时间: ${createdAt}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🏷️ 编辑标签', callback_data: `sticker_tag_${id}` },
              { text: '📁 移动分组', callback_data: `sticker_move_${id}` },
            ],
            [
              { text: '🗑️ 删除', callback_data: `sticker_del_confirm_${id}` },
              { text: '🔙 返回列表', callback_data: 'stickers_list' },
            ]
          ]
        }
      }
    );
  });

  // 删除确认
  bot.action(/^sticker_del_confirm_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];

    await ctx.editMessageText(
      '⚠️ <b>确认删除</b>\n\n确定要删除这个贴纸吗？',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ 确认删除', callback_data: `sticker_del_${id}` },
              { text: '❌ 取消', callback_data: 'stickers_list' },
            ]
          ]
        }
      }
    );
  });

  // 执行删除
  bot.action(/^sticker_del_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    const userId = ctx.from.id.toString();
    const deleted = storage.deleteSticker(id, userId);

    if (!deleted) {
      return ctx.answerCbQuery('❌ 贴纸不存在');
    }

    await ctx.answerCbQuery('✅ 已删除');

    // 返回列表
    const stickers = storage.getStickers(userId);

    if (stickers.length === 0) {
      await ctx.editMessageText(
        '📭 <b>暂无收藏的贴纸</b>\n\n💡 将贴纸转发给我即可收藏',
        { parse_mode: 'HTML' }
      );
    } else {
      await ctx.editMessageText(
        `🎨 <b>贴纸收藏</b>\n\n📊 共 ${stickers.length} 个贴纸`,
        {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: generateStickersButtons(stickers, 0) }
        }
      );
    }
  });

  // 添加标签提示
  bot.action(/^sticker_tag_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    const id = ctx.match[1];

    await ctx.editMessageText(
      '🏷️ <b>添加标签</b>\n\n' +
      '发送标签（多个用空格分隔）:\n' +
      `<code>/tag ${id} 标签1 标签2</code>`,
      { parse_mode: 'HTML' }
    );
  });

  // /tag 命令 - 添加标签
  bot.command('tag', async (ctx) => {
    const parts = ctx.message.text.split(' ').slice(1);
    const id = parts[0];
    const tags = parts.slice(1);

    if (!id || tags.length === 0) {
      return ctx.reply('❌ 用法: /tag <贴纸ID> <标签1> <标签2> ...');
    }

    const userId = ctx.from.id.toString();
    const updated = storage.updateSticker(id, userId, { tags });

    if (!updated) {
      return ctx.reply('❌ 贴纸不存在');
    }

    ctx.reply(
      `✅ 标签已更新: ${tags.join(', ')}`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '📋 查看收藏', callback_data: 'stickers_list' }]]
        }
      }
    );
  });

  // ==================== 创建贴纸包功能 ====================

  const MAX_STICKERS_PER_PACK = 120;

  // /createpack <名称> - 创建贴纸包（自动分批）
  bot.command('createpack', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userIdNum = ctx.from.id;
    const packTitle = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!packTitle) {
      return ctx.reply(
        '📦 <b>创建贴纸包</b>\n\n' +
        '用法: <code>/createpack 贴纸包名称</code>\n\n' +
        '例如: <code>/createpack 我的收藏</code>\n\n' +
        '创建后会自动添加你收藏的所有贴纸\n' +
        `超过 ${MAX_STICKERS_PER_PACK} 个会自动分批创建多个贴纸包`,
        { parse_mode: 'HTML' }
      );
    }

    // 获取用户收藏的贴纸
    const stickers = storage.getStickers(userId);
    if (stickers.length === 0) {
      return ctx.reply('❌ 你还没有收藏任何贴纸，请先转发贴纸给我收藏');
    }

    // 只能用静态贴纸创建（动态贴纸需要特殊处理）
    const staticStickers = stickers.filter(s => !s.isAnimated && !s.isVideo);
    if (staticStickers.length === 0) {
      return ctx.reply('❌ 你收藏的都是动态贴纸，暂不支持创建动态贴纸包');
    }

    // 获取 Bot 用户名
    const botInfo = await ctx.telegram.getMe();
    const botUsername = botInfo.username;

    // 计算需要创建多少个贴纸包
    const totalPacks = Math.ceil(staticStickers.length / MAX_STICKERS_PER_PACK);

    await ctx.reply(
      `⏳ 正在创建贴纸包，请稍候...\n\n` +
      `📊 共 ${staticStickers.length} 个静态贴纸\n` +
      `📦 将创建 ${totalPacks} 个贴纸包`
    );

    const createdPacks = [];
    const fetch = require('node-fetch');

    for (let packIndex = 0; packIndex < totalPacks; packIndex++) {
      const startIdx = packIndex * MAX_STICKERS_PER_PACK;
      const endIdx = Math.min(startIdx + MAX_STICKERS_PER_PACK, staticStickers.length);
      const packStickers = staticStickers.slice(startIdx, endIdx);

      // 生成贴纸包名称
      const packSuffix = totalPacks > 1 ? ` (${packIndex + 1})` : '';
      const currentPackTitle = `${packTitle}${packSuffix}`;
      const packName = `u${userId}_${Date.now()}_${packIndex}_by_${botUsername}`;

      try {
        // 获取第一个贴纸的文件
        const firstSticker = packStickers[0];
        const file = await ctx.telegram.getFile(firstSticker.fileId);
        const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`;

        // 下载贴纸文件
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();

        // 创建贴纸包
        await ctx.telegram.createNewStickerSet(
          userIdNum,
          packName,
          currentPackTitle,
          {
            png_sticker: { source: buffer },
            emojis: firstSticker.emoji || '😀',
          }
        );

        logger.info(`创建贴纸包: ${packName} (用户: ${userId})`);

        // 添加剩余贴纸
        let addedCount = 1;

        for (let i = 1; i < packStickers.length; i++) {
          try {
            const sticker = packStickers[i];
            const stickerFile = await ctx.telegram.getFile(sticker.fileId);
            const stickerUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${stickerFile.file_path}`;
            const stickerResponse = await fetch(stickerUrl);
            const stickerBuffer = await stickerResponse.buffer();

            await ctx.telegram.addStickerToSet(
              userIdNum,
              packName,
              {
                png_sticker: { source: stickerBuffer },
                emojis: sticker.emoji || '😀',
              }
            );
            addedCount++;

            // 每添加 5 个暂停一下，避免请求过快
            if (i % 5 === 0) {
              await new Promise(r => setTimeout(r, 300));
            }
          } catch (e) {
            logger.warn(`添加贴纸失败: ${e.message}`);
          }
        }

        // 保存贴纸包信息
        storage.addUserStickerPack({
          userId,
          name: packName,
          title: currentPackTitle,
          stickerCount: addedCount,
        });

        createdPacks.push({
          name: packName,
          title: currentPackTitle,
          count: addedCount,
          link: `https://t.me/addstickers/${packName}`,
        });

        // 进度提示
        if (totalPacks > 1) {
          await ctx.reply(`✅ 贴纸包 ${packIndex + 1}/${totalPacks} 创建完成 (${addedCount} 个贴纸)`);
        }

        // 包之间暂停，避免请求过快
        if (packIndex < totalPacks - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }

      } catch (error) {
        logger.error(`创建贴纸包 ${packIndex + 1} 失败: ${error.message}`);
        await ctx.reply(`❌ 贴纸包 ${packIndex + 1} 创建失败: ${error.message}`);
      }
    }

    // 最终结果
    if (createdPacks.length === 0) {
      return ctx.reply('❌ 所有贴纸包创建失败');
    }

    const buttons = createdPacks.map(pack => [{
      text: `📦 ${pack.title} (${pack.count})`,
      url: pack.link,
    }]);

    await ctx.reply(
      `🎉 <b>贴纸包创建完成！</b>\n\n` +
      `📦 共创建 ${createdPacks.length} 个贴纸包\n` +
      `🎨 共 ${createdPacks.reduce((sum, p) => sum + p.count, 0)} 个贴纸\n\n` +
      `点击下方按钮添加到你的贴纸面板：`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      }
    );
  });

  // /mypack - 查看我的贴纸包
  bot.command('mypack', async (ctx) => {
    const userId = ctx.from.id.toString();
    const packs = storage.getUserStickerPacks(userId);

    if (packs.length === 0) {
      return ctx.reply(
        '📭 <b>你还没有创建贴纸包</b>\n\n' +
        '使用 <code>/createpack 名称</code> 创建一个',
        { parse_mode: 'HTML' }
      );
    }

    const buttons = packs.map(pack => [{
      text: `📦 ${pack.title} (${pack.stickerCount || 0})`,
      url: `https://t.me/addstickers/${pack.name}`,
    }]);

    ctx.reply(
      `📦 <b>我的贴纸包</b>\n\n共 ${packs.length} 个贴纸包`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      }
    );
  });

  // /addtopack - 回复贴纸添加到贴纸包
  bot.command('addtopack', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userIdNum = ctx.from.id;
    const replyMsg = ctx.message.reply_to_message;

    if (!replyMsg || !replyMsg.sticker) {
      return ctx.reply(
        '❌ 请回复一个贴纸使用此命令\n\n' +
        '用法: 回复贴纸发送 <code>/addtopack</code>',
        { parse_mode: 'HTML' }
      );
    }

    const sticker = replyMsg.sticker;

    // 获取用户的贴纸包
    const packs = storage.getUserStickerPacks(userId);
    if (packs.length === 0) {
      return ctx.reply(
        '❌ 你还没有创建贴纸包\n\n' +
        '请先使用 <code>/createpack 名称</code> 创建',
        { parse_mode: 'HTML' }
      );
    }

    // 如果只有一个贴纸包，直接添加
    if (packs.length === 1) {
      await addStickerToPack(ctx, userIdNum, packs[0].name, sticker, logger);
    } else {
      // 多个贴纸包，让用户选择
      const buttons = packs.map(pack => [{
        text: `📦 ${pack.title}`,
        callback_data: `pack_addto_${pack.name}_${sticker.file_id.substring(0, 30)}`,
      }]);

      ctx.reply(
        '选择要添加到哪个贴纸包:',
        { reply_markup: { inline_keyboard: buttons } }
      );
    }
  });

  // 辅助函数：添加贴纸到贴纸包
  async function addStickerToPack(ctx, userIdNum, packName, sticker, logger) {
    if (sticker.is_animated || sticker.is_video) {
      return ctx.reply('❌ 暂不支持添加动态贴纸');
    }

    try {
      const file = await ctx.telegram.getFile(sticker.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`;

      const fetch = require('node-fetch');
      const response = await fetch(fileUrl);
      const buffer = await response.buffer();

      await ctx.telegram.addStickerToSet(
        userIdNum,
        packName,
        {
          png_sticker: { source: buffer },
          emojis: sticker.emoji || '😀',
        }
      );

      // 更新贴纸包计数
      const pack = storage.getUserStickerPack(ctx.from.id.toString(), packName);
      if (pack) {
        storage.updateUserStickerPack(ctx.from.id.toString(), packName, {
          stickerCount: (pack.stickerCount || 0) + 1,
        });
      }

      ctx.reply(
        `✅ 贴纸已添加到贴纸包\n\n` +
        `👉 <a href="https://t.me/addstickers/${packName}">查看贴纸包</a>`,
        { parse_mode: 'HTML' }
      );

      logger.info(`添加贴纸到包: ${packName}`);
    } catch (error) {
      logger.error(`添加贴纸失败: ${error.message}`);
      ctx.reply(`❌ 添加失败: ${error.message}`);
    }
  }

  // 空操作
  bot.action('stickers_noop', (ctx) => ctx.answerCbQuery());

  logger.info('🎨 Sticker 命令已加载');
}

module.exports = { setup };
