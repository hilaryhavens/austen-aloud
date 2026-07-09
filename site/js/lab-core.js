/* Language Lab core: tokenizer, metrics, selection model, SQL builders.
   Pure functions only — no DOM, no database handle. */
"use strict";

(function () {
  /* Shared HTML/XML escaper — also safe inside SVG text nodes. */
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* Shared tokenizer (spec §2.3): lowercase, split on whitespace and dashes,
     strip surrounding punctuation, keep internal apostrophes and hyphens
     ("shan't", "to-day"). EVERY tab counts words through this function. */
  const tokenize = text => String(text).toLowerCase()
    .split(/[\s–—]+/)
    .map(w => w.replace(/^[^a-z0-9]+/, "").replace(/[^a-z0-9]+$/, ""))
    .filter(w => w.length > 0);

  /* Deliberately small and easy to edit. Titles (mr, mrs, miss, lady, sir)
     are NOT stopwords — titles are interesting in Austen. */
  const STOPWORDS = [
    "a", "about", "after", "again", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "been", "before", "being", "but", "by", "can", "could",
    "did", "do", "does", "down", "for", "from", "had", "has", "have", "he",
    "her", "hers", "him", "his", "how", "i", "if", "in", "into", "is", "it",
    "its", "may", "me", "might", "more", "most", "much", "must", "my", "no",
    "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other",
    "our", "out", "over", "own", "shall", "she", "should", "so", "some",
    "such", "than", "that", "the", "their", "them", "then", "there", "these",
    "they", "this", "those", "through", "to", "too", "under", "until", "up",
    "upon", "very", "was", "we", "were", "what", "when", "where", "which",
    "while", "who", "whom", "why", "will", "with", "would", "you", "your",
    "yours",
  ];

  function countTokens(texts, dropStopwords) {
    const stop = dropStopwords ? new Set(STOPWORDS) : null;
    const freq = new Map();
    texts.forEach(t => tokenize(t).forEach(w => {
      if (stop && stop.has(w)) return;
      freq.set(w, (freq.get(w) || 0) + 1);
    }));
    return freq;
  }

  /* Spec §2.3 metrics over a list of speech_act texts. */
  function textMetrics(texts) {
    let totalWords = 0, chars = 0, tokens = 0, letters = 0;
    const uniq = new Set();
    texts.forEach(t => {
      totalWords += t.split(/\s+/).filter(Boolean).length;
      chars += t.length;
      tokenize(t).forEach(w => { uniq.add(w); tokens += 1; letters += w.length; });
    });
    return {
      total_words: totalWords,
      chars: chars,
      unique_words: uniq.size,
      density: totalWords ? uniq.size / totalWords : 0,
      avg_word_length: tokens ? letters / tokens : 0,
    };
  }

  /* Distinctive words (spec §3.5): log2 ratio of add-one-smoothed relative
     frequencies. Words with fewer than minCount uses in A+B are ignored. */
  function distinctive(freqA, freqB, minCount, topN) {
    let NA = 0, NB = 0;
    freqA.forEach(v => { NA += v; });
    freqB.forEach(v => { NB += v; });
    const vocab = new Set([...freqA.keys(), ...freqB.keys()]);
    const V = vocab.size, scored = [];
    vocab.forEach(w => {
      const fa = freqA.get(w) || 0, fb = freqB.get(w) || 0;
      if (fa + fb < minCount) return;
      scored.push({
        word: w, a: fa, b: fb,
        score: Math.log2(((fa + 1) / (NA + V)) / ((fb + 1) / (NB + V))),
      });
    });
    scored.sort((p, q) => q.score - p.score);
    return { a: scored.slice(0, topN), b: scored.slice(-topN).reverse() };
  }

  const GROUP_VARS = {           // URL/UI key -> speaker column (whitelist)
    sex: "sex", soc_class: "soc_class", marital: "marital", age_cat: "age_cat",
  };
  const GROUP_LABELS = {
    sex: "Gender", soc_class: "Class / rank",
    marital: "Marital status", age_cat: "Age category",
  };
  const KINDS = ["speech", "narration", "letters"];
  const UNRECORDED = "~";        // URL token for NULL demographic values
  const LIST_SEP = "|";

  /* Kinds partition speech_act rows (spec §3.1): speech = spoken aloud
     outside letters; narration = narrator text outside letters;
     letters = anything inside <floatingText type="letter">. */
  function kindsWhere(kinds) {
    const parts = [];
    if (kinds.includes("speech")) parts.push("(sa.aloud = 1 AND sa.in_letter = 0)");
    if (kinds.includes("narration")) parts.push("(sa.narration = 1 AND sa.in_letter = 0)");
    if (kinds.includes("letters")) parts.push("sa.in_letter = 1");
    return parts.length ? "(" + parts.join(" OR ") + ")" : "0";
  }

  function whoWhere(sel) {
    if (sel.mode === "group") {
      const col = GROUP_VARS[sel.groupVar];
      if (!col || !sel.groups.length) return { sql: "0", params: [] };
      const vals = sel.groups.filter(g => g !== UNRECORDED);
      const conds = [];
      if (vals.length) {
        conds.push("sp." + col + " IN (" + vals.map(() => "?").join(",") + ")");
      }
      if (sel.groups.includes(UNRECORDED)) conds.push("sp." + col + " IS NULL");
      return {
        sql: "EXISTS (SELECT 1 FROM speech_act_speaker sas " +
          "JOIN speaker sp ON sas.speaker_id = sp.id " +
          "WHERE sas.speech_act_id = sa.id AND (" + conds.join(" OR ") + "))",
        params: vals,
      };
    }
    const chars = [], narBooks = [];
    (sel.who || []).forEach(tok => {
      if (/\.nar$/.test(tok)) narBooks.push(tok.replace(/\.nar$/, ""));
      else chars.push(tok);
    });
    const parts = [];
    let params = [];
    if (chars.length) {
      parts.push("EXISTS (SELECT 1 FROM speech_act_speaker sas " +
        "JOIN speaker sp ON sas.speaker_id = sp.id " +
        "WHERE sas.speech_act_id = sa.id AND sp.label IN (" +
        chars.map(() => "?").join(",") + "))");
      params = params.concat(chars);
    }
    narBooks.forEach(bl => {
      parts.push("(b.label = ? AND sa.narration = 1)");
      params.push(bl);
    });
    if (!parts.length) return { sql: "0", params: [] };
    return { sql: "(" + parts.join(" OR ") + ")", params: params };
  }

  /* Full query for the acts matching a selection, in reading order. */
  function actsSql(sel) {
    if (!sel.books.length || !sel.kinds.length) {
      return { sql: "SELECT 1 WHERE 0", params: [] };
    }
    const who = whoWhere(sel);
    const sql =
      "SELECT sa.id AS id, sa.seq AS seq, sa.chapter_index AS ch, " +
      "sa.conversation_index AS ci, sa.speech_act_index AS ri, " +
      "sa.narration AS narration, sa.in_letter AS in_letter, sa.text AS text, " +
      "b.label AS blabel, b.title AS title, c.label AS chlabel, " +
      "(SELECT GROUP_CONCAT(sp.name, ' and ') FROM speech_act_speaker sas " +
      " JOIN speaker sp ON sas.speaker_id = sp.id " +
      " WHERE sas.speech_act_id = sa.id) AS names " +
      "FROM speech_act sa " +
      "JOIN book b ON sa.book_id = b.id " +
      "JOIN chapter c ON c.book_id = sa.book_id AND c.chapter_index = sa.chapter_index " +
      "WHERE b.label IN (" + sel.books.map(() => "?").join(",") + ") " +
      "AND " + kindsWhere(sel.kinds) + " AND " + who.sql + " " +
      "ORDER BY b.label, sa.seq";
    return { sql: sql, params: sel.books.concat(who.params) };
  }

  /* URL round-trip. Everything the panel holds is bookmarkable (spec §3.1). */
  function selectionToParams(sel, params, prefix) {
    params.set(prefix + "books", sel.books.join(LIST_SEP));
    params.set(prefix + "mode", sel.mode === "group" ? "group" : "sp");
    if (sel.mode === "group") {
      params.set(prefix + "var", sel.groupVar);
      params.set(prefix + "groups", sel.groups.join(LIST_SEP));
      params.delete(prefix + "who");
    } else {
      params.set(prefix + "who", sel.who.join(LIST_SEP));
      params.delete(prefix + "var");
      params.delete(prefix + "groups");
    }
    params.set(prefix + "kinds", sel.kinds.join(LIST_SEP));
  }

  function selectionFromParams(params, prefix) {
    const list = k => {
      const v = params.get(prefix + k);
      return v === null ? null : v.split(LIST_SEP).filter(Boolean);
    };
    const kinds = (list("kinds") || ["speech"]).filter(k => KINDS.includes(k));
    return {
      books: list("books") || ["aus.001"],
      mode: params.get(prefix + "mode") === "group" ? "group" : "speakers",
      who: list("who"),               // null = absent; caller picks a default
      groupVar: GROUP_VARS[params.get(prefix + "var")]
        ? params.get(prefix + "var") : "sex",
      groups: list("groups") || [],
      kinds: kinds.length ? kinds : ["speech"],
    };
  }

  window.LabCore = {
    esc, tokenize, STOPWORDS, countTokens, textMetrics, distinctive,
    GROUP_VARS, GROUP_LABELS, KINDS, UNRECORDED, LIST_SEP,
    kindsWhere, whoWhere, actsSql, selectionToParams, selectionFromParams,
  };
})();
