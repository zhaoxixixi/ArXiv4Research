# GitHub Public Release Checklist

本清单用于 **首次把项目公开发布到 GitHub**，并保持：

- `main` 只放源码
- `gh-pages` 放自动生成网页与日报数据

---

## 1. 先检查本地敏感文件

确认以下内容 **不要进入公开仓库**：

- `Materials/api/keys.bash`
- `.env` / `.env.*`
- `config/config.yaml`
- 本地生成的 `data/`
- IDE / editor 本地配置（如 `.vscode/`）

---

## 2. 停止跟踪本地配置和生成数据

如果这些文件以前已经被 Git 跟踪过，先执行：

```bash
git rm -r --cached data .vscode
git rm --cached config/config.yaml
```

这不会删除本地文件，只会让 Git 停止跟踪。

---

## 3. 确认 `.gitignore`

至少应忽略：

- `data/`
- `config/config.yaml`
- `.vscode/`
- `build/`
- `.env`
- `.env.*`

公开仓库中建议保留：

- `config/config.example.yaml`
- `README.md`
- `.github/workflows/daily.yml`
- `.github/SECURITY.md`

---

## 4. 配置 GitHub Secrets

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中配置：

必需：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_BASE_URL`

可选：

- `RERANK_API_KEY`
- `RERANK_BASE_URL`
- `DASHSCOPE_API_KEY`
- `PAGES_DEPLOY_TOKEN`

说明：

- `PAGES_DEPLOY_TOKEN` 推荐配置，用于更稳妥地推送 `gh-pages`
- 如果没有设置，workflow 会回退到默认 `GITHUB_TOKEN`

---

## 5. 配置 GitHub Pages

在 **Settings → Pages** 中确认：

- **Source** = `Deploy from a branch`
- **Branch** = `gh-pages`
- **Folder** = `/ (root)`

---

## 6. 检查 workflow 调度

当前仓库的 workflow 目标是：

- 每天 **06:00 Asia/Shanghai** 自动运行

首次发布时建议先手动测试一次：

1. 打开 **Actions**
2. 选择 `arxiv-research-daily`
3. 点击 **Run workflow**

---

## 7. 检查 `gh-pages` 输出是否正确

workflow 成功后，确认：

- `gh-pages` 分支已生成
- 其中包含网页静态文件
- 其中包含 `data/` 目录
- Pages URL 能正常打开

---

## 8. 最终公开前自查

确认：

- [ ] 没有真实 API key 出现在 commit 中
- [ ] 没有把 `data/` 手动提交到 `main`
- [ ] 没有把本地 config 提交到 `main`
- [ ] README 已更新
- [ ] SECURITY.md 已存在
- [ ] workflow 已手动验证一次
- [ ] `gh-pages` 已正常生成

---

## 9. 推荐首次提交命令

```bash
git add .
git commit -m "chore: prepare public GitHub release"
git push origin main
```

如果这是第一次创建远程仓库，先添加远程：

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```
