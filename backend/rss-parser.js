/**
 * RSS 解析模块 - 三层策略
 */
const Parser = require('rss-parser');
const { fetchWithPuppeteer } = require('./puppeteer.service');

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
});

function formatFeedResult(feed) {
  return {
    success: true,
    title: feed.title,
    description: feed.description || '',
    link: feed.link || '',
    items: (feed.items || []).map((item, index) => ({
      id: item.guid || item.link || `item-${index}`,
      title: item.title || 'Untitled',
      link: item.link || '',
      description: item.contentSnippet || item.content?.substring(0, 300) || '',
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      author: item.creator || item.author || undefined,
      categories: item.categories || [],
      content: item.content || item.contentSnippet || '',
    })),
  };
}

function extractXmlContent(content) {
  if (content.trim().startsWith('<?xml')) {
    return content.trim();
  }

  const rssMatch = content.match(/<rss[\s\S]*<\/rss>/i);
  if (rssMatch) {
    return '<?xml version="1.0" encoding="UTF-8"?>' + rssMatch[0];
  }

  const feedMatch = content.match(/<feed[\s\S]*<\/feed>/i);
  if (feedMatch) {
    return '<?xml version="1.0" encoding="UTF-8"?>' + feedMatch[0];
  }

  const preMatch = content.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch) {
    return preMatch[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  return null;
}

async function parseRssFeedWithPuppeteer(url) {
  try {
    const result = await fetchWithPuppeteer(url);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const xmlContent = extractXmlContent(result.content);
    if (!xmlContent) {
      return { success: false, error: '无法从页面中提取 XML 内容' };
    }

    const feed = await parser.parseString(xmlContent);
    return formatFeedResult(feed);
  } catch (error) {
    return { success: false, error: `Puppeteer 解析失败: ${error.message}` };
  }
}

async function parseRssFeed(url, keywords) {
  let result;

  // 1. 首先尝试直接解析
  try {
    console.log(`📋 尝试直接解析: ${url}`);
    const feed = await parser.parseURL(url);
    console.log(`✅ 直接解析成功: ${feed.title}`);
    result = formatFeedResult(feed);
  } catch (error) {
    console.log(`📋 直接解析失败 [${url}]: ${error.message}`);

    // 2. 如果是 403 错误，使用 Puppeteer
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.log(`🔄 尝试使用 Puppeteer: ${url}`);
      result = await parseRssFeedWithPuppeteer(url);
    } else {
      // 3. 尝试手动 fetch 并清理 BOM
      try {
        console.log(`🔄 尝试手动 fetch 并清理: ${url}`);
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          },
        });

        if (!response.ok) {
          if (response.status === 403) {
            result = await parseRssFeedWithPuppeteer(url);
          } else {
            result = { success: false, error: `HTTP ${response.status}` };
          }
        } else {
          let text = await response.text();
          text = text.replace(/^\uFEFF/, '').replace(/^\s+/, '');

          if (!text.startsWith('<?xml') && !text.startsWith('<rss') && !text.startsWith('<feed')) {
            const xmlStart = text.indexOf('<?xml');
            const rssStart = text.indexOf('<rss');
            const feedStart = text.indexOf('<feed');
            const startPos = Math.min(
              xmlStart >= 0 ? xmlStart : Infinity,
              rssStart >= 0 ? rssStart : Infinity,
              feedStart >= 0 ? feedStart : Infinity
            );
            if (startPos !== Infinity) {
              text = text.substring(startPos);
            }
          }

          const feed = await parser.parseString(text);
          result = formatFeedResult(feed);
        }
      } catch (fetchError) {
        console.error(`❌ 手动 fetch 也失败: ${fetchError.message}`);
        result = await parseRssFeedWithPuppeteer(url);
      }
    }
  }

  if (!result.success) {
    return result;
  }

  // 应用关键词过滤
  let items = result.items || [];
  if (keywords) {
    const { whitelist, blacklist } = keywords;
    if (whitelist && whitelist.length > 0) {
      items = items.filter(item => {
        const text = `${item.title} ${item.description} ${item.content}`.toLowerCase();
        return whitelist.some(kw => text.includes(kw.toLowerCase()));
      });
    }
    if (blacklist && blacklist.length > 0) {
      items = items.filter(item => {
        const text = `${item.title} ${item.description} ${item.content}`.toLowerCase();
        return !blacklist.some(kw => text.includes(kw.toLowerCase()));
      });
    }
  }

  return { ...result, items };
}

module.exports = { parseRssFeed };
