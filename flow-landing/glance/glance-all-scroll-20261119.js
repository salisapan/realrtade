/* brand.js */
/* Official brand marks for the tool UIs (v2).
   Each mark is the vendor's own logo file kept in glance/brands/ (Google Workspace, Microsoft 365, Slack, WhatsApp, Notion, Calendly,
   Jira, HubSpot via the vendors' published assets / Wikimedia Commons copies of the official files; Morning = the symbol cropped from
   the logo on greeninvoice.co.il). Nothing is redrawn. Rendered inside an <svg><image> so existing sizing rules (".x svg") still apply. */
(function () {
  'use strict';
  var F = { gmail: 'svg', calendar: 'svg', drive: 'svg', docs: 'svg', sheets: 'svg', meet: 'svg', slack: 'svg', teams: 'svg', outlook: 'svg',
            whatsapp: 'svg', onedrive: 'svg', todo: 'svg', notion: 'svg', calendly: 'svg', jira: 'svg', hubspot: 'svg', morning: 'png', xero: 'png' };
  var ALIAS = { outlookcal: 'outlook', whatsapp: 'slack' };
  var intl = (document.documentElement.lang || '').slice(0, 2) !== 'he';
  if (intl) ALIAS.morning = 'xero';
  var B = {};
  function mark(k) {
    return '<svg viewBox="0 0 24 24" class="brand-svg" aria-hidden="true" focusable="false"><image href="glance/brands/' + k + '.' + F[k] +
           '" x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet"/></svg>';
  }
  Object.keys(F).forEach(function (k) { B[k] = mark(k); });
  Object.keys(ALIAS).forEach(function (k) { B[k] = B[ALIAS[k]]; });
  /* generic folder glyph for "files" (not a vendor mark) */
  B.files = '<svg viewBox="0 0 24 24"><path fill="#5AC8FA" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.2l1.6 1.8H18.5A2.5 2.5 0 0 1 21 8.3v9.2a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>';
  function fill(root) {
    (root || document).querySelectorAll('[data-brand]').forEach(function (el) {
      if (el.querySelector('svg')) return;
      el.insertAdjacentHTML('afterbegin', B[el.getAttribute('data-brand')] || '');
    });
  }
  window.BRAND = B; window.fillBrand = fill;
  if (document.readyState !== 'loading') fill(); else document.addEventListener('DOMContentLoaded', function () { fill(); });
})();

/* glyphs.js */
/* Corner v21 — monochrome app glyphs (currentColor · gray by default, #0071e3 on hover/active).
   v2: vendor tools use the official full-colour marks from glance/brand.js; only Glance, You, File, Tasks and ClickUp stay monochrome. */
(function () {
  'use strict';
  var G = {
 "gmail": {
  "label": "Gmail",
  "d": "M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
 },
 "outlook": {
  "label": "Outlook",
  "d": "M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z"
 },
 "outlookcal": {
  "label": "Outlook Calendar",
  "d": "M4 4h2V2h2v2h8V2h2v2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 6v10h16V10zm8 1.4a3.85 3.85 0 1 1 0 7.7 3.85 3.85 0 1 1 0-7.7zm0 1.9a1.95 1.95 0 1 0 0 3.9 1.95 1.95 0 1 0 0-3.9z",
  "rule": "evenodd"
 },
 "whatsapp": {
  "label": "Slack",
  "d": "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
 },
 "slack": {
  "label": "Slack",
  "d": "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
 },
 "teams": {
  "label": "Teams",
  "d": "M20.625 8.127q-.55 0-1.025-.205-.475-.205-.832-.563-.358-.357-.563-.832Q18 6.053 18 5.502q0-.54.205-1.02t.563-.837q.357-.358.832-.563.474-.205 1.025-.205.54 0 1.02.205t.837.563q.358.357.563.837.205.48.205 1.02 0 .55-.205 1.025-.205.475-.563.832-.357.358-.837.563-.48.205-1.02.205zm0-3.75q-.469 0-.797.328-.328.328-.328.797 0 .469.328.797.328.328.797.328.469 0 .797-.328.328-.328.328-.797 0-.469-.328-.797-.328-.328-.797-.328zM24 10.002v5.578q0 .774-.293 1.46-.293.685-.803 1.194-.51.51-1.195.803-.686.293-1.459.293-.445 0-.908-.105-.463-.106-.85-.329-.293.95-.855 1.729-.563.78-1.319 1.336-.756.557-1.67.861-.914.305-1.898.305-1.148 0-2.162-.398-1.014-.399-1.805-1.102-.79-.703-1.312-1.664t-.674-2.086h-5.8q-.411 0-.704-.293T0 16.881V6.873q0-.41.293-.703t.703-.293h8.59q-.34-.715-.34-1.5 0-.727.275-1.365.276-.639.75-1.114.475-.474 1.114-.75.638-.275 1.365-.275t1.365.275q.639.276 1.114.75.474.475.75 1.114.275.638.275 1.365t-.275 1.365q-.276.639-.75 1.113-.475.475-1.114.75-.638.276-1.365.276-.188 0-.375-.024-.188-.023-.375-.058v1.078h10.875q.469 0 .797.328.328.328.328.797zM12.75 2.373q-.41 0-.78.158-.368.158-.638.434-.27.275-.428.639-.158.363-.158.773 0 .41.158.78.159.368.428.638.27.27.639.428.369.158.779.158.41 0 .773-.158.364-.159.64-.428.274-.27.433-.639.158-.369.158-.779 0-.41-.158-.773-.159-.364-.434-.64-.275-.275-.639-.433-.363-.158-.773-.158zM6.937 9.814h2.25V7.94H2.814v1.875h2.25v6h1.875zm10.313 7.313v-6.75H12v6.504q0 .41-.293.703t-.703.293H8.309q.152.809.556 1.5.405.691.985 1.19.58.497 1.318.779.738.281 1.582.281.926 0 1.746-.352.82-.351 1.436-.966.615-.616.966-1.43.352-.815.352-1.752zm5.25-1.547v-5.203h-3.75v6.855q.305.305.691.452.387.146.809.146.469 0 .879-.176.41-.175.715-.48.304-.305.48-.715t.176-.879Z"
 },
 "morning": {
  "label": "Morning",
  "d": "M5 17a7 7 0 0 1 14 0zM2 18.6h20v2.2H2zM11 2.6h2v4.2h-2zM3.5 7.1l1.5-1.5 3 3-1.5 1.5zM20.5 7.1 19 5.6l-3 3 1.5 1.5zM.8 12.6h3.8v2H.8zM19.4 12.6h3.8v2h-3.8z"
 },
 "drive": {
  "label": "Drive",
  "d": "M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z"
 },
 "docs": {
  "label": "Docs",
  "d": "M14.727 6.727H14V0H4.91c-.905 0-1.637.732-1.637 1.636v20.728c0 .904.732 1.636 1.636 1.636h14.182c.904 0 1.636-.732 1.636-1.636V6.727h-6zm-.545 10.455H7.09v-1.364h7.09v1.364zm2.727-3.273H7.091v-1.364h9.818v1.364zm0-3.273H7.091V9.273h9.818v1.363zM14.727 6h6l-6-6v6z"
 },
 "sheets": {
  "label": "Sheets",
  "d": "M11.318 12.545H7.91v-1.909h3.41v1.91zM14.728 0v6h6l-6-6zm1.363 10.636h-3.41v1.91h3.41v-1.91zm0 3.273h-3.41v1.91h3.41v-1.91zM20.727 6.5v15.864c0 .904-.732 1.636-1.636 1.636H4.909a1.636 1.636 0 0 1-1.636-1.636V1.636C3.273.732 4.005 0 4.909 0h9.318v6.5h6.5zm-3.273 2.773H6.545v7.909h10.91v-7.91zm-6.136 4.636H7.91v1.91h3.41v-1.91z"
 },
 "calendar": {
  "label": "Calendar",
  "d": "M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z"
 },
 "tasks": {
  "label": "Tasks",
  "d": "M11.383.617C5.097.617 0 5.714 0 12c0 6.286 5.097 11.383 11.383 11.383 6.286 0 11.38-5.097 11.38-11.383a11.34 11.34 0 0 0-.878-4.389l-3.203 3.203c.062.387.1.782.1 1.186a7.398 7.398 0 1 1-7.4-7.398c1.499 0 2.889.448 4.054 1.214l2.857-2.857a11.325 11.325 0 0 0-6.91-2.342zm9.674.756c-.292 0-.583.112-.805.334-2.97 2.965-5.934 5.934-8.9 8.902L9.596 8.854a1.139 1.139 0 0 0-1.61 0l-1.775 1.773a1.139 1.139 0 0 0 0 1.61l4.166 4.163a1.421 1.421 0 0 0 2.012 0L23.666 5.121a1.136 1.136 0 0 0 0-1.61l-1.805-1.804a1.136 1.136 0 0 0-.804-.334z"
 },
 "todo": {
  "label": "Microsoft To Do",
  "d": "M9.1 18.6 2.7 12.2a1.6 1.6 0 0 1 0-2.26l1.7-1.7a1.6 1.6 0 0 1 2.26 0l3.57 3.57 8.43-8.43a1.6 1.6 0 0 1 2.26 0l1.7 1.7a1.6 1.6 0 0 1 0 2.26L11.37 18.6a1.6 1.6 0 0 1-2.26 0z"
 },
 "onedrive": {
  "label": "OneDrive",
  "d": "M19.453 9.95q.961.058 1.787.468.826.41 1.442 1.066.615.657.966 1.512.352.856.352 1.816 0 1.008-.387 1.893-.386.885-1.049 1.547-.662.662-1.546 1.049-.885.387-1.893.387H6q-1.242 0-2.332-.475-1.09-.475-1.904-1.29-.815-.814-1.29-1.903Q0 14.93 0 13.688q0-.985.31-1.887.311-.903.862-1.658.55-.756 1.324-1.325.774-.568 1.711-.861.434-.129.85-.187.416-.06.861-.082h.012q.515-.786 1.207-1.413.691-.627 1.5-1.066.808-.44 1.705-.668.896-.229 1.845-.229 1.278 0 2.456.417 1.177.416 2.144 1.16.967.744 1.658 1.78.692 1.038 1.008 2.28zm-7.265-4.137q-1.325 0-2.52.544-1.195.545-2.04 1.565.446.117.85.299.405.181.792.416l4.78 2.86 2.731-1.15q.27-.117.545-.204.276-.088.58-.147-.293-.937-.855-1.705-.563-.768-1.319-1.318-.755-.551-1.658-.856-.902-.304-1.886-.304zM2.414 16.395l9.914-4.184-3.832-2.297q-.586-.351-1.23-.539-.645-.188-1.325-.188-.914 0-1.722.364-.809.363-1.412.978-.604.616-.955 1.436-.352.82-.352 1.723 0 .703.234 1.423.235.721.68 1.284zm16.711 1.793q.563 0 1.078-.176.516-.176.961-.516l-7.23-4.324-10.301 4.336q.527.328 1.13.504.604.175 1.237.175zm3.012-1.852q.363-.727.363-1.523 0-.774-.293-1.407t-.791-1.072q-.498-.44-1.166-.68-.668-.24-1.406-.24-.422 0-.838.1t-.815.252q-.398.152-.785.334-.386.181-.761.345Z"
 },
 "meet": {
  "label": "Google Meet",
  "d": "M3.6 5.5h9.9a2 2 0 0 1 2 2v2.3l4.6-3.5a.9.9 0 0 1 1.4.7v10a.9.9 0 0 1-1.4.7l-4.6-3.5v2.3a2 2 0 0 1-2 2H3.6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"
 },
 "clickup": {
  "label": "ClickUp",
  "d": "M2 18.439l3.69-2.828c1.961 2.56 4.044 3.739 6.363 3.739 2.307 0 4.33-1.166 6.203-3.704L22 18.405C19.298 22.065 15.941 24 12.053 24 8.178 24 4.788 22.078 2 18.439zM12.04 6.15l-6.568 5.66-3.036-3.52L12.055 0l9.543 8.296-3.05 3.509z"
 },
 "notion": {
  "label": "Notion",
  "d": "M5.2 3.2h9.1l4.5 4.4v13.2a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 20.8V4.4a1.2 1.2 0 0 1 1.2-1.2zm8.2 1.5v3.6h3.7M8 11.2h8v1.6H8zm0 3.2h8v1.6H8zm0 3.2h5.2v1.6H8z"
 },
 "file": {
  "label": "File",
  "d": "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.8V9h5.2zM8 13v2h8v-2zm0 4v2h5v-2z",
  "rule": "evenodd"
 },
 "glance": {
  "label": "Glance",
  "d": "M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 3.4a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 1 1 0-13.2z",
  "rule": "evenodd"
 },
 "you": {
  "label": "You",
  "d": "M11 5h2v14h-2zM5 11h14v2H5z"
 }
};
  function glyphSVG(id, cls) {
    /* v2: tools with an official mark render it in full colour (glance/brand.js); only non-vendor glyphs stay monochrome */
    if (window.BRAND && window.BRAND[id] && id !== 'files') return window.BRAND[id].replace('class="brand-svg"', 'class="' + (cls || 'glyph') + ' brand-svg"');
    var g = G[id];
    if (!g) return '';
    return '<svg viewBox="0 0 24 24" class="' + (cls || 'glyph') + '" aria-hidden="true" focusable="false"><path fill="currentColor"' + (g.rule ? ' fill-rule="' + g.rule + '"' : '') + ' d="' + g.d + '"/></svg>';
  }
  function fillGlyphs(root) {
    (root || document).querySelectorAll('[data-glyph]').forEach(function (el) {
      if (el.querySelector('svg')) return;
      el.insertAdjacentHTML('afterbegin', glyphSVG(el.getAttribute('data-glyph')));
    });
  }
  if ((document.documentElement.lang || '').slice(0, 2) !== 'he' && G.morning) G.morning.label = 'Xero';
  window.GLYPHS = G;
  window.glyphSVG = glyphSVG;
  window.fillGlyphs = fillGlyphs;
  if (document.readyState !== 'loading') fillGlyphs();
  else document.addEventListener('DOMContentLoaded', function () { fillGlyphs(); });
})();

/* theme.js */
/* Corner v21 — theme toggle (Light default · Dark = Flow night). Shared by glance.html + integrations-proposals.html */
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'glance.ui.theme'; /* sessionStorage: day by default on every new visit, independent of Flow's flow.theme */
  function current() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    try { sessionStorage.setItem(KEY, theme); } catch (e) {}
    var label = document.getElementById('theme-label');
    var btn = document.getElementById('btn-theme');
    var lang = (document.documentElement.lang || '').slice(0, 2) || 'en';
    var he = lang === 'he';
    var S = (window.GLANCE_I18N && window.GLANCE_I18N.STR && window.GLANCE_I18N.STR[lang]) || null;
    if (label) label.textContent = theme === 'dark' ? ((S && S.light) || (he ? 'בהיר' : 'Light')) : ((S && S.dark) || (he ? 'כהה' : 'Dark'));
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? ((S && S.themeToLight) || (he ? 'מצב יום' : 'Switch to light theme')) : ((S && S.themeToDark) || (he ? 'מצב לילה' : 'Switch to dark theme')));
    document.dispatchEvent(new CustomEvent('glance:theme', { detail: theme }));
  }
  function init() {
    apply(current());
    var btn = document.getElementById('btn-theme');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); apply(current() === 'dark' ? 'light' : 'dark'); });
  }
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();

/* integrations.js */
/* Corner v21 — integration components (vanilla ports, palette-locked).
   v20 · glance.html uses TWO: A Orbiting Circles (upper overview, initOrbit20) + B Animated Beam (lower, one ask → many tools, initBeam20).
   A · Orbiting Circles   — Magic UI (Dillion Verma) · https://21st.dev/@dillionverma/components/orbiting-circles
   B · Animated Beam      — Magic UI (Dillion Verma) · https://21st.dev/@dillionverma/components/animated-beam
   C · 3D Marquee         — Magic UI Marquee, 3D demo · https://21st.dev/@dillionverma/components/marquee
   Glyphs: glyphs.js (gray by default, #0071e3 on hover/active). */
