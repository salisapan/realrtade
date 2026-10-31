window.__opx={rtl:function(){return document.documentElement.dataset.ui==='he'},lang:function(){return document.documentElement.dataset.ui==='he'?'he':'en'}};
(function(){
const OC={
 he:{whereH:'איפה המידע שלכם',srvRow:'שרת במשרד',cloud:'ענן חיצוני',ai:'שירותי AI חיצוניים',never:'אף פעם',
     s1:'השאלה מתחילה במשרד',s2:'Flow עובד על השרת שלכם',s3:'התשובה חוזרת, ושום דבר לא יצא',n:['שלב 1','שלב 2','שלב 3'],aCloud:'ענן חיצוני'},
 en:{whereH:'Where your data lives',srvRow:'Server in your office',cloud:'External cloud',ai:'External AI services',never:'Never',
     s1:'The question starts in your office',s2:'Flow works on your server',s3:'The answer comes back, and nothing left',n:['Step 1','Step 2','Step 3'],aCloud:'External cloud'},
 es:{whereH:'Dónde están sus datos',srvRow:'Servidor en su oficina',cloud:'Nube externa',ai:'Servicios de IA externos',never:'Nunca',
     s1:'La pregunta empieza en su oficina',s2:'Flow trabaja en su servidor',s3:'La respuesta vuelve y nada salió',n:['Paso 1','Paso 2','Paso 3'],aCloud:'Nube externa'}};
const CK='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 6.4l2.3 2.3 4.5-4.9"/></svg>';
const cloudSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.6 4.7 4.7 0 0 1 17.5 18z"/></svg>';
function inView(el,cls,freeze){const rm=matchMedia('(prefers-reduced-motion:reduce)').matches||document.documentElement.classList.contains('rm');
 if(freeze!=null||rm||!('IntersectionObserver' in window)){el.classList.add(cls);return}
 const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){el.classList.add(cls);io.disconnect()}},{threshold:.25});io.observe(el)}

const FC={
 he:{ask:'הבקשה מגיעה',ans:'התשובה נשארת בפנים',no:'שום דבר לא יוצא מהרשת',ext:'ענן חיצוני',sub:'הכול על השרת שלכם',
  src:[['מייל מלקוח','«מה מצב התיק?»'],['מסמך','«לבדוק חוזה»'],['בקשה מצוות','«לתאם פגישה?»']],
  dst:['טיוטת תשובה','תיק לקוח','יומן','מסמך','משימה','אנשי קשר','ארכיון']},
 en:{ask:'The ask arrives',ans:'Stays inside',no:'Nothing leaves the network',ext:'External cloud',sub:'All on your server',
  src:[['Client email','“Case update?”'],['Document','“Review NDA”'],['Team request','“Book a call?”']],
  dst:['Draft reply','Client file','Calendar','Document','Task','Contacts','Archive']},
 es:{ask:'La solicitud llega',ans:'Se queda dentro',no:'Nada sale de la red',ext:'Nube externa',sub:'Todo en su servidor',
  src:[['Correo cliente','«¿Novedades?»'],['Documento','«Ver contrato»'],['Del equipo','«¿Reunión?»']],
  dst:['Borrador','Expediente','Agenda','Documento','Tarea','Contactos','Archivo']}};
const RINGF={l:['assets/onprem/flow-ring-lumf-live-l.webp','assets/onprem/flow-ring-lumf-still-l.webp'],d:['assets/onprem/flow-ring-lumf-live-d.webp','assets/onprem/flow-ring-lumf-still-d.webp']};
const FI={
 mail:'<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3.8 8l8.2 5.8L20.2 8"/>',
 doc:'<path d="M7 3.5h6.8L18.5 8v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M13.5 3.7V8h4.8M8.5 13h7M8.5 16.5h5"/>',
 file:'<path d="M3.5 8a2.5 2.5 0 0 1 2.5-2.5h3.6l2 2.4H18A2.5 2.5 0 0 1 20.5 10v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17z"/>',
 reply:'<path d="M9.8 6 4.5 11.3l5.3 5.3"/><path d="M4.8 11.3h9.2a5.5 5.5 0 0 1 5.5 5.5v1.7"/>',
 cal:'<rect x="4" y="5.5" width="16" height="14.5" rx="3.2"/><path d="M4 10.2h16M8.5 3.5v3.6M15.5 3.5v3.6"/>',
 team:'<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5"/><circle cx="17" cy="9.8" r="2.2"/><path d="M16 14.2c2.6-.2 4.2 1.4 4.6 4.3"/>',
 task:'<rect x="4" y="4" width="16" height="16" rx="4.2"/><path d="M8.5 12.3l2.5 2.5 4.6-5"/>',
 person:'<circle cx="12" cy="9" r="3.4"/><path d="M5.5 19.5c.6-3.6 3.1-5.6 6.5-5.6s5.9 2 6.5 5.6"/>',
 arch:'<rect x="3.5" y="4.5" width="17" height="5" rx="1.8"/><path d="M5 9.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5M10 13.5h4"/>'};
