// Copy and markup from design/step-states-v1/step-states.js. The spec sheet
// keeps that file. This one paints the same rows inside a content script and
// does not listen on the host page. No chrome.* except getURL for the kit images.
const FlowStepKit = (() => {
  const MANUAL_D = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';

  function esc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const EN = {
    brand: 'Glance', intentLabel: 'Detected intent', will: 'Glance will', prepared: 'Prepared · nothing sent', done: 'Done',
    hold: 'Hold It', add: '+ Add a step', addPh: 'Type a step…',
    count: function (n, tools, sugg) {
      return '<b>+ Glance</b> can close this in <b class="file">' + n + ' step' + (n === 1 ? '' : 's') + '</b>' +
        (tools.length ? ' · ' + tools.map(esc).join(' · ') : '') + (sugg ? '<span class="chip-sugg"> · +' + sugg + ' suggested</span>' : '');
    },
    none: '<b>+ Glance</b> · tick at least one step'
  };
  const HE = {
    brand: 'Glance', intentLabel: 'כוונה שזוהתה', will: 'Glance יבצע', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע',
    hold: 'השהה', add: '+ הוסף צעד', addPh: 'הקלד צעד…',
    count: function (n, tools, sugg) {
      return '<b><bdi>+ Glance</bdi></b> יכול לסגור את זה ב-<b class="file">' + n + ' צעדים</b>' +
        (sugg ? '<span class="chip-sugg"> · <bdi dir="ltr">+' + sugg + '</bdi> מוצע</span>' : '');
    },
    none: '<b><bdi>+ Glance</bdi></b> · סמן לפחות צעד אחד'
  };

  function langOf(he) { return he ? HE : EN; }

  function asset(rel) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        return chrome.runtime.getURL('design/step-states-v1/' + rel);
      }
    } catch (e) { /* page preview */ }
    return rel;
  }

  function glyph(id) {
    if (typeof window !== 'undefined' && window.GLYPHS && !window.GLYPHS.manual) {
      window.GLYPHS.manual = { label: 'Manual', d: MANUAL_D };
    }
    if (typeof window !== 'undefined' && window.glyphSVG) return window.glyphSVG(id);
    return '';
  }

  function labelsFor(cfg) {
    const ui = (cfg && cfg.uiLang) || ((cfg && cfg.he) ? 'he' : 'en');
    const base = langOf(ui === 'he');
    if (typeof FlowDisplay === 'undefined' || typeof FlowDisplay.chrome !== 'function') return base;
    return Object.assign({}, base, FlowDisplay.chrome(ui));
  }

  function doItHTML(label, disabled) {
    const name = label || 'Do It';
    const off = disabled ? ' disabled aria-disabled="true"' : '';
    return '<button type="button" class="do-halo flow-chip" aria-label="' + esc(name) + '"' + off + '><img class="chip-do" src="' + esc(asset('do-it.png')) + '" alt=""><span class="doit-dark" role="img" aria-label="' + esc(name) + '">' + esc(name) + '</span></button>';
  }

  function dateChoicesHTML(choices, selected) {
    if (!choices || !choices.length) return '';
    return '<span class="chip-dates" role="group">' + choices.map(function (c) {
      const on = selected && c && c.iso === selected;
      return '<button type="button" class="chip-date" data-date-iso="' + esc(c && c.iso) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(c && c.label) + '</button>';
    }).join('') + '</span>';
  }

  function appB(app) { return '<b class="act-app"><bdi>' + esc(app) + '</bdi></b>'; }

  function pillsHTML(a, L) {
    const words = L || {};
    const vis = a.expanded ? a.files : a.files.slice(0, 3);
    const more = a.files.length - 3;
    return '<span class="act-files" role="group" aria-label="' + esc(words.attachments || 'Attachments') + '">' +
      vis.map(function (f, i) {
        return '<button type="button" class="ss-pill" data-f="' + i + '" aria-pressed="' + (f.on ? 'true' : 'false') + '"><span class="ss-pill-ck" aria-hidden="true"></span>' + esc(f.n || f.name) + '</button>';
      }).join('') +
      (a.files.length > 3 ? (a.expanded
        ? '<button type="button" class="ss-pill ss-pill-more" data-less="1">' + esc(words.less || 'Less') + '</button>'
        : '<button type="button" class="ss-pill ss-pill-more" data-more="1">+' + more + '</button>') : '') +
      '</span>';
  }

  function shownTag(tag, words) {
    const L = words || {};
    if (tag === 'Suggested') return L.suggested || tag;
    if (tag === 'Added') return L.added || tag;
    if (tag === 'Manual' || tag === 'Manual · for you') return L.manual || tag;
    if (tag === 'after Approve') return L.afterApprove || tag;
    return tag;
  }

  function rowHTML(a, L) {
    const words = L || {};
    if (a.kind === 'close') {
      return '<li class="act act-close' + (a.st ? ' ' + a.st : '') + '" data-close="1">' +
        '<span class="act-row"><span class="act-box act-lock" aria-hidden="true"></span>' +
        '<span class="act-glyph" data-glyph="glance">' + glyph('glance') + '</span>' +
        '<span class="act-body"><span class="act-text">' + a.text + '</span>' +
        (a.done ? '<span class="act-res"><span class="act-res-txt">' + a.done + '</span></span>' : '') +
        '</span><span class="act-tag">' + esc(shownTag(a.tag, words) || words.afterApprove || 'after Approve') + '</span></span></li>';
    }
    if (a.kind === 'manual') {
      return '<li class="act act-manual" data-step-id="' + esc(a.id || '') + '">' +
        '<span class="act-row"><span class="act-box act-none" aria-hidden="true"></span>' +
        '<span class="act-glyph" data-glyph="manual">' + glyph('manual') + '</span>' +
        '<span class="act-body"><span class="act-text">' + esc(a.text) + '</span></span>' +
        '<span class="act-tag">' + esc(shownTag(a.tag, words) || words.manual || 'Manual · for you') + '</span></span></li>';
    }
    const cls = 'act' + (a.kind === 'suggested' || a.suggested ? ' act-suggested' : '') + (a.added ? ' act-added' : '') + (a.kind === 'multi' ? ' act-multi' : '') + (a.st ? ' ' + a.st : '') + (a.expanded ? ' is-expanded' : '');
    const multi = a.kind === 'multi';
    const text = multi
      ? (typeof FlowDisplay !== 'undefined' && FlowDisplay.fillChrome
        ? FlowDisplay.fillChrome(words.saveFiles || 'Save {on} of {all} attachments', {
          on: '<b class="ss-n">' + a.files.filter(function (f) { return f.on; }).length + '</b>',
          all: a.files.length
        })
        : ('Save <b class="ss-n">' + a.files.filter(function (f) { return f.on; }).length + '</b> of ' + a.files.length + ' attachments'))
      : esc(a.text || '');
    const res = a.res || '';
    const checked = a.checked !== false;
    return '<li class="' + cls + '" data-step-id="' + esc(a.id || '') + '" data-app="' + esc(a.app || '') + '">' +
      (multi ? '<div class="act-row">' : '<label class="act-row">') +
      (multi ? '<label class="ss-contents">' : '') +
      '<input type="checkbox" class="act-check"' + (checked ? ' checked' : '') + '>' +
      '<span class="act-box" aria-hidden="true"></span>' +
      '<span class="act-glyph" data-glyph="' + esc(a.tool || '') + '">' + glyph(a.tool) + '</span>' +
      '<span class="act-body">' +
        (text ? '<span class="act-text"' + (a.user ? ' data-glance-user="1"' : '') + '>' + text + '</span>' : '') +
        (a.dest ? '<span class="act-dest" dir="ltr" data-glance-dest="1">' + esc(a.dest) + '</span>' : '') +
        (a.out ? '<span class="act-out">' + appB(a.app) + ' · ' + a.out + '</span>' : '') +
        (res ? '<span class="act-res">' + appB(a.app) + ' · <span class="act-res-txt">' + res + '</span></span>' : '') +
      '</span>' +
      (multi ? '</label>' : '') +
      (a.tag ? '<span class="act-tag ss-tag">' + esc(shownTag(a.tag, words)) + '</span>' : '') +
      (multi ? pillsHTML(a, words) : '') +
      (multi ? '</div>' : '</label>') + '</li>';
  }

  function chipHTML(cfg, L) {
    const c = cfg.chip || { mode: 'count' };
    const hold = c.noHold ? '' : '<button type="button" class="chip-hold">' + L.hold + '</button>';
    const waiting = c.needsDateChoice === true;
    return '<div class="chip chip-invoice">' + hold +
      (c.icon ? '<span class="ss-chip-glyph" aria-hidden="true">' + glyph(c.icon) + '</span>' : '') +
      '<span class="chip-txt">' + (c.q || '') + '</span>' +
      dateChoicesHTML(waiting || c.selectedIso ? c.dateChoices : null, c.selectedIso) +
      '<span class="chip-act"><button type="button" class="chip-x" aria-label="' + esc(L.dismiss || 'Dismiss') + '">×</button>' + doItHTML(L.doIt, waiting) + '</span></div>';
  }

  function addHTML(L) {
    return '<div class="ss-add" data-open="false">' +
      '<button type="button" class="ss-add-btn">' + L.add + '</button>' +
      '<div class="ss-add-row act-row">' +
        '<span class="act-box act-none" aria-hidden="true"></span>' +
        '<span class="act-glyph" data-glyph="you">' + glyph('you') + '</span>' +
        '<input type="text" class="ss-add-input" maxlength="80" placeholder="' + esc(L.addPh) + '" aria-label="' + esc(L.newStep || 'New step') + '">' +
        '<kbd class="ss-kbd">↵</kbd></div></div>';
  }

  function approveHTML(a) {
    if (!a) return '';
    const disabled = a.disabled === true;
    return '<div class="approve-banner' + (disabled ? ' ss-approve-off' : '') + '">' +
      '<div class="approve-meta"><div class="approve-title">' + esc(a.title) + '</div><div class="approve-sub">' + esc(a.sub) + '</div></div>' +
      '<button type="button" class="approve-btn"' + (disabled ? ' disabled aria-disabled="true"' : '') + '>' + esc((a && a.approveLabel) || 'Approve close') + '</button></div>';
  }

  function headHTML(cfg, L) {
    const icon = cfg.icon === 'done' ? 'living/key-done-512.png' : 'living/key-idle-512.png';
    return '<div class="gs-head"><img class="living-ico" src="' + esc(asset(icon)) + '" alt="" width="26" height="26">' +
      '<div class="gs-head-meta"><div class="gs-brand">' + L.brand + '</div><div class="gs-intent-label">' + L.intentLabel + '</div></div></div>' +
      (cfg.intent ? '<p class="gs-intent flow-chip-process-name">' + esc(cfg.intent) + '</p>' : '');
  }

  function rowsHTML(rows, L) {
    const labels = L || { suggested: 'Suggested', added: 'Added' };
    let html = '';
    let suggestedHead = false;
    let addedHead = false;
    (rows || []).forEach(function (a) {
      const suggested = a && !a.added && (a.suggested || a.tag === labels.suggested || a.tag === 'Suggested');
      if (suggested && !suggestedHead) {
        suggestedHead = true;
        html += '<li class="act-section" data-glance-section="suggested"><span class="acts-label">' + esc(labels.suggested) + '</span></li>';
      }
      if (a && a.added && !addedHead) {
        addedHead = true;
        html += '<li class="act-section" data-glance-section="added"><span class="acts-label">' + esc(labels.added) + '</span></li>';
      }
      html += rowHTML(a, labels);
    });
    return html;
  }

  function stageHTML(cfg) {
    const L = labelsFor(cfg);
    if (cfg && cfg.approve && !cfg.approve.approveLabel) cfg.approve.approveLabel = L.approve;
    const label = cfg.label === 'done' ? L.done : cfg.label === 'prepared' ? L.prepared : L.will;
    const rows = rowsHTML(cfg.rows, L);
    return '<div class="stage stage-live ss-stage" data-state="' + esc(cfg.state || 'propose') + '">' +
      '<div class="glance-surface g19 ss-gs"' + (cfg.he ? ' dir="rtl" lang="he"' : '') + '>' +
      headHTML(cfg, L) +
      '<div class="acts-head"><span class="acts-label">' + label + '</span></div>' +
      '<ol class="acts">' + rows + '</ol>' +
      addHTML(L) +
      approveHTML(cfg.approve) +
      chipHTML(cfg, L) +
      '</div></div>';
  }

  function syncChip(stage, cfg) {
    if (!stage || !cfg || !cfg.chip) return;
    const L = labelsFor(cfg);
    const txt = stage.querySelector('.chip-txt');
    if (!txt) return;
    if (cfg.chip.mode === 'count') {
      const rows = Array.prototype.slice.call(stage.querySelectorAll('li.act:not(.act-close):not(.act-manual):not(.act-section)'));
      const sel = rows.filter(function (li) {
        const cb = li.querySelector('.act-check');
        return cb && cb.checked;
      });
      const sugg = rows.filter(function (li) {
        const cb = li.querySelector('.act-check');
        return li.classList.contains('act-suggested') && cb && !cb.checked;
      }).length;
      const tools = [];
      sel.forEach(function (li) {
        const a = li.getAttribute('data-app');
        if (a && tools.indexOf(a) < 0) tools.push(a);
      });
      stage.classList.toggle('no-actions', sel.length === 0);
      txt.innerHTML = sel.length ? L.count(sel.length, tools, sugg) : L.none;
    } else if (cfg.chip.mode === 'files') {
      const files = (cfg.rows[0] && cfg.rows[0].files) || [];
      const on = files.filter(function (f) { return f.on; }).length;
      const cb = stage.querySelector('.act-check');
      const target = cfg.chip.target || 'Drive';
      stage.classList.toggle('no-actions', !(on > 0 && cb && cb.checked));
      txt.innerHTML = on
        ? ((typeof FlowDisplay !== 'undefined' && FlowDisplay.fillChrome)
          ? FlowDisplay.fillChrome(L.saveAsk || 'Save {on} of {all} attachments to {target}?', { on: '<b class="file">' + on + '</b>', all: files.length, target: esc(target) })
          : ('Save <b class="file">' + on + ' of ' + files.length + '</b> attachments to ' + esc(target) + '?'))
        : (L.pickFile || 'Pick at least one file');
    } else {
      txt.innerHTML = cfg.chip.q || '';
    }
  }

  function textOf(html) {
    return String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  return {
    EN: EN, HE: HE, esc: esc, asset: asset, glyph: glyph, stageHTML: stageHTML, syncChip: syncChip, textOf: textOf, rowHTML: rowHTML
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { FlowStepKit: FlowStepKit };
if (typeof globalThis !== 'undefined') globalThis.FlowStepKit = FlowStepKit;
