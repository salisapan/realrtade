// Outlook v1: read the full conversation for judgment — never the latest message alone.
// Portable: no chrome.*, no DOM, no network.
const FlowOutlookThreadV1 = (() => {
  // Mutant hook for tests only (latest-only path must fail CI).
  let pickMode = 'v1';

  function setPickMode(mode) {
    pickMode = mode === 'latest-only' ? 'latest-only' : 'v1';
  }

  function getPickMode() {
    return pickMode;
  }

  function sortByReceived(rows) {
    return (rows || []).slice().sort((a, b) => {
      const ta = Date.parse(a && a.receivedDateTime) || 0;
      const tb = Date.parse(b && b.receivedDateTime) || 0;
      return ta - tb;
    });
  }

  // Walk from the newest message backward; skip a quiet tail; use the newest show:true row.
  function pickJudgmentMessage(sortedRows, judgeRow) {
    const rows = sortByReceived(sortedRows);
    if (!rows.length) return null;
    if (pickMode === 'latest-only') {
      const last = rows[rows.length - 1];
      return last ? { row: last, text: judgeRow.textOf(last), show: true } : null;
    }
    const judged = rows.map((row) => {
      const text = judgeRow.textOf(row);
      const j = judgeRow.judge(text, row);
      return { row, text, show: Boolean(j && j.show === true), judgment: j };
    });
    let i = judged.length - 1;
    while (i >= 0 && !judged[i].show) i--;
    if (i < 0) {
      const last = judged[judged.length - 1];
      return last ? { row: last.row, text: last.text, show: false, judgment: last.judgment } : null;
    }
    return judged[i];
  }

  return { sortByReceived, pickJudgmentMessage, setPickMode, getPickMode };
})();

if (typeof module !== 'undefined') module.exports = { FlowOutlookThreadV1 };
else if (typeof globalThis !== 'undefined') globalThis.FlowOutlookThreadV1 = FlowOutlookThreadV1;
