// Shared fallback for broken Steam CDN images (a dark tile with a faint mark),
// so a 404 shows a neutral placeholder instead of the browser's broken-image glyph.

export const IMG_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">
       <rect width="160" height="120" rx="10" fill="#161a24"/>
       <path d="M80 44a14 14 0 1 0 0 28 14 14 0 0 0 0-28Zm0 6a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" fill="#3a4258"/>
       <text x="80" y="94" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#5c6478">нет изображения</text>
     </svg>`,
  );

/** onError handler: swap a failed image to the placeholder exactly once. */
export function onImgError(e: React.SyntheticEvent<HTMLImageElement>): void {
  const el = e.currentTarget;
  if (el.dataset.fallback === "1") return;
  el.dataset.fallback = "1";
  el.src = IMG_FALLBACK;
}