(function () {
  'use strict';
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function g(id) { return window.glyphSVG ? window.glyphSVG(id) : ''; }
  function label(id) { return (window.GLYPHS && window.GLYPHS[id] && window.GLYPHS[id].label) || id; }

  /* ---------------- B · Animated Beam ---------------- */
  var STORIES = [
    { from: 'gmail', to: ['morning', 'calendar'], cap: 'Gmail · “issue the October invoice” → Xero · Calendar' },
    { from: 'slack', to: ['morning'], cap: 'Slack · “confirm the receipt today?” → Xero' },
    { from: 'outlook', to: ['calendar'], cap: 'Outlook · “confirm Thu 11:00?” → Calendar' },
    { from: 'slack', to: ['docs', 'todo'], cap: 'Slack · “own the kickoff notes” → Docs · To Do' },
    { from: 'gmail', to: ['drive'], cap: 'Gmail · “share the deck with Nora” → Drive' },
    { from: 'teams', to: ['sheets', 'onedrive'], cap: 'Teams · “update the Q4 budget” → Sheets · OneDrive' },
  ];

  function initBeam(root) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'beam-svg');
    svg.setAttribute('aria-hidden', 'true');
    root.insertBefore(svg, root.firstChild);
    var hub = root.querySelector('.hub-core');
    var cap = root.querySelector('.beam-cap-live');
    var paths = {}; // node id → {base, pulse, anim}
    var uid = 'b' + Math.random().toString(36).slice(2, 7);

    function center(el, side) {
      var r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
      var x = side === 'r' ? r.right - R.left : side === 'l' ? r.left - R.left : r.left - R.left + r.width / 2;
      return { x: x, y: r.top - R.top + r.height / 2 };
    }
    function build() {
      var R = root.getBoundingClientRect();
      if (R.width < 80 || R.height < 80) return; // not laid out yet
      svg.setAttribute('viewBox', '0 0 ' + R.width + ' ' + R.height);
      svg.setAttribute('width', R.width); svg.setAttribute('height', R.height);
      Object.keys(paths).forEach(function (k) { if (paths[k].anim) paths[k].anim.cancel(); });
      svg.innerHTML = '';
      paths = {};
      var defs = document.createElementNS(SVGNS, 'defs');
      svg.appendChild(defs);
      var hc = hub.getBoundingClientRect();
      $all('.tool[data-node]', root).forEach(function (tile, i) {
        var id = tile.getAttribute('data-node');
        var out = !!tile.closest('.beam-out');
        var t = center(tile, out ? 'l' : 'r');
        var h = { x: (out ? hc.right : hc.left) - R.left, y: hc.top - R.top + hc.height / 2 };
        var a = out ? h : t, b = out ? t : h;
        var dx = (b.x - a.x) * 0.5;
        var d = 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y;
        var gid = uid + '-g' + i;
        var grad = document.createElementNS(SVGNS, 'linearGradient');
        grad.setAttribute('id', gid); grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('x1', a.x); grad.setAttribute('y1', a.y); grad.setAttribute('x2', b.x); grad.setAttribute('y2', b.y);
        grad.innerHTML = '<stop offset="0" stop-color="#0071e3" stop-opacity=".15"/><stop offset=".55" stop-color="#0071e3"/><stop offset="1" stop-color="#59a3ed"/>';
        defs.appendChild(grad);
        var base = document.createElementNS(SVGNS, 'path');
        base.setAttribute('d', d); base.setAttribute('class', 'beam-base');
        var pulse = document.createElementNS(SVGNS, 'path');
        pulse.setAttribute('d', d); pulse.setAttribute('class', 'beam-pulse'); pulse.setAttribute('stroke', 'url(#' + gid + ')');
        svg.appendChild(base); svg.appendChild(pulse);
        var L = pulse.getTotalLength();
        var dash = Math.min(90, L * 0.32);
        pulse.style.strokeDasharray = dash + ' ' + (L + dash);
        pulse.style.strokeDashoffset = REDUCE ? String(-L * 0.4) : String(dash);
        var anim = null;
        if (!REDUCE && pulse.animate) {
          anim = pulse.animate([{ strokeDashoffset: dash }, { strokeDashoffset: -L }], {
            duration: 2600 + (i % 5) * 380, iterations: Infinity, delay: (out ? 900 : 0) + (i * 271) % 1700, easing: 'cubic-bezier(.4,0,.2,1)',
          });
        }
        paths[id] = { base: base, pulse: pulse, anim: anim, tile: tile };
      });
      paint();
    }
    var story = 0, hover = null;
    function paint() {
      var s = STORIES[story % STORIES.length];
      var hot = hover ? [hover] : [s.from].concat(s.to);
      Object.keys(paths).forEach(function (id) {
        var on = hot.indexOf(id) >= 0;
        paths[id].base.classList.toggle('hot', on);
        paths[id].pulse.classList.toggle('hot', on);
        paths[id].tile.classList.toggle('is-hot', on);
      });
      root.classList.toggle('has-hot', true);
      if (cap) cap.textContent = hover ? label(hover) + ' · Glance floats over it' : s.cap;
    }
    $all('.tool[data-node]', root).forEach(function (tile) {
      tile.addEventListener('pointerenter', function () { hover = tile.getAttribute('data-node'); paint(); });
      tile.addEventListener('pointerleave', function () { hover = null; paint(); });
      tile.addEventListener('focus', function () { hover = tile.getAttribute('data-node'); paint(); });
      tile.addEventListener('blur', function () { hover = null; paint(); });
    });
    if (!REDUCE) setInterval(function () { if (!hover) { story += 1; paint(); } }, 3200);
    var raf = 0;
    function rebuild() { cancelAnimationFrame(raf); raf = requestAnimationFrame(build); }
    if (window.ResizeObserver) new ResizeObserver(rebuild).observe(root);
    window.addEventListener('resize', rebuild);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
    build();
  }

  /* ---------------- A · Orbiting Circles ---------------- */
  function initOrbit(root) {
    $all('.orbit-ring', root).forEach(function (ring) {
      var items = $all('.orb', ring);
      var n = items.length;
      items.forEach(function (it, i) { it.style.setProperty('--angle', (360 / n) * i); });
    });
  }

  /* ---------------- C · 3D Marquee ---------------- */
  function initMarquee3d(root) {
    var ids = (root.getAttribute('data-tools') || '').split(/\s+/).filter(Boolean);
    var cols = Number(root.getAttribute('data-cols') || 4);
    var grid = root.querySelector('.m3d-grid');
    for (var c = 0; c < cols; c++) {
      var col = document.createElement('div');
      col.className = 'm3d-col' + (c % 2 ? ' rev' : '');
      col.style.setProperty('--dur', (26 + c * 5) + 's');
      var track = document.createElement('div');
      track.className = 'm3d-track';
      var seq = ids.slice(c * 3).concat(ids.slice(0, c * 3));
      var html = seq.map(function (id) {
        return '<div class="m3d-tile" tabindex="0"><span class="m3d-ic">' + g(id) + '</span><span class="m3d-name">' + label(id) + '</span></div>';
      }).join('');
      track.innerHTML = html + html; // seamless loop
      col.appendChild(track);
      grid.appendChild(col);
    }
  }


  /* =================================================================
     v20 · A (upper) — Orbiting Circles overview
     rAF-driven: each orb is placed every frame from one angle per ring,
     so the two rings counter-rotate smoothly and can ease to a crawl on
     hover (no CSS keyframe jump). Geometry follows the stage width.
     ================================================================= */
  function initOrbit20(stage) {
    var rings = $all('.o20-ring', stage).map(function (el) {
      var orbs = $all('.o20-orb', el);
      return { el: el, orbs: orbs, kind: el.getAttribute('data-ring'), speed: Number(el.getAttribute('data-speed') || 6), theta: el.getAttribute('data-ring') === 'out' ? -12 : 18, r: 0 };
    });
    var tracks = stage.querySelector('.o20-tracks');
    var W = 0, H = 0, rate = 1, target = 1, last = 0, visible = true, orbS = 52;
    function layout() {
      var R = stage.getBoundingClientRect();
      if (R.width < 80 || R.height < 80) return; // not laid out yet
      W = R.width; H = R.height;
      var mobile = W < 520;
      orbS = mobile ? 42 : 54;
      var rOut = Math.min(232, (Math.min(W, H) - orbS) / 2 - 10);
      var rIn = Math.round(rOut * 0.585);
      rings.forEach(function (rg) { rg.r = rg.kind === 'out' ? rOut : rIn; });
      stage.style.setProperty('--rin', rIn + 'px');
      stage.style.setProperty('--rout', rOut + 'px');
      stage.style.setProperty('--orb', orbS + 'px');
      if (tracks) {
        var cx = W / 2, cy = H / 2;
        tracks.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        tracks.setAttribute('width', W); tracks.setAttribute('height', H);
        var uid = 'o' + Math.random().toString(36).slice(2, 7);
        tracks.innerHTML =
          '<defs><linearGradient id="' + uid + 'a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--o20-tk-a)"/><stop offset="1" style="stop-color:var(--o20-tk-b)"/></linearGradient>' +
          '<linearGradient id="' + uid + 's" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--o20-sheen);stop-opacity:0"/><stop offset="1" style="stop-color:var(--o20-sheen);stop-opacity:1"/></linearGradient></defs>' +
          '<circle class="o20-tk" cx="' + cx + '" cy="' + cy + '" r="' + rIn + '" stroke="url(#' + uid + 'a)"/>' +
          '<circle class="o20-tk o20-tk-out" cx="' + cx + '" cy="' + cy + '" r="' + rOut + '" stroke="url(#' + uid + 'a)"/>' +
          '';
        // sheen arcs live in their own small SVGs, rotated with a CSS transform (compositor-only, no SVG repaint per frame)
        $all('.o20-sheen', stage).forEach(function (n) { n.remove(); });
        rings.forEach(function (rg) {
          var r = rg.r, sz = 2 * r + 4;
          var el = document.createElementNS(SVGNS, 'svg');
          el.setAttribute('class', 'o20-sheen'); el.setAttribute('aria-hidden', 'true');
          el.setAttribute('width', sz); el.setAttribute('height', sz); el.setAttribute('viewBox', '0 0 ' + sz + ' ' + sz);
          el.style.left = (cx - sz / 2) + 'px'; el.style.top = (cy - sz / 2) + 'px';
          el.innerHTML = '<defs><linearGradient id="' + uid + rg.kind + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--o20-sheen);stop-opacity:0"/><stop offset="1" style="stop-color:var(--o20-sheen);stop-opacity:1"/></linearGradient></defs>' +
            '<circle cx="' + sz / 2 + '" cy="' + sz / 2 + '" r="' + r + '" stroke="url(#' + uid + rg.kind + ')" stroke-dasharray="' + (r * (rg.kind === 'out' ? 0.9 : 1.1)) + ' ' + (r * 7) + '"/>';
          stage.insertBefore(el, tracks.nextSibling);
          rg.sheen = el;
        });
      }
      place();
    }
    function place() {
      var cx = W / 2, cy = H / 2;
      rings.forEach(function (rg) {
        var n = rg.orbs.length;
        rg.orbs.forEach(function (o, i) {
          var a = (rg.theta + (360 / n) * i - 90) * Math.PI / 180;
          var x = cx + rg.r * Math.cos(a) - orbS / 2, y = cy + rg.r * Math.sin(a) - orbS / 2;
          o.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
        });
        if (rg.sheen) rg.sheen.style.transform = 'rotate(' + (rg.theta * 1.6).toFixed(2) + 'deg)';
      });
    }
    function frame(now) {
      var dt = last ? Math.min(64, now - last) : 16; last = now;
      rate += (target - rate) * Math.min(1, dt / 260); // ease toward target speed
      rings.forEach(function (rg) { rg.theta += rg.speed * rate * dt / 1000; });
      place();
      if (visible) requestAnimationFrame(frame); else last = 0;
    }
    stage.addEventListener('pointerenter', function () { target = 0.12; });
    stage.addEventListener('pointerleave', function () { target = 1; });
    stage.addEventListener('focusin', function () { target = 0.12; });
    stage.addEventListener('focusout', function () { target = 1; });
    var raf = 0;
    function relayout() { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); }
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(stage);
    window.addEventListener('resize', relayout);
    layout();
    stage.classList.add('is-ready');
    if (REDUCE) return;
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        var v = es[0].isIntersecting;
        if (v && !visible) { visible = true; requestAnimationFrame(frame); }
        visible = v;
      }, { rootMargin: '120px' }).observe(stage);
    }
    requestAnimationFrame(frame);
  }

  /* =================================================================
     v20 · B (lower) — Animated Beam: one ask → many tools
     Cycles real cases (same action lists as the demos). The source beams
     INTO Glance, then Glance beams OUT to each tool in sequence. Paths are
     re-measured on resize; comets + route reveal run on rAF.
     ================================================================= */
  var LABEL20 = { morning: 'Morning', gmail: 'Gmail', calendar: 'Calendar', drive: 'Drive', slack: 'Slack', whatsapp: 'Slack', outlookcal: 'Outlook Calendar', outlook: 'Outlook', file: 'Files' };
  var CASES20 = [
    { id: 'invoice', src: 'file', to: ['drive', 'morning'], what: 'Brief', who: 'from Files', q: '“The signed brief just landed.”', steps: 2 },
    { id: 'payment', src: 'slack', to: ['calendar', 'slack'], what: 'AC visit', who: 'from David', q: '“Schedule the AC technician?”', steps: 2 },
    { id: 'calendar', src: 'outlook', to: ['outlookcal', 'outlook'], what: 'Kickoff', who: 'from Nora', q: '“Confirm Thu 11:00?”', steps: 2 },
    { id: 'file', src: 'file', to: ['drive'], what: 'Brief', who: 'filed', q: '“The signed brief just landed.”', steps: 2 },
    { id: 'whatsapp', src: 'slack', to: ['slack', 'calendar'], what: 'AC visit', who: 'from David', q: '“Schedule the AC technician?”', steps: 2 },
    { id: 'outlook', src: 'outlook', to: ['outlookcal', 'outlook'], what: 'Kickoff', who: 'from Nora in Outlook', q: '“Confirm Thu 11:00?”', steps: 2 },
  ];
  var LANG20 = (document.documentElement.lang || '').slice(0, 2) || 'en';
  var HE20 = LANG20 === 'he';
  if (!HE20) LABEL20.morning = 'Xero';
  var I1820 = window.GLANCE_I18N || {};
  if (HE20) {
    var HEC = {
      invoice: { what: 'בריף', who: 'מקבצים', q: '״הבריף החתום נחת עכשיו.״' },
      payment: { what: 'טכנאי', who: 'מדוד', q: '״לתאם טכנאי למזגן?״' },
      calendar: { what: 'פגישה', who: 'מנועה', q: '״לשריין את חמישי לקיקאוף?״' },
      file: { what: 'בריף', who: 'תויק', q: '״הבריף החתום נחת עכשיו.״' },
      whatsapp: { what: 'טכנאי', who: 'מדוד', q: '״לתאם טכנאי למזגן?״' },
      outlook: { what: 'קיקאוף', who: 'מנועה באאוטלוק', q: '״מאשרת חמישי 11:00?״' }
    };
    CASES20.forEach(function (c) { var h = HEC[c.id]; if (h) { c.what = h.what; c.who = h.who; c.q = h.q; } });
  } else if (I1820.CASES20 && I1820.CASES20[LANG20]) {
    CASES20.forEach(function (c) { var h = I1820.CASES20[LANG20][c.id]; if (h) { c.what = h.what; c.who = h.who; c.q = h.q; } });
  }
  if (I1820.STORIES && I1820.STORIES[LANG20] && typeof STORIES !== 'undefined') {
    I1820.STORIES[LANG20].forEach(function (cap, i) { if (STORIES[i]) STORIES[i].cap = cap; });
  }
  var DUR20 = 4200, T_IN = 180, D_IN = 720, T_OUT = 1040, GAP_OUT = 480, D_OUT = 660;
  function ease(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function initBeam20(root) {
    var svg = root.querySelector('.b20-svg');
    var core = root.querySelector('.b20-core');
    var sec = root.closest('section') || root.parentNode;
    var line = sec.querySelector('.b20-line');
    var pills = $all('.b20-pill', sec);
    var srcTiles = {}, dstTiles = {};
    $all('.b20-src .b20-tile', root).forEach(function (t) { srcTiles[t.getAttribute('data-node')] = t; });
    $all('.b20-dst .b20-tile', root).forEach(function (t) { dstTiles[t.getAttribute('data-node')] = t; });
    var links = {}; // key → {base, route, comet, head, L, kind}
    var uid = 'b' + Math.random().toString(36).slice(2, 7);
    var idx = 0, start = performance.now(), hovering = false, manualUntil = 0, visible = true;

    function rel(el) {
      var r = el.getBoundingClientRect(), R = root.getBoundingClientRect();
      return { l: r.left - R.left, t: r.top - R.top, r: r.right - R.left, b: r.bottom - R.top, w: r.width, h: r.height };
    }
    function curve(a, b, vertical) {
      if (vertical) { var dy = (b.y - a.y) * 0.55; return 'M' + a.x + ',' + a.y + ' C' + a.x + ',' + (a.y + dy) + ' ' + b.x + ',' + (b.y - dy) + ' ' + b.x + ',' + b.y; }
      var dx = (b.x - a.x) * 0.55; return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y;
    }
    function mk(tag, attrs) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
    function build() {
      var R = root.getBoundingClientRect();
      if (R.width < 80 || R.height < 80) return; // not laid out yet
      svg.setAttribute('viewBox', '0 0 ' + R.width + ' ' + R.height);
      svg.setAttribute('width', R.width); svg.setAttribute('height', R.height);
      svg.innerHTML = '';
      links = {};
      var defs = mk('defs', {}); svg.appendChild(defs);
      var gBase = mk('g', { 'class': 'b20-g-base' }), gRoute = mk('g', { 'class': 'b20-g-route' }), gComet = mk('g', { 'class': 'b20-g-comet' });
      svg.appendChild(gBase); svg.appendChild(gRoute); svg.appendChild(gComet);
      var c = rel(core);
      var cx = c.l + c.w / 2, cy = c.t + c.h / 2;
      var anySrc = srcTiles[Object.keys(srcTiles)[0]];
      var vertical = rel(anySrc).b <= c.t + 2; // stacked layout (phones): sources above the core
      root.classList.toggle('is-vertical', vertical);
      function add(key, a, b, kind) {
        var d = curve(a, b, vertical);
        var gid = uid + '-' + key;
        var grad = mk('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        grad.innerHTML = '<stop offset="0" style="stop-color:var(--b20-c0)"/><stop offset="1" style="stop-color:var(--b20-c1)"/>';
        defs.appendChild(grad);
        var base = mk('path', { d: d, 'class': 'b20-base' });
        var route = mk('path', { d: d, 'class': 'b20-route' });
        var comet = mk('path', { d: d, 'class': 'b20-comet', stroke: 'url(#' + gid + ')' });
        var head = mk('circle', { r: 3.2, 'class': 'b20-head', cx: a.x, cy: a.y });
        gBase.appendChild(base); gRoute.appendChild(route); gComet.appendChild(comet); gComet.appendChild(head);
        var L = base.getTotalLength();
        route.style.strokeDasharray = L + ' ' + L; route.style.strokeDashoffset = L;
        var D = Math.min(64, L * 0.4);
        comet.style.strokeDasharray = D + ' ' + (L + D); comet.style.strokeDashoffset = D;
        links[key] = { base: base, route: route, comet: comet, head: head, L: L, D: D };
      }
      Object.keys(srcTiles).forEach(function (k) {
        var t = rel(srcTiles[k]);
        if (vertical) add('in-' + k, { x: t.l + t.w / 2, y: t.b }, { x: cx, y: c.t }, 'in');
        else { var onL = (t.l + t.w / 2) < cx; /* v2: beams start/end on the edges that face each other (RTL puts sources on the right) */
          add('in-' + k, { x: onL ? t.r : t.l, y: t.t + t.h / 2 }, { x: onL ? c.l : c.r, y: cy }, 'in'); }
      });
      Object.keys(dstTiles).forEach(function (k) {
        var t = rel(dstTiles[k]);
        if (vertical) add('out-' + k, { x: cx, y: c.b }, { x: t.l + t.w / 2, y: t.t }, 'out');
        else { var onL2 = (t.l + t.w / 2) < cx;
          add('out-' + k, { x: onL2 ? c.l : c.r, y: cy }, { x: onL2 ? t.r : t.l, y: t.t + t.h / 2 }, 'out'); }
      });
      render(performance.now());
    }
    function caseNow() { return CASES20[idx % CASES20.length]; }
    function setCase(i, manual) {
      idx = (i + CASES20.length) % CASES20.length;
      start = performance.now();
      if (manual) manualUntil = start + 9000;
      var cs = caseNow();
      if (line) line.innerHTML = '<b>' + cs.what + '</b> ' + cs.who + (HE20 ? ' ← ' : ' → ') + '<bdi>' + cs.to.map(function (k) { return LABEL20[k]; }).join(' · ') + '</bdi><i class="b20-dot"> · </i><span class="b20-n">' + (I1820.STR && I1820.STR[LANG20] && I1820.STR[LANG20].stepsOneClick ? I1820.STR[LANG20].stepsOneClick(cs.steps) : (HE20 ? cs.steps + ' צעדים, קליק אחד' : cs.steps + ' steps, one click')) + '</span>';
      pills.forEach(function (p) {
        var on = p.getAttribute('data-case') === cs.id;
        p.classList.toggle('on', on); p.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) { p.classList.remove('run'); void p.offsetWidth; if (!REDUCE) p.classList.add('run'); }
      });
      Object.keys(srcTiles).forEach(function (k) {
        var on = k === cs.src;
        srcTiles[k].classList.toggle('is-src', on);
        if (on) { var q = srcTiles[k].querySelector('.b20-q'); if (q) q.textContent = cs.q; }
      });
      root.setAttribute('data-case', cs.id);
      render(start);
    }
    function render(now) {
      var cs = caseNow();
      var t = now - start;
      if (REDUCE) t = DUR20 - 600; // static: the whole case drawn
      var outro = REDUCE ? 1 : 1 - clamp01((t - (DUR20 - 380)) / 380);
      var firing = false;
      var plan = { };
      plan['in-' + cs.src] = { t0: T_IN, d: D_IN };
      cs.to.forEach(function (k, i) { plan['out-' + k] = { t0: T_OUT + i * GAP_OUT, d: D_OUT }; });
      Object.keys(links).forEach(function (key) {
        var lk = links[key], pl = plan[key];
        var p = pl ? clamp01((t - pl.t0) / pl.d) : 0;
        var e = ease(p);
        lk.route.style.strokeDashoffset = (lk.L * (1 - e)).toFixed(2);
        lk.route.style.opacity = pl ? outro.toFixed(3) : '0';
        var travelling = pl && p > 0 && p < 1 && !REDUCE;
        if (travelling) firing = true;
        lk.comet.style.strokeDashoffset = (lk.D - e * (lk.L + lk.D)).toFixed(2);
        lk.comet.style.opacity = travelling ? '1' : '0';
        if (travelling) {
          var pt = lk.base.getPointAtLength(Math.min(lk.L, e * (lk.L + lk.D))); // head rides the front of the comet
          lk.head.setAttribute('cx', pt.x.toFixed(2)); lk.head.setAttribute('cy', pt.y.toFixed(2));
          lk.head.style.opacity = '1';
        } else lk.head.style.opacity = '0';
        var k = key.slice(key.indexOf('-') + 1);
        if (key.indexOf('out-') === 0 && dstTiles[k]) {
          // a tool lights when its beam lands, then ticks
          dstTiles[k].classList.toggle('is-on', !!pl && (REDUCE || e > 0.86) && outro > 0.5);
          dstTiles[k].classList.toggle('is-done', !!pl && (REDUCE || t > pl.t0 + pl.d + 140) && outro > 0.5);
        }
        if (key.indexOf('in-') === 0 && srcTiles[k]) srcTiles[k].classList.toggle('is-on', !!pl && outro > 0.5);
      });
      core.classList.toggle('is-recv', t > T_IN + D_IN - 60 && outro > 0.5);
      root.classList.toggle('is-firing', firing);
      root.classList.toggle('has-case', true);
    }
    function frame(now) {
      if (!REDUCE) {
        var t = now - start, HOLD = DUR20 - 420;
        var holding = hovering || now < manualUntil;
        if (holding && t > HOLD) start = now - HOLD; // finish the case, then hold its closed state
        else if (t >= DUR20) setCase(idx + 1);
      }
      render(now);
      if (visible) requestAnimationFrame(frame);
    }
    root.addEventListener('pointerenter', function () { hovering = true; });
    root.addEventListener('pointerleave', function () { hovering = false; });
    pills.forEach(function (p, i) {
      p.addEventListener('click', function () { setCase(i, true); });
    });
    // hovering a source tile picks its first case
    Object.keys(srcTiles).forEach(function (k) {
      srcTiles[k].addEventListener('pointerenter', function () {
        if (caseNow().src === k) return;
        for (var i = 0; i < CASES20.length; i++) if (CASES20[i].src === k) { setCase(i, true); break; }
      });
    });
    var raf = 0;
    function rebuild() { cancelAnimationFrame(raf); raf = requestAnimationFrame(build); }
    if (window.ResizeObserver) new ResizeObserver(rebuild).observe(root);
    window.addEventListener('resize', rebuild);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
    build();
    setCase(0);
    if (REDUCE) return;
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        var v = es[0].isIntersecting;
        if (v && !visible) { visible = true; setCase(idx); requestAnimationFrame(frame); }
        visible = v;
      }, { rootMargin: '80px' }).observe(root);
    }
    requestAnimationFrame(frame);
  }

  function boot() {
    if (window.fillGlyphs) window.fillGlyphs();
    $all('[data-beam]').forEach(initBeam);
    $all('[data-orbit]').forEach(initOrbit);
    $all('[data-m3d]').forEach(initMarquee3d);
    $all('[data-orbit20]').forEach(initOrbit20);
    $all('[data-beam20]').forEach(initBeam20);
  }
  if (document.readyState !== 'loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();

/* app.js */
/* Corner v21 — Glance proposes the ACTIONS it will take · Do It prepares + verifies · Approve closes · Undo always.
   Hero = one cinematic scroll story (pinned ~325vh): window lands by 25vh → Glance notices → Do It →
   execution across tools (beams + floating tool tiles, Preparing → Verifying → Verified ✓) → Prepared →
   Approve (proof states again, fetched back) → Closed + receipt + Undo.
   ONE rAF loop reads scroll, lerp-smooths it and writes transform/opacity only. Click flow drives the
   same timeline. Vanilla JS · file:// friendly · prefers-reduced-motion = static composition. */
(function () {
  'use strict';

  var LANG = (document.documentElement.lang || '').slice(0, 2) || 'en';
  var HE = LANG === 'he';
  var I18 = window.GLANCE_I18N || {};
  var LIVING = { idle: 'glance/living/key-idle-192.png', thinking: 'glance/living/thinking-192.webp', done: 'glance/living/done-192.webp', keyDone: 'glance/living/key-done-192.png' };
  function gplus() {
    return '<b class="gplus"><span class="gplus-name">Glance</span></b>';
  }
  var VIEWER_DEFAULT = (I18.viewer && I18.viewer[LANG]) || (HE ? 'סאלי ספן' : 'Sali Sapan');
  var VIEWER_LS_KEY = 'glance.corner.viewerName';
  var viewerName = VIEWER_DEFAULT;
  var MQ_REDUCE = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(MQ_REDUCE && MQ_REDUCE.matches); }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function glyph(id) { return window.glyphSVG ? window.glyphSVG(id) : ''; }
  function expandViewer(str) { return str == null ? str : String(str).split(VIEWER_DEFAULT).join(esc(viewerName)); }
  function clamp(v, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return v < a ? a : v > b ? b : v; }
  function smooth(a, b, t) { var x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); }
  function easeOut(x) { return 1 - Math.pow(1 - clamp(x), 3); }
  var OK = '<i class="ss-ok" aria-label="verified">✓</i>';

  /* ---------------- UI copy ---------------- */
  var T = (I18.T && I18.T[LANG]) || (HE ? {
    will: 'Glance יבצע', doing: 'Glance עובד', prepared: 'מוכן · שום דבר לא נשלח', closing: 'סוגר ומאמת', done: 'בוצע',
    queued: 'בתור', verifying: function (a) { return 'מאמת ב־' + a + '…'; }, applying: function (a) { return 'מבצע ב־' + a + '…'; }, fetching: function (a) { return 'מושך חזרה מ־' + a + '…'; },
    chip: function (n, tools, sugg) { return gplus() + ' יכול לסגור את זה ב־<b class="file">' + n + ' צעדים</b>' + (tools.length ? ' · ' + tools.map(function (t) { return '<bdi>' + esc(t) + '</bdi>'; }).join(' · ') : '') + (sugg ? '<span class="chip-sugg"> · <bdi dir="ltr">+' + sugg + '</bdi> מוצע</span>' : ''); },
    none: gplus() + ' · סמנו לפחות צעד אחד',
    suggested: 'מוצע', added: 'נוסף', afterApprove: 'אחרי אישור', you: 'אתם', yourStep: 'הצעד שלך · ייכלל בסגירה',
    caps: ['Glance קורא את הבקשה. עדיין שום דבר לא קורה.', 'לחיצה אחת. Glance מכין כל צעד בכלי שלו.', 'מוכן, מאומת, שום דבר לא נשלח. ההחלטה שלך.', 'האישור סוגר. כל צעד נמשך חזרה כהוכחה.', 'נסגר, עם קבלה. ביטול במרחק לחיצה.'],
    ping: function (n) { return 'יכול לסגור · ' + n + ' צעדים'; }
  } : {
    will: 'Glance will', doing: 'Glance is doing', prepared: 'Prepared · nothing sent', closing: 'Closing · verifying', done: 'Done',
    queued: 'Queued', verifying: function (a) { return 'Verifying in ' + a + '…'; }, applying: function (a) { return 'Applying in ' + a + '…'; }, fetching: function (a) { return 'Fetching back from ' + a + '…'; },
    chip: function (n, tools, sugg) { return gplus() + ' can close this in <b class="file">' + n + ' step' + (n === 1 ? '' : 's') + '</b>' + (tools.length ? ' · ' + tools.map(esc).join(' · ') : '') + (sugg ? '<span class="chip-sugg"> · +' + sugg + ' suggested</span>' : ''); },
    none: gplus() + ' · tick at least one step',
    suggested: 'Suggested', added: 'Added', afterApprove: 'after Approve', you: 'You', yourStep: 'your step · included in the close',
    caps: ['Glance reads the ask. Nothing happens yet.', 'One click. Glance prepares every step, in each tool.', 'Prepared, verified, nothing sent. Your call.', 'Approve closes it. Each step is fetched back as proof.', 'Closed, with a receipt. Undo is one click away.'],
    ping: function (n) { return 'can close this · ' + n + ' steps'; }
  });

  /* ---------------- hero case · one email, closed across non-Google tools ---------------- */
  var LAUNCH_EN = {
    subj: 'Can we move to Wednesday?', av: 'M', fromName: 'Megan Carter', fromAddr: 'megan.carter@gmail.com', fromTime: '09:12',
    greet: 'Hi Sali,', sign: 'Megan', att: 'Room photos.pdf',
    msgBody: 'Can we move our design session to Wednesday at 6pm? I attached photos of the room.',
    intent: 'Megan wants the session on Wednesday at 6pm.',
    reply: 'Wednesday at 6 works.', replyNote: 'Room photos', replyTo: 'Megan Carter',
    actions: [
      { tool: 'calendar', app: 'Calendar', text: 'Move the session to Wed 18:00', out: 'Session with Megan · Thu 17:00', run: 'Checking you are free…', result: 'Wed 18:00 · free', done: 'Wed 18:00 · booked', tile: 'Wed 18:00' },
      { tool: 'drive', app: 'Drive', text: 'Save the photos to Megan’s folder', out: 'Room photos.pdf · not saved', run: 'Saving the file…', result: 'Saved · Megan / Room', done: 'Photos saved', tile: 'Megan / Room' },
      { tool: 'gmail', app: 'Gmail', text: 'Confirmation reply to Megan', out: 'Not sent', run: 'Drafting the reply…', result: 'Reply ready · not sent', done: 'Reply sent to Megan', tile: 'Wed 18:00 works' }
    ],
    close: { text: 'Close once Megan knows it’s Wednesday', done: 'Loop closed · session is Wednesday' },
    receipt: '<b>Closed</b> · session on Wednesday 18:00 · <em class="js-undo">Undo</em>'
  };
  var LAUNCH_HE = {
    subj: 'אפשר להקדים לרביעי?', av: 'מ', fromName: 'מיכל אברהם', fromAddr: 'michal.a@gmail.com', fromTime: '09:12',
    greet: 'סאלי,', sign: 'מיכל', att: 'תמונות החדר.pdf',
    msgBody: 'אפשר להקדים את פגישת העיצוב שלנו ליום רביעי ב־18:00? צירפתי תמונות של החדר.',
    intent: 'מיכל רוצה להקדים את הפגישה לרביעי ב־18:00.',
    reply: 'רביעי ב־18:00 מתאים.', replyNote: 'תמונות החדר', replyTo: 'מיכל אברהם',
    actions: [
      { tool: 'calendar', app: 'Calendar', text: 'להזיז את הפגישה לרביעי 18:00', out: 'פגישה עם מיכל · חמישי 17:00', run: 'בודק שאתם פנויים…', result: 'רביעי 18:00 · פנוי', done: 'רביעי 18:00 · נקבע', tile: 'רביעי 18:00' },
      { tool: 'drive', app: 'Drive', text: 'לשמור את התמונות בתיקייה של מיכל', out: 'תמונות החדר.pdf · לא נשמר', run: 'שומר את הקובץ…', result: 'נשמר · מיכל / חדר', done: 'התמונות נשמרו', tile: 'מיכל / חדר' },
      { tool: 'gmail', app: 'Gmail', text: 'תשובת אישור למיכל', out: 'לא נשלחה', run: 'מכין תשובה…', result: 'התשובה מוכנה · לא נשלחה', done: 'התשובה נשלחה למיכל', tile: 'רביעי 18:00 מתאים' }
    ],
    close: { text: 'לסגור כשמיכל יודעת שזה רביעי', done: 'הלולאה נסגרה · הפגישה ברביעי' },
    receipt: '<b>נסגר</b> · הפגישה ברביעי 18:00 · <em class="js-undo">ביטול</em>'
  };
  var CASES_EN = { launch: LAUNCH_EN };
  var CASES_HE = { launch: LAUNCH_HE };
  var CASES = (I18.LAUNCH && I18.LAUNCH[LANG]) ? { launch: I18.LAUNCH[LANG] } : (HE ? CASES_HE : CASES_EN);

  /* Slack · office manager · one short message, three steps, one Do It */
  function waPack(o) { return o; }
  var WA_ASKS = [HE ? waPack({
    ask: 'צריך לתאם טכנאי למזגן במשרד השבוע, מתי נוח לך?',
    intent: 'מנהל המשרד מבקש לתאם טכנאי למזגן השבוע.',
    draft: 'אפשר ביום שלישי ב־10:00 או ביום רביעי ב־16:00. מה נוח לך?',
    actions: [
      { tool: 'calendar', app: 'Calendar', text: 'למצוא זמן פנוי השבוע', out: 'שלישי 10:00 · רביעי 16:00', run: 'בודק את היומן…', runSub: 'השבוע', result: 'שני זמנים פנויים', done: 'שני זמנים פנויים' },
      { tool: 'slack', app: 'Slack', text: 'תשובה עם שתי אפשרויות', out: 'לא נשלח', run: 'מכין תשובה…', runSub: 'אל דוד', result: 'התשובה מוכנה', done: 'נשלחה לדוד' },
      { tool: 'calendar', app: 'Calendar', text: 'תזכורת ליום הביקור', out: 'שלישי 08:00', run: 'קובע תזכורת…', runSub: 'יום הביקור', result: 'התזכורת מוכנה', done: 'התזכורת נקבעה' }
    ],
    close: { text: 'לסגור כשהטכנאי מתואם', done: 'נסגר · הטכנאי מתואם' },
    receipt: '<b>נסגר</b> · הטכנאי מתואם · <em class="js-undo">ביטול</em>'
  }) : waPack({
    ask: 'The office AC technician needs to come this week. When works for you?',
    intent: 'The office manager wants to book the AC technician this week.',
    draft: 'Tuesday at 10:00 or Wednesday at 4:00 pm. Which works for you?',
    actions: [
      { tool: 'calendar', app: 'Calendar', text: 'Find a free slot this week', out: 'Tue 10:00 · Wed 16:00', run: 'Checking your calendar…', runSub: 'This week', result: 'Two free slots', done: 'Two free slots' },
      { tool: 'slack', app: 'Slack', text: 'Reply with two options', out: 'Not sent', run: 'Preparing the reply…', runSub: 'To David', result: 'Reply ready', done: 'Sent to David' },
      { tool: 'calendar', app: 'Calendar', text: 'Reminder for the visit day', out: 'Tue 08:00', run: 'Setting a reminder…', runSub: 'Visit day', result: 'Reminder ready', done: 'Reminder set' }
    ],
    close: { text: 'Close once the technician is booked', done: 'Closed · technician scheduled' },
    receipt: '<b>Closed</b> · technician scheduled · <em class="js-undo">Undo</em>'
  })];
  if (I18.WA && I18.WA[LANG]) WA_ASKS = [I18.WA[LANG]];
  function waFromAsk(text) { return WA_ASKS[0]; }
  function waData(pack) {
    return { intent: pack.intent, actions: pack.actions, close: pack.close, receipt: pack.receipt, waitSub: (I18.STR && I18.STR[LANG] && I18.STR[LANG].waitSub) || (HE ? 'Glance לא שולח בשמך' : 'Glance never sends for you') };
  }
  var WA = waData(WA_ASKS[0]);
  var T_WA = (I18.T_WA && I18.T_WA[LANG]) || (HE ? {
    will: 'Glance יבצע', doing: 'Glance עובד', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע', afterApprove: 'אחרי אישור', suggested: 'מוצע',
    verifying: function (a) { return 'מאמת ב־' + a + '…'; }
  } : {
    will: 'Glance will', doing: 'Glance is doing', prepared: 'Prepared · nothing sent', done: 'Done', afterApprove: 'after Approve', suggested: 'Suggested',
    verifying: function (a) { return 'Verifying in ' + a + '…'; }
  });
  if (!(I18.T_WA && I18.T_WA[LANG])) {
  T_WA.chip = HE
    ? function (n, tools) { return gplus() + ' יסגור את זה ב־<b class="file">' + n + ' צעדים</b>'; }
    : function (n, tools) { return gplus() + ' can close this in <b class="file">' + n + ' step' + (n === 1 ? '' : 's') + '</b>'; };
  T_WA.none = HE ? (gplus() + ' · סמנו לפחות צעד אחד') : (gplus() + ' · tick at least one step');
  }

  /* ---------------- row templates (step-states v1 parity) ---------------- */
  function appB(app) { return '<b class="act-app"><bdi>' + esc(app) + '</bdi></b>'; }
  function brandId(tool) { return tool === 'outlookcal' ? 'outlook' : tool; }
  function brandMark(tool) {
    var id = brandId(tool);
    var svg = window.BRAND && window.BRAND[id];
    if (!svg) return '<span class="act-glyph" data-glyph="' + tool + '">' + glyph(tool) + '</span>';
    return '<span class="act-glyph is-brand" data-glyph="' + tool + '" data-brand="' + id + '">' + svg + '</span>';
  }
  function classifyStep(txt) {
    var known = [['dropbox', 'dropbox', 'Dropbox'], ['hubspot', 'hubspot', 'HubSpot'], ['notion', 'notion', 'Notion'], ['jira', 'jira', 'Jira'], ['zoom', 'zoom', 'Zoom'], ['calendly', 'calendly', 'Calendly'], ['asana', 'asana', 'Asana'], ['gmail', 'gmail', 'Gmail'], ['outlook', 'outlook', 'Outlook'], ['slack', 'slack', 'Slack'], ['slack', 'slack', 'Slack'], ['clickup', 'clickup', 'ClickUp']];
    var low = String(txt).toLowerCase();
    var hit = null;
    for (var i = 0; i < known.length; i++) if (low.indexOf(known[i][0]) >= 0) { hit = known[i]; break; }
    var base = { text: txt, run: '…', result: txt, done: txt, tile: txt, added: true, on: true };
    if (hit) return Object.assign(base, { tool: hit[1], app: hit[2], out: (I18.STR && I18.STR[LANG] && I18.STR[LANG].ready) || ((I18.STR && I18.STR[LANG] && I18.STR[LANG].ready) || (HE ? 'מוכן' : 'Ready')), status: 'ready' });
    var vague = txt.length < 12 || /[?]/.test(txt) || /^(ok|yes|maybe|hmm|what|why|please|thanks|היי|כן)\b/i.test(low);
    if (vague) return Object.assign(base, { tool: 'you', app: T.you, out: ((I18.STR && I18.STR[LANG] && I18.STR[LANG].unclear) || (HE ? 'לא ברור · ' : 'Unclear · ')) + ((I18.STR && I18.STR[LANG] && I18.STR[LANG].unclearQ) || (HE ? 'מה צריך ש-Glance יעשה כאן?' : 'What should Glance do with this?')), status: 'unclear' });
    return Object.assign(base, { tool: 'you', app: T.you, out: (I18.STR && I18.STR[LANG] && I18.STR[LANG].needsConn) || (HE ? 'צריך חיבור' : 'Needs connection'), status: 'connect' });
  }
  function rowHTML(a, i, L) {
    L = L || T;
    var kind = (a.suggested ? ' act-suggested' : '') + (a.added ? ' act-added' : '');
    var checked = a.on === false || (a.suggested && a.on !== true) ? '' : ' checked';
    var out = a.added && a.status === 'ready' ? (appB(a.app) + ' · ' + (HE ? 'מוכן' : 'Ready')) : a.added ? expandViewer(a.out) : (appB(a.app) + ' · ' + expandViewer(a.out));
    return '<li class="act' + kind + '" data-i="' + i + '" data-app="' + esc(a.chip || a.app) + '" data-status="' + esc(a.status || '') + '" data-run="' + esc(expandViewer(a.run || '')) + '" data-run-sub="' + esc(expandViewer(a.runSub || '')) + '">' +
      '<label class="act-row">' +
        '<input type="checkbox" class="act-check"' + checked + '>' +
        '<span class="act-box" aria-hidden="true"></span>' +
        brandMark(a.tool) +
        '<span class="act-body">' +
          '<span class="act-text">' + expandViewer(a.text) + '</span>' +
          '<span class="act-out" data-out="' + esc(out) + '">' + out + '</span>' +
          '<span class="act-res">' + appB(a.app) + ' · <span class="act-res-txt" data-prep="' + esc(expandViewer(a.result)) + '" data-done="' + esc(expandViewer(a.done)) + '">' + expandViewer(a.result) + '</span></span>' +
        '</span>' +
        (a.suggested ? '<span class="act-tag ss-tag">' + L.suggested + '</span>' : a.added ? '<span class="act-tag ss-tag">' + L.added + '</span>' : '') +
      '</label>' +
      (a.added ? '<button type="button" class="act-x" aria-label="' + ((I18.STR && I18.STR[LANG] && I18.STR[LANG].removeStep) || (HE ? 'הסרת צעד' : 'Remove step')) + '">×</button>' : '') +
      '</li>';
  }
  function closeHTML(c, L) {
    L = L || T;
    return '<li class="act act-close" data-close="1">' +
      '<span class="act-row">' +
        '<span class="act-lock" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><rect x="3.25" y="7.15" width="9.5" height="6.35" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.2 7.15V5.15a2.8 2.8 0 0 1 5.6 0V7.15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>' +
        '<span class="act-glyph" data-glyph="glance">' + glyph('glance') + '</span>' +
        '<span class="act-body">' +
          '<span class="act-text">' + expandViewer(c.text) + '</span>' +
          '<span class="act-res"><span class="act-res-txt">' + expandViewer(c.done) + '</span></span>' +
        '</span>' +
        '<span class="act-tag">' + L.afterApprove + '</span>' +
      '</span></li>';
  }

  /* ---------------- demo closer (Slack · Meet) ---------------- */
  function makeCloser(stage, data, opts) {
    opts = opts || {};
    var L = opts.L || T;
    var list = stage.querySelector('.acts');
    var runBox = stage.querySelector('.acts-run');
    var runTitle = runBox && runBox.querySelector('.run-title');
    var runSub = runBox && runBox.querySelector('.run-sub');
    var runCount = runBox && runBox.querySelector('.run-count');
    var runFill = runBox && runBox.querySelector('.run-fill');
    var approve = stage.querySelector('.approve-banner');
    var chipTxt = stage.querySelector('.chip-txt');
    var receipt = stage.querySelector('.receipt-stack');
    var actsLabel = stage.querySelector('.acts-label');
    var stepMs = opts.stepMs || 760;
    var st = 'propose', timers = [];

    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    function clearT() { timers.forEach(clearTimeout); timers = []; }
    function rings(src) { $all('.living-ico', stage).forEach(function (im) { if (!im.closest('.mj-pill')) im.src = src; }); }
    function rows() { return $all('li.act:not(.act-close)', list); }
    function closeRow() { return list.querySelector('li.act-close'); }
    function selected() { return rows().filter(function (li) { var cb = li.querySelector('.act-check'); return cb && cb.checked; }); }
    function render(d) {
      data = d;
      list.innerHTML = d.actions.map(function (a, i) { return rowHTML(a, i, L); }).join('') + closeHTML(d.close, L);
      syncChip(); setReceipt();
    }
    function setReceipt() { if (receipt) receipt.innerHTML = '<div class="receipt receipt-hero"><span class="receipt-dot"></span><span class="receipt-txt">' + expandViewer(data.receipt) + '</span></div>' + (data.receiptLines ? '' : ''); }
    function syncChip() {
      if (!chipTxt) return;
      var sel = selected(), tools = [];
      sel.forEach(function (li) { var a = li.getAttribute('data-app'); if (a && tools.indexOf(a) < 0) tools.push(a); });
      stage.classList.toggle('no-actions', sel.length === 0);
      chipTxt.innerHTML = sel.length ? L.chip(sel.length, tools, 0) : L.none;
    }
    function setLabel(t) { if (actsLabel) actsLabel.textContent = t; }
    function clearRows() {
      $all('li.act', list).forEach(function (li) {
        li.classList.remove('is-active', 'is-done', 'is-pending', 'is-skipped', 'is-ready', 'is-final', 'st-verifying');
        li.removeAttribute('data-proof');
        var r = li.querySelector('.act-res-txt[data-prep]'); if (r) r.innerHTML = r.getAttribute('data-prep');
        var o = li.querySelector('.act-out[data-out]'); if (o) o.innerHTML = o.getAttribute('data-out');
      });
    }
    function setState(next) {
      st = next;
      stage.setAttribute('data-state', next);
      if (approve) approve.hidden = next !== 'wait';
      if (runBox) runBox.hidden = next !== 'working';
      $all('.act-check', list).forEach(function (cb) { cb.disabled = next !== 'propose'; });
      if (next === 'propose' || next === 'held') { rings(LIVING.idle); clearRows(); setLabel(L.will); }
      else if (next === 'working') { rings(LIVING.thinking); setLabel(L.doing); }
      else if (next === 'wait') { rings(LIVING.idle); setLabel(L.prepared); }
      else if (next === 'settled') { rings(LIVING.done); setLabel(L.done); later(function () { if (st === 'settled') rings(LIVING.keyDone); }, 2100); }
      if (opts.onState) opts.onState(next);
    }
    function outTxt(li, t) { var o = li.querySelector('.act-out'); var app = li.getAttribute('data-app'); if (o) o.innerHTML = appB(app) + ' · ' + t; }
    function doIt() {
      if (st !== 'propose') return;
      var sel = selected(); if (!sel.length) return;
      setState('working');
      rows().forEach(function (li) { li.classList.add(sel.indexOf(li) >= 0 ? 'is-pending' : 'is-skipped'); if (sel.indexOf(li) >= 0) { li.setAttribute('data-proof', 'queued'); } });
      var n = sel.length;
      sel.forEach(function (li, k) {
        var t0 = k * stepMs;
        later(function () {
          li.classList.remove('is-pending'); li.classList.add('is-active'); li.setAttribute('data-proof', 'preparing');
          outTxt(li, li.getAttribute('data-run'));
          if (runTitle) runTitle.innerHTML = li.getAttribute('data-run');
          if (runSub) { var rs = li.getAttribute('data-run-sub') || ''; runSub.innerHTML = appB(li.getAttribute('data-app')) + (rs ? ' · ' + rs : ''); }
          if (runCount) runCount.innerHTML = (k + 1) + '<span>/</span>' + n;
          if (runFill) runFill.style.width = Math.round(((k + 0.5) / n) * 100) + '%';
          if (opts.onStep) opts.onStep(k, li, n);
        }, t0);
        later(function () { li.classList.remove('is-active'); li.classList.add('st-verifying'); li.setAttribute('data-proof', 'verifying'); outTxt(li, (L.verifying ? L.verifying(li.getAttribute('data-app')) : '…')); }, t0 + stepMs * 0.58);
        later(function () {
          li.classList.remove('st-verifying'); li.classList.add('is-done'); li.setAttribute('data-proof', 'verified');
          var r = li.querySelector('.act-res-txt'); if (r) r.innerHTML = r.getAttribute('data-prep') + ' ' + OK;
          if (opts.onStepDone) opts.onStepDone(k, li, n);
        }, t0 + stepMs * 0.94);
      });
      later(function () {
        var cr = closeRow(); if (cr) cr.classList.add('is-ready');
        var toWait = function () { if (opts.direct) { st = 'wait'; approveClose(); } else setState('wait'); }; if (opts.onRunEnd) opts.onRunEnd(toWait); else toWait();
      }, n * stepMs + 40);
    }
    function approveClose() {
      if (st !== 'wait') return;
      $all('li.act.is-done .act-res-txt[data-done]', list).forEach(function (r) { r.innerHTML = r.getAttribute('data-done') + ' ' + OK; });
      var cr = closeRow(); if (cr) { cr.classList.remove('is-ready'); cr.classList.add('is-done', 'is-final'); }
      setReceipt(); setState('settled');
      stage.classList.add('flash-settle'); later(function () { stage.classList.remove('flash-settle'); }, 700);
    }
    function undo() { clearT(); setState('propose'); syncChip(); }
    function hold() { if (st === 'working') return; clearT(); setState('held'); }
    function unpark() { setState('propose'); }
    list.addEventListener('change', function (e) { if (e.target && e.target.classList.contains('act-check')) syncChip(); });
    stage.addEventListener('keydown', function (e) {
      var inp = e.target;
      if (!inp || !inp.classList || !inp.classList.contains('ss-add-input')) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var txt = inp.value.trim();
      if (!txt || st !== 'propose') return;
      var a = classifyStep(txt);
      a.text = esc(txt); a.result = esc(txt); a.done = esc(txt);
      data.actions.push(a);
      inp.value = '';
      render(data);
    });
    stage.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      if (t.closest('.approve-btn')) { e.preventDefault(); approveClose(); return; }
      if (t.closest('.do-halo')) { e.preventDefault(); if (opts.onDoIt) opts.onDoIt(); doIt(); return; }
      if (t.closest('.chip-x')) { e.preventDefault(); hold(); return; }
      if (t.closest('.js-undo')) { e.preventDefault(); undo(); if (opts.onUndo) opts.onUndo(); return; }
      if (t.closest('.js-unpark')) { e.preventDefault(); unpark(); return; }
    });
    render(data); setState('propose');
    return { render: function (d) { clearT(); render(d || data); setState('propose'); }, state: function () { return st; }, doIt: doIt, approve: approveClose, undo: undo, stage: stage };
  }
  window.__glanceKit = { makeCloser: makeCloser, rowHTML: rowHTML, closeHTML: closeHTML, T: T, HE: HE, esc: esc, LIVING: LIVING, OK: OK, reduced: reduced };

  /* =====================================================================
     HERO · cinematic scroll story
     ===================================================================== */
  /* 19.11 scroll port: beats re-timed the way Flow's home hero C.t is built (overlapping segments, no long empty holds).
     Old: askA .10 … runA .47 runB .75 … closeA .95. Land is now part of the same progress (Flow arrival/copyOut), not raw page scroll. */
  var K = { landB: .14, askA: .07, askB: .15, pingA: .10, pingB: .16, cardA: .115, cardB: .235, rowsA: .18, rowsB: .285, tick: .31,
            pressA: .33, pressB: .37, runA: .37, runB: .565, collA: .575, collB: .645, apprA: .61, apprB: .655, proofA: .655, proofB: .815, closeA: .825 };
  function inOut(x) { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function seg(t, a, b) { return clamp((t - a) / (b - a)); }
  var hero = document.getElementById('hero');
  var H = null;
  if (hero && hero.classList.contains('h21')) H = initHero(); /* 20.11: the Glance page hero is now the Flow hero clone (own engine) */

  var RTL = document.documentElement.dir === 'rtl';
  function initHero() {
    var pin = $('.h21-pin', hero), copy = $('.h21-copy', hero), endL = $('.h21-end', hero), rig = $('.h21-rig', hero);
    var win = $('.h21-win', hero), tilesBox = $('.h21-tiles', hero), svg = $('.h21-beams', hero), card = $('#product-moment');
    var gs = $('#live-glance'), list = $('#live-acts'), chipTxt = $('#live-chip .chip-txt'), approve = $('#live-approve');
    var receipt = $('#live-receipt'), doit = $('#btn-doit'), ask = $('.h21-ask', hero), ping = $('.h21-ping', hero);
    var sweep = $('.h21-sweep', hero), dim = $('.h21-dim', hero), capSteps = $all('.h21-steps li', hero), capTxt = $('.h21-cap-txt', hero), cap = $('.h21-cap', hero);
    var label = $('.acts-label', gs), addBox = $('.ss-add', gs), icoLive = $('#live-living-ico');
    var data = null, caseId = 'launch', manual = false, held = false;
    var tCard = 0, peak = 0, tween = null, ys = window.scrollY, yTarget = ys, last = {}, beams = [], tiles = [];
    var geo = { range: 1, top: 0, vh: window.innerHeight, mobile: false, rs: 1, drop: 0, cardDx: 0 };
    var t0 = performance.now(), running = false, inView = true, lastFrame = 0;
    /* Flow scroll engine (index.html): GSAP ScrollTrigger timeline, scrub .35, ease none, start top top, end +=pin; Lenis lerp .1 on mouse/trackpad only */
    var SP = { p: 0 }, sTl = null, lenis = null, attEl = $('.gw-att', hero), signEl = $('.gw-sign', hero);
    function rawP() { return clamp((window.scrollY - geo.top) / geo.range); }
    function flowEngine() {
      if (sTl || reduced() || !window.gsap || !window.ScrollTrigger) return;
      gsap.registerPlugin(ScrollTrigger); ScrollTrigger.config({ ignoreMobileResize: true });
      SP.p = rawP();
      sTl = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: function () { return '+=' + geo.range; }, invalidateOnRefresh: true, scrub: 0.35 } })
        .to(SP, { p: 1, ease: 'none', duration: 1, onUpdate: function () { if (!running) frame(performance.now()); } });
      if (window.Lenis && !matchMedia('(hover:none),(pointer:coarse)').matches && !/nolenis/.test(location.search)) {
        lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1 }); window.__lenis = lenis;
        lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(function (s) { lenis.raf(s * 1000); }); gsap.ticker.lagSmoothing(0);
        $all('.day21-track,[class*="track"],[class*="scroller"]').forEach(function (el) { var cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) el.setAttribute('data-lenis-prevent', ''); });
      }
    }

    function set(el, prop, val, key) { var k = key || prop; var c = el.__c || (el.__c = {}); if (c[k] === val) return; c[k] = val; if (prop === 'class') return; el.style[prop] = val; }
    function setCls(el, cls, on) { if (!el) return; if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
    function setHTML(el, html) { if (el && el.__h !== html) { el.__h = html; el.innerHTML = html; } }

    /* ----- data / DOM build ----- */
    function bindMail(c) {
      $all('[data-bind]', hero).forEach(function (el) {
        var k = el.getAttribute('data-bind');
        if (k === 'pingTxt') { el.textContent = T.ping(c.actions.filter(function (a) { return !a.suggested; }).length); return; }
        if (c[k] != null) { if (k === 'intent') el.innerHTML = expandViewer(c[k]); else el.textContent = expandViewer(c[k]); }
      });
    }
    function build(id) {
      caseId = id; var c = CASES[id];
      data = JSON.parse(JSON.stringify(c));
      data.actions.forEach(function (a) { a.on = !a.suggested; });
      card.setAttribute('data-case', id);
      bindMail(data);
      list.innerHTML = data.actions.map(function (a, i) { return rowHTML(a, i); }).join('') + closeHTML(data.close);
      tilesBox.innerHTML = data.actions.map(function (a, i) {
        return '<div class="h21-tile" data-k="' + i + '" data-tool="' + a.tool + '"><span class="h21-tile-ic' + (window.BRAND && window.BRAND[a.tool] ? ' is-brand' : '') + '">' + ((window.BRAND && window.BRAND[a.tool]) || glyph(a.tool)) + '</span><span class="h21-tile-tx"><b><bdi>' + esc(a.app) + '</bdi></b><em>' + expandViewer(a.tile || a.result) + '</em></span><i class="h21-tile-ok" aria-hidden="true"></i></div>';
      }).join('');
      if (svg) svg.innerHTML = '';
      tiles = $all('.h21-tile', tilesBox);
      beams = [];
      receipt.innerHTML = '<div class="receipt receipt-hero"><span class="receipt-dot"></span><span class="receipt-txt">' + expandViewer(data.receipt) + '</span></div>';
      last = {}; $all('li.act', list).forEach(function (li) { li.__c = null; li.__h = null; });
      measure();
    }
    /* parallel run: every selected tool starts almost together (small stagger) and finishes together */
    function pu(t, a, b, k, n) { var st = (b - a) * 0.09, d = (b - a) - st * Math.max(0, n - 1); return (t - (a + k * st)) / d; }
    function rowsEls() { return $all('li.act:not(.act-close)', list); }

    /* ----- geometry ----- */
    function measure() {
      var vh = window.innerHeight, vw = document.documentElement.clientWidth;
      geo.vh = vh; geo.mobile = vw <= 760;
      var rect = hero.getBoundingClientRect();
      geo.top = rect.top + window.scrollY;
      geo.range = Math.max(1, hero.offsetHeight - vh);
      // rig scale to fit
      var baseW = parseFloat(getComputedStyle(rig).getPropertyValue('--rig-w')) || rig.offsetWidth;
      var baseH = parseFloat(getComputedStyle(rig).getPropertyValue('--rig-h')) || rig.offsetHeight;
      if (geo.mobile) geo.rs = 1;
      else geo.rs = Math.min(1, (vw - 48) / baseW, (vh - 48 - 150) / baseH);
      // landed position vs opening drop
      var landedTop = rig.offsetTop;
      /* 13.11: on phones the mail starts right under the copy (and its Get Glance CTA), not at 56% of the screen, so it shows on the first screen */
      var dropTo = vh * (geo.mobile ? 0.56 : 0.64);
      if (geo.mobile && copy) dropTo = Math.min(dropTo, copy.offsetTop + copy.offsetHeight + 18);
      geo.drop = Math.max(0, dropTo - landedTop);
      // card centering offset (desktop only)
      if (!geo.mobile) {
        var pinW = pin.clientWidth, cw = card.offsetWidth, cl = card.offsetLeft;
        var rigLeft = (pinW - rig.offsetWidth * geo.rs) / 2;
        geo.cardDx = (pinW / 2) - (rigLeft + (cl + cw / 2) * geo.rs);
        geo.cardDx /= geo.rs;
      } else geo.cardDx = 0;
      geo.introDx = geo.mobile ? 0 : (rig.offsetWidth - win.offsetWidth) / 2 * geo.rs * (RTL ? -1 : 1);
      /* phones: while the steps run the card travels up over the lower part of the mail (attachment + signature fade out), stopping 14px under the request text */
      geo.hByState = {}; geo.rigTop = rig.offsetTop; geo.cardTop0 = card.offsetTop; var sj = $('.gw-subj', hero), sy = 0, sn = sj; while (sn && sn !== rig) { sy += sn.offsetTop || 0; sn = sn.offsetParent; } geo.maxLift = Math.max(0, card.offsetTop - (sj ? sy + sj.offsetHeight + 8 : 58)); var gb = $('.gw-body', hero); geo.maxLift2 = Math.max(geo.maxLift, card.offsetTop - ((gb ? gb.offsetTop : 46) + 6));
      var en = endL, ey = 0; while (en && en !== pin) { ey += en.offsetTop || 0; en = en.offsetParent; } geo.endTop = ey;
      if (geo.mobile && ask) { var ap = ask.closest('p') || ask, ay = 0, an = ap; while (an && an !== rig) { ay += an.offsetTop || 0; an = an.offsetParent; } geo.lift = Math.max(0, Math.min(90, card.offsetTop - (ay + ap.offsetHeight + 14))); } else geo.lift = 0;
      last = {}; cacheBeams(); if (sTl && window.ScrollTrigger && !measure.busy) { measure.busy = true; ScrollTrigger.refresh(); measure.busy = false; } kick();
    }
    var beamCache = [];
    function cacheBeams() {
      beamCache = [];
      if (geo.mobile) return;
      var rows = rowsEls();
      tiles.forEach(function (tile, i) {
        var row = rows[i];
        if (!row || !tile) { beamCache[i] = null; return; }
        function rel(el) {
          var x = 0, y = 0, n = el;
          while (n && n !== rig) { x += n.offsetLeft || 0; y += n.offsetTop || 0; n = n.offsetParent; }
          return { x: x, y: y };
        }
        var a = rel(row), b = rel(tile);
        beamCache[i] = { x1: a.x, y1: a.y + row.offsetHeight / 2, x2: b.x + tile.offsetWidth, y2: b.y + tile.offsetHeight / 2 };
      });
    }

    /* ----- state from t ----- */
    function stateAt(t) {
      if (held) return 'held';
      if (t < K.pressB) return 'propose';
      if (t < K.runB) return 'working';
      if (t < K.apprB) return 'wait';
      if (t < K.closeA) return 'approving';
      return 'settled';
    }
    function selectedIdx(t) {
      var out = [];
      data.actions.forEach(function (a, i) {
        var on = manual ? a.on : (!a.suggested || t >= K.tick);
        if (on) out.push(i);
      });
      return out;
    }

    /* ----- render card for t ----- */
    function renderCard(t, time) {
      var state = stateAt(t);
      if (card.getAttribute('data-state') !== state) {
        card.setAttribute('data-state', state);
        approve.hidden = state !== 'wait';
        icoLive.src = state === 'working' || state === 'approving' ? LIVING.thinking : state === 'settled' ? LIVING.keyDone : LIVING.idle;
        label.textContent = state === 'working' ? T.doing : state === 'wait' ? T.prepared : state === 'approving' ? T.closing : state === 'settled' ? T.done : T.will;
        $all('.act-check', list).forEach(function (cb) { cb.disabled = state !== 'propose'; });
      }
      var rows = rowsEls(), sel = selectedIdx(t), n = sel.length || 1;
      // checkbox sync (scroll mode drives the Suggested tick)
      if (!manual) rows.forEach(function (li, i) { var cb = li.querySelector('.act-check'); var on = sel.indexOf(i) >= 0; if (cb && cb.checked !== on) cb.checked = on; });
      // chip
      var tools = [], sugg = 0;
      sel.forEach(function (i) { var a = data.actions[i]; if (tools.indexOf(a.app) < 0) tools.push(a.app); });
      data.actions.forEach(function (a, i) { if (a.suggested && sel.indexOf(i) < 0) sugg++; });
      setHTML(chipTxt, sel.length ? T.chip(sel.length, tools, sugg) : T.none);
      setCls(card, 'no-actions', !sel.length);
      // rows
      rows.forEach(function (li, i) {
        var k = sel.indexOf(i), proof = '', out = null, res = null, cls = '';
        if (state === 'propose' || state === 'held') { proof = ''; }
        else if (k < 0) { cls = 'is-skipped'; }
        else if (state === 'working') {
          var u = pu(t, K.runA, K.runB, k, n);
          if (u < 0) { cls = 'is-pending'; proof = 'queued'; out = T.queued; }
          else if (u < 0.45) { cls = 'is-active'; proof = 'preparing'; out = data.actions[i].run; }
          else if (u < 0.8) { cls = 'st-verifying'; proof = 'verifying'; out = T.verifying(data.actions[i].app); }
          else { cls = 'is-done'; proof = 'verified'; res = 'prep'; }
        } else if (state === 'wait') { cls = 'is-done'; proof = 'verified'; res = 'prep'; }
        else if (state === 'approving') {
          var u2 = pu(t, K.proofA, K.proofB, k, n);
          if (u2 < 0) { cls = 'is-pending'; proof = 'queued'; out = T.queued; }
          else if (u2 < 0.4) { cls = 'is-active'; proof = 'preparing'; out = T.applying(data.actions[i].app); }
          else if (u2 < 0.8) { cls = 'st-verifying'; proof = 'verifying'; out = T.fetching(data.actions[i].app); }
          else { cls = 'is-done'; proof = 'verified'; res = 'done'; }
        } else if (state === 'settled') { cls = 'is-done'; proof = 'verified'; res = 'done'; }
        var pg = (state === 'propose' || state === 'held' || k < 0) ? 0 : state === 'working' ? clamp((t - K.runA) / (K.runB - K.runA) > 0 ? pu(t, K.runA, K.runB, k, n) / 0.8 : 0) : 1;
        var pgs = pg.toFixed(3); if (li.__p !== pgs) { li.__p = pgs; li.style.setProperty('--p', pgs); }
        var key = cls + '|' + proof + '|' + res + '|' + out;
        if (li.__k !== key) {
          li.__k = key;
          li.classList.remove('is-pending', 'is-active', 'st-verifying', 'is-done', 'is-skipped');
          if (cls) li.classList.add(cls);
          if (proof) li.setAttribute('data-proof', proof); else li.removeAttribute('data-proof');
          var o = li.querySelector('.act-out');
          o.innerHTML = out ? appB(data.actions[i].app) + ' · ' + expandViewer(out) : o.getAttribute('data-out');
          var r = li.querySelector('.act-res-txt');
          if (res) r.innerHTML = r.getAttribute(res === 'done' ? 'data-done' : 'data-prep') + ' ' + OK;
        }
      });
      var cr = list.querySelector('.act-close');
      if (cr) {
        var ck = state === 'settled' ? 'final' : state === 'wait' || state === 'approving' ? 'ready' : '';
        if (cr.__k !== ck) {
          cr.__k = ck; cr.classList.remove('is-ready', 'is-done', 'is-final', 'ss-proofed');
          if (ck === 'ready') cr.classList.add('is-ready');
          if (ck === 'final') { cr.classList.add('is-done', 'is-final', 'ss-proofed'); var crr = cr.querySelector('.act-res-txt'); if (crr && crr.innerHTML.indexOf('ss-ok') < 0) crr.innerHTML += ' ' + OK; }
        }
      }
      // cascade (scroll mode only)
      var items = rows.concat([cr, addBox, $('#live-chip')]);
      items.forEach(function (el, j) {
        if (!el) return;
        var a = manual || reduced() ? 1 : inOut(seg(t, K.rowsA + j * 0.012, K.rowsA + j * 0.012 + 0.045));
        set(el, 'opacity', a >= 1 ? '' : a.toFixed(3));
        set(el, 'transform', a >= 1 ? '' : 'translate3d(0,' + ((1 - a) * 16).toFixed(1) + 'px,0)');
      });
      // Do It press (Flow's own press: scale-down, ring flash, ripple)
      var pr = manual ? (state === 'propose' && tween && tween.press ? tween.pressU : 0) : clamp((t - K.pressA) / (K.pressB - K.pressA));
      var pressed = pr > 0 && pr < 1;
      set(doit, 'transform', pressed ? 'scale(' + (1 - 0.04 * Math.sin(Math.PI * Math.min(1, pr * 1.6))).toFixed(3) + ')' : '');
      setCls(doit, 'is-pressing', pr > 0.15 && pr < 0.75);
      var rip = doit.querySelector('.doit-ripple');
      var ru = clamp((pr - 0.3) / 0.7);
      set(rip, 'opacity', pressed && pr > 0.3 ? (0.8 * (1 - ru)).toFixed(3) : '0');
      set(rip, 'transform', 'scale(' + (1 + 0.45 * ru).toFixed(3) + ')');
      // approve press
      var ap = clamp((t - K.apprA) / (K.apprB - K.apprA));
      var abtn = $('#btn-approve');
      set(abtn, 'transform', ap > 0 && ap < 1 ? 'scale(' + (1 - 0.04 * Math.sin(Math.PI * ap)).toFixed(3) + ')' : '');
      setCls(abtn, 'is-pressing', ap > 0.2 && ap < 0.8);
      return { state: state, sel: sel };
    }

    /* ----- tiles + beams ----- */
    function renderTiles(t, time, sel) {
      var state = stateAt(t), n = sel.length || 1;
      var cc = smooth(K.collA, K.collB, t);
      var active = false;
      tiles.forEach(function (tile, i) {
        var k = sel.indexOf(i), u = -1;
        if (k >= 0 && (state === 'working' || state === 'wait' || state === 'approving' || state === 'settled')) {
          u = pu(t, K.runA, K.runB, k, n);
        }
        var vis = u >= 0.36 ? smooth(0.36, 0.5, u) : 0;
        vis *= (1 - cc);
        if (state === 'settled') vis = 1;
        if (state === 'propose' || state === 'held') vis = 0;
        var ok = state === 'settled' || u >= 0.8;
        setCls(tile, 'is-ok', ok);
        setCls(tile, 'is-on', vis > 0.02);
        if (vis > 0.01) active = true;
        var parked = state === 'settled' || !geo.mobile;
        var fx = parked ? 0 : Math.cos(time * 0.0008 + i * 1.3) * 4;
        var fy = parked ? 0 : Math.sin(time * 0.0011 + i * 1.7) * 6;
        var par = parked ? 0 : (t - K.runA) * (i % 2 ? 28 : -22);
        var tx = fx, ty = fy + par;
        var s = 0.86 + 0.14 * vis;
        set(tile, 'opacity', vis.toFixed(3));
        set(tile, 'transform', parked ? 'none' : (geo.mobile ? 'translate3d(0,' + ((1 - vis) * 10).toFixed(1) + 'px,0) scale(' + (0.9 + 0.1 * vis).toFixed(3) + ')' :
          'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,' + (40 + i * 18) + 'px) scale(' + s.toFixed(3) + ')'));
        // beams
        var b = beams[i]; if (!b || !b.p || geo.mobile) return;
        var bvis = k >= 0 && u >= 0 && (state === 'working' || state === 'wait') ? (1 - cc) : 0;
        if (bvis <= 0.001) { set(b.p, 'opacity', '0'); set(b.d, 'opacity', '0'); return; }
        var g0 = beamCache[i];
        if (!g0) { set(b.p, 'opacity', '0'); set(b.d, 'opacity', '0'); return; }
        var y1 = g0.y1, x1 = g0.x1 + 18, x2 = g0.x2 + tx, y2 = g0.y2 + ty, dx, d;
        dx = Math.max(60, Math.abs(x1 - x2) * 0.45);
        if (x2 >= x1) {
          d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C' + (x1 + dx).toFixed(1) + ' ' + y1.toFixed(1) + ' ' + (x2 - dx).toFixed(1) + ' ' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
        } else {
          d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' C' + (x1 - dx).toFixed(1) + ' ' + y1.toFixed(1) + ' ' + (x2 + dx).toFixed(1) + ' ' + y2.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
        }
        if (b.p.__d !== d) { b.p.__d = d; b.p.setAttribute('d', d); b.L = b.p.getTotalLength(); b.p.style.strokeDasharray = b.L.toFixed(1); }
        var draw = smooth(0, 0.38, u);
        b.p.style.strokeDashoffset = (b.L * (1 - draw)).toFixed(1);
        set(b.p, 'opacity', ((u >= 0.8 ? 0.28 : 0.9) * bvis).toFixed(3));
        if (u >= 0.45 && u < 0.82) {
          var q = (u - 0.45) / 0.37; var pt = b.p.getPointAtLength(b.L * (1 - q));
          b.d.setAttribute('cx', pt.x.toFixed(1)); b.d.setAttribute('cy', pt.y.toFixed(1)); set(b.d, 'opacity', bvis.toFixed(3));
        } else if (u >= 0 && u < 0.38) {
          var pt2 = b.p.getPointAtLength(b.L * draw); b.d.setAttribute('cx', pt2.x.toFixed(1)); b.d.setAttribute('cy', pt2.y.toFixed(1)); set(b.d, 'opacity', bvis.toFixed(3));
        } else set(b.d, 'opacity', '0');
      });
      return active;
    }
    function measureCollapse() {
      var cr = card.getBoundingClientRect();
      tiles.forEach(function (tile) {
        tile.__toCardX = 0; tile.__toCardY = 0;
        var r = tile.getBoundingClientRect(); if (!r.width) return;
        tile.__toCardX = (cr.left + cr.width * 0.25) - (r.left + r.width / 2);
        tile.__toCardY = (cr.top + cr.height * 0.5) - (r.top + r.height / 2);
      });
    }

    function paintMail(state) {
      var art = $('#gw-artifact', hero);
      if (!art || !data) return;
      var show = false;
      var sent = state === 'settled';
      var key = (show ? '1' : '0') + (sent ? 's' : 'd') + (data.subj || '');
      if (art.__k === key) return;
      art.__k = key;
      art.hidden = !show;
      art.classList.toggle('is-sent', sent);
      var kEl = art.querySelector('[data-art-k]');
      if (kEl) kEl.textContent = sent ? ((I18.STR && I18.STR[LANG] && I18.STR[LANG].sent) || (HE ? 'נשלח' : 'Sent')) : ((I18.STR && I18.STR[LANG] && I18.STR[LANG].draft) || (HE ? 'טיוטה' : 'Draft'));
      var who = art.querySelector('[data-art-who]');
      if (who) who.textContent = data.replyTo || '';
      var body = art.querySelector('[data-art-body]');
      if (body) body.textContent = data.reply || '';
      var note = art.querySelector('[data-art-notion]');
      if (note) note.textContent = data.replyNote || '';
    }

    /* ----- one frame ----- */
    function frame(now) {
      running = false;
      var dt = Math.min(64, now - (lastFrame || now)); lastFrame = now;
      var rm = reduced();
      var p = rm ? 1 : sTl ? SP.p : rawP();
      ys = yTarget = window.scrollY;
      var land = rm ? 1 : manual ? 1 : seg(p, 0, K.landB); /* Flow: arrival + copyOut live inside the scrubbed progress */
      /* one pass: scrolling back scrubs the same story. It does not rewind into another case. */
      // timeline value for the card
      if (tween) {
        var tu = clamp((now - tween.start) / tween.dur);
        var e = tu < 0.5 ? 2 * tu * tu : 1 - Math.pow(-2 * tu + 2, 2) / 2;
        if (tween.press) { tween.pressU = clamp((now - tween.start) / 420); }
        tCard = tween.from + (tween.to - tween.from) * (tween.press ? clamp((now - tween.start - 380) / (tween.dur - 380)) * 1 : e);
        if (tween.press) { var tp = clamp((now - tween.start - 380) / (tween.dur - 380)); tCard = tween.from + (tween.to - tween.from) * (tp < 0.5 ? 2 * tp * tp : 1 - Math.pow(-2 * tp + 2, 2) / 2); }
        if (tu >= 1) { tCard = tween.to; tween = null; }
      } else if (!manual) {
        tCard = rm ? 1 : p; /* both directions, like Flow: scrolling up rewinds the same story */
      }
      /* Resting still (reduced motion, or the static hero used for the page at rest)
         shows the proposed steps, not the empty card from before the scroll story. */
      if ((rm || document.documentElement.classList.contains('h21-static')) && !manual) tCard = K.tick - 0.001;
      else if (tCard > peak) peak = tCard;
      var t = tCard;
      hero.setAttribute('data-stage', String(stageIdx(t)));
      // camera
      var e2 = inOut(land);
      var endA = manual ? 0 : inOut(seg(t, K.closeA, 0.975));
      var rs = geo.rs;
      /* Flow camera: slow push-in while Glance works (C.camera.push), finale settle (C.finale.scale) */
      var foc = rm ? 0 : inOut(seg(t, K.cardA, K.runB)) * (1 - inOut(seg(t, K.collA, K.closeA)));
      var push = 1 + (geo.mobile ? 0.02 : 0.04) * foc;
      var rot = (1 - e2) * 24, sc = rs * (0.8 + 0.2 * e2) * push * (1 - (geo.mobile ? 0.03 : 0.06) * endA), ty = (1 - e2) * geo.drop + endA * (geo.mobile ? 0 : 26);
      set(rig, 'transform', 'translate3d(' + ((1 - e2) * (geo.introDx || 0)).toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) rotateX(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')');
      hero.setAttribute('data-land', land.toFixed(3));
      set(copy, 'opacity', clamp(1 - e2 * 1.5).toFixed(3));
      set(copy, 'transform', 'translate3d(0,' + (-e2 * 70).toFixed(1) + 'px,0) scale(' + (1 - e2 * 0.05).toFixed(4) + ')');
      set(copy, 'visibility', e2 > 0.98 ? 'hidden' : 'visible');
      set(endL, 'opacity', endA.toFixed(3));
      set(endL, 'transform', 'translate3d(0,' + ((1 - endA) * 18).toFixed(1) + 'px,0)');
      var bgF = $('.h21-floor', hero); set(bgF, 'opacity', (1 - e2 * 0.7).toFixed(3));
      /* the mail recedes behind the card while Glance works (Flow: window recede), returns for the close */
      set(win, 'transform', foc > 0.001 ? 'translate3d(0,' + (foc * (geo.mobile ? 6 : 10)).toFixed(1) + 'px,0) scale(' + (1 - 0.035 * foc).toFixed(4) + ')' : '');
      // light sweep: intro once on load, then scroll-linked across the landing
      var intro = clamp((now - t0 - 500) / 1500);
      var sw = land > 0.01 ? land : intro;
      set(sweep, 'transform', 'translate3d(' + (-110 + 240 * sw).toFixed(1) + '%,0,0) skewX(-18deg)');
      set(sweep, 'opacity', (sw > 0 && sw < 1 ? Math.sin(Math.PI * sw) : 0).toFixed(3));
      // ask underline + ping
      var au = manual || rm ? 1 : smooth(K.askA, K.askB, t);
      set(ask, 'backgroundSize', (au * 100).toFixed(1) + '% 2px');
      setCls(ask, 'is-lit', au > 0.98);
      var c = manual || rm ? 1 : smooth(K.cardA, K.cardB, t);
      var pg = manual || rm ? 0 : smooth(K.pingA, K.pingB, t) * (1 - smooth(K.cardA, K.cardA + 0.05, t));
      set(ping, 'opacity', pg.toFixed(3));
      set(ping, 'transform', 'translate3d(0,' + ((1 - pg) * 6).toFixed(1) + 'px,0) scale(' + (0.92 + 0.08 * pg).toFixed(3) + ')');
      setCls(ping, 'is-on', pg > 0.05);
      // card stays at its side. No rise-to-front, no centering over Gmail.
      var cc = smooth(K.collA, K.collB, t);
      /* card rises in from below with Flow's in-out curve (transform set after renderCard, see camera follow) */
      var ce = manual || rm ? 1 : inOut(seg(t, K.cardA, K.cardB));
      setCls(card, 'is-out', c > 0.6);
      set(card, 'pointerEvents', c > 0.9 ? '' : 'none');
      var runV = smooth(K.runA - 0.02, K.runA + 0.03, t) * (1 - smooth(K.runB, K.runB + 0.04, t));
      set(dim, 'opacity', (geo.mobile ? runV * 0.28 : runV * 0.18).toFixed(3));
      paintMail(stateAt(t));
      var r = renderCard(t, now);
      /* camera follows the work on phones (Flow: the add-in card comes over the window).
         a) the card travels up to just under the request text while the steps run, then returns;
         b) on short screens it also rises (and stays) far enough that its bottom stays on screen, keeping the mail's subject visible. */
      var lift = 0, cop = clamp(ce * 1.6), csc = 0.955 + 0.045 * ce;
      if (geo.mobile && !rm) { /* also during the Do It click flow: the click tween drives t, so the camera never jumps */
        /* card height comes from a ResizeObserver (no forced layout per frame), eased so a state change never makes the card jump */
        var hT = geo.cardH || card.offsetHeight; if (!geo.hSm) geo.hSm = hT;
        geo.hSm += (hT - geo.hSm) * (1 - Math.exp(-dt / 70)); if (Math.abs(hT - geo.hSm) < 0.5) geo.hSm = hT;
        var hS = geo.hSm, bot = geo.vh - 12;
        var fit = Math.max(0, geo.rigTop + (geo.cardTop0 + hS) * push - bot);
        var a1 = inOut(seg(t, K.rowsA, K.runB)) * (1 - inOut(seg(t, K.collA, K.closeA))), a2 = inOut(seg(t, K.cardA + 0.03, K.rowsB));
        var bot2 = geo.endTop - 10, hP = hS * push, base = geo.rigTop + geo.cardTop0 * push;
        /* screens where card + closing line cannot sit at rest: the card does not travel back down before the finale (no down-then-up) */
        var tight = base - Math.min(geo.maxLift, Math.max(geo.lift || 0, fit)) + hP > bot2;
        if (tight) a1 = inOut(seg(t, K.rowsA, K.runB));
        /* very short screens: if keeping the subject line would shrink the card under ~0.95, the card may also slide over the subject
           (up to just under Gmail's toolbar), blended continuously so it never jumps */
        var sN = Math.min(1, (bot - (base - geo.maxLift)) / hP), sNe = Math.min(sN, (bot2 - (base - geo.maxLift)) / hP);
        var room = Math.min(sN, sNe + (sN - sNe) * (1 - inOut(seg(t, K.closeA, K.closeA + 0.07))));
        geo.lim = geo.maxLift + (geo.maxLift2 - geo.maxLift) * clamp((0.95 - room) / 0.15);
        lift = Math.min(geo.lim, Math.max((geo.lift || 0) * a1, fit * a2));
        var sFit = Math.min(1, (bot - (base - lift)) / hP), sc2 = sFit;
        /* finale on short screens: first the camera makes room for the closing line (card rises over the mail, opaque; scales only if rising is not enough),
           then the line comes in. No fade of the card over the mail, no moment where the card sits on the line. */
        if (!manual && tight) {
          var eL = seg(t, K.closeA, 0.975), ph = inOut(clamp(eL / 0.55));
          lift = Math.min(geo.lim, Math.max(lift, (base + hP - bot2) * ph));
          sFit = Math.min(1, (bot - (base - lift)) / hP);
          var sEnd = Math.min(sFit, (bot2 - (base - lift)) / hP);
          sc2 = sFit + (sEnd - sFit) * ph;
          var lo = inOut(clamp((eL - 0.5) / 0.5));
          set(endL, 'opacity', lo.toFixed(3)); set(endL, 'transform', 'translate3d(0,' + ((1 - lo) * 18).toFixed(1) + 'px,0)');
        }
        if (ce >= 0.999) csc *= Math.max(0.6, sc2); else csc *= Math.max(0.6, sc2 + (1 - sc2) * (1 - ce));
      }
      set(card, 'transform', 'translate3d(0,' + ((1 - ce) * (geo.mobile ? 150 : 90) - lift).toFixed(1) + 'px,0) scale(' + csc.toFixed(4) + ')');
      set(card, 'opacity', cop.toFixed(3));
      var lf = geo.lift ? clamp(lift / geo.lift * 1.4) : 0;
      if (attEl) set(attEl, 'opacity', lf > 0.001 ? (1 - lf).toFixed(3) : '');
      if (signEl) set(signEl, 'opacity', lf > 0.001 ? (1 - lf).toFixed(3) : '');
      var tilesActive = renderTiles(t, now, r.sel);
      // caption
      var si = stageIdx(t);
      capSteps.forEach(function (li, i) { setCls(li, 'on', i === si); setCls(li, 'done', i < si); });
      setHTML(capTxt, T.caps[si]);
      set(cap, 'opacity', (manual ? 1 : smooth(0.08, 0.16, t)).toFixed(3));
      // keep looping while something moves
      var moving = (!sTl && Math.abs(rawP() - p) > 0.0005) || tween || tilesActive || (now - t0 < 2200) || (geo.mobile && geo.hSm && Math.abs((geo.cardH || 0) - geo.hSm) > 0.5);
      if (moving && inView) kick();
    }
    function stageIdx(t) { return t < K.pressA ? 0 : t < K.runB ? 1 : t < K.apprA ? 2 : t < K.closeA ? 3 : 4; }
    function kick() { if (!running) { running = true; requestAnimationFrame(frame); } }

    /* ----- click flow (drives the same timeline) ----- */
    function goManual() { if (!manual) { manual = true; data.actions.forEach(function (a, i) { a.on = selectedIdx(tCard).indexOf(i) >= 0; }); } }
    function doIt() {
      var st = stateAt(tCard); if (st !== 'propose') return;
      goManual();
      data.actions.forEach(function (a, i) {
        var cb = list.querySelector('li.act[data-i="' + i + '"] .act-check');
        if (cb) a.on = cb.checked;
      });
      if (!data.actions.some(function (a) { return a.on; })) return;
      var from = Math.max(tCard, K.tick + 0.001); from = Math.min(from, K.pressA);
      var n = data.actions.filter(function (a) { return a.on; }).length;
      tCard = from;
      tween = { from: K.pressB - 0.0001, to: K.runB + 0.012, start: performance.now(), dur: reduced() ? 400 : 900 + n * 950, press: !reduced(), pressU: 0 };
      kick();
    }
    function approveIt() { if (stateAt(tCard) !== 'wait') return; goManual(); tween = { from: K.apprA, to: 1, start: performance.now(), dur: reduced() ? 300 : 2100 }; kick(); }
    function undo() { goManual(); held = false; tween = null; tCard = K.tick + 0.001; peak = tCard; last = {}; kick(); }
    function hold() { var st = stateAt(tCard); if (st !== 'propose' && st !== 'wait') return; goManual(); tween = null; tCard = K.tick + 0.001; peak = tCard; held = true; card.setAttribute('data-state', 'held'); kick(); }
    function unpark() { held = false; card.setAttribute('data-state', ''); kick(); }
    function resetTabs() { $all('.uc-tab', hero).forEach(function (t) { var on = t.getAttribute('data-case') === 'invoice'; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); }); }

    card.addEventListener('click', function (e) {
      var tg = e.target; if (!tg || !tg.closest) return;
      if (tg.closest('.approve-btn')) { e.preventDefault(); approveIt(); return; }
      if (tg.closest('.do-halo')) { e.preventDefault(); doIt(); return; }
      if (tg.closest('.chip-x')) { e.preventDefault(); hold(); return; }
      if (tg.closest('.js-undo')) { e.preventDefault(); undo(); return; }
      if (tg.closest('.js-unpark')) { e.preventDefault(); unpark(); return; }
      if (tg.closest('.ss-add-btn')) { e.preventDefault(); addBox.setAttribute('data-open', 'true'); var inp = $('#custom-step-input'); if (inp) inp.focus({ preventScroll: true }); return; }
      if (tg.closest('.act-x')) { e.preventDefault(); var li = tg.closest('li.act'); if (!li) return; var ix = +li.getAttribute('data-i'); goManual(); data.actions.splice(ix, 1); li.remove(); $all('li.act:not(.act-close)', list).forEach(function (row, n) { row.setAttribute('data-i', n); }); kick(); return; }
    });
    list.addEventListener('change', function (e) {
      if (!e.target.classList.contains('act-check')) return;
      var li = e.target.closest('li.act'); var i = +li.getAttribute('data-i');
      goManual(); data.actions[i].on = e.target.checked; if (tCard < K.rowsB) tCard = K.tick + 0.001; if (tCard > peak) peak = tCard; last = {}; kick();
    });
    var inp = $('#custom-step-input');
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { addBox.setAttribute('data-open', 'false'); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault(); var txt = inp.value.trim(); if (!txt || stateAt(tCard) !== 'propose') return;
      goManual();
      var a = classifyStep(txt);
      a.text = esc(txt); a.result = esc(txt); a.done = esc(txt); a.tile = esc(txt);
      data.actions.push(a);
      var tmp = document.createElement('ol'); tmp.innerHTML = rowHTML(a, data.actions.length - 1);
      list.insertBefore(tmp.firstChild, list.querySelector('.act-close'));
      var brand = window.BRAND && window.BRAND[a.tool];
      tilesBox.insertAdjacentHTML('beforeend', '<div class="h21-tile" data-k="' + (data.actions.length - 1) + '" data-tool="' + a.tool + '"><span class="h21-tile-ic' + (brand ? ' is-brand' : '') + '">' + (brand || glyph(a.tool)) + '</span><span class="h21-tile-tx"><b><bdi>' + esc(a.app) + '</bdi></b><em>' + esc(txt) + '</em></span><i class="h21-tile-ok" aria-hidden="true"></i></div>');
      tiles = $all('.h21-tile', tilesBox);
      inp.value = ''; kick();
    });
    $all('.uc-tab', hero).forEach(function (tab) {
      tab.addEventListener('click', function () {
        $all('.uc-tab', hero).forEach(function (x) { x.classList.toggle('on', x === tab); x.setAttribute('aria-selected', x === tab ? 'true' : 'false'); });
        manual = true; held = false; tween = null;
        build(tab.getAttribute('data-case'));
        tCard = K.tick + 0.001; peak = tCard;
        card.classList.remove('case-flash'); void card.offsetWidth; card.classList.add('case-flash');
        kick();
      });
    });

    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', function () { measure(); }, { passive: true });
    if (MQ_REDUCE && MQ_REDUCE.addEventListener) MQ_REDUCE.addEventListener('change', function () { document.documentElement.classList.toggle('h21-static', reduced()); measure(); });
    document.documentElement.classList.toggle('h21-static', reduced());
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { inView = en[0].isIntersecting; if (inView) kick(); }, { rootMargin: '200px' }).observe(hero);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    window.addEventListener('load', measure);
    document.addEventListener('glance:theme', function () { last = {}; kick(); });
    build('launch');
    flowEngine();
    if (window.ResizeObserver) new ResizeObserver(function (en) { var h = en[0].borderBoxSize && en[0].borderBoxSize[0] ? en[0].borderBoxSize[0].blockSize : card.offsetHeight; if (Math.abs(h - (geo.cardH || 0)) > 0.5) { geo.cardH = h; kick(); } }).observe(card);

    return {
      state: function () { return { t: tCard, p: SP.p, engine: sTl ? 'gsap-scrub-.35' : 'raw', lenis: !!lenis, state: stateAt(tCard), manual: manual, land: +hero.getAttribute('data-land'), stage: stageIdx(tCard), rs: geo.rs, range: geo.range, top: geo.top }; },
      rebuild: function () { build(caseId); },
      measure: measure, K: K
    };
  }

  /* ---------------- Slack demo ---------------- */
  var demos = {};
  var waRoot = document.getElementById('demo-whatsapp');
  if (waRoot) {
    var waL = { will: T_WA.will, doing: T_WA.doing, prepared: T_WA.prepared, done: T_WA.done, afterApprove: '', suggested: T_WA.suggested, chip: T_WA.chip, none: T_WA.none, verifying: function (a) { return (I18.T && I18.T[LANG] && I18.T[LANG].verifying) ? I18.T[LANG].verifying(a) : (HE ? 'מאמת ב־' + a + '…' : 'Verifying in ' + a + '…'); } };
    function paintWaThread(pack, keepAsk) {
      var ask = document.getElementById('wa-ask-text');
      var preIn = document.getElementById('wa-pre-in');
      var preOut = document.getElementById('wa-pre-out');
      var preview = document.getElementById('wa-list-preview');
      var draft = document.getElementById('wa-draft-text');
      var sent = document.getElementById('wa-sent-text');
      var intent = document.getElementById('wa-intent');
      if (ask && !keepAsk) ask.textContent = pack.ask;
      if (preIn) preIn.querySelector('p').textContent = pack.preIn;
      if (preOut) preOut.querySelector('p').textContent = pack.preOut;
      if (preview) preview.textContent = pack.ask;
      if (draft) draft.textContent = pack.draft;
      if (sent) sent.textContent = pack.draft;
      if (intent) intent.textContent = pack.intent;
      ['wa-draft-file', 'wa-sent-file'].forEach(function (id) {
        var el = document.getElementById(id); if (!el) return;
        el.hidden = !pack.file;
        var b = el.querySelector('b'); if (b && pack.file) b.textContent = pack.file;
      });
    }
    demos.whatsapp = makeCloser(waRoot, WA, { L: waL, stepMs: 900, direct: true });
    function applyWa(pack, keepAsk) {
      WA = waData(pack);
      if (window.__glance) window.__glance.wa = WA;
      paintWaThread(pack, keepAsk);
      demos.whatsapp.render(WA);
    }
    var waInput = document.getElementById('wa-compose');
    var waThinkTimer = null;
    function sendWa(text) {
      text = String(text || '').trim();
      if (!text || demos.whatsapp.state() === 'working') return;
      var live = document.getElementById('wa-live');
      if (live) {
        var bubble = document.createElement('div');
        bubble.className = 'wa21-msg bubble in tail wa21-just';
        var now = new Date();
        var stamp = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        bubble.innerHTML = '<p></p><span class="wa21-time"></span>';
        bubble.querySelector('p').textContent = text;
        bubble.querySelector('.wa21-time').textContent = stamp;
        live.appendChild(bubble);
      }
      var preview = document.getElementById('wa-list-preview');
      if (preview) preview.textContent = text;
      if (waInput) waInput.value = '';
      var card = document.getElementById('wa-glance');
      var think = card && card.querySelector('.wa-think');
      if (card) card.classList.add('is-thinking');
      if (think) think.hidden = false;
      clearTimeout(waThinkTimer);
      waThinkTimer = setTimeout(function () {
        if (card) card.classList.remove('is-thinking');
        if (think) think.hidden = true;
        applyWa(waFromAsk(text), true);
      }, 1000);
    }
    $all('#wa-suggests button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = +btn.getAttribute('data-i');
        if (WA_ASKS[i]) sendWa(WA_ASKS[i].ask);
      });
    });
    var waSend = document.getElementById('wa-send');
    if (waSend) waSend.addEventListener('click', function () { sendWa(waInput && waInput.value); });
    if (waInput) waInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      sendWa(waInput.value);
    });
    paintWaThread(WA_ASKS[0]);
  }

  /* ---------------- viewer name ("See it with my name") ---------------- */
  function initials(n) { var p = String(n).trim().split(/\s+/); return ((p[0] || '')[0] || '').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase(); }
  function applyViewerEverywhere() {
    $all('.viewer-name').forEach(function (el) { el.textContent = viewerName; });
    $all('.viewer-initials').forEach(function (el) { el.textContent = initials(viewerName) || 'S'; });
    $all('.viewer-first-name').forEach(function (el) { el.textContent = String(viewerName).split(/\s+/)[0]; });
    if (H) H.rebuild();
    Object.keys(demos).forEach(function (k) { demos[k].render(); });
    document.dispatchEvent(new CustomEvent('glance:viewer', { detail: viewerName }));
  }
  function syncCaptureUI() {
    var card = document.getElementById('capture-card'), hint = document.getElementById('capture-hint');
    if (viewerName !== VIEWER_DEFAULT) {
      if (card) card.hidden = true; document.body.classList.remove('capture-open');
      if (hint) {
        hint.hidden = false;
        hint.innerHTML = ((I18.STR && I18.STR[LANG] && I18.STR[LANG].preview) || (HE ? 'מוצג עבור <b>' : 'Previewing as <b>')) + esc(viewerName) + '</b> · <button type="button" class="name-reset-inline" id="btn-reset-viewer">' + ((I18.STR && I18.STR[LANG] && I18.STR[LANG].backTo) || (HE ? 'חזרה לסאלי' : 'Back to Sali Sapan')) + '</button>';
        var r = document.getElementById('btn-reset-viewer'); if (r) r.addEventListener('click', function () { setViewer(VIEWER_DEFAULT); });
      }
    } else if (hint) { hint.hidden = true; hint.textContent = ''; }
  }
  function setViewer(next) {
    viewerName = (next || VIEWER_DEFAULT).trim().slice(0, 40) || VIEWER_DEFAULT;
    try { if (viewerName === VIEWER_DEFAULT) localStorage.removeItem(VIEWER_LS_KEY); else localStorage.setItem(VIEWER_LS_KEY, viewerName); } catch (e) {}
    applyViewerEverywhere(); syncCaptureUI();
  }
  try {
    var fromUrl = (new URLSearchParams(location.search).get('name') || '').trim();
    if (fromUrl) { viewerName = fromUrl.slice(0, 40); localStorage.setItem(VIEWER_LS_KEY, viewerName); }
    else { var stored = (localStorage.getItem(VIEWER_LS_KEY) || '').trim(); if (stored) viewerName = stored.slice(0, 40); }
  } catch (e) { viewerName = VIEWER_DEFAULT; }
  var bb = document.getElementById('btn-back-demos');
  if (bb) bb.addEventListener('click', function (e) { e.preventDefault(); var s = document.getElementById('surfaces'); if (s) s.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); });

  /* 20.11 perf: the living icons (~950KB) are not needed for first paint. Warm them on the first scroll/tap/key after load, or 8s after load. A swapped src keeps the old icon until the new one is ready, so nothing blinks */
  (function () { var done = false, ev = ['scroll', 'pointerdown', 'keydown', 'touchstart', 'wheel']; function warm() { if (done) return; done = true; ev.forEach(function (n) { removeEventListener(n, warm, true); }); Object.keys(LIVING).forEach(function (k) { var im = new Image(); im.decoding = 'async'; im.src = LIVING[k]; }); } function arm() { ev.forEach(function (n) { addEventListener(n, warm, { capture: true, passive: true }); }); setTimeout(warm, 8000); } if (document.readyState === 'complete') arm(); else addEventListener('load', arm, { once: true }); })();
  if (viewerName !== VIEWER_DEFAULT) applyViewerEverywhere();
  syncCaptureUI();
  window.__glance = { cases: CASES, wa: WA, demos: demos, hero: H };
})();

