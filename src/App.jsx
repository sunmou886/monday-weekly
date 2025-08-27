import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Clock,
  Link as LinkIcon,
  Share2,
  Upload,
  Download,
  Search,
  ChevronLeft,
  ExternalLink,
  Globe,
  Info,
} from "lucide-react";

/**
 * Monday Weekly — Medium-style archive & post page (single-file React app)
 * - Archive + issue reader (hash routing)
 * - 正文（每条新闻）保持中英双语；其余 UI 文案为中文
 * - EN/ASCII font handled globally via CSS (Maple Mono)
 * - System theme only (no manual toggle)
 * - Header 右侧为“分享”；导入/导出仅管理员可见
 * - 图片：懒加载；抓取失败则不显示（无破图标）
 */

const STORAGE_KEY = "monday.weekly.data.v1";
const THEME_KEY = "mw.theme"; // 'system' | 'light' | 'dark'

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Format YYYY-MM-DD → Mon DD, YYYY (may still be used in titles) */
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "2-digit" });
}

/** Full datetime (kept for potential use) */
function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  });
}

/** Month & day only, e.g., "Aug 18" */
function fmtMonthDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-SG", { month: "short", day: "2-digit" });
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}
// ===== Image resolving helpers (prefer article images, avoid logos; fallback Unsplash) =====
const IMG_CACHE_KEY = "mw.img.cache.v2";

function domainFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function toAbsoluteUrl(maybe, baseUrl) {
  if (!maybe) return "";
  if (/^https?:\/\//i.test(maybe)) return maybe;
  if (maybe.startsWith("//")) return "https:" + maybe;
  try {
    const base = new URL(baseUrl);
    return new URL(maybe, `${base.protocol}//${base.host}`).toString();
  } catch { return maybe; }
}
function toJinaProxy(url) {
  try {
    const u = new URL(url);
    return `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`;
  } catch { return ""; }
}
function randomUnsplash(w = 1600, h = 900) {
  const sig = Math.floor(Math.random() * 1e9);
  return `https://source.unsplash.com/random/${w}x${h}/?wallpapers&sig=${sig}`;
}
function loadImgCache() {
  try { return JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveImgCache(map) {
  try { localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(map)); } catch {}
}

// filters & scoring to avoid logos/icons
function isBadExt(u) { return /\.svg(\?|$)/i.test(u) || /\.gif(\?|$)/i.test(u); }
function isLogoish(u) {
  const s = (u || "").toLowerCase();
  return /(logo|favicon|icon|sprite|wordmark|lockup|brandmark|badge|avatar|mark)/.test(s);
}
function goodExt(u) { return /\.(jpe?g|png|webp|avif)(\?|$)/i.test(u); }
function scoreImage(u) {
  const s = (u || "").toLowerCase();
  let sc = 0;
  if (/(hero|featured|feature|article|banner|news|press|upload|uploads|media|images|photo|screenshot|figure|cover)/.test(s)) sc += 10;
  if (goodExt(s)) sc += 5;
  if (/(1200|1600|2048|1080|w=12|w=16|w=20)/.test(s)) sc += 2;
  if (isLogoish(s)) sc -= 20;
  if (isBadExt(s)) sc -= 10;
  return sc;
}

// parse article page for og/twitter images, then <img> tags, score & pick
async function resolveArticleImage(url) {
  const proxy = toJinaProxy(url);
  if (!proxy) return "";
  const res = await fetch(proxy, { cache: "no-store" });
  if (!res.ok) return "";

  const html = await res.text();
  const abs = (u) => toAbsoluteUrl(u, url);

  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  const imgRe  = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  const set = new Set();
  for (const m of html.matchAll(metaRe)) { if (m[1]) set.add(abs(m[1])); }
  for (const m of html.matchAll(imgRe))  { if (m[1]) set.add(abs(m[1])); }

  const candidates = [...set]
    .filter(u => !!u)
    .filter(u => !isBadExt(u))
    .filter(u => !isLogoish(u));

  if (!candidates.length) return "";

  candidates.sort((a, b) => scoreImage(b) - scoreImage(a));
  if (scoreImage(candidates[0]) < 1) return "";
  return candidates[0];
}

// final resolver per item: explicit non-logo -> article image -> Unsplash
function useResolvedImage(item) {
  const firstUrl = Array.isArray(item?.links) && item.links.length ? item.links[0].url : "";

  const initial = () => {
    const s = item?.image?.src || "";
    if (s && !isLogoish(s) && !isBadExt(s)) {
      return { src: s, caption: item.image.caption || "", credit: item.image.credit || "", href: item.image.href || s };
    }
    return { src: "", caption: "", credit: "", href: firstUrl || "" };
  };

  const [img, setImg] = React.useState(initial);

  React.useEffect(() => {
    if (img.src) return;

    if (!firstUrl) {
      setImg({
        src: randomUnsplash(1200, 800),
        caption: "Unsplash Wallpapers (random)",
        credit: "Unsplash",
        href: "https://unsplash.com/t/wallpapers"
      });
      return;
    }

    const cache = loadImgCache();
    if (cache[firstUrl]) {
      setImg({ src: cache[firstUrl], caption: domainFromUrl(firstUrl), credit: "OG", href: firstUrl });
      return;
    }

    let alive = true;
    (async () => {
      try {
        const s = await resolveArticleImage(firstUrl);
        if (!alive) return;
        if (s) {
          const next = { src: s, caption: domainFromUrl(firstUrl), credit: "OG", href: firstUrl };
          const nextCache = loadImgCache(); nextCache[firstUrl] = s; saveImgCache(nextCache);
          setImg(next);
          return;
        }
      } catch { /* ignore */ }

      if (alive) {
        setImg({
          src: randomUnsplash(1200, 800),
          caption: "Unsplash Wallpapers (random)",
          credit: "Unsplash",
          href: "https://unsplash.com/t/wallpapers"
        });
      }
    })();

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstUrl, item?.image?.src]);

  return img;
}
// ===== Image resolving helpers end =====


// ===== Image resolving helpers (prefer article images, avoid logos; fallback Unsplash) =====
const IMG_CACHE_KEY = "mw.img.cache.v2";

function domainFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function toAbsoluteUrl(maybe, baseUrl) {
  if (!maybe) return "";
  if (/^https?:\/\//i.test(maybe)) return maybe;
  if (maybe.startsWith("//")) return "https:" + maybe;
  try {
    const base = new URL(baseUrl);
    return new URL(maybe, `${base.protocol}//${base.host}`).toString();
  } catch { return maybe; }
}
function toJinaProxy(url) {
  try {
    const u = new URL(url);
    return `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`;
  } catch { return ""; }
}
function randomUnsplash(w = 1600, h = 900) {
  const sig = Math.floor(Math.random() * 1e9);
  return `https://source.unsplash.com/random/${w}x${h}/?wallpapers&sig=${sig}`;
}
function loadImgCache() {
  try { return JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveImgCache(map) {
  try { localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(map)); } catch {}
}

// filters & scoring to avoid logos/icons
function isBadExt(u) { return /\.svg(\?|$)/i.test(u) || /\.gif(\?|$)/i.test(u); }
function isLogoish(u) {
  const s = (u || "").toLowerCase();
  return /(logo|favicon|icon|sprite|wordmark|lockup|brandmark|badge|avatar|mark)/.test(s);
}
function goodExt(u) { return /\.(jpe?g|png|webp|avif)(\?|$)/i.test(u); }
function scoreImage(u) {
  const s = (u || "").toLowerCase();
  let sc = 0;
  if (/(hero|featured|feature|article|banner|news|press|upload|uploads|media|images|photo|screenshot|figure|cover)/.test(s)) sc += 10;
  if (goodExt(s)) sc += 5;
  if (/(1200|1600|2048|1080|w=12|w=16|w=20)/.test(s)) sc += 2;
  if (isLogoish(s)) sc -= 20;
  if (isBadExt(s)) sc -= 10;
  return sc;
}

// parse article page for og/twitter images, then <img> tags, score & pick
async function resolveArticleImage(url) {
  const proxy = toJinaProxy(url);
  if (!proxy) return "";
  const res = await fetch(proxy, { cache: "no-store" });
  if (!res.ok) return "";

  const html = await res.text();
  const abs = (u) => toAbsoluteUrl(u, url);

  const metaRe = /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  const imgRe  = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  const set = new Set();
  for (const m of html.matchAll(metaRe)) { if (m[1]) set.add(abs(m[1])); }
  for (const m of html.matchAll(imgRe))  { if (m[1]) set.add(abs(m[1])); }

  const candidates = [...set]
    .filter(u => !!u)
    .filter(u => !isBadExt(u))
    .filter(u => !isLogoish(u));

  if (!candidates.length) return "";

  candidates.sort((a, b) => scoreImage(b) - scoreImage(a));
  if (scoreImage(candidates[0]) < 1) return "";
  return candidates[0];
}

// final resolver per item: explicit non-logo -> article image -> Unsplash
function useResolvedImage(item) {
  const firstUrl = Array.isArray(item?.links) && item.links.length ? item.links[0].url : "";

  const initial = () => {
    const s = item?.image?.src || "";
    if (s && !isLogoish(s) && !isBadExt(s)) {
      return { src: s, caption: item.image.caption || "", credit: item.image.credit || "", href: item.image.href || s };
    }
    return { src: "", caption: "", credit: "", href: firstUrl || "" };
  };

  const [img, setImg] = React.useState(initial);

  React.useEffect(() => {
    if (img.src) return;

    if (!firstUrl) {
      setImg({
        src: randomUnsplash(1200, 800),
        caption: "Unsplash Wallpapers (random)",
        credit: "Unsplash",
        href: "https://unsplash.com/t/wallpapers"
      });
      return;
    }

    const cache = loadImgCache();
    if (cache[firstUrl]) {
      setImg({ src: cache[firstUrl], caption: domainFromUrl(firstUrl), credit: "OG", href: firstUrl });
      return;
    }

    let alive = true;
    (async () => {
      try {
        const s = await resolveArticleImage(firstUrl);
        if (!alive) return;
        if (s) {
          const next = { src: s, caption: domainFromUrl(firstUrl), credit: "OG", href: firstUrl };
          const nextCache = loadImgCache(); nextCache[firstUrl] = s; saveImgCache(nextCache);
          setImg(next);
          return;
        }
      } catch { /* ignore */ }

      if (alive) {
        setImg({
          src: randomUnsplash(1200, 800),
          caption: "Unsplash Wallpapers (random)",
          credit: "Unsplash",
          href: "https://unsplash.com/t/wallpapers"
        });
      }
    })();

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstUrl, item?.image?.src]);

  return img;
}
// ===== Image resolving helpers end =====


// Theme helpers --------------------------------------------------------------

// Theme (system only)
function applyTheme(theme) {
  const root = document.documentElement;
  const preferDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && preferDark);
  root.classList.toggle("dark", !!isDark);
}
function useSystemThemeOnly() {
  useEffect(() => {
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {}
    applyTheme("system");
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
}

// Admin gate via ?key=... (matches VITE_ADMIN_KEY) or ?admin=1 when no env key
function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return localStorage.getItem("mw.admin") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlKey = params.get("key") || "";
      const enableFlag = params.get("admin") === "1";
      const envKey = (import.meta?.env?.VITE_ADMIN_KEY || "").trim();
      const ok = envKey ? urlKey === envKey : enableFlag;
      if (ok) {
        setIsAdmin(true);
        try {
          localStorage.setItem("mw.admin", "1");
        } catch {}
      }
    } catch {}
  }, []);
  return isAdmin;
}

// Bootstrap content
const bootstrapData = {
  issues: [
    {
      id: "2025-08-18_2025-08-24",
      start: "2025-08-18",
      end: "2025-08-24",
      publishedAt: "2025-08-25T10:00:00+08:00",
      title: "2025-08-18 至 2025-08-24 周报 / Weekly",
      summaryCN: "本周经严核的科技/IT大事件精选。",
      summaryEN: "Verified, cross-sourced tech/IT developments for the week.",
      items: [],
    },
  ],
};

export default function MondayWeekly() {
  const [data, setData] = useLocalData(bootstrapData);
  const [q, setQ] = useState("");
  const { route, params, go } = useHashRouter();
  const [showImporter, setShowImporter] = useState(false);
  const isAdmin = useAdmin();
  useSystemThemeOnly();

  // Merge remote /content/index.json if present
  // Load remote content:
// 1) If /content/index.json has {issues:[...]}, merge directly (old mode).
// 2) If it has {files:[...]}, fetch each /content/<file>.json and merge (weekly files).
useEffect(() => {
  (async () => {
    try {
      const idx = await fetchJSON('/content/index.json');

      // 模式 A：聚合
      if (idx && Array.isArray(idx.issues)) {
        setData(prev => ({ issues: mergeIssues(prev?.issues || [], idx.issues) }));
        return;
      }

      // 模式 B：清单
      if (idx && Array.isArray(idx.files) && idx.files.length) {
        const urls = idx.files.map(name => `/content/${name}`);
        const payloads = await Promise.all(
          urls.map(u => fetchJSON(u).catch(() => null))
        );
        const mergedIssues = [];
        for (const p of payloads) {
          if (p && Array.isArray(p.issues)) mergedIssues.push(...p.issues);
        }
        if (mergedIssues.length) {
          setData(prev => ({ issues: mergeIssues(prev?.issues || [], mergedIssues) }));
        }
      }
    } catch {
      // 没有 index.json 或解析失败，忽略
    }
  })();
}, []);

// 追加：当用户直接访问 #/issue/<id> 且本地还没该周数据时，按需加载 /content/<id>.json
useEffect(() => {
  if (route !== 'issue') return;
  const id = params?.[0];
  if (!id) return;

  // 已经有这条就不用再拉
  const exists = (data?.issues || []).some(i => i.id === id);
  if (exists) return;

  (async () => {
    try {
      const payload = await fetchJSON(`/content/${id}.json`);
      if (payload?.issues?.length) {
        setData(prev => ({ issues: mergeIssues(prev?.issues || [], payload.issues) }));
      }
    } catch {
      // 单周文件不存在/解析失败，静默忽略即可
    }
  })();
}, [route, params, data, setData]);

  const issuesSorted = useMemo(
    () => [...(data?.issues || [])].sort((a, b) => new Date(b.start) - new Date(a.start)),
    [data]
  );
  const currentIssue = useMemo(() => {
    if (route !== "issue") return null;
    const id = params?.[0];
    return issuesSorted.find((i) => i.id === id) || null;
  }, [route, params, issuesSorted]);

  const filteredIssues = useMemo(() => {
    if (!q) return issuesSorted;
    const t = q.toLowerCase();
    return issuesSorted.filter(
      (issue) =>
        issue.title?.toLowerCase().includes(t) ||
        issue.items?.some(
          (item) =>
            item.title?.toLowerCase().includes(t) ||
            item.factsEN?.join(" ").toLowerCase().includes(t) ||
            item.factsCN?.join(" ").toLowerCase().includes(t)
        )
    );
  }, [q, issuesSorted]);

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Header
        onImport={() => setShowImporter(true)}
        data={data}
        setData={setData}
        isAdmin={isAdmin}
      />

      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        {route === "issue" && currentIssue ? (
          <IssuePage issue={currentIssue} onBack={() => go("/")} />
        ) : (
          <ArchivePage issues={filteredIssues} q={q} setQ={setQ} openIssue={(id) => go(`/issue/${id}`)} />
        )}
      </main>

      {showImporter && isAdmin && (
        <Importer
          close={() => setShowImporter(false)}
          onImport={(payload) => {
            if (!payload?.issues) return;
            setData((prev) => {
              const existing = new Map((prev?.issues || []).map((i) => [i.id, i]));
              for (const issue of payload.issues) existing.set(issue.id, issue);
              return { issues: [...existing.values()] };
            });
          }}
        />
      )}

      <Footer />
      <TestPanel />
    </div>
  );
}

