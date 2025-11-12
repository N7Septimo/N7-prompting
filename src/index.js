export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Minimal HTML UI
    if (url.pathname === "/ui") return uiPage(env);

    if (url.pathname === "/") return text("N7 Prompting Sheet API: /prompts /random /status /ui");
    if (url.pathname === "/prompts") return listPrompts(env);
    if (url.pathname === "/random") {
      const tag = url.searchParams.get("tag");
      return randomPrompt(env, tag); // supports ?tag=aws
    }
    if (url.pathname === "/status") return status(env);
    return json({ error: "Not Found" }, 404);
  },

  async scheduled(event, env, ctx) {
    const now = new Date().toISOString();
    await env.PROMPTS_KV.put("last_update", now);
  }
};

function text(s, status = 200) {
  return new Response(s, { status, headers: { "content-type": "text/plain" } });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

async function getCatalog(env) {
  const cached = await env.PROMPTS_KV.get("catalog", "json");
  if (cached) return cached;
  await env.PROMPTS_KV.put("catalog", JSON.stringify(SEED));
  return SEED;
}
async function listPrompts(env) {
  const d = await getCatalog(env);
  return json({ title: env.N7_TITLE, total: count(d), data: d });
}
async function status(env) {
  const last = await env.PROMPTS_KV.get("last_update");
  const d = await getCatalog(env);
  return json({
    title: env.N7_TITLE,
    last_update: last || null,
    categories: Object.keys(d),
    total: count(d)
  });
}
function flatten(d) {
  const out = [];
  for (const [cat, items] of Object.entries(d)) {
    for (const p of items) {
      out.push({ category: cat, prompt: p.prompt, notes: p.notes || null, tags: p.tags || [] });
    }
  }
  return out;
}
function count(d) {
  return Object.values(d).reduce((n, a) => n + a.length, 0);
}

// ---- UI ----
function html(body, title = "N7 Promoting Sheet") {
  return new Response(
`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root{--pad:16px;--rad:12px;--fg:#111;--muted:#666;--bg:#fff;--card:#f5f5f7}
body{margin:0;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg)}
header{padding:var(--pad);font-weight:700;font-size:18px}
main{padding:var(--pad);display:grid;gap:12px}
.card{background:var(--card);border-radius:var(--rad);padding:14px 16px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
button,select{border-radius:10px;border:0;padding:10px 12px;background:#111;color:#fff;font-weight:600}
button.ghost{background:transparent;color:#111;border:1px solid #111}
code{background:#000;color:#0f0;padding:8px;border-radius:10px;display:block;white-space:pre-wrap}
.muted{color:var(--muted);font-size:12px}
.pill{padding:4px 8px;border-radius:999px;background:#111;color:#fff;font-size:12px}
.grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
</style>
<header> N7 Promoting Sheet</header>
<main>
  <div class="card">
    <div class="row">
      <button id="btn-random">Random</button>
      <select id="tag-select"><option value="">All tags</option></select>
      <button class="ghost" id="btn-copy">Copy</button>
    </div>
    <div id="out" style="margin-top:10px;"><div class="muted">Tap Random to fetch a prompt.</div></div>
  </div>

  <div class="card" id="status"><div class="muted">Status loading…</div></div>

  <div class="card">
    <div class="muted">Categories</div>
    <div id="cats" class="grid"></div>
  </div>
</main>
<script>
const W = location.origin;

async function loadStatus(){
  const res = await fetch(W + '/status'); const j = await res.json();
  document.getElementById('status').innerHTML =
    '<div><b>'+j.title+'</b></div>'+
    '<div class="muted">Total: '+j.total+' • Updated: '+(j.last_update||'—')+'</div>';
}
async function loadTags(){
  const res = await fetch(W + '/prompts'); const j = await res.json();
  const all = new Set();
  for (const items of Object.values(j.data)) for (const p of items) (p.tags||[]).forEach(t=>all.add(t));
  const sel = document.getElementById('tag-select'); [...all].sort().forEach(t=>{
    const o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o);
  });
  const cats = document.getElementById('cats');
  cats.innerHTML = Object.keys(j.data).map(c=>'<span class="pill">'+c+'</span>').join(' ');
}
async function random(tag){
  const url = new URL(W + '/random'); if (tag) url.searchParams.set('tag', tag);
  const res = await fetch(url); const j = await res.json();
  const out = document.getElementById('out');
  out.innerHTML =
    '<div class="pill" style="margin-bottom:8px;">'+(j.category||'prompt')+'</div>'+
    '<code>'+escapeHtml(j.prompt||JSON.stringify(j))+'</code>'+
    (j.tags?'<div class="muted">#'+j.tags.join(' #')+'</div>':'');
  out.dataset.text = j.prompt || '';
}
function escapeHtml(s){return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\'':'&#39;' }[m]))}

document.getElementById('btn-random').onclick = ()=>random(document.getElementById('tag-select').value);
document.getElementById('btn-copy').onclick = async ()=>{
  const t = document.getElementById('out').dataset.text || '';
  try { await navigator.clipboard.writeText(t); alert('Copied'); } catch { prompt('Copy', t); }
};

loadStatus(); loadTags();
</script>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}
async function uiPage(env) { return html('', env.N7_TITLE || 'N7 Promoting Sheet'); }

// randomPrompt with optional tag filter
async function randomPrompt(env, tag) {
  const d = await getCatalog(env);
  let flat = flatten(d);
  if (tag) flat = flat.filter(p => (p.tags || []).includes(tag));
  if (!flat.length) return json({ error: "No prompts for that tag" }, 404);
  const pick = flat[Math.floor(Math.random() * flat.length)];
  return json({ title: env.N7_TITLE, ...pick });
}

// ---- Seed & catalog ----
const SEED = {
  "Tech Automation": [
    { "prompt": "Act as an AWS DevOps engineer. Write a Python 3.11 Lambda that pulls Rules.conf from S3, validates sections, deduplicates domains, and writes the optimized file back to S3 with versioning. Output only the final code.", "tags": ["aws","lambda","s3","shadowrocket"], "notes": "Add IAM least-privilege and CloudWatch metrics." },
    { "prompt": "As a Cloudflare Worker specialist, harden this Worker that serves KV-backed config. Add input validation, ETag support, and consistent cache headers. Output only the final JS.", "tags": ["cloudflare","workers","security"] },
    { "prompt": "Create a GitHub Actions workflow that builds and pushes a Docker image to ECR, then updates an ECS service with zero downtime. Include OIDC auth; no long-lived AWS keys.", "tags": ["github-actions","ecr","ecs","oidc"] }
  ],
  "iOS / Scriptable": [
    { "prompt": "Build a Scriptable widget that fetches https://example.com/status, shows config title, last update time, and connection state. If unreachable, show a subtle warning icon.", "tags": ["ios","scriptable","widget"], "notes": "Keep minimal and legible." },
    { "prompt": "Create a Shortcuts-friendly plaintext generator for a supportive text with 1 emoji, avoiding 'morning', and saving to a specified file path.", "tags": ["shortcuts","textgen"] }
  ],
  "Network & Security": [
    { "prompt": "Audit this AWS Security Group set for a WireGuard host. Recommend least-privilege inbound rules, logging, and IPv6 considerations, then output a secure baseline template.", "tags": ["wireguard","security","aws"] },
    { "prompt": "Generate a Shadowrocket rules.conf that prefers DIRECT for Apple/CDN/auth endpoints, proxies only when needed, and separates Auto vs Manual sections for safe rollback.", "tags": ["shadowrocket","routing"] }
  ],
  "Docs & Compliance": [
    { "prompt": "Draft a README using DFSG and CC BY-SA 3.0 disclosure blocks, with standard badges and a security contact section. Keep it vendor-neutral and reproducible.", "tags": ["docs","dfsg","cc-by-sa"], "notes": "Uniform disclosure layout across repos." },
    { "prompt": "Summarize LinkedIn post content into actionable bullet points for an IT/NetOps audience. Include one-sentence takeaway and a follow-up experiment to try today.", "tags": ["linkedin","summary"] }
  ],
  "Relationship / EQ": [
    { "prompt": "Write a short, hopeful text to my spouse using our private tone, 1 emoji, no 'morning', inviting a tiny plan today (10–15 minutes) without pressure.", "tags": ["support","micro-plan"] }
  ]
};
