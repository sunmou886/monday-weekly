@tailwind base;
@tailwind components;
@tailwind utilities;

/* —— Amicus 亮色主题（接近 manus.im 的清爽浅色风） —— */
:root{
  --ami-bg: #FAFAFC;         /* 页面背景 */
  --ami-surface: #FFFFFF;    /* 卡片/层 */
  --ami-border: #E6E8EC;     /* 边框 */
  --ami-text: #0B0F1A;       /* 正文 */
  --ami-subtle: #6B7280;     /* 次要文本 */
  --ami-accent: #1F6FEB;     /* 强调色（按钮等） */
}

/* Maple Mono 仅用于 ASCII（英文/数字/常用标点）；其余文字回退到无衬线栈 */
@font-face {
  font-family: 'MapleMonoAscii';
  src: url('/fonts/MapleMono/MapleMono-Regular.woff2') format('woff2'),
       url('https://cdn.jsdelivr.net/gh/subframe7536/maple-font/MapleMono/MapleMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+2000-206F;
}
@font-face {
  font-family: 'MapleMonoAscii';
  src: url('/fonts/MapleMono/MapleMono-Bold.woff2') format('woff2'),
       url('https://cdn.jsdelivr.net/gh/subframe7536/maple-font/MapleMono/MapleMono-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0000-00FF, U+2000-206F;
}

/* 全局字体栈：ASCII 用 MapleMono，其它用系统无衬线 */
:root{
  --stack-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji";
  --stack-latin-mono: "MapleMonoAscii", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
html, body, * { font-family: var(--stack-latin-mono), var(--stack-sans); }

/* 颜色 & 版面微调 */
html, body { background: var(--ami-bg); color: var(--ami-text); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
