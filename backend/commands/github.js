/**
 * GitHub 监控命令
 */
const storage = require('../storage');

function setup(bot, { logger }) {
  // 帮助命令
  bot.command('ghhelp', (ctx) => {
    ctx.reply(
      `🐙 <b>GitHub 仓库监控</b>\n\n` +
      `<b>监控命令：</b>\n` +
      `<code>/ghwatch owner/repo</code> - 监控仓库（默认监控 Release）\n` +
      `<code>/ghwatch owner/repo release,star</code> - 指定监控类型\n` +
      `<code>/ghunwatch owner/repo</code> - 取消监控\n` +
      `<code>/ghwatchowner owner</code> - 监控账号下仓库更新\n` +
      `<code>/ghunwatchowner owner</code> - 取消账号监控\n` +
      `<code>/ghowners</code> - 查看账号监控列表\n` +
      `<code>/ghlist</code> - 查看监控列表\n` +
      `<code>/ghcheck owner/repo</code> - 查看仓库信息\n\n` +
      `<b>监控类型：</b>\n` +
      `• <code>release</code> - 新版本发布\n` +
      `• <code>star</code> - Star 里程碑通知\n\n` +
      `💡 公开仓库无需配置，每 10 分钟检查一次`,
      { parse_mode: 'HTML' }
    );
  });

  // 添加监控
  bot.command('ghwatch', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length === 0) {
      return ctx.reply(
        '❌ 请提供仓库地址\n\n' +
        '用法：<code>/ghwatch owner/repo</code>\n' +
        '示例：<code>/ghwatch microsoft/vscode</code>',
        { parse_mode: 'HTML' }
      );
    }

    // 解析仓库名
    let repoPath = args[0];
    // 支持完整 URL
    const urlMatch = repoPath.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (urlMatch) {
      repoPath = `${urlMatch[1]}/${urlMatch[2]}`;
    }

    const parts = repoPath.split('/');
    if (parts.length !== 2) {
      return ctx.reply(
        '❌ 仓库格式错误\n\n' +
        '正确格式：<code>owner/repo</code>\n' +
        '示例：<code>microsoft/vscode</code>',
        { parse_mode: 'HTML' }
      );
    }

    const [owner, repo] = parts;

    // 解析监控类型
    let watchTypes = ['release'];
    if (args.length > 1) {
      watchTypes = args[1].split(',').map(t => t.trim().toLowerCase());
      const validTypes = ['release', 'star'];
      watchTypes = watchTypes.filter(t => validTypes.includes(t));
      if (watchTypes.length === 0) {
        watchTypes = ['release'];
      }
    }

    // 验证仓库是否存在
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'TG-Bot-GitHub-Monitor',
        },
      });

      if (response.status === 404) {
        return ctx.reply(`❌ 仓库 <code>${owner}/${repo}</code> 不存在`, { parse_mode: 'HTML' });
      }

      if (!response.ok) {
        return ctx.reply(`❌ 请求失败: ${response.status}`);
      }

      const repoInfo = await response.json();

      // 添加监控
      const result = storage.addGithubRepo(owner, repo, watchTypes);

      if (result.success) {
        storage.addLog('info', `GitHub 添加监控: ${owner}/${repo}`, 'github');
        ctx.reply(
          `✅ 已添加监控\n\n` +
          `📦 <b>${repoInfo.full_name}</b>\n` +
          `📝 ${repoInfo.description || '无描述'}\n` +
          `⭐ ${repoInfo.stargazers_count} Stars\n` +
          `👁️ 监控类型: ${watchTypes.join(', ')}\n\n` +
          `系统将每 10 分钟检查一次更新`,
          { parse_mode: 'HTML' }
        );
      } else {
        ctx.reply(`❌ ${result.error}`);
      }
    } catch (error) {
      logger.error(`添加 GitHub 监控失败: ${error.message}`);
      ctx.reply(`❌ 添加失败: ${error.message}`);
    }
  });

  // 取消监控
  bot.command('ghunwatch', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length === 0) {
      return ctx.reply(
        '❌ 请提供仓库地址\n\n' +
        '用法：<code>/ghunwatch owner/repo</code>',
        { parse_mode: 'HTML' }
      );
    }

    let repoPath = args[0];
    // 支持完整 URL
    const urlMatch = repoPath.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (urlMatch) {
      repoPath = `${urlMatch[1]}/${urlMatch[2]}`;
    }

    const deleted = storage.deleteGithubRepoByName(repoPath);

    if (deleted) {
      storage.addLog('info', `GitHub 取消监控: ${repoPath}`, 'github');
      ctx.reply(`✅ 已取消监控 <code>${repoPath}</code>`, { parse_mode: 'HTML' });
    } else {
      ctx.reply('❌ 未找到该仓库的监控记录');
    }
  });

  // 查看监控列表
  bot.command('ghlist', (ctx) => {
    const repos = storage.getGithubRepos();
    const owners = storage.getGithubOwners();

    if (repos.length === 0 && owners.length === 0) {
      return ctx.reply(
        '📋 当前没有监控任何 GitHub 目标\n\n' +
        '使用 <code>/ghwatch owner/repo</code> 或 <code>/ghwatchowner owner</code> 来添加监控',
        { parse_mode: 'HTML' }
      );
    }

    const list = repos.map((r, i) => {
      const lastCheck = r.lastCheck
        ? new Date(r.lastCheck).toLocaleString('zh-CN')
        : '从未';
      const lastVersion = r.lastRelease?.tag || '-';
      return `${i + 1}. <b>${r.fullName}</b>\n   📌 ${lastVersion} | ⏱ ${lastCheck}\n   👁️ ${r.watchTypes.join(', ')}`;
    }).join('\n\n');

    const ownerList = owners.map((o, i) => {
      const lastCheck = o.lastCheck
        ? new Date(o.lastCheck).toLocaleString('zh-CN')
        : '从未';
      return `${i + 1}. <b>${o.owner}</b> (${o.ownerType})\n   ⏱ ${lastCheck}`;
    }).join('\n\n');

    const message = [
      repos.length > 0
        ? `📦 <b>仓库监控（${repos.length}个）</b>\n\n${list}`
        : '',
      owners.length > 0
        ? `👤 <b>账号监控（${owners.length}个）</b>\n\n${ownerList}`
        : '',
    ].filter(Boolean).join('\n\n');

    ctx.reply(`📋 <b>GitHub 监控列表</b>\n\n${message}`, { parse_mode: 'HTML' });
  });

  bot.command('ghwatchowner', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const owner = String(args[0] || '').trim();

    if (!owner) {
      return ctx.reply(
        '❌ 请提供账号\n\n用法：<code>/ghwatchowner owner</code>\n示例：<code>/ghwatchowner microsoft</code>',
        { parse_mode: 'HTML' }
      );
    }

    try {
      const response = await fetch(`https://api.github.com/users/${owner}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'TG-Bot-GitHub-Monitor',
        },
      });

      if (response.status === 404) {
        return ctx.reply(`❌ 账号 <code>${owner}</code> 不存在`, { parse_mode: 'HTML' });
      }
      if (!response.ok) {
        return ctx.reply(`❌ 请求失败: ${response.status}`);
      }

      const profile = await response.json();
      const ownerType = profile.type === 'Organization' ? 'org' : 'user';
      const result = storage.addGithubOwner(owner, ownerType);

      if (!result.success) {
        return ctx.reply(`❌ ${result.error}`);
      }

      storage.addLog('info', `GitHub 添加账号监控: ${owner} (${ownerType})`, 'github');
      ctx.reply(
        `✅ 已添加账号监控\n\n` +
        `👤 <b>${profile.login}</b> (${ownerType})\n` +
        `📦 公开仓库: ${profile.public_repos}\n` +
        `🔗 <a href="${profile.html_url}">查看主页</a>\n\n` +
        `系统会在账号下任意仓库有代码更新时推送提醒`,
        { parse_mode: 'HTML', disable_web_page_preview: true }
      );
    } catch (error) {
      logger.error(`添加 GitHub 账号监控失败: ${error.message}`);
      ctx.reply(`❌ 添加失败: ${error.message}`);
    }
  });

  bot.command('ghunwatchowner', (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const owner = String(args[0] || '').trim();

    if (!owner) {
      return ctx.reply('❌ 用法：<code>/ghunwatchowner owner</code>', { parse_mode: 'HTML' });
    }

    const owners = storage.getGithubOwners();
    const target = owners.find(o => o.owner.toLowerCase() === owner.toLowerCase());
    if (!target) {
      return ctx.reply('❌ 未找到该账号的监控记录');
    }

    const deleted = storage.deleteGithubOwner(target.id);
    if (deleted) {
      storage.addLog('info', `GitHub 取消账号监控: ${owner}`, 'github');
      ctx.reply(`✅ 已取消账号监控 <code>${owner}</code>`, { parse_mode: 'HTML' });
    } else {
      ctx.reply('❌ 删除失败');
    }
  });

  bot.command('ghowners', (ctx) => {
    const owners = storage.getGithubOwners();

    if (owners.length === 0) {
      return ctx.reply(
        '📋 当前没有监控任何 GitHub 账号\n\n使用 <code>/ghwatchowner owner</code> 来添加监控',
        { parse_mode: 'HTML' }
      );
    }

    const list = owners.map((o, i) => {
      const lastCheck = o.lastCheck
        ? new Date(o.lastCheck).toLocaleString('zh-CN')
        : '从未';
      return `${i + 1}. <b>${o.owner}</b> (${o.ownerType})\n   ⏱ ${lastCheck}`;
    }).join('\n\n');

    ctx.reply(`👤 <b>监控中的 GitHub 账号（${owners.length}个）</b>\n\n${list}`, { parse_mode: 'HTML' });
  });

  // 查看仓库信息
  bot.command('ghcheck', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length === 0) {
      return ctx.reply(
        '❌ 请提供仓库地址\n\n' +
        '用法：<code>/ghcheck owner/repo</code>',
        { parse_mode: 'HTML' }
      );
    }

    let repoPath = args[0];
    const urlMatch = repoPath.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (urlMatch) {
      repoPath = `${urlMatch[1]}/${urlMatch[2]}`;
    }

    const [owner, repo] = repoPath.split('/');
    if (!owner || !repo) {
      return ctx.reply('❌ 仓库格式错误');
    }

    try {
      const loadingMsg = await ctx.reply('🔄 正在获取仓库信息...');

      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'TG-Bot-GitHub-Monitor',
        },
      });

      if (!response.ok) {
        return ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          null,
          `❌ 仓库不存在或请求失败`
        );
      }

      const repoInfo = await response.json();

      // 获取最新 Release
      let releaseInfo = '';
      try {
        const releaseRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'TG-Bot-GitHub-Monitor',
          },
        });
        if (releaseRes.ok) {
          const release = await releaseRes.json();
          releaseInfo = `\n🏷️ <b>最新版本:</b> ${release.tag_name}\n📅 ${new Date(release.published_at).toLocaleDateString('zh-CN')}`;
        }
      } catch (e) {
        // 没有 release
      }

      const message = [
        `🐙 <b>${repoInfo.full_name}</b>`,
        ``,
        `📝 ${repoInfo.description || '无描述'}`,
        ``,
        `⭐ <b>Stars:</b> ${repoInfo.stargazers_count.toLocaleString()}`,
        `🍴 <b>Forks:</b> ${repoInfo.forks_count.toLocaleString()}`,
        `👁️ <b>Watchers:</b> ${repoInfo.watchers_count.toLocaleString()}`,
        `📂 <b>语言:</b> ${repoInfo.language || '未知'}`,
        releaseInfo,
        ``,
        `🔗 <a href="${repoInfo.html_url}">查看仓库</a>`,
      ].filter(Boolean).join('\n');

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        loadingMsg.message_id,
        null,
        message,
        { parse_mode: 'HTML', disable_web_page_preview: true }
      );
    } catch (error) {
      logger.error(`查询 GitHub 仓库失败: ${error.message}`);
      ctx.reply(`❌ 查询失败: ${error.message}`);
    }
  });

  logger.info('🐙 GitHub 监控命令已加载');
}

module.exports = { setup };
