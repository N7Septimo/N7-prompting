export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") return text("N7 Promoting Sheet API: /prompts /random /status");
    if (url.pathname === "/prompts") return listPrompts(env);
    if (url.pathname === "/random") return randomPrompt(env);
    if (url.pathname === "/status") return status(env);
    return json({ error: "Not Found" }, 404);
  },
  async scheduled(event, env, ctx) {
    const now = new Date().toISOString();
    await env.PROMPTS_KV.put("last_update", now);
  }
};

function text(s, status=200){return new Response(s,{status,headers:{"content-type":"text/plain"}})}
function json(obj,status=200){return new Response(JSON.stringify(obj,null,2),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})}

async function getCatalog(env){
  const cached = await env.PROMPTS_KV.get("catalog","json");
  if (cached) return cached;
  await env.PROMPTS_KV.put("catalog", JSON.stringify(SEED));
  return SEED;
}
async function listPrompts(env){const d=await getCatalog(env);return json({title:env.N7_TITLE,total:count(d),data:d})}
async function randomPrompt(env){const d=await getCatalog(env);const flat=flatten(d);return json({title:env.N7_TITLE,...flat[Math.floor(Math.random()*flat.length)]})}
async function status(env){const last=await env.PROMPTS_KV.get("last_update");const d=await getCatalog(env);return json({title:env.N7_TITLE,last_update:last||null,categories:Object.keys(d),total:count(d)})}

function flatten(d){const out=[];for(const [cat,items] of Object.entries(d)){for(const p of items){out.push({category:cat,prompt:p.prompt,notes:p.notes||null,tags:p.tags||[]})}}return out}
function count(d){return Object.values(d).reduce((n,a)=>n+a.length,0)}

const SEED={
  "Tech Automation":[
    {prompt:"Act as an AWS DevOps engineer. Write a Python 3.11 Lambda that pulls Rules.conf from S3, validates sections, deduplicates domains, and writes the optimized file back to S3 with versioning. Output only the final code.",tags:["aws","lambda","s3","shadowrocket"],notes:"Add IAM least-privilege and CloudWatch metrics."},
    {prompt:"As a Cloudflare Worker specialist, harden this Worker that serves KV-backed config. Add input validation, ETag support, and consistent cache headers. Output only the final JS.",tags:["cloudflare","workers","security"]},
    {prompt:"Create a GitHub Actions workflow that builds and pushes a Docker image to ECR, then updates an ECS service with zero downtime. Include OIDC auth; no long-lived AWS keys.",tags:["github-actions","ecr","ecs","oidc"]}
  ],
  "iOS / Scriptable":[
    {prompt:"Build a Scriptable widget that fetches https://example.com/status, shows config title, last update time, and connection state. If unreachable, show a subtle warning icon.",tags:["ios","scriptable","widget"],notes:"Keep minimal and legible."},
    {prompt:"Create a Shortcuts-friendly plaintext generator for a supportive text with 1 emoji, avoiding 'morning', and saving to a specified file path.",tags:["shortcuts","textgen"]}
  ],
  "Network & Security":[
    {prompt:"Audit this AWS Security Group set for a WireGuard host. Recommend least-privilege inbound rules, logging, and IPv6 considerations, then output a secure baseline template.",tags:["wireguard","security","aws"]},
    {prompt:"Generate a Shadowrocket rules.conf that prefers DIRECT for Apple/CDN/auth endpoints, proxies only when needed, and separates Auto vs Manual sections for safe rollback.",tags:["shadowrocket","routing"]}
  ],
  "Docs & Compliance":[
    {prompt:"Draft a README using DFSG and CC BY-SA 3.0 disclosure blocks, with standard badges and a security contact section. Keep it vendor-neutral and reproducible.",tags:["docs","dfsg","cc-by-sa"],notes:"Uniform disclosure layout across repos."},
    {prompt:"Summarize LinkedIn post content into actionable bullet points for an IT/NetOps audience. Include one-sentence takeaway and a follow-up experiment to try today.",tags:["linkedin","summary"]}
  ],
  "Relationship / EQ":[
    {prompt:"Write a short, hopeful text to my spouse using our private tone, 1 emoji, no 'morning', inviting a tiny plan today (10–15 minutes) without pressure.",tags:["support","micro-plan"]}
  ]
};
