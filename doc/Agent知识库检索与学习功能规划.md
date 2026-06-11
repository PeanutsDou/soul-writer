# Agent 知识库检索与学习功能规划

## 1. 目标

为 Soul Writer 增加一套由 Agent 使用、用户可观察和管理的本地知识库系统，使 Agent 能够：

- 检索项目文档、小说研究资料、网页研究结果和写作方法库。
- 将一次搜索或分析结果整理为结构化知识，经用户确认后长期保存。
- 在写作、续写、剧情规划和竞品分析时自动召回相关资料。
- 展示检索来源、引用片段、更新时间和学习状态，避免“记住了但无法验证”。
- 全程本地优先，可在无外部向量服务的情况下运行。

## 2. 基本原则

### 2.1 检索与学习分离

“检索”只读取已有资料，不修改知识库。“学习”会产生持久化数据，必须经过明确规则或用户确认，防止 Agent 将错误网页内容、临时推测或重复信息写入长期知识。

### 2.2 原文可追溯

每条知识都保存来源信息：本地文件路径或网页 URL、采集时间、内容时间、站点、书籍 ID、章节 ID、原文片段哈希。Agent 回答时可以指出依据，而不是只返回无来源结论。

### 2.3 时间是一等字段

榜单、市场趋势和“近期作品”具有时效性。数据模型必须区分：

- `captured_at`：采集时间。
- `published_at`：原内容发布时间。
- `period`：榜单所属日期或月份。
- `expires_at`：建议重新采集时间。

召回排序需要同时考虑相关度与新鲜度。

### 2.4 本地轻量实现

第一阶段不部署独立数据库服务。使用 SQLite 保存元数据、任务和全文索引，向量索引作为可选增强，不作为基本检索的硬依赖。

## 3. 功能范围

### 3.1 数据来源

首期支持：

- 当前写作项目中的书籍、分组、章节和大纲。
- 项目内 `server/knowledge_base` 下的 Markdown、TXT、JSON 文件。
- 内置 `novel-writing` 指南、文风参考、爽点库和剧情结构库。
- Agent 通过 Playwright 获得的起点、起点图、xsdi 搜索与研究结果。
- 用户在 UI 中手动导入的 Markdown、TXT、DOCX、PDF，后两类可在后续阶段加入。

暂不支持自动批量抓取整站、绕过登录或付费限制，也不自动把完整受版权保护正文写入知识库。

### 3.2 Agent 工具

建议提供以下底层工具：

| 工具 | 作用 |
|---|---|
| `knowledge_search` | 混合检索知识片段，支持范围、时间和来源过滤 |
| `knowledge_get` | 根据知识 ID 获取完整条目及来源 |
| `knowledge_learn` | 提交待学习内容，默认进入待确认队列 |
| `knowledge_update` | 更新已有知识，保留版本历史 |
| `knowledge_forget` | 软删除或停用知识，不直接物理删除 |
| `knowledge_sources` | 查看知识库来源、同步时间和健康状态 |

Agent 的默认流程：先 `knowledge_search`，结果不足时再进行网页研究，完成分析后调用 `knowledge_learn` 生成待确认条目。

## 4. 数据模型

建议 SQLite 表结构如下：

### `knowledge_sources`

- `id`
- `type`：project、file、web、builtin
- `uri`
- `title`
- `captured_at`
- `content_time`
- `etag_or_hash`
- `status`
- `metadata_json`

### `knowledge_documents`

- `id`
- `source_id`
- `title`
- `content`
- `summary`
- `category`
- `created_at`
- `updated_at`
- `version`
- `status`：pending、active、rejected、archived

### `knowledge_chunks`

- `id`
- `document_id`
- `chunk_index`
- `content`
- `token_count`
- `heading_path`
- `start_offset`
- `end_offset`
- `embedding`：后续可选

### `knowledge_tags`

- `knowledge_id`
- `tag`

### `knowledge_relations`

- `from_id`
- `to_id`
- `relation`：supports、contradicts、updates、derived_from、same_book

### `knowledge_jobs`

- `id`
- `type`：import、index、learn、refresh
- `status`
- `progress`
- `message`
- `created_at`
- `finished_at`

## 5. 检索方案

### 5.1 第一阶段：SQLite FTS5

使用 FTS5 建立中文全文索引。由于 SQLite 默认中文分词能力有限，索引前生成字符二元组或三元组搜索字段，同时保留原文用于展示。该方案依赖少、可打包、可解释，适合先落地。

检索得分建议由以下部分组成：

```text
final_score = 关键词相关度
            + 标题命中奖励
            + 当前项目/当前书籍奖励
            + 来源可信度奖励
            + 时间新鲜度奖励
            - 过期惩罚
```

### 5.2 第二阶段：混合向量检索

在 FTS5 基础上增加本地 embedding：

- embedding 模型作为可选组件，不阻塞基本功能。
- 向量只保存分块内容，不保存模型回答。
- 最终结果合并关键词排名和向量相似度。
- 使用轻量重排器或让当前 LLM 对少量候选进行重排。

不建议第一版直接引入独立向量数据库，会增加安装体积、进程管理和迁移成本。

### 5.3 分块策略

- Markdown 按标题层级切分，再按 600 至 1200 token 限制拆分。
- 小说章节以章节为一级单位，长章节按自然段聚合。
- 榜单按周期和表格行分块。
- 每块保留标题路径、书名、章节、时间和来源 URL。
- 相邻块保留少量重叠，但避免重复内容大量占用上下文。