// Header with Share button (中文)
function Header({ onImport, data, setData, isAdmin }) {
  const handleShare = async () => {
    try {
      const url = window.location.href;
      const title = document.title || "Monday Weekly";
      const text = "精选且可核验的科技/IT 周报";
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert("链接已复制到剪贴板");
      }
    } catch {}
  };
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Logo />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
            title="分享"
          >
            <Share2 className="h-4 w-4" /> 分享
          </button>
          {isAdmin && (
            <>
              <button
                onClick={onImport}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
                title="导入 JSON"
              >
                <Upload className="h-4 w-4" /> 导入
              </button>
              <button
                onClick={() => downloadJSON(STORAGE_KEY, data)}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
                title="导出 JSON"
              >
                <Download className="h-4 w-4" /> 导出
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <a href="#/" className="group inline-flex items-center gap-2">
      <div className="rounded-sm bg-black px-2 py-1 text-xs font-semibold tracking-widest text-white">
        MON
      </div>
      <div className="text-xl font-sans tracking-tight group-hover:opacity-80">Monday Weekly</div>
    </a>
  );
}

// Archive（中文 UI）
function ArchivePage({ issues, q, setQ, openIssue }) {
  return (
    <section className="py-8 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-sans font-bold sm:text-3xl">存档</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题或事实…"
            className="w-64 rounded-full border border-neutral-300 bg-white py-2 pl-8 pr-3 text-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} onClick={() => openIssue(issue.id)} />
        ))}
        {issues.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            没有匹配的周报。
          </div>
        )}
      </div>
    </section>
  );
}

