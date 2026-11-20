/* r15 legal page: copy of the homepage r9 file; only Hebrew strings and asset paths changed. v11: Photos-style paging. Cloud | Edge | On-Prem are three pages of one horizontal track inside the same grey panel (static panel = shadow + dot grid; an inner window clips the sliding pages).
   Drag = 1:1 follow (transform), release = velocity-aware snap, rubber band at the ends, switcher pill follows live. See the pager + pointer code at the end of the first block and the second block.
*//* Home-only: per-option diagrams for the Do-It switcher (Cloud / Edge). On-Prem = the homepage hub, untouched.
   Same visual language as the hub (home-onprem.js OPV): .opf box, hairlines, travelling pulse, halo + live ring, card stage.
   Copy is only what the switcher already says (ft.d1/d1s, ft.d2/d2s) plus the hub's own strings. No token chips. */
(function(){
var host=document.getElementById('op-s2'),sec=document.getElementById('onprem');if(!host||!sec)return;var DGV={off:false};if('IntersectionObserver' in window)new IntersectionObserver(function(es){DGV.off=!es[es.length-1].isIntersecting;if(!DGV.off)Object.keys(L).forEach(function(k){L[k].wake&&L[k].wake()})},{rootMargin:'200px 0px'}).observe(sec);
var NS='http://www.w3.org/2000/svg',html=document.documentElement;
var FI={
 mail:'<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3.8 8l8.2 5.8L20.2 8"/>',
 doc:'<path d="M7 3.5h6.8L18.5 8v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M13.5 3.7V8h4.8M8.5 13h7M8.5 16.5h5"/>',
 file:'<path d="M3.5 8a2.5 2.5 0 0 1 2.5-2.5h3.6l2 2.4H18A2.5 2.5 0 0 1 20.5 10v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17z"/>',
 reply:'<path d="M9.8 6 4.5 11.3l5.3 5.3"/><path d="M4.8 11.3h9.2a5.5 5.5 0 0 1 5.5 5.5v1.7"/>',
 cal:'<rect x="4" y="5.5" width="16" height="14.5" rx="3.2"/><path d="M4 10.2h16M8.5 3.5v3.6M15.5 3.5v3.6"/>',
 team:'<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5"/><circle cx="17" cy="9.8" r="2.2"/><path d="M16 14.2c2.6-.2 4.2 1.4 4.6 4.3"/>',
 mask:'<path d="M3 12s3.2-5.5 9-5.5S21 12 21 12s-3.2 5.5-9 5.5S3 12 3 12z"/><circle cx="12" cy="12" r="2.6"/><path d="M4.5 19.5l15-15"/>',
 task:'<rect x="4" y="4" width="16" height="16" rx="4.2"/><path d="M8.5 12.3l2.5 2.5 4.6-5"/>',
 person:'<circle cx="12" cy="9" r="3.4"/><path d="M5.5 19.5c.6-3.6 3.1-5.6 6.5-5.6s5.9 2 6.5 5.6"/>',
 arch:'<rect x="3.5" y="4.5" width="17" height="5" rx="1.8"/><path d="M5 9.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.5M10 13.5h4"/>',
 cloud:'<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.6 4.7 4.7 0 0 1 17.5 18z"/><path d="M5 20.5l14-17"/>'};
var C={
 he:{ask:'הבקשה מגיעה',back:'התשובה חוזרת',stay:'נשאר במחשב',
  src:['מייל נכנס','קובץ מצורף','בקשה מהצוות'],dst:['טיוטת תשובה','טבלת מעקב','יומן'],
  cloud:['ענן Flow · ממוסך',''],gate:'ממוסך לפני העיבוד',
  edge:['Flow-Edge','על המחשב הזה'],dx:['מסמך','משימה','אנשי קשר','ארכיון'],pc:'המחשב של העובד',ext:'ענן חיצוני',never:'אף פעם'},
 en:{ask:'The ask arrives',back:'The answer comes back',stay:'Stays on the computer',
  src:['Client email','Document','Team request'],dst:['Draft reply','Client file','Calendar'],
  cloud:['Flow cloud · masked',''],gate:'Masked before processing',
  edge:['Flow-Edge','on this computer'],dx:['Document','Task','Contacts','Archive'],pc:'The employee’s computer',ext:'External cloud',never:'Never'}};
var RING={l:['/assets/onprem/flow-ring-lumf-live-l.webp','/assets/onprem/flow-ring-lumf-still-l.webp'],d:['/assets/onprem/flow-ring-lumf-live-d.webp','/assets/onprem/flow-ring-lumf-still-d.webp']};
var rm=function(){return matchMedia('(prefers-reduced-motion:reduce)').matches||html.classList.contains('rm')};
var ico=function(k){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+FI[k]+'</svg>'};
var ly=function(cls,k,t){return '<span class="opf-ly '+cls+'"><span class="opf-t">'+ico(k)+'</span><span class="opf-x"><b>'+t+'</b></span></span>'};
var card=function(c,i,k,t){return '<div class="opf-cd '+c+'" data-i="'+i+'"><i class="opf-on"></i>'+ly('off',k,t)+ly('on',k,t)+'</div>'};
var SK=['mail','doc','team'],DK=['reply','file','cal'];
var ez=function(x){return x<=0?0:x>=1?1:x*x*(3-2*x)},f1=function(n){return n.toFixed(1)};
var L={},cur=0,lang='en';
/* r10 · phone: "Flow cloud · masked" keeps its exact text; on the phone only it is split into two spans so it can stack (desktop DOM untouched) */
var hsp=function(t){var k=t.indexOf(' · ');return k<0?t:'<span class="ph-a">'+t.slice(0,k)+'</span><span class="ph-dot"> · </span><span class="ph-b">'+t.slice(k+3)+'</span>'};
var PH=function(){return matchMedia('(max-width:760px)').matches};
function lg(){var u=html.dataset.ui;return C[u]?u:'en'}

function make(kind){
 var T=C[lang],isC=kind==='cloud',hub=isC?T.cloud:T.edge;
 var lay=document.createElement('div');lay.className='dg-layer dg-'+kind;lay.setAttribute('data-k',kind);
 var lab2=isC?T.back:T.stay;
 var extra=isC?
  '<span class="dg-gate"><i class="dg-gb">'+ico('mask')+'</i><em>'+T.gate+'</em></span>':
  '<span class="dg-bound"><em>'+T.pc+'</em></span><span class="dg-stub"></span><span class="dg-ext"><i>'+ico('cloud')+'</i><b>'+T.ext+'</b><u>'+T.never+'</u></span>';
 lay.innerHTML='<div class="opf" role="img" aria-label="'+(isC?T.cloud[0]:hub[0]+' · '+hub[1])+'"><div class="opf-box" aria-hidden="true">'+
  '<svg class="opf-svg"><g class="gf"></g><path class="bl l1"/><path class="bl l2"/><circle class="tw" style="opacity:0"/><circle class="td"/></svg>'+
  extra+'<span class="opf-lab a">'+T.ask+'</span><span class="opf-lab b">'+lab2+'</span>'+
  '<div class="opf-halo"><i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i></div><img class="opf-live" alt="" width="24" height="24" loading="lazy" decoding="async">'+
  T.src.map(function(s,i){return card('s',i,SK[i],s)}).join('')+T.dst.map(function(s,i){return card('d',i,DK[i],s)}).join('')+
  '<div class="opf-hub"><b>'+hub[0]+'</b>'+(hub[1]?'<small>'+hub[1]+'</small>':'')+'</div></div></div>';
 return lay;
}
function inst(kind){
 var isC=kind==='cloud',lay=make(kind),root=lay.querySelector('.opf'),box=lay.querySelector('.opf-box'),svg=lay.querySelector('.opf-svg'),gf=svg.querySelector('.gf'),
  l1=svg.querySelector('.l1'),l2=svg.querySelector('.l2'),td=svg.querySelector('.td'),tw=svg.querySelector('.tw'),
  halo=box.querySelector('.opf-halo'),live=box.querySelector('.opf-live'),hubT=box.querySelector('.opf-hub'),
  gate=box.querySelector('.dg-gate'),bound=box.querySelector('.dg-bound'),stub=box.querySelector('.dg-stub'),ext=box.querySelector('.dg-ext'),
  CS=[].slice.call(box.querySelectorAll('.opf-cd.s')),CD=[].slice.call(box.querySelectorAll('.opf-cd.d'));
 var XD=null,G=null,lens=[0,0],pair=0,gl=0,t0=0,raf=0,running=false,vis=false,I={kind:kind,lay:lay,root:root,box:box},TB=null,park=0;function smp(l,L){var n=Math.max(2,Math.min(160,Math.ceil(L/4)+1)),a=new Float32Array(n*2);for(var i=0;i<n;i++){var p=l.getPointAtLength(L*i/(n-1));a[2*i]=p.x;a[2*i+1]=p.y}return a}function PT(k,s){if(!TB)TB=[smp(l1,lens[0]),smp(l2,lens[1])];var a=TB[k],L=lens[k],n=a.length/2;if(n<2)return {x:0,y:0};var f=Math.max(0,Math.min(1,L?s/L:0))*(n-1),i=Math.min(n-2,Math.floor(f)),r=f-i;return {x:a[2*i]+(a[2*i+2]-a[2*i])*r,y:a[2*i+1]+(a[2*i+3]-a[2*i+1])*r}}
 var th=function(){return html.getAttribute('data-theme')==='dark'?'d':'l'};
 function ring(){var t=RING[th()];live.setAttribute('src',rm()?t[1]:t[0])}
 I.ring=ring;ring();
 var labs=[].slice.call(box.querySelectorAll('.opf-lab'));
 /* r10 · phone (max-width:760px): vertical composition in a 446-wide unit space, same panel height as the hub page; the desktop branch below is untouched */
 function layoutPhone(){var rb=RB(),HB=rb&&rb.offsetWidth?446*rb.getBoundingClientRect().height/rb.getBoundingClientRect().width:446,dy=(HB-446)/2;box.style.setProperty('aspect-ratio','446/'+HB.toFixed(3),'important');
  var W=box.offsetWidth,H=box.offsetHeight;if(!W)return;var u=W/446;root.style.setProperty('--u',u.toFixed(5));root.classList.add('ph');
  /* r11 · Cloud and Edge share the On-Prem phone grid: the same ask row (42), the same seven icon tiles (330), the same bottom caption line (412).
     Only the hub moves for Cloud (230, room for the mask gate). Edge: the dashed computer border wraps the grid, its name sits on the bottom edge, and the external-cloud line is a quiet caption under it. */
  var Y=isC?{la:26,st:42,gy:152,hy:230,tt:330,lb:412}:{la:26,st:42,hy:210,tt:330,bt:8,bb:396,ext:424};
  if(!XD){var T0=C[lang]||C.en,DX=['doc','task','person','arch'];XD=T0.dx.map(function(s,i){var d=document.createElement('div');d.innerHTML=card('d dgx',3+i,DX[i],s);return d.firstChild});XD.forEach(function(e){box.insertBefore(e,hubT)})}
  var TL=CD.concat(XD),tw=50*u,tg=(446-28-7*50)/6*u;
  root.style.setProperty('--pla',(Y.la+dy).toFixed(2));root.style.setProperty('--plb',((Y.lb||Y.ext)+dy).toFixed(2));
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  var rtl=getComputedStyle(root).direction==='rtl',hx=W/2,R=48*u,cw=133.3*u,gp=9*u,ch=72*u;
  var cx=function(i){var c=14*u+cw/2+i*(cw+gp);return rtl?W-c:c};
  var tx=function(i){var c=14*u+tw/2+i*(tw+tg);return rtl?W-c:c};
  var st=(Y.st+dy)*u,sb=st+ch,dt=(Y.tt+dy)*u,hy=(Y.hy+dy)*u,ht=hy-R,hb=hy+R,gy=isC?(Y.gy+dy)*u:0;
  CS.forEach(function(c,i){c.style.cssText='left:'+(cx(i)-cw/2)+'px;top:'+st+'px;width:'+cw+'px;height:'+ch+'px'});
  TL.forEach(function(c,i){c.style.cssText='left:'+(tx(i)-tw/2)+'px;top:'+dt+'px;width:'+tw+'px;height:'+tw+'px'});
  var PS=function(i){var x=cx(i);if(isC){var k=(gy-sb)*.62;return 'M'+f1(x)+' '+f1(sb)+'C'+f1(x)+' '+f1(sb+k)+' '+f1(hx)+' '+f1(gy-k)+' '+f1(hx)+' '+f1(gy)+'L'+f1(hx)+' '+f1(ht)}
   var k2=(ht-sb)*.62;return 'M'+f1(x)+' '+f1(sb)+'C'+f1(x)+' '+f1(sb+k2)+' '+f1(hx)+' '+f1(ht-k2)+' '+f1(hx)+' '+f1(ht)};
  var PD=function(i){var x=tx(i),k=(dt-hb)*.62;return 'M'+f1(hx)+' '+f1(hb)+'C'+f1(hx)+' '+f1(hb+k)+' '+f1(x)+' '+f1(dt-k)+' '+f1(x)+' '+f1(dt)};
  var p1=[0,1,2].map(PS),p2=[0,1,2,3,4,5,6].map(PD);
  gf.innerHTML=p1.concat(p2).map(function(d){return '<path class="f" d="'+d+'"/>'}).join('');
  halo.style.cssText='left:'+hx+'px;top:'+hy+'px';live.style.cssText='left:'+hx+'px;top:'+hy+'px';
  hubT.style.cssText=rtl?'right:'+(W-hx+72*u)+'px;top:'+hy+'px':'left:'+(hx+72*u)+'px;top:'+hy+'px';
  if(gate){gate.style.cssText='left:'+hx+'px;top:'+gy+'px';I.gx=null;I.gy=gy}
  if(bound){bound.style.cssText='left:'+(10*u)+'px;right:'+(10*u)+'px;top:'+((Y.bt+dy)*u)+'px;height:'+((Y.bb-Y.bt)*u)+'px';
   var ey=(Y.ext+dy)*u;bound.style.left=bound.style.right=(6*u)+'px';stub.style.cssText='display:none';ext.style.cssText='left:'+hx+'px;top:'+ey+'px'}
  var hb0=hubT.querySelector('b');if(hb0&&!hb0.querySelector('.ph-a')&&hb0.textContent.indexOf(' · ')>0){hb0.setAttribute('data-t',hb0.textContent);hb0.innerHTML=hsp(hb0.textContent)}
  G={p1:p1,p2:p2,hy:hy,hx:hx};I.cur(pair)}
 I.layout=function(){if(PH())return layoutPhone();if(root.classList.contains('ph')){root.classList.remove('ph');root.style.removeProperty('--pla');root.style.removeProperty('--plb');I.gy=null;if(XD){XD.forEach(function(e){e.remove()});XD=null}var hb1=hubT.querySelector('b[data-t]');if(hb1){hb1.textContent=hb1.getAttribute('data-t');hb1.removeAttribute('data-t')}}
  var rb=RB(),HB=rb&&rb.offsetWidth?1024*rb.getBoundingClientRect().height/rb.getBoundingClientRect().width:530,dy=(HB-(isC?400:490))/2;box.style.setProperty('aspect-ratio','1024/'+HB.toFixed(3),'important');var W=box.offsetWidth,H=box.offsetHeight;if(!W)return;var u=W/1024;root.style.setProperty('--u',u.toFixed(5));
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  var rtl=getComputedStyle(root).direction==='rtl',s=rtl?1:-1,hx=W/2,hy=((isC?232.5:237.5)+dy)*u,R=54*u,cw=233*u,sh=61.5*u,dh=49.2*u;
  var sL=rtl?W-49*u-cw:49*u,dL=rtl?49.5*u:W-49.5*u-cw,sIn=rtl?sL:sL+cw,dIn=rtl?dL+cw:dL;
  var ys=(isC?[160,232.5,305]:[165,237.5,310]).map(function(v){return (v+dy)*u});
  CS.forEach(function(c,i){c.style.cssText='left:'+sL+'px;top:'+(ys[i]-sh/2)+'px;width:'+cw+'px;height:'+sh+'px'});
  CD.forEach(function(c,i){c.style.cssText='left:'+dL+'px;top:'+(ys[i]-dh/2)+'px;width:'+cw+'px;height:'+dh+'px'});
  var he=hx+s*R,de=hx-s*R;
  var PS=function(y){var k=Math.abs(sIn-he)*.5;return 'M'+f1(sIn)+' '+f1(y)+'C'+f1(sIn-s*k)+' '+f1(y)+' '+f1(he+s*k)+' '+f1(hy)+' '+f1(he)+' '+f1(hy)};
  var PD=function(y){var k=Math.abs(dIn-de)*.5;return 'M'+f1(de)+' '+f1(hy)+'C'+f1(de-s*k)+' '+f1(hy)+' '+f1(dIn+s*k)+' '+f1(y)+' '+f1(dIn)+' '+f1(y)};
  var p1=ys.map(PS),p2=ys.map(PD);
  gf.innerHTML=p1.concat(p2).map(function(d){return '<path class="f" d="'+d+'"/>'}).join('');
  halo.style.cssText='left:'+hx+'px;top:'+hy+'px';live.style.cssText='left:'+hx+'px;top:'+hy+'px';
  hubT.style.cssText='left:'+hx+'px;top:'+((isC?313:310.5)+dy)*u+'px';
  if(gate){var gx=(sIn+he)/2;gate.style.cssText='left:'+gx+'px;top:'+hy+'px';I.gx=gx}
  if(bound){bound.style.cssText='left:'+(22*u)+'px;right:'+(22*u)+'px;top:'+((78+dy)*u)+'px;height:'+(316*u)+'px';
   stub.style.cssText='left:'+hx+'px;top:'+((394+dy)*u)+'px;height:'+(32*u)+'px';ext.style.cssText='left:'+hx+'px;top:'+((448+dy)*u)+'px'}
  G={p1:p1,p2:p2,hy:hy,hx:hx};I.cur(pair)};
 I.cur=function(i){pair=i;if(!G)return;l1.setAttribute('d',G.p1[i]);l2.setAttribute('d',G.p2[i]);lens[0]=l1.getTotalLength();lens[1]=l2.getTotalLength();/*perf1112*/TB=null;
  if(isC&&I.gx!=null){var lo=0,hi=lens[0],sg=Math.sign(l1.getPointAtLength(0).x-I.gx);for(var q=0;q<26;q++){var m=(lo+hi)/2;if(Math.sign(l1.getPointAtLength(m).x-I.gx)===sg)lo=m;else hi=m}gl=(lo+hi)/2}
  else if(isC&&I.gy!=null){var lo2=0,hi2=lens[0];for(var q2=0;q2<26;q2++){var m2=(lo2+hi2)/2;if(l1.getPointAtLength(m2).y<I.gy)lo2=m2;else hi2=m2}gl=(lo2+hi2)/2}
  CS.forEach(function(c,k){c.classList.toggle('act',k===i)});CD.forEach(function(c,k){c.classList.toggle('act',k===i)})};
 var CYC=4.5;
 function draw(t){if(!G)return;
  var out=1-ez((t-3.75)/.65),a=ez((t-.3)/1.4),b=ez((t-1.55)/1.3);
  l1.style.strokeDasharray=lens[0];l1.style.strokeDashoffset=lens[0]*(1-a);l1.style.opacity=a>0?out:0;
  l2.style.strokeDasharray=lens[1];l2.style.strokeDashoffset=lens[1]*(1-b);l2.style.opacity=b>0?out:0;
  var u=ez((t-.55)/2.3),on=t>.5&&t<3.1,Lt=lens[0]+lens[1];
  if(isC){ /* request -> stops and fades at the dashed masking gate -> masked (hollow) dot continues through the hub to the answer */
   var pos=0,op=0,mk=false;
   if(t>.5&&t<1.6){pos=gl*ez((t-.5)/1.05);op=Math.min(1,(t-.5)/.25,1-ez((t-1.3)/.28))}
   else if(t>=1.85&&t<3.3){pos=gl+(Lt-gl)*ez((t-1.85)/1.3);mk=true;op=Math.min(1,(t-1.85)/.22,(3.3-t)/.3)}
   if(op<=0){td.style.opacity=0}else{var pc=pos<=lens[0]?PT(0,pos):PT(1,pos-lens[0]),tr='translate('+pc.x+'px,'+pc.y+'px)';td.style.transform=tr;td.style.opacity=op;td.classList.toggle('mk',mk)}
   tw.style.opacity=0;
   gate.style.setProperty('--lit',(ez((t-.95)/.5)*(1-ez((t-1.9)/.5))).toFixed(3))}
  else{ /* edge: dot rides the same wires, always inside the dashed employee-computer boundary */
   if(!on){td.style.opacity=0;tw.style.opacity=0}else{var p=u*Lt,pa=p<=lens[0]?PT(0,p):PT(1,p-lens[0]),f=Math.min(1,(t-.5)/.25,(3.1-t)/.3),tr='translate('+pa.x+'px,'+pa.y+'px)';
    td.style.transform=tr;td.style.opacity=f;tw.style.opacity=0}}
  if(bound)bound.style.setProperty('--lit',(ez((t-.2)/.8)*out).toFixed(3))}
 I.still=function(){if(!G)return;I.cur(0);[l1,l2].forEach(function(l){l.style.strokeDasharray='none';l.style.strokeDashoffset=0;l.style.opacity=1});
  var q=l2.getPointAtLength(lens[1]*.2);td.style.transform=tw.style.transform='translate('+q.x+'px,'+q.y+'px)';td.style.opacity=1;tw.style.opacity=0;td.classList.toggle('mk',isC);
  if(gate)gate.style.setProperty('--lit',1);if(bound)bound.style.setProperty('--lit',1)};
 function frame(now){if(!running)return;if(DGV.off){park=now;raf=0;return}var t=(now-t0)/1000,n=Math.floor(t/CYC),tc=t-n*CYC;if(n!==I.n){I.n=n;I.cur(n%3)}draw(tc);raf=requestAnimationFrame(frame)}
 I.play=function(){if(rm()){I.layout();I.still();return}if(running)return;running=true;I.n=-1;t0=performance.now();raf=requestAnimationFrame(frame)};
 I.stop=function(){running=false;park=0;cancelAnimationFrame(raf)};I.wake=function(){if(running&&park&&!raf){t0+=performance.now()-park;park=0;raf=requestAnimationFrame(frame)}};
 return I;
}
function RO(){return host.querySelector(':scope > .opf:not(.dg-pan)')}
function RB(){var o=RO();return o&&o.querySelector('.opf-box')}
var pan=null,win=null,seg=document.querySelector('.dep2 .d2-seg'),ind=seg&&seg.querySelector('i'),btns=seg?[].slice.call(seg.querySelectorAll('button')):[],
 pos=0,anim=0,dragging=false,KINDS=['cloud','edge','onprem'];
function ensure(){
 if(!pan||pan.parentNode!==host){pan=document.createElement('div');pan.className='opf dg-pan';pan.setAttribute('aria-hidden','true');pan.innerHTML='<div class="opf-box"></div>';host.insertBefore(pan,host.firstChild)}
 if(!win||win.parentNode!==host){win=document.createElement('div');win.className='dg-win';host.appendChild(win)}
}
function build(){
 Object.keys(L).forEach(function(k){L[k].stop();L[k].lay.remove()});L={};lang=lg();ensure();
 ['cloud','edge'].forEach(function(k){var I=inst(k);I.wasVis=false;win.appendChild(I.lay);L[k]=I});
 place();apply(true);settleUI(Math.round(pos));
}
/* the panel (shadow + dot grid) and the clip window are static, same rect as the real hub card: same left/width/height, so the card height never changes */
function place(){
 var ro=RO(),real=RB();if(!ro||!real)return;ensure();
 var x=0,y=0,e=real;while(e&&e!==host){x+=e.offsetLeft;y+=e.offsetTop;e=e.offsetParent}
 /* r11 legal · alignment: the card around the hub is scaled (scale(var(--dk)), .9 from 900px). The panel and the clip window sit INSIDE that card, so they take the hub box's layout size (offsetWidth/Height); only the switcher, which lives outside the card, takes the on-screen width. Before this the Cloud/Edge panel was scaled twice (.81) and sat 49px off centre. */
 var r=real.getBoundingClientRect(),Wv=r.width,W=real.offsetWidth||Wv,H=real.offsetHeight||r.height,u=parseFloat(getComputedStyle(ro).getPropertyValue('--u'))||W/1024;
 var sg=document.querySelector('.dep2 .d2-seg');if(sg)sg.style.setProperty('--pw',Wv.toFixed(2)+'px');document.documentElement.style.setProperty('--dg-w',Wv.toFixed(2)+'px');
 pan.style.cssText='left:'+x+'px;top:'+y+'px;width:'+W+'px;--u:'+u;pan.firstChild.style.height=H+'px';
 win.style.cssText='left:'+x+'px;top:'+y+'px;width:'+W+'px;height:'+H+'px;border-radius:'+(26*u)+'px';
 Object.keys(L).forEach(function(k){L[k].layout()});
 apply(true);
}
/* ---- pager: pos = fractional page (0 Cloud, 1 Edge, 2 On-Prem); the track is LTR, so the on-screen order matches the switcher ---- */
function apply(force){
 var rb=RB(),els=[L.cloud&&L.cloud.lay,L.edge&&L.edge.lay,rb];
 for(var k=0;k<3;k++){var el=els[k];if(!el)continue;var d=k-pos,hid=Math.abs(d)>=1;
  el.style.transform='translate3d('+(d*100).toFixed(3)+'%,0,0)';
  if(el._h!==hid){el._h=hid;el.style.visibility=hid?'hidden':'visible'}
  var I=k<2&&L[KINDS[k]];if(I&&(force||I.wasVis===hid)){I.wasVis=!hid;I.lay.classList.toggle('on',!hid);if(hid)I.stop();else I.play()}}
 if(ind)ind.style.transform='translateX(calc('+Math.min(2,Math.max(0,pos)).toFixed(4)+'*(100% + var(--g))))';
}
function bez(x){var a=.25,b=.8,c=.25,d=1,t=x,i,X,D;for(i=0;i<8;i++){X=3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*c+t*t*t-x;D=3*(1-t)*(1-t)*a+6*(1-t)*t*(c-a)+3*t*t*(1-c);if(Math.abs(X)<1e-5||!D)break;t-=X/D}
 t=Math.min(1,Math.max(0,t));return 3*(1-t)*(1-t)*t*b+3*(1-t)*t*t*d+t*t*t}
function settleUI(t){
 host.setAttribute('data-dg',KINDS[t]);
 var ro=RO();if(ro)ro.setAttribute('aria-hidden',t===2?'false':'true');
 Object.keys(L).forEach(function(k){L[k].lay.setAttribute('aria-hidden',KINDS[t]===k?'false':'true')});
}
function settle(t){
 pos=t;apply();if(ind)ind.style.transform='';if(seg)seg.style.setProperty('--i',t);settleUI(t);
 if(seg&&(+seg.dataset.i||0)!==t&&btns[t])btns[t].click(); /* the pill's own click: aria-checked, tabindex, caption */
}
function animTo(t,dur){
 cancelAnimationFrame(anim);anim=0;
 if(rm()||!dur||pos===t){settle(t);return}
 var from=pos,t0=performance.now();
 anim=requestAnimationFrame(function f(now){var k=Math.min(1,Math.max(0,(now-t0)/dur));pos=from+(t-from)*bez(k);apply();if(k<1)anim=requestAnimationFrame(f);else{anim=0;settle(t)}});
}
function show(i,first){if(dragging)return;cur=i;var d=Math.abs(i-pos);animTo(i,first?0:Math.round(300+50*Math.min(1,d)+40*Math.max(0,Math.min(d,2)-1)))}
/* pointer API for the second block */
window.__dgPg={pos:function(){return pos},width:function(){return win?win.offsetWidth:306},
 grab:function(){var m=!!anim;cancelAnimationFrame(anim);anim=0;dragging=true;host.classList.add('dg-drag');return m},
 set:function(p){pos=p;apply()},
 release:function(t,dur){dragging=false;host.classList.remove('dg-drag');cur=t;animTo(t,dur)}};
window.__dgShow=show;
new MutationObserver(function(){if(!host.querySelector('.dg-layer')&&RB()){var d=document.querySelector('.dep2 .d2-seg');pos=d?+d.dataset.i||0:0;build();show(pos,true)}}).observe(host,{childList:true});
var raf0;function re(){cancelAnimationFrame(raf0);raf0=requestAnimationFrame(place)}
function init(){
 if('ResizeObserver' in window)new ResizeObserver(re).observe(host);
 if(document.fonts&&document.fonts.ready)document.fonts.ready.then(re);
 new MutationObserver(function(){var d=document.querySelector('.dep2 .d2-seg');cur=d?+d.dataset.i||0:0;pos=cur;build();show(cur,true)}).observe(html,{attributes:true,attributeFilter:['data-ui']});
 new MutationObserver(function(){Object.keys(L).forEach(function(k){L[k].ring()})}).observe(html,{attributes:true,attributeFilter:['data-theme']});
 var seg=document.querySelector('.dep2 .d2-seg');if(seg)new MutationObserver(function(){var i=+seg.dataset.i||0;if(i!==cur)show(i)}).observe(seg,{attributes:true,attributeFilter:['data-i']});
 cur=seg?+seg.dataset.i||0:0;pos=cur;build();show(cur,true)}
/* hub renders async (IntersectionObserver / fonts): wait until its box exists */
var tries=0;(function wait(){if(RB())init();else if(tries++<80)setTimeout(wait,50)})();
})();

