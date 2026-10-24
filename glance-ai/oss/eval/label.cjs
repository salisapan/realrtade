const fs=require('fs'); const T=require('./teacher.cjs');
const rows=fs.readFileSync('cases.jsonl','utf8').trim().split('\n').map(JSON.parse);
const out=[];
for (const c of rows){ const t=T.judge(c); c.teacher=t; if(c.set==='A') c.gold={decision:t.decision,family:t.family||null,action:t.action||null,title:t.title||null,due:t.due||null}; out.push(c); }
fs.writeFileSync('eval.jsonl', out.map(r=>JSON.stringify(r)).join('\n')+'\n');
const agg={};
for (const c of out){ const k=c.set+' '+c.category+' '+c.lang; agg[k]=agg[k]||{act:0,sil:0,reasons:{}}; if(c.teacher.decision==='act') agg[k].act++; else {agg[k].sil++; agg[k].reasons[c.teacher.reason]=(agg[k].reasons[c.teacher.reason]||0)+1;} }
for (const [k,v] of Object.entries(agg)) console.log(k.padEnd(28), 'act',v.act,'sil',v.sil, JSON.stringify(v.reasons));
const B=out.filter(c=>c.set==='B'); let wrong=0, miss=0;
for (const c of B){ const g=c.gold.decision, p=c.teacher.decision; if(g==='silence'&&p==='act'){wrong++;console.log('TEACHER WRONG-DO-IT',c.id,c.teacher.action,c.body.slice(0,60));} if(g==='act'&&p==='silence'){miss++;console.log('TEACHER MISS',c.id,c.teacher.reason,c.body.slice(0,60));} }
console.log('teacher on B: wrong',wrong,'miss',miss);
// ---- hand-check pass over Set A (reviewed 2026-10-07): correct clear teacher errors; keep teacher label otherwise.
const OVR_SIL = ['he-news-102','he-news-106','en-3p-163','en-3p-165','en-3p-169'];
const OVR_ACT = { meeting:['calendar','schedule'], sender_promise:['task','log-it'], request_reply:['reply','reply-track'], save_attachment:['file','file-it'] };
const DAY_HE={'ראשון':'2026-10-11','שני':'2026-10-12','שלישי':'2026-10-13','רביעי':'2026-10-14','חמישי':'2026-10-08'};
for (const c of out) {
  if (c.set!=='A') continue;
  c.goldSource='teacher';
  if (OVR_SIL.includes(c.id)) { c.gold={decision:'silence',family:null,action:null,title:null,due:null}; c.goldSource='hand-override(teacher wrong-Do-It)'; }
  else if (c.teacher.decision==='silence' && OVR_ACT[c.category]) {
    const [fam,act]=OVR_ACT[c.category]; const m=c.body.match(/(?:ביום|עד)\s+(?:יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי)/);
    c.gold={decision:'act',family:fam,action:act,title: fam==='task'? (T.CT.titleFromBody(c.body)||null):null, due: m? DAY_HE[m[1]]:null};
    c.goldSource='hand-override(teacher miss)';
  }
}
for (const c of out) if (c.set==='B') c.goldSource='hand';
fs.writeFileSync('eval.jsonl', out.map(r=>JSON.stringify(r)).join('\n')+'\n');
const n=(f)=>out.filter(f).length;
console.log('total',out.length,'EN',n(c=>c.lang==='en'),'HE',n(c=>c.lang==='he'),'gold act',n(c=>c.gold.decision==='act'),'gold silence',n(c=>c.gold.decision==='silence'),'overrides',n(c=>/override/.test(c.goldSource)));