// ===== BEGIN: REPLACE IssueCard =====
function IssueCard({ issue, onClick }) {
  // 取第一条 item 来解析封面（简化请求量）
  const firstItem = issue.items?.[0] || {};
  const coverObj = useResolvedImage(firstItem);
  const cover = coverObj.src || randomUnsplash(1280, 720);

  return (
    <article
      onClick={onClick}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="aspect-[16/9] w-full bg-neutral-100 dark:bg-neutral-800">
        {cover ? (
          <img
            src={cover}
            alt="cover"
            loading="lazy"
            onError={(e) => {
              if (!e.currentTarget.dataset.fallback) {
                e.currentTarget.dataset.fallback = "1";
                e.currentTarget.src = randomUnsplash(1280, 720);
              } else {
                e.currentTarget.style.display = "none";
              }
            }}
            className="h-full w-full object-cover transition group-hover:scale-[1.01]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">No cover</div>
        )}
      </div>
      <div className="space-y-2 p-5">
        <h3 className="line-clamp-2 font-sans font-bold text-lg leading-snug sm:text-xl">
          {issue.title || `${fmtDate(issue.start)} — ${fmtDate(issue.end)}`}
        </h3>
        <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> {fmtDate(issue.start)} — {fmtDate(issue.end)}
          </span>
        </div>
        {(issue.summaryCN || issue.summaryEN) && (
          <p className="line-clamp-2 text-[15px] text-neutral-700 dark:text-neutral-300">
            <span>{issue.summaryCN || ""}</span>
            {issue.summaryEN && (
              <>
                <span className="mx-2 text-neutral-400">/</span>
                <span className="text-[13px] text-neutral-600 dark:text-neutral-400">{issue.summaryEN}</span>
              </>
            )}
          </p>
        )}
        <div className="pt-2 text-sm text-neutral-500 dark:text-neutral-400">{issue.items?.length || 0} items</div>
      </div>
    </article>
  );
}

