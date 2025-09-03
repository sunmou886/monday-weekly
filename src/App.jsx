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
 * Monday Weekly (light-only, variable-colored)
 * - Archive + Issue reader (hash routing)
 * - Light mode only (no dark classes / no system toggle)
 * - All colors via CSS variables (see :root in index.css)
 * - Weekly cover: issue.cover.src (if provided) > derived > Unsplash
 * - Item image: item.image.src > first link og/twitter image > Unsplash
 * - Image lazy-load with skeleton; error -> hide (no broken icon)
 * - English lines use MapleMono via global CSS; slightly lighter color
 * - Share button; Import/Export only visible for admin (?key=VITE_ADMIN_KEY)
 */

const STORAGE_KEY = "monday.weekly.data.v1";
const IMG_CACHE_KEY = "mw.img.cache.v3";

// ---------- Utilities ----------
async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** Month & day only, e.g., "Aug 18" */
function fmtMonthDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-SG", { month: "short", day: "2-digit" });
}

/** classNames helper */
function cx(...xs) {
  return xs.filter(Boolean).join(" ");
}

/** Force Light Mode (remove any .dark and keep it off) */
function useLightModeOnly() {
  useEffect(() => {
    const root = document.documentElement;
    const strip = () => root.classList.remove("dark");
    strip();
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    try {
      mql.addEventListener("change", strip);
      return () => mql.removeEventListener("change", strip);
    } catch {
      mql.addListener?.(strip);
      return () => mql.removeListener?.(strip);
    }
  }, []);
}

/** Admin gate via ?key=... (matches VITE_ADMIN_KEY) or ?admin=1 if no env key */
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

