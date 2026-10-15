// The live Gate page only. The default row is one hour ago so the sentence
// is inside the draft window on the day David opens it. A ?case= name
// changes that row before the content script reads it.
(() => {
  const row = document.querySelector('[role="row"]');
  const node = document.querySelector('time');
  const text = row && row.querySelector('[dir="auto"]');
  const header = document.querySelector('header');
  if (!node || !row || !text) return;
  let which = '';
  try { which = new URLSearchParams(location.search).get('case') || ''; } catch (e) { which = ''; }
  function at(ms) { node.setAttribute('datetime', new Date(ms).toISOString()); }
  const hour = 60 * 60 * 1000;
  if (which === 'greeting') text.textContent = 'היי';
  if (which === 'group' && header && !header.querySelector('[data-glance-fixture-group]')) {
    const chip = document.createElement('span');
    chip.setAttribute('data-glance-fixture-group', '1');
    chip.setAttribute('aria-label', 'Group');
    chip.textContent = 'Group';
    const members = document.createElement('span');
    members.textContent = 'Chat members';
    header.appendChild(chip);
    header.appendChild(members);
  }
  if (which === 'self-last') row.setAttribute('data-author', 'me');
  if (which === 'stale') at(Date.now() - 15 * 24 * hour);
  else if (which === 'future') at(Date.now() + 5 * 60 * 1000);
  else at(Date.now() - hour);
})();
