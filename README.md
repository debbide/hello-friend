# Bot Manager - 个人机器人管理面板

一个用于管理 Telegram Bot 的个人控制面板，包含实时日志、API 用量追踪、对话搜索、快捷发送和通知中心等功能。

## 功能特性

- 📊 仪表盘 - 查看机器人运行状态
- 💬 AI 对话管理 - 对话历史和 API 用量追踪
- 📝 实时日志 - 查看系统日志和错误
- 🚀 快捷发送 - 快速发送消息到 Telegram
- 🔔 通知中心 - 统一管理所有通知
- 📡 RSS 订阅管理 - RSS 源订阅和推送
- ⏰ 提醒功能 - 定时提醒管理
- ⚙️ 设置 - 配置机器人参数

## 技术栈

- **前端**: React + Vite + TypeScript + Tailwind CSS + shadcn-ui
- **后端**: Node.js + Express + Telegraf
- **容器化**: Docker + Docker Compose

## 快速开始

### 使用 Docker Compose (推荐)

```bash
# 克隆仓库
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# 使用预构建镜像启动
docker compose -f docker-compose.prod.yml up -d

# 或者本地构建启动
docker compose up -d --build
```

### 使用预构建镜像

镜像通过 GitHub Actions 自动构建并推送到 GitHub Container Registry：

```bash
# 拉取最新镜像
docker pull ghcr.io/<owner>/<repo>-frontend:latest
docker pull ghcr.io/<owner>/<repo>-backend:latest
```

### 本地开发

```bash
# 安装依赖
npm install

# 启动前端开发服务器
npm run dev

# 启动后端服务 (另一个终端)
cd backend
npm install
npm run dev
```

## 环境变量

### 后端环境变量

在 `docker-compose.yml` 或 `.env` 中配置：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `BOT_TOKEN` | Telegram Bot Token | - |
| `ADMIN_ID` | 管理员 Telegram ID | - |
| `PORT` | 服务端口 | 3001 |
| `NODE_ENV` | 运行环境 | production |
| `DATA_PATH` | 数据存储路径 | /app/data |

## Docker 部署

### 生产环境部署

使用 `docker-compose.prod.yml` 部署预构建镜像：

```bash
# 创建环境变量文件
cat > .env << EOF
BOT_TOKEN=your_bot_token
ADMIN_ID=your_admin_id
EOF

# 启动服务
docker compose -f docker-compose.prod.yml up -d
```

### 服务端口

- 前端: `http://localhost:3000`
- 后端 API: `http://localhost:3001`

### 健康检查

后端服务提供健康检查端点：

```bash
curl http://localhost:3001/health
```

## GitHub Actions CI/CD

项目配置了自动化 CI/CD 流程：

- **触发条件**: 推送到 `main` 分支、创建版本标签 (`v*`) 或 Pull Request
- **构建产物**: Docker 镜像推送到 GitHub Container Registry (ghcr.io)
- **镜像标签**: 
  - `latest` - 最新 main 分支构建
  - `v1.0.0` - 版本标签
  - `sha-xxxxxx` - 提交 SHA

### 发布新版本

```bash
# 创建并推送版本标签
git tag v1.0.0
git push origin v1.0.0
```

## 项目结构

```
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   ├── pages/              # 页面组件
│   ├── hooks/              # 自定义 Hooks
│   └── lib/                # 工具函数和 API
├── backend/                # 后端源码
│   ├── commands/           # Bot 命令处理
│   ├── index.js            # 入口文件
│   └── Dockerfile          # 后端 Dockerfile
├── .github/workflows/      # GitHub Actions
├── docker-compose.yml      # 本地开发配置
├── docker-compose.prod.yml # 生产部署配置
└── Dockerfile              # 前端 Dockerfile
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/status` | GET | Bot 状态 |
| `/api/settings` | GET/POST | 设置管理 |
| `/api/subscriptions` | GET/POST/DELETE | RSS 订阅管理 |
| `/api/rss/parse` | POST | 解析 RSS 源 |
| `/api/tools` | GET | 工具列表 |

## License

MIT