/* meet.js */
/* Corner v21 — Meet journey: one intent heard on a Google Meet call → Glance prepares it in
   Docs → Drive → Calendar → Gmail (the stage visibly switches tools, ~1.8s each) → back to Meet,
   Prepared · nothing sent → Approve → Closed + receipt + Undo. Autoplays once in view (stops at
   Prepared: Glance never approves for you). Replay control. Light + Dark. */
(function () {
  'use strict';
  var kit = window.__glanceKit; if (!kit) return;
  var root = document.getElementById('mj'); if (!root) return;
  var HE = kit.HE;
  var LANG = (document.documentElement.lang || '').slice(0, 2) || 'en';
  var I18 = window.GLANCE_I18N || {};
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var DATA = (I18.MEET && I18.MEET[LANG]) || (HE ? {
    intent: 'נועה צריכה את ההצעה ל־<bdi>Riverview</bdi> עד יום ראשון.',
    actions: [
      { tool: 'docs', app: 'Docs', text: 'ליצור הצעת מחיר', out: '<bdi>₪48,000</bdi>', run: 'יוצר הצעה…', runSub: '', result: 'מוכנה', done: 'נוצרה' },
      { tool: 'slack', app: 'Slack', text: 'טיוטה ב־<bdi>#riverview</bdi>', out: 'לא נשלח', run: 'מכין טיוטה…', runSub: '', result: 'מוכנה', done: 'נשלחה' },
      { tool: 'morning', app: 'Morning', text: 'הצעת מחיר <bdi>Q-2208</bdi>', out: 'לא הופקה', run: 'פותח הצעה…', runSub: '', result: 'מוכנה', done: 'הופקה' },
      { tool: 'outlook', app: 'Outlook', text: 'טיוטה לנועה', out: 'לא נשלח', run: 'מכין טיוטה…', runSub: '', result: 'מוכנה', done: 'נשלחה' }
    ],
    close: { text: 'לסגור כשההצעה אצל נועה', done: 'נסגר · ההצעה אצל נועה' },
    receipt: '<b>נסגר</b> · ההצעה אצל נועה · <bdi>Slack</bdi> · <bdi>Morning</bdi> · <bdi>Outlook</bdi> · <em class="js-undo">ביטול</em>',
    pill: { docs: ['Docs · יוצר הצעה…', 'Docs · מוכן ✓'], slack: ['Slack · מכין טיוטה…', 'Slack · מוכן ✓'], morning: ['Morning · פותח הצעה…', 'Morning · מוכן ✓'], outlook: ['Outlook · מכין טיוטה…', 'Outlook · מוכן ✓'] },
    L: { will: 'Glance יבצע', doing: 'Glance עובד', prepared: 'מוכן · שום דבר לא נשלח', done: 'בוצע', afterApprove: '', suggested: 'מוצע', verifying: function (a) { return 'מאמת ב־' + a + '…'; } }
  } : {
    intent: 'Nora needs the Riverview proposal by Sunday.',
    actions: [
      { tool: 'docs', app: 'Docs', text: 'Create the proposal', out: '€48,000', run: 'Creating…', runSub: '', result: 'Ready', done: 'Created' },
      { tool: 'slack', app: 'Slack', text: 'Draft in #riverview', out: 'Not sent', run: 'Drafting…', runSub: '', result: 'Ready', done: 'Sent' },
      { tool: 'morning', app: 'Xero', text: 'Quote Q-2208', out: 'Not issued', run: 'Opening…', runSub: '', result: 'Ready', done: 'Issued' },
      { tool: 'outlook', app: 'Outlook', text: 'Draft to Nora', out: 'Not sent', run: 'Drafting…', runSub: '', result: 'Ready', done: 'Sent' }
    ],
    close: { text: 'Close once Nora has the proposal', done: 'Closed · Nora has the proposal' },
    receipt: '<b>Closed</b> · proposal with Nora · Slack · Xero · Outlook · <em class="js-undo">Undo</em>',
    pill: { docs: ['Docs · Creating…', 'Docs · Ready ✓'], slack: ['Slack · Drafting…', 'Slack · Ready ✓'], morning: ['Xero · Opening…', 'Xero · Ready ✓'], outlook: ['Outlook · Drafting…', 'Outlook · Ready ✓'] },
    L: null
  });
  var L = DATA.L || { will: kit.T.will, doing: kit.T.doing, prepared: kit.T.prepared, done: kit.T.done, afterApprove: kit.T.afterApprove, suggested: kit.T.suggested, verifying: kit.T.verifying };
  L.afterApprove = ''; L.chip = function (n) { return kit.T.chip(n, [], 0); }; L.none = kit.T.none;

  var STEP = 1800, ORDER = ['docs', 'slack', 'morning', 'outlook'];
  var screens = {}; $all('.mj-screen', root).forEach(function (s) { screens[s.getAttribute('data-screen')] = s; });
  var rail = {}; $all('.mj-rail li', root).forEach(function (li) { rail[li.getAttribute('data-k')] = li; });
  var pill = $('.mj-pill', root), pillT = $('.mj-pill-t', root), pillIco = $('.mj-pill .living-ico', root);
  var cardStage = document.getElementById('demo-meet');
  var timers = [], played = false;
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearT() { timers.forEach(clearTimeout); timers = []; }

  function show(name) {
    var cur = root.getAttribute('data-step');
    Object.keys(screens).forEach(function (k) {
      var s = screens[k];
      s.classList.remove('leaving');
      if (k === cur && k !== name) s.classList.add('leaving');
      s.classList.toggle('on', k === name);
      if (k === name && k !== 'meet') { s.classList.remove('play'); void s.offsetWidth; s.classList.add('play'); }
    });
    root.setAttribute('data-step', name);
    if (name === 'docs') typeSummary();
    later(function () { $all('.mj-screen.leaving', root).forEach(function (s) { s.classList.remove('leaving'); }); }, 700);
    Object.keys(rail).forEach(function (k) { rail[k].classList.toggle('on', k === name); });
  }
  function setPill(txt, done) { pillT.textContent = txt; pill.classList.toggle('is-done', !!done); pillIco.src = done ? kit.LIVING.keyDone : kit.LIVING.thinking; }
  var summaryFull = '';
  function typeSummary() {
    var el = document.getElementById('meet-summary');
    if (!el) return;
    if (!summaryFull) summaryFull = el.textContent;
    if (kit.reduced()) { el.textContent = summaryFull; return; }
    el.textContent = '';
    var i = 0;
    (function step() {
      if (root.getAttribute('data-step') !== 'docs') return;
      i += 1;
      el.textContent = summaryFull.slice(0, i);
      if (i < summaryFull.length) later(step, 18);
    })();
  }
  function resetRail() { Object.keys(rail).forEach(function (k) { rail[k].classList.remove('done'); }); }

  var closer = kit.makeCloser(cardStage, DATA, {
    L: L, stepMs: STEP, direct: true,
    onDoIt: function () { root.setAttribute('data-phase', 'run'); resetRail(); },
    onStep: function (k) { var key = ORDER[k] || 'docs'; show(key); pill.classList.add('on'); setPill(DATA.pill[key][0], false); },
    onStepDone: function (k) { var key = ORDER[k] || 'docs'; rail[key].classList.add('done'); setPill(DATA.pill[key][1], true); },
    onRunEnd: function (cb) {
      later(function () { pill.classList.remove('on'); show('meet'); root.setAttribute('data-phase', 'back'); later(cb, kit.reduced() ? 0 : 380); }, kit.reduced() ? 0 : 260);
    },
    onState: function (s) {
      root.setAttribute('data-state', s);
      if (s === 'wait' || s === 'settled') root.setAttribute('data-ran', '1');
      var replay = document.getElementById('mj-replay');
      if (replay) replay.hidden = root.getAttribute('data-ran') !== '1';
      if (s === 'propose') { root.setAttribute('data-phase', root.getAttribute('data-phase') === 'intro' ? 'intro' : 'ready'); }
    },
    onUndo: function () { reset(true); }
  });

  function reset(keepCard) {
    clearT(); pill.classList.remove('on', 'is-done'); resetRail();
    Object.keys(screens).forEach(function (k) { screens[k].classList.remove('play', 'leaving'); });
    show('meet');
    if (!keepCard && closer.state() !== 'propose') closer.undo();
    root.setAttribute('data-phase', keepCard ? 'ready' : 'intro');
    $('.mt', root).classList.remove('cc-on', 'hl-on');
  }
  function intro(autoDo) {
    reset(false);
    var mt = $('.mt', root);
    var R = kit.reduced();
    later(function () { mt.classList.add('cc-on'); }, R ? 0 : 250);
    later(function () { mt.classList.add('hl-on'); }, R ? 0 : 1650);
    later(function () { root.setAttribute('data-phase', 'ready'); }, R ? 0 : 2100);
    if (autoDo && !R) later(function () { if (closer.state() === 'propose') { var b = cardStage.querySelector('.demo-doit'); b.classList.add('is-pressing'); later(function () { b.classList.remove('is-pressing'); closer.doIt(); root.setAttribute('data-phase', 'run'); resetRail(); }, 260); } }, 3500);
  }
  // clicking Do It before the intro finished still works
  cardStage.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.do-halo')) { $('.mt', root).classList.add('cc-on', 'hl-on'); } }, true);
  $('#mj-replay').addEventListener('click', function () { intro(true); });
  var overlayUndo = $('.mj-close .js-undo', root);
  if (overlayUndo) overlayUndo.addEventListener('click', function (e) { e.preventDefault(); closer.undo(); });

  // canvas: one fixed design size, scaled to the frame (narrow design on phones so type stays legible)
  var vp = $('.mj-viewport', root), cv = $('.mj-canvas', root);
  function fit() {
    var w = vp.clientWidth || 1180, narrow = window.innerWidth <= 760;
    var W = narrow ? 820 : 1180, H = narrow ? 620 : 640;
    root.classList.toggle('mj-narrow', narrow);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    var sc = w / W; vp.style.setProperty('--mj-s', sc.toFixed(4)); vp.style.height = Math.round(H * sc) + 'px';
  }
  fit(); window.addEventListener('resize', fit);
  // caption words appear one by one
  $all('.mt-w', root).forEach(function (w, i) { w.style.transitionDelay = (i * 120) + 'ms'; });
  // static start for screenshots / no JS autoplay yet: captions shown, card visible
  $('.mt', root).classList.add('cc-on', 'hl-on'); root.setAttribute('data-phase', 'ready');
  if ('IntersectionObserver' in window && !kit.reduced()) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting && !played) { played = true; io.disconnect(); intro(true); } }, { threshold: 0.45 });
    io.observe(root);
  }
  window.__meet = { closer: closer, intro: intro, reset: reset, played: function () { return played; }, step: function () { return root.getAttribute('data-step'); } };
})();

