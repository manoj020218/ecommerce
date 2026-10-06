// Same eye-catcher CSS as the storefront (apps/front/src/styles.css,
// "Rich-text eye-catchers") so admins preview effects while editing.
export const RICH_TEXT_FX_CSS = `
/* Rich-text eye-catchers (2026-10-06) — classes come from the admin
   RichTextEditor "Effect" menu; backend sanitizer only allows these. */
.jx-fx-pulse { display: inline-block; animation: jx-fx-pulse 1.6s ease-in-out infinite; }
@keyframes jx-fx-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
.jx-fx-blink { animation: jx-fx-blink 1.4s ease-in-out infinite; }
@keyframes jx-fx-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.jx-fx-shine {
  background: linear-gradient(100deg, currentColor 40%, #ffffff 50%, currentColor 60%);
  background-size: 250% 100%; -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; animation: jx-fx-shine 2.8s linear infinite; font-weight: 700;
}
@keyframes jx-fx-shine { from { background-position: 100% 0; } to { background-position: -150% 0; } }
.jx-fx-badge {
  display: inline-block; background: #E8231A; color: #fff !important; font-weight: 700;
  padding: 1px 10px; border-radius: 999px; font-size: 0.9em; line-height: 1.6;
}
.jx-fx-underline {
  background-image: linear-gradient(transparent 60%, #fde047 60%); background-repeat: no-repeat;
  background-size: 0% 100%; animation: jx-fx-underline 1.2s ease-out 0.3s forwards; font-weight: 600;
}
@keyframes jx-fx-underline { to { background-size: 100% 100%; } }
.jx-fx-shake { display: inline-block; animation: jx-fx-shake 4s ease-in-out infinite; }
@keyframes jx-fx-shake {
  0%, 88%, 100% { transform: translateX(0); }
  90% { transform: translateX(-3px) rotate(-2deg); } 92% { transform: translateX(3px) rotate(2deg); }
  94% { transform: translateX(-3px) rotate(-1deg); } 96% { transform: translateX(2px); }
}
@media (prefers-reduced-motion: reduce) {
  .jx-fx-pulse, .jx-fx-blink, .jx-fx-shine, .jx-fx-shake { animation: none; }
  .jx-fx-shine { -webkit-text-fill-color: currentColor; background: none; }
  .jx-fx-underline { animation: none; background-size: 100% 100%; }
}
.jx-rte-body a { color: #1d4ed8; text-decoration: underline; }
`;
