# 软考练题系统

面向「信息系统项目管理师」的刷题套件，包含静态前端、Node/Express API 与 Python 题库导入脚本，可对接 Supabase（Postgres + Storage），也可走离线本地题库。

## 架构与目录
- `frontend/`：纯前端单页（`index.html`、`style.css`、`app.js`），题库浏览、答题、错题模式、本地进度缓存、上传入口。
- `apps/server/`：Express API，托管前端静态文件并提供章节/题目查询、Markdown 上传入库接口。
- `apps/importer/`：Python 导入脚本（md/json ↔ 数据库），内置 CLI 多模式导入。
- `md/`：示例题库 Markdown（命名形如 `第05章-信息系统工程.md`）。
- `.env.example`：Supabase 连接模板（复制为 `.env`）。

技术栈：前端原生 JS + localStorage 缓存；后端 Express 4、`@supabase/supabase-js`、`multer`；导入脚本使用 `supabase-py`、`beautifulsoup4`、`python-dotenv`。

## 环境要求
- Node.js ≥ 18（运行后端）
- Python ≥ 3.9（运行导入脚本）
- Supabase 项目：开启 Postgres 与 Storage，需 Service Role 密钥
- 数据表/存储（需预建并加唯一约束）：
  - `chapters(id, code unique, title, source_file text)`
  - `questions(id, chapter_id fk, number, question_text, answer, explanation, rich_content jsonb, unique(chapter_id, number))`
  - `question_options(id, question_id fk, label, content, unique(question_id, label))`
  - Storage bucket: `question-bank`（存原始 Markdown）

## 快速运行（本地联调）
1) 配置环境变量  
复制 `.env.example` → `.env`，填入：
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
# 可选
API_PORT=3000
```

2) 启动后端并托管前端  
```
cd apps/server
npm install
npm run dev   # 或 npm start
```
服务默认 http://localhost:3000 ，静态托管 `frontend/`，API 前缀 `/api`。

3) 访问前端  
- 推荐直接打开 http://localhost:3000/ ，使用同域 API。  
- 若单独打开 `frontend/index.html`，需确保 `API_BASE` 指向后端地址（默认为 `/api`，可在 HTML 中覆写）。

## API 速览（apps/server）
- `GET /api/chapters`：章节列表 + 题量。
- `GET /api/questions?chapter=ch05`：指定章节题目。
- `POST /api/upload/markdown`：上传 `.md`，解析 → Storage 备份 → 幂等 upsert。
- `GET /api/health`：健康检查。

### 上传/解析流程
1. 通过 `multer` 接收 `.md`（10MB 内存存储）。  
2. 解析 Markdown（收紧版题号/选项/答案正则，移除图片）。  
3. 上传原始文件到 Storage `question-bank/markdown/<timestamp>-<filename>`。  
4. Upsert `chapters` → `questions` → `question_options`（分批写入）。

## 题库导入脚本（apps/importer）
- 依赖：`pip install supabase python-dotenv beautifulsoup4`。
- 推荐从 `KaiFA/` 目录运行：`python -m apps.importer.cli`。
- 支持模式：
  1. MD→JSON（仅转换，输出到 `json_exports/`）
  2. JSON→DB（从 JSON 导入数据库）
  3. MD→JSON→DB（完整流程）
  4. MD→DB（直接导入，最快）
- 关键特性：解析后会按题号去重（保留最后一次出现），避免同批次 upsert 触发唯一键冲突。

## Markdown 题库格式
- 文件名：`第05章-信息系统工程.md` → `code=ch05`、`title=第05章-信息系统工程`。
- 题目块：
```
1. 以下说法正确的是？
A. 选项A
B. 选项B
C. 选项C
D. 选项D
【答案】C
【解析】……
```
- 要求：
  - 题号必须是 `1.` / `23.`；选项前缀 `A.` `B.` 等。
  - 答案是字母串；图片会被剔除，表格/图片信息会写入 `rich_content`（Python 版解析）。

## 前端功能要点（frontend/app.js）
- 章节导航、进度条、答题统计；错题模式（按已错题过滤重新练习）。
- 本地缓存：按章节保存进度到 `localStorage`，刷新不丢进度；“刷新题库”会清理缓存并重载。
- 上传弹窗：调用 `/api/upload/markdown`，成功后自动刷新题库。
- 响应式侧边栏、移动端遮罩；纯原生 JS/DOM，无额外构建步骤。

## 开发与部署提示
- Service Role 密钥只应存在后端/导入脚本环境，前端若直连请改用 anon key。
- CORS 已启用；跨域部署时请同步调整前端 `API_BASE`。
- 上传大小上限 10MB，可在 `apps/server/routes/upload.route.js` 调整。
- Supabase Storage 上传失败不会阻断入库，但会在日志/响应中提示。

## 待办建议
- 补充自动化测试（解析正确性、批量 upsert 幂等性）。
- 增加示例 JSON 输出，便于回归与格式校验。
