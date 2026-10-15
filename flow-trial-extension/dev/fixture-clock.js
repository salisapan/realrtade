// The live Gate page only. Sets the row's clock to one hour ago so the
// sentence is inside the draft window on the day David opens it.
(() => {
  const node = document.querySelector('time');
  if (!node) return;
  node.setAttribute('datetime', new Date(Date.now() - 60 * 60 * 1000).toISOString());
})();
