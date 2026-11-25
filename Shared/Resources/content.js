// ==UserScript==
// @name         B站划词翻译
// @name:en      Bili Select Translate
// @namespace    https://github.com/yshxqx
// @version      1.0.0
// @description  选中即译：外文译中文，中文译英文。走 B 站 index-translate 接口，免 key。
// @author       yshxqx
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.getValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM_setValue
// @connect      index-translate.bilibili.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* eslint-disable no-empty */
(function () {
  'use strict';

  // ---------- 配置 ----------
  const CFG = {
    endpoint: 'https://index-translate.bilibili.com/v1/chat/completions',
    model: 'Index-Translate-9B',
    fallbackModel: 'Index-Translate-2B',
    maxChars: 1400,          // 超过就不发（接口上下文有限）
    minChars: 2,
    autoShow: true,          // 选中后自动冒气泡
    autoDelay: 220,          // 抬起手指后多久弹（避开 iOS 系统菜单）
    cacheSize: 300,
    /* 如果直连报 412（网关只放行 bilibili 的 Origin），把 Cloudflare Worker
       部署好之后，把地址填到这里，并给 @connect 加一行 worker 域名。
       例：proxy: 'https://bili-translate.xxx.workers.dev' */
    proxy: '',
    bubbleColor: '#00A1D6'   // B 站蓝
  };

  const ENDPOINT = () => CFG.proxy || CFG.endpoint;

  const PROMPT = `You translate text. Output only the translation, nothing else.
- Chinese text -> translate into English
- Any other language (English, Japanese, Korean, French, ...) -> translate into Simplified Chinese
Examples:
Input: 今天天气很好。
Output: The weather is nice today.
Input: 東京は今日雨が降るでしょう。
Output: 东京今天大概会下雨。`;

  // ---------- 基础设施 ----------
  const hasGM = typeof GM !== 'undefined' || typeof GM_xmlhttpRequest !== 'undefined';
  const hasExt = (() => {
    try {
      const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
      return !!(api && api.runtime && api.runtime.id);
    } catch (e) { return false; }
  })();

  function gmRequest(payload) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const opts = {
        method: 'POST',
        url: ENDPOINT(),
        headers: { 'Content-Type': 'application/json' },
        data: body,
        timeout: 45000,
        onload: (r) => resolve({ status: r.status, text: r.responseText }),
        onerror: () => reject(new Error('network')),
        ontimeout: () => reject(new Error('timeout'))
      };
      if (typeof GM !== 'undefined' && GM.xmlHttpRequest) GM.xmlHttpRequest(opts);
      else GM_xmlhttpRequest(opts);
    });
  }

  // 走自建扩展的 background（不受 CORS 约束）
  function bgRequest(payload) {
    return new Promise((resolve, reject) => {
      const api = (typeof browser !== 'undefined' && browser.runtime) ? browser
                : (typeof chrome !== 'undefined' ? chrome : null);
      if (!api) return reject(new Error('no extension api'));
      let settled = false;
      const done = (resp) => {
        if (settled) return; settled = true;
        const err = api.runtime.lastError;
        if (err) return reject(new Error(err.message || String(err)));
        if (!resp) return reject(new Error('empty response from background'));
        resolve(resp);
      };
      try {
        const ret = api.runtime.sendMessage({ type: 'bt-translate', payload }, done);
        if (ret && typeof ret.then === 'function') {
          ret.then((r) => done(r)).catch((e) => { if (!settled) { settled = true; reject(e); } });
        }
      } catch (e) { reject(e); }
    });
  }

  async function fetchRequest(payload) {
    const r = await fetch(ENDPOINT(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { status: r.status, text: await r.text() };
  }

  function buildPayload(text, model) {
    return {
      model: model || CFG.model,
      messages: [{ role: 'user', content: PROMPT + '\n\n' + text }],
      max_tokens: Math.min(1600, 400 + text.length * 2),
      temperature: 0.2,
      stream: false
    };
  }

  // ---------- 缓存 ----------
  const memCache = new Map();
  const cacheKey = (t) => t.replace(/\s+/g, ' ').trim();

  function getCached(t) {
    const k = cacheKey(t);
    if (memCache.has(k)) return memCache.get(k);
    try {
      const raw = localStorage.getItem('bt_' + k.slice(0, 60));
      if (raw) return JSON.parse(raw).v;
    } catch (e) {}
    return null;
  }

  function setCached(src, dst) {
    const k = cacheKey(src);
    memCache.set(k, dst);
    if (memCache.size > CFG.cacheSize) memCache.delete(memCache.keys().next().value);
    try { localStorage.setItem('bt_' + k.slice(0, 60), JSON.stringify({ v: dst })); } catch (e) {}
  }

  // ---------- 翻译 ----------
  async function translate(text) {
    const hit = getCached(text);
    if (hit) return { ok: true, text: hit, cached: true };

    const sender = hasGM ? gmRequest : (hasExt ? bgRequest : fetchRequest);

    // 先 9B，失败再退 2B
    let lastErr = null;
    for (const model of [CFG.model, CFG.fallbackModel]) {
      try {
        const { status, text: raw } = await sender(buildPayload(text, model));
        if (status === 412) {
          return { ok: false, code: 412, msg: '被 B 站网关拦下（412）' };
        }
        if (status !== 200) {
          lastErr = { code: status, msg: 'HTTP ' + status + ' ' + String(raw).slice(0, 120) };
          continue;
        }
        const json = JSON.parse(raw);
        const out = json?.choices?.[0]?.message?.content;
        if (out && out.trim()) {
          const clean = out.trim();
          setCached(text, clean);
          return { ok: true, text: clean, model };
        }
        lastErr = { code: 0, msg: '返回为空' };
      } catch (e) {
        lastErr = { code: 0, msg: String(e && e.message || e) };
      }
    }
    return { ok: false, ...(lastErr || { code: 0, msg: '未知错误' }) };
  }

  // ---------- UI（Shadow DOM 隔离） ----------
  let host, root, bubble, card, cardBody, cardMeta, cardActions;
  let currentText = '';
  let hideTimer = null;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .bubble {
      position: fixed; z-index: 2147483600;
      width: 40px; height: 40px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font: 600 15px/1 -apple-system, "PingFang SC", sans-serif;
      color: #fff; background: ${CFG.bubbleColor};
      box-shadow: 0 3px 12px rgba(0,0,0,.28);
      cursor: pointer; user-select: none;
      transform: scale(.6); opacity: 0;
      transition: transform .14s ease, opacity .14s ease;
    }
    .bubble.show { transform: scale(1); opacity: 1; }
    .bubble:active { transform: scale(.92); }

    .card {
      position: fixed; z-index: 2147483600;
      width: min(360px, calc(100vw - 24px));
      max-height: 52vh; overflow: auto;
      background: #fff; color: #1a1a1a;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.06);
      font: 15px/1.6 -apple-system, "PingFang SC", sans-serif;
      opacity: 0; transform: translateY(6px) scale(.98);
      transition: opacity .16s ease, transform .16s ease;
      -webkit-overflow-scrolling: touch;
    }
    .card.show { opacity: 1; transform: translateY(0) scale(1); }
    @media (prefers-color-scheme: dark) {
      .card { background: #1c1c1e; color: #f2f2f7; box-shadow: 0 8px 32px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08); }
    }
    .head {
      display: flex; align-items: center; gap: 6px;
      padding: 9px 12px; font-size: 12px; color: #8e8e93;
      border-bottom: 1px solid rgba(128,128,128,.18);
      position: sticky; top: 0; background: inherit;
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: ${CFG.bubbleColor}; flex: none; }
    .grow { flex: 1; }
    .x { cursor: pointer; padding: 2px 6px; border-radius: 6px; font-size: 15px; line-height: 1; color: #8e8e93; }
    .x:active { background: rgba(128,128,128,.18); }
    .body { padding: 12px 14px 14px; white-space: pre-wrap; word-break: break-word; user-select: text; }
    .body.loading { color: #8e8e93; font-style: italic; }
    .body.err { color: #ff453a; font-size: 13px; }
    .foot {
      display: flex; gap: 8px; padding: 0 14px 12px;
      font-size: 12px; color: #8e8e93;
    }
    .btn {
      padding: 5px 11px; border-radius: 8px;
      background: rgba(128,128,128,.14); cursor: pointer; user-select: none;
    }
    .btn:active { background: rgba(128,128,128,.28); }
    .src { padding: 0 14px 12px; font-size: 12px; color: #8e8e93; border-top: 1px dashed rgba(128,128,128,.2); margin-top: 2px; padding-top: 9px; white-space: pre-wrap; }
  `;

  function ensureUI() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('div');
    host.id = '__bili_translate_host__';
    host.style.cssText = 'all:initial;position:static;';
    root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = '译';
    bubble.addEventListener('click', onBubbleClick);
    root.appendChild(bubble);

    card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="head"><span class="dot"></span><span class="mtitle">翻译中…</span><span class="grow"></span><span class="x">✕</span></div>
      <div class="body loading">请求中…</div>
      <div class="foot"><span class="btn copy">复制</span><span class="btn retry">重试</span></div>
      <div class="src" style="display:none"></div>
    `;
    card.querySelector('.x').addEventListener('click', hideCard);
    card.querySelector('.copy').addEventListener('click', onCopy);
    card.querySelector('.retry').addEventListener('click', onRetry);
    root.appendChild(card);

    cardBody = card.querySelector('.body');
    cardMeta = card.querySelector('.mtitle');
    cardActions = card.querySelector('.src');

    (document.body || document.documentElement).appendChild(host);
  }

  function hideBubble() {
    if (bubble) bubble.classList.remove('show');
  }

  function hideCard() {
    if (card) card.classList.remove('show');
  }

  function place(el, x, y) {
    const w = el.offsetWidth || 40;
    const h = el.offsetHeight || 40;
    const left = Math.max(8, Math.min(x - w / 2, innerWidth - w - 8));
    const top = Math.max(8, Math.min(y - h - 8, innerHeight - h - 8));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function onBubbleClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const sel = window.getSelection();
    const text = (currentText || (sel ? sel.toString() : '')).trim();
    if (!text) return;
    hideBubble();
    showCard(text);
  }

  function showCard(srcText) {
    ensureUI();
    currentText = srcText;
    card.classList.add('show');
    cardBody.className = 'body loading';
    cardBody.textContent = '请求中…';
    cardMeta.textContent = '翻译中…';
    cardActions.style.display = 'none';

    // 定位在选区附近
    const sel = window.getSelection();
    let anchor = null;
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r && (r.width || r.height)) anchor = r;
    }
    if (anchor) {
      const w = Math.min(360, innerWidth - 24);
      card.style.left = Math.max(12, Math.min(anchor.left, innerWidth - w - 12)) + 'px';
      const below = anchor.bottom + 10;
      if (below + 180 < innerHeight) card.style.top = below + 'px';
      else card.style.top = Math.max(12, anchor.top - 200) + 'px';
      card.style.maxHeight = Math.min(innerHeight * 0.52, innerHeight - parseFloat(card.style.top) - 12) + 'px';
    } else {
      card.style.left = '12px';
      card.style.top = '80px';
    }

    doTranslate(srcText);
  }

  async function doTranslate(text) {
    const res = await translate(text);
    if (!card || !card.classList.contains('show')) return;
    if (res.ok) {
      cardBody.className = 'body';
      cardBody.textContent = res.text;
      cardMeta.textContent = (res.cached ? '缓存' : res.model || CFG.model);
      cardActions.textContent = text.length > 140 ? text.slice(0, 140) + '…' : text;
      cardActions.style.display = 'block';
    } else {
      cardBody.className = 'body err';
      if (res.code === 412) {
        cardBody.textContent =
          '被 B 站网关拦下了（412）。\n\n' +
          '原因：请求带了非 bilibili 的 Origin。\n' +
          '解决：在 Quantumult X 里启用 bili-translate 的请求头改写规则。';
      } else {
        cardBody.textContent = '翻译失败：' + (res.msg || '未知错误');
      }
      cardMeta.textContent = '出错';
    }
  }

  function onCopy(e) {
    e.stopPropagation();
    const t = cardBody.textContent || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(() => {
        const b = e.target;
        const old = b.textContent;
        b.textContent = '已复制';
        setTimeout(() => (b.textContent = old), 1200);
      }).catch(fallbackCopy);
    } else fallbackCopy();
    function fallbackCopy() {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
  }

  function onRetry(e) {
    e.stopPropagation();
    if (!currentText) return;
    // 清掉缓存再试
    try { localStorage.removeItem('bt_' + cacheKey(currentText).slice(0, 60)); } catch (_) {}
    memCache.delete(cacheKey(currentText));
    cardBody.className = 'body loading';
    cardBody.textContent = '请求中…';
    cardMeta.textContent = '翻译中…';
    doTranslate(currentText);
  }

  // ---------- 选区监听 ----------
  function pickText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    const text = sel.toString().trim();
    if (text.length < CFG.minChars || text.length > CFG.maxChars) return '';
    return text;
  }

  function isEditable(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
  }

  let lastSel = '';
  function scheduleBubble() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const text = pickText();
      if (!text) { hideBubble(); return; }
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) { hideBubble(); return; }
      if (isEditable(sel.anchorNode)) { hideBubble(); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) { hideBubble(); return; }
      currentText = text;
      ensureUI();
      place(bubble, rect.left + rect.width / 2, rect.top);
      bubble.classList.add('show');
    }, CFG.autoDelay);
  }

  const onUp = (e) => {
    // 忽略点在自家 UI 上的
    if (host && e.target && (e.target === host)) return;
    scheduleBubble();
  };
  const onSelectionChange = () => {
    const t = pickText();
    if (!t) { hideBubble(); lastSel = ''; return; }
    if (t !== lastSel) { lastSel = t; scheduleBubble(); }
  };

  document.addEventListener('mouseup', onUp, true);
  document.addEventListener('touchend', onUp, true);
  document.addEventListener('selectionchange', onSelectionChange, true);
  document.addEventListener('scroll', hideBubble, true);

  // 点空白处收起卡片
  document.addEventListener('mousedown', (e) => {
    if (!host) return;
    if (e.target === host || (e.composedPath && e.composedPath().includes(host))) return;
    // 有选区时不收卡片，避免误伤
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    hideCard();
  }, true);

  // 快捷键：Alt+T 译选中
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 't' || e.key === 'T')) {
      const t = pickText();
      if (t) { e.preventDefault(); hideBubble(); showCard(t); }
    }
    if (e.key === 'Escape') { hideCard(); hideBubble(); }
  }, true);

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureUI, { once: true });
  } else {
    ensureUI();
  }
})();
