/* Word-cloud layout + SVG/PNG rendering. Deterministic: no randomness,
   so the same selection always draws the same cloud (spec §3.3). */
"use strict";

(function () {
  const PALETTE = ["#7a5a3a", "#31708f", "#5a7a5f", "#7d5a9e",
                   "#a0522d", "#8a4f5f", "#4f6e8a", "#b0713f"];
  const escXml = s => String(s).replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /* Greedy Archimedean-spiral placement with box collision. Words that
     cannot fit inside the frame are skipped (rare below 100 words). */
  function layout(entries, W, H) {
    if (!entries.length) return [];
    const max = entries[0][1], min = entries[entries.length - 1][1];
    const span = Math.max(1, max - min);
    const boxes = [], placed = [];
    entries.forEach(([word, count]) => {
      const size = 13 + 40 * Math.sqrt((count - min) / span);
      const w = 0.62 * size * word.length + 4, h = 1.15 * size;
      for (let t = 0; t < 4000; t++) {
        const r = t / 16, a = 0.4 * t;
        const x = W / 2 + 1.6 * r * Math.cos(a), y = H / 2 + r * Math.sin(a);
        const bx = x - w / 2, by = y - h / 2;
        if (bx < 2 || by < 2 || bx + w > W - 2 || by + h > H - 2) continue;
        if (boxes.some(b => bx < b.x + b.w && b.x < bx + w &&
                            by < b.y + b.h && b.y < by + h)) continue;
        boxes.push({ x: bx, y: by, w: w, h: h });
        placed.push({ word: word, count: count, size: size, x: x, y: y });
        break;
      }
    });
    return placed;
  }

  /* Font must be inlined: external CSS does not apply inside an
     exported/rasterized SVG. */
  function svgString(entries, W, H) {
    W = W || 800; H = H || 480;
    const texts = layout(entries, W, H).map((p, i) =>
      '<text x="' + p.x.toFixed(1) + '" y="' + p.y.toFixed(1) +
      '" font-size="' + p.size.toFixed(1) +
      '" fill="' + PALETTE[i % PALETTE.length] +
      '" text-anchor="middle" dominant-baseline="middle">' +
      escXml(p.word) + "</text>").join("");
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W +
      " " + H + '" font-family="Georgia, \'Times New Roman\', serif"' +
      ' role="img" aria-label="Word cloud">' +
      '<rect width="' + W + '" height="' + H + '" fill="#fbf7ef"/>' +
      texts + "</svg>";
  }

  function pngFromSvg(svgEl, done) {
    const W = svgEl.viewBox.baseVal.width, H = svgEl.viewBox.baseVal.height;
    const url = URL.createObjectURL(new Blob(
      [new XMLSerializer().serializeToString(svgEl)],
      { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = W * 2; c.height = H * 2;   // 2x for crisp print/slides
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(done, "image/png");
    };
    img.src = url;
  }

  window.LabCloud = { layout, svgString, pngFromSvg, PALETTE };
})();
