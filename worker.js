/**
 * 事件提醒 (Event Reminder) v5.5
 * Cloudflare Workers 版
 * 优化：在卡片上增加到期日期的显示，并保持UI协调
 */

const DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };
  
  // --- 2. 后端逻辑 ---
  export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (url.pathname === '/') return env.assets.fetch(request);
      if (url.pathname.startsWith('/api')) {
          if (request.headers.get('x-auth-token') !== env.AUTH_PASSWORD) return new Response('Unauthorized', { status: 401 });
      }
      if (url.pathname === '/api/list') {
        const data = await env.KEEP_ALIVE_DB.get('accounts', { type: 'json' }); return new Response(JSON.stringify(data || []), DEFAULT_HEADERS);
      }
      if (url.pathname === '/api/update') {
        const item = await request.json(); let list = (await env.KEEP_ALIVE_DB.get('accounts', { type: 'json' })) || [];
        const idx = list.findIndex(a => a.id === item.id); if (idx > -1) list[idx] = item; else list.push(item);
        await env.KEEP_ALIVE_DB.put('accounts', JSON.stringify(list)); return new Response('{"ok":true}', DEFAULT_HEADERS);
      }
      if (url.pathname === '/api/delete') {
          const id = url.searchParams.get('id'); let list = (await env.KEEP_ALIVE_DB.get('accounts', { type: 'json' })) || [];
          list = list.filter(a => a.id !== id); await env.KEEP_ALIVE_DB.put('accounts', JSON.stringify(list)); return new Response('{"ok":true}', DEFAULT_HEADERS);
      }
      if (url.pathname === '/api/test-single') {
          const id = url.searchParams.get('id');
          const list = (await env.KEEP_ALIVE_DB.get('accounts', { type: 'json' })) || [];
          const item = list.find(i => i.id === id);
          if(item) {
              const shDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
              const now = new Date(shDateStr);
              now.setHours(0,0,0,0);
  
              let dueDate = calculateDueDate(item);
              dueDate.setHours(0,0,0,0);
  
              const diff = dueDate - now; 
              const days = Math.round(diff / (1000 * 3600 * 24));
              
              await sendNotification(env, item, days, dueDate, true);
              return new Response('{"ok":true}', DEFAULT_HEADERS);
          }
          return new Response('{"ok":false, "err":"Item not found"}', DEFAULT_HEADERS);
      }
      return new Response('404', { status: 404 });
    },
    async scheduled(event, env, ctx) { ctx.waitUntil(runSchedule(env)); }
  };
  
  // --- 3. 核心通知逻辑 ---
  function calculateDueDate(item) {
      const parseLocal = (s) => {
          const d = new Date(s);
          return new Date(d.valueOf() + d.getTimezoneOffset() * 60000);
      };
  
      if (item.mode === 'target') {
          return parseLocal(item.targetDate);
      } else {
          const last = parseLocal(item.lastDate);
          const due = new Date(last);
          const unit = item.cycleUnit || 'm'; 
          const val = parseInt(item.cycleValue);
          if (unit === 'd') {
              due.setDate(due.getDate() + val);
          } else if (unit === 'n') {
              due.setMinutes(due.getMinutes() + val);
          } else due.setMonth(due.getMonth() + val);
          return due;
      }
  }
  
  async function runSchedule(env) {
      const list = (await env.KEEP_ALIVE_DB.get('accounts', { type: 'json' })) || [];

      const currentDate = new Date();
      const shDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(currentDate);
      const now = new Date(shDateStr);
      now.setHours(0,0,0,0);

      const minDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(currentDate);
      const minNow = new Date(minDateStr);
      minNow.setSeconds(0, 0);
      const nowStr = `${minNow.toLocaleDateString("en-CA")}T${minNow.toLocaleTimeString("en-CA", {hour: '2-digit', minute: '2-digit', hour12: false })}`

      let isUp = false;
      for (const item of list) {
          if (item.status === 'archived') continue;
          if (!item.notify && !item.notifyEmail && !item.notifyWebhook) continue;
  
          let dueDate = calculateDueDate(item);

          if (item.mode === 'cycle' && item.cycleUnit === 'n') {
              dueDate.setSeconds(0, 0);
              const diff = dueDate - minNow;
              if (diff <= 0) {
                  item.notifyResult = await sendNotification(env, item, 0, dueDate, false);
                  item.lastDate = nowStr;
                  isUp = true;
              }
              continue;
          }
          // 指定时间提醒
          if (minNow.toLocaleTimeString("en-CA", {hour: '2-digit', minute: '2-digit', hour12: false }) !== item.notifyTime) {
              continue;
          }

          dueDate.setHours(0,0,0,0);

          const diff = dueDate - now;
          const days = Math.round(diff / (1000 * 3600 * 24));
          const reminders = item.reminders || [15, 7, 3, 1, 0];
  
          if (reminders.includes(days) || (days <= 0 && days % 7 === 0)) {
              item.notifyResult = await sendNotification(env, item, days, dueDate, false);
               if (days <= 0) {
                   if (item.mode === 'cycle') {
                       item.lastDate = nowStr;
                   }
                   // item.status = 'archived';
               }
              isUp = true;
          }
      }
      if (isUp) {
          await env.KEEP_ALIVE_DB.put('accounts', JSON.stringify(list));
      }
  }
  
  async function sendNotification(env, item, days, dueDate, force) {
      let icon = "🔔"; if(days <= 3) icon = "🔴"; else if(days <= 7) icon = "🟠";
      if (force) icon = "📢 [测试]";
  
      const msgTitle = `[事件提醒] ${item.name}`;
      const msgBody = `⏳ 剩余: ${days} 天\n📅 到期: ${dueDate.toLocaleDateString("en-CA")}\n📝 备注: ${item.notes || '无'}`;
      let result = [];
      if (item.notify && env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
          const tgMsg = `${icon} **${msgTitle}**\n\n${msgBody}`;
          let resp = "TG：✅ok";
          try {
              const response = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: tgMsg, parse_mode: 'Markdown' })
              });
              if (response.status < 200 || response.status >= 400) {
                  const str = await response.text()
                  resp = `TG：❌status=>${response.status},statusText=>${response.statusText},body=>${str.substring(0,500)}`
              }
          } catch(e) {
              console.log('TG Err', e);
              resp = "TG：❌" + e.message
          }
          result.push(resp)
      }
  
      if (item.notifyEmail && env.RESEND_API_KEY && env.RESEND_FROM) {
          const toAddresses = item.notifyEmail.split(',').map(e => e.trim()).filter(e => e);
          if (toAddresses.length) {
              const htmlContent = `
              <div style="font-family: sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                  <h2 style="color: #3b82f6; margin-top:0;">${icon} ${msgTitle}</h2>
                  <p style="font-size: 16px;"><strong>剩余天数：</strong> <span style="color: ${days <= 7 ? 'red' : 'black'}">${days} 天</span></p>
                  <p><strong>到期日期：</strong> ${dueDate.toLocaleDateString("en-CA")}</p>
                  <p><strong>备注信息：</strong><br>${item.notes || '无'}</p>
                  <hr style="border: 0; border-top: 1px solid #f3f4f6; margin: 20px 0;">
                  <p style="font-size: 12px; color: #6b7280;">来自事件提醒助手</p>
              </div>`;

              result.push(await sendResendEmail(env, toAddresses, `${icon} ${msgTitle} (剩余 ${days} 天)`, htmlContent));
          }
      }

      if (item.notifyWebhook) {
          const hook = item.notifyWebhook.split(' ').map(e => e.trim()).filter(e => e);
          if (hook.length) {
              const method = hook.length >= 2 ? hook[0] : "POST";
              const url = hook.length === 1 ? hook[0] : hook[1];
              const methodList = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
              const hasBody = ["POST", "PUT", "PATCH", "DELETE"]
              if (methodList.includes(method)) {
                  const body = {
                      title: icon + msgTitle,
                      daysRemaining: days,
                      expirationDate: dueDate.toLocaleDateString("en-CA"),
                      remark: item.notes || '无',
                      info: msgBody,
                  }
                  result.push(await fetchWithTimeout(method, url, hasBody.includes(method) ? JSON.stringify(body) : null))
              }
          }
      }
      return result;
  }
  
  async function sendResendEmail(env, toAddresses, subject, html) {
      const from = env.RESEND_FROM;
      let resp = "Email：✅ok";
      try {
          const response = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: from, to: toAddresses, subject: subject, html: html })
          });
          if (response.status < 200 || response.status >= 400) {
              const str = await response.text()
              resp = `Email：❌status=>${response.status},statusText=>${response.statusText},body=>${str.substring(0,500)}`
          }
      } catch (e) {
          console.error('Email Send Error:', e);
          resp = "Email：❌" + e.message
      }
      return resp;
  }

    async function fetchWithTimeout(method, url, data) {
        const TIMEOUT = 5000;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT);
        let resp = "Webhook：✅ok";
        try {
            const response = await fetch(url, {
                method,
                signal: controller.signal,
                headers:{"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36", 'Content-Type': 'application/json'},
                body: data
            });
            console.log(`✅ 成功: ${url}`);

            if (response.status < 200 || response.status >= 400) {
                const str = await response.text()
                resp = `Webhook：❌status=>${response.status},statusText=>${response.statusText},body=>${str.substring(0,500)}`
            }
        } catch (error) {
            console.warn(`❌ 访问失败: ${url}, 错误: ${error.message}`);
            resp = "Webhook：❌" + error.message
        } finally {
            clearTimeout(timeout);
        }
        return resp
    }
