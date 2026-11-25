/* popup.js — 设置页逻辑 */
const api = (typeof browser !== "undefined" && browser.runtime) ? browser : chrome;

const DEFAULT_CFG = {
  endpoint: "https://index-translate.bilibili.com/v1/chat/completions",
  model: "Index-Translate-9B",
  proxy: "",
};

const $ = (id) => document.getElementById(id);
const hint = $("hint");

function say(msg, cls) {
  hint.textContent = msg;
  hint.className = cls || "";
}

async function load() {
  const cfg = await api.storage.local.get(DEFAULT_CFG);
  $("model").value = cfg.model || DEFAULT_CFG.model;
  $("endpoint").value = cfg.endpoint || DEFAULT_CFG.endpoint;
  $("proxy").value = cfg.proxy || "";
}

async function save() {
  const cfg = {
    model: $("model").value,
    endpoint: $("endpoint").value.trim() || DEFAULT_CFG.endpoint,
    proxy: $("proxy").value.trim(),
  };
  await api.storage.local.set(cfg);
  say("已保存", "ok");
  setTimeout(() => say(""), 1500);
}

async function test() {
  say("请求中…");
  const url = ($("proxy").value.trim() || $("endpoint").value.trim() || DEFAULT_CFG.endpoint);
  const model = $("model").value;
  try {
    const t0 = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "You translate text. Output only the translation.\n- Chinese -> English\n- Any other language -> Simplified Chinese\n\n服务器在中午被重启了。" }],
        max_tokens: 80,
        temperature: 0.2,
      }),
    });
    const raw = await res.text();
    const ms = Date.now() - t0;
    if (res.status === 412) {
      say(`412 被网关拦下 — 需要填中转地址`, "bad");
      return;
    }
    if (res.status !== 200) {
      say(`HTTP ${res.status} — ${raw.slice(0, 60)}`, "bad");
      return;
    }
    const out = JSON.parse(raw)?.choices?.[0]?.message?.content || "";
    say(`✓ ${ms}ms  ${out.slice(0, 42)}`, "ok");
  } catch (e) {
    say("失败：" + (e.message || e), "bad");
  }
}

$("save").addEventListener("click", save);
$("test").addEventListener("click", test);
load();
