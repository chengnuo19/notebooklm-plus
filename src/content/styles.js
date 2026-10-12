// src/content/styles.js
// 注入 Shadow DOM 的样式(全部 nblm- 前缀,与 NotebookLM 完全隔离)。
(function () {
  const NS = (window.NBLMPlus = window.NBLMPlus || {});
  NS.styles = {
    shadowCss: `
:host, *, *::before, *::after { box-sizing: border-box; }

:host {
  --brand-grad: linear-gradient(135deg, hsl(28, 35%, 42%), hsl(20, 25%, 28%));
  --brand-hover: linear-gradient(135deg, hsl(28, 35%, 47%), hsl(20, 25%, 33%));
  --font-sans: 'Inter', 'Google Sans', Roboto, system-ui, -apple-system, sans-serif;
}

.nblm-toolbar {
  position: fixed; right: 18px; bottom: 18px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
  font-family: var(--font-sans);
  z-index: 2147483000;
}
.nblm-actions {
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom right;
}
.nblm-actions[hidden] {
  display: none;
  opacity: 0;
  transform: scale(0.9) translateY(10px);
}
.nblm-fab {
  width: 48px; height: 48px; border-radius: 50%; border: none;
  background: var(--brand-grad); color: #fff; font-weight: 600; font-size: 13.5px;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(140, 110, 90, 0.35), inset 0 1px 0 rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.nblm-fab:hover {
  background: var(--brand-hover);
  transform: scale(1.08) translateY(-2px);
  box-shadow: 0 12px 24px rgba(140, 110, 90, 0.45), inset 0 1px 0 rgba(255,255,255,0.25);
}
.nblm-fab.dragging {
  cursor: move;
  transform: scale(0.95);
  opacity: 0.85;
}
.nblm-pill {
  border: none; border-radius: 24px; padding: 10px 18px; cursor: pointer;
  background: rgba(255, 255, 255, 0.88); color: #1e293b; font-size: 13.5px; font-weight: 600;
  box-shadow: 0 4px 14px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.02);
  display: flex; gap: 8px; align-items: center;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid rgba(0,0,0,0.04);
}
.nblm-pill:hover {
  background: #fff; transform: translateY(-2px) scale(1.02);
  box-shadow: 0 10px 20px -5px rgba(140, 110, 90, 0.15), 0 4px 8px rgba(0,0,0,0.04);
  border-color: rgba(140, 110, 90, 0.2);
}
.nblm-pill svg {
  width: 15px; height: 15px; stroke: currentColor; fill: none;
  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}

.nblm-overlay {
  position: fixed; inset: 0; z-index: 2147483600;
  display: flex; align-items: center; justify-content: center;
}
.nblm-overlay[hidden] { display: none; }
.nblm-backdrop {
  position: absolute; inset: 0;
  background: rgba(15, 23, 42, 0.3);
  backdrop-filter: blur(4px);
  transition: all 0.3s ease;
}
.nblm-overlay-content { position: relative; z-index: 1; }
.nblm-card {
  position: relative; background: rgba(255, 255, 255, 0.85); color: #0f172a;
  border-radius: 16px; width: min(560px, 92vw); max-height: 86vh;
  display: flex; flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  overflow: hidden; font-family: var(--font-sans);
}
.nblm-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.4);
}
.nblm-card-title { font-size: 16px; font-weight: 700; color: #1e293b; }
.nblm-x {
  border: none; background: none; font-size: 22px; line-height: 1;
  cursor: pointer; color: #64748b; padding: 0 4px;
  transition: color 0.2s ease;
}
.nblm-x:hover { color: #0f172a; }
.nblm-card-body { padding: 20px; overflow: auto; }
.nblm-card-foot {
  padding: 14px 20px; border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex; justify-content: flex-end; gap: 10px;
  background: rgba(255, 255, 255, 0.4);
}

.nblm-row { margin-bottom: 16px; }
.nblm-label { display: block; font-size: 12.5px; font-weight: 600; color: #64748b; margin-bottom: 8px; }
.nblm-input, .nblm-select, .nblm-textarea {
  width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 12px;
  font-size: 13.5px; color: #0f172a; background: rgba(255, 255, 255, 0.7);
  font-family: inherit; transition: all 0.2s ease;
}
.nblm-input:focus, .nblm-select:focus, .nblm-textarea:focus {
  background: #fff; border-color: hsl(28, 35%, 33%);
  box-shadow: 0 0 0 3px rgba(140, 110, 90, 0.18); outline: none;
}
.nblm-textarea { min-height: 96px; resize: vertical; }
.nblm-inline { display: flex; gap: 12px; }
.nblm-inline > * { flex: 1; }
.nblm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.nblm-chip {
  border: 1px solid #e2e8f0; border-radius: 20px; padding: 6px 14px;
  font-size: 12.5px; font-weight: 550; cursor: pointer;
  background: rgba(255, 255, 255, 0.6); color: #475569;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.nblm-chip:hover {
  background: rgba(255, 255, 255, 0.9);
  border-color: #cbd5e1;
  transform: translateY(-1px);
}
.nblm-chip[aria-pressed="true"] {
  background: var(--brand-grad); border-color: transparent; color: #fff;
  box-shadow: 0 4px 12px rgba(140, 110, 90, 0.25);
}
.nblm-btn {
  border: none; border-radius: 10px; padding: 9px 18px;
  font-size: 13.5px; font-weight: 600; cursor: pointer;
  background: #f1f5f9; color: #334155;
  transition: all 0.2s ease;
}
.nblm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
  filter: brightness(0.98);
}
.nblm-btn.primary {
  background: var(--brand-grad); color: #fff;
  box-shadow: 0 4px 10px rgba(140, 110, 90, 0.2);
}
.nblm-btn.primary:hover {
  background: var(--brand-hover);
  box-shadow: 0 6px 14px rgba(140, 110, 90, 0.3);
}
.nblm-hint { font-size: 12px; color: #64748b; margin-top: 8px; line-height: 1.6; }

.nblm-q-stem { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 18px; line-height: 1.6; }
.nblm-q-opt {
  display: block; width: 100%; text-align: left; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
  background: rgba(255,255,255,0.7); cursor: pointer; font-size: 14.5px;
  color: #334155; transition: all 0.2s ease;
}
.nblm-q-opt:hover {
  background: #fff; border-color: #cbd5e1;
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.02);
}
.nblm-q-opt[data-state="picked"] { border-color: hsl(28, 35%, 45%); background: hsl(28, 40%, 97%); color: hsl(28, 35%, 33%); }
.nblm-q-opt[data-state="correct"] { border-color: #d97706; background: #fffbeb; color: #b45309; font-weight: 600; }
.nblm-q-opt[data-state="wrong"] { border-color: #ef4444; background: #fef2f2; color: #b91c1c; }
.nblm-progress { font-size: 12.5px; font-weight: 600; color: #64748b; }
.nblm-empty { text-align: center; color: #64748b; padding: 32px 0; font-size: 13.5px; line-height: 1.6; }
.nblm-math { font-family: "Cambria Math", "Latin Modern Math", serif; font-size: 1.05em; font-style: italic; }

.nblm-explain-wrap { border-top: 1px dashed rgba(0,0,0,0.1); margin-top: 16px; padding-top: 8px; }
.nblm-explain-content { margin-top: 10px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 8px; font-size: 13px; line-height: 1.6; color: #334155; }

.nblm-list-item {
  border: 1px solid rgba(0, 0, 0, 0.05); border-radius: 12px; padding: 12px 14px; margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.5); transition: all 0.2s ease;
}
.nblm-list-item:hover {
  border-color: rgba(140, 110, 90, 0.2);
  background: #fff;
  transform: translateY(-1px);
  box-shadow: 0 6px 15px rgba(0,0,0,0.03);
}
.nblm-list-item .t { font-size: 13.5px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
.nblm-list-item .m { font-size: 12px; color: #64748b; line-height: 1.4; }

.nblm-toast {
  position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.9); color: #fff; padding: 12px 20px;
  border-radius: 10px; font-size: 13px; font-weight: 600;
  box-shadow: 0 10px 25px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  z-index: 2147483647; opacity: 0; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: none; backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.08);
}
.nblm-toast.show { opacity: 1; transform: translateX(-50%) translateY(-5px); }
.nblm-toast.interactive { pointer-events: auto; cursor: pointer; }
.nblm-toast.interactive:hover { background: rgba(30, 41, 59, 0.95); }

.nblm-answer-export {
  border: none; background: rgba(140,110,90,0.08); color: hsl(28, 35%, 33%); cursor: pointer;
  border-radius: 6px; padding: 4px 10px; font-size: 12px; font-weight: 600;
  margin: 6px 0; display: inline-flex; gap: 4px; align-items: center;
  font-family: var(--font-sans); transition: all 0.2s ease;
}
.nblm-answer-export:hover {
  background: rgba(140,110,90,0.15);
  transform: translateY(-1px);
}

.nblm-review-preview {
  max-height: 60vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.92);
  color: #1e293b;
}

.nblm-review-report {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  font-size: 14px;
  line-height: 1.75;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.nblm-review-report h1 {
  margin: 0 0 20px;
  font-size: 22px;
  line-height: 1.3;
  color: #0f172a;
}

.nblm-review-report h2 {
  margin: 24px 0 10px;
  font-size: 16px;
  line-height: 1.4;
  color: #334155;
}

.nblm-review-report p {
  margin: 0 0 12px;
}

.nblm-review-list,
.nblm-review-actions,
.nblm-review-warning ul {
  margin: 8px 0 0;
  padding-left: 22px;
}

.nblm-review-list li,
.nblm-review-actions li {
  margin: 8px 0;
}

.nblm-review-meta,
.nblm-review-evidence {
  color: #64748b;
  font-size: 12.5px;
}

.nblm-review-spec {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
}

.nblm-review-spec dt {
  font-weight: 700;
  color: #475569;
}

.nblm-review-spec dd {
  min-width: 0;
  margin: 0;
}

.nblm-review-warning {
  margin-top: 24px;
  padding: 14px 16px;
  border: 1px solid #f59e0b;
  border-radius: 10px;
  background: #fffbeb;
  color: #92400e;
}

@media (prefers-color-scheme: dark) {
  .nblm-pill {
    background: rgba(30, 41, 59, 0.85); color: #cbd5e1;
    border-color: rgba(255,255,255,0.05);
  }
  .nblm-pill:hover {
    background: rgba(30, 41, 59, 0.95);
    border-color: rgba(140, 110, 90, 0.3);
  }
  .nblm-card {
    background: rgba(15, 23, 42, 0.85); color: #f1f5f9;
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .nblm-card-head, .nblm-card-foot {
    border-color: rgba(255,255,255,0.06); background: rgba(0, 0, 0, 0.25);
  }
  .nblm-card-title { color: #f1f5f9; }
  .nblm-x:hover { color: #fff; }
  .nblm-input, .nblm-select, .nblm-textarea {
    background: rgba(15, 23, 42, 0.6); color: #f1f5f9; border-color: rgba(255,255,255,0.1);
  }
  .nblm-input:focus, .nblm-select:focus, .nblm-textarea:focus {
    background: rgba(15, 23, 42, 0.85); border-color: hsl(28, 35%, 50%);
    box-shadow: 0 0 0 3px rgba(140, 110, 90, 0.25);
  }
  .nblm-chip {
    background: rgba(30, 41, 59, 0.5); color: #94a3b8; border-color: rgba(255,255,255,0.06);
  }
  .nblm-chip:hover {
    background: rgba(30, 41, 59, 0.8); border-color: rgba(255,255,255,0.15);
  }
  .nblm-btn { background: rgba(255,255,255,0.06); color: #cbd5e1; }
  .nblm-btn:hover { background: rgba(255,255,255,0.1); }
  .nblm-explain-wrap { border-color: rgba(255,255,255,0.1); }
  .nblm-explain-content { background: rgba(0,0,0,0.2); color: #cbd5e1; }
  .nblm-q-stem { color: #f8fafc; }
  .nblm-q-opt {
    background: rgba(30, 41, 59, 0.6); border-color: rgba(255,255,255,0.08); color: #cbd5e1;
  }
  .nblm-q-opt:hover {
    background: rgba(30, 41, 59, 0.9); border-color: rgba(255,255,255,0.15);
  }
  .nblm-q-opt[data-state="picked"] { border-color: hsl(28, 35%, 55%); background: rgba(140, 110, 90, 0.12); color: #fbd38d; }
  .nblm-q-opt[data-state="correct"] { border-color: #d97706; background: rgba(217, 119, 6, 0.15); color: #f59e0b; }
  .nblm-q-opt[data-state="wrong"] { border-color: #dc2626; background: rgba(185, 28, 28, 0.15); color: #f87171; }
  .nblm-list-item {
    border-color: rgba(255, 255, 255, 0.05); background: rgba(30, 41, 59, 0.3);
  }
  .nblm-list-item:hover {
    border-color: rgba(140, 110, 90, 0.3); background: rgba(30, 41, 59, 0.5);
  }
  .nblm-list-item .t { color: #f1f5f9; }

  .nblm-review-preview {
    background: rgba(15, 23, 42, 0.72);
    color: #cbd5e1;
  }

  .nblm-review-report h1 {
    color: #f8fafc;
  }

  .nblm-review-report h2 {
    color: #e2e8f0;
  }

  .nblm-review-meta,
  .nblm-review-evidence {
    color: #94a3b8;
  }

  .nblm-review-warning {
    border-color: #d97706;
    background: rgba(120, 53, 15, 0.25);
    color: #fcd34d;
  }
}

.nblm-timeline {
  position: fixed; right: 24px; top: 50%; transform: translateY(-50%);
  width: 12px; max-height: 70vh; display: flex; flex-direction: column; gap: 8px;
  align-items: center; z-index: 2147482000;
  background: rgba(255,255,255,0.4); backdrop-filter: blur(8px);
  padding: 12px 0; border-radius: 12px; border: 1px solid rgba(0,0,0,0.06);
}
.nblm-timeline[hidden] { display: none; }
.nblm-tl-dot {
  width: 8px; height: 8px; border-radius: 50%; cursor: pointer;
  transition: all 0.2s ease; background: #cbd5e1;
  position: relative;
}
.nblm-tl-dot[data-role="assistant"] { background: hsl(28, 35%, 45%); }
.nblm-tl-dot:hover { transform: scale(1.5); }
.nblm-tl-dot.active { box-shadow: 0 0 0 3px rgba(140, 110, 90, 0.3); transform: scale(1.2); }
.nblm-tl-dot[data-starred="true"] { background: #fbbf24 !important; }

.nblm-tl-tooltip {
  position: absolute; right: 18px; top: 50%; transform: translateY(-50%);
  background: rgba(15, 23, 42, 0.85); color: #fff; padding: 6px 12px;
  border-radius: 6px; font-size: 12px; width: max-content; max-width: 200px;
  pointer-events: none; opacity: 0; transition: opacity 0.2s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nblm-tl-dot:hover .nblm-tl-tooltip { opacity: 1; }

.nblm-tl-counter {
  font-size: 9px; font-weight: bold; color: #64748b; margin-bottom: 4px;
}
.nblm-tl-jump, .nblm-tl-toggle {
  background: transparent; border: none; cursor: pointer; color: #94a3b8; font-size: 12px; padding: 2px;
}
.nblm-tl-jump:hover, .nblm-tl-toggle:hover {
  color: hsl(28, 35%, 45%); transform: scale(1.2);
}
.nblm-timeline-dots {
  display: flex; flex-direction: column; gap: 8px; align-items: center; width: 100%;
}
`,
  };
})();
