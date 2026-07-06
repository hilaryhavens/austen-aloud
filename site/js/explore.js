/* Background-loads austen.sqlite via sql.js and powers character drill-down. */
"use strict";

(function () {
  const status = document.getElementById("explore-status");
  const novelSel = document.getElementById("explore-novel");
  const speakerSel = document.getElementById("explore-speaker");
  const chartHost = document.getElementById("explore-chart");
  let db = null;

  function q(sql, params) {
    const stmt = db.prepare(sql);
    stmt.bind(params || []);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function fillNovels() {
    novelSel.innerHTML = "";
    q("SELECT id, title FROM book ORDER BY label").forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.title;
      novelSel.appendChild(opt);
    });
    novelSel.disabled = false;
    fillSpeakers();
  }

  function fillSpeakers() {
    speakerSel.innerHTML = "";
    q(
      "SELECT s.id, s.name FROM book_stats bs JOIN speaker s ON bs.speaker_id=s.id " +
      "WHERE bs.book_id=? AND bs.narration=0 AND bs.aloud_words > 0 " +
      "ORDER BY bs.aloud_words DESC",
      [novelSel.value]
    ).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      speakerSel.appendChild(opt);
    });
    speakerSel.disabled = false;
    drawChart();
  }

  function drawChart() {
    const rows = q(
      "SELECT chapter_index, COUNT(*) AS words FROM conversation_word " +
      "WHERE book_id=? AND speaker_id=? GROUP BY chapter_index " +
      "ORDER BY chapter_index",
      [novelSel.value, speakerSel.value]
    );
    const name = speakerSel.options[speakerSel.selectedIndex].textContent;
    status.textContent = rows.length
      ? `${name}: words spoken aloud, by chapter`
      : `${name} speaks no words aloud.`;
    chartHost.innerHTML = window.austenCharts.barChart(
      rows.map(r => ({ label: "Ch. " + r.chapter_index, value: r.words })),
      {
        color: window.austenCharts.PALETTE[1],
        width: 480,
        label: `${name}: words spoken aloud, by chapter`,
      }
    );
  }

  novelSel.addEventListener("change", fillSpeakers);
  speakerSel.addEventListener("change", drawChart);

  Promise.all([
    Promise.resolve().then(() => initSqlJs({ locateFile: f => "js/vendor/" + f })),
    fetch("data/austen.sqlite").then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    }),
  ])
    .then(([SQL, buf]) => {
      db = new SQL.Database(new Uint8Array(buf));
      status.textContent = "Pick a novel and a character.";
      fillNovels();
    })
    .catch(err => {
      status.textContent = "The interactive explorer could not load (" +
        err.message + "). The statistics above are unaffected.";
    });
})();
