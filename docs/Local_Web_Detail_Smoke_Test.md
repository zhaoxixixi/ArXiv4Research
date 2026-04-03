# Local Web Detail Smoke Test

## Start a local static server
在项目根目录执行：

```bash
python -m http.server 9000
```

然后打开：
- 主页：`http://127.0.0.1:9000/web/index.html`
- Statistics：`http://127.0.0.1:9000/web/statistics.html`

---

## Main Page Checklist
### A. 基础加载
- 页面正常加载
- 顶部日期可显示
- Domain chips 可切换
- 论文列表正常出现

### B. 论文详情弹窗
- 点击论文卡片空白区域可打开详情
- 点击“查看详情”按钮也可打开详情
- 弹窗内作者 / 单位 / 关键词 / 摘要 / PDF 区域正常显示
- `上一篇 / 下一篇` 可切换当前列表内论文
- 点击背景空白区域可关闭弹窗
- `Esc` 可关闭弹窗

### C. 详情交互
- 中 / 英文切换正常
- `arXiv / PDF / HTML / Code` 链接正常打开
- PDF 放大 / 恢复正常
- 若已配置本地 API：
  - “生成我的 Spark” 正常
  - “继续提问” 正常
- 若未配置本地 API：
  - 会弹出 settings dialog，而不是直接报错卡死

### D. 日期范围
- 点击右上角日期按钮
- 切换单日 / 范围
- 应用后列表刷新正常
- 打开详情后，范围内论文导航正常

---

## Statistics Page Checklist
### A. 基础加载
- Popular Keywords 正常显示
- 点击某个 keyword 后，Related Papers 列表更新

### B. 页内详情复用
- 点击 Related Papers 卡片空白区域，**在当前页内** 打开详情
- 不应跳转回 `index.html`
- `arXiv / PDF` 按钮仍保持外链行为
- 弹窗内 `上一篇 / 下一篇` 仅在当前 keyword 的 related papers 范围内切换

### C. 日期范围
- 点击 Statistics 右上角日期按钮
- 切换单日 / 范围后，关键词与 related papers 正常刷新
- 若当前弹窗已开，切换 scope 后不应出现卡死或错位

---

## Quick Regression Commands
```bash
node --check web/scripts/paper_detail_shared.js
node --check web/scripts/app.js
node --check web/scripts/statistics.js
python - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
class P(HTMLParser):
    pass
for path in ['web/index.html', 'web/statistics.html']:
    P().feed(Path(path).read_text(encoding='utf-8'))
    print('parsed', path)
PY
```
