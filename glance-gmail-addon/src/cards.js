// Plain card models. Code.js turns these into Card Service widgets.
// One Do it button on a proposal. A proof card shows the task that was
// read back. A mismatch card does not say the task was created.

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

  function button(lang, key, action, params) {
    return {
      type: 'button',
      text: i18n().embed(lang, i18n().t(lang, key)),
      action: action,
      style: key === 'doIt' ? 'filled' : 'text',
      params: params || {}
    };
  }

  function proposal(decision, messageId, lang) {
    var widgets = [text(lang, decision.title)];
    if (decision.due) widgets.push(dueLine(lang, decision.due));
    widgets.push(button(lang, 'doIt', 'onDoIt', { messageId: String(messageId || ''), source: 'message' }));
    return card(lang, widgets);
  }

  function proof(view, lang, opts) {
    opts = opts || {};
    var L = i18n();
    var widgets = [text(lang, L.t(lang, 'inTasks'))];
    widgets.push(text(lang, view.title));
    if (view.due) widgets.push(dueLine(lang, view.due));
    widgets.push(text(lang, L.t(lang, 'id') + ': ' + L.isolateLtr(view.id)));
    if (opts.undo !== false && opts.messageId) {
      widgets.push(button(lang, 'undo', 'onUndo', { messageId: String(opts.messageId), source: opts.source || 'message' }));
    }
    return card(lang, widgets);
  }

  function unconfirmed(lang) {
    return card(lang, [text(lang, i18n().t(lang, 'couldntConfirm'))]);
  }

  function edited(lang) {
    return card(lang, [text(lang, i18n().t(lang, 'edited'))]);
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
