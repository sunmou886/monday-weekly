import React, { useEffect, useMemo, useRef, useState } from "react";
const hash = String(hashRaw || "").replace(/^#/, "");
const parts = hash.split("/").filter(Boolean);
if (parts[0] === "issue" && parts[1]) return { name: "issue", params: [parts[1]] };
return { name: "home", params: [] };
}


function copy(text) {
if (!navigator?.clipboard) {
const ta = document.createElement("textarea");
ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
return;
}
navigator.clipboard.writeText(text);
}


function downloadJSON(filenameBase, data) {
const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url; a.download = `${filenameBase}.json`; a.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// --- Minimal test cases (rendered only with ?debug=1) ----------------------
function TestPanel() {
const [open, setOpen] = useState(false);
const enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
if (!enabled) return null;


const results = [];
results.push(test("parseHashFromString home", () => deepEqual(parseHashFromString(""), { name: "home", params: [] })));
results.push(test("parseHashFromString issue", () => deepEqual(parseHashFromString("#/issue/2025-08-18_2025-08-24"), { name: "issue", params: ["2025-08-18_2025-08-24"] })));
results.push(test("fmtDate basic", () => typeof fmtDate("2025-08-18") === "string" && fmtDate("2025-08-18").length > 0));
results.push(test("fmtDateTime basic", () => typeof fmtDateTime("2025-08-25T10:00:00+08:00") === "string"));
results.push(test("mergeIssues merges unique by id, remote wins", () => {
const local = [{ id: 'A', start: '2025-01-01' }, { id: 'B', start: '2025-01-02' }];
const remote = [{ id: 'B', start: '2025-02-02', marker: 'remote' }, { id: 'C', start: '2025-01-03' }];
const merged = mergeIssues(local, remote);
const ids = merged.map(x => x.id).sort().join(',');
const b = merged.find(x => x.id==='B');
return ids === 'A,B,C' && b.marker === 'remote';
}));


const okCount = results.filter(r => r.ok).length;


return (
<div className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl border border-neutral-300 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
<button onClick={() => setOpen(v => !v)} className="mb-2 w-full rounded-lg bg-black px-3 py-1.5 text-sm text-white">
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
<div className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400">Add <code>?debug=1</code> to the URL to see tests.</div>
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


// Merge helper is exported for tests
function mergeIssues(localIssues = [], remoteIssues = []) {
const map = new Map();
for (const i of localIssues) if (i?.id) map.set(i.id, i);
for (const i of remoteIssues) if (i?.id) map.set(i.id, i); // remote overwrites local on collision
return Array.from(map.values());
}