/* v21.js */
/* Corner v21 — small page behaviours: WhatsApp Web icons · A-day carousel (snap + arrows + dots). */
(function () {
  'use strict';
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  /* WhatsApp Web icon set (simple, accurate paths · no emoji-as-icons) */
  var WA = {
    search: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M15.9 14.3h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>',
    dots: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"/></svg>',
    newchat: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975zm3-4H7.041V7.1h9.975z"/></svg>',
    video: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3.27 4.5h11.46c.7 0 1.27.57 1.27 1.27v3.17l4.4-3.04c.52-.36 1.1-.08 1.1.56v11.08c0 .64-.58.92-1.1.56L16 15.06v3.17c0 .7-.57 1.27-1.27 1.27H3.27C2.57 19.5 2 18.93 2 18.23V5.77c0-.7.57-1.27 1.27-1.27z"/></svg>',
    emoji: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm-3.204 1.362c-.026-.307-.131 5.218 6.063 5.551 6.066-.25 6.066-5.551 6.066-5.551-6.078 1.416-12.129 0-12.129 0zm11.363 1.108s-.669 1.959-5.051 1.959c-3.505 0-5.388-1.164-5.607-1.959 0 0 5.912 1.055 10.658 0zM11.804 1.011C5.609 1.011.978 6.033.978 12.228s4.826 10.761 11.021 10.761S23.02 18.423 23.02 12.228c.001-6.195-5.021-11.217-11.216-11.217zM12 21.354c-5.273 0-9.381-3.886-9.381-9.159s3.942-9.548 9.215-9.548 9.548 4.275 9.548 9.548c-.001 5.272-4.109 9.159-9.382 9.159zm3.108-9.751c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 11.1h-7.1V4h-1.8v7.1H4v1.8h7.1V20h1.8v-7.1H20z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.999 14.942c2.001 0 3.531-1.53 3.531-3.531V4.35c0-2.001-1.53-3.531-3.531-3.531S8.469 2.35 8.469 4.35v7.061c0 2.001 1.53 3.531 3.53 3.531zm6.238-3.53c0 3.531-2.942 6.002-6.237 6.002s-6.237-2.471-6.237-6.002H3.761c0 4.001 3.178 7.297 7.061 7.885v3.884h2.354v-3.884c3.884-.588 7.061-3.884 7.061-7.885z"/></svg>',
    dbl: '<svg viewBox="0 0 16 11"><path fill="currentColor" d="M11.07.65a.46.46 0 0 0-.3-.1.49.49 0 0 0-.39.18L4.2 8.37 1.79 6.1a.46.46 0 0 0-.34-.15.47.47 0 0 0-.34.15l-.31.31a.45.45 0 0 0-.14.34c0 .13.05.25.14.34l3 3c.13.13.31.2.5.2a.7.7 0 0 0 .55-.27l6.64-8.42a.5.5 0 0 0 .11-.3.44.44 0 0 0-.19-.37zm4 0a.46.46 0 0 0-.3-.1.49.49 0 0 0-.39.18L8.2 8.37l-.75-.71-.63.8 1.07 1.06c.13.13.31.2.5.2a.7.7 0 0 0 .55-.27l6.64-8.42a.5.5 0 0 0 .11-.3.44.44 0 0 0-.19-.37z"/></svg>'
  };
  $all('[data-wa]').forEach(function (el) { if (!el.firstChild) el.innerHTML = WA[el.getAttribute('data-wa')] || ''; });
  var AV = '<svg viewBox="0 0 212 212"><path fill="currentColor" class="wa-av-bg" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"/><path class="wa-av-fg" d="M173.6 180.6c-6.8-25.6-26.5-40.6-46.9-45.4 12.3-7.3 20.6-20.8 20.6-36.2 0-23.3-18.9-42.2-42.2-42.2S62.9 75.7 62.9 99c0 15.4 8.3 28.8 20.5 36.2-20.4 4.8-40.1 19.8-46.9 45.4A105.6 105.6 0 0 0 106 212c26.6 0 50.9-9.8 67.6-31.4z"/></svg>';
  var GRP = '<svg viewBox="0 0 212 212"><path fill="currentColor" class="wa-av-bg" d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"/><path class="wa-av-fg" d="M102.4 148.5c-24.6 0-46.3 12.3-55.7 30.4A105.6 105.6 0 0 0 106 212c22.4 0 43.2-7 60.3-18.9-9.2-26.7-36.2-44.6-63.9-44.6zm-1-14.6c17.3 0 31.3-14 31.3-31.3s-14-31.3-31.3-31.3-31.3 14-31.3 31.3 14 31.3 31.3 31.3zm60.5 7.4c12.8 0 23.1-10.3 23.1-23.1s-10.3-23.1-23.1-23.1-23.1 10.3-23.1 23.1 10.3 23.1 23.1 23.1zm3.6 7.9c-7.5 0-14.5 1.9-20.4 5.1 13.2 9.2 22.7 22.6 26.7 38.1A106 106 0 0 0 206 145c-9.6-3.2-24.7-3.2-40.5 4.2z"/></svg>';
  $all('.wa21-av').forEach(function (el) { if (!el.firstChild) el.innerHTML = el.classList.contains('wa21-av-grp') ? GRP : AV; });

  /* A day with Glance — snap carousel */
  var track = document.getElementById('day-track');
  if (track) {
    var cards = $all('.day21-card', track), dots = $all('.day21-dots i');
    function step() { var c = cards[0]; return c ? c.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || 20) : 320; }
    function idx() { var r = track.getBoundingClientRect(), rtl = getComputedStyle(track).direction === 'rtl', pad = parseFloat(getComputedStyle(track).scrollPaddingInlineStart) || 0, best = 0, bd = 1e9; cards.forEach(function (c, i) { var cr = c.getBoundingClientRect(); var d = rtl ? Math.abs(r.right - cr.right - pad) : Math.abs(cr.left - r.left - pad); if (d < bd) { bd = d; best = i; } }); return best; }
    function sync() {
      var i = idx(); dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      var rtl = getComputedStyle(track).direction === 'rtl';
      var max = track.scrollWidth - track.clientWidth, x = Math.abs(track.scrollLeft);
      $all('.day21-arrow').forEach(function (b) { var dir = +b.getAttribute('data-dir'); b.disabled = dir < 0 ? x < 4 : x > max - 4; });
      track.setAttribute('data-index', String(i));
    }
    $all('.day21-arrow').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = +b.getAttribute('data-dir'); var rtl = getComputedStyle(track).direction === 'rtl';
        track.scrollBy({ left: dir * step() * (rtl ? -1 : 1), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }
})();

/* v23.js */
/* Corner v23 — dress every step mark with the Wensity ring, then a check. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function dress(box) {
    if (!box || box.querySelector('.w-ring')) return;
    if (box.classList.contains('act-none') || box.classList.contains('act-lock')) return;
    var ring = document.createElement('span');
    ring.className = 'w-ring';
    ring.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 12; i++) {
      var line = document.createElement('i');
      line.style.setProperty('--i', String(i));
      ring.appendChild(line);
    }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'w-check');
    svg.setAttribute('viewBox', '0 0 18 18');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M5 9.2 L8 12.1 L13.2 6.2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '1.7');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    box.appendChild(ring);
    box.appendChild(svg);
  }
  function scan(root) {
    (root || document).querySelectorAll('.act-box').forEach(dress);
  }
  function boot() { scan(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  if (document.body) {
    new MutationObserver(function (records) {
      records.forEach(function (rec) {
        rec.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.classList && node.classList.contains('act-box')) dress(node);
          if (node.querySelectorAll) node.querySelectorAll('.act-box').forEach(dress);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();

/* v26.js */
/* Corner v26 — fold the hero list, press every Do It, fade the ask row. */
(function () {
  'use strict';
  var LANG = (document.documentElement.lang || '').slice(0, 2) || 'en';
  var HE = LANG === 'he';
  var I18 = window.GLANCE_I18N || {};
  var reduceQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduceQ && reduceQ.matches); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function labelMore(list) {
    var btn = $('.act-more-btn', list);
    if (!btn) return;
    var n = list.querySelectorAll('.act.is-extra').length;
    var open = list.classList.contains('is-open');
          btn.textContent = open ? ((I18.STR && I18.STR[LANG] && I18.STR[LANG].showLess) || (HE ? 'הצג פחות' : 'Show less')) : ((I18.STR && I18.STR[LANG] && I18.STR[LANG].more) ? I18.STR[LANG].more(n) : (HE ? '+' + n + ' נוספים' : '+' + n + ' more'));
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function fold(list) {
    if (!list || list.dataset.folding === '1') return;
    list.dataset.folding = '1';
    var acts = $all(':scope > li.act:not(.act-close):not(.act-more)', list);
    acts.forEach(function (li, i) { li.classList.toggle('is-extra', i >= 4); });
    var extra = Math.max(0, acts.length - 4);
    var more = $('.act-more', list);
    if (!extra) {
      if (more) more.remove();
      delete list.dataset.folding;
      return;
    }
    if (!more) {
      more = document.createElement('li');
      more.className = 'act-more';
      more.innerHTML = '<button type="button" class="act-more-btn"></button>';
      var close = $('.act-close', list);
      list.insertBefore(more, close);
      $('.act-more-btn', more).addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        list.classList.toggle('is-open');
        labelMore(list);
      });
    }
    labelMore(list);
    delete list.dataset.folding;
  }

  function watchSteps() {
    var list = document.getElementById('live-acts');
    if (!list) return;
    fold(list);
    new MutationObserver(function () { fold(list); }).observe(list, { childList: true });
  }

  function ringOf(btn) {
    var root = btn.closest('.glance-surface, .pillar, .h21-card') || btn.parentElement;
    return root ? root.querySelector('.living-ico') : null;
  }

  function ensureTick(icon) {
    var host = icon.parentElement;
    if (!host.classList.contains('v26-ring')) {
      host = document.createElement('span');
      host.className = 'v26-ring';
      icon.parentElement.insertBefore(host, icon);
      host.appendChild(icon);
    }
    var tick = host.querySelector('.v26-tick');
    if (!tick) {
      tick = document.createElement('span');
      tick.className = 'v26-tick';
      tick.setAttribute('aria-hidden', 'true');
      tick.innerHTML = TICK;
      host.appendChild(tick);
    }
    return tick;
  }

  function morph(icon) {
    if (!icon || reduced()) return;
    var now = performance.now();
    if (icon._morphAt && now - icon._morphAt < 680) return;
    icon._morphAt = now;
    var tick = ensureTick(icon);
    icon.classList.remove('is-morph');
    tick.classList.remove('is-on');
    void icon.offsetWidth;
    icon.classList.add('is-morph');
    tick.classList.add('is-on');
    window.setTimeout(function () {
      icon.classList.remove('is-morph');
      tick.classList.remove('is-on');
    }, 740);
  }

  function bindPress(btn) {
    if (btn.dataset.v26) return;
    btn.dataset.v26 = '1';
    var downAt = 0;
    function down() { downAt = performance.now(); btn.classList.add('v26-down'); }
    function up() {
      var wait = Math.max(0, 120 - (performance.now() - downAt));
      window.setTimeout(function () {
        btn.classList.remove('v26-down');
        morph(ringOf(btn));
      }, wait);
    }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', function () { btn.classList.remove('v26-down'); });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') down();
    });
    btn.addEventListener('keyup', function (e) {
      if (e.key === 'Enter' || e.key === ' ') up();
    });
    new MutationObserver(function () {
      if (btn.classList.contains('is-pressing')) morph(ringOf(btn));
    }).observe(btn, { attributes: true, attributeFilter: ['class'] });
  }

  function bindDoIts() {
    $all('.do-halo, .pillar-chip .chip-do, .pillar-chip .doit-dark').forEach(bindPress);
  }

  function fadeRow() {
    var track = document.getElementById('day-track');
    if (!track) return;
    function sync() {
      var max = track.scrollWidth - track.clientWidth;
      var x = Math.abs(track.scrollLeft);
      track.classList.toggle('can-prev', x > 6);
      track.classList.toggle('can-next', max > 6 && x < max - 6);
    }
    track.addEventListener('scroll', function () { window.requestAnimationFrame(sync); }, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }

  function boot() {
    watchSteps();
    bindDoIts();
    fadeRow();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* signup.js */
/* Corner v25 — bottom signup. Query ?state= drives the review states. */
(function () {
  'use strict';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function param(name) {
    try { return new URLSearchParams(location.search).get(name); }
    catch (e) { return null; }
  }

  function spokes(host) {
    if (!host || host.querySelector('.su-spin')) return;
    var spin = document.createElement('span');
    spin.className = 'su-spin';
    spin.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 12; i++) {
      var line = document.createElement('i');
      line.style.setProperty('--i', String(i));
      spin.appendChild(line);
    }
    host.appendChild(spin);
  }

  function boot() {
    var form = qs('[data-signup]');
    if (!form) return;
    var email = qs('#su-email', form);
    var terms = qs('#su-terms', form);
    var mail = qs('#su-mail', form);
    var btn = qs('[data-submit]', form);
    var retry = qs('[data-retry]', form);
    var forced = null;
    spokes(btn);

    function unlock() {
      email.disabled = false;
      terms.disabled = false;
      mail.disabled = false;
      btn.removeAttribute('aria-busy');
    }

    function showLive() {
      var value = email.value.trim();
      var valid = EMAIL.test(value);
      if (value && !valid) form.setAttribute('data-show-invalid', '1');
      else form.removeAttribute('data-show-invalid');
      btn.disabled = !(valid && terms.checked);
      form.dataset.mail = mail.checked ? '1' : '0';
      unlock();
    }

    function apply(state) {
      unlock();
      form.removeAttribute('data-show-invalid');
      form.removeAttribute('data-redirect');
      if (!state) {
        forced = null;
        form.dataset.state = '';
        showLive();
        return;
      }
      forced = state;
      form.dataset.state = state;
      if (state === 'empty') {
        email.value = '';
        terms.checked = false;
        mail.checked = false;
        btn.disabled = true;
      } else if (state === 'invalid') {
        email.value = 'sali@';
        terms.checked = true;
        mail.checked = false;
        btn.disabled = true;
      } else if (state === 'terms') {
        email.value = 'sali@flow.dev';
        terms.checked = false;
        mail.checked = false;
        btn.disabled = true;
      } else if (state === 'loading') {
        email.value = 'sali@flow.dev';
        terms.checked = true;
        mail.checked = false;
        btn.disabled = true;
        email.disabled = true;
        terms.disabled = true;
        mail.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      } else if (state === 'error') {
        email.value = 'fail@flow.dev';
        terms.checked = true;
        mail.checked = false;
        btn.disabled = false;
      } else if (state === 'success') {
        email.value = 'sali@flow.dev';
        terms.checked = true;
        mail.checked = true;
        btn.disabled = true;
      }
      form.dataset.mail = mail.checked ? '1' : '0';
    }

    function submit() {
      if (forced === 'loading') return;
      var value = email.value.trim();
      if (!EMAIL.test(value)) {
        forced = null;
        form.dataset.state = 'invalid';
        form.setAttribute('data-show-invalid', '1');
        btn.disabled = true;
        return;
      }
      if (!terms.checked) {
        forced = null;
        form.dataset.state = 'terms';
        form.removeAttribute('data-show-invalid');
        btn.disabled = true;
        return;
      }
      forced = 'loading';
      form.dataset.state = 'loading';
      form.removeAttribute('data-show-invalid');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      email.disabled = true;
      terms.disabled = true;
      mail.disabled = true;
      var opted = mail.checked;
      var fail = value.toLowerCase() === 'fail@flow.dev';
      window.setTimeout(function () {
        if (form.dataset.state !== 'loading') return;
        unlock();
        if (fail) {
          forced = 'error';
          form.dataset.state = 'error';
          form.removeAttribute('data-redirect');
          btn.disabled = false;
          return;
        }
        forced = 'success';
        form.dataset.state = 'success';
        form.dataset.mail = opted ? '1' : '0';
        form.removeAttribute('data-redirect');
        btn.disabled = true;
      }, 700);
    }

    email.addEventListener('input', function () {
      if (forced) forced = null;
      if (form.dataset.state && form.dataset.state !== 'loading') form.dataset.state = '';
      form.removeAttribute('data-redirect');
      showLive();
    });
    terms.addEventListener('change', function () {
      if (forced) forced = null;
      if (form.dataset.state === 'terms') form.dataset.state = '';
      showLive();
    });
    mail.addEventListener('change', function () {
      form.dataset.mail = mail.checked ? '1' : '0';
      if (!forced) showLive();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit();
    });
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || (retry && e.target === retry)) return;
      e.preventDefault();
      submit();
    });
    if (retry) retry.addEventListener('click', function () {
      forced = null;
      form.dataset.state = '';
      form.removeAttribute('data-redirect');
      showLive();
      email.focus();
    });

    var initial = param('state');
    var known = { empty: 1, invalid: 1, terms: 1, loading: 1, error: 1, success: 1 };
    apply(known[initial] ? initial : null);
    if (!initial) {
      form.dataset.state = 'empty';
      btn.disabled = true;
      mail.checked = false;
      terms.checked = false;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
