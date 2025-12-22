/**
 * 数据存储模块 - 统一管理所有持久化数据
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DATA_PATH || './data';

// 确保数据目录存在
function ensureDataDir() {
    if (!fs.existsSync(DATA_PATH)) {
        fs.mkdirSync(DATA_PATH, { recursive: true });
    }
}

// 通用读取函数
function loadData(filename, defaultValue = []) {
    ensureDataDir();
    const filePath = path.join(DATA_PATH, filename);
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (error) {
        console.error(`加载 ${filename} 失败:`, error.message);
    }
    return defaultValue;
}

// 通用保存函数
function saveData(filename, data) {
    ensureDataDir();
    const filePath = path.join(DATA_PATH, filename);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`保存 ${filename} 失败:`, error.message);
    }
}

// ==================== 日志存储 ====================

const MAX_LOGS = 1000;
let logsCache = null;

function getLogs() {
    if (logsCache === null) {
        logsCache = loadData('logs.json', []);
    }
    return logsCache;
}

function addLog(level, message, source = 'system') {
    const logs = getLogs();
    logs.push({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        level,
        message,
        source,
        timestamp: new Date().toISOString(),
    });
    // 保留最近 MAX_LOGS 条
    while (logs.length > MAX_LOGS) {
        logs.shift();
    }
    logsCache = logs;
    saveData('logs.json', logs);
}

function clearLogs() {
    logsCache = [];
    saveData('logs.json', []);
}

// ==================== 笔记存储 ====================

function getNotes() {
    return loadData('notes.json', []);
}

function saveNotes(notes) {
    saveData('notes.json', notes);
}

function addNote(content) {
    const notes = getNotes();
    const note = {
        id: `note_${Date.now()}`,
        content,
        createdAt: new Date().toISOString(),
        completed: false,
    };
    notes.unshift(note);
    saveNotes(notes);
    return note;
}

function updateNote(id, updates) {
    const notes = getNotes();
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return null;
    notes[index] = { ...notes[index], ...updates };
    saveNotes(notes);
    return notes[index];
}

function deleteNote(id) {
    const notes = getNotes();
    const filtered = notes.filter(n => n.id !== id);
    if (filtered.length === notes.length) return false;
    saveNotes(filtered);
    return true;
}

// ==================== 提醒存储 ====================

function getReminders() {
    return loadData('reminders.json', []);
}

function saveReminders(reminders) {
    saveData('reminders.json', reminders);
}

function addReminder(content, triggerAt, repeat = 'once') {
    const reminders = getReminders();
    const reminder = {
        id: `rem_${Date.now()}`,
        content,
        triggerAt,
        repeat,
        status: 'pending',
        createdAt: new Date().toISOString(),
    };
    reminders.unshift(reminder);
    saveReminders(reminders);
    return reminder;
}

function updateReminder(id, updates) {
    const reminders = getReminders();
    const index = reminders.findIndex(r => r.id === id);
    if (index === -1) return null;
    reminders[index] = { ...reminders[index], ...updates };
    saveReminders(reminders);
    return reminders[index];
}

function deleteReminder(id) {
    const reminders = getReminders();
    const filtered = reminders.filter(r => r.id !== id);
    if (filtered.length === reminders.length) return false;
    saveReminders(filtered);
    return true;
}

// ==================== 统计存储 ====================

function getStats() {
    return loadData('stats.json', {
        totalCommands: 0,
        commandCounts: {},
        dailyStats: {},
        aiTokensUsed: 0,
    });
}

function saveStats(stats) {
    saveData('stats.json', stats);
}

function incrementCommand(command) {
    const stats = getStats();
    stats.totalCommands++;
    stats.commandCounts[command] = (stats.commandCounts[command] || 0) + 1;

    // 按日统计
    const today = new Date().toISOString().split('T')[0];
    if (!stats.dailyStats[today]) {
        stats.dailyStats[today] = { total: 0, commands: {} };
    }
    stats.dailyStats[today].total++;
    stats.dailyStats[today].commands[command] = (stats.dailyStats[today].commands[command] || 0) + 1;

    saveStats(stats);
    return stats;
}

function incrementAiTokens(tokens) {
    const stats = getStats();
    stats.aiTokensUsed += tokens;
    saveStats(stats);
}

// ==================== 工具配置存储 ====================

const defaultTools = [
    { id: "tr", command: "/tr", label: "翻译", description: "快速翻译文本到目标语言", emoji: "🌐", enabled: true, usage: 0 },
    { id: "short", command: "/short", label: "短链接", description: "生成短链接，方便分享", emoji: "🔗", enabled: true, usage: 0 },
    { id: "qr", command: "/qr", label: "二维码", description: "生成二维码图片", emoji: "📱", enabled: true, usage: 0 },
    { id: "weather", command: "/weather", label: "天气查询", description: "查询全球城市天气", emoji: "🌤️", enabled: true, usage: 0 },
    { id: "rate", command: "/rate", label: "汇率换算", description: "实时汇率换算", emoji: "💰", enabled: true, usage: 0 },
    { id: "ip", command: "/ip", label: "IP 查询", description: "查询 IP 归属地", emoji: "🌍", enabled: true, usage: 0 },
];

function getTools() {
    const saved = loadData('tools.json', null);
    if (!saved) {
        saveData('tools.json', defaultTools);
        return defaultTools;
    }
    return saved;
}

function updateTool(id, updates) {
    const tools = getTools();
    const index = tools.findIndex(t => t.id === id);
    if (index === -1) return null;
    tools[index] = { ...tools[index], ...updates };
    saveData('tools.json', tools);
    return tools[index];
}

function incrementToolUsage(id) {
    const tools = getTools();
    const tool = tools.find(t => t.id === id);
    if (tool) {
        tool.usage++;
        saveData('tools.json', tools);
    }
}

// ==================== 数据备份 ====================

function createBackup() {
    ensureDataDir();
    const backupDir = path.join(DATA_PATH, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup_${timestamp}.json`);

    const backup = {
        timestamp: new Date().toISOString(),
        notes: getNotes(),
        reminders: getReminders(),
        stats: getStats(),
        tools: getTools(),
        logs: getLogs(),
    };

    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    return backupFile;
}

function getDataPath() {
    return DATA_PATH;
}

module.exports = {
    // 日志
    getLogs,
    addLog,
    clearLogs,
    // 笔记
    getNotes,
    addNote,
    updateNote,
    deleteNote,
    // 提醒
    getReminders,
    addReminder,
    updateReminder,
    deleteReminder,
    // 统计
    getStats,
    incrementCommand,
    incrementAiTokens,
    // 工具
    getTools,
    updateTool,
    incrementToolUsage,
    // 备份
    createBackup,
    getDataPath,
};
