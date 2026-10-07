// Adds the parallel worker's adversarial (Set C) and gold22 real-mail (Set D) cases to eval.jsonl (read-only reuse; snapshot copied).
const fs=require('fs'); const T=require('./teacher.cjs');
const rows=fs.readFileSync('eval.jsonl','utf8').trim().split('\n').map(JSON.parse).filter(r=>r.set==='A'||r.set==='B');
const famOf={file_save:'file',calendar:'calendar',draft:'reply',task:'task'};
function conv(r,set,goldDec,goldFam){
  const own = r.direction==='outbound' || /ai\.local\.flow|salisapan/.test((r.from&&r.from.email)||'');
  const c={id:set+'-'+r.id,set,lang:r.lang||(/[\u0590-\u05FF]/.test(r.body)?'he':'en'),subject:r.subject||'',body:r.body,category:r.kind||r.family||r.sourceKind||'real',
    from:(r.from&&r.from.email)||'x@example.com',fromName:(r.from&&r.from.name)||null,direction:own?'outbound':'inbound',surface:r.surface||'gmail',
    attachments: r.attachmentCount? Array.from({length:r.attachmentCount},(_,i)=>'attachment'+(i+1)+'.pdf'):[], goldSource:set==='C'?'worker-adversarial-spec':'gold22(m0Label, model-labeled, not owner-verified)'};
  c.gold={decision:goldDec,family:goldFam||null,action:null,title:null,due:null};
  c.teacher=T.judge(c); return c;
}
const adv=fs.readFileSync('worker-snapshot/adversarial.jsonl','utf8').trim().split('\n').map(JSON.parse).filter(r=>r.expect!=='AMBIGUOUS');
for(const r of adv) rows.push(conv(r,'C', r.expect==='SILENT'?'silence':'act', famOf[r.expect]));
const g=fs.readFileSync('worker-snapshot/gold22.jsonl','utf8').trim().split('\n').map(JSON.parse);
for(const r of g){ let fam=null; if(r.m0Label==='ASK'){ fam = r.teacher.primaryStep==='draft'?'reply':(r.teacher.primaryStep? famOf[r.teacher.primaryStep]||'reply':'reply'); } rows.push(conv(r,'D', r.m0Label==='ASK'?'act':'silence', fam)); }
fs.writeFileSync('eval.jsonl', rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
const n=(f)=>rows.filter(f).length;
console.log('total',rows.length,'C',n(r=>r.set==='C'),'D',n(r=>r.set==='D'),'EN',n(r=>r.lang==='en'),'HE',n(r=>r.lang==='he'));
for(const r of rows.filter(r=>r.set==='C'||r.set==='D')) if(r.teacher.decision!==r.gold.decision) console.log('teacher-vs-gold',r.id,r.gold.decision,r.teacher.decision,r.teacher.action||r.teacher.reason,'|',r.body.slice(0,70).replace(/\n/g,' '));
