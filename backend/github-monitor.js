/**
 * GitHub 仓库监控模块
 * 定期检查仓库更新，推送通知
 */
const storage = require('./storage');
const { loadSettings } = require('./settings');

class GitHubMonitor {
  constructor(logger, onUpdate) {
    this.logger = logger;
    this.onUpdate = onUpdate;
    this.timer = null;
    this.checkInterval = 10 * 60 * 1000; // 默认 10 分钟检查一次
  }

  /**
   * 启动监控
   */
  start() {
    if (this.timer) {
      this.stop();
    }

    this.logger.info('🐙 启动 GitHub 仓库监控');

    // 延迟 30 秒后首次检查（避免启动时压力过大）
    setTimeout(() => {
      this.checkAllRepos();
    }, 30000);

    // 定时检查
    this.timer = setInterval(() => {
      this.checkAllRepos();
    }, this.checkInterval);
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('⏹️ 停止 GitHub 仓库监控');
    }
  }

  /**
   * 检查所有仓库
   */
  async checkAllRepos() {
    const repos = storage.getGithubRepos();

    if (repos.length === 0) {
      return;
    }

    this.logger.info(`🔄 检查 ${repos.length} 个 GitHub 仓库...`);

    for (const repo of repos) {
      try {
        await this.checkRepo(repo);
        // 避免请求过快，间隔 2 秒
        await this.sleep(2000);
      } catch (error) {
        this.logger.error(`检查 ${repo.fullName} 失败: ${error.message}`);
        storage.addLog('error', `GitHub 检查失败: ${repo.fullName} - ${error.message}`, 'github');
      }
    }
  }

  /**
   * 检查单个仓库
   */
  async checkRepo(repo) {
    const { owner, repo: repoName, watchTypes, fullName } = repo;

    // 检查 Release
    if (watchTypes.includes('release')) {
      await this.checkRelease(repo);
    }

    // 检查 Star 数（可选）
    if (watchTypes.includes('star')) {
      await this.checkStars(repo);
    }

    // 更新最后检查时间
    storage.updateGithubRepo(repo.id, {
      lastCheck: new Date().toISOString(),
    });
  }

  /**
   * 检查新 Release
   */
  async checkRelease(repo) {
    const { owner, repo: repoName, fullName, lastRelease } = repo;

    try {
      const release = await this.fetchLatestRelease(owner, repoName);

      if (!release) {
        return; // 没有 Release
      }

      // 首次检查，记录当前版本但不通知
      if (!lastRelease) {
        storage.updateGithubRepo(repo.id, {
          lastRelease: {
            tag: release.tag_name,
            publishedAt: release.published_at,
          },
        });
        this.logger.info(`  📌 ${fullName}: 首次记录版本 ${release.tag_name}`);
        return;
      }

      // 检查是否有新版本
      if (release.tag_name !== lastRelease.tag) {
        this.logger.info(`  🚀 ${fullName}: 发现新版本 ${release.tag_name}`);

        // 更新记录
        storage.updateGithubRepo(repo.id, {
          lastRelease: {
            tag: release.tag_name,
            publishedAt: release.published_at,
          },
        });

        // 保存通知
        storage.addGithubNotification(fullName, 'release', {
          tag: release.tag_name,
          name: release.name,
          body: release.body,
          url: release.html_url,
          publishedAt: release.published_at,
        });

        // 发送通知
        if (this.onUpdate) {
          await this.onUpdate({
            type: 'release',
            repo: fullName,
            release: {
              tag: release.tag_name,
              name: release.name || release.tag_name,
              body: release.body,
              url: release.html_url,
              publishedAt: release.published_at,
            },
          });
        }

        storage.addLog('info', `GitHub 新版本: ${fullName} ${release.tag_name}`, 'github');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * 检查 Star 数变化
   */
  async checkStars(repo) {
    const { owner, repo: repoName, fullName, lastStar } = repo;

    try {
      const repoInfo = await this.fetchRepoInfo(owner, repoName);

      if (!repoInfo) {
        return;
      }

      const currentStars = repoInfo.stargazers_count;

      // 首次记录
      if (lastStar === null || lastStar === undefined) {
        storage.updateGithubRepo(repo.id, { lastStar: currentStars });
        this.logger.info(`  ⭐ ${fullName}: 首次记录 Star ${currentStars}`);
        return;
      }

      // 检查里程碑（每 100、500、1000... 通知）
      const milestones = [100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
      for (const m of milestones) {
        if (lastStar < m && currentStars >= m) {
          this.logger.info(`  🌟 ${fullName}: Star 突破 ${m}！`);

          storage.addGithubNotification(fullName, 'star_milestone', {
            milestone: m,
            currentStars,
            url: repoInfo.html_url,
          });

          if (this.onUpdate) {
            await this.onUpdate({
              type: 'star_milestone',
              repo: fullName,
              milestone: m,
              currentStars,
              url: repoInfo.html_url,
            });
          }

          storage.addLog('info', `GitHub Star 里程碑: ${fullName} 突破 ${m}`, 'github');
          break;
        }
      }

      // 更新记录
      storage.updateGithubRepo(repo.id, { lastStar: currentStars });
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取最新 Release
   */
  async fetchLatestRelease(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const response = await this.fetchWithHeaders(url);

    if (response.status === 404) {
      return null; // 没有 Release
    }

    if (!response.ok) {
      throw new Error(`GitHub API 错误: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * 获取仓库信息
   */
  async fetchRepoInfo(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const response = await this.fetchWithHeaders(url);

    if (!response.ok) {
      throw new Error(`GitHub API 错误: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * 带认证头的请求
   */
  async fetchWithHeaders(url) {
    const settings = loadSettings();
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'TG-Bot-GitHub-Monitor',
    };

    // 如果配置了 GitHub Token，添加认证头
    if (settings.githubToken) {
      headers['Authorization'] = `token ${settings.githubToken}`;
    }

    return await fetch(url, { headers });
  }

  /**
   * 手动刷新单个仓库
   */
  async refreshRepo(repoId) {
    const repos = storage.getGithubRepos();
    const repo = repos.find(r => r.id === repoId);

    if (!repo) {
      throw new Error('仓库不存在');
    }

    await this.checkRepo(repo);
    return repo;
  }

  /**
   * 获取仓库详情（含实时信息）
   */
  async getRepoDetails(owner, repo) {
    const repoInfo = await this.fetchRepoInfo(owner, repo);
    let latestRelease = null;

    try {
      latestRelease = await this.fetchLatestRelease(owner, repo);
    } catch (e) {
      // 可能没有 release
    }

    return {
      ...repoInfo,
      latestRelease,
    };
  }

  /**
   * 格式化通知消息
   */
  formatMessage(data) {
    if (data.type === 'release') {
      const { repo, release } = data;
      const body = release.body
        ? release.body.substring(0, 500) + (release.body.length > 500 ? '...' : '')
        : '无更新说明';

      return [
        `🚀 <b>新版本发布</b>`,
        ``,
        `📦 <b>${repo}</b>`,
        `🏷️ ${release.tag}`,
        release.name !== release.tag ? `📝 ${release.name}` : '',
        ``,
        `<b>更新内容：</b>`,
        `<code>${this.escapeHtml(body)}</code>`,
        ``,
        `🔗 <a href="${release.url}">查看详情</a>`,
      ].filter(Boolean).join('\n');
    }

    if (data.type === 'star_milestone') {
      return [
        `🌟 <b>Star 里程碑</b>`,
        ``,
        `📦 <b>${data.repo}</b>`,
        `⭐ 突破 <b>${data.milestone}</b> Star！`,
        `📊 当前 Star 数: ${data.currentStars}`,
        ``,
        `🔗 <a href="${data.url}">查看仓库</a>`,
      ].join('\n');
    }

    return '';
  }

  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = GitHubMonitor;
