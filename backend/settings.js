/**
 * 设置管理
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DATA_PATH || './data';
const SETTINGS_FILE = path.join(DATA_PATH, 'config.json');

// 默认设置
const DEFAULT_SETTINGS = {
  botToken: '',
  adminId: '',
  groupId: '',
  openaiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-3.5-turbo',
  tgApiBase: '', // 可选的 Telegram API 代理
  webPort: 3001,
  logLevel: 'info',
  autoStart: true,
  notifications: true,
  rss: {
    checkInterval: 30, // 默认检查间隔(分钟)
  },
  features: {
    ai: true,
    rss: true,
    tools: true,
    reminders: true,
  },
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, { recursive: true });
  }
}

function loadSettings() {
  ensureDataDir();
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('加载设置失败:', error.message);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  ensureDataDir();
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('保存设置失败:', error.message);
  }
}

function getDataPath() {
  return DATA_PATH;
}

module.exports = {
  loadSettings,
  saveSettings,
  getDataPath,
  DEFAULT_SETTINGS,
};
