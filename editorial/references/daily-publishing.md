# 网站云端每日两篇

用户2026-11-05已批准现有四稿发布，并授权每天北京时间02:00从50题库写两篇、检查后一起发布。随后明确要求不依赖Codex，本机定时任务已删除。当前运行入口是独立仓库 Furby9p/beautychoicejournal 的 .github/workflows/daily.yml，cron 18:00 UTC，即次日02:00北京时间；GitHub免费调度可能延迟，不承诺分秒准时。

## 实际流程

- 运行 scripts/cloud-daily.mjs publish。同一天最多一组两题；读取content/question-bank.json，只选择planned；未完成旧批次先恢复，不能重复生成或多写。题库不足两题停止付费调用。
- 千问原生联网搜索一次处理两题；只读取专业组织、监管、原始研究或厂家原文等允许来源。每题至少两页实际可读正文，保留来源时间与摘录。低质导购不能补数。
- 一次写作调用同时生成两篇，关闭思考，最大输出6500tokens。另一次依据原文审核两篇；每段必须有来源支持或明确为编辑建议，事实审核中的引文须在原文匹配。任一篇失败，两篇都不发布，不以空页凑数。
- 每阶段响应和费用回执均先保存加密状态，可恢复成功缓存，避免重复付费。每批总计最多4次API尝试、同阶段最多2次；失败用量无法获知时保留未知。
- 两篇通过后构建、验证、测试，按已发布文章同步评论规则，一次Firebase Hosting发布两篇。以真实URL及hash核验；再提交IndexNow，站点地图自动更新。提交接收不等于收录或排名。
- 用户投稿、评论、举报等Firestore数据不在此任务改写范围内。

## 密钥、费用与免费边界

用户明确授权复制既有千问密钥至网站云端私密配置。仅存于该仓库Actions Secrets的DASHSCOPE_API_KEY，不进网页、代码、公开日志或聊天。BCJ_LEDGER_KEY用于加密每次请求的token、缓存命中、模型、价格依据、估算人民币费用、失败状态及响应缓存。automation-state/runtime.enc.json是AES-GCM密文；实际供应商扣款默认未知，不能把公开单价估算当账单。

Google部署采用限制到该仓库main分支指定workflow的OIDC短期身份，不保存长期Google服务账号私钥。Firebase保持Spark，不关联Cloud Billing，不启用收费Functions或Storage。GitHub仅使用公开仓库的标准Ubuntu运行器，不启用larger runner、付费构建服务或artifact存储。千问API费用与免费托管分开。

## 维护和验证

正式云端源码在 D:/GEO文章生成器/sites/beautychoicejournal/private/render-site 的已有独立Git仓库；操作前先取最新main，保留云端新增文章、回执和并发用户改动。主项目根目录可能只是旧快照，禁止整包覆盖云端新内容。

workflow_dispatch默认audit：校验密钥、执行一次已缓存的小型健康调用（如尚未验证）、部署现有内容并检查爬虫访问；不生成新文章。首次配置后必须看到真实云端workflow成功，不能仅凭YAML存在宣称定时链路已可用。状态不明时先读原workflow运行与加密状态，不重复发起付费调用。

## 开发讨论模拟

仅在 ?demo=1 或 /development/preview/ 独立开发入口显示测试讨论，不在正式内容流启用。执行细节、低价模型权限、每篇2–60含楼中楼、加密排期、05:00批量释放及费用记录见 ../development-comments.md。固定版式fixture不冒充千问生成结果，不写入真实Firestore。
