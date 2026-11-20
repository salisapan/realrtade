/* Solutions hub options A-D (local mockups 13.11). One phone that swaps content, or Flow cards (C) */
(function(){var r=document.documentElement,LS={en:1,he:1,de:1,fr:1,es:1};
function lang(){return LS[r.dataset.ui]?r.dataset.ui:'en'}function theme(){return r.dataset.theme==='dark'?'dark':'light'}
var cur='legal';
function src(p){return 'assets/hub/'+p+'-'+lang()+'-'+theme()+'.webp'}
function show(p,force){var ph=document.querySelector('.op-phone');if(!ph)return;if(p===cur&&!force)return;cur=p;
 var on=ph.querySelector('.op-ph.on'),off=ph.querySelector('.op-ph:not(.on)'),s=src(p);
 if(on.getAttribute('src')===s)return;
 off.onload=function(){off.onload=null;off.classList.add('on');on.classList.remove('on')};off.setAttribute('src',s);
 [].forEach.call(document.querySelectorAll('[data-p][role=tab]'),function(e){var a=e.dataset.p===p;e.classList.toggle('on',a);e.setAttribute('aria-selected',a)});thumb();}
function thumb(){var s=document.querySelector('.op-seg'),b=s&&s.querySelector('.op-sb.on'),t=s&&s.querySelector('.op-thumb');if(!b)return;
 t.style.width=b.offsetWidth+'px';t.style.transform='translateX('+b.offsetLeft+'px)'}
function preload(){['legal','insurance','cpas'].forEach(function(p){var i=new Image();i.src=src(p)})}
[].forEach.call(document.querySelectorAll('[data-p][role=tab]'),function(e,i,all){
 e.addEventListener('click',function(){show(e.dataset.p)});
 if(e.classList.contains('op-sel')||e.classList.contains('op-li')){
  e.addEventListener('mouseenter',function(){if(matchMedia('(hover:hover)').matches)show(e.dataset.p)});e.addEventListener('focus',function(){show(e.dataset.p)});}
 e.addEventListener('keydown',function(k){var d=k.key==='ArrowRight'||k.key==='ArrowDown'?1:k.key==='ArrowLeft'||k.key==='ArrowUp'?-1:0;if(!d)return;
  if(r.dir==='rtl'&&(k.key==='ArrowRight'||k.key==='ArrowLeft'))d=-d;k.preventDefault();var n=all[(i+d+all.length)%all.length];n.focus();show(n.dataset.p)});});
var T={he:{k:'דוגמה',c:'Flow בדקה',p:'Flow מציעה'},en:{k:'Example',c:'Flow checked',p:'Flow proposes'},de:{k:'Beispiel',c:'Flow hat geprüft',p:'Flow schlägt vor'},fr:{k:'Exemple',c:'Flow a vérifié',p:'Flow propose'},es:{k:'Ejemplo',c:'Flow revisó',p:'Flow propone'}};
var C={legal:{t:{en:'New court decision',he:'החלטה חדשה בתיק',de:'Neuer Beschluss',fr:'Nouvelle ordonnance',es:'Nueva resolución'},
 c:{en:['Read the decision','Checked the matter in iManage','Checked the calendar'],he:['קראה את ההחלטה','בדקה את התיק ב־iManage','בדקה את היומן'],de:['Beschluss gelesen','Akte in iManage geprüft','Kalender geprüft'],fr:['Ordonnance lue','Dossier vérifié dans iManage','Agenda vérifié'],es:['Leyó la resolución','Revisó el asunto en iManage','Revisó la agenda']},
 p:{en:['Add the deadline to the calendar','Time entry','Client draft'],he:['הוספת המועד ליומן','דיווח שעות','טיוטה ללקוח'],de:['Frist in den Kalender','Zeiterfassung','Entwurf an Mandanten'],fr:['Délai dans l’agenda','Saisie des temps','Brouillon pour le client'],es:['Plazo en la agenda','Registro de horas','Borrador para el cliente']}},
insurance:{t:{en:'Renewal request by email',he:'בקשת חידוש במייל',de:'Verlängerungsanfrage per E-Mail',fr:'Demande de renouvellement par e-mail',es:'Solicitud de renovación por correo'},
 c:{en:['Read the request','Checked the policy','Checked missing documents'],he:['קראה את הבקשה','בדקה את הפוליסה','בדקה מסמכים חסרים'],de:['Anfrage gelesen','Police geprüft','Fehlende Unterlagen geprüft'],fr:['Demande lue','Contrat vérifié','Pièces manquantes vérifiées'],es:['Leyó la solicitud','Revisó la póliza','Revisó documentos pendientes']},
 p:{en:['Renewal quote','Update in the carrier system','Reply to the client'],he:['הצעת חידוש','עדכון במערכת חברת הביטוח','מענה ללקוח במייל'],de:['Verlängerungsangebot','Update im Versicherersystem','Antwort an den Kunden'],fr:['Offre de renouvellement','Mise à jour chez l’assureur','Réponse au client'],es:['Oferta de renovación','Actualización en la aseguradora','Respuesta al cliente']}},
cpas:{t:{en:'Bank statement arrived',he:'דף בנק חדש התקבל',de:'Kontoauszug eingegangen',fr:'Relevé bancaire reçu',es:'Extracto bancario recibido'},
 c:{en:['Matched 42 transactions','Checked the ledger','Flagged 2 open items'],he:['התאימה 42 תנועות','בדקה את הנהלת החשבונות','סימנה 2 פריטים פתוחים'],de:['42 Buchungen abgeglichen','Hauptbuch geprüft','2 offene Posten markiert'],fr:['42 opérations rapprochées','Grand livre vérifié','2 points ouverts signalés'],es:['Concilió 42 movimientos','Revisó el libro mayor','Marcó 2 partidas abiertas']},
 p:{en:['Post the entries','VAT report draft','Question to the client'],he:['רישום התנועות','טיוטת דוח מע״מ','שאלה ללקוח'],de:['Buchungen erfassen','Entwurf USt-Voranmeldung','Rückfrage an den Mandanten'],fr:['Passer les écritures','Brouillon de déclaration de TVA','Question au client'],es:['Registrar los asientos','Borrador del IVA','Pregunta al cliente']}}};
function esc(s){return s.replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function chips(){var l=lang(),t=T[l];[].forEach.call(document.querySelectorAll('.fc[data-fc]'),function(el){var d=C[el.dataset.fc];
 el.setAttribute('dir',l==='he'?'rtl':'ltr');
 el.innerHTML='<div class="fc-h"><span class="fc-k">'+t.k+'</span><b class="fc-t">'+esc(d.t[l])+'</b></div>'+
 '<p class="fc-s">'+t.c+'</p><ul class="fc-c">'+d.c[l].map(function(x){return '<li><i aria-hidden="true"></i>'+esc(x)+'</li>'}).join('')+'</ul>'+
 '<p class="fc-s">'+t.p+'</p><ol class="fc-p">'+d.p[l].map(function(x,i){return '<li><span>'+(i+1)+'</span>'+esc(x)+'</li>'}).join('')+'</ol>'+
 '<span class="fc-do" translate="no">Do It</span>'})}
function all(){chips();var ph=document.querySelector('.op-phone .op-ph.on');if(ph&&ph.getAttribute('src')!==src(cur)){ph.setAttribute('src',src(cur))}preload();thumb()}
all();new MutationObserver(all).observe(r,{attributes:true,attributeFilter:['data-ui','data-theme']});addEventListener('resize',thumb);
if(document.fonts)document.fonts.ready.then(thumb);
})();
