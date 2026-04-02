# ArXiv4Research

一个静态 Web 项目：每日抓取 arXiv，按领域桶（含 Biology 优先）筛选候选论文，先做全局相关性排序，再按 **domain 保底 + 全局补齐** 生成最终 Top-K 日报，调用可配置 AI（DeepSeek/OpenAI-compatible）分析，并仅保留最近 7 天数据供页面切换查看。

补充文档：

- 安全策略：[`.github/SECURITY.md`](.github/SECURITY.md)
- 首次公开发布检查清单：[`docs/GitHub_Public_Release_Checklist.md`](docs/GitHub_Public_Release_Checklist.md)

当前推荐的使用形态为 **混合模式**：

- **自动日报层**：GitHub Actions 每天自动抓取、排序并生成基础 AI 日报
- **本地增强层**：网页端的 personalized spark / follow-up 由用户在浏览器中输入自己的 API 后按需触发

也就是说，打开网页时你已经能看到自动日报；只有当你想更个性化地深挖某篇论文时，才会使用浏览器本地保存的 API。

## 目录

- `app/`：抓取、排序、AI 分析、存储流水线
- `app/sniffer.py`：规则化 Code Sniffer（GitHub/HF/Colab）
- `app/followup.py`：单篇论文 follow-up 问答 CLI
- `web/`：静态前端页面
- `data/`：每日产出的 JSON 数据
- `build/`：本地构建出的部署产物（已忽略，不进 Git）
- `config/`：配置文件
- `.github/workflows/`：定时任务

## 快速开始

1. 安装依赖：
   `pip install -r requirements.txt`

2. 复制配置：
   `cp config/config.example.yaml config/config.yaml`

3. 设置环境变量（Chat 与 Embedding 分离）：
    - Chat（论文分析，默认 DeepSeek）：
      - `OPENAI_API_KEY`
      - `OPENAI_BASE_URL`（示例：`https://api.deepseek.com/v1`）
    - Embedding（排序，默认阿里百炼 DashScope）：
      - `EMBEDDING_API_KEY`（建议直接使用你的 `DASHSCOPE_API_KEY` 值）
      - `EMBEDDING_BASE_URL`（示例：`https://dashscope.aliyuncs.com/compatible-mode/v1`）
    - Rerank（可选，若启用 `embedding_plus_qwen3_rerank`）：
      - `RERANK_API_KEY`（可不填，默认回退到 `EMBEDDING_API_KEY` / `DASHSCOPE_API_KEY`）
      - `RERANK_BASE_URL`（默认：`https://dashscope.aliyuncs.com/compatible-api/v1/reranks`）

4. 运行流水线：
   `python scripts/run_pipeline.py`

5. 启动静态页面（示例）：
   `python -m http.server 8000`
   然后访问 `http://localhost:8000/web/`

6. 如需本地模拟 GitHub Pages 成品站点：
   `python scripts/build_site.py --source-data data --output-dir build/site`
   然后运行：
   `python -m http.server 8000 --directory build/site`
   再访问 `http://localhost:8000/`

## 新增能力

- Biology × CS 交叉领域桶（默认高优先级，弱化纯 biology）
- Idea Spark + 对用户帮助字段（`help_to_user`）
- Code Sniffer（代码链接嗅探）
- 黑色简约风主页面
- 前端论文卡片支持 personalized spark 与 follow-up 提问（使用用户本地 API 设置）

## 前端本地增强设置

网页右上角“本地增强设置”支持配置：

- OpenAI-compatible `Base URL`
- `API Key`
- `Model`
- `Research Context`
- 本地保存方式：`localStorage` / `sessionStorage`

这些设置：

- **不会写入仓库**
- **不会出现在 GitHub Pages 公共源码里**
- 仅用于浏览器本地的 personalized spark / follow-up 能力

## 关键能力映射

- 每日 Top-K：`project.top_k`
- 最终选稿：先全局 ranking，再按 domain 保底 + 全局补齐
- 召回排序：`relevance.embedding_model` + embedding API
- 精排模式：`rerank.mode = embedding_only | embedding_plus_qwen3_rerank`
- 每篇 AI 分析：`analysis.model` + Chat API（可用 DeepSeek）
- 最近一周留存：`project.keep_days = 7`
- 领域桶配置：`retrieval.domains`
- 排序策略：默认 embedding；可升级为 `embedding + qwen3-rerank`

## 推荐配置（你当前场景）

- `analysis.model`: `deepseek-chat`
- `relevance.embedding_model`: `text-embedding-v4`（阿里百炼）
- 环境变量示例：

```bash
export OPENAI_API_KEY='你的DeepSeekKey'
export OPENAI_BASE_URL='https://api.deepseek.com/v1'

export DASHSCOPE_API_KEY='你的百炼Key'
export EMBEDDING_API_KEY="$DASHSCOPE_API_KEY"
export EMBEDDING_BASE_URL='https://dashscope.aliyuncs.com/compatible-mode/v1'
export RERANK_API_KEY="$DASHSCOPE_API_KEY"
export RERANK_BASE_URL='https://dashscope.aliyuncs.com/compatible-api/v1/reranks'
export EMBEDDING_BATCH_SIZE='10'
```

## Follow-up CLI（可选）

在命令行对某日某篇论文继续提问：

`python scripts/followup_cli.py --date 2026-04-02 --paper-id 2504.00001 --question "这篇对biology实验设计有什么启发？"`

## 定时自动化

已提供 `.github/workflows/daily.yml`：
- 每日 **06:00 Asia/Shanghai** 自动运行
- 支持手动触发
- 在 Actions 中先生成临时目录 `build/generated-data/`
- 再打包为静态站点目录 `build/site/`，其中包含 `build/site/data/`
- 最后将整个成品站点 **强制发布到 `gh-pages` 分支**
- `main` 只保留源码，不再每天自动提交生成数据

## GitHub Pages 部署说明

当前采用的是：

- `main`：源码分支
- `gh-pages`：自动生成的网页与日报数据

这意味着：

- `main` 不会因为每天产出的 JSON/网页而持续膨胀
- 自动生成的网页与 `data/` 都会进入 `gh-pages`
- GitHub Pages 直接从 `gh-pages` 提供静态站点

工作流中的数据流转为：

1. `scripts/run_pipeline.py --data-dir build/generated-data`
2. `scripts/build_site.py --source-data build/generated-data --output-dir build/site`
3. 将 `build/site/` 整体推送到 `gh-pages`

也就是说，**GitHub Actions 每天生成的数据不会回写到 `main`**。

你需要在 GitHub 仓库设置中确认：

- **Pages Source = Deploy from a branch**
- **Branch = `gh-pages`**
- **Folder = `/ (root)`**

推荐同时配置这些 Repository Secrets：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_BASE_URL`
- `RERANK_API_KEY`（可选）
- `RERANK_BASE_URL`（可选）
- `DASHSCOPE_API_KEY`（可选）
- `PAGES_DEPLOY_TOKEN`（可选但推荐；用于更稳妥地推送 `gh-pages`）

其中 `PAGES_DEPLOY_TOKEN` 建议使用一个仅用于当前仓库的 Personal Access Token（至少具备仓库写入能力）。如果不配置，workflow 会回退到默认的 `GITHUB_TOKEN`。
