// Real-shape Graph mock, ported from David's p144-realshape probe.
// Each case writes through the shipped create flow, then Undoes.
// Run: node test/realshape-0956-corpus.cjs
// The bodyonly draft "body word" case changes ">x<" rather than "<div>x<".
// That mode first wraps the div with a font-family style. The style is not
// an edit. The selector has to land on the word after that wrap.
const fs=require('fs'),http=require('http'),vm=require('vm'),path=require('path');
const B=process.env.B||path.join(__dirname,'..');
const bg=fs.readFileSync(B+'/src/background.js','utf8');
function ex(name){const re=new RegExp('^(async function|function|const|let) '+name+'\\b','m');const m=re.exec(bg);if(!m)return null;const i=m.index;
 if(/^(const|let)/.test(m[1])){let d=0,k=i;for(;k<bg.length;k++){const c=bg[k];if('{(['.includes(c))d++;else if('})]'.includes(c))d--;else if(c===';'&&d===0)break;}return bg.slice(i,k+1);}
 let j=bg.indexOf('{',bg.indexOf(')',i)),d=0;for(let k=j;k<bg.length;k++){if(bg[k]=='{')d++;else if(bg[k]=='}'&&--d==0)return bg.slice(i,k+1);}}
const STUBS=`var publicClientId=x=>x,WEB_OAUTH_CLIENT_ID='',OAUTH_PUBLIC={},HYBRID={},GOOGLE_WEB_AUTH_STORAGE_KEY='k';function googleConnectErrorMessage(){};function googleImplicitAuthUrl(){};function googleOAuthScopesFrom(){return []};function googleRedirectUriForExtension(){return ''};function parseGoogleImplicitRedirect(){};function shouldFallbackFromGetAuthToken(){};function webTokenUsable(){};
var OUTLOOK_GRAPH=__G;async function outlookAccessToken(){return 'tok'}
async function outlookSession(){return {ok:true,token:{grantedScopes:'Calendars.ReadWrite Tasks.ReadWrite Mail.ReadWrite'}}}
async function outlookDraftMap(){return {map:{},st:{}}}async function outlookSaveDraftMap(){}async function outlookPreferredFrom(){return null}
function draftBodyText(){return 'Hi Dana,\\nSure, Thursday works.\\n\\nSali'}function outlookAssertNotSend(){}function localTimeZone(){return 'Asia/Jerusalem'}`;
const store0={};const chrome={runtime:{id:'glance',getURL:x=>x,onMessage:{addListener(){}},lastError:null},storage:{local:{get:async()=>({}),set:async()=>{}},session:{get:async()=>({}),set:async()=>{}}},identity:{getRedirectURL:()=>''},alarms:{create(){},onAlarm:{addListener(){}}}};
const sb={chrome,crypto:globalThis.crypto,TextEncoder,btoa,atob,AbortController,fetch,setTimeout,clearTimeout,URL,Promise,JSON,Date,encodeURIComponent,__G:''};sb.globalThis=sb;vm.createContext(sb);
for(const f of ['core/draft-reply.js','core/outlook-config.js','core/outlook-calendar.js','core/proof-of-close.js','core/commitment-title.js','src/native-edit.js']){try{vm.runInContext(fs.readFileSync(B+'/'+f,'utf8').replace(/^export .*$/gm,''),sb,{filename:f});}catch(e){console.log('load',f,e.message)}}
const want=['outlookMeetingWrite','outlookTaskWrite','outlookTaskUndo','outlookCalendarWrite','outlookCalendarUndo','outlookDraftWrite','outlookDraftUndo','outlookFetch'];const have=new Set(['outlookAccessToken','outlookSession','outlookDraftMap','outlookSaveDraftMap','outlookPreferredFrom','draftBodyText','outlookAssertNotSend','localTimeZone','OUTLOOK_GRAPH']);
const TOP=new Set();bg.replace(/^(?:async function|function|const|let) (\w+)/gm,(m,n)=>TOP.add(n));
let code=STUBS;const add=n=>{if(have.has(n))return;const s=ex(n);if(!s)return;have.add(n);code+='\n'+s;(s.match(/\b[A-Za-z_$][\w$]*\b/g)||[]).forEach(t=>{if(TOP.has(t)&&!have.has(t))add(t)});};want.forEach(add);
vm.runInContext(code+'\n;globalThis.__f={'+want.join(',')+'};',sb);let fns=sb.__f;
async function call(fn,...a){try{return await fns[fn](...a)}catch(e){return {ok:false,threw:e.message}}}