/* r15 legal page: copy of the homepage r10/r11 file (phone restage + Cloud/Edge in the On-Prem look); only Hebrew strings, asset paths and the place() alignment fix differ. v11: Photos-style drag on the diagram panel (touch, pen and mouse via pointer events).
   - intent lock on the first ~9px: horizontal -> we follow the finger 1:1 (the track is translated, page k at (k-pos)*100%); vertical -> we step aside and the page scrolls natively (touch-action:pan-y)
   - release: slow = nearest page; fast flick (>= .3px/ms over the last ~90ms, >=10px) = next/previous page; ~300-350ms cubic-bezier(.25,.8,.25,1)
   - first/last page: rubber band (iOS-style resistance), no wrap
   - the switcher pill moves with the same fractional position; caption/aria-checked are committed on settle through the pill's own click */
(function(){
var host=document.getElementById('op-s2');if(!host)return;
var st=null,sup=0,LOCK=9,FLICK=.3;
function clampP(p,W){if(p<0)return -((1-1/((-p*W)*.55/W+1))*W)/W;if(p>2)return 2+((1-1/(((p-2)*W)*.55/W+1))*W)/W;return p}
host.addEventListener('pointerdown',function(e){
 var pg=window.__dgPg;if(!pg||!e.isPrimary||(e.pointerType==='mouse'&&e.button!==0))return;
 st={id:e.pointerId,xs:e.clientX,ts:e.timeStamp,x0:e.clientX,y0:e.clientY,lock:0,pos0:pg.pos(),W:pg.width()||306,s:[{x:e.clientX,t:e.timeStamp}],mouse:e.pointerType==='mouse'};
 if(pg.pos()%1){ /* caught mid-flight: hold it under the finger */
  pg.grab();st.lock=1;st.pos0=pg.pos();try{host.setPointerCapture(e.pointerId)}catch(_){}}
},{passive:true});
host.addEventListener('pointermove',function(e){
 if(!st||e.pointerId!==st.id)return;var pg=window.__dgPg,dx=e.clientX-st.x0,dy=e.clientY-st.y0;
 if(st.lock===0){
  if(Math.hypot(dx,dy)<LOCK)return;
  if(Math.abs(dx)>Math.abs(dy)){st.lock=1;st.x0=e.clientX;st.y0=e.clientY;st.pos0=pg.pos();st.s=[{x:e.clientX,t:e.timeStamp}];pg.grab();try{host.setPointerCapture(e.pointerId)}catch(_){};return}
  st=null;return} /* vertical: the page scrolls, we do nothing */
 if(st.lock!==1)return;
 if(e.cancelable)e.preventDefault();
 st.s.push({x:e.clientX,t:e.timeStamp});while(st.s.length>2&&e.timeStamp-st.s[0].t>110)st.s.shift();
 pg.set(clampP(st.pos0-dx/st.W,st.W));
},{passive:false});
function end(e,cancel){
 if(!st||e.pointerId!==st.id)return;var s=st;st=null;if(s.lock!==1)return;var pg=window.__dgPg,p=pg.pos(),a=s.s[0],b=s.s[s.s.length-1],v=0;
 if(!cancel&&b.t>a.t&&e.timeStamp-b.t<80)v=(b.x-a.x)/Math.max(8,b.t-a.t); /* finger px/ms, + = right */
 var vp=-v,trav=Math.abs(e.clientX-s.xs),t,quick=e.timeStamp-s.ts<280&&trav>=24;if(quick&&!v)vp=e.clientX<s.xs?1:-1;
 if(!cancel&&(Math.abs(vp)>=FLICK&&trav>=10||quick))t=vp>0?Math.floor(p)+1:Math.ceil(p)-1;else t=Math.round(p);
 t=Math.max(0,Math.min(2,t));
 var d=Math.abs(t-p);if(s.mouse&&trav>4){sup=1;setTimeout(function(){sup=0},0)}
 pg.release(t,Math.round(300+50*Math.min(1,d)));
}
host.addEventListener('pointerup',function(e){end(e,false)},{passive:true});
host.addEventListener('pointercancel',function(e){end(e,true)},{passive:true});
host.addEventListener('lostpointercapture',function(e){if(e.target===host)end(e,true)},{passive:true});
host.addEventListener('click',function(e){if(sup){e.stopPropagation();e.preventDefault()}},true);
host.addEventListener('dragstart',function(e){e.preventDefault()});
})();
