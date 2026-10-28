// UserContext / profile learn signal (C1): which ecosystems and accounts are connected.
// Portable no-op until a profile store exists; call sites stay stable when storage lands.
const FlowProfileHook = (() => {
  function onConnect(eco, account) {
    void eco;
    void account;
  }
  function onDisconnect(eco) {
    void eco;
  }
  return { onConnect, onDisconnect };
})();

if (typeof module !== 'undefined') module.exports = { FlowProfileHook };
else if (typeof globalThis !== 'undefined') globalThis.FlowProfileHook = FlowProfileHook;