// ===== END: REPLACE IssueCard =====


// 封面图：懒加载 + 失败回退到占位；不显示破图标
function CardCover({ src }) {
  const [ok, setOk] = useState(!!src);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setOk(!!src);
    setLoaded(false);
  }, [src]);

  if (!src || !ok) {
    return (
      <div className="flex h-full w-full items-center justify-center text-neutral-400">
        暂无封面
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="cover"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => setOk(false)}
      className={classNames(
        "h-full w-full object-cover transition group-hover:scale-[1.01]",
        loaded ? "block" : "hidden"
      )}
    />
  );
}

// Issue page（中文 UI；正文保持双语）
function IssuePage({ issue, onBack }) {
  return (
    <article className="py-8 sm:py-10">
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <ChevronLeft className="h-4 w-4" /> 返回
      </button>

      <header className="mx-auto max-w-3xl">
        {/* Weekly main title: 3rem */}
        <h1 className="mb-3 font-sans font-bold leading-tight text-[3rem]">
          {issue.title || `${fmtDate(issue.start)} — ${fmtDate(issue.end)} Weekly`}
        </h1>
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-4 w-4" /> {fmtMonthDay(issue.start)} — {fmtMonthDay(issue.end)}
          </span>
        </div>
        {issue.summaryCN && (
          <p className="mb-8 text-[17px] leading-7 text-neutral-800 dark:text-neutral-200">
            <span>{issue.summaryCN}</span>
          </p>
        )}
      </header>

      <div className="mx-auto max-w-3xl">
        {issue.items?.length ? (
          issue.items.map((item, idx) => (
            <ItemBlock key={idx} item={item} idx={idx + 1} isLast={idx === issue.items.length - 1} />
          ))
        ) : (
          <div className="my-24 rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            暂无条目。使用「导入」添加本周内容。
          </div>
        )}
      </div>
    </article>
  );
}

