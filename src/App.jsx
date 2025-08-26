import React, { useEffect, useMemo, useRef, useState } from "react";
<button
onClick={onImport}
className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
title="Import JSON"
>
<Upload className="h-4 w-4" /> Import / 导入
</button>
<button
onClick={() => downloadJSON(STORAGE_KEY, data)}
className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
title="Export JSON"
>
<Download className="h-4 w-4" /> Export
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
<div className="rounded-sm bg-black px-2 py-1 text-xs font-semibold tracking-widest text-white">MON</div>
{/* 品牌名保持无衬线，可按需加粗 */}
<div className="text-xl font-sans tracking-tight group-hover:opacity-80">Monday Weekly</div>
</a>
);
}


// --- Archive Page -----------------------------------------------------------
function ArchivePage({ issues, q, setQ, openIssue }) {
return (
<section className="py-8 sm:py-10">
<div className="mb-6 flex items-center justify-between">
{/* H1 无衬线 + 粗体（3rem 仅用于 Issue 页面，归档页继续常规） */}
<h1 className="text-2xl font-sans font-bold sm:text-3xl">Archive / 存档</h1>
<div className="relative">
<Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
<input
value={q}
onChange={e => setQ(e.target.value)}
placeholder="Search title or facts…"
className="w-64 rounded-full border border-neutral-300 bg-white py-2 pl-8 pr-3 text-sm outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
/>
</div>
</div>


<div className="grid gap-6 sm:grid-cols-2">
{issues.map(issue => (
<IssueCard key={issue.id} issue={issue} onClick={() => openIssue(issue.id)} />
))}
{issues.length === 0 && (
<div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
No issues match your search.
</div>
)}
</div>
</section>
);
}


function IssueCard({ issue, onClick }) {
const firstImage = issue.items?.find(i => i.image?.src)?.image?.src;
return (
<article
onClick={onClick}
className="group cursor-pointer overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
>
<div className="aspect-[16/9] w-full bg-neutral-100 dark:bg-neutral-800">
{firstImage ? (
<img src={firstImage} alt="cover" className="h-full w-full object-cover transition group-hover:scale-[1.01]" />
) : (
<div className="flex h-full w-full items-center justify-center text-neutral-400">No cover</div>
)}
</div>
<div className="space-y-2 p-5">
{/* 期标题无衬线 + 粗体 */}
<h3 className="line-clamp-2 font-sans font-bold text-lg leading-snug sm:text-xl">{issue.title || `${fmtDate(issue.start)} — ${fmtDate(issue.end)}`}</h3>
<div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
<span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {fmtDate(issue.start)} — {fmtDate(issue.end)}</span>
{issue.publishedAt && (
<span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {fmtDateTime(issue.publishedAt)}</span>
)}
</div>
{(issue.summaryCN || issue.summaryEN) && (
<p className="line-clamp-2 text-[15px] text-neutral-700 dark:text-neutral-300">
<span>{issue.summaryCN || ""}</span>
{issue.summaryEN && (
<>
<span className="mx-2 text-neutral-400">/</span>
<span className="italic font-serif text-[13px] text-neutral-600 dark:text-neutral-400">{issue.summaryEN}</span>
}
