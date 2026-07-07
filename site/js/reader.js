/* Chapter reader: renders speech_act rows as prose with named speakers. */
"use strict";

(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const SPEAKER_COLORS = ["#e0a93f", "#6fa483", "#d98ea6", "#8fa5bd",
                          "#b98a5a", "#7d5a9e", "#5a8a8f", "#c96f6f"];

  const params = new URLSearchParams(location.search);
  const bookLabel = params.get("book") || "";
  const chapter = Math.max(1, parseInt(params.get("ch") || "1", 10) || 1);
  let view = params.get("view") === "script" ? "script" : "prose";
  const foundSeq = params.get("sa");

  const titleEl = document.getElementById("chapter-title");
  const statusEl = document.getElementById("reader-status");
  const bodyEl = document.getElementById("chapter-body");
  const chapterSel = document.getElementById("chapter-select");
  const prevEl = document.getElementById("prev");
  const nextEl = document.getElementById("next");
  const toggleEl = document.getElementById("view-toggle");

  if (!/^aus\.00[1-6]$/.test(bookLabel)) {
    location.replace("index.html");
    return;
  }

  let db = null, book = null, chapters = [], colorOf = {};

  function q(sql, p) {
    const stmt = db.prepare(sql);
    stmt.bind(p || []);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function pageUrl(ch, extra) {
    const u = new URLSearchParams({ book: bookLabel, ch: String(ch) });
    if (extra) Object.entries(extra).forEach(([k, v]) => u.set(k, v));
    // keep current view mode when navigating
    if (view === "script" && !(extra && "view" in extra)) u.set("view", "script");
    return "read.html?" + u.toString();
  }

  function acts() {
    return q(
      "SELECT sa.seq AS seq, sa.narration AS narration, sa.text AS text, s.name AS name " +
      "FROM speech_act sa LEFT JOIN speaker s ON sa.speaker_id = s.id " +
      "WHERE sa.book_id = ? AND sa.chapter_index = ? ORDER BY sa.seq",
      [book.id, chapter]
    );
  }

  function renderProse() {
    const parts = [];
    acts().forEach(a => {
      if (a.narration) {
        parts.push(`<p class="narration" id="sa-${a.seq}">${esc(a.text)}</p>`);
      } else {
        const c = colorOf[a.name] || "#7a736a";
        parts.push(
          `<p class="speech" id="sa-${a.seq}" style="border-color:${c}">` +
          `<span class="speaker-tag" style="border-color:${c}">${esc(a.name)}</span> ` +
          `${esc(a.text)}</p>`);
      }
    });
    bodyEl.innerHTML = parts.join("");
  }

  function renderScript() {
    const rows = acts();
    const counts = new Map();
    rows.forEach(a => {
      if (!a.narration) counts.set(a.name, (counts.get(a.name) || 0) + 1);
    });
    const parts = ['<section class="cast"><h2>Cast</h2><ol>'];
    counts.forEach((n, name) => {
      parts.push(`<li>${esc(name)} <span class="meta">(${n} ${n === 1 ? "speech" : "speeches"})</span></li>`);
    });
    parts.push("</ol></section>");
    rows.forEach(a => {
      if (a.narration) {
        parts.push(`<p class="stage" id="sa-${a.seq}">[${esc(a.text)}]</p>`);
      } else {
        parts.push(
          `<div class="line" id="sa-${a.seq}"><span class="cast-name">${esc(a.name)}</span>` +
          `<p>${esc(a.text)}</p></div>`);
      }
    });
    bodyEl.innerHTML = parts.join("");
  }

  function render() {
    if (view === "script") renderScript(); else renderProse();
    toggleEl.textContent = view === "script" ? "Prose view" : "Script view";
    document.body.classList.toggle("script-mode", view === "script");
  }

  function markFound(scroll) {
    if (foundSeq === null) return;
    const el = document.getElementById("sa-" + foundSeq);
    if (!el) return;
    el.classList.add("found");
    if (scroll) el.scrollIntoView({ block: "center" });
  }

  function setupNav() {
    chapterSel.innerHTML = "";
    chapters.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.chapter_index;
      opt.textContent = c.label;
      if (c.chapter_index === chapter) opt.selected = true;
      chapterSel.appendChild(opt);
    });
    chapterSel.disabled = false;
    chapterSel.addEventListener("change", () => {
      location.href = pageUrl(chapterSel.value);
    });
    if (chapter > 1) {
      prevEl.href = pageUrl(chapter - 1);
      prevEl.hidden = false;
    }
    if (chapter < chapters.length) {
      nextEl.href = pageUrl(chapter + 1);
      nextEl.hidden = false;
    }
  }

  Promise.all([
    Promise.resolve().then(() => initSqlJs({ locateFile: f => "../js/vendor/" + f })),
    fetch("../data/austen.sqlite").then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }),
  ])
    .then(([SQL, buf]) => {
      db = new SQL.Database(new Uint8Array(buf));
      book = q("SELECT id, title FROM book WHERE label = ?", [bookLabel])[0];
      chapters = q(
        "SELECT chapter_index, label FROM chapter WHERE book_id = ? ORDER BY chapter_index",
        [book.id]);
      if (chapter > chapters.length) { location.replace(pageUrl(1)); return; }
      q("SELECT s.name AS name FROM book_stats bs JOIN speaker s ON bs.speaker_id = s.id " +
        "WHERE bs.book_id = ? AND bs.narration = 0 ORDER BY bs.aloud_words DESC LIMIT ?",
        [book.id, SPEAKER_COLORS.length]
      ).forEach((r, i) => { colorOf[r.name] = SPEAKER_COLORS[i]; });
      document.title = `${book.title}, ${chapters[chapter - 1].label} — Austen Aloud`;
      titleEl.textContent = `${book.title} — ${chapters[chapter - 1].label}`;
      statusEl.hidden = true;
      setupNav();
      toggleEl.hidden = false;
      toggleEl.addEventListener("click", () => {
        view = view === "script" ? "prose" : "script";
        const u = new URL(location.href);
        if (view === "script") u.searchParams.set("view", "script");
        else u.searchParams.delete("view");
        history.replaceState(null, "", u);
        if (!prevEl.hidden) prevEl.href = pageUrl(chapter - 1);
        if (!nextEl.hidden) nextEl.href = pageUrl(chapter + 1);
        render();
        markFound(false);
      });
      render();
      markFound(true);
      window.austenReader = { render, acts, book: () => book, chapter: () => chapter };
    })
    .catch(err => {
      statusEl.textContent = "The book could not load (" + err.message +
        "). Try the statistics home page instead.";
    });
})();
