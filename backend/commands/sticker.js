/**
 * 贴纸收藏命令 - 转发贴纸自动收藏或添加到贴纸包
 */
const storage = require('../storage');

const PAGE_SIZE = 10;
const MAX_STICKERS_PER_PACK = 120;

// 临时存储等待创建贴纸包的用户状态
const pendingPackCreation = new Map();

// 临时存储用户最近发送的贴纸（用于快速添加按钮）
const pendingStickers = new Map();

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
  const fetch = require('node-fetch');

  // 辅助函数：添加贴纸到贴纸包
  async function addStickerToPack(ctx, userIdNum, packName, sticker, silent = false) {
    if (sticker.is_animated || sticker.is_video) {
      if (!silent) await ctx.reply('❌ 暂不支持添加动态贴纸到贴纸包');
      return false;
    }

    try {
      const file = await ctx.telegram.getFile(sticker.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`;

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
      const userId = ctx.from.id.toString();
      const pack = storage.getUserStickerPack(userId, packName);
      if (pack) {
        storage.updateUserStickerPack(userId, packName, {
          stickerCount: (pack.stickerCount || 0) + 1,
        });
      }

      logger.info(`添加贴纸到包: ${packName}`);
      return true;
    } catch (error) {
      logger.error(`添加贴纸失败: ${error.message}`);
      if (!silent) await ctx.reply(`❌ 添加失败: ${error.message}`);
      return false;
    }
  }

  // 监听转发的贴纸消息
  bot.on('sticker', async (ctx) => {
    const sticker = ctx.message.sticker;
    const userId = ctx.from.id.toString();
    const userIdNum = ctx.from.id;
    const chatType = ctx.chat.type;

    // 只在私聊中处理
    if (chatType !== 'private') {
      return;
    }

    // 检查是否在等待创建贴纸包（需要第一个贴纸）
    const pendingPack = pendingPackCreation.get(userId);
    if (pendingPack) {
      pendingPackCreation.delete(userId);

      // 检查是否是动态贴纸
      if (sticker.is_animated || sticker.is_video) {
        return ctx.reply('❌ 暂不支持动态贴纸，请发送静态贴纸');
      }

      try {
        const botInfo = await ctx.telegram.getMe();
        const botUsername = botInfo.username;
        const packName = `u${userId}_${Date.now()}_by_${botUsername}`;

        // 获取贴纸文件
        const file = await ctx.telegram.getFile(sticker.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`;
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();

        // 创建贴纸包
        await ctx.telegram.createNewStickerSet(
          userIdNum,
          packName,
          pendingPack.title,
          {
            png_sticker: { source: buffer },
            emojis: sticker.emoji || '😀',
          }
        );

        // 保存贴纸包信息
        storage.addUserStickerPack({
          userId,
          name: packName,
          title: pendingPack.title,
          stickerCount: 1,
        });

        logger.info(`创建贴纸包: ${packName} (用户: ${userId})`);

        return ctx.reply(
          `🎉 <b>贴纸包创建成功！</b>\n\n` +
          `📦 名称: ${pendingPack.title}\n` +
          `🎨 已添加 1 个贴纸\n\n` +
          `现在转发贴纸给我，可以直接添加到这个贴纸包！`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📦 查看贴纸包', url: `https://t.me/addstickers/${packName}` }],
                [{ text: '📋 我的贴纸包', callback_data: 'mypack_list' }],
              ]
            }
          }
        );
      } catch (error) {
        logger.error(`创建贴纸包失败: ${error.message}`);
        return ctx.reply(`❌ 创建贴纸包失败: ${error.message}`);
      }
    }

    // 获取用户的贴纸包
    const packs = storage.getUserStickerPacks(userId);

    // 检查贴纸是否已收藏
    const existingStickers = storage.getStickers(userId);
    const alreadySaved = existingStickers.some(s => s.fileId === sticker.file_id);

    // 保存当前贴纸到临时存储（用于快速添加）
    pendingStickers.set(userId, {
      fileId: sticker.file_id,
      emoji: sticker.emoji,
      isAnimated: sticker.is_animated,
      isVideo: sticker.is_video,
      timestamp: Date.now(),
    });

    // 5分钟后自动清除
    setTimeout(() => {
      const pending = pendingStickers.get(userId);
      if (pending && Date.now() - pending.timestamp > 5 * 60 * 1000) {
        pendingStickers.delete(userId);
      }
    }, 5 * 60 * 1000);

    // 构建操作按钮
    const buttons = [];

    // 如果有贴纸包，显示添加到贴纸包的选项
    if (packs.length > 0) {
      // 筛选未满的贴纸包
      const availablePacks = packs.filter(p => (p.stickerCount || 0) < MAX_STICKERS_PER_PACK);

      if (availablePacks.length > 0) {
        // 显示贴纸包选项（最多显示3个），使用索引作为短ID
        availablePacks.slice(0, 3).forEach((pack, idx) => {
          buttons.push([{
            text: `📦 ${pack.title} (${pack.stickerCount || 0})`,
            callback_data: `qa_${idx}`,  // 短callback_data
          }]);
        });

        if (availablePacks.length > 3) {
          buttons.push([{ text: '📦 更多贴纸包...', callback_data: 'qa_more' }]);
        }
      }
    }

    // 添加其他操作按钮
    if (!alreadySaved) {
      buttons.push([{ text: '💾 仅收藏', callback_data: 'saveonly' }]);
    }
    buttons.push([{ text: '➕ 创建新贴纸包', callback_data: 'newpack_start' }]);

    // 发送提示
    const typeLabel = sticker.is_animated ? '动态' : sticker.is_video ? '视频' : '静态';
    const statusText = alreadySaved ? '（已在收藏中）' : '';

    ctx.reply(
      `🎨 收到${typeLabel}贴纸 ${sticker.emoji || ''} ${statusText}\n\n` +
      (packs.length > 0
        ? '选择操作：'
        : '你还没有贴纸包，可以创建一个：'),
      {
        reply_markup: { inline_keyboard: buttons }
      }
    );
  });

  // 快速添加到贴纸包（使用短索引）
  bot.action(/^qa_(\d+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('正在添加...'); } catch (e) {}

    const packIndex = parseInt(ctx.match[1]);
    const userId = ctx.from.id.toString();
    const userIdNum = ctx.from.id;

    // 从临时存储获取贴纸
    const pendingSticker = pendingStickers.get(userId);
    if (!pendingSticker) {
      return ctx.editMessageText('❌ 贴纸已过期，请重新发送');
    }

    // 获取贴纸包
    const packs = storage.getUserStickerPacks(userId);
    const availablePacks = packs.filter(p => (p.stickerCount || 0) < MAX_STICKERS_PER_PACK);
    const pack = availablePacks[packIndex];

    if (!pack) {
      return ctx.editMessageText('❌ 贴纸包不存在');
    }

    const sticker = {
      file_id: pendingSticker.fileId,
      emoji: pendingSticker.emoji,
      is_animated: pendingSticker.isAnimated,
      is_video: pendingSticker.isVideo,
    };

    const success = await addStickerToPack(ctx, userIdNum, pack.name, sticker, true);

    if (success) {
      const updatedPack = storage.getUserStickerPack(userId, pack.name);
      await ctx.editMessageText(
        `✅ <b>已添加到贴纸包</b>\n\n` +
        `📦 ${updatedPack?.title || pack.title}\n` +
        `🎨 当前共 ${updatedPack?.stickerCount || 1} 个贴纸\n\n` +
        `继续转发贴纸给我添加更多！`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📦 查看贴纸包', url: `https://t.me/addstickers/${pack.name}` }],
            ]
          }
        }
      );
    } else {
      await ctx.editMessageText('❌ 添加失败，可能是动态贴纸或贴纸包已满');
    }
  });

  // 更多贴纸包选择
  bot.action('qa_more', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}

    const userId = ctx.from.id.toString();
    const packs = storage.getUserStickerPacks(userId);
    const availablePacks = packs.filter(p => (p.stickerCount || 0) < MAX_STICKERS_PER_PACK);

    if (availablePacks.length === 0) {
      return ctx.editMessageText('❌ 没有可用的贴纸包');
    }

    // 显示所有贴纸包（每行一个，最多10个）
    const buttons = availablePacks.slice(0, 10).map((pack, idx) => [{
      text: `📦 ${pack.title} (${pack.stickerCount || 0})`,
      callback_data: `qa_${idx}`,
    }]);

    buttons.push([{ text: '🔙 取消', callback_data: 'stickers_cancel' }]);

    await ctx.editMessageText(
      '📦 选择要添加到的贴纸包：',
      { reply_markup: { inline_keyboard: buttons } }
    );
  });

  // 取消操作
  bot.action('stickers_cancel', async (ctx) => {
    try { await ctx.answerCbQuery('已取消'); } catch (e) {}
    await ctx.editMessageText('❌ 已取消操作');
  });

  // 仅收藏贴纸（使用临时存储）
  bot.action('saveonly', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}

    const userId = ctx.from.id.toString();

    // 从临时存储获取贴纸
    const pendingSticker = pendingStickers.get(userId);
    if (!pendingSticker) {
      return ctx.editMessageText('❌ 贴纸已过期，请重新发送');
    }

    // 检查是否已收藏
    const stickers = storage.getStickers(userId);
    if (stickers.some(s => s.fileId === pendingSticker.fileId)) {
      return ctx.editMessageText('⚠️ 这个贴纸已经在收藏中了');
    }

    // 保存贴纸
    storage.addSticker({
      fileId: pendingSticker.fileId,
      emoji: pendingSticker.emoji || null,
      isAnimated: pendingSticker.isAnimated || false,
      isVideo: pendingSticker.isVideo || false,
      userId,
    });

    logger.info(`贴纸已收藏: ${pendingSticker.fileId.substring(0, 20)}... (用户: ${userId})`);

    await ctx.editMessageText(
      `✅ <b>贴纸已收藏</b>\n\n` +
      `${pendingSticker.emoji ? `表情: ${pendingSticker.emoji}` : ''}\n\n` +
      `💡 提示: 使用 /newpack 创建贴纸包后可在官方面板使用`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 查看收藏', callback_data: 'stickers_list' }],
          ]
        }
      }
    );
  });

  // 开始创建新贴纸包
  bot.action('newpack_start', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}

    await ctx.editMessageText(
      '📦 <b>创建新贴纸包</b>\n\n' +
      '请发送贴纸包名称：\n\n' +
      '例如: <code>/newpack 我的表情包</code>',
      { parse_mode: 'HTML' }
    );
  });

  // /newpack <名称> - 创建新贴纸包（等待第一个贴纸）
  bot.command('newpack', async (ctx) => {
    const userId = ctx.from.id.toString();
    const packTitle = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!packTitle) {
      return ctx.reply(
        '📦 <b>创建贴纸包</b>\n\n' +
        '用法: <code>/newpack 贴纸包名称</code>\n\n' +
        '例如: <code>/newpack 我的表情包</code>\n\n' +
        '发送命令后，转发一个贴纸作为第一个贴纸',
        { parse_mode: 'HTML' }
      );
    }

    // 检查名称长度
    if (packTitle.length > 64) {
      return ctx.reply('❌ 贴纸包名称过长，最多 64 个字符');
    }

    // 保存等待状态
    pendingPackCreation.set(userId, {
      title: packTitle,
      createdAt: Date.now(),
    });

    // 5 分钟后自动清除等待状态
    setTimeout(() => {
      if (pendingPackCreation.get(userId)?.createdAt === pendingPackCreation.get(userId)?.createdAt) {
        pendingPackCreation.delete(userId);
      }
    }, 5 * 60 * 1000);

    ctx.reply(
      `📦 准备创建贴纸包: <b>${packTitle}</b>\n\n` +
      `请现在转发一个<b>静态贴纸</b>给我，作为贴纸包的第一个贴纸`,
      { parse_mode: 'HTML' }
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

  // /mypack - 查看我的贴纸包
  bot.command('mypack', async (ctx) => {
    const userId = ctx.from.id.toString();
    const packs = storage.getUserStickerPacks(userId);

    if (packs.length === 0) {
      return ctx.reply(
        '📭 <b>你还没有贴纸包</b>\n\n' +
        '使用 <code>/newpack 名称</code> 创建一个\n\n' +
        '创建后转发贴纸就能直接添加到贴纸包！',
        { parse_mode: 'HTML' }
      );
    }

    const buttons = packs.map(pack => [{
      text: `📦 ${pack.title} (${pack.stickerCount || 0}/${MAX_STICKERS_PER_PACK})`,
      url: `https://t.me/addstickers/${pack.name}`,
    }]);

    buttons.push([{ text: '➕ 创建新贴纸包', callback_data: 'newpack_start' }]);

    ctx.reply(
      `📦 <b>我的贴纸包</b>\n\n` +
      `共 ${packs.length} 个贴纸包\n` +
      `点击查看并添加到你的 Telegram：`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      }
    );
  });

  // 我的贴纸包列表（回调按钮）
  bot.action('mypack_list', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}

    const userId = ctx.from.id.toString();
    const packs = storage.getUserStickerPacks(userId);

    if (packs.length === 0) {
      return ctx.editMessageText(
        '📭 <b>你还没有贴纸包</b>\n\n' +
        '使用 <code>/newpack 名称</code> 创建一个',
        { parse_mode: 'HTML' }
      );
    }

    const buttons = packs.map(pack => [{
      text: `📦 ${pack.title} (${pack.stickerCount || 0})`,
      url: `https://t.me/addstickers/${pack.name}`,
    }]);

    await ctx.editMessageText(
      `📦 <b>我的贴纸包</b>\n\n共 ${packs.length} 个`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      }
    );
  });

  // /createpack <名称> - 从收藏创建贴纸包（批量）
  bot.command('createpack', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userIdNum = ctx.from.id;
    const packTitle = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!packTitle) {
      return ctx.reply(
        '📦 <b>从收藏创建贴纸包</b>\n\n' +
        '用法: <code>/createpack 贴纸包名称</code>\n\n' +
        '这会将你<b>所有收藏的贴纸</b>创建成贴纸包\n\n' +
        '💡 如果只想创建空贴纸包再逐个添加，请用 <code>/newpack</code>',
        { parse_mode: 'HTML' }
      );
    }

    // 获取用户收藏的贴纸
    const stickers = storage.getStickers(userId);
    if (stickers.length === 0) {
      return ctx.reply('❌ 你还没有收藏任何贴纸\n\n请先转发贴纸给我收藏，或使用 /newpack 创建空贴纸包');
    }

    // 只能用静态贴纸创建
    const staticStickers = stickers.filter(s => !s.isAnimated && !s.isVideo);
    if (staticStickers.length === 0) {
      return ctx.reply('❌ 你收藏的都是动态贴纸，暂不支持批量创建\n\n请使用 /newpack 创建贴纸包后逐个添加');
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

    for (let packIndex = 0; packIndex < totalPacks; packIndex++) {
      const startIdx = packIndex * MAX_STICKERS_PER_PACK;
      const endIdx = Math.min(startIdx + MAX_STICKERS_PER_PACK, staticStickers.length);
      const packStickers = staticStickers.slice(startIdx, endIdx);

      const packSuffix = totalPacks > 1 ? ` (${packIndex + 1})` : '';
      const currentPackTitle = `${packTitle}${packSuffix}`;
      const packName = `u${userId}_${Date.now()}_${packIndex}_by_${botUsername}`;

      try {
        // 获取第一个贴纸的文件
        const firstSticker = packStickers[0];
        const file = await ctx.telegram.getFile(firstSticker.fileId);
        const fileUrl = `https://api.telegram.org/file/bot${ctx.telegram.token}/${file.file_path}`;
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

        if (totalPacks > 1) {
          await ctx.reply(`✅ 贴纸包 ${packIndex + 1}/${totalPacks} 创建完成 (${addedCount} 个贴纸)`);
        }

        if (packIndex < totalPacks - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }

      } catch (error) {
        logger.error(`创建贴纸包 ${packIndex + 1} 失败: ${error.message}`);
        await ctx.reply(`❌ 贴纸包 ${packIndex + 1} 创建失败: ${error.message}`);
      }
    }

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

    // 获取用户的贴纸包
    const packs = storage.getUserStickerPacks(userId);
    const packButtons = packs.slice(0, 3).map(pack => ({
      text: `📦 添加到 ${pack.title}`,
      callback_data: `addto_${pack.name}_${sticker.id}`,
    }));

    const createdAt = new Date(sticker.createdAt).toLocaleString('zh-CN');
    const tags = sticker.tags?.length > 0 ? sticker.tags.join(', ') : '无';

    const buttons = [];

    // 添加到贴纸包按钮
    if (packButtons.length > 0) {
      packButtons.forEach(btn => buttons.push([btn]));
    }

    buttons.push([
      { text: '🏷️ 编辑标签', callback_data: `sticker_tag_${id}` },
      { text: '📁 移动分组', callback_data: `sticker_move_${id}` },
    ]);
    buttons.push([
      { text: '🗑️ 删除', callback_data: `sticker_del_confirm_${id}` },
      { text: '🔙 返回列表', callback_data: 'stickers_list' },
    ]);

    await ctx.reply(
      `🎨 <b>贴纸详情</b>\n\n` +
      `${sticker.emoji ? `表情: ${sticker.emoji}` : ''}\n` +
      `${sticker.setName ? `贴纸包: ${sticker.setName}` : '单独贴纸'}\n` +
      `标签: ${tags}\n` +
      `使用次数: ${sticker.usageCount || 0}\n` +
      `收藏时间: ${createdAt}`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      }
    );
  });

  // 从详情页添加到贴纸包
  bot.action(/^addto_(.+)_(.+)$/, async (ctx) => {
    try { await ctx.answerCbQuery('正在添加...'); } catch (e) {}

    const packName = ctx.match[1];
    const stickerId = ctx.match[2];
    const userId = ctx.from.id.toString();
    const userIdNum = ctx.from.id;

    const stickerData = storage.getStickers(userId).find(s => s.id === stickerId);
    if (!stickerData) {
      return ctx.reply('❌ 贴纸不存在');
    }

    const sticker = {
      file_id: stickerData.fileId,
      emoji: stickerData.emoji,
      is_animated: stickerData.isAnimated,
      is_video: stickerData.isVideo,
    };

    const success = await addStickerToPack(ctx, userIdNum, packName, sticker, true);

    if (success) {
      const pack = storage.getUserStickerPack(userId, packName);
      await ctx.reply(
        `✅ 已添加到贴纸包: ${pack?.title || packName}\n\n` +
        `👉 <a href="https://t.me/addstickers/${packName}">查看贴纸包</a>`,
        { parse_mode: 'HTML' }
      );
    } else {
      await ctx.reply('❌ 添加失败');
    }
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

  // 空操作
  bot.action('stickers_noop', (ctx) => ctx.answerCbQuery());

  logger.info('🎨 Sticker 命令已加载');
}

module.exports = { setup };