// ---------- Image helpers (prefer article images; avoid logos; fallback Unsplash) ----------
function domainFromUrl(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function toAbsoluteUrl(maybe, baseUrl) {
  if (!maybe) return "";
  if (/^https?:\/\//i.test(maybe)) return maybe;
  if (maybe.startsWith("//")) return "https:" + maybe;
  try {
    const base = new URL(baseUrl);
    return new URL(maybe, `${base.protocol}//${base.host}`).toString();
  } catch {
    return maybe;
  }
}
function toJinaProxy(url) {
  try {
    const u = new URL(url);
    return `https://r.jina.ai/${u.protocol}//${u.host}${u.pathname}${u.search}`;
  } catch {
    return "";
  }
}
function randomUnsplash(w = 1600, h = 900) {
  const sig = Math.floor(Math.random() * 1e9);
  return `https://source.unsplash.com/random/${w}x${h}/?wallpapers&sig=${sig}`;
}
function loadImgCache() {
  try {
    return JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveImgCache(map) {
  try {
    localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(map));
  } catch {}
}

function isBadExt(u) {
  return /\.svg(\?|$)/i.test(u) || /\.gif(\?|$)/i.test(u);
}
function isLogoish(u) {
  const s = (u || "").toLowerCase();
  return /(logo|favicon|icon|sprite|wordmark|lockup|brandmark|badge|avatar|mark)/.test(s);
}
function goodExt(u) {
  return /\.(jpe?g|png|webp|avif)(\?|$)/i.test(u);
}
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

async function resolveArticleImage(url) {
  const proxy = toJinaProxy(url);
  if (!proxy) return "";
  const res = await fetch(proxy, { cache: "no-store" });
  if (!res.ok) return "";

  const html = await res.text();
  const abs = (u) => toAbsoluteUrl(u, url);

  const metaRe =
    /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

  const set = new Set();
  for (const m of html.matchAll(metaRe)) {
    if (m[1]) set.add(abs(m[1]));
  }
  for (const m of html.matchAll(imgRe)) {
    if (m[1]) set.add(abs(m[1]));
  }

  const candidates = [...set].filter(Boolean).filter((u) => !isBadExt(u)).filter((u) => !isLogoish(u));
  if (!candidates.length) return "";
  candidates.sort((a, b) => scoreImage(b) - scoreImage(a));
  if (scoreImage(candidates[0]) < 1) return "";
  return candidates[0];
}

/** Final per-item resolver: explicit non-logo -> article image -> Unsplash */
function useResolvedImage(item) {
  const firstUrl = Array.isArray(item?.links) && item.links.length ? item.links[0].url : "";

  const initial = () => {
    const s = item?.image?.src || "";
    if (s && !isLogoish(s) && !isBadExt(s)) {
      return { src: s, href: firstUrl || item?.image?.href || s };
    }
    return { src: "", href: firstUrl || "" };
  };

  const [img, setImg] = useState(initial);

  useEffect(() => {
    if (img.src) return;

    // No link -> Unsplash
    if (!firstUrl) {
      setImg({
        src: randomUnsplash(1200, 800),
        href: "https://unsplash.com/t/wallpapers",
      });
      return;
    }

    // Cache hit
    const cache = loadImgCache();
    if (cache[firstUrl]) {
      setImg({ src: cache[firstUrl], href: firstUrl });
      return;
    }

    let alive = true;
    (async () => {
      try {
        const s = await resolveArticleImage(firstUrl);
        if (!alive) return;
        if (s) {
          const next = { src: s, href: firstUrl };
          const nextCache = loadImgCache();
          nextCache[firstUrl] = s;
          saveImgCache(nextCache);
          setImg(next);
          return;
        }
      } catch {}
      if (alive) {
        setImg({
          src: randomUnsplash(1200, 800),
          href: "https://unsplash.com/t/wallpapers",
        });
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstUrl, item?.image?.src]);

  return img;
}

// ---------- Bootstrap content ----------
const bootstrapData = {
  issues: [
    {
      id: "2025-08-18_2025-08-24",
      start: "2025-08-18",
      end: "2025-08-24",
      title: "2025-08-18 至 2025-08-24 周报 / Weekly",
      summaryCN: "本周经严核的科技/IT大事件精选。",
      summaryEN: "Verified, cross-sourced tech/IT developments for the week.",
      items: [],
      // 可自定义周封面（图片/动图/视频首帧图）：只要给 src 即可
      // cover: { src: "/01.gif" },
    },
  ],
};

// ---------- Root ----------
export default function MondayWeekly() {
  useEffect(() => { document.title = "Amicus"; }, []);

  useLightModeOnly();

  const [data, setData] = useLocalData(bootstrapData);
  const [q, setQ] = useState("");
  const { route, params, go } = useHashRouter();
  const [showImporter, setShowImporter] = useState(false);
  const isAdmin = useAdmin();

  // Load remote content:
  // A) /content/index.json has {issues:[...]} -> merge
  // B) or {files:[...]} -> fetch each /content/<file>.json and merge
  useEffect(() => {
    (async () => {
      try {
        const idx = await fetchJSON("/content/index.json");
        if (idx && Array.isArray(idx.issues)) {
          setData((prev) => ({ issues: mergeIssues(prev?.issues || [], idx.issues) }));
          return;
        }
        if (idx && Array.isArray(idx.files) && idx.files.length) {
          const urls = idx.files.map((name) => `/content/${name}`);
          const payloads = await Promise.all(urls.map((u) => fetchJSON(u).catch(() => null)));
          const mergedIssues = [];
          for (const p of payloads) if (p?.issues?.length) mergedIssues.push(...p.issues);
          if (mergedIssues.length) {
            setData((prev) => ({ issues: mergeIssues(prev?.issues || [], mergedIssues) }));
          }
        }
      } catch {
        // no index.json or parse failed
      }
    })();
  }, [setData]);

  // On-demand load single weekly file when visiting direct permalink
  useEffect(() => {
    if (route !== "issue") return;
    const id = params?.[0];
    if (!id) return;
    const exists = (data?.issues || []).some((i) => i.id === id);
    if (exists) return;
    (async () => {
      try {
        const p = await fetchJSON(`/content/${id}.json`);
        if (p?.issues?.length) setData((prev) => ({ issues: mergeIssues(prev?.issues || [], p.issues) }));
      } catch {}
    })();
  }, [route, params, data, setData]);

  // Derived
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
    <div className="min-h-screen bg-[var(--ami-bg)] text-[var(--ami-text)]">
      <Header onImport={() => setShowImporter(true)} data={data} isAdmin={isAdmin} />

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

// Header with Share button（品牌：Amicus，Logo 用 Lily Script One）
function Header({ onImport, data, setData, isAdmin }) {
  const handleShare = async () => {
    try {
      const url = window.location.href;
      const title = document.title || "Amicus";
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
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* 左侧品牌（内联 Logo） */}
        <a href="#/" className="group inline-flex items-center gap-3">
         
          {/* 文字 Logo：Amicus（Lily Script One） */}
          <div className="logo-script text-2xl tracking-tight group-hover:opacity-80">
            Amicus
          </div>
        </a>

        {/* 右侧按钮 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
            title="分享"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4m0 0L8 6m4-4v14"/></svg>
            分享
          </button>

          {isAdmin && (
            <>
              <button
                onClick={onImport}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                title="导入 JSON"
              >
                导入
              </button>
              <button
                onClick={() => downloadJSON("monday.weekly.data.v1", data)}
                className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                title="导出 JSON"
              >
                导出
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}


// ---------- Archive ----------
function ArchivePage({ issues, q, setQ, openIssue }) {
  return (
    <section className="py-8 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-sans font-bold sm:text-3xl">存档</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--ami-muted-2)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题或事实…"
            className="w-64 rounded-full border border-[var(--ami-border)] bg-[var(--ami-surface)] py-2 pl-8 pr-3 text-sm outline-none ring-0 placeholder:text-[var(--ami-muted-2)] focus:border-[var(--ami-text-strong)]"
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {issues.map((issue) => (
          <IssueCard key={issue.id} issue={issue} onClick={() => openIssue(issue.id)} />
        ))}
        {issues.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--ami-border)] p-10 text-center text-[var(--ami-subtle)]">
            没有匹配的周报。
          </div>
        )}
      </div>
    </section>
  );
}

function IssueCard({ issue, onClick }) {
  // Weekly cover: explicit > derived > Unsplash
  const firstItem = issue.items?.[0] || {};
  const derived = useResolvedImage(firstItem);
  const cover = issue?.cover?.src || derived.src || randomUnsplash(1280, 720);

  return (
    <article
      onClick={onClick}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-[var(--ami-border)] bg-[var(--ami-surface)] transition hover:shadow-md"
    >
      <div className="aspect-[16/9] w-full bg-[var(--ami-bg-soft-1)]">
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
          <div className="flex h-full w-full items-center justify-center text-[var(--ami-muted-3)]">No cover</div>
        )}
      </div>
      <div className="space-y-2 p-5">
        <h3 className="line-clamp-2 font-sans font-bold text-lg leading-snug sm:text-xl">
          {issue.title || `${fmtMonthDay(issue.start)} — ${fmtMonthDay(issue.end)}`}
        </h3>
        {/* Only show month-day; remove time row */}
        <div className="flex items-center gap-3 text-xs text-[var(--ami-subtle)]">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> {fmtMonthDay(issue.start)} — {fmtMonthDay(issue.end)}
          </span>
        </div>
        {(issue.summaryCN || issue.summaryEN) && (
          <p className="line-clamp-2 text-[15px] text-[var(--ami-text-strong)]">
            <span>{issue.summaryCN || ""}</span>
            {issue.summaryEN && (
              <>
                <span className="mx-2 text-[var(--ami-muted-2)]">/</span>
                <span className="text-[13px] text-[var(--ami-muted-1)]">{issue.summaryEN}</span>
              </>
            )}
          </p>
        )}
        <div className="pt-2 text-sm text-[var(--ami-subtle)]">{issue.items?.length || 0} items</div>
      </div>
    </article>
  );
}

// ---------- Issue Page ----------
function IssuePage({ issue, onBack }) {
  return (
    <article className="py-8 sm:py-10">
      <button
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--ami-subtle)] hover:text-[var(--ami-text-strong)]"
      >
        <ChevronLeft className="h-4 w-4" /> 返回
      </button>

      <header className="mx-auto max-w-3xl">
        <h1 className="mb-3 font-sans font-bold leading-tight text-[3rem]">
          {issue.title || `${fmtMonthDay(issue.start)} — ${fmtMonthDay(issue.end)} Weekly`}
        </h1>
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-[var(--ami-subtle)]">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-4 w-4" /> {fmtMonthDay(issue.start)} — {fmtMonthDay(issue.end)}
          </span>
        </div>
        {issue.summaryCN && (
          <p className="mb-8 text-[17px] leading-7 text-[var(--ami-text)]">
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
          <div className="my-24 rounded-2xl border border-dashed border-[var(--ami-border)] p-8 text-center text-[var(--ami-subtle)]">
            暂无条目。使用「导入」添加本周内容。
          </div>
        )}
      </div>
    </article>
  );
}

function ItemBlock({ item, idx, isLast }) {
  // resolve image for item
  const resolved = useResolvedImage(item);
  const [loaded, setLoaded] = useState(false);
  const firstHref = (Array.isArray(item.links) && item.links[0]?.url) || resolved.href || "#";

  return (
    <section className="space-y-5 sm:space-y-6 py-2">
      {/* Title (1.8rem) */}
      <h2 className="font-sans font-bold leading-snug text-[1.8rem]">
        <span className="mr-2 text-[var(--ami-muted-4)]">{String(idx).padStart(2, "0")}</span>
        {item.title}
      </h2>

      {/* Facts */}
      <div className="space-y-2">
        {Array.isArray(item.factsCN) &&
          item.factsCN.map((s, i) => (
            <p key={`cn-${i}`} className="text-[16px] leading-7 text-[var(--ami-text)]">
              {s}
            </p>
          ))}
        {Array.isArray(item.factsEN) &&
          item.factsEN.map((s, i) => (
            <p key={`en-${i}`} className="text-[16px] leading-7 text-[var(--ami-muted-1)]">
              {s}
            </p>
          ))}
      </div>

      {/* Key info */}
      {item.keyInfo && <KeyInfoRow info={item.keyInfo} />}

      {/* Image with skeleton, object-cover, click -> first source link */}
      {resolved.src && (
        <figure className="overflow-hidden rounded-2xl border border-[var(--ami-border)] bg-[var(--ami-bg-soft-1)]">
          <a href={firstHref} target="_blank" rel="noreferrer" className="block">
            {/* skeleton */}
            {!loaded && <div className="ami-skeleton h-[240px] sm:h-[320px]"></div>}
            <img
              src={resolved.src}
              alt={item.image?.alt || "image"}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={(e) => {
                if (!e.currentTarget.dataset.fallback) {
                  e.currentTarget.dataset.fallback = "1";
                  e.currentTarget.src = randomUnsplash(1200, 800);
                } else {
                  e.currentTarget.style.display = "none";
                }
              }}
              className={cx(
                "w-full object-cover",
                // keep height consistent with skeleton; image will fill container
                "h-[240px] sm:h-[320px]",
                loaded ? "block" : "hidden"
              )}
            />
          </a>
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
              className="inline-flex items-center gap-1 rounded-full border border-[var(--ami-border)] px-3 py-1 text-xs hover:bg-[var(--ami-bg-soft-2)]"
            >
              <LinkIcon className="h-3.5 w-3.5" /> {l.label || "Link"}
            </a>
          ))}
        </div>
      )}

      {/* Why it matters */}
      {(item.whyCN || item.whyEN) && (
        <div className="rounded-xl bg-[var(--ami-bg-soft-2)] p-4 text-[15px] text-[var(--ami-text)]">
          <div className="font-sans font-bold">这为什么重要 / Why it matters</div>
          {item.whyCN && <p className="mt-1 text-[15px]">{item.whyCN}</p>}
          {item.whyEN && <p className="text-[15px] text-[var(--ami-muted-1)]">{item.whyEN}</p>}
        </div>
      )}

      {/* Divider */}
      {!isLast && (
        <div className="py-12">
          <hr className="border-[var(--ami-border)]" />
        </div>
      )}
    </section>
  );
}

function KeyInfoRow({ info }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--ami-bg-soft-2)] px-3 py-2 text-xs text-[var(--ami-text-strong)]">
      {info.timeSGT && <Badge icon={<Clock className="h-3.5 w-3.5" />} label={`时间：${info.timeSGT}`} />}
      {info.actor && <Badge icon={<Info className="h-3.5 w-3.5" />} label={`主体：${info.actor}`} />}
      {info.market && <Badge icon={<Globe className="h-3.5 w-3.5" />} label={`地区/市场：${info.market}`} />}
      {info.impact && <Badge icon={<Info className="h-3.5 w-3.5" />} label={`影响：${info.impact}`} />}
    </div>
  );
}
function Badge({ icon, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ami-border)] bg-[var(--ami-surface)] px-2.5 py-1">
      {icon}
      <span>{label}</span>
    </span>
  );
}

