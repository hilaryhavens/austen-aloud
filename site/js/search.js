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
      fillSpeakers();
      [qEl, bookSel, speakerSel, goEl].forEach(el => { el.disabled = false; });
      statusEl.textContent = "Type a word or phrase and press Search.";
      qEl.focus();
    })
    .catch(err => {
      statusEl.textContent = "Search could not load (" + err.message +
        "). Try the statistics home page instead.";
    });
})();