// ===== BEGIN: FIXED ItemBlock =====
function ItemBlock({ item, idx, isLast }) {
  // resolve image: item.image -> og:image of first link -> Unsplash
  const img = useResolvedImage(item);

  return (
    <section className="space-y-5 sm:space-y-6 py-2">
      {/* Title */}
      <h2 className="font-sans font-bold text-2xl leading-snug">
        <span className="mr-2 text-neutral-400">{String(idx).padStart(2, "0")}</span>
        {item.title}
      </h2>

      {/* Facts */}
      <div className="space-y-2">
        {Array.isArray(item.factsCN) &&
          item.factsCN.map((s, i) => (
            <p key={`cn-${i}`} className="text-[16px] leading-7 text-neutral-900 dark:text-neutral-100">
              {s}
            </p>
          ))}
        {Array.isArray(item.factsEN) &&
          item.factsEN.map((s, i) => (
            <p key={`en-${i}`} className="text-[16px] leading-7 text-neutral-900 dark:text-neutral-100">
              {s}
            </p>
          ))}
      </div>

      {/* Key info */}
      {item.keyInfo && <KeyInfoRow info={item.keyInfo} />}

      {/* Image: contain, max height 380; lazy; onError -> Unsplash once then hide */}
      {img.src && (
        <figure className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800">
          <a href={img.href || img.src} target="_blank" rel="noreferrer" className="block">
            <div className="w-full flex items-center justify-center">
              <img
                src={img.src}
                alt={item.image?.alt || "image"}
                loading="lazy"
                onError={(e) => {
                  if (!e.currentTarget.dataset.fallback) {
                    e.currentTarget.dataset.fallback = "1";
                    e.currentTarget.src = randomUnsplash(1200, 800);
                  } else {
                    e.currentTarget.style.display = "none";
                  }
                }}
                className="max-h-[380px] max-w-full w-auto h-auto object-contain"
              />
            </div>
          </a>
          {(img.caption || img.credit) && (
            <figcaption className="flex items-center justify-between gap-3 bg-neutral-50 px-4 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
              <span className="truncate">{img.caption}</span>
              {img.href && (
                <a
                  className="shrink-0 items-center gap-1 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                  href={img.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {img.credit} <ExternalLink className="ml-1 inline h-3.5 w-3.5" />
                </a>
              )}
            </figcaption>
          )}
        </figure>
      )}

      {/* Links / Citations */}
      {Array.isArray(item.links) && item.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
            >
              <LinkIcon className="h-3.5 w-3.5" /> {l.label || "Link"}
            </a>
          ))}
        </div>
      )}

      {/* Why it matters */}
      {(item.whyCN || item.whyEN) && (
        <div className="rounded-xl bg-neutral-50 p-4 text-[15px] text-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
          <div className="font-sans font-bold">这为什么重要 / Why it matters</div>
          {item.whyCN && <p className="mt-1 text-[15px]">{item.whyCN}</p>}
          {item.whyEN && <p className="text-[15px]">{item.whyEN}</p>}
        </div>
      )}

      {/* Divider */}
      {!isLast && (
        <div className="py-12">
          <hr className="border-neutral-200 dark:border-neutral-800" />
        </div>
      )}
    </section>
  );
}
// ===== END: FIXED ItemBlock =====


