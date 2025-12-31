/**
 * 热榜数据获取模块
 */
const storage = require('./storage');

// 热榜源配置
const TRENDING_SOURCES = {
  weibo: {
    id: 'weibo',
    name: '微博热搜',
    emoji: '🔥',
    color: '#ff8200',
    api: 'https://weibo.com/ajax/side/hotSearch',
    enabled: true,
  },
  zhihu: {
    id: 'zhihu',
    name: '知乎热榜',
    emoji: '💡',
    color: '#0084ff',
    api: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total',
    enabled: true,
  },
  github: {
    id: 'github',
    name: 'GitHub Trending',
    emoji: '🐙',
    color: '#333',
    api: 'https://api.github.com/search/repositories',
    enabled: true,
  },
  baidu: {
    id: 'baidu',
    name: '百度热搜',
    emoji: '🔍',
    color: '#2932e1',
    api: 'https://top.baidu.com/api/board?platform=wise&tab=realtime',
    enabled: true,
  },
  bilibili: {
    id: 'bilibili',
    name: 'B站热门',
    emoji: '📺',
    color: '#fb7299',
    api: 'https://api.bilibili.com/x/web-interface/ranking/v2',
    enabled: true,
  },
  douyin: {
    id: 'douyin',
    name: '抖音热榜',
    emoji: '🎵',
    color: '#000',
    api: 'https://www.douyin.com/aweme/v1/web/hot/search/list/',
    enabled: true,
  },
};

// 请求头配置
const getHeaders = (source) => {
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };

  switch (source) {
    case 'weibo':
      return {
        ...baseHeaders,
        'Referer': 'https://weibo.com/',
      };
    case 'zhihu':
      return {
        ...baseHeaders,
        'Referer': 'https://www.zhihu.com/',
      };
    case 'bilibili':
      return {
        ...baseHeaders,
        'Referer': 'https://www.bilibili.com/',
      };
    default:
      return baseHeaders;
  }
};

/**
 * 获取微博热搜
 */
async function fetchWeibo() {
  try {
    const response = await fetch(TRENDING_SOURCES.weibo.api, {
      headers: getHeaders('weibo'),
    });
    const data = await response.json();

    if (data.ok === 1 && data.data?.realtime) {
      return data.data.realtime.slice(0, 30).map((item, index) => ({
        rank: index + 1,
        title: item.word || item.note,
        hot: item.num || item.raw_hot,
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word || item.note)}`,
        tag: item.icon_desc || '',
      }));
    }
    return [];
  } catch (error) {
    console.error('获取微博热搜失败:', error.message);
    return [];
  }
}

/**
 * 获取知乎热榜
 */
async function fetchZhihu() {
  try {
    const response = await fetch(TRENDING_SOURCES.zhihu.api, {
      headers: getHeaders('zhihu'),
    });
    const data = await response.json();

    if (data.data) {
      return data.data.slice(0, 30).map((item, index) => ({
        rank: index + 1,
        title: item.target?.title || item.title,
        hot: item.detail_text || item.target?.excerpt || '',
        url: item.target?.url ? `https://www.zhihu.com/question/${item.target.id}` : '',
        tag: '',
      }));
    }
    return [];
  } catch (error) {
    console.error('获取知乎热榜失败:', error.message);
    return [];
  }
}

/**
 * 获取 GitHub Trending
 */
async function fetchGithub() {
  try {
    // 使用 GitHub API 获取今日 star 最多的仓库
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const since = date.toISOString().split('T')[0];

    const response = await fetch(
      `${TRENDING_SOURCES.github.api}?q=created:>${since}&sort=stars&order=desc&per_page=30`,
      {
        headers: {
          ...getHeaders('github'),
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );
    const data = await response.json();

    if (data.items) {
      return data.items.map((item, index) => ({
        rank: index + 1,
        title: item.full_name,
        hot: `⭐ ${item.stargazers_count} | ${item.description || 'No description'}`,
        url: item.html_url,
        tag: item.language || '',
      }));
    }
    return [];
  } catch (error) {
    console.error('获取 GitHub Trending 失败:', error.message);
    return [];
  }
}

/**
 * 获取百度热搜
 */
async function fetchBaidu() {
  try {
    const response = await fetch(TRENDING_SOURCES.baidu.api, {
      headers: getHeaders('baidu'),
    });
    const data = await response.json();

    if (data.data?.cards?.[0]?.content) {
      return data.data.cards[0].content.slice(0, 30).map((item, index) => ({
        rank: index + 1,
        title: item.word || item.query,
        hot: item.hotScore || item.desc || '',
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(item.word || item.query)}`,
        tag: item.tag || '',
      }));
    }
    return [];
  } catch (error) {
    console.error('获取百度热搜失败:', error.message);
    return [];
  }
}

/**
 * 获取 B站热门
 */
async function fetchBilibili() {
  try {
    const response = await fetch(TRENDING_SOURCES.bilibili.api, {
      headers: getHeaders('bilibili'),
    });
    const data = await response.json();

    if (data.code === 0 && data.data?.list) {
      return data.data.list.slice(0, 30).map((item, index) => ({
        rank: index + 1,
        title: item.title,
        hot: `👀 ${formatNumber(item.stat?.view)} | 👍 ${formatNumber(item.stat?.like)}`,
        url: `https://www.bilibili.com/video/${item.bvid}`,
        tag: item.tname || '',
      }));
    }
    return [];
  } catch (error) {
    console.error('获取B站热门失败:', error.message);
    return [];
  }
}

/**
 * 格式化数字
 */
function formatNumber(num) {
  if (!num) return '0';
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toString();
}

/**
 * 获取指定源的热榜数据
 */
async function fetchTrending(source) {
  switch (source) {
    case 'weibo':
      return await fetchWeibo();
    case 'zhihu':
      return await fetchZhihu();
    case 'github':
      return await fetchGithub();
    case 'baidu':
      return await fetchBaidu();
    case 'bilibili':
      return await fetchBilibili();
    default:
      return [];
  }
}

/**
 * 获取所有热榜数据
 */
async function fetchAllTrending() {
  const results = {};
  const sources = Object.keys(TRENDING_SOURCES);

  await Promise.all(
    sources.map(async (source) => {
      if (TRENDING_SOURCES[source].enabled) {
        results[source] = {
          ...TRENDING_SOURCES[source],
          items: await fetchTrending(source),
          updatedAt: new Date().toISOString(),
        };
      }
    })
  );

  return results;
}

/**
 * 格式化热榜消息
 */
function formatTrendingMessage(source, items, limit = 10) {
  const config = TRENDING_SOURCES[source];
  if (!config || !items || items.length === 0) {
    return null;
  }

  const lines = [
    `${config.emoji} <b>${config.name}</b>`,
    '',
  ];

  items.slice(0, limit).forEach((item, index) => {
    const rankEmoji = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
    lines.push(`${rankEmoji} <a href="${item.url}">${item.title}</a>${item.tag ? ` [${item.tag}]` : ''}`);
  });

  lines.push('');
  lines.push(`<i>更新于 ${new Date().toLocaleString('zh-CN')}</i>`);

  return lines.join('\n');
}

module.exports = {
  TRENDING_SOURCES,
  fetchTrending,
  fetchAllTrending,
  formatTrendingMessage,
};
