# 本机写作链路与交付

## 项目与选题

- 项目：`D:/GEO文章生成器/sites/beautychoicejournal`。
- 50 题单一来源：`content/question-bank.json`。每条含 `id`、`slug`、`category`、`question`、`decision_gain`、`evidence_needed`、`status`。
- `status` 为编辑进度，不是热度或流量。`planned` 表示尚未写稿；`draft_review` 表示存在待审稿。发布前先核对实际文件与用户当前决定，再更新状态。
- `content/topics.json` 只提供原30题的封面元数据，正式构建已使用50题库与这些元数据合并。不要把题库剩余20题漏出发布范围。
- 正文数据：`content/articles/<slug>.json`。四篇获准稿为beauty-device-guide、sunscreen-selection、retinol-beginners、foundation-caking；它们可参考写法，不是新文章的事实来源。

## 千问与成本

用户要求文章通过千问 API 成稿。选题、整理规范与格式转换可直接完成，无需为这些工作支付模型费用。

1. 先读当前代码与配置，只为选定主题补充必要资料。尽量复用已核实且仍有效的证据与原始响应，避免把整个题库或所有历史稿放进提示词。
2. 模型优先选当前账号允许、支持本次任务的低成本型号，并关闭不需要的思考。2026-11-04 测试中 `qwen-flash` 与 `qwen3.8-flash` 被现有密钥权限拒绝，`qwen3.8-max` 可用；这是快照，不是永久规定。受限时说明限制，不能声称使用了便宜型号，也不擅自扩大密钥权限。
3. 密钥可从本机 `.env` 的非空 `DASHSCOPE_API_KEY` / `QWEN_API_KEY` 读取；没有时，父项目 `scripts/lib/supabase-cli-query.mjs` 提供官方 CLI 的只读凭据库查询路径。参照当前 `scripts/generate.mjs` 的实现。不要打印、写入 Skill、打包进输出文件或向前端传递密钥。
4. 当前机器存在系统代理。确有网络问题时检查 `HTTP_PROXY` / `HTTPS_PROXY`；Node 请求可使用 `NODE_USE_ENV_PROXY=1`，现有模型请求也使用官方 curl 并经 stdin 传配置。不要复制带凭据的命令到日志。
5. 较新多模态千问的原生联网搜索参数与文本接口不同。当前实现采用原生流式搜索，保留返回的 `search_info.search_results`，并检查正常结束；兼容接口能返回文字不代表必定返回来源链接。调用前核对最新官方接口和当前实现。
6. 内部 `private/` 保存原始响应、来源核对与用量记录。记下实际模型、请求、成功/失败、token 与缓存；没有账单依据时不宣称精确人民币费用，失败或未返回用量不自动等于零费用。
7. 权限、参数或网络失败后先定位原因，再作有界重试。已有同主题、同阶段成功响应时复用缓存；不能反复付费请求相同内容来碰运气。

## 控制主题与数量

**不要裸跑 `node scripts/generate.mjs`。** 现有脚本默认按旧的 30 题遍历并跳过已有稿，不是新 50 题库的调度器。即使设置生成数量为 1，也可能跳到另一个主题；先确认选中 ID、slug 与运行入口一致。

`scripts/revise-beauty-guide.mjs` 是美容仪样稿的专用修订脚本，带专用缓存，不是所有题目的通用入口。使用旧缓存可能覆盖后续人工修订；先保留现稿，再核对输入和缓存。不要把样稿里的医疗器械表或 36 人研究强行套用到彩妆等其他主题。

为当前明确主题建立有界请求；只生成当前授权的数量。其他题目仍保留 `planned`，不能把“列入题库”当作自动写稿或发布授权。

## 数据、预览与校验

- 文章包含 `title`、`summary`、`takeaway`、`sections`、`sources`、`slug`、`category` 等；已有结构可从当前样稿读取。保持 `publicationStatus: draft` 和 `reviewStatus: pending_user_review`，直到用户作出后续决定。
- 比较表放入某节的 `table: {caption, columns, rows}`。所有行与列数一致；表格与段落均使用来源编号 `[1]`。表格不是每篇必需。
- `scripts/article-render.mjs` 统一处理安全转义、引用和表格。手机上表格在容器内横向滚动，并给出滑动提示，不能撑宽整个页面。
- `node scripts/review.mjs <slug>` 按指定slug导出本地HTML审阅稿。
- `node scripts/build.mjs --preview` 和 `node scripts/verify.mjs --preview` 用于当前未发布内容的本地核对。`npm test` 检查现有内容与界面辅助逻辑。公开 HTML 中扫描制作说明残留，并检查来源编号、链接、XSS 转义和手机排版。
- 正式构建仅选publicationStatus=published且reviewStatus=approved的文章；不是要求全部50题完成。`node scripts/build.mjs`、`node scripts/verify.mjs`、npm test通过后用本站根firebase.json部署。构建会同步已发布文章的评论规则、sitemap与search-manifest，不得部署--preview输出。Firebase Hosting+Firestore已上线，Spark免费且不关联账单。
- 浏览器操作使用 Chrome。完成写作不自动改变域名、托管、访问权限、社区数据或发布状态。

## 每日入口

已明确授权每天北京时间02:00两篇同批生成、核查、一次部署；以daily-publishing.md的云端入口为准。Codex定时任务已删除；daily-batch.mjs和write-daily-pair.mjs仅留作本机辅助，不是当前调度器。不运行旧固定3篇脚本。新qwen-client.mjs使用Node HTTPS，避免Windows curl Schannel中断；调用在本机完成，访客端不调用千问。模型选择保存在private/qwen-model-selection.json；Flash此前被拒绝，Plus探测网络失败，不能把Plus记成已拒绝或已可用；目前已验证可用的是qwen3.8-max。每批只一个两篇写作请求，最大6500输出token，未知费用仍记未知。

免费托管不是千问API免费。用户已明确授权将既有千问密钥复制至本站独立仓库GitHub Actions Secrets，仅供本站云端任务使用；不把密钥放进代码、网页或日志。不启用付费云函数。
