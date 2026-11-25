/**
 * background.js — B站划词翻译 · Safari Web Extension
 *
 * 职责：所有网络请求都在这里发。
 *      扩展的 background 有 host_permissions，请求不走 CORS 预检，
 *      也不会被网页的 Origin 策略限制 —— 这是绕开接口两个 CORS 坑的关键。
 */

const DEFAULT_CFG = {
  endpoint: "https://index-translate.bilibili.com/v1/chat/completions",
  model: "Index-Translate-9B",
  proxy: "", // 可选：Cloudflare Worker 地址
};

async function loadCfg() {
  try {
    const got = await api.storage.local.get(DEFAULT_CFG);
    return { ...DEFAULT_CFG, ...got };
  } catch (e) {
    return { ...DEFAULT_CFG };
  }
}

// 兼容 Safari 的 browser.* 与 chrome.*
const api = (typeof browser !== "undefined" && browser.runtime) ? browser : chrome;

async function callUpstream(payload) {
  const cfg = await loadCfg();
  const url = cfg.proxy || cfg.endpoint;
  const body = { ...payload, model: payload.model || cfg.model };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "bt-translate") return;

  callUpstream(msg.payload)
    .then(sendResponse)
    .catch((e) => sendResponse({ status: 0, text: String(e) }));

  return true; // 保持消息通道，异步回复
});

// 首次安装时写入默认配置
api.runtime.onInstalled && api.runtime.onInstalled.addListener(async () => {
  const cur = await loadCfg();
  try { await api.storage.local.set(cur); } catch (e) {}
});