// 正文图片：懒加载；加载前隐藏；失败则整体不渲染
function ItemImage({ image }) {
  const src = image?.src;
  const href = image?.href || src;
  const [ok, setOk] = useState(!!src);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOk(!!src);
    setLoaded(false);
  }, [src]);

  if (!src || !ok) return null;

  return (
    <figure className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
      <a href={href} target="_blank" rel="noreferrer">
        <img
          src={src}
          alt={image?.alt || "image"}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setOk(false)}
          className={loaded ? "w-full object-cover" : "hidden"}
        />
      </a>
      {loaded && (image?.caption || image?.credit) && (
        <figcaption className="flex items-center justify-between gap-3 bg-neutral-50 px-4 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
          <span className="truncate">{image.caption}</span>
          {href && (
            <a
              className="shrink-0 items-center gap-1 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {image.credit} <ExternalLink className="ml-1 inline h-3.5 w-3.5" />
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}

function KeyInfoRow({ info }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
      {info.timeSGT && <Badge icon={<Clock className="h-3.5 w-3.5" />} label={`时间：${info.timeSGT}`} />}
      {info.actor && <Badge icon={<Info className="h-3.5 w-3.5" />} label={`主体：${info.actor}`} />}
      {info.market && <Badge icon={<Globe className="h-3.5 w-3.5" />} label={`地区/市场：${info.market}`} />}
      {info.impact && <Badge icon={<Info className="h-3.5 w-3.5" />} label={`影响：${info.impact}`} />}
    </div>
  );
}
function Badge({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 dark:border-neutral-700 dark:bg-neutral-900">
      {icon}
      <span>{label}</span>
    </span>
  );
}

// Importer（中文 UI）
function Importer({ close, onImport }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const IMPORT_PLACEHOLDER = `{
  "issues": [ { ... } ]
}`;

  const handleImport = () => {
    setError("");
    try {
      const payload = JSON.parse(text);
      if (!payload || !Array.isArray(payload.issues)) throw new Error("缺少 issues 数组");
      for (const issue of payload.issues) {
        if (!issue.id) throw new Error("每个 issue 需要 id (YYYY-MM-DD_YYYY-MM-DD)");
      }
      onImport(payload);
      close();
    } catch (e) {
      const hasBackslash = /\\[^"\\/bfnrtu]/.test(text);
      const hint = hasBackslash ? " 提示：检查反斜杠（使用 \\ 或合法的 \\uXXXX 转义）。" : "";
      setError(e.message + hint);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={dialogRef} className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-sans font-bold">导入周报数据（JSON）</h3>
          <button
            onClick={close}
            className="rounded-full border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            关闭
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          粘贴符合数据结构的 JSON；相同 id 的周报会被替换。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={IMPORT_PLACEHOLDER}
          className="h-64 w-full resize-y rounded-xl border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        {error && <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            onClick={handleImport}
            className="rounded-full bg-black px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
          >
            导入
          </button>
        </div>
      </div>
    </div>
  );
}

// Footer（中文）
function Footer() {
  return (
    <footer className="border-t border-neutral-200 py-8 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          © {new Date().getFullYear()} Monday
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          一周热点，周一见
        </div>
      </div>
    </footer>
  );
}

// Hooks & helpers
function useLocalData(initial) {
  const [state, setState] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);
  return [state, setState];
}

function useHashRouter() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (to) => {
    window.location.hash = `#${to.replace(/^#/, "")}`;
  };
  return { route: route.name, params: route.params, go };
}
function parseHash() {
  return parseHashFromString(window.location.hash);
}
function parseHashFromString(hashRaw) {
  const hash = String(hashRaw || "").replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "issue" && parts[1]) return { name: "issue", params: [parts[1]] };
  return { name: "home", params: [] };
}

function copy(text) {
  if (!navigator?.clipboard) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return;
  }
  navigator.clipboard.writeText(text);
}
function downloadJSON(filenameBase, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Tests (opt-in via ?debug=1)
function TestPanel() {
  const [open, setOpen] = useState(false);
  const enabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";
  if (!enabled) return null;

  const results = [];
  results.push(
    test("parseHashFromString home", () => deepEqual(parseHashFromString(""), { name: "home", params: [] }))
  );
  results.push(
    test("parseHashFromString issue", () =>
      deepEqual(parseHashFromString("#/issue/2025-08-18_2025-08-24"), {
        name: "issue",
        params: ["2025-08-18_2025-08-24"],
      })
    )
  );
  results.push(
    test(
      "fmtDate basic",
      () => typeof fmtDate("2025-08-18") === "string" && fmtDate("2025-08-18").length > 0
    )
  );
  results.push(test("fmtDateTime basic", () => typeof fmtDateTime("2025-08-25T10:00:00+08:00") === "string"));
  results.push(
    test("mergeIssues merges unique by id, remote wins", () => {
      const local = [
        { id: "A", start: "2025-01-01" },
        { id: "B", start: "2025-01-02" },
      ];
      const remote = [
        { id: "B", start: "2025-02-02", marker: "remote" },
        { id: "C", start: "2025-01-03" },
      ];
      const merged = mergeIssues(local, remote);
      const ids = merged.map((x) => x.id).sort().join(",");
      const b = merged.find((x) => x.id === "B");
      return ids === "A,B,C" && b.marker === "remote";
    })
  );

  const okCount = results.filter((r) => r.ok).length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl border border-neutral-300 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      <button onClick={() => setOpen((v) => !v)} className="mb-2 w-full rounded-lg bg-black px-3 py-1.5 text-sm text-white">
        Tests ({okCount}/{results.length}) {open ? "▲" : "▼"}
      </button>
      {open && (
        <ul className="space-y-1 text-xs">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "text-green-700" : "text-red-700"}>
              {r.ok ? "✓" : "✗"} {r.name} {r.ok ? "" : `— ${r.msg}`}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400">
        在网址后追加 <code>?debug=1</code> 可查看测试结果。
      </div>
    </div>
  );
}
function test(name, fn) {
  try {
    const r = fn();
    return { name, ok: !!r, msg: r ? "" : "returned falsy" };
  } catch (e) {
    return { name, ok: false, msg: e?.message || String(e) };
  }
}
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function mergeIssues(localIssues = [], remoteIssues = []) {
  const map = new Map();
  for (const i of localIssues) if (i?.id) map.set(i.id, i);
  for (const i of remoteIssues) if (i?.id) map.set(i.id, i); // remote overwrites local
  return Array.from(map.values());
}
