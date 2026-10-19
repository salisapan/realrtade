'use strict';
const fs = require('fs');
const path = require('path');

const FIX_DIR = path.join(__dirname, '../../test/fixtures/gmail-livedom');

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function parseDomFile(name) {
  const raw = fs.readFileSync(path.join(FIX_DIR, name + '.txt'), 'utf8');
  const html = raw.split('=== (1) outerHTML ===')[1].split('=== (2) aria-label ===')[0].trim();
  const aria = raw.split('=== (2) aria-label ===')[1].split('=== (3)')[0].trim();
  const cleaned = html
    .replace(/<div class="flow-chip-host"[\s\S]*?<\/div>/gi, '')
    .replace(/\sdata-glance-[a-z-]+="[^"]*"/gi, '');
  let detailsTable = '';
  const ajB = cleaned.match(/<div class="ajB">[\s\S]*?<\/div>\s*<\/div>/i);
  if (ajB) detailsTable = ajB[0];
  else {
    const table = cleaned.match(/<table[^>]*class="[^"]*ajC[^"]*"[\s\S]*?<\/table>/i);
    if (table) detailsTable = '<div class="ajB">' + table[0] + '</div>';
  }
  return { html: cleaned, aria: aria, detailsTable: detailsTable };
}

function toOnlyMeDetailsTable(tableHtml, own) {
  if (!tableHtml) return tableHtml;
  const meSpan = `<span email="${own}" data-hovercard-id="${own}" role="button" aria-haspopup="dialog" tabindex="-1"> ‫${own}‬</span>`;
  return tableHtml
    .replace(/<tr class=" ajv"><th colspan="2" scope="row" class="gG"><span class="gI">אל:<\/span><\/th><td colspan="2" class="gL">[\s\S]*?<\/td><\/tr>/i,
      `<tr class=" ajv"><th colspan="2" scope="row" class="gG"><span class="gI">אל:</span></th><td colspan="2" class="gL"><span class="gI"><div role="toolbar" aria-orientation="vertical" tabindex="0"><ol class="ATvwCb"><li>${meSpan}</li></ol></div></span></td></tr>`)
    .replace(/<tr class=" ajv"><th colspan="2" scope="row" class="gG"><span class="gI">עותק:<\/span><\/th><td colspan="2" class="gL">[\s\S]*?<\/td><\/tr>/i,
      '<tr class=" ajv"><th colspan="2" scope="row" class="gG"><span class="gI">עותק:</span></th><td colspan="2" class="gL"><span class="gI"><div role="toolbar" aria-orientation="vertical" tabindex="0"><ol class="ATvwCb"></ol></div></span></td></tr>');
}

function liveGmailPage(opts) {
  const o = opts || {};
  const own = 'ai.local.flow@gmail.com';
  const main = parseDomFile(o.liveDom);
  const details = o.detailsFrom ? parseDomFile(o.detailsFrom) : null;
  if (o.liveMutate === 'toOnlyMe' && details && details.detailsTable) {
    details.detailsTable = toOnlyMeDetailsTable(details.detailsTable, own);
  }
  const lang = o.liveLang === 'en' ? 'en' : 'he';
  const title = o.title || 'Gmail';
  const tableJson = details && details.detailsTable ? JSON.stringify(details.detailsTable) : '""';
  let mutate = '';
  if (o.liveMutate === 'emptyTo-ccOnlyMe' || o.liveMutate === 'toOnlyMe') {
    mutate = `document.querySelectorAll('span.hb [email]').forEach(function(n){
        var e=(n.getAttribute('email')||'').toLowerCase();
        if(e.indexOf('${own}')<0) n.remove();
      });`;
  }
  if (o.liveMutate === 'quietBody') {
    mutate += `var body=document.querySelector('.a3s');if(body)body.textContent='Thanks, got it.';`;
  }
  const toOnlyMeFix = o.liveMutate === 'toOnlyMe'
    ? `if(window.__glanceLiveMutate==='toOnlyMe'&&block){
        var own='${own}';
        var toTr=null, ccTr=null;
        block.querySelectorAll('tr.ajv').forEach(function(tr){
          var lab=((tr.querySelector('th.gG .gI')||{}).textContent||'').replace(/\\s+/g,'');
          if(/אל:|^to:/i.test(lab)) toTr=tr;
          if(/עותק:|^cc:/i.test(lab)) ccTr=tr;
        });
        if(toTr&&ccTr){
          var me=ccTr.querySelector('[email="'+own+'"]');
          var toCell=toTr.querySelector('td.gL');
          if(me&&toCell){
            var li=me.closest('li')||me;
            toCell.innerHTML='<div role="toolbar" aria-orientation="vertical"><ol class="ATvwCb"></ol></div>';
            toCell.querySelector('ol').appendChild(li);
            var ccOl=ccTr.querySelector('td.gL ol');
            if(ccOl) ccOl.innerHTML='';
          }
        }
      }`
    : '';
  if (o.liveMutate === 'toOnlyMe') {
    mutate += `window.__glanceLiveMutate='toOnlyMe';`;
  }
  const wireToggle = details && details.detailsTable
    ? `document.querySelectorAll('.ajy').forEach(function(btn){
        btn.addEventListener('click', function(){
          var row = btn.closest('td') || btn.parentElement;
          if(!row || row.querySelector('.ajB')) return;
          var wrap = document.createElement('div');
          wrap.innerHTML = ${tableJson};
          var block = wrap.firstElementChild;
          if(block) row.insertBefore(block, btn);
          ${toOnlyMeFix}
        });
      });`
    : '';
  const accountLabel = main.aria.replace(/\s+/g, ' ').trim();
  return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><title>' + esc(title) + '</title></head><body>' +
    '<a class="gb_d" aria-label="' + esc(accountLabel) + '" href="#"></a>' +
    main.html +
    '<script>' + mutate + wireToggle + '</script></body></html>';
}

function loadCases() {
  const lines = fs.readFileSync(path.join(FIX_DIR, 'cases.jsonl'), 'utf8').trim().split('\n');
  return lines.map((line) => JSON.parse(line));
}

module.exports = { liveGmailPage, loadCases, FIX_DIR };