let lastGet={};let mode='touch',store={},log=[],seq=0,fail=null;const t0=Date.parse('2026-10-15T01:00:00Z');
const ts=ms=>new Date(t0+ms).toISOString().replace(/\.(\d{3})Z$/,(m,a)=>'.'+a+String(4567+ms%1000).padStart(4,'0')+'Z');
const norm=s=>String(s).replace(/\r?\n/g,'\r\n').replace(/[ \t]+$/gm,'');
const html=s=>'<html><head>\r\n<meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><div>'+String(s).split('\n').map(l=>l||'<br>').join('</div><div>')+'</div></body></html>';
function touch(o){if(mode==='stable'&&o.__touched)return;o.__touched=true;if(mode==='bodyonly'){if(o.body&&o.body.contentType==='html')o.body.content=o.body.content.replace('<div>','<div style="font-family:Aptos">');return;}seq++;o['@odata.etag']='W/"e'+seq+'"';o.lastModifiedDateTime=ts(seq*137);if(o.changeKey)o.changeKey='CK'+seq;}
const pub=o=>{const c={};for(const k in o)if(k.slice(0,2)!=='__')c[k]=o[k];return c};
const srv=http.createServer((q,s)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{const u=new URL(q.url,'http://x');log.push(q.method+' '+u.pathname.replace('/v1.0',''));const j=(st,o)=>{s.writeHead(st,{'content-type':'application/json; odata.metadata=minimal'});s.end(o?JSON.stringify(o):'')};const p=u.pathname;let body={};try{body=JSON.parse(b||'{}')}catch(e){}
 const m=/\/(tasks|events|messages)\/([^/]+)$/.exec(p);
 if(fail&&q.method==='GET'&&m&&store[decodeURIComponent(m[2])]&&store[decodeURIComponent(m[2])].__armed){if(fail==='hang')return;if(fail===500){s.writeHead(500);return s.end();}}
 if(q.method==='GET'&&/\/me\/todo\/lists$/.test(p))return j(200,{value:[{id:'L1',displayName:'Tasks',wellknownListName:'defaultList',isOwner:true}]});
 if(q.method==='POST'&&/\/tasks$/.test(p)){const id='T'+(++seq);const o={'@odata.etag':'W/"c'+seq+'"',importance:'normal',isReminderOn:false,status:'notStarted',title:body.title,createdDateTime:ts(0),lastModifiedDateTime:ts(0),hasAttachments:false,categories:[],id,body:{content:body.body?body.body.content:'',contentType:'text'},linkedResources:[]};if(body.dueDateTime)o.dueDateTime={dateTime:body.dueDateTime.dateTime,timeZone:'UTC'};store[id]=o;const r=pub(o);o.body={content:norm(o.body.content),contentType:'text'};if(o.dueDateTime)o.dueDateTime={dateTime:o.dueDateTime.dateTime.slice(0,19)+'.0000000',timeZone:'UTC'};return j(201,r);}
 if(q.method==='POST'&&/\/me\/events$/.test(p)){const id='E'+(++seq);const o={'@odata.etag':'W/"c'+seq+'"',id,createdDateTime:ts(0),lastModifiedDateTime:ts(0),changeKey:'CK0',subject:body.subject,importance:'normal',isAllDay:false,showAs:'busy',type:'singleInstance',webLink:'https://outlook.office365.com/owa/?itemid='+id,body:{contentType:'html',content:html(body.body&&body.body.content||'')},start:{dateTime:body.start.dateTime+'.0000000',timeZone:body.start.timeZone},end:{dateTime:body.end.dateTime+'.0000000',timeZone:body.end.timeZone},location:{displayName:'',locationType:'default'},attendees:[],organizer:{emailAddress:{name:'Sali',address:'sali@x.com'}}};store[id]=o;const r=pub(o);r.body={contentType:'html',content:r.body.content.replace('<html>','<html>\r\n')};o.body={contentType:'html',content:o.body.content.replace('<div>','<div style="font-family:Aptos">')};return j(201,r);}
 if(q.method==='POST'&&/createReply$/.test(p)){const id='D'+(++seq);const o={'@odata.etag':'W/"c'+seq+'"',id,createdDateTime:ts(0),lastModifiedDateTime:ts(0),changeKey:'CK0',isDraft:true,importance:'normal',subject:'RE: Thursday',toRecipients:[{emailAddress:{name:'Dana',address:'Dana@X.com'}}],webLink:'https://outlook.office.com/mail/drafts/'+id,body:{contentType:'html',content:html(body.comment||'')}};store[id]=o;return j(201,pub(o));}
 if(q.method==='POST'&&/attachments$/.test(p))return j(201,{id:'A1'});
 const o=m&&store[decodeURIComponent(m[2])];
 if(!o)return j(404,{error:{code:'ErrorItemNotFound'}});
 if(q.method==='PATCH'){if(body.body){o.body={contentType:'html',content:html(body.body.content)};}seq++;o.lastModifiedDateTime=ts(seq*137);if(o.changeKey)o.changeKey='CK'+seq;o['@odata.etag']='W/"e'+seq+'"';return j(200,pub(o));}
 if(q.method==='DELETE'){delete store[o.id];return j(204);}
 touch(o);let r=pub(o);const sel=u.searchParams.get('$select');if(sel){const k=sel.split(',');const rr={'@odata.etag':r['@odata.etag']};k.forEach(x=>{if(x in r)rr[x]=r[x]});r=rr;}lastGet[o.id]=r;return j(200,r);});});
