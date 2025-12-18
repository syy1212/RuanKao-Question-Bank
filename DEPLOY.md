# EdgeOne Pages 部署指南

## 项目结构

```
KaiFA/
├── frontend/               # 静态前端文件
│   ├── index.html
│   ├── app.js
│   └── style.css
├── functions/              # EdgeOne 边缘函数
│   ├── api/
│   │   ├── chapters.js     # GET /api/chapters
│   │   ├── questions.js    # GET /api/questions?chapter=xxx
│   │   ├── health.js       # GET /api/health
│   │   └── upload/
│   │       └── markdown.js # POST /api/upload/markdown
│   └── _shared/            # 共享模块
│       ├── supabase.js
│       ├── question.service.js
│       ├── markdown.service.js
│       └── text.js
├── pages.config.json       # EdgeOne Pages 配置
└── .env.example            # 环境变量模板
```

## 部署步骤

### 1. 登录腾讯云控制台

访问 [EdgeOne Pages 控制台](https://console.cloud.tencent.com/edgeone/pages)

### 2. 创建项目

1. 点击 **创建项目**
2. 选择 **连接 Git 仓库**
3. 授权并绑定 GitHub 账户
4. 选择你的仓库

### 3. 配置构建设置

| 配置项 | 值 |
|--------|-----|
| 项目名称 | `ruankao-practice` |
| 根目录 | `KaiFA` |
| 输出目录 | `frontend` |
| 构建命令 | 留空（无需构建） |
| 安装命令 | 留空 |

### 4. 配置环境变量

在项目设置中添加以下环境变量：

| 变量名 | 说明 |
|--------|------|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | Supabase Service Role 密钥 |

⚠️ **重要**：Service Key 是敏感信息，请确保设置为"加密"类型。

### 5. 部署

点击 **开始部署**，等待部署完成。

## API 端点

部署完成后，以下 API 将可用：

- `GET /api/chapters` - 获取章节列表
- `GET /api/questions?chapter=ch05` - 获取指定章节题目
- `GET /api/health` - 健康检查
- `POST /api/upload/markdown` - 上传 Markdown 题库

## 本地开发

### 使用原 Express 后端（推荐）

```bash
cd apps/server
npm install
npm run dev
```

### 使用 Wrangler 本地测试边缘函数

```bash
npm install -g wrangler
wrangler pages dev frontend --binding SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx
```

## 故障排查

### 函数未生效
- 检查函数文件是否在 `functions/` 目录下
- 确认导出了 `onRequest` 函数
- 查看部署日志中的错误信息

### 数据库连接失败
- 确认环境变量已正确配置
- 检查 Supabase 项目是否正常运行
- 验证 Service Key 是否有效

### CORS 错误
- 边缘函数已内置 CORS 头，如有问题请检查浏览器控制台详细错误