// ---------- Importer ----------
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
      // 注意反斜杠相关 JSON 转义
      const hasBackslash = new RegExp('\\\\[^"\\\\/bfnrtu]').test(text);
      const hint = hasBackslash ? " 提示：检查反斜杠（使用 \\\\ 或合法的 \\uXXXX 转义）。" : "";
      setError((e?.message || "解析失败") + hint);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div ref={dialogRef} className="w-full max-w-3xl rounded-2xl bg-[var(--ami-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-sans font-bold">导入周报数据（JSON）</h3>
          <button
            onClick={close}
            className="rounded-full border border-[var(--ami-border)] px-2 py-1 text-xs hover:bg-[var(--ami-bg-soft-2)]"
          >
            关闭
          </button>
        </div>
        <p className="mb-3 text-sm text-[var(--ami-subtle)]">粘贴符合数据结构的 JSON；相同 id 的周报会被替换。</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={IMPORT_PLACEHOLDER}
          className="h-64 w-full resize-y rounded-xl border border-[var(--ami-border)] bg-[var(--ami-bg-soft-2)] p-3 font-mono text-xs focus:border-[var(--ami-text-strong)]"
        />
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-full border border-[var(--ami-border)] px-3 py-1.5 text-sm hover:bg-[var(--ami-bg-soft-2)]"
          >
            取消
          </button>
          <button onClick={handleImport} className="rounded-full bg-black px-3 py-1.5 text-sm text-white hover:bg-[#111]">
            导入
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Footer ----------
function Footer() {
  return (
    <footer className="border-t border-[var(--ami-border)] py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
  © {new Date().getFullYear()} Amicus
</div>
        <div className="text-xs text-[var(--ami-subtle)]">一周热点，周一见</div>
      </div>
    </footer>
  );
}