const PAIRS=[[0,0],[1,1],[2,2],[0,5],[1,3],[2,4]];
window.OPV=function(el,K,lang,X){
 const C=FC[lang]||FC.en,html=document.documentElement;
 const rm=()=>matchMedia('(prefers-reduced-motion:reduce)').matches||html.classList.contains('rm');
 const still=rm()||X.freeze!=null;
 const theme=()=>html.getAttribute('data-theme')==='dark'?'d':'l';
 const ico=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${FI[k]}</svg>`;
 const SK=['mail','doc','team'],DK=['reply','file','cal','doc','task','person','arch'];
 const ly=(cls,k,t,q)=>`<span class="opf-ly ${cls}"><span class="opf-t">${ico(k)}</span><span class="opf-x"><b>${t}</b>${q!=null?`<i>${q}</i>`:''}</span></span>`;
 const card=(c,i,k,t,q)=>`<div class="opf-cd ${c}" data-i="${i}"><i class="opf-on"></i>${ly('off',k,t,q)}${ly('on',k,t,q)}</div>`;
 el.innerHTML=`<div class="opf" role="img" aria-label="${C.ask} → ${K.srv} → ${C.ans}. ${K.block}"><div class="opf-box" aria-hidden="true">
  <svg class="opf-svg"><g class="gf"></g><path class="bl l1"/><path class="bl l2"/><circle class="tw" style="opacity:0"/><circle class="td"/></svg>
  <span class="opf-lab a">${C.ask}</span><span class="opf-lab b">${C.ans}</span>
  <div class="opf-halo"><i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i></div><img class="opf-live" alt="" width="24" height="24" decoding="async">
  ${C.src.map((s,i)=>card('s',i,SK[i],s[0],null)).join('')}${C.dst.map((s,i)=>card('d',i,DK[i],s,null)).join('')}
  <div class="opf-hub"><b>${K.srv}</b><small>${K.hs||C.sub}</small></div></div></div>`;
 const root=el.querySelector('.opf'),box=root.querySelector('.opf-box'),svg=box.querySelector('.opf-svg'),gf=svg.querySelector('.gf');
 const l1=svg.querySelector('.l1'),l2=svg.querySelector('.l2'),td=svg.querySelector('.td'),tw=svg.querySelector('.tw');
 const halo=box.querySelector('.opf-halo'),live=box.querySelector('.opf-live'),hubT=box.querySelector('.opf-hub');
 const CS=[...box.querySelectorAll('.opf-cd.s')],CD=[...box.querySelectorAll('.opf-cd.d')];
 const setRing=()=>{const t=RINGF[theme()],want=still?t[1]:t[0];if(live.getAttribute('src')!==want)live.setAttribute('src',want)};
 {const go=()=>{setRing();new MutationObserver(setRing).observe(html,{attributes:true,attributeFilter:['data-theme']})};if('IntersectionObserver' in window){const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();go()}},{rootMargin:'900px 0px'});io.observe(box)}else go()}
 let G=null,cur=0;
 const f1=n=>n.toFixed(1);
 /* every coordinate below is a measure of the 1024x530 reference, times u */
 function layout(){const W=box.offsetWidth,H=box.offsetHeight;if(!W)return;const u=W/1024;
  root.style.setProperty('--u',u.toFixed(5));
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const rtl=getComputedStyle(root).direction==='rtl',s=rtl?1:-1;/* s=+1: sources on the right */
  const hx=W/2,hy=244*u,R=54*u,cw=233*u,sh=61.5*u,dh=49.2*u;
  const sL=rtl?W-49*u-cw:49*u,dL=rtl?49.5*u:W-49.5*u-cw;
  const sIn=rtl?sL:sL+cw,dIn=rtl?dL+cw:dL;
  const sy=[201.7,274.2,346.6].map(v=>v*u),dy=[0,1,2,3,4,5,6].map(k=>(95+60*k)*u);
  CS.forEach((c,i)=>{c.style.cssText=`left:${sL}px;top:${sy[i]-sh/2}px;width:${cw}px;height:${sh}px`});
  CD.forEach((c,i)=>{c.style.cssText=`left:${dL}px;top:${dy[i]-dh/2}px;width:${cw}px;height:${dh}px`});
  const he=hx+s*R,de=hx-s*R;
  const PS=y=>{const k=Math.abs(sIn-he)*.5;return `M${f1(sIn)} ${f1(y)}C${f1(sIn-s*k)} ${f1(y)} ${f1(he+s*k)} ${f1(hy)} ${f1(he)} ${f1(hy)}`};
  const PD=y=>{const k=Math.abs(dIn-de)*.5;return `M${f1(de)} ${f1(hy)}C${f1(de-s*k)} ${f1(hy)} ${f1(dIn+s*k)} ${f1(y)} ${f1(dIn)} ${f1(y)}`};
  const p1=sy.map(PS),p2=dy.map(PD);
  gf.innerHTML=p1.concat(p2).map(d=>`<path class="f" d="${d}"/>`).join('');
  halo.style.cssText=`left:${hx}px;top:${hy}px`;live.style.cssText=`left:${hx}px;top:${hy}px`;
  hubT.style.cssText=`left:${hx}px;top:${317*u}px`;
  G={p1,p2};setCur(cur)}
 const lens=[0,0];
 function setCur(i){cur=i;if(!G)return;const [s,d]=PAIRS[i%PAIRS.length];l1.setAttribute('d',G.p1[s]);l2.setAttribute('d',G.p2[d]);lens[0]=l1.getTotalLength();lens[1]=l2.getTotalLength();
  CS.forEach((c,k)=>c.classList.toggle('act',k===s));CD.forEach((c,k)=>c.classList.toggle('act',k===d))}
 const ez=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
 const CYC=4.5;
 function dot(t){const u=ez((t-.55)/2.3),on=t>.5&&t<3.1;if(!on||!G){td.style.opacity=0;tw.style.opacity=0;return}
  const L=lens[0]+lens[1],p=u*L,pa=p<=lens[0]?l1.getPointAtLength(p):l2.getPointAtLength(p-lens[0]),f=Math.min(1,(t-.5)/.25,(3.1-t)/.3);
  const tr=`translate(${pa.x}px,${pa.y}px)`;td.style.transform=tr;tw.style.transform=tr;td.style.opacity=f;tw.style.opacity=f*.1}
 function draw(t){if(!G)return;
  const out=1-ez((t-3.75)/.65),a=ez((t-.3)/1.4),b=ez((t-1.55)/1.3);
  l1.style.strokeDasharray=lens[0];l1.style.strokeDashoffset=lens[0]*(1-a);l1.style.opacity=a>0?out:0;
  l2.style.strokeDasharray=lens[1];l2.style.strokeDashoffset=lens[1]*(1-b);l2.style.opacity=b>0?out:0;
  dot(t)}
 function drawStill(){if(!G)return;setCur(0);l1.style.strokeDasharray='none';l1.style.opacity=1;l2.style.strokeDasharray='none';l2.style.opacity=1;
  const q=l2.getPointAtLength(lens[1]*.2);td.style.transform=tw.style.transform=`translate(${q.x}px,${q.y}px)`;td.style.opacity=1;tw.style.opacity=.1}
 let running=false,raf=0,t0=0,acc=0,idx=-1;
 function frame(now){if(!running)return;const t=(now-t0)/1000+acc,n=Math.floor(t/CYC),tc=t-n*CYC;if(n!==idx){idx=n;setCur(n%PAIRS.length)}draw(tc);raf=requestAnimationFrame(frame)}
 function start(){if(running||still)return;running=true;t0=performance.now();raf=requestAnimationFrame(frame)}
 function stop(){if(!running)return;running=false;cancelAnimationFrame(raf);acc+=(performance.now()-t0)/1000}
 layout();
 if(still)drawStill();else if('IntersectionObserver' in window)new IntersectionObserver(es=>{es.some(e=>e.isIntersecting)?start():stop()},{threshold:.1}).observe(root);else start();
 const re=()=>{layout();if(still)drawStill()};
 if('ResizeObserver' in window)new ResizeObserver(re).observe(box);
 if(document.fonts&&document.fonts.ready)document.fonts.ready.then(re);
 const mq=matchMedia('(prefers-reduced-motion:reduce)');mq.addEventListener&&mq.addEventListener('change',()=>location.reload());
}
})();
/* v13r34 · On-Prem (r32 engine, scoped; language follows the page; en/he/es, other languages fall back to English) */
(()=>{
// r32 engine: one global clock. 0..INTRO = entrance (circles rise, lines draw, LED lights), then the pulse loop.
const INTRO=1.9;
const ease=x=>x<=0?0:x>=1?1:1-Math.pow(1-x,3), eio=x=>x<=0?0:x>=1?1:(x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2), cl=x=>Math.max(0,Math.min(1,x));
function Stage(el,paths,rings,opt){
 opt=Object.assign({seg:92,speed:150,pauses:[.25,.5,.25,1.4],ripple:.9},opt);
 const NS='http://www.w3.org/2000/svg',svg=el.querySelector('svg'),defs=svg.querySelector('defs');
 const g=document.createElementNS(NS,'linearGradient');g.id='pg'+Math.random().toString(36).slice(2);g.setAttribute('gradientUnits','userSpaceOnUse');
 [['0','0'],['.45','.12'],['.8','.55'],['.96','1'],['1','1']].forEach(([o,a])=>{const st=document.createElementNS(NS,'stop');st.setAttribute('offset',o);st.style.stopColor='var(--acc)';st.setAttribute('stop-opacity',a);g.appendChild(st)});defs.appendChild(g);
 const mk=(p,c)=>{const h=p.cloneNode();h.removeAttribute('class');h.setAttribute('class',c);svg.appendChild(h);return h};
 const tint=paths.map(p=>mk(p,'tint')),tail=paths.map(p=>{const h=mk(p,'tail');h.style.stroke='url(#'+g.id+')';return h}),hi=paths.map(p=>{const h=mk(p,'hi');h.style.stroke='url(#'+g.id+')';return h});
 const head=document.createElementNS(NS,'circle');head.setAttribute('class','head');head.setAttribute('r','1.9');svg.appendChild(head);
 const dash=svg.querySelector('path.dash'),DL=dash.getTotalLength();
 const L=paths.map(p=>p.getTotalLength());let stops=[],acc=0,arrive=[],start=[];
 paths.forEach((p,i)=>{const dur=(L[i]+opt.seg)/opt.speed;start[i]=acc;stops.push({i,dur,at:acc});arrive[i]=acc+L[i]/opt.speed;acc+=dur;if(opt.pauses[i]){stops.push({i:-1,dur:opt.pauses[i],at:acc});acc+=opt.pauses[i];}});
 const total=acc;
 const nds=['e-firm','e-back','e-hub','e-srv'].map(id=>el.querySelector('#'+id)),fade=[el.querySelector('.net'),el.querySelector('#e-inet'),el.querySelector('.blk'),...el.querySelectorAll('.tiny')];
 const led=el.querySelector('#e-srv .led'),ledh=el.querySelector('#e-srv .ledh');
 function intro(t){ // t in [0,INTRO]; t>=INTRO clears inline state so hover works
  if(t>=INTRO){nds.forEach(n=>{n.style.removeProperty('--l');n.style.transform='';n.style.opacity=''});fade.forEach(f=>f.style.opacity='');paths.forEach(p=>{p.style.strokeDasharray='';p.style.strokeDashoffset=''});dash.style.strokeDasharray='';dash.style.strokeDashoffset='';return;}
  const f=ease(t/.4);fade.forEach(x=>x.style.opacity=f);
  nds.forEach((n,i)=>{const p=ease((t-.1-i*.09)/.75);n.style.opacity=cl(p*1.6);n.style.transform=`translateY(${(1-p)*14}px) scale(${.96+.04*p})`;n.style.setProperty('--l',(.15+.85*p).toFixed(3));});
  paths.forEach((p,i)=>{const q=eio((t-.75-i*.08)/.6);p.style.strokeDasharray=L[i]+' '+L[i];p.style.strokeDashoffset=(L[i]*(1-q)).toFixed(1)});
  const qd=eio((t-.95)/.4);dash.style.strokeDasharray='';dash.style.opacity=(.45*qd).toFixed(3);
  const u=t-1.35;led.style.opacity=(u<0?0:Math.min(.55,u/.25*.55)+.45*Math.max(0,Math.sin(Math.PI*cl(u/.4)))*(u<.4?1:0)).toFixed(3);ledh.style.opacity=(u>0&&u<.4?.28*Math.sin(Math.PI*u/.4):0).toFixed(3);
 }
 function pulse(T){hi.forEach(h=>h.style.opacity=0);tail.forEach(h=>h.style.opacity=0);head.style.opacity=0;
  for(const s of stops){if(T>=s.at&&T<s.at+s.dur&&s.i>=0){const e=T-s.at,Li=L[s.i],pos=e*opt.speed,h=hi[s.i],tl=tail[s.i];
    [h,tl].forEach(x=>{x.style.opacity='';x.setAttribute('stroke-dasharray',opt.seg+' '+(Li+opt.seg*2));x.setAttribute('stroke-dashoffset',opt.seg-pos)});
    const a=paths[s.i].getPointAtLength(Math.max(0,pos-opt.seg)),b=paths[s.i].getPointAtLength(Math.min(Li,pos));
    g.setAttribute('x1',a.x);g.setAttribute('y1',a.y);g.setAttribute('x2',b.x+(b.x===a.x&&b.y===a.y?.01:0));g.setAttribute('y2',b.y);
    if(pos<=Li){head.setAttribute('cx',b.x);head.setAttribute('cy',b.y);head.style.opacity=Math.min(1,pos/20,(Li-pos)/26+.15).toFixed(3);}}}
  // active path turns from grey to Flow blue behind the comet, then eases back
  tint.forEach((x,i)=>{const e=T-start[i],Li=L[i];if(e<0||e>(L[i]+opt.seg)/opt.speed+.9){x.style.opacity=0;return;}
   const pos=Math.min(Li,e*opt.speed),after=Math.max(0,e-Li/opt.speed);x.setAttribute('stroke-dasharray',pos+' '+(Li+10));x.style.opacity=(Math.min(1,pos/40)*(1-cl(after/.9))).toFixed(3);});
  const R=new Map();rings.forEach((r,i)=>{if(!r)return;const dt=((T-arrive[i])%total+total)%total,u=dt/opt.ripple,c=R.get(r);if(u<1&&(c==null||u<c))R.set(r,u);else if(!R.has(r))R.set(r,null);});
  R.forEach((u,r)=>{if(u==null){r.style.opacity=0;return}const q=1-Math.pow(1-u,3);r.style.transform=`scale(${1+.3*q})`;r.style.opacity=(.4*(1-u)).toFixed(3)});
  const u=((T-arrive[1])%total+total)%total;let k=0;if(u<.5)k=Math.sin(Math.PI*u/.5);else if(u>=.6&&u<1.1)k=.8*Math.sin(Math.PI*(u-.6)/.5);
  led.style.opacity=(.55+.45*k).toFixed(3);ledh.style.opacity=(.06+.24*k).toFixed(3);}
 function draw(G){if(G<INTRO){intro(G);hi.forEach(h=>h.style.opacity=0);tail.forEach(h=>h.style.opacity=0);tint.forEach(h=>h.style.opacity=0);head.style.opacity=0;rings.forEach(r=>r&&(r.style.opacity=0));}else{intro(INTRO);pulse((G-INTRO)%total);}}
 return {total,arrive,draw,stop(){[...hi,...tail,...tint,head,g].forEach(x=>x.remove());rings.forEach(r=>r&&(r.style.opacity=0))}};}


const T={
 en:{dir:'ltr',font:'"Inter Tight"',eye:'Flow-Onprem',h:'Need it on your own server?',q:'Flow-Onprem runs entirely inside your office.',
  sub:'Flow and the AI model run on a dedicated server in your firm’s network. We set it up with your IT team during implementation.',
  firm:'Your firm',reply:'Reply',srv:'Flow-Onprem',srvSub:'',chip:'AI model',net:'Your firm’s network',inet:'Internet',block:'Nothing leaves the network',mfs:'Incoming question',mss:'Your server',mrs:'Back to your firm',
  v:['Emily Carter','$184,500'],stay:'stays inside your network',
  pts:[['A dedicated server in your network','Flow and the AI model run on one server inside your firm, not on an employee’s computer.'],
       ['Nothing goes to the cloud','Requests are handled on your server, not by an outside AI service.'],
       ['Full control stays with you','The server sits in your network and follows your IT team’s policies.']]},
 he:{dir:'rtl',font:'"Heebo"',eye:'Flow-Onprem',h:'צריכים הכול על שרת משלכם?',q:'‏Flow-Onprem פועל כולו בתוך המשרד.',
  sub:'‏Flow ומודל ה־AI פועלים על שרת ייעודי ברשת של המשרד. אנחנו מקימים אותו יחד עם צוות ה־IT שלכם בשלב ההטמעה.',
  firm:'המשרד',reply:'תשובה',srv:'Flow-Onprem',srvSub:'',chip:'מודל AI',net:'הרשת של המשרד',inet:'אינטרנט',block:'שום דבר לא יוצא מהרשת',mfs:'שאלה נכנסת',mss:'השרת שלכם',mrs:'חוזרת למשרד',
  v:['דנה כהן','₪184,500'],stay:'נשאר בתוך הרשת שלכם',
  pts:[['שרת ייעודי ברשת שלכם','‏Flow ומודל ה־AI פועלים על שרת אחד בתוך המשרד, לא על מחשב של עובד.'],
       ['שום דבר לא עולה לענן','הבקשות מטופלות על השרת שלכם, לא בשירות AI חיצוני.'],
       ['השליטה המלאה נשארת אצלכם','השרת נמצא ברשת שלכם ופועל לפי המדיניות של צוות ה־IT.']]},
 es:{dir:'ltr',font:'"Inter Tight"',eye:'Flow-Onprem',h:'¿Lo necesita en su propio servidor?',q:'Flow-Onprem funciona por completo dentro de su oficina.',
  sub:'Flow y el modelo de IA funcionan en un servidor dedicado en la red de su firma. Lo configuramos con su equipo de TI durante la implantación.',
  firm:'Su firma',reply:'Respuesta',srv:'Flow-Onprem',srvSub:'',chip:'Modelo de IA',net:'Red de su firma',inet:'Internet',block:'Nada sale de la red',mfs:'Pregunta entrante',mss:'Su servidor',mrs:'Vuelve a la firma',
  v:['Lucía Fernández','184.500 €'],stay:'se queda dentro de su red',
  pts:[['Un servidor dedicado en su red','Flow y el modelo de IA funcionan en un servidor dentro de su firma, no en el ordenador de un empleado.'],
       ['Nada va a la nube','Las solicitudes se procesan en su servidor, no en un servicio de IA externo.'],
       ['El control total es suyo','El servidor está en su red y sigue las políticas de su equipo de TI.']]}};

const Q=new URLSearchParams(location.search);
let lang=window.__opx.lang();const freeze=Q.has('opt')?+Q.get('opt'):null;const SEC=document.getElementById('onprem'),IN=SEC.querySelector('.op-in');
const I={firm:'<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',back:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/>',
 ai:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
 mail:'<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',case:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
 srv:'<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M8 7.5h.01M8 16.5h.01"/>',
 chat:'<path d="M5 5h14v10H9l-4 4z"/>',ck:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>'};
// Klyv layout, scaled 1.25x: columns at fixed x, one hub. x from the inline start (mirrored for RTL).
let W=1120, XL=235, XH=560, XR=885, MOB=false; const D=70, CM=-42, CL=-58;
function node(id,x,y,inner,label,cls='',sub=''){const px=(window.__opx.rtl())?W-x:x;
 return `<div class="nd ${cls}" id="${id}" style="left:${px}px;top:${y}px"><div class="c">${inner}<i class="rp"></i></div>${label===null?'':`<b>${label||'&nbsp;'}</b>`}${sub?`<small>${sub}</small>`:''}</div>`;}
const icn=k=>`<span class="ic"><svg viewBox="0 0 24 24">${I[k]}</svg></span>`, hub=`<img src="assets/onprem/flow-logo-200.webp" srcset="assets/onprem/flow-logo-200.webp 200w, assets/onprem/flow-logo-400.webp 400w" sizes="56px" width="56" height="25" alt="Flow" decoding="async" loading="lazy" decoding="async">`;

const VAR={
 cloud:{he:{net:'הענן המאובטח הייעודי',block:'ממוסך לפני עיבוד',srv:'ענן ייעודי',mss:'מידע ממוסך בלבד',mrs:'חוזרת למשרד',hs:'ממוסך לפני כל עיבוד'},
        en:{net:'Flow’s dedicated secure cloud',block:'Masked before processing',srv:'Secure cloud',mss:'Masked data only',mrs:'Back to your firm',hs:'Masked before any processing'}},
 edge:{he:{net:'המחשב של העובד',block:'המידע לא עוזב את המחשב',srv:'Flow-Edge',mss:'במחשב העובד',mrs:'חוזרת למשרד',hs:'הכול במחשב של העובד'},
       en:{net:'The employee’s own computer',block:'Data never leaves the computer',srv:'Flow-Edge',mss:'On the computer',mrs:'Back to your firm',hs:'All on the employee’s computer'}},
 onprem:{he:{},en:{}}};
window.__opModel=window.__opModel||'onprem';
function KK(){const b=T[lang],v=(VAR[window.__opModel]||{})[lang];return v?Object.assign({},b,v):b}
const V={en:T.en.v,he:T.he.v,es:T.es.v};
const SRV=`<span class="ic"><svg class="sv" viewBox="0 0 40 30"><defs><filter id="csb" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="1"/></filter></defs>`+
 `<ellipse class="cs" cx="20" cy="27.4" rx="15" ry="1.5" filter="url(#csb)"/>`+
 `<rect class="ch" x="1.2" y="3" width="2.6" height="22" rx=".7"/><rect class="ch" x="36.2" y="3" width="2.6" height="22" rx=".7"/>`+
 `<circle class="fl" cx="2.5" cy="5.6" r=".45"/><circle class="fl" cx="2.5" cy="22.4" r=".45"/><circle class="fl" cx="37.5" cy="5.6" r=".45"/><circle class="fl" cx="37.5" cy="22.4" r=".45"/>`+
 [0,1].map(u=>{const y=3+u*11.5;return `<rect class="ch" x="3.8" y="${y}" width="32.4" height="10.5" rx="1.4"/>`+
  [0,1,2,3].map(i=>`<rect x="${11.4+i*4.4}" y="${y+2}" width="3.6" height="6.5" rx=".45"/><path d="M${12.2+i*4.4} ${y+7} h2"/>`).join('')+
  [0,1,2].map(i=>`<path d="M${30.6+i*1.6} ${y+2.4} v5.7"/>`).join('')+
  (u==0?`<circle class="ledh" cx="7.4" cy="${y+5.25}" r="2.6"/><circle class="led" cx="7.4" cy="${y+5.25}" r="1.05"/>`:`<circle cx="7.4" cy="${y+5.25}" r="1.15"/><path d="M7.4 ${y+4.6} v.9"/>`)}).join('')+
 `</svg></span>`;
const AR=()=>(window.__opx.rtl())?'←':'→';
const pair=v=>`<span><span class="r">${v[0]}</span> · <span class="r">${v[1]}</span></span>`;
function stageOnPrem(el){const K=KK(),y=262,yF=MOB?184:y-D,yH=MOB?288:y,yS=MOB?402:y,yB=MOB?506:y+D;
 el.innerHTML=`<svg><defs></defs><path/><path/><path/><path/><path class="dash"/></svg><div class="net"><span>${K.net}</span></div><span class="blk"></span>`+
  node('e-inet',XH,40,icn('globe'),null,'inet')+`<span class="tiny inet-l">${K.inet}</span><span class="tiny blk-l">${K.block}</span>`+
  node('e-firm',XL,yF,icn('firm'),K.firm)+node('e-back',XL,yB,icn('back'),K.reply)+node('e-hub',XH,yH,hub,null,'hub')+node('e-srv',XR,yS,SRV,K.srv,'srv',K.srvSub);
 return MOB?[['e-firm','e-hub',0],['e-hub','e-srv',0],['e-srv','e-hub',0],['e-hub','e-back',0]]:[['e-firm','e-hub',CM],['e-hub','e-srv',CL],['e-srv','e-hub',CL],['e-hub','e-back',CM]];}
function wire(el,spec){const o=el.getBoundingClientRect(),rtl=(window.__opx.rtl()),S=o.width/el.offsetWidth||1,
 C=id=>{const r=el.querySelector('#'+id+' .c').getBoundingClientRect();return{x:((r.left+r.right)/2-o.left)/S,y:((r.top+r.bottom)/2-o.top)/S,r:r.width/2/S}};
 const ps=[...el.querySelectorAll('svg path:not(.dash)')];
 spec.forEach(([a,b,k],i)=>{const A=C(a),B=C(b),s=rtl?-k:k,mx=(A.x+B.x)/2,my=(A.y+B.y)/2,dx=B.x-A.x,dy=B.y-A.y,z=Math.hypot(dx,dy)||1;
  ps[i].setAttribute('d',`M ${A.x},${A.y} Q ${mx-dy/z*s},${my+dx/z*s} ${B.x},${B.y}`)});
 const g=el.querySelector('#e-inet');if(g){const P=C('e-inet'),top=el.querySelector('.net').offsetTop;
  el.querySelector('path.dash').setAttribute('d',`M${P.x} ${P.y+P.r+5} L${P.x} ${top-7}`);
  const bk=el.querySelector('.blk');bk.style.left=P.x+'px';bk.style.top=top+'px';
  el.querySelector('.inet-l').style.cssText=`left:${P.x}px;top:${P.y}px`;el.querySelector('.blk-l').style.cssText=`left:${P.x}px;top:${(P.y+P.r+top)/2}px`;}
 return {paths:ps.slice(0,spec.length),rings:spec.map(([a,b])=>el.querySelector('#'+b+' .rp'))};}
// r34 · phones (<=600px): a purpose-built vertical layout (one card, four rows, one spine). Desktop/tablet never render this.
const CHK='<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.8 6.3l2.1 2.1 4.4-4.7"/></svg>';
function mobileOnPrem(el,K){
 const row=(cls,inner,label,sub)=>`<li class="mvr ${cls}"><span class="mvi"><span class="c">${inner}</span></span><span class="mvt"><b>${label}</b>${sub?`<small>${sub}</small>`:''}</span></li>`;
 el.innerHTML=`<div class="mv${freeze!=null?' mv-still':''}"><div class="mvtop"><span class="mvpill"><svg viewBox="0 0 24 24" aria-hidden="true">${I.globe}</svg>${K.inet}</span></div>`+
  `<div class="mvgap" aria-hidden="false"><i class="mvstub"></i><i class="mvx"></i><span class="mvblk">${K.block}</span></div>`+
  `<div class="mvcard"><span class="mvtag">${K.net}</span><div class="mvbody"><ol class="mvrows">`+
  row('',icn('firm'),K.firm,K.mfs)+row('hub',hub,'<bdi>Flow</bdi>','')+row('srv',SRV,'<bdi>'+K.srv+'</bdi>',K.mss)+row('',icn('back'),K.reply,K.mrs)+
  `</ol><i class="mvline" aria-hidden="true"><i class="mvpulse"></i></i></div>`+
  `<ul class="mvchk">${K.pts.map(([a,b])=>`<li><span class="ck">${CHK}</span><span>${a}</span><span class="sr">. ${b}</span></li>`).join('')}</ul></div></div>`;
 const mv=el.querySelector('.mv');
 requestAnimationFrame(()=>{const l=mv.querySelector('.mvline');if(l)mv.style.setProperty('--mvh',l.offsetHeight+'px')});
 if(freeze==null){const io=window.__opio=new IntersectionObserver(es=>{mv.toggleAttribute('data-run',es[es.length-1].isIntersecting)},{threshold:0});io.observe(mv);}
}
function render(){const K=KK();
 SEC.style.setProperty('--ff',K.font);fit();
 const hd=SEC.querySelector('.head');hd.querySelector('.eyebrow').textContent=K.eye;hd.querySelector('h2').innerHTML=K.h+' <span class="q">'+K.q+'</span>';hd.querySelector('p').textContent=K.sub;
 document.getElementById('op-pts').innerHTML=K.pts.map(([a,b],i)=>`<li><div class="lb"><span class="n">${i+1}</span><strong>${a}</strong></div><p>${b}</p></li>`).join('');
 if(window.__opst)__opst.stop();
 const s2=document.getElementById('op-s2');
 if(MOB){if(window.__opio){window.__opio.disconnect();window.__opio=null}window.__opst=null;window.__opStage=null;(window.OPV?window.OPV(s2,K,lang,{I,SRV,hub,freeze}):mobileOnPrem(s2,K));SEC.dataset.ready=1;return}
 const e=stageOnPrem(s2);
 requestAnimationFrame(()=>{const w2=wire(s2,e),st=Stage(s2,w2.paths,w2.rings,MOB?{seg:50,speed:110}:{seg:Math.round(92*Math.max(.4,W/1120)),speed:Math.round(150*Math.max(.4,W/1120))});window.__opst=st;
  // shots/video: ?t= pulse time (entrance done), ?g= global time (entrance included). Live: entrance once when the card scrolls into view.
  let G=null;if(freeze!=null)G=INTRO+freeze;else if(Q.has('opg'))G=+Q.get('opg');
  window.__opStage={intro:INTRO,total:st.total,setT(v){G=v;st.draw(v)}};
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(G!=null)st.draw(G);
  else if(reduce){st.draw(INTRO+st.total-.7);} // static: entrance skipped, no comet
  // live: entrance once when the card is 35% visible, then the pulse loop; the loop sleeps whenever the card is off-screen
  if(G==null&&!reduce){let clk=introOn?INTRO:0,last=0,raf=0,vis=false;
   const f=now=>{raf=0;if(window.__opst!==st||!vis||G!=null)return;clk+=last?Math.min(.1,(now-last)/1000):0;last=now;st.draw(clk);raf=requestAnimationFrame(f)};
   const go=()=>{if(!raf){last=0;raf=requestAnimationFrame(f)}};st.draw(clk);
   if(window.__opio)__opio.disconnect();
   const io=window.__opio=new IntersectionObserver(es=>{const e=es[es.length-1];if(!introOn){if(e.intersectionRatio>=.35){introOn=true;vis=true;go()}return}vis=e.isIntersecting;if(vis)go()},{threshold:[0,.35]});io.observe(s2);}
  SEC.dataset.ready=1});}
let introOn=false;
// r34: below 1120px the composition reflows (adaptive width, positions as fractions); no transform scale
function fit(){const cs=getComputedStyle(SEC),avail=SEC.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);W=Math.round(Math.max(320,Math.min(1120,avail)));XL=Math.round(W*235/1120);XH=Math.round(W*560/1120);XR=Math.round(W*885/1120);MOB=matchMedia('(max-width:600px)').matches;if(MOB)XL=XH=XR=Math.round(W/2);SEC.classList.toggle('op-v',MOB);SEC.style.setProperty('--opw',W+'px');IN.style.transform='';IN.style.marginBottom=''}
window.__opRender=function(){lang=window.__opx.lang();SEC.lang=lang;SEC.dir=window.__opx.rtl()?'rtl':'ltr';render()};window.__opRender();if(document.fonts&&document.fonts.status!=='loaded')document.fonts.ready.then(render);
let rw=innerWidth;addEventListener('resize',()=>{if(innerWidth!==rw){rw=innerWidth;clearTimeout(fit._t);fit._t=setTimeout(render,200)}},{passive:true});
})();
