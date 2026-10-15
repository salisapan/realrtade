// Plain card models. Code.js turns these into Card Service widgets.
// One Do it button on a proposal. A proof card shows what was read back.
// A mismatch card does not say the write succeeded.

var GlanceCards = (function () {
  function i18n() {
    if (typeof GlanceI18n !== 'undefined') return GlanceI18n;
    return require('./i18n.js');
  }

  function card(lang, widgets) {
    var L = i18n();
    return {
      header: 'Glance',
      lang: lang,
      rtl: L.rtl(lang),
      widgets: widgets
    };
  }

  function text(lang, value) {
    return { type: 'text', text: i18n().embed(lang, value) };
  }

  function dueLine(lang, due) {
    var L = i18n();
    var line = L.t(lang, 'due') + ': ' + L.isolateLtr(due);
    return text(lang, line);
  }

  function whenLine(lang, when) {
    var L = i18n();
    return text(lang, L.t(lang, 'when') + ': ' + L.isolateLtr(when));
  }

  function button(lang, key, action, params) {
    return {
      type: 'button',
      text: i18n().embed(lang, i18n().t(lang, key)),
      action: action,
      style: key === 'doIt' ? 'filled' : 'text',
      params: params || {}
    };
  }

  function doItButton(messageId, lang) {
    return button(lang, 'doIt', 'onDoIt', { messageId: String(messageId || ''), source: 'message' });
  }

  function proposal(decision, messageId, lang) {
    var L = i18n();
    if (decision.kind === 'hold') {
      var holdWhen = decision.dateIso + ' ' + (decision.hour < 10 ? '0' : '') + decision.hour + ':' + (decision.minute < 10 ? '0' : '') + decision.minute;
      return card(lang, [
        text(lang, L.t(lang, 'calendarHold')),
        text(lang, decision.title),
        whenLine(lang, holdWhen),
        doItButton(messageId, lang)
      ]);
    }
    if (decision.kind === 'schedule') {
      var when = decision.dateIso;
      if (Number.isInteger(decision.hour) && Number.isInteger(decision.minute)) {
        when = decision.dateIso + ' ' + (decision.hour < 10 ? '0' : '') + decision.hour + ':' + (decision.minute < 10 ? '0' : '') + decision.minute;
      }
      return card(lang, [
        text(lang, decision.title),
        whenLine(lang, when),
        text(lang, L.t(lang, 'schedule')),
        doItButton(messageId, lang)
      ]);
    }
    var widgets = [text(lang, decision.title)];
    if (decision.due) widgets.push(dueLine(lang, decision.due));
    widgets.push(doItButton(messageId, lang));
    return card(lang, widgets);
  }

  function undoButton(lang, opts) {
    if (!opts || opts.undo === false || !opts.messageId) return null;
    return button(lang, 'undo', 'onUndo', { messageId: String(opts.messageId), source: opts.source || 'message' });
  }

  function proof(view, lang, opts) {
    opts = opts || {};
    var L = i18n();
    var widgets;
    if (view && view.kind === 'hold') {
      widgets = [
        text(lang, L.t(lang, 'onCalendar')),
        text(lang, view.title),
        whenLine(lang, view.when),
        text(lang, L.t(lang, 'id') + ': ' + L.isolateLtr(view.id))
      ];
    } else if (view && view.kind === 'schedule') {
      widgets = [
        text(lang, L.t(lang, 'onCalendar')),
        text(lang, view.title),
        whenLine(lang, view.when),
        text(lang, L.t(lang, 'id') + ': ' + L.isolateLtr(view.id)),
        text(lang, L.t(lang, 'inTasks')),
        text(lang, view.taskTitle)
      ];
      if (view.taskDue) widgets.push(dueLine(lang, view.taskDue));
      widgets.push(text(lang, L.t(lang, 'id') + ': ' + L.isolateLtr(view.taskId)));
    } else {
      widgets = [text(lang, L.t(lang, 'inTasks'))];
      widgets.push(text(lang, view.title));
      if (view.due) widgets.push(dueLine(lang, view.due));
      widgets.push(text(lang, L.t(lang, 'id') + ': ' + L.isolateLtr(view.id)));
    }
    var undo = undoButton(lang, opts);
    if (undo) widgets.push(undo);
    return card(lang, widgets);
  }

  function unconfirmed(lang) {
    return card(lang, [text(lang, i18n().t(lang, 'couldntConfirm'))]);
  }

  function edited(lang, which) {
    var key = which === 'event' ? 'editedEvent' : 'edited';
    return card(lang, [text(lang, i18n().t(lang, key))]);
  }

  function undone(lang) {
    return card(lang, [text(lang, i18n().t(lang, 'undone'))]);
  }

  function quiet(lang) {
    return card(lang, [text(lang, i18n().t(lang, 'quiet'))]);
  }

  function homepage(next, lang) {
    var L = i18n();
    if (!next || !next.title) return card(lang, [text(lang, L.t(lang, 'openMessage'))]);
    var widgets = [text(lang, L.t(lang, 'next')), text(lang, next.title)];
    if (next.due) widgets.push(dueLine(lang, next.due));
    widgets.push(button(lang, 'doIt', 'onDoIt', { messageId: 'prefetch', source: 'prefetch' }));
    return card(lang, widgets);
  }

  function buttons(model) {
    var out = [];
    var widgets = (model && model.widgets) || [];
    for (var i = 0; i < widgets.length; i++) if (widgets[i].type === 'button') out.push(widgets[i]);
    return out;
  }

  return {
    proposal: proposal,
    proof: proof,
    unconfirmed: unconfirmed,
    edited: edited,
    undone: undone,
    quiet: quiet,
    homepage: homepage,
    buttons: buttons
  };
})();

if (typeof module !== 'undefined') module.exports = GlanceCards;