// ---------- Hooks & helpers ----------
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

function downloadJSON(filenameBase, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mergeIssues(localIssues = [], remoteIssues = []) {
  const map = new Map();
  for (const i of localIssues) if (i?.id) map.set(i.id, i);
  for (const i of remoteIssues) if (i?.id) map.set(i.id, i); // remote overwrites local
  return Array.from(map.values());
}

// ---------- Tiny tests (opt-in via ?debug=1) ----------
function TestPanel() {
  const [open, setOpen] = useState(false);
  const enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
  if (!enabled) return null;

  const results = [];
  results.push(test("parseHashFromString home", () => deepEq(parseHashFromString(""), { name: "home", params: [] })));
  results.push(
    test("parseHashFromString issue", () =>
      deepEq(parseHashFromString("#/issue/2025-08-18_2025-08-24"), { name: "issue", params: ["2025-08-18_2025-08-24"] })
    )
  );
  results.push(test("fmtMonthDay basic", () => typeof fmtMonthDay("2025-08-18") === "string" && fmtMonthDay("2025-08-18").length > 0));
  results.push(
    test("mergeIssues remote wins", () => {
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
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl border border-[var(--ami-border)] bg-[var(--ami-surface)] p-3 shadow-lg">
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
      <div className="mt-2 text-[10px] text-[var(--ami-subtle)]">
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
function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
