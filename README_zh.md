# ArXiv4Research

[![Daily Pipeline](https://github.com/zhaoxixixi/ArXiv4Research/actions/workflows/daily.yml/badge.svg)](https://github.com/zhaoxixixi/ArXiv4Research/actions/workflows/daily.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.txt)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org/)

[English](README.md) | 中文

*搭建属于你自己的领域专属 arXiv 每日摘要 —— 定义研究方向，流水线自动发现、排序、总结、发布论文。*

<p align="center">
  <img src="docs/screenshots/main-page.svg" alt="ArXiv4Research 主页面" width="80%" />
</p>

<p align="center">
  <strong><a href="https://craft.hengrao.top/ArXiv4Research/">在线演示</a></strong> —— 由本项目的 GitHub Actions 工作流部署的生产实例，每日自动更新。
</p>

## 概览

ArXiv4Research 将 arXiv 变成你的个人化每日研究动态。你只需定义关注的领域（生物学、AI4Science、系统安全——随你定），配置几项 API 密钥，剩下的交给流水线：

1. **发现** arXiv 官方分类页面上最新公告的论文
2. **过滤和排序** 用 embedding 向量相似度 + 可选重排序，筛选与你研究最相关的论文
3. **生成双语 AI 摘要** —— TL;DR、研究动机、方法、结果、研究灵感火花
4. **发布** 静态网站到 GitHub Pages，每天定时自动更新

网站公开部分为只读。个性化功能（自定义 Spark 灵感、追问 Q&A）完全在访客浏览器中运行，使用访客自己的 API 密钥——数据绝不回传服务器。

前端采用全响应式设计——桌面端、平板、手机端体验一致流畅，无需缩放或横向滚动。

> [!IMPORTANT]
> 本项目设计为 **fork 后自由定制**。默认配置反映了一位研究者的兴趣（生物学 x AI）。要搭建你自己的摘要站点，只需编辑一个 YAML 文件并设置 GitHub Secrets。

## 快速开始（本地试用）

```bash
# 克隆并安装
git clone https://github.com/zhaoxixixi/ArXiv4Research.git
cd ArXiv4Research
pip install -r requirements.txt
cp config/config.example.yaml config/config.yaml

# 设置 API 密钥
export OPENAI_API_KEY="你的对话模型密钥"
export OPENAI_BASE_URL="https://api.deepseek.com/v1"
export EMBEDDING_API_KEY="你的嵌入模型密钥"
export EMBEDDING_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# 运行一次
python scripts/run_pipeline.py

# 预览站点
python -m http.server 8000
# 浏览器打开 http://localhost:8000/web/
```

流水线将报告写入 `data/daily/` 并生成 `data/index.json`。`web/` 目录下的前端直接读取这些 JSON 文件——无需后端服务器。

## 定制你的专属站点

整个流水线通过 `config/config.yaml` 配置。要搭建属于**你自己**研究领域的摘要站点，只需改三样东西：

### 1. 定义你的领域

每个领域包含 arXiv 分类号、过滤关键词和优先级权重（权重影响每日 paper 选取配额）：

```yaml
retrieval:
  domains:
    - name: biology
      priority: 100          # 数值越高，每日配额越多
      filter_mode: hard      # "hard" = 所有关键词都必须匹配; "soft" = 任意关键词匹配即可
      categories:            # arXiv 分类号
        - q-bio.GN
        - q-bio.QM
        - physics.bio-ph
      keywords:              # 在标题和摘要中搜索的关键词
        - single-cell
        - gene regulatory
        - biological network
      cross_keywords:        # 交叉领域加分关键词（用于发现该领域中的方法论论文）
        - machine learning
        - deep learning

    - name: 你的领域名称
      priority: 80
      filter_mode: soft
      categories:
        - cs.AI
        - cs.LG
      keywords:
        - 你的话题
        - 另一个话题
```

领域数量不限。完整注释示例见 `config/config.example.yaml`（含 7 个领域）。

### 2. 撰写你的研究背景

这是用于 embedding 排序的自然语言描述。写得越具体，排序效果越好：

```yaml
relevance:
  research_context: >
    我研究生物系统的计算方法。
    最关心的是神经算子、符号回归和替代建模方面的方法论文，
    尤其是能够迁移到单细胞或动力系统背景下的工作。

  keywords:
    - neural operator
    - symbolic regression
    - single-cell
    - stochastic simulation
    # ... 添加你自己的关键词
```

### 3. 选择你的 AI 模型

流水线使用 OpenAI 兼容 API，任何厂商均可（DeepSeek、OpenAI、Qwen、本地 vLLM）：

```yaml
relevance:
  embedding_model: text-embedding-v4   # 用于初始排序

rerank:
  mode: embedding_plus_qwen3_rerank    # 或设为 "embedding_only" 跳过重排序
  model: qwen3-rerank

analysis:
  model: deepseek-chat                 # 生成论文摘要
  temperature: 0.2
```

通过环境变量（`OPENAI_BASE_URL`、`EMBEDDING_BASE_URL`、`RERANK_BASE_URL`）指向你选择的服务商。

> [!TIP]
> 建议从 `rerank.mode: embedding_only` 开始，等熟悉输出质量后再启用重排序。

## 工作原理

### 架构

```
arXiv /recent 页面           arXiv API                你的 AI 服务商
       │                         │                         │
       ▼                         ▼                         ▼
┌──────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  公告列表    │──▶│  论文发现           │──▶│  Embedding + 重排序 │
│  解析器      │   │  + 元数据获取       │   │  + AI 分析          │
└──────────────┘   └─────────────────────┘   └─────────────────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────────┐
                                                │  静态 JSON          │
                                                │  (data/daily/)      │
                                                └─────────┬───────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────────┐
                                                │  纯 JS 站点         │
                                                │  (GitHub Pages)     │
                                                └─────────────────────┘
```

### 流水线步骤

| 步骤 | 说明 |
|------|------|
| **论文发现** | announcement_list 模式读取 arXiv `/list/<category>/recent` 页面获取新公告的论文 ID。api_strict_window 模式作为备选，通过 arXiv API 按日期范围直接查询。 |
| **元数据获取** | 通过 arXiv API 批量查询论文 ID（`id_list`），获取标题、摘要、作者、分类和标准化 HTTPS 链接。 |
| **领域分类** | 根据 arXiv 分类号为每篇论文分配领域。不匹配任何领域关键词的论文被过滤掉。 |
| **Embedding 排序** | 将研究背景 + 关键词组合为查询文本，与论文标题+摘要分别做 embedding，用余弦相似度计算基础相关性分数，再按领域优先级加权。 |
| **可选重排序** | 若启用 qwen3-rerank，对 Top-N 论文（由 `pool_size` 控制）进行精细重排。 |
| **平衡选取** | 按领域优先级比例分配配额，确保各研究方向的论文都有覆盖。 |
| **AI 分析** | 每篇入选论文生成结构化双语摘要：TL;DR、动机、方法、结果、对你有何帮助，以及带可行想法的研究灵感火花。 |
| **站点生成** | 写入每日 JSON 快照和搜索索引。纯 JS 前端将其渲染为可筛选的论文卡片，支持详情弹窗、PDF 阅读和关键词统计。 |

### 两种获取模式

| 模式 | 工作方式 | 适用场景 |
|------|---------|---------|
| `announcement_list`（默认） | 跟踪 arXiv 官方 `/recent` 页面，按公告日期推进 | 生产环境；与 arXiv 公告节奏一致 |
| `api_strict_window` | 通过 arXiv API 按 `submittedDate` 窗口查询 | 调试、补录历史、对比行为差异 |

> [!NOTE]
> `announcement_list` 模式下，若当天无新公告则不会更新。这是符合预期的行为，避免了发布几乎为空的报告。

## 部署（GitHub Actions）

利用 GitHub Actions 实现零成本定时发布：

### 1. Fork 本仓库

### 2. 配置 GitHub Pages

进入 **Settings → Pages**，设置：
- **Source**: `Deploy from a branch`
- **Branch**: `gh-pages`，根目录

### 3. 添加 Secrets

在 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 说明 |
|--------|------|
| `OPENAI_API_KEY` | 对话/补全模型 API 密钥 |
| `OPENAI_BASE_URL` | 对话 API 地址（如 `https://api.deepseek.com/v1`） |
| `EMBEDDING_API_KEY` | Embedding 模型 API 密钥 |
| `EMBEDDING_BASE_URL` | Embedding API 地址 |
| `RERANK_API_KEY` | 重排序 API 密钥（可选） |
| `RERANK_BASE_URL` | 重排序 API 地址（可选） |
| `DASHSCOPE_API_KEY` | 嵌入/重排序兼容别名（可选） |
| `PAGES_DEPLOY_TOKEN` | 精细化 PAT，用于推送 gh-pages（可选，不设则回退到 `GITHUB_TOKEN`） |

### 4. 修改定时任务

工作流默认在 [北京时间 03:00](.github/workflows/daily.yml#L6) 运行。修改 cron 行即可调整为你的时区和频率。

### 5. 触发首次运行

进入 **Actions → arxiv-research-daily → Run workflow**。完成后，你的站点将上线：`https://<你的用户名>.github.io/ArXiv4Research/`

> [!WARNING]
> 绝不要将 API 密钥提交到仓库。`.gitignore` 已排除 `.env`、`config/config.yaml` 和 `data/`。所有凭证在 CI 中通过 **GitHub Secrets** 注入，本地运行时通过环境变量传入。

## 本地开发

### 运行完整流水线

```bash
python scripts/run_pipeline.py --config config/config.yaml --data-dir data
```

### 构建可部署的站点包

```bash
python scripts/build_site.py --source-data data --output-dir build/site
python -m http.server 8000 --directory build/site
```

### 项目结构

```
app/                          # Python 流水线
├── pipeline.py               # 主编排器
├── config.py                 # YAML 配置加载
├── models.py                 # 数据类（Paper, Config, DomainBucket）
├── rerank.py                 # Embedding 排序、重排序、领域平衡选取
├── arxiv_announcement_client.py  # /recent 页面解析器
├── arxiv_api_client.py       # arXiv API 客户端（搜索 + id_list）
├── arxiv_transport.py        # HTTP 传输层（含重试逻辑）
├── fetch_state.py            # 增量状态追踪
├── storage.py                # JSON 快照 + 索引生成
├── sniffer.py                # 代码链接检测（GitHub、HF、Colab）
├── ai/                       # AI 分析、Embedding、重排序客户端
└── arxiv_support/            # 元数据解析、机构信息提取
config/
├── config.example.yaml       # 带注释的配置模板（可提交）
└── config.yaml               # 你的本地配置（gitignored）
prompts/backend/              # LLM 提示词模板（.txt）
scripts/                      # CLI 入口
web/                          # 静态前端（纯 JS + CSS）
├── index.html                # 每日报告页
├── statistics.html           # 关键词统计页
└── scripts/
    ├── shared/               # 主题、日期、数据工具函数
    ├── paper-detail/         # 弹窗、本地 AI、缓存、PDF 阅读器
    ├── app.js                # 每日报告入口
    └── statistics.js         # 统计页入口
data/                         # 生成的数据（gitignored）
```

### 技术栈

- **流水线**: Python 3.10+, `feedparser` 解析 Atom, `pyyaml` 配置, `openai` SDK 调用 AI
- **前端**: 零依赖的纯 JS + CSS，模块通过 `window.ARA` 通信
- **AI 模型**: 兼容任何 OpenAI 接口的服务商（DeepSeek、Qwen、OpenAI、本地 vLLM）
- **部署**: GitHub Actions → GitHub Pages（`gh-pages` 分支）

## 安全

- **API 密钥** 本地从环境变量读取，CI 中从 GitHub Secrets 注入——绝不硬编码
- **浏览器本地设置**（访客的 API 密钥、研究背景）存储在 `localStorage` / `sessionStorage`，绝不上传
- **`.env`**、**`config/config.yaml`** 和 **`data/`** 已加入 `.gitignore`，防止意外提交
- 如需报告漏洞，请使用 [GitHub 安全公告](https://github.com/zhaoxixixi/ArXiv4Research/security/advisories/new) 私密提交——不要公开开 issue

完整安全策略见 [SECURITY.md](.github/SECURITY.md)。
