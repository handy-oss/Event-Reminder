# 事件提醒 (Event Reminder) v5.4 - Cloudflare Workers 版

[![Language](https://img.shields.io/badge/language-JavaScript-orange.svg)](https://www.javascript.com/)
[![Platform](https://img.shields.io/badge/platform-Cloudflare%20Workers-blue.svg)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

这是一款功能强大且界面美观的事件提醒工具，完全部署在 Cloudflare Workers 上，实现了真正的 Serverless。它将前端 UI、后端 API 和定时任务逻辑整合在单个文件中，无需任何外部服务器或数据库，仅依赖 Cloudflare 生态系统。

你可以用它来追踪各种需要定期或一次性处理的事件，例如：
- 服务器、域名续费提醒
- 信用卡、账单还款日
- Google Voice 等账号的保号任务
- 各种订阅服务的到期日

## ✨ 功能特性

- **无服务器架构**: 无需购买 VPS，完全运行在 Cloudflare 的全球网络上，稳定、高效且免费额度充足。
- **一体化设计**: 单个 JS 文件包含前端 UI、后端 API 和定时任务，部署极其简单。
- **数据持久化**: 使用 Cloudflare KV 作为数据库，安全存储您的事件数据。
- **精美响应式 UI**:
    - 支持浅色/深色模式，并能自动适应系统设置。
    - 采用卡片式布局，直观展示每个事件的剩余天数、状态和备注。
    - 状态自动判断（良好、临近、紧急、逾期）并以不同颜色高亮。
    - 移动端优先，在手机和桌面端均有优秀体验。
- **两种提醒模式**:
    - **循环重复**: 适用于如“每3个月”或“每年”的周期性任务。完成任务后点击“刷新”即可重置计时器。
    - **单次提醒**: 适用于有明确截止日期的一次性事件。
- **多渠道通知**:
    - **Telegram Bot**: 通过您自己的机器人即时发送提醒。
    - **Email (Resend)**: 通过 Resend 服务发送格式精美的 HTML 邮件提醒。
    - 可为每个事件独立开关不同的通知渠道。
- **高度自定义**:
    - 可自定义提醒规则，例如在到期前 30、15、7、3、1、0 天发送通知。
    - 可自定义每日发送通知的具体时间（例如 10:00）。
    - 周期模式支持“月”和“天”为单位的自定义周期。
- **安全与管理**:
    - 通过密码保护您的应用访问。
    - 支持对事件进行“归档”和“激活”，方便管理已完成或暂不需要的事件。
    - 提供“发送测试”功能，方便验证通知渠道是否配置正确。

## 🚀 部署指南

部署过程非常简单，主要分为配置和上传两个步骤。

### 1. 准备工作

- 一个 Cloudflare 账号。
- 在本地安装 [Node.js](https://nodejs.org/en/) 和 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)。

  ```bash
  npm install -g wrangler
