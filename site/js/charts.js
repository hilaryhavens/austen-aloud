/* Renders the stats showcase from the precomputed summaries. */
"use strict";

const PALETTE = ["#e0a93f", "#6fa483", "#d98ea6", "#8fa5bd"];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Horizontal bar chart. rows: [{label, value}] */
function barChart(rows, { color = PALETTE[0], width = 420, label = "Bar chart" } = {}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  const rowH = 24, labelW = 150, pad = 4;
  const h = rows.length * rowH;
  const parts = [`<svg role="img" aria-label="${esc(label)}" viewBox="0 0 ${width} ${h}" width="100%" style="max-width:${width}px">`];
  rows.forEach((r, i) => {
    const y = i * rowH;
    const barW = Math.round((width - labelW - 70) * r.value / max);
    parts.push(
      `<text x="${labelW - 6}" y="${y + rowH / 2 + 4}" text-anchor="end" font-size="13">${esc(r.label)}</text>`,
      `<rect x="${labelW}" y="${y + pad}" width="${Math.max(barW, 2)}" height="${rowH - 2 * pad}" rx="3" fill="${color}"></rect>`,
      `<text x="${labelW + Math.max(barW, 2) + 6}" y="${y + rowH / 2 + 4}" font-size="12" fill="#7a736a">${r.value.toLocaleString()}</text>`
    );
  });
  parts.push("</svg>");
  return parts.join("");
}

function renderNovelCards(books) {
  const host = document.getElementById("novel-cards");
  host.innerHTML = "";
  books.forEach((b, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      `<h3>${esc(b.title)}</h3>` +
      `<p class="meta">${b.chapters} chapters · ` +
      `${b.aloud_words.toLocaleString()} words spoken aloud</p>` +
      `<div class="chart-scroll">` +
      barChart(
        b.top_speakers.slice(0, 8).map(s => ({ label: s.name, value: s.aloud_words })),
        {
          color: PALETTE[i % PALETTE.length],
          label: `Top speakers in ${b.title} by words spoken aloud`,
        }
      ) + `</div>`;
    host.appendChild(card);
  });
}

function renderDialogueShare(books) {
  const host = document.getElementById("dialogue-share");
  const width = 640, rowH = 30, labelW = 170;
  const max = Math.max(...books.map(b => b.aloud_words + b.narration_words));
  const parts = [
    `<svg role="img" aria-label="${esc("Share of words in dialogue versus narration per novel")}" viewBox="0 0 ${width} ${books.length * rowH + 24}" width="100%" style="max-width:${width}px">`
  ];
  books.forEach((b, i) => {
    const y = i * rowH, scale = (width - labelW - 10) / max;
    const total = b.aloud_words + b.narration_words;
    const wA = b.aloud_words * scale, wN = b.narration_words * scale;
    const pctA = total ? Math.round((b.aloud_words / total) * 100) : 0;
    const pctN = total ? 100 - pctA : 0;
    parts.push(
      `<text x="${labelW - 6}" y="${y + 19}" text-anchor="end" font-size="13">${esc(b.title)}</text>`,
      `<rect x="${labelW}" y="${y + 5}" width="${wA}" height="18" fill="${PALETTE[2]}" rx="3" stroke="#5a4a52" stroke-width="1"></rect>`,
      `<rect x="${labelW + wA}" y="${y + 5}" width="${wN}" height="18" fill="${PALETTE[3]}" rx="3"></rect>`,
      `<text x="${labelW + 4}" y="${y + 18}" font-size="10" fill="#3a3530">${pctA}%</text>`,
      `<text x="${labelW + wA + 4}" y="${y + 18}" font-size="10" fill="#3a3530">${pctN}%</text>`
    );
  });
  const ly = books.length * rowH + 14;
  parts.push(
    `<rect x="${labelW}" y="${ly - 9}" width="12" height="12" fill="${PALETTE[2]}"></rect>`,
    `<text x="${labelW + 18}" y="${ly + 2}" font-size="12">dialogue (aloud)</text>`,
    `<rect x="${labelW + 150}" y="${ly - 9}" width="12" height="12" fill="${PALETTE[3]}"></rect>`,
    `<text x="${labelW + 168}" y="${ly + 2}" font-size="12">narration</text>`,
    "</svg>"
  );
  host.innerHTML = parts.join("");
}

fetch("data/summaries/books.json")
  .then(r => r.json())
  .then(books => {
    window.austenBooks = books;
    renderNovelCards(books);
    renderDialogueShare(books);
    document.dispatchEvent(new Event("austen:summaries-ready"));
  })
  .catch(err => {
    document.getElementById("novel-cards").innerHTML =
      `<p class="status">Could not load statistics (${esc(err.message)}).</p>`;
  });

window.austenCharts = { barChart, esc, PALETTE };
