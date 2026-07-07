/* Cross-novel search: LIKE queries over speech_act via sql.js. */
"use strict";

(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const qEl = document.getElementById("search-q");
  const bookSel = document.getElementById("search-book");
  const speakerSel = document.getElementById("search-speaker");
  const goEl = document.getElementById("search-go");
  const statusEl = document.getElementById("search-status");
  const resultsEl = document.getElementById("search-results");

  let db = null;

  function q(sql, p) {
    const stmt = db.prepare(sql);
    stmt.bind(p || []);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function fillBooks() {
    q("SELECT label, title FROM book ORDER BY label").forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.label;
      opt.textContent = b.title;
      bookSel.appendChild(opt);
    });
  }

  function fillSpeakers() {
    speakerSel.innerHTML = '<option value="">Everyone</option>' +
      '<option value="narration">Narration only</option>';
    if (bookSel.value) {
      q("SELECT s.id, s.name FROM book_stats bs " +
        "JOIN speaker s ON bs.speaker_id = s.id " +
        "JOIN book b ON bs.book_id = b.id " +
        "WHERE b.label = ? AND bs.narration = 0 AND bs.aloud_words > 0 " +
        "ORDER BY bs.aloud_words DESC", [bookSel.value]
      ).forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        speakerSel.appendChild(opt);
      });
    }
  }

  const LIMIT = 200;

  /* Escape-safe highlighter: escapes HTML around <mark>ed matches. */
  function highlight(text, needle) {
    const rx = new RegExp(
      needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    let out = "", last = 0, m;
    while ((m = rx.exec(text)) !== null) {
      out += esc(text.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  /* Trim long passages to a window around the first match. */
  function snippet(text, needle) {
    let start = 0, end = text.length;
    const at = text.toLowerCase().indexOf(needle.toLowerCase());
    if (text.length > 260 && at >= 0) {
      start = Math.max(0, at - 90);
      end = Math.min(text.length, at + needle.length + 130);
      while (start > 0 && !/\s/.test(text[start - 1])) start--;
      while (end < text.length && !/\s/.test(text[end])) end++;
    }
    return (start > 0 ? "… " : "") + highlight(text.slice(start, end), needle) +
      (end < text.length ? " …" : "");
  }

  function render(rows, needle, capped) {
    statusEl.textContent = rows.length === 0
      ? "No matches — try a different word or phrase, or loosen the filters."
      : capped
        ? "Showing the first " + LIMIT + " matches — narrow the search with the filters."
        : rows.length + (rows.length === 1 ? " match." : " matches.");
    resultsEl.innerHTML = rows.map(r => {
      const who = r.narration ? "Narration" : r.name;
      const href = "../novels/read.html?book=" + encodeURIComponent(r.blabel) +
        "&ch=" + r.ch + "&sa=" + r.seq;
      return '<li class="result"><blockquote>' + snippet(r.text, needle) +
        '</blockquote><p class="meta">' + esc(who) + " — <a href=\"" + href +
        '">' + esc(r.title) + ", " + esc(r.chlabel) + "</a></p></li>";
    }).join("");
  }

  function runSearch(needle) {
    const like = "%" + needle.replace(/[\\%_]/g, c => "\\" + c) + "%";
    const where = ["sa.text LIKE ? ESCAPE '\\'"];
    const params = [like];
    if (bookSel.value) { where.push("b.label = ?"); params.push(bookSel.value); }
    if (speakerSel.value === "narration") {
      where.push("sa.narration = 1");
    } else if (speakerSel.value) {
      where.push("sa.speaker_id = ?"); params.push(speakerSel.value);
    }
    const rows = q(
      "SELECT sa.chapter_index AS ch, sa.seq AS seq, sa.narration AS narration, " +
      "sa.text AS text, s.name AS name, b.label AS blabel, b.title AS title, " +
      "c.label AS chlabel " +
      "FROM speech_act sa " +
      "JOIN book b ON sa.book_id = b.id " +
      "JOIN chapter c ON c.book_id = sa.book_id AND c.chapter_index = sa.chapter_index " +
      "LEFT JOIN speaker s ON sa.speaker_id = s.id " +
      "WHERE " + where.join(" AND ") +
      " ORDER BY b.label, sa.seq LIMIT ?",
      params.concat([LIMIT + 1]));
    const capped = rows.length > LIMIT;
    if (capped) rows.length = LIMIT;
    render(rows, needle, capped);
  }

  function shareUrl(needle) {
    const u = new URL(location.href);
    u.searchParams.set("q", needle);
    if (bookSel.value) u.searchParams.set("book", bookSel.value);
    else u.searchParams.delete("book");
    if (speakerSel.value) u.searchParams.set("speaker", speakerSel.value);
    else u.searchParams.delete("speaker");
    history.replaceState(null, "", u);
  }

  document.getElementById("search-form").addEventListener("submit", e => {
    e.preventDefault();
    const needle = qEl.value.trim();
    if (needle.length < 2) {
      statusEl.textContent = "Type at least two characters to search.";
      resultsEl.innerHTML = "";
      return;
    }
    runSearch(needle);
    shareUrl(needle);
  });

  bookSel.addEventListener("change", fillSpeakers);

  Promise.all([
    Promise.resolve().then(() => initSqlJs({ locateFile: f => "../js/vendor/" + f })),
    fetch("../data/austen.sqlite").then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }),
  ])
    .then(([SQL, buf]) => {
      db = new SQL.Database(new Uint8Array(buf));
      fillBooks();
      const p = new URLSearchParams(location.search);
      if (p.get("book")) bookSel.value = p.get("book");
      fillSpeakers();
      if (p.get("speaker")) speakerSel.value = p.get("speaker");
      [qEl, bookSel, speakerSel, goEl].forEach(el => { el.disabled = false; });
      statusEl.textContent = "Type a word or phrase and press Search.";
      const shared = (p.get("q") || "").trim();
      if (shared.length >= 2) {
        qEl.value = shared;
        runSearch(shared);
      } else {
        qEl.focus();
      }
    })
    .catch(err => {
      statusEl.textContent = "Search could not load (" + err.message +
        "). Try the statistics home page instead.";
    });
})();