const UL="Couldn't confirm it's unchanged. Undo left it alone.",EL="You edited this. Undo left it alone.";
let F=0;const ck=(n,c,x)=>{if(!c)F++;console.log((c?'PASS':'FAIL')+': '+n+(c?'':' '+JSON.stringify(x).slice(0,300)))};
const rt=x=>JSON.parse(JSON.stringify(x));
async function mkTask(due,notes){store={};const w=await call('outlookTaskWrite',{label:'Pay invoice 4412',params:due?{amount:'1,200',dateIso:'2026-10-20'}:{},now:Date.parse('2026-10-15T09:00:00Z'),subject:notes?'Invoice 4412':'',threadUrl:notes?'https://outlook.office.com/mail/id/1':''});
 // live button path: stored Activity row -> reload -> remountCopy + content-outlook keptSnap
 const row=rt({kind:'written',messageId:'M1',threadId:'T1',connectorId:'outlookTask',ref:w.ref,url:w.url||null,system:'microsoft/todo',externalId:w.proof&&w.proof.externalId,verifiedAt:w.proof&&w.proof.verifiedAt,fetchedBack:true,writtenLine:w.written,receiptStatus:'Handled',created:w.ref&&w.ref.created});
 const copy=sb.FlowProofOfClose.remountCopy(row);const kept=(row.ref&&row.ref.created)||row.created;if(kept&&copy.ref)copy.ref.created=kept;
 return {w,id:w.ref&&w.ref.taskId,undo:()=>call('outlookTaskUndo',copy.ref,{type:'flow:undo-action',connectorId:copy.connectorId,ref:copy.ref,created:copy.ref.created||null}),copy};}