## 6. 学习流程

### 6.1 网页研究学习

1. Agent 调用 Playwright 工具取得实时资料。
2. Agent 输出结构化分析，包括事实、推断、适用范围和来源。
3. `knowledge_learn` 将内容写入 `pending` 队列。
4. UI 展示新增、更新、冲突和重复项。
5. 用户确认后状态变为 `active` 并建立索引。

### 6.2 自动去重与冲突检测

- URL、书籍 ID、章节 ID 和内容哈希完全一致时直接判重。
- 标题与正文高度相似时提示合并。
- 新旧结论冲突时不覆盖旧数据，建立 `contradicts` 或 `updates` 关系。
- 榜单数据按周期保存快照，不用新榜单覆盖历史榜单。

### 6.3 可控自动学习

设置页提供三级策略：

- `关闭`：Agent 只能检索。
- `确认后学习`：默认推荐，写入待确认队列。
- `自动学习可信来源`：仅对内置资料、当前项目和白名单网站自动生效。

## 7. UI 规划

### 7.1 知识库侧边页

提供独立的“知识库”入口，包含：

- 搜索框及来源、项目、书籍、时间、标签筛选。
- 知识条目列表和内容预览。
- 来源链接、更新时间、有效期和版本记录。
- 导入文件、重新索引、刷新网页来源、停用和删除操作。
- 索引条数、磁盘占用、待处理任务和失败任务状态。

### 7.2 Agent 对话展示

在现有工具调用卡片基础上增加：

- “正在检索知识库”“找到 N 条资料”“正在整理学习条目”等状态。
- 可展开的召回列表，显示标题、来源、时间和相关度。
- 回答中的引用编号，点击可定位到知识条目或原始文档。
- 学习完成后的待确认卡片，支持接受、编辑、拒绝。

### 7.3 后台任务与 UI 隔离

导入、切分、索引、embedding 和网页刷新均在后台任务线程或独立 Python worker 中运行。UI 只订阅进度事件，不等待任务同步完成。建议事件：

- `knowledge:job-start`
- `knowledge:job-progress`
- `knowledge:job-complete`
- `knowledge:job-error`
- `knowledge:changed`

## 8. 后端架构

建议拆分为：

```text
server/knowledge/
├── repository.py       # SQLite 数据访问与迁移
├── indexer.py          # 文件解析、分块、FTS 索引
├── search.py           # 混合检索、过滤和排序
├── learner.py          # 学习、去重、冲突、版本管理
├── jobs.py             # 后台任务队列
├── sources.py          # 本地文件和网页来源适配器
└── schemas.py          # 结构化数据定义
```

Tauri 层不直接执行索引逻辑，只负责命令转发和事件广播。Python 后端应增加独立任务队列，避免长时间索引阻塞 Agent 对话和文档保存请求。

## 9. 安全与质量控制

- 网页内容视为不可信数据，不能把网页中的提示语当作系统指令。
- 学习内容必须区分原始事实和 Agent 推断。
- 密钥、模型配置、Cookie、登录态文件不得进入知识库。
- 默认不保存完整付费章节或大段受版权保护正文。
- 删除采用软删除并保留恢复期，清理操作需要二次确认。
- 每条知识记录创建模型、提示版本和来源，便于追查错误。

## 10. 分阶段实施

### 阶段一：可用的本地检索

- SQLite 表与迁移。
- Markdown/TXT/JSON 导入。
- FTS5 检索、过滤、引用展示。
- `knowledge_search`、`knowledge_get` 工具。
- 知识库基础管理 UI。

### 阶段二：受控学习

- `knowledge_learn` 待确认队列。
- 去重、版本、冲突检测。
- Agent 对话中的学习确认卡片。
- Playwright 研究结果转知识条目。

### 阶段三：后台同步与增强检索

- 文件目录监控与增量索引。
- 榜单定期刷新和过期提示。
- 可选本地 embedding 与混合检索。
- 知识关系和跨书籍对比。

### 阶段四：写作闭环

- 根据当前章节自动召回人物、设定、伏笔和文风约束。
- 写作后检测设定冲突和伏笔遗漏。
- 将用户确认的章节总结、人物变化和世界观增量写回知识库。

## 11. 第一版验收标准

- 导入 1000 个 Markdown/TXT 文件后 UI 仍可正常操作。
- 后台索引过程中对话、编辑和保存不冻结。
- 搜索结果包含来源、片段、更新时间和稳定 ID。
- Agent 能引用检索结果，且不会虚构未返回的资料。
- 重复导入不会产生大量重复条目。
- 知识学习默认需要确认，拒绝后不会被召回。
- 数据库损坏或单个文件解析失败时不会影响写作项目数据。

## 12. 建议的首期技术选择

- 存储：SQLite，与写作项目数据分库。
- 全文检索：SQLite FTS5 + 中文 n-gram 辅助字段。
- 后台任务：Python `queue.Queue` + 单独 worker 线程，后续可扩展为多进程。
- 文档解析：首期原生 Markdown/TXT/JSON，后续按需增加 DOCX/PDF。
- 向量检索：首期不作为硬依赖。
- UI：沿用现有 React、Zustand、Tauri event 和可展开工具卡片模式。

该方案优先保证可追溯、不卡 UI、容易打包和可逐步升级，避免第一版就引入体积较大的向量数据库或复杂服务编排。
