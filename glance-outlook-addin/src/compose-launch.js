/* global Office, GlanceOutlookEngine */

// Event-based activation: OnNewMessageCompose (Outlook mobile + web). Never sends.

function onNewMessageCompose(event) {
  var item = Office.context.mailbox.item;
  if (!item || !item.body) {
    event.completed();
    return;
  }
  item.body.getAsync(Office.CoercionType.Text, function (read) {
    var prior = read.status === Office.AsyncResultStatus.Succeeded ? String(read.value || '') : '';
    var judged = GlanceOutlookEngine.judge({
      text: prior,
      subject: item.subject || '',
      sender: item.from ? { email: item.from.emailAddress, name: item.from.displayName } : null,
      to: [],
      ownAddresses: [],
      now: new Date(),
      surface: 'outlook',
      attachmentCount: 0
    });
    var draft = judged && judged.show && judged.process
      ? GlanceOutlookEngine.draftText(judged.process, { sender: item.from, subject: item.subject })
      : null;
    if (!draft) {
      event.completed();
      return;
    }
    item.body.setAsync(draft, { coercionType: Office.CoercionType.Text }, function (write) {
      if (write.status !== Office.AsyncResultStatus.Succeeded) {
        event.completed();
        return;
      }
      item.body.getAsync(Office.CoercionType.Text, function (back) {
        var body = back.status === Office.AsyncResultStatus.Succeeded ? String(back.value || '') : '';
        if (body.replace(/\s+/g, ' ').trim() !== draft.replace(/\s+/g, ' ').trim()) {
          item.body.setAsync(prior, { coercionType: Office.CoercionType.Text }, function () {
            event.completed();
          });
          return;
        }
        event.completed();
      });
    });
  });
}