async function mkEvent(meeting){store={};const w=meeting?await call('outlookCalendarWrite',{params:{meeting:true,dateIso:'2026-10-20',hour:14,minute:30,title:'Budget review',quote:'Can we meet Tuesday 14:30?'},threadUrl:'https://outlook.office.com/mail/id/2'}):await call('outlookCalendarWrite',{params:{dateIso:'2026-10-20',hour:12,minute:0,fileName:'deck.pdf',fileUrl:'https://x/deck.pdf',quote:'lunch thursday'}});
 const entry=rt({kind:'written',connectorId:'outlookCalendar',ref:w.ref,created:w.ref&&w.ref.created||null});
 return {w,id:w.ref&&w.ref.eventId,undo:()=>call('outlookCalendarUndo',entry.ref,{type:'flow:undo-action',connectorId:'outlookCalendar',ref:entry.ref,created:entry.ref&&entry.ref.created})};}
async function mkDraft(){store={};const w=await call('outlookDraftWrite',{outlookIncomingId:'M1',body:'x'});const entry=rt({ref:w.ref,created:w.created||null});
 return {w,id:w.ref,undo:()=>call('outlookDraftUndo',entry.ref,{type:'flow:undo-action',connectorId:'outlookDraft',ref:entry.ref,created:entry.created})};}
