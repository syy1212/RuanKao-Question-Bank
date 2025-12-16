/**
 * 题库练习系统 - 后端 API 服务入口
 * 
 * 职责：
 * - Express 初始化
 * - 中间件注册
 * - 路由挂载
 * - 静态文件托管
 * 
 * ⚠️ 不应包含任何业务逻辑
 */
require('dotenv').config({ path: '../../.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');

// 路由
const chaptersRoute = require('./routes/chapters.route');
const questionsRoute = require('./routes/questions.route');
const uploadRoute = require('./routes/upload.route');

const app = express();
const PORT = process.env.API_PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// 静态文件服务 - 托管 frontend 目录
app.use(express.static(path.join(__dirname, '../../frontend')));

// API 路由
app.use('/api/chapters', chaptersRoute);
app.use('/api/questions', questionsRoute);
app.use('/api/upload', uploadRoute);

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// 启动服务
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║  🚀 题库 API 服务已启动                    ║
║  📍 地址: http://localhost:${PORT}          ║
║  📚 章节: GET /api/chapters                ║
║  📝 题目: GET /api/questions?chapter=ch05  ║
╚════════════════════════════════════════════╝
  `);
});
