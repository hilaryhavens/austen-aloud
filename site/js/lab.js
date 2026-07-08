/* Language Lab controller: DB load, selection panels, tabs, URL state. */
"use strict";

(function () {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmt = n => n.toLocaleString("en-US");
  const C = window.LabCore;

  const statusEl = document.getElementById("lab-status");
  let db = null, booksList = [], mainPanel = null;
  let activeTab = "extract";

  function q(sql, p) {
    const stmt = db.prepare(sql);
    stmt.bind(p || []);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  /* Heavy work never blocks the first paint (spec §4). */
  function busy(el, work) {
    el.innerHTML = '<p class="status">Counting words…</p>';
    setTimeout(work, 30);
  }

  function emptyMsg() {
    return '<p class="status">No matching text — select at least one novel, ' +
      "one speaker or group, and one kind of text.</p>";
  }

  function titleOf(bl) {
    const b = booksList.find(x => x.label === bl);
    return b ? b.title : bl;
  }

  function speakersOf(blabel) {
    return q(
      "SELECT s.label AS label, s.name AS name FROM book_stats bs " +
      "JOIN speaker s ON bs.speaker_id = s.id " +
      "JOIN book b ON bs.book_id = b.id " +
      "WHERE b.label = ? AND bs.narration = 0 " +
      "AND (bs.aloud_words + bs.not_aloud_words) > 0 " +
      "ORDER BY bs.aloud_words DESC", [blabel]);
  }

  function topSpeaker(blabel) {
    const r = speakersOf(blabel);
    return r.length ? r[0].label : null;
  }

  function groupValues(books, varKey) {
    const col = C.GROUP_VARS[varKey];
    if (!col || !books.length) return [];
    return q(
      "SELECT DISTINCT sp." + col + " AS v FROM speaker sp " +
      "JOIN book b ON sp.book_id = b.id WHERE b.label IN (" +
      books.map(() => "?").join(",") + ") ORDER BY sp." + col + " IS NULL, sp." + col,
      books).map(r => r.v);
  }

  function actsFor(sel) {
    const built = C.actsSql(sel);
    return q(built.sql, built.params);
  }

  /* Build a selection panel inside `root`; returns {read, set}.
     <details> groups collapse naturally at phone widths (spec §4). */
  function buildPanel(root, initial, onChange) {
    let sel = initial;
    root.innerHTML =
      '<details open class="lab-group"><summary>Novels</summary>' +
      '<div class="options opt-books"></div></details>' +
      '<details open class="lab-group"><summary>Who</summary>' +
      '<select class="who-mode"><option value="speakers">Choose characters</option>' +
      Object.keys(C.GROUP_LABELS).map(k =>
        '<option value="' + k + '">Group by ' +
        esc(C.GROUP_LABELS[k].toLowerCase()) + "</option>").join("") +
      '</select><div class="options opt-who"></div></details>' +
      '<details open class="lab-group"><summary>Kinds of text</summary>' +
      '<div class="options opt-kinds"></div></details>';
    const booksBox = root.querySelector(".opt-books");
    const modeSel = root.querySelector(".who-mode");
    const whoBox = root.querySelector(".opt-who");
    const kindsBox = root.querySelector(".opt-kinds");

    const check = (k, value, label, on) =>
      '<label><input type="checkbox" data-k="' + k + '" value="' + esc(value) +
      '"' + (on ? " checked" : "") + "> " + esc(label) + "</label>";

    function paint() {
      booksBox.innerHTML = booksList.map(b =>
        check("book", b.label, b.title, sel.books.includes(b.label))).join("");
      modeSel.value = sel.mode === "group" ? sel.groupVar : "speakers";
      if (sel.mode === "group") {
        whoBox.innerHTML = groupValues(sel.books, sel.groupVar).map(v => {
          const tok = v === null ? C.UNRECORDED : v;
          return check("group", tok, v === null ? "unrecorded" : v,
            sel.groups.includes(tok));
        }).join("");
      } else {
        whoBox.innerHTML = sel.books.map(bl =>
          "<fieldset><legend>" + esc(titleOf(bl)) + "</legend>" +
          check("who", bl + ".nar", "Narrator", sel.who.includes(bl + ".nar")) +
          speakersOf(bl).map(s =>
            check("who", s.label, s.name, sel.who.includes(s.label))).join("") +
          "</fieldset>").join("");
      }
      kindsBox.innerHTML = [
        ["speech", "Speech (spoken aloud)"],
        ["narration", "Narration"],
        ["letters", "Letters"],
      ].map(([k, lab]) => check("kind", k, lab, sel.kinds.includes(k))).join("");
    }

    function read() {
      const vals = k => Array.from(
        root.querySelectorAll('input[data-k="' + k + '"]:checked'))
        .map(i => i.value);
      const mode = modeSel.value;
      sel = {
        books: vals("book"),
        mode: mode === "speakers" ? "speakers" : "group",
        who: vals("who"),
        groupVar: mode === "speakers" ? sel.groupVar : mode,
        groups: vals("group"),
        kinds: vals("kind"),
      };
      return sel;
    }

    root.addEventListener("change", e => {
      read();
      if (e.target === modeSel && sel.mode === "group") {
        // entering group mode: start with every group ticked
        sel.groups = groupValues(sel.books, sel.groupVar)
          .map(v => (v === null ? C.UNRECORDED : v));
      }
      if (e.target.dataset && e.target.dataset.k === "book" || e.target === modeSel) {
        paint();
      }
      onChange();
    });

    paint();
    return { read: () => sel, set: s => { sel = s; paint(); } };
  }

  function downloadBlob(filename, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const downloadText = (filename, text) =>
    downloadBlob(filename, new Blob([text], { type: "text/plain;charset=utf-8" }));

  /* ==== tab renderers (Tasks 4-7 replace the entries in TABS) ==== */

  let extractRows = [];

  function renderExtract(sel) {
    const out = document.getElementById("extract-body");
    busy(out, () => {
      extractRows = actsFor(sel);
      if (!extractRows.length) { out.innerHTML = emptyMsg(); return; }
      const layout = document.getElementById("extract-layout").value;
      const parts = [];
      if (layout === "script") {
        const counts = new Map();
        extractRows.forEach(r => {
          if (!r.narration) {
            const who = r.names || "Unknown";
            counts.set(who, (counts.get(who) || 0) + 1);
          }
        });
        if (counts.size) {
          parts.push('<section class="cast"><h2>Cast</h2><ol>');
          counts.forEach((n, name) => parts.push(
            "<li>" + esc(name) + ' <span class="meta">(' + n +
            (n === 1 ? " speech" : " speeches") + ")</span></li>"));
          parts.push("</ol></section>");
        }
      }
      let lastKey = "";
      extractRows.forEach(r => {
        const key = r.blabel + ":" + r.ch;
        if (key !== lastKey) {
          parts.push('<h3 class="extract-ch">' + esc(r.title) + " — " +
            esc(r.chlabel) + "</h3>");
          lastKey = key;
        }
        const who = r.narration ? null : (r.names || "Unknown");
        const mark = r.in_letter ? " (letter)" : "";
        if (layout === "script") {
          if (!who) parts.push('<p class="stage">[' + esc(r.text) + "]</p>");
          else parts.push('<div class="line"><span class="cast-name">' +
            esc(who + mark) + "</span><p>" + esc(r.text) + "</p></div>");
        } else {
          if (!who) parts.push('<p class="narration">' + esc(r.text) + "</p>");
          else parts.push('<p class="speech"><span class="speaker-tag">' +
            esc(who + mark) + "</span> " + esc(r.text) + "</p>");
        }
      });
      out.innerHTML = parts.join("");
    });
  }

  function extractPlainText(rows) {
    const out = [];
    let lastKey = "";
    rows.forEach(r => {
      const key = r.blabel + ":" + r.ch;
      if (key !== lastKey) {
        out.push("", r.title + " — " + r.chlabel, "");
        lastKey = key;
      }
      const who = r.narration ? null : (r.names || "Unknown");
      out.push(who
        ? who.toUpperCase() + (r.in_letter ? " (LETTER)" : "") + ": " + r.text
        : r.text);
    });
    return out.join("\n").trim() + "\n";
  }

  document.getElementById("extract-layout").addEventListener("change", () => {
    if (db) refresh();
  });
  document.getElementById("extract-txt").addEventListener("click", () => {
    if (db && extractRows.length) {
      downloadText("austen-lab-extract.txt", extractPlainText(extractRows));
    }
  });
  document.getElementById("extract-print").addEventListener("click", () => {
    window.print();
  });

  /* Whole-novel totals (denominator for percentages, spec §2.3) — cached. */
  const novelTotals = {};
  function totalsOf(blabel) {
    if (!novelTotals[blabel]) {
      const texts = q(
        "SELECT text FROM speech_act sa JOIN book b ON sa.book_id = b.id " +
        "WHERE b.label = ?", [blabel]).map(r => r.text);
      novelTotals[blabel] = C.textMetrics(texts);
    }
    return novelTotals[blabel];
  }

  function speakerName(label) {
    const r = q("SELECT name FROM speaker WHERE label = ? LIMIT 1", [label]);
    return r.length ? r[0].name : label;
  }

  /* One stats row per (novel x who-unit) (spec §3.4). */
  function unitsOf(sel) {
    const units = [];
    sel.books.forEach(bl => {
      if (sel.mode === "group") {
        sel.groups.forEach(g => units.push({
          book: bl,
          label: g === C.UNRECORDED ? "unrecorded" : g,
          sel: { books: [bl], mode: "group", who: [], groupVar: sel.groupVar,
                 groups: [g], kinds: sel.kinds },
        }));
      } else {
        sel.who.filter(t => t.startsWith(bl + ".")).forEach(tok => units.push({
          book: bl,
          label: tok.endsWith(".nar") ? "Narrator" : speakerName(tok),
          sel: { books: [bl], mode: "speakers", who: [tok],
                 groupVar: sel.groupVar, groups: [], kinds: sel.kinds },
        }));
      }
    });
    return units;
  }

  function rowFrom(rows, novelTitle, whoLabel, denomWords) {
    const m = C.textMetrics(rows.map(r => r.text));
    const refs = new Set(), qs = new Set();
    rows.forEach(r => {
      if (r.ri !== null) refs.add(r.blabel + "|" + r.ch + "|" + r.ci + "|" + r.ri);
      if (r.ci !== null) qs.add(r.blabel + "|" + r.ch + "|" + r.ci);
    });
    return { novel: novelTitle, who: whoLabel, words: m.total_words,
      pct: denomWords ? 100 * m.total_words / denomWords : 0,
      chars: m.chars, unique: m.unique_words, density: m.density,
      avglen: m.avg_word_length, refs: refs.size, qs: qs.size };
  }

  function computeStatsRows(sel) {
    const units = unitsOf(sel);
    const out = [];
    let all = [];
    units.forEach(u => {
      const rows = actsFor(u.sel);
      all = all.concat(rows);
      out.push(rowFrom(rows, titleOf(u.book), u.label,
        totalsOf(u.book).total_words));
    });
    if (out.length > 1) {
      const seen = new Set();
      all = all.filter(r => !seen.has(r.id) && seen.add(r.id));
      const denom = sel.books.reduce((s, bl) => s + totalsOf(bl).total_words, 0);
      out.push(rowFrom(all, "All selected novels", "Union of the rows above", denom));
    }
    return out;
  }

  function statsTableHtml(rows) {
    return '<table class="lab-table"><thead><tr>' +
      "<th>Novel</th><th>Selection</th><th>Total words</th><th>% of novel</th>" +
      "<th>Character count</th><th>Unique words</th>" +
      '<th><abbr title="Unique words divided by total words — how varied the vocabulary is">Vocabulary density</abbr></th>' +
      "<th>Average word length</th><th>Speech acts</th><th>Conversations</th>" +
      "</tr></thead><tbody>" +
      rows.map(r => "<tr><td>" + esc(r.novel) + "</td><td>" + esc(r.who) +
        "</td><td>" + fmt(r.words) + "</td><td>" + r.pct.toFixed(1) +
        "%</td><td>" + fmt(r.chars) + "</td><td>" + fmt(r.unique) +
        "</td><td>" + r.density.toFixed(3) + "</td><td>" +
        r.avglen.toFixed(2) + "</td><td>" + fmt(r.refs) + "</td><td>" +
        fmt(r.qs) + "</td></tr>").join("") +
      "</tbody></table>";
  }

  function statsCsv(rows) {
    const cell = v => /[",\n]/.test(String(v))
      ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const head = "novel,selection,total_words,pct_of_novel,character_count," +
      "unique_words,vocabulary_density,avg_word_length,speech_acts,conversations";
    return [head].concat(rows.map(r =>
      [r.novel, r.who, r.words, r.pct.toFixed(2), r.chars, r.unique,
       r.density.toFixed(4), r.avglen.toFixed(2), r.refs, r.qs]
        .map(cell).join(","))).join("\n") + "\n";
  }

  let lastStatsRows = [];

  function renderStats(sel) {
    const out = document.getElementById("stats-body");
    busy(out, () => {
      lastStatsRows = computeStatsRows(sel);
      out.innerHTML = lastStatsRows.some(r => r.words)
        ? statsTableHtml(lastStatsRows) : emptyMsg();
    });
  }

  document.getElementById("stats-csv").addEventListener("click", () => {
    if (db && lastStatsRows.length) {
      downloadBlob("austen-lab-stats.csv",
        new Blob([statsCsv(lastStatsRows)], { type: "text/csv;charset=utf-8" }));
    }
  });

  let cloudActs = [];

  function cloudEntries(texts) {
    const drop = !document.getElementById("cloud-common").checked;
    const freq = C.countTokens(texts, drop);
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 100);                       // top ~100 words (spec §3.3)
  }

  function drawCloud(entries) {
    const box = document.getElementById("cloud-box");
    if (!entries.length) {
      box.innerHTML = emptyMsg();
      document.getElementById("cloud-table").innerHTML = "";
      return;
    }
    box.innerHTML = LabCloud.svgString(entries, 800, 480);
    document.getElementById("cloud-table").innerHTML =
      '<table class="lab-table"><thead><tr><th>Word</th><th>Count</th>' +
      "</tr></thead><tbody>" +
      entries.map(([w, n]) => "<tr><td>" + esc(w) + "</td><td>" + fmt(n) +
        "</td></tr>").join("") + "</tbody></table>";
  }

  function renderCloud(sel) {
    const box = document.getElementById("cloud-box");
    const listEl = document.getElementById("cloud-speeches");
    busy(box, () => {
      const per = document.getElementById("cloud-mode").value === "per";
      if (per) {
        cloudActs = actsFor(sel).filter(r => !r.narration);
        listEl.hidden = false;
        listEl.innerHTML = cloudActs.slice(0, 400).map(r => {
          const words = r.text.split(/\s+/).filter(Boolean);
          return '<li><button type="button" class="toggle" data-id="' + r.id +
            '">' + esc(r.title + ", " + r.chlabel + " — “" +
            words.slice(0, 8).join(" ") + (words.length > 8 ? "…" : "") +
            "” (" + words.length + " words)") + "</button></li>";
        }).join("");
        box.innerHTML = cloudActs.length
          ? '<p class="status">Choose a speech above to draw its cloud.</p>'
          : emptyMsg();
        document.getElementById("cloud-table").innerHTML = "";
        return;
      }
      listEl.hidden = true;
      drawCloud(cloudEntries(actsFor(sel).map(r => r.text)));
    });
  }

  document.getElementById("cloud-speeches").addEventListener("click", e => {
    const b = e.target.closest("button[data-id]");
    if (!b || !db) return;
    const act = cloudActs.find(r => String(r.id) === b.dataset.id);
    if (act) drawCloud(cloudEntries([act.text]));
  });
  document.getElementById("cloud-mode").addEventListener("change", () => {
    if (db) refresh();
  });
  document.getElementById("cloud-common").addEventListener("change", () => {
    if (db) refresh();
  });
  document.getElementById("cloud-svg").addEventListener("click", () => {
    const svg = document.querySelector("#cloud-box svg");
    if (!svg) return;
    downloadBlob("austen-lab-cloud.svg", new Blob(
      [new XMLSerializer().serializeToString(svg)],
      { type: "image/svg+xml" }));
  });
  document.getElementById("cloud-png").addEventListener("click", () => {
    const svg = document.querySelector("#cloud-box svg");
    if (!svg) return;
    LabCloud.pngFromSvg(svg, blob => {
      if (!blob) {
        document.getElementById("cloud-box").innerHTML =
          '<p class="status">PNG export failed — try the SVG download instead.</p>';
        return;
      }
      downloadBlob("austen-lab-cloud.png", blob);
    });
  });

  function renderSummary(sel) {
    const bodyId = { extract: "extract-body", cloud: "cloud-box",
      stats: "stats-body", compare: "compare-body" }[activeTab];
    const out = document.getElementById(bodyId);
    busy(out, () => {
      const n = actsFor(sel).length;
      out.innerHTML = n
        ? '<p class="status">' + fmt(n) +
          " matching passages — this view arrives in a later task.</p>"
        : emptyMsg();
    });
  }

  const TABS = { extract: renderExtract, cloud: renderCloud,
    stats: renderStats, compare: renderSummary };

  /* ==== URL sync + bootstrap ==== */

  function refresh() {
    const sel = mainPanel.read();
    const u = new URL(location.href);
    C.selectionToParams(sel, u.searchParams, "");
    u.searchParams.set("tab", activeTab);
    u.searchParams.set("layout", document.getElementById("extract-layout").value);
    history.replaceState(null, "", u);
    document.querySelectorAll("#lab-tabs button").forEach(b =>
      b.setAttribute("aria-selected", String(b.dataset.tab === activeTab)));
    ["extract", "cloud", "stats", "compare"].forEach(t => {
      document.getElementById("tab-" + t).hidden = t !== activeTab;
    });
    TABS[activeTab](sel);
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
      booksList = q("SELECT label, title FROM book ORDER BY label");
      const params = new URLSearchParams(location.search);
      const sel = C.selectionFromParams(params, "");
      if (sel.who === null) {
        // first visit: preselect the first novel's busiest speaker
        const top = sel.books.length ? topSpeaker(sel.books[0]) : null;
        sel.who = top ? [top] : [];
      }
      const t = params.get("tab");
      if (["extract", "cloud", "stats", "compare"].includes(t)) activeTab = t;
      if (params.get("layout") === "script") {
        document.getElementById("extract-layout").value = "script";
      }
      mainPanel = buildPanel(
        document.getElementById("lab-panel-main"), sel, refresh);
      document.getElementById("lab-tabs").addEventListener("click", e => {
        const b = e.target.closest("button[data-tab]");
        if (!b) return;
        activeTab = b.dataset.tab;
        refresh();
      });
      statusEl.hidden = true;
      refresh();
      window.austenLab = { q, refresh, panel: () => mainPanel };
    })
    .catch(err => {
      statusEl.textContent = "The Language Lab could not load (" +
        err.message + "). Try the statistics home page instead.";
    });
})();