const deleted=(it)=>!store[it.id];
srv.listen(0,'127.0.0.1',async()=>{sb.__G='http://127.0.0.1:'+srv.address().port+'/v1.0';vm.runInContext('OUTLOOK_GRAPH=__G',sb);
 const kinds={todo:()=>mkTask(true,true),'todo-bare':()=>mkTask(false,false),calendar:()=>mkEvent(false),holdit:()=>mkEvent(true),draft:mkDraft};
 const edits={
  todo:[['title word',o=>o.title='Pay invoice 4413',true],['body word',o=>o.body.content=o.body.content.replace('1,200','1,300'),true],['body whitespace only',o=>o.body.content=o.body.content.replace(/\r\n/g,'\r\n  ')+'  ',false],['due changed',o=>o.dueDateTime.dateTime='2026-10-21T00:00:00.0000000',true],['body cleared',o=>o.body.content='',true],['due removed',o=>delete o.dueDateTime,true],['completed',o=>o.status='completed',true],['importance high (star)',o=>o.importance='high',true]],
  'todo-bare':[['notes added',o=>o.body.content='call Dana first','late'],['due added',o=>o.dueDateTime={dateTime:'2026-10-22T00:00:00.0000000',timeZone:'UTC'},'late']],
  calendar:[['subject word',o=>o.subject=o.subject+' moved',true],['start moved',o=>o.start.dateTime='2026-10-20T13:00:00.0000000',true],['body word',o=>o.body.content=o.body.content.replace('lunch','dinner'),true],['location added',o=>o.location={displayName:'Taizu'},'late'],['body cleared',o=>o.body.content='',true],['importance high (star)',o=>o.importance='high',true]],
  holdit:[['subject word',o=>o.subject='Budget review v2',true],['end moved',o=>o.end.dateTime='2026-10-20T16:00:00.0000000',true],['location added',o=>o.location={displayName:'Room 4'},'late'],['attendee added',o=>o.attendees=[{emailAddress:{address:'noa@x.com'}}],'late']],
  draft:[['body word',o=>o.body.content=o.body.content.replace('>x<','>x, see you Friday<'),true],['subject word',o=>o.subject='RE: Thursday?',true],['to added',o=>o.toRecipients=o.toRecipients.concat([{emailAddress:{address:'noa@x.com'}}]),true],['body cleared',o=>o.body.content='',true],['body whitespace only',o=>o.body.content=o.body.content.replace('<div>','<div> &nbsp;'),false],['importance high (star)',o=>o.importance='high',true]]};
 for(mode of ['stable','touch','bodyonly']){console.log('\n=== mode '+mode);
  for(const k of Object.keys(kinds)){fail=null;let it=await kinds[k]();
   if(!it.w.ok){ck(k+' write ok',false,it.w);continue;}
   if(mode==='stable'&&k==='todo')console.log('  remount copy.ref keys: '+Object.keys(it.copy.ref).join(',')+' created='+JSON.stringify(it.copy.ref.created));
   if(mode==='stable'&&k!=='todo'&&k!=='todo-bare')console.log('  '+k+' snapshot: '+JSON.stringify(k==='draft'?it.w.created:it.w.ref.created));
   log=[];let u=await it.undo();ck(mode+' '+k+' unedited -> deleted',u.ok&&deleted(it),{u,log});
   for(const [en,fn,isEdit] of edits[k]){it=await kinds[k]();fn(store[it.id]);u=await it.undo();
    if(isEdit==='late')ck(mode+' '+k+' edit "'+en+'" -> Couldn\'t confirm, kept',u.written===UL&&!deleted(it),{u:u.reason,deleted:deleted(it)});
    else if(isEdit)ck(mode+' '+k+' edit "'+en+'" -> You edited, kept',u.written===EL&&!deleted(it),{u:u.reason,deleted:deleted(it)});
    else ck(mode+' '+k+' "'+en+'" is NOT an edit -> deleted',u.ok&&deleted(it),{u});}
   if(mode==='stable')for(const fm of [500,'hang']){it=await kinds[k]();fail=fm;store[it.id].__armed=true;const t=Date.now();u=await it.undo();fail=null;ck(mode+' '+k+' '+fm+' -> Couldn\'t confirm, kept',u.written===UL&&!deleted(it),{u,ms:Date.now()-t});}
  }}
 // attachment-cleanup path (content-outlook.js:871): unedited leftover draft
 mode='stable';{store={};const w=await call('outlookDraftWrite',{outlookIncomingId:'M1',body:'x'});const u=await call('outlookDraftUndo',w.ref,{type:'flow:undo-action',connectorId:'outlookDraft',ref:w.ref,created:w.created||null});ck('attachment-cleanup undo with r.created deletes unedited leftover draft',u.ok&&!store[w.ref],u);}
 // Hold It read-back: GET after create fails
 {store={};const realH=srv.listeners('request')[0];let n=0;srv.removeAllListeners('request');srv.on('request',(q,s)=>{if(q.method==='GET'&&/events\//.test(q.url)){s.writeHead(500);return s.end();}realH(q,s);});
  let gets=0;srv.removeAllListeners('request');srv.on('request',(q,s)=>{if(q.method==='GET'&&/events\//.test(q.url)){gets++;s.writeHead(500);return s.end();}realH(q,s);});
  const w=await call('outlookCalendarWrite',{params:{meeting:true,dateIso:'2026-10-20',hour:14,minute:30,title:'Budget review'}});
  ck('GET fail twice leaves no snapshot', gets===2 && w.ref && !w.ref.created, {gets, created:w.ref&&w.ref.created});
  ck('Hold It read-back fail is Created, couldn\'t verify, not Handled',
    w.ok===true && w.fetchedBack===false && w.written==="Created, couldn't verify" && w.proof==null &&
    w.ref && w.ref.eventId &&
    sb.FlowProofOfClose.allowsHandled({ok:w.ok, proof:w.proof})===false, w);
  const u=await call('outlookCalendarUndo',w.ref,{created:w.ref&&w.ref.created});
  ck('that Undo says Couldn\'t confirm and does not delete', u.written===UL && store[w.ref.eventId], {u, still:!!store[w.ref.eventId]});
  srv.removeAllListeners('request');srv.on('request',realH);
  store={};gets=0;srv.removeAllListeners('request');srv.on('request',(q,s)=>{if(q.method==='GET'&&/events\//.test(q.url)){gets++;if(gets===1){s.writeHead(500);return s.end();}}realH(q,s);});
  const again=await call('outlookCalendarWrite',{params:{meeting:true,dateIso:'2026-10-20',hour:14,minute:30,title:'Budget review',quote:'Can we meet Tuesday 14:30?'}});
  const snap=again.ref&&again.ref.created;
  ck('GET fail then retry ok stores importance and omits reminder fields',
    gets===2 && again.fetchedBack===true && snap && snap.subject==='Budget review' && snap.isAllDay===false &&
    snap.importance==='normal' && !Object.prototype.hasOwnProperty.call(snap,'isReminderOn') &&
    !Object.prototype.hasOwnProperty.call(snap,'reminderMinutesBeforeStart'),
    {gets, snap});
  srv.removeAllListeners('request');srv.on('request',realH);
  const plain=await call('outlookCalendarUndo',again.ref,{created:snap});
  ck('server defaults unedited -> delete when the snapshot came from the GET', plain.ok&&!store[again.ref.eventId], plain);
  store={};const lateW=await call('outlookCalendarWrite',{params:{meeting:true,dateIso:'2026-10-20',hour:14,minute:30,title:'Budget review'}});
  const lateId=lateW.ref.eventId;
  store[lateId].isReminderOn=true;store[lateId].reminderMinutesBeforeStart=30;
  store[lateId].reminderDateTime={dateTime:'2026-10-20T14:00:00.0000000',timeZone:'UTC'};
  const late=await call('outlookCalendarUndo',lateW.ref,{created:lateW.ref.created});
  ck('unedited item where Graph later fills a reminder deletes', late.ok&&!store[lateId], late);
  store={};const missImp=await call('outlookCalendarWrite',{params:{meeting:true,dateIso:'2026-10-20',hour:14,minute:30,title:'Budget review'}});
  delete store[missImp.ref.eventId].importance;
  const missImpU=await call('outlookCalendarUndo',missImp.ref,{created:missImp.ref.created});
  ck('importance missing later deletes', missImpU.ok&&!store[missImp.ref.eventId], missImpU);
  store={};const lateNorm=await call('outlookCalendarWrite',{params:{meeting:true,dateIso:'2026-10-20',hour:14,minute:30,title:'Budget review'}});
  const bare=JSON.parse(JSON.stringify(lateNorm.ref.created));delete bare.importance;
  store[lateNorm.ref.eventId].importance='normal';
  const lateNormU=await call('outlookCalendarUndo',lateNorm.ref,{created:bare});
  ck('importance late-default normal deletes', lateNormU.ok&&!store[lateNorm.ref.eventId], lateNormU);
  store={};let draftGets=0;
  srv.removeAllListeners('request');srv.on('request',(q,s)=>{if(q.method==='GET'&&/\/messages\//.test(q.url)){draftGets++;s.writeHead(500);return s.end();}realH(q,s);});
  const dw=await call('outlookDraftWrite',{outlookIncomingId:'M1',body:'x'});
  ck('draft GET fail twice is Created, couldn\'t verify',
    draftGets===2 && dw.ok===true && dw.fetchedBack===false && dw.created==null && dw.written==="Created, couldn't verify" && dw.ref,
    {draftGets,dw});
  srv.removeAllListeners('request');srv.on('request',realH);
  store={};const editW=await call('outlookCalendarWrite',{params:{meeting:true,dateIso:'2026-10-20',hour:14,minute:30,title:'Budget review'}});
  store[editW.ref.eventId].subject='Budget review v2';
  const changed=await call('outlookCalendarUndo',editW.ref,{created:editW.ref.created});
  ck('a stored subject that changed is You edited', changed.written===EL && store[editW.ref.eventId], changed);
  store={};const clearW=await call('outlookCalendarWrite',{params:{meeting:true,dateIso:'2026-10-20',hour:14,minute:30,title:'Budget review',quote:'bring the deck'}});
  store[clearW.ref.eventId].body.content='';
  const cleared=await call('outlookCalendarUndo',clearW.ref,{created:clearW.ref.created});
  ck('a stored body cleared to empty is You edited', cleared.written===EL && store[clearW.ref.eventId], cleared);
  const long='word '.repeat(4000);const big=sb.FlowNativeEdit.snapshotOf({body:{content:long}});
  ck('a body over 8KB matches until a word past the prefix changes',
    big.body.prefix.length===8192 && sb.FlowNativeEdit.compareContent(big,{body:{content:long}})==='match' &&
    sb.FlowNativeEdit.compareContent(big,{body:{content:long+'friday'}})==='edited');
 }
 // Live Gate: two external Gmail mails. A is a To Do. B is a Hold.
 // Missing Tasks or Calendar scope is not an input here: the card is the intent.
 const eng={module:undefined,console};vm.createContext(eng);
 for(const f of ['domains.js','extract.js','judgment.js','google-closes.js','close-families.js','fact-reply.js','intent.js','actions.js','file-attach.js','resolution.js','draft-reply.js','incoming-judge.js']){
  vm.runInContext(fs.readFileSync(B+'/core/'+f,'utf8'),eng,{filename:f});
 }
 const Judge=eng.FlowIncomingJudge;
 const NOW=new Date('2026-10-15T09:00:00Z');
 const external={name:'Dana Cohen',email:'dana.cohen@gmail.com'};
 const me=['glance.salisapan@outlook.com'];
 function gateMail(body,subject){
  return Judge.judge({text:body,subject,sender:external,surface:'outlook',ownAddresses:me,userName:'Glance',inbound:true,now:NOW,to:me});
 }
 const gymBody='please remember to renew your gym membership by Friday 23/10';
 const gymSubject='Renew gym membership by Friday';
 const gym=gateMail(gymBody,gymSubject);
 ck('external gym reminder is a To Do card, due 23/10',
  gym&&gym.show===true&&gym.intent&&gym.intent.type==='request'&&gym.intent.noReplyDraft===true&&
  gym.intent.entities&&gym.intent.entities.dateIso==='2026-10-23'&&
  gym.process&&gym.process.id==='log-it'&&gym.process.steps.length===1&&gym.process.steps[0].kind==='outlookTask'&&
  gymBody==='please remember to renew your gym membership by Friday 23/10'&&gymSubject==='Renew gym membership by Friday',
  {show:gym&&gym.show,type:gym&&gym.intent&&gym.intent.type,date:gym&&gym.intent&&gym.intent.entities&&gym.intent.entities.dateIso,id:gym&&gym.process&&gym.process.id,kinds:gym&&gym.process&&gym.process.steps});
 const holdBody='תשמור לי את הזמן';
 const holdSubject='פגישה 18/10 11:00 רוטשילד 12';
 const hold=gateMail(holdBody,holdSubject);
 const holdInPane=gateMail(holdSubject+'\n'+holdBody,holdSubject);
 ck('external Hebrew hold is a calendar card at 18/10 11:00',
  hold&&hold.show===true&&hold.intent&&hold.intent.personalClose==='calendar-hold'&&
  hold.intent.entities&&hold.intent.entities.dateIso==='2026-10-18'&&hold.intent.entities.hour===11&&hold.intent.entities.minute===0&&
  hold.process&&hold.process.id==='hold'&&hold.process.steps.length===1&&hold.process.steps[0].kind==='calendar'&&
  holdInPane&&holdInPane.show===true&&holdInPane.process&&holdInPane.process.id==='hold'&&
  holdBody==='תשמור לי את הזמן'&&holdSubject==='פגישה 18/10 11:00 רוטשילד 12',
  {show:hold&&hold.show,close:hold&&hold.intent&&hold.intent.personalClose,date:hold&&hold.intent&&hold.intent.entities,id:hold&&hold.process&&hold.process.id,pane:holdInPane&&holdInPane.show});
 console.log('\nFAILURES: '+F);srv.close();process.exit(F?1:0);});
