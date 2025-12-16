# 题库系统 · 文件上传与导入功能

**需求文档（PRD）**

---

## 1. 背景与目标

### 1.1 背景

当前题库系统已具备以下能力：

* 支持题目、选项、章节的结构化存储（Supabase / Postgres）
* 支持通过本地脚本将 Markdown 题库文件解析并导入数据库
* 前端已具备题目展示、答题、统计等核心功能

但现阶段存在以下问题：

* 题库更新依赖**本地脚本 + 手动执行**
* 前端无法直接触发题库更新
* 文件未进行统一存储与版本管理
* 不利于后续多端 / 多人维护

---

### 1.2 目标

新增「**题库文件上传与导入功能**」，实现：

> **通过前端页面上传 Markdown 题库文件 →
> 存储至 Supabase Storage →
> 后端解析并安全导入数据库 →
> 前端获得导入结果反馈**

---

### 1.3 非目标（本期不做）

* ❌ 在线编辑题库
* ❌ 前端解析 Markdown
* ❌ 多文件批量上传
* ❌ 非 Markdown 格式支持（如 Word / PDF）

---

---

## 3. 功能需求

---

### 3.1 前端功能需求

#### 3.1.1 上传入口

* 位置：题库页面顶部工具栏
* 文案：`📤 上传题库`
* 行为：点击后弹出上传弹窗（Modal）

---

#### 3.1.2 上传弹窗

**包含内容：**

* 文件选择框

  * 限制类型：`.md`
  * 单文件
* 操作按钮

  * `上传并导入`
  * `取消`

---

#### 3.1.3 上传交互流程

1. 用户选择 Markdown 文件
2. 点击「上传并导入」
3. 前端调用后端上传接口
4. 显示导入结果提示

---

#### 3.1.4 导入结果反馈

上传完成后，前端展示以下信息：

* 章节代码
* 解析题目数
* 实际入库题目数
* 重复题号提示（如有）

示例：

```text
导入完成
章节：ch05
解析题数：233
入库题数：228
发现重复题号：3（已以最后一次为准）
```

---

### 3.2 后端功能需求

---

#### 3.2.1 文件接收与校验

* 接收 `multipart/form-data`
* 校验：

  * 文件存在
  * 文件后缀为 `.md`
  * 文件大小 ≤ Storage 限制

---

#### 3.2.2 文件存储（Supabase Storage）

* Bucket：`question-bank`
* 存储路径规则：

```text
markdown/{timestamp}-{original_filename}
```

* 存储内容：

  * 原始 Markdown 文件
  * 作为题库导入的唯一来源文件

---

#### 3.2.3 文件解析与导入

* 从 Storage 读取文件内容
* 调用统一的 Markdown 解析模块
* 解析出：

  * 章节信息
  * 题目列表
  * 选项列表
* 执行数据库导入：

  * `chapters`：按 `code` upsert
  * `questions`：按 `(chapter_id, number)` upsert
  * `question_options`：按 `(question_id, label)` upsert
* 支持：

  * 重复题号自动去重（以最后一次为准）
  * 幂等导入（多次导入不产生重复数据）

---

#### 3.2.4 数据关联

* `chapters.source_file` 记录 Storage 文件路径
* 用于：

  * 追溯数据来源
  * 支持后续重新导入

---

### 3.3 接口设计

---

#### 3.3.1 上传接口

**接口地址**

```
POST /api/upload/markdown
```

**请求类型**

```
multipart/form-data
```

**参数**

| 参数名  | 类型   | 说明          |
| ---- | ---- | ----------- |
| file | File | Markdown 文件 |

---

**成功响应示例**

```json
{
  "success": true,
  "chapter": "ch05",
  "parsed": 233,
  "imported": 228,
  "duplicates": { "3": 6 },
  "storagePath": "markdown/1734252230000-第05章.md"
}
```

---

**失败响应示例**

```json
{
  "success": false,
  "error": "Invalid file type"
}
```

---

## 4. 数据库影响

---

### 4.1 表结构调整

#### chapters 表新增字段

```sql
alter table chapters
add column source_file text;
```

---

### 4.2 现有约束（保持）

* `chapters.code` 唯一
* `questions (chapter_id, number)` 唯一
* `question_options (question_id, label)` 唯一

---

## 5. 非功能性需求

---

### 5.1 安全

* 文件上传只允许通过后端
* 使用 Supabase `service_role_key`
* 前端不可直接写 Storage / DB

---

### 5.2 稳定性

* 批量导入需分批处理
* 出现异常时整体失败并返回错误
* 不允许部分成功但无提示

---

### 5.3 可维护性

* Markdown 解析逻辑与 HTTP 接口解耦
* 导入逻辑可被 CLI / API 复用

---

## 6. 未来扩展（不在本期）

* 上传图片并关联题目（题目配图）
* 导入历史记录与回滚
* 多版本题库对比
* 在线题库管理后台

---

## 7. 验收标准（Acceptance Criteria）

* ✅ 前端可选择并上传 `.md` 文件
* ✅ 文件成功存储到 Supabase Storage 指定 bucket
* ✅ 数据正确写入数据库（无重复）
* ✅ 重复题号有明确提示
* ✅ 多次导入同一文件结果一致
* ✅ 前端获得明确成功 / 失败反馈

---

## 8. 附录

* Supabase Storage 用于**文件**
* Postgres 用于**结构化数据**
* 后端作为唯一写入入口

