/* r15 phone hero (<760): one big readable card at a time. The Flow sheet is in front; the system cards wait behind it as thin top edges.
   Do It flies the sheet out and brings the first system card forward, then the next ones; Undo brings the sheet back.
   Built only while (max-width:759px) matches; desktop DOM is untouched. Reduced motion: instant, no pulse. Cards move only when the visitor asks (Do It, הבא, or a tap on the next card's edge). */
(function(){
  var root=document.getElementById('r14s'); if(!root) return;
  var mq=matchMedia('(max-width:759px)');
  var rm=function(){ return root.classList.contains('rm')||matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var L='../assets/r15/lg/';
  var CHEV='<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CK='<svg class="ck" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l2.9 2.9 6.1-6.6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function logo(f){ return '<span class="lg"><img alt="" src="'+L+f+'.webp" width="28" height="28" decoding="async"></span>'; }
  function head(f,name,sub,chip){ return '<div class="hd">'+logo(f)+'<b>'+name+'</b>'+(sub?'<span class="hs">'+sub+'</span>':'')+(chip?'<span class="chip ok">'+chip+'</span>':'')+'</div>'; }
  var PT=(function(){ var e=root.querySelector('.chain .lg.pt'); return e?e.innerHTML:''; })();
  /* the system cards, per moment (synthetic sample data, same values as the desktop stage) */
  var A='נוסף על ידי <span dir="ltr">Flow · 19:02</span>';
  function attr(t){ return '<p class="attr">'+t+'</p>'; }
  function f(l,v,w){ return '<div'+(w?' class="w"':'')+'><p class="fl">'+l+'</p><p class="fv">'+v+'</p></div>'; }
  function N(x){ return '<span class="num">'+x+'</span>'; }
  function week(days,on){ /* RTL: Sunday on the right */
    return '<ol class="wkd">'+days.map(function(d){ return '<li'+(d[1]===on?' class="on"':'')+'><span>'+d[0]+'</span><b>'+N(d[1])+'</b></li>'; }).join('')+'</ol>'; }
  function law(sub,chip,ttl,fields,src,at){ return head('lawyal','Lawyal',sub,chip)+'<p class="ttl">'+ttl+'</p><div class="fld">'+fields+'</div>'+(src?'<div class="src"><p class="fl">איפה Flow מצאה את זה</p><p class="sv">'+src+'</p></div>':'')+attr(at||A); }
  function mail(chip,rows,body,att,at){ return head('outlook','Outlook','טיוטה',chip)+'<div class="ml">'+rows.map(function(r){ return '<div><span>'+r[0]+'</span><b>'+r[1]+'</b></div>'; }).join('')+
      (att?'<p class="att"><span class="pdf">PDF</span><b>'+att[0]+'</b><span>'+att[1]+'</span></p>':'')+'<p class="bd">'+body+'</p></div>'+attr(at||A); }
  var R={
    '1':[
      {say:'נוסף ליומן ב־Outlook', html:head('outlook','Outlook','יומן','נוסף ליומן')+
        week([['א׳','22'],['ב׳','23'],['ג׳','24'],['ד׳','25'],['ה׳','26'],['ו׳','27'],['ש׳','28']],'25')+
        '<p class="ttl">יום ד׳, '+N('25.11.2026')+'</p><ol class="ag">'+
        '<li><time>08:30</time><div class="ev"><b>פגישת צוות</b><span>30 דק׳</span></div></li>'+
        '<li><time>09:00</time><div class="ev on"><b>תגובה לבית המשפט</b><span>תזכורת · עוד 14 יום</span></div></li>'+
        '<li><time>14:00</time><div class="ev"><b>שיחת סטטוס</b><span>30 דק׳</span></div></li></ol>'+attr(A)},
      {say:'נוסף דיווח זמן ב־Lawyal', html:law('דיווח זמן','ממתין לאישור','עיון בהחלטה ופתיחת מועד',
        f('לקוח / תיק','אורנים בע״מ · '+N('12345-11-26'),1)+f('עורך דין','עו״ד מיכל לוי')+f('תאריך',N('11.11.2026'))+f('משך',N('0.3')+' שעות'),
        'החלטה מבית המשפט · '+N('11.11')+' '+N('09:12'))},
      {say:'טיוטה מוכנה ב־Outlook', html:mail('לא נשלח',[['מאת','עו״ד מיכל לוי'],['אל','אורנים בע״מ'],['נושא','החלטה חדשה בתיק']],
        'שלום, התקבלה החלטה בתיק. תגובה עד '+N('25.11.2026')+'<br>בברכה, עו״ד מיכל לוי',['<bdi dir="ltr">החלטה.pdf</bdi>','184 KB'])}
    ],
    '2':[
      {say:'2 רשומות זמן נוספו ב־Lawyal, אורנים בע״מ', html:law('דיווח זמן','ממתין לאישור','אורנים בע״מ · 2 רשומות',
        '<div class="w"><ol class="ent"><li><b>'+N('0.5')+' ש׳</b><span>שיחה עם הלקוח · '+N('8.11')+'</span></li><li><b>'+N('1.0')+' ש׳</b><span>תכתובת מול ב״כ הצד השני · '+N('10.11')+'</span></li></ol></div>'+
        f('עורך דין','עו״ד מיכל לוי')+f('סה״כ',N('1.5')+' שעות'),
        'היומן: שיחה עם אורנים בע״מ · המייל: תיאום מועד הדיון','נוסף על ידי <span dir="ltr">Flow · 19:04</span>')},
      {say:'רשומת זמן נוספה ב־Lawyal, גלעד נכסים', html:law('דיווח זמן','ממתין לאישור','גלעד נכסים בע״מ',
        f('תיאור','הכנה לדיון',1)+f('עורך דין','עו״ד מיכל לוי')+f('תאריך',N('10.11.2026'))+f('משך',N('2.0')+' שעות'),
        'היומן: הכנה לדיון, גלעד נכסים · '+N('14:00')+' · שעתיים','נוסף על ידי <span dir="ltr">Flow · 19:04</span>')},
      {say:'רשומת זמן נוספה ב־Lawyal, שחר טכנולוגיות', html:law('דיווח זמן','ממתין לאישור','שחר טכנולוגיות',
        f('תיאור','עדכון ותיאום עם הלקוח',1)+f('עורך דין','עו״ד מיכל לוי')+f('תאריך',N('12.11.2026'))+f('משך',N('1.0')+' שעות')+f('סה״כ השבוע',N('4.5')+' שעות'),
        'המייל: עדכון סטטוס והמשך טיפול · '+N('3')+' הודעות','נוסף על ידי <span dir="ltr">Flow · 19:04</span>')}
    ],
    '3':[
      {say:'טיוטה לעו״ד המייצג מוכנה ב־Outlook', html:mail('לא נשלח',[['מאת','עו״ד מיכל לוי'],['אל','עו״ד ירון שגיא'],['נושא','הצהרה על נכונות הפרטים, הזית 8 רחובות']],
        'שלום ירון, ההצהרה מולאה בפורטל: גוש '+N('3742')+' חלקה '+N('118')+', פטור <bdi dir="ltr">49ב&lrm;(2)</bdi>. נגיש אחרי אישורך<br>בברכה, מיכל',['טופס <bdi dir="ltr">7005.pdf</bdi>','162 KB'],'נוסף על ידי <span dir="ltr">Flow · 09:06</span>')},
      {say:'ההצהרה מולאה בפורטל, נשלחת רק אחרי אישור', html:'<div class="hd"><span class="lg pt">'+PT+'</span><b>פורטל מיסוי מקרקעין</b><span class="chip">הדמיה</span></div>'+
        '<p class="ttl">הצהרה מקוונת · טופס '+N('7000')+'</p><ol class="steps5">'+['סוג','צדדים','זכות','רוכש','סיום'].map(function(t,i){ return '<li'+(i===4?' class="on"':'')+'><i>'+(i+1)+'</i><span>'+t+'</span></li>'; }).join('')+'</ol><div class="fld">'+f('גוש',N('3742'))+f('חלקה',N('118'))+f('סעיף פטור','<bdi dir="ltr">49ב&lrm;(2)</bdi> · דירת מגורים מזכה',1)+f('מספר שומה',N('20261052216'))+f('תאריך מכירה',N('2.11.2026'))+'</div>'+
        '<div class="pbar"><span class="snd" aria-disabled="true">שליחה</span><p>השליחה רק אחרי אישור העו״ד המייצג</p></div>'+attr('מולא על ידי <span dir="ltr">Flow · 09:06</span>')},
      {say:'השורה עודכנה בטבלת השליטה ב־Excel', html:head('excel','Excel','<bdi dir="ltr">טבלת שליטה.xlsx</bdi>','נשמר')+
        '<div class="xl"><p class="fx"><b dir="ltr">B4</b><i>fx</i><span>ממתין לאישור</span></p><table><thead><tr><th></th><th>לקוח</th><th>סטטוס דיווח</th></tr></thead><tbody>'+
        [['2','יעל כרמי','דווח'],['3','אבי שושן','דווח'],['4','רותם גל','ממתין לאישור'],['5','שי לוין','דווח'],['6','נטע רז','לא דווח']].map(function(r){ return '<tr'+(r[0]==='4'?' class="on"':'')+'><th>'+r[0]+'</th><td>'+r[1]+'</td><td>'+r[2]+'</td></tr>'; }).join('')+
        '</tbody></table></div>'+attr('נוסף על ידי <span dir="ltr">Flow · 09:06</span>')}
    ]
  };
  function txt(e){ return e?e.innerHTML.trim():''; }
  var SUB={'1':'מאת בית המשפט · תגובה בתוך <em>14 יום</em>','2':N('8–12.11')+' · <em>4 פעולות בלי דיווח זמן</em>','3':'מאת עו״ד ירון שגיא · דיווח עד <em>'+N('2.12.2026')+'</em>'};
  function sheet(s){
    var c=s.querySelector('.chain'); if(!c) return '';
    var m=c.querySelector('.mail'), att=m.querySelector('.att-i'), sub=m.querySelector('.mail-s').cloneNode(true);
    if(sub.querySelector('.att-i')) sub.removeChild(sub.querySelector('.att-i'));
    var k=[].map.call(c.querySelectorAll('.k'),function(x){ return x.textContent.trim(); });
    var h='<div class="sec"><p class="k"><i>1</i>'+k[0]+'<span class="chip">דוגמה</span></p><div class="ar">'+logo('outlook')+'<div><p class="t">'+sub.innerHTML.trim()+'</p><p class="s">'+(SUB[s.dataset.m]||[].map.call(m.querySelector('.mail-m').childNodes,function(n){ return n.textContent.trim(); }).filter(Boolean).join(' ')+' · '+txt(m.querySelector('.mail-b')))+'</p></div></div></div>';
    h+='<div class="sec"><p class="k"><i>2</i>'+k[1].replace('מה Flow עשתה','Flow בדקה')+'</p><ol class="st">'+[].map.call(c.querySelectorAll('.steps .step'),function(li){
      var lg=li.querySelector('.lg'); return '<li>'+(lg?lg.outerHTML:'')+'<span>'+li.querySelector('p').innerHTML+'</span>'+CK+'</li>'; }).join('')+'</ol></div>';
    h+='<div class="sec"><p class="k"><i>3</i>'+k[2]+'</p><ol class="pr">'+[].map.call(c.querySelectorAll('.offer .card'),function(a){
      var lg=a.querySelector('.lg'); return '<li>'+(lg?lg.outerHTML:'')+'<div><p class="t">'+txt(a.querySelector('.card-t'))+'</p><p class="s">'+txt(a.querySelector('.card-s'))+'</p></div></li>'; }).join('')+'</ol></div>';
    h+='<div class="go"><button type="button" class="doit"><span class="shell"></span><span class="dring"></span><span class="shine"></span><span class="dlbl">Do It</span></button><p class="cue">לחצו על <span dir="ltr">Do It</span> וצפו איך זה קורה</p></div>';
    return h;
  }
  /* stack geometry: three physical layers */
  var P={0:'translate3d(0,0,0) scale(1)',1:'translate3d(0,-16px,0) scale(.94)',2:'translate3d(0,-30px,0) scale(.88)',3:'translate3d(0,-30px,0) scale(.88)',gone:'translate3d(0,-14px,0) scale(.9)'};
  var O={0:1,1:1,2:1,3:0,gone:0}, DIM={0:0,1:.025,2:.05,3:.05,gone:0}, SH={0:1,1:0,2:0,3:0,gone:0};
  /* spring easing (iOS-like: ~0.5s response, damping 0.9, a 0.15% settle, no visible bounce), sampled into CSS linear() */
  function spring(resp,z){ var w=2*Math.PI/resp, wd=w*Math.sqrt(1-z*z), T=Math.min(1.2,7/(z*w)), n=60, pts=[];
    for(var i=0;i<=n;i++){ var t=T*i/n; pts.push((1-Math.exp(-z*w*t)*(Math.cos(wd*t)+z*w/wd*Math.sin(wd*t))).toFixed(4)); }
    pts[n]='1'; return {e:'linear('+pts.join(',')+')',d:Math.round(T*1000)}; }
  var LIN=window.CSS&&CSS.supports&&CSS.supports('transition-timing-function','linear(0, 1)');
  var SP=LIN?spring(.5,.9):{e:'cubic-bezier(.32,.72,0,1)',d:600}, SP2=LIN?spring(.44,.92):{e:'cubic-bezier(.32,.72,0,1)',d:520};
  var decks=[];
  function build(s){
    var data=R[s.dataset.m], inn=s.querySelector('.in'); if(!data||!inn||inn.querySelector('.stk')) return;
    /* the last card's pill moves the STAGE to the next process (names = the process switcher's visible names); earlier cards' «הבא» = next card */
    var SL=[].slice.call(root.querySelectorAll('.r14 .slide')), NM=[].map.call(root.querySelectorAll('.r14 .dots .dot'),function(b){ return b.textContent.trim(); });
    var np=(SL.indexOf(s)+1)%Math.max(1,NM.length);
    var d=document.createElement('div'); d.className='stk'; d.setAttribute('role','group'); d.setAttribute('aria-label','הדגמה של Flow');
    var cards=[], sh=document.createElement('section'); sh.className='sc sh'; sh.innerHTML=sheet(s); cards.push(sh);
    data.forEach(function(r,i){ var c=document.createElement('section'); c.className='sc sy';
      c.innerHTML=r.html+'<div class="ft"><span class="pp">'+data.map(function(_,j){ return '<i'+(j===i?' class="on"':'')+'></i>'; }).join('')+'</span><span class="n">'+(i+1)+' מתוך '+data.length+'</span>'+
        '<button type="button" class="ud" dir="ltr">Undo</button>'+(i<data.length-1?'<button type="button" class="nx">הבא'+CHEV+'</button>':(NM.length>1?'<button type="button" class="nx np" data-p="'+np+'" aria-label="לתהליך הבא: '+NM[np]+'">'+NM[np]+CHEV+'</button>':''))+'</div>';
      var bd=document.createElement('div'); bd.className='bdy';
      [].slice.call(c.children).forEach(function(x){ if(!x.matches('.hd,.ft')) bd.appendChild(x); });
      c.insertBefore(bd,c.querySelector('.ft'));
      cards.push(c); });
    var live=document.createElement('p'); live.className='vh'; live.setAttribute('aria-live','polite');
    var cs=document.createElement('i'); cs.className='cs'; cs.setAttribute('aria-hidden','true'); d.appendChild(cs);
    cards.slice().reverse().forEach(function(c){ d.appendChild(c); }); d.appendChild(live);
    inn.appendChild(d); inn.classList.add('has-stk');
    var st={s:s,d:d,cards:cards,data:data,done:false,i:0,live:live};
    var db=sh.querySelector('.doit');
    db.addEventListener('pointerdown',function(){ if(rm()) return; db._p=db.animate([{transform:'scale(1)'},{transform:'scale(.96)'}],{duration:110,easing:'ease-out',fill:'forwards'}); });
    var rel=function(){ if(db._p){ db._p.cancel(); db._p=null; db.animate([{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:260,easing:SP2.e}); } };
    db.addEventListener('pointerup',rel); db.addEventListener('pointercancel',rel); db.addEventListener('pointerleave',rel);
    db.addEventListener('click',function(e){ e.stopPropagation(); d.classList.add('used'); doit(st); });
    cards.slice(1).forEach(function(c){
      c.querySelector('.ud').addEventListener('click',function(e){ e.stopPropagation(); undo(st); });
      var nx=c.querySelector('.nx'); if(nx) nx.addEventListener('click',function(e){ e.stopPropagation();
        if(nx.classList.contains('np')){ var t=root.querySelector('.r14 .dot[data-i="'+nx.dataset.p+'"]'); if(t) t.click(); }   /* same go(k) as the switcher */
        else go(st,(st.i+1)%data.length); });
      c.addEventListener('click',function(){ if(st.done&&c.dataset.pos==='1') go(st,(st.i+1)%data.length); });   /* the next card's edge is tappable */
    });
    decks.push(st);
    var want=root.dataset.state==='done'||new URLSearchParams(location.search).get('state')==='done';
    if(want){ st.done=true; } place(st);
  }
  function posOf(st,k){ /* k: 0 = sheet, 1.. = system cards */
    var n=st.data.length;
    if(!st.done){ return k===0?0:(k<=2?k:3); }
    if(k===0) return 'gone';
    var p=((k-1-st.i)%n+n)%n; return p>2?3:p;
  }
  function ANI(el,kf,o){ o.fill=o.fill||'backwards'; return el.animate(kf,o); }
  function rect(el){ return el.getBoundingClientRect(); }
  function place(st){ /* final state, set at once; animations then run from the old state with fill:backwards, so no frame shows a jump */
    return st.cards.map(function(c,k){ var from=c.dataset.pos, to=String(posOf(st,k));
      c.dataset.pos=to; c.style.transform=P[to]; c.style.opacity=O[to]; c.style.zIndex=to==='gone'?5:(10-(+to||0));
      c.setAttribute('aria-hidden',to==='0'?'false':'true'); c.classList.toggle('tap',st.done&&to==='1');
      return {c:c,from:from,to:to}; }); }
  function lay(st){ place(st); }
  function stop(st){ /* a new tap while cards move: jump the running motion to its end, then start the new one */
    clearTimeout(st.t); st.d.getAnimations({subtree:true}).forEach(function(a){ if(window.CSSAnimation&&a instanceof CSSAnimation) return; try{ a.finish(); }catch(x){ a.cancel(); } });
    [].forEach.call(st.d.querySelectorAll('.gh,.xf'),function(g){ g.remove(); }); }
  function busy(st,ms){ st.d.classList.add('busy'); clearTimeout(st.t); st.t=setTimeout(function(){ st.d.classList.remove('busy'); },ms); }
  function move(c,from,to,delay,sp){ var o={duration:sp.d,easing:sp.e,delay:delay};
    ANI(c,[{transform:P[from],opacity:O[from]},{transform:P[to],opacity:O[to]}],o);
    if(DIM[from]!==DIM[to]) ANI(c,[{opacity:DIM[from]},{opacity:DIM[to]}],{duration:sp.d,easing:sp.e,delay:delay,pseudoElement:'::before'});
    if(SH[from]!==SH[to]) ANI(c,[{opacity:SH[from]},{opacity:SH[to]}],{duration:sp.d,easing:sp.e,delay:delay,pseudoElement:'::after'}); }
  function crossfade(st,old){ /* reduced motion: a plain 200ms crossfade, nothing moves */
    var f=st.cards.filter(function(c){ return c.dataset.pos==='0'; })[0];
    if(old){ var x=old.cloneNode(true); x.classList.add('xf'); x.dataset.pos='0'; x.style.transform=P[0]; x.style.opacity=1; x.style.zIndex=30; x.setAttribute('aria-hidden','true'); x.removeAttribute('id');
      st.d.appendChild(x); var a=x.animate([{opacity:1},{opacity:0}],{duration:200,fill:'forwards'}); a.onfinish=function(){ x.remove(); }; }
    if(f) f.animate([{opacity:0},{opacity:1}],{duration:200}); }
  function front(st){ return st.cards.filter(function(c){ return c.dataset.pos==='0'; })[0]; }
  function say(st,t){ st.live.textContent=t; }
  /* r16 v5: after a button press nothing travels sideways or upward. A card that changes hands fades IN PLACE (content first, under its solid
     white plate, then the blank plate); cards that only swap peek slots snap while covered. The one remaining motion is «הבא»: the next card,
     already peeking, comes forward on one axis (down + scale). */
  function hold(c,from,ms){   /* keep a card painted exactly where it was (no travel) for ms, then it snaps to its new slot */
    ANI(c,[{transform:P[from],opacity:O[from],visibility:'visible'},{transform:P[from],opacity:O[from],visibility:'visible'}],{duration:ms});
    ANI(c,[{opacity:DIM[from]},{opacity:DIM[from]}],{duration:ms,pseudoElement:'::before'});
    ANI(c,[{opacity:SH[from]},{opacity:SH[from]}],{duration:ms,pseudoElement:'::after'}); }
  function fadeIn(c,delay,ms){ [].forEach.call(c.children,function(x){   /* opacity only, no translate */
    ANI(x,[{opacity:0,visibility:'visible'},{opacity:1,visibility:'visible'}],{duration:ms,easing:'ease-out',delay:delay}); }); }
  function doit(st){
    stop(st); var sh=st.cards[0], old=front(st);
    st.done=true; st.i=0; var ch=place(st);
    if(rm()){ crossfade(st,old); }
    else{
      var tgt=st.cards[1], T=460;
      busy(st,T+80);
      /* the stack snaps to its new slots at once (no promote motion): the new front card is under the solid Flow card, and the peeks look the same before and after */
      fadeIn(tgt,0,140);   /* the system card is complete under the solid Flow plate before that plate starts to fade */
      /* the Flow card stays exactly in place: content out first, then the blank plate (opacity only, no transform) */
      ANI(sh,[{zIndex:30,transform:P[0],visibility:'visible'},{zIndex:30,transform:P[0],visibility:'visible'}],{duration:T});
      [].forEach.call(sh.children,function(x){ ANI(x,[{opacity:1,visibility:'visible',easing:'ease-out'},{opacity:0,visibility:'visible',offset:.3},{opacity:0,visibility:'visible'}],{duration:T}); });
      ANI(sh,[{opacity:1},{opacity:1,offset:.36,easing:'ease-in-out'},{opacity:0}],{duration:T});
      ANI(sh,[{opacity:1},{opacity:1,offset:.36},{opacity:0}],{duration:T,pseudoElement:'::after'});
    }
    say(st,'בוצע · '+st.data[0].say);
    var f=st.cards[1].querySelector('.nx')||st.cards[1].querySelector('.ud'); if(f&&document.activeElement&&st.d.contains(document.activeElement)) f.focus({preventScroll:true});
  }
  function go(st,i){   /* «הבא»: the front card fades in place (content first under its white plate, then the plate), never shrinking or rising.
      The next card, already peeking, comes forward on one axis (down + scale) under it; the leaving card reappears in the back peek only once invisible. */
    stop(st); var old=front(st); st.i=i; var ch=place(st);
    if(rm()){ crossfade(st,old); }
    else{
      var T=460;   /* the leaving plate stays solid until the next card has nearly landed under it (no second bottom edge through it) */
      busy(st,T+200);
      ch.forEach(function(x){ if(x.from===x.to) return;
        if(x.from==='0'){
          ANI(x.c,[{opacity:0},{opacity:O[x.to]}],{duration:180,delay:T,easing:'ease-out'});   /* back peek edge comes in after, no travel */
          ANI(x.c,[{zIndex:30,transform:P[0],visibility:'visible'},{zIndex:30,transform:P[0],visibility:'visible'}],{duration:T});
          ANI(x.c,[{opacity:1},{opacity:1,offset:.5,easing:'ease-in'},{opacity:0}],{duration:T});
          ANI(x.c,[{opacity:1},{opacity:1,offset:.5},{opacity:0}],{duration:T,pseudoElement:'::after'});
          ANI(x.c,[{opacity:0},{opacity:0}],{duration:T,pseudoElement:'::before'});
          [].forEach.call(x.c.children,function(y){ ANI(y,[{opacity:1,visibility:'visible',easing:'ease-in-out'},{opacity:0,visibility:'visible',offset:.48},{opacity:0,visibility:'visible'}],{duration:T}); });   /* content thins to white just as the plate starts to go: no blank hold */
        }
        else move(x.c,x.from,x.to,0,SP2);
        /* the new front card's content is simply on (pos 0) under the solid leaving plate; it shows only as that plate thins, after the old content is gone */
      });
    }
    say(st,st.data[i].say);
  }
  function undo(st){ /* the reverse of Do It, in place: the blank Flow plate fades in over the system card, the stack snaps under it, then the Flow content comes in */
    stop(st); var sh=st.cards[0], old=front(st);
    st.done=false; st.i=0; var ch=place(st);
    if(rm()){ crossfade(st,old); }
    else{
      var T=460, C=170;   /* C: the Flow plate is solid from here */
      busy(st,T+80);
      /* every system card stays exactly where it was until the Flow card is complete on top; only then do the slots change (no visible step: the front is covered and the peeks look the same) */
      ch.forEach(function(x,k){ if(k===0||x.from===x.to) return; hold(x.c,x.from,T);
        if(x.from==='0'){ ANI(x.c,[{zIndex:12},{zIndex:12}],{duration:T});
          [].forEach.call(x.c.children,function(y){ ANI(y,[{opacity:1,visibility:'visible'},{opacity:0,visibility:'visible'}],{duration:C-20,easing:'ease-in-out'}); }); } });
      ANI(sh,[{zIndex:30,transform:P[0],visibility:'visible'},{zIndex:30,transform:P[0],visibility:'visible'}],{duration:T});
      ANI(sh,[{opacity:0,easing:'ease-in-out'},{opacity:1,offset:C/T},{opacity:1}],{duration:T});
      ANI(sh,[{opacity:0},{opacity:1,offset:C/T},{opacity:1}],{duration:T,pseudoElement:'::after'});
      /* running from the first frame (held at 0 until the plate is solid), so the browser paints the Flow content while the plate comes in instead of when it should show */
      [].forEach.call(sh.children,function(x){ ANI(x,[{opacity:0,visibility:'visible'},{opacity:0,visibility:'visible',offset:C/T,easing:'ease-out'},{opacity:1,visibility:'visible'}],{duration:T}); });
    }
    say(st,'בוטל');
    var b=st.cards[0].querySelector('.doit'); if(b&&document.activeElement&&st.d.contains(document.activeElement)) b.focus({preventScroll:true}); }
  function teardown(){ decks.forEach(function(st){ st.d.parentNode.classList.remove('has-stk'); st.d.remove(); }); decks=[]; }
  function mode(){ if(mq.matches) [].forEach.call(root.querySelectorAll('.r14 .slide'),build); else teardown(); }
  mq.addEventListener('change',mode); mode();
})();
