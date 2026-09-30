(function(){
'use strict';
var C = window.CONFIG, Sh = window.Shortcut;
var $ = function(s,r){return (r||document).querySelector(s)};
var esc = function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var uid = function(){return Math.random().toString(36).slice(2,9)};
var today = function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
var addDays = function(iso,n){var d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
var LS = {
  get:function(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){toast('Could not save. Your browser storage is full or blocked.');return false}},
  del:function(k){try{localStorage.removeItem(k)}catch(e){}}
};
function toast(msg){var t=document.createElement('div');t.className='toast';t.textContent=msg;$('#toasts').appendChild(t);setTimeout(function(){t.remove()},3200)}
function md(t){
  return esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^(?:- |• |\* )(.+)$/gm,'<li>$1</li>').replace(/<\/li>\n/g,'</li>').replace(/(<li>.*?<\/li>)+/g,function(m){return '<ul>'+m+'</ul>'}).replace(/\n/g,'<br>');
}
var ic = window.ic;

/* ---------------- accounts: Supabase (cloud) if configured, otherwise this browser ---------------- */
var user=null, data=null, SB=null, CLOUD=false;
if(C.SUPABASE_URL&&C.SUPABASE_ANON_KEY){
  if(window.supabase){SB=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);CLOUD=true}
  else console.warn('Supabase library did not load. Running in local mode.');
}
async function hash(pw,salt){
  var s=salt+pw;
  if(window.crypto&&crypto.subtle){var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.prototype.map.call(new Uint8Array(b),function(x){return x.toString(16).padStart(2,'0')}).join('')}
  var h=5381;for(var i=0;i<s.length;i++)h=((h*33)^s.charCodeAt(i))>>>0;return 'w'+h.toString(16);
}
var defaults = function(){return {chat:[],decks:[],quizzes:[],notes:[],essays:[],lang:{lang:'Spanish',msgs:[]},plan:null,log:{},goal:3}};
function loadUser(email){user=LS.get('sy_users',{})[email];user.email=email;data=Object.assign(defaults(),LS.get('sy_data_'+email,{}))}
var saveT=null;
function save(){
  if(!user)return;
  if(CLOUD){LS.set('sy_cache_'+user.id,data);clearTimeout(saveT);saveT=setTimeout(flush,700)}
  else LS.set('sy_data_'+user.email,data);
}
function flush(){
  if(!CLOUD||!user||!data)return Promise.resolve();clearTimeout(saveT);
  return SB.from('user_data').upsert({user_id:user.id,data:data,updated_at:new Date().toISOString()}).then(function(r){if(r.error)toast('Could not sync to the cloud: '+r.error.message)});
}
window.addEventListener('pagehide',function(){flush()});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush()});
async function loadCloud(u){
  var r=await SB.from('user_data').select('data').eq('user_id',u.id).maybeSingle();
  if(r.error)throw new Error('Could not load your data. Check your connection and try again.');
  user={id:u.id,email:u.email,name:(u.user_metadata&&u.user_metadata.name)||u.email.split('@')[0]};
  data=Object.assign(defaults(),(r.data&&r.data.data)||{});
}
function points(n){data.log[today()]=(data.log[today()]||0)+n;save()}
async function signup(name,email,pw){
  email=email.trim().toLowerCase();var users=LS.get('sy_users',{});
  if(!name.trim())throw new Error('Enter your name.');
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('Enter a valid email address.');
  if(pw.length<6)throw new Error('Use a password with at least 6 characters.');
  if(CLOUD){
    var r=await SB.auth.signUp({email:email,password:pw,options:{data:{name:name.trim()}}});
    if(r.error)throw new Error(r.error.message);
    if(!r.data.session)throw new Error('Account created. Check your email to confirm it, then log in.');
    await loadCloud(r.data.session.user);return;
  }
  if(users[email])throw new Error('An account with this email already exists. Log in instead.');
  var salt=uid()+uid();users[email]={name:name.trim(),salt:salt,hash:await hash(pw,salt),created:Date.now()};
  if(!LS.set('sy_users',users))throw new Error('Could not create the account in this browser.');
  LS.set('sy_session',email);loadUser(email);
}
async function login(email,pw){
  email=email.trim().toLowerCase();
  if(CLOUD){var r=await SB.auth.signInWithPassword({email:email,password:pw});if(r.error)throw new Error(/invalid login/i.test(r.error.message)?'Email or password is incorrect.':r.error.message);await loadCloud(r.data.user);return}
  var u=LS.get('sy_users',{})[email];
  if(!u||u.hash!==await hash(pw,u.salt))throw new Error('Email or password is incorrect.');
  LS.set('sy_session',email);loadUser(email);
}
async function logout(){if(CLOUD){try{await flush();await SB.auth.signOut()}catch(e){}}else LS.del('sy_session');user=null;data=null;location.hash='';renderAuth('login')}

/* ---------------- AI layer ---------------- */
var DEMO = !C.AI_ENDPOINT;
/* The short instruction each feature gives the AI BEFORE the student's own text. */
var INSTR={
  homework:"You are a patient, friendly study tutor for students. Explain the answer step by step in short numbered steps, then give the final answer on its own line starting with 'Answer:'. If photos are attached, read them carefully first and solve or explain what they show. If a link is given, use the content of that page. Reply in the same language the student writes in. Use **bold** for key terms and '- ' for bullet lists; do not use tables or headings. The student's message follows.",
  flashcards:"Create up to 15 study flashcards from the text below. Each card tests exactly one fact. Reply with ONLY a JSON array like [{\"q\":\"question\",\"a\":\"short answer\"}]. Use the same language as the text. The text follows.",
  quiz:"Write {n} multiple-choice questions from the text below. Each has 4 options and exactly one correct answer. Reply with ONLY a JSON array like [{\"q\":\"...\",\"options\":[\"a\",\"b\",\"c\",\"d\"],\"answer\":0,\"explain\":\"one short sentence\"}] where answer is the index of the correct option. Use the same language as the text. The text follows.",
  notes:"Turn the material below into concise, well-structured study notes. If photos are attached (handwriting, slides, textbook pages, whiteboards), read them and include their content. Start with a one-line summary, then key points as '- ' bullets, then a 'Key terms' list. Use **bold** for section names and terms. Use the same language as the material. The material follows.",
  language:"You are a friendly {lang} conversation partner helping a learner practise. Reply in {lang} in 1 to 3 short sentences and keep the conversation going with a question. Then add a new line starting with 'Corrections:' that lists any grammar or vocabulary mistakes in the learner's last message with the fix, written in English. If there are none, write 'Corrections: none, well done!'. The learner's message follows.",
  essay:"You are a fair, encouraging essay grader. Grade the essay below out of 100. Reply with ONLY JSON: {\"score\":number,\"stats\":{\"Clarity\":\"x/10\",\"Structure\":\"x/10\",\"Evidence\":\"x/10\",\"Grammar\":\"x/10\"},\"feedback\":[\"3 to 5 specific, actionable improvements, most important first\"]}. The essay follows."
};
async function ai(task,text,opts){
  opts=opts||{};if(DEMO)return null;
  var instr=INSTR[task].replace(/\{n\}/g,opts.n||5).replace(/\{lang\}/g,opts.lang||'the target language');
  var h={'Content-Type':'application/json'};
  if(CLOUD){var ss=await SB.auth.getSession();if(ss.data.session)h.Authorization='Bearer '+ss.data.session.access_token}
  var r=await fetch(C.AI_ENDPOINT,{method:'POST',headers:h,body:JSON.stringify({task:task,system:instr,prompt:text,images:opts.images||[],links:opts.links||[],history:opts.history||[]})});
  if(!r.ok){var j=null;try{j=await r.json()}catch(e){}throw new Error((j&&j.error)||'The AI service returned an error ('+r.status+').')}
  return (await r.json()).text;
}
function parseJSON(t){var m=String(t).match(/[\[{][\s\S]*[\]}]/);return JSON.parse(m[0])}
async function aiSafe(task,prompt,opts){try{return await ai(task,prompt,opts)}catch(e){toast(e.message);return null}}

/* ---------------- demo (offline) engines ---------------- */
var STOP=new Set('the a an and or of to in on for with is are was were be by as at it this that from which their its has have had not but can will also into than then these those such more most other some any about between'.split(' '));
function sentences(t){return (String(t).replace(/\s+/g,' ').match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).map(function(s){return s.trim()}).filter(function(s){return s.length>20})}
function localCards(text){
  var out=[];
  sentences(text).forEach(function(s){
    var m=s.match(/^(.{3,70}?)\s+(is|are|was|were|means|refers to)\s+(.{8,})$/i);
    if(m){var v=/^(are|were)$/i.test(m[2])?'are':'is';out.push({q:'What '+v+' '+m[1].replace(/^(the|a|an)\s+/i,function(x){return x.toLowerCase()})+'?',a:m[3].replace(/[.!?]+$/,'')})}
    else{
      var w=s.split(/\W+/).filter(function(x){return x.length>5&&!STOP.has(x.toLowerCase())});if(!w.length)return;
      w.sort(function(a,b){return b.length-a.length});var k=w[0];out.push({q:s.replace(new RegExp('\\b'+k+'\\b'),'_____'),a:k});
    }
  });
  return out.slice(0,20);
}
function localQuiz(text,n){
  var cards=localCards(text);if(cards.length<2)return [];
  return cards.slice(0,n).map(function(c){
    var others=cards.filter(function(x){return x.a!==c.a}).map(function(x){return x.a}).sort(function(){return Math.random()-.5}).slice(0,3);
    var opts=others.concat([c.a]).sort(function(){return Math.random()-.5});
    return {q:c.q,options:opts,answer:opts.indexOf(c.a),explain:'Correct answer: '+c.a}
  });
}
function localSummary(text){
  var ss=sentences(text);if(!ss.length)return 'Paste a longer passage (a few sentences) to summarise it.';
  var freq={};text.toLowerCase().split(/\W+/).forEach(function(w){if(w.length>3&&!STOP.has(w))freq[w]=(freq[w]||0)+1});
  var scored=ss.map(function(s,i){var sc=0;s.toLowerCase().split(/\W+/).forEach(function(w){sc+=freq[w]||0});return {s:s,i:i,sc:sc/Math.sqrt(s.split(' ').length)}});
  var top=scored.sort(function(a,b){return b.sc-a.sc}).slice(0,Math.min(5,Math.ceil(ss.length/2))).sort(function(a,b){return a.i-b.i});
  var terms=Object.keys(freq).sort(function(a,b){return freq[b]-freq[a]}).slice(0,8);
  return '**Key points**\n'+top.map(function(t){return '- '+t.s}).join('\n')+'\n\n**Key terms**\n'+terms.map(function(t){return '- '+t}).join('\n');
}
function tryMath(q){
  var e=q.replace(/what is|calculate|solve|compute/gi,'').replace(/[=?]/g,'').replace(/[x×]/gi,'*').replace(/÷/g,'/').replace(/\^/g,'**').trim();
  if(!/^[\d+\-*/().\s%]+$/.test(e)||!/\d/.test(e)||!/[+\-*/%]/.test(e))return null;
  try{var v=Function('"use strict";return ('+e+')')();if(typeof v!=='number'||!isFinite(v))return null;
    return '**Step 1.** Read the expression: `'+e+'`\n**Step 2.** Work in order: brackets, powers, × ÷, then + −.\n**Answer:** '+(+v.toFixed(8));}catch(x){return null}
}
function localEssay(text){
  var words=(text.match(/\b[\w'’-]+\b/g)||[]),n=words.length,ss=(text.match(/[.!?]+/g)||[]).length||1,paras=text.split(/\n\s*\n/).filter(Boolean).length;
  var avg=n/ss,trans=(text.match(/\b(however|therefore|moreover|furthermore|in addition|for example|for instance|consequently|in conclusion|as a result|on the other hand|first|second|finally)\b/gi)||[]).length;
  var seen={},rep=0;words.forEach(function(w){w=w.toLowerCase();if(w.length>6){seen[w]=(seen[w]||0)+1}});Object.keys(seen).forEach(function(k){if(seen[k]>=4)rep++});
  var score=50;score+=Math.min(15,n/40);score+=Math.min(12,trans*3);score+=paras>=3?10:paras*3;score+=(avg>=12&&avg<=24)?8:0;score-=rep*3;score=Math.max(20,Math.min(96,Math.round(score)));
  var fb=[];
  if(n<150)fb.push('Your essay is short ('+n+' words). Develop each idea with an example or evidence.');
  if(paras<3)fb.push('Split your writing into an introduction, body paragraphs and a conclusion.');
  if(trans<3)fb.push('Add linking words (however, therefore, for example) so ideas flow.');
  if(avg>28)fb.push('Sentences average '+avg.toFixed(0)+' words. Break the longest ones in two.');
  if(avg<9)fb.push('Sentences are very short ('+avg.toFixed(0)+' words on average). Combine some for smoother reading.');
  if(rep)fb.push(rep+' word(s) are repeated 4+ times. Vary your vocabulary.');
  if(!fb.length)fb.push('Solid structure and length. Next, sharpen your thesis and back each claim with evidence.');
  return {score:score,stats:{Words:n,Sentences:ss,Paragraphs:paras,'Avg sentence':avg.toFixed(1)},feedback:fb,demo:true};
}
var PHRASES={Spanish:['Hola, ¿cómo estás?','¿Cómo te llamas?','Me gustaría un café, por favor.'],French:['Bonjour, comment ça va ?','Je m’appelle…','Je voudrais un café, s’il vous plaît.'],German:['Hallo, wie geht’s?','Ich heiße…','Ich hätte gern einen Kaffee, bitte.'],Italian:['Ciao, come stai?','Mi chiamo…','Vorrei un caffè, per favore.'],Portuguese:['Olá, tudo bem?','Meu nome é…','Eu queria um café, por favor.'],Japanese:['こんにちは、お元気ですか？','私の名前は…です。','コーヒーをください。'],Chinese:['你好，你好吗？','我叫……','请给我一杯咖啡。'],English:['Hello, how are you?','My name is…','I would like a coffee, please.']};

/* ---------------- shell ---------------- */
var NAV=[['dashboard','home','Dashboard'],['homework','camera','Homework help'],['flashcards','layers','Flashcards'],['quizzes','quiz','Quizzes'],['notes','notes','Notes'],['language','languages','Language practice'],['essay','pen','Essay grader'],['planner','calendar','Study planner'],['progress','chart','Progress'],['settings','settings','Settings']];
var S={imgs:[],study:null,quiz:null,busy:false};
var root=$('#root');

function renderAuth(mode){
  document.body.classList.remove('nav-open');
  root.innerHTML='<div class="auth"><div class="side"><a class="brand" href="index.html"><span class="logo" style="width:34px;height:34px;border-radius:10px;background:var(--grad);display:grid;place-items:center">'+ic('brain',20)+'</span>'+esc(C.APP_NAME)+'</a>'
  +'<div><h2>Study smarter, not longer.</h2><p class="muted" style="margin:14px 0 22px">'+(CLOUD?'Your account and study data sync across your devices.':'Your account and study data are saved on this device.')+'</p><ul><li>'+ic('check',16)+'Homework help with steps</li><li>'+ic('check',16)+'Flashcards, quizzes and notes</li><li>'+ic('check',16)+'Planner and progress tracking</li></ul></div><span class="fine">Free during early access</span></div>'
  +'<div class="form"><form id="af" novalidate><h1>'+(mode==='signup'?'Create your account':'Welcome back')+'</h1>'
  +'<div class="tabs" role="tablist"><button type="button" data-m="login" class="'+(mode==='login'?'on':'')+'">Log in</button><button type="button" data-m="signup" class="'+(mode==='signup'?'on':'')+'">Create account</button></div>'
  +(mode==='signup'?'<label class="f">Name<input class="input" name="name" autocomplete="name" required></label>':'')
  +'<label class="f">Email<input class="input" type="email" name="email" autocomplete="email" required></label>'
  +'<label class="f">Password<input class="input" type="password" name="pw" autocomplete="'+(mode==='signup'?'new-password':'current-password')+'" required></label>'
  +'<div class="err" id="err" role="alert"></div><button class="btn primary" type="submit">'+(mode==='signup'?'Create account':'Log in')+'</button>'
  +'<a class="fine" href="index.html" style="text-align:center">Back to home</a></form></div></div>';
  root.querySelectorAll('.tabs button').forEach(function(b){b.onclick=function(){renderAuth(b.dataset.m)}});
  $('#af').onsubmit=async function(e){
    e.preventDefault();var f=e.target,btn=f.querySelector('[type=submit]');btn.disabled=true;$('#err').textContent='';
    try{if(mode==='signup')await signup(f.name.value,f.email.value,f.pw.value);else await login(f.email.value,f.pw.value);enter()}
    catch(x){$('#err').textContent=x.message;btn.disabled=false}
  };
}
function enter(){
  root.innerHTML='<div class="shell"><aside id="side"><a class="brand" href="index.html"><span class="logo" style="width:34px;height:34px;border-radius:10px;background:var(--grad);display:grid;place-items:center">'+ic('brain',20)+'</span>'+esc(C.APP_NAME)+'</a>'
  +'<nav>'+NAV.map(function(n){return '<a href="#/'+n[0]+'" data-r="'+n[0]+'">'+ic(n[1])+n[2]+'</a>'}).join('')+'</nav>'
  +'<div class="plus"><b>Plus · in progress</b>Everything is free for now.</div>'
  +'<div class="me"><span class="av">'+esc(user.name[0].toUpperCase())+'</span><div><b>'+esc(user.name)+'</b><span class="dim">'+esc(user.email)+'</span></div><button class="iconbtn" id="lo" title="Log out" aria-label="Log out">'+ic('logout')+'</button></div></aside>'
  +'<div class="scrim" id="scrim"></div><main class="appmain"><div class="top"><button class="iconbtn" id="mb" aria-label="Menu">'+ic('menu',22)+'</button><b id="ttl"></b></div><div id="view"></div></main></div>';
  $('#lo').onclick=logout;$('#mb').onclick=function(){document.body.classList.add('nav-open')};$('#scrim').onclick=function(){document.body.classList.remove('nav-open')};
  $('#view').addEventListener('click',onClick);$('#view').addEventListener('change',onChange);$('#view').addEventListener('keydown',onKey);
  route();
}
function route(){
  if(!user)return;
  var parts=location.hash.replace(/^#\/?/,'').split('/'),name=parts[0]||'dashboard';if(!V[name])name='dashboard';
  root.querySelectorAll('aside nav a').forEach(function(a){a.classList.toggle('on',a.dataset.r===name)});
  var n=NAV.filter(function(x){return x[0]===name})[0];$('#ttl').textContent=n?n[2]:'';
  document.body.classList.remove('nav-open');$('#view').innerHTML='';V[name](parts[1]);window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);
function view(h){$('#view').innerHTML=h}
function head(t,p){return '<div class="pagehead"><h1>'+t+'</h1><p>'+p+'</p></div>'+(DEMO?'<div class="banner"><b>Demo mode.</b> The AI service is not connected, so answers use simple built-in helpers. See the README to switch on real AI.</div>':'')}
function empty(t,p){return '<div class="empty"><b>'+t+'</b>'+p+'</div>'}
function go(r){location.hash='#/'+r}

/* ---------------- views ---------------- */
var V={};
function streak(){var n=0,d=today();if(!data.log[d])d=addDays(d,-1);while(data.log[d]){n++;d=addDays(d,-1)}return n}
V.dashboard=function(){
  var cards=data.decks.reduce(function(a,d){return a+d.cards.length},0);
  var Q=[['homework','camera','c-blue','Ask a question','Snap or type a problem'],['flashcards','layers','c-violet','Make flashcards','From your notes'],['quizzes','quiz','c-green','Take a quiz','Test yourself'],['notes','notes','c-amber','Summarise notes','Get key points'],['language','languages','c-pink','Practise a language','Chat and improve'],['planner','calendar','c-cyan','Plan your exams','Daily schedule']];
  view(head('Hi, '+esc(user.name.split(' ')[0]),'Pick up where you left off.')
  +'<div class="cards" style="margin-bottom:26px"><div class="card stat"><b>'+streak()+'</b><span>Day streak</span></div><div class="card stat"><b>'+cards+'</b><span>Flashcards</span></div><div class="card stat"><b>'+data.quizzes.length+'</b><span>Quizzes taken</span></div><div class="card stat"><b>'+data.notes.length+'</b><span>Saved notes</span></div></div>'
  +'<h3 class="h">Start something</h3><div class="cards">'+Q.map(function(q){return '<div class="quick" data-act="go" data-r="'+q[0]+'" tabindex="0" role="link"><span class="ico '+q[2]+'">'+ic(q[1])+'</span><div><b>'+q[3]+'</b><span>'+q[4]+'</span></div></div>'}).join('')+'</div>'
  +'<div class="card row spread" style="margin-top:26px"><div><b>Open it like an app</b><div class="muted" style="font-size:14px">Download a shortcut to this web app for your desktop or home screen.</div></div><button class="btn" data-act="shortcut">'+ic('download',16)+'Download shortcut</button></div>');
};

/* Homework */
function linkify(t){return esc(t).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#c4b5fd;text-decoration:underline">$1</a>')}
function msgHTML(m){var imgs=m.imgs||[];return '<div class="msg '+m.role+'">'+(m.role==='ai'?md(m.text):linkify(m.text))+imgs.map(function(u){return '<img src="'+u+'" alt="Attached photo">'}).join('')+(m.hadImg?'<div class="dim" style="font-size:12px;margin-top:6px">'+m.hadImg+' photo(s) attached</div>':'')+'</div>'}
V.homework=function(){
  view(head('Homework help','Snap a photo, paste text or type your question. Get step-by-step answers.')
  +'<div class="card chatbox"><div class="msgs" id="msgs">'+(data.chat.length?data.chat.map(msgHTML).join(''):empty('Ask your first question','Try “What is 12 × (3 + 4)?” or “Explain photosynthesis”.'))+'</div><div class="attach" id="attach"></div>'
  +'<div class="composer"><select id="subj" aria-label="Subject">'+['General','Math','Science','History','English','Coding'].map(function(s){return '<option>'+s+'</option>'}).join('')+'</select>'
  +'<label class="iconbtn" title="Attach a photo">'+ic('image',20)+'<input type="file" id="file" accept="image/*" multiple hidden></label>'
  +'<textarea id="q" rows="1" placeholder="Type a question, paste a link, or paste / drop a photo…" aria-label="Your question"></textarea><button class="btn primary" data-act="ask">'+ic('send',16)+'Send</button></div></div>'
  +(data.chat.length?'<p style="margin-top:10px"><button class="btn ghost sm" data-act="clearchat">Clear conversation</button></p>':''));
  var m=$('#msgs');m.scrollTop=m.scrollHeight;S.imgs=[];
  var q=$('#q'),box=$('.chatbox');
  q.addEventListener('paste',function(e){var fs=[].filter.call((e.clipboardData&&e.clipboardData.files)||[],function(f){return /^image\//.test(f.type)});if(fs.length){e.preventDefault();addImages(fs)}});
  ['dragenter','dragover'].forEach(function(ev){box.addEventListener(ev,function(e){e.preventDefault();box.style.borderColor='var(--indigo)'})});
  ['dragleave','drop'].forEach(function(ev){box.addEventListener(ev,function(e){e.preventDefault();box.style.borderColor=''})});
  box.addEventListener('drop',function(e){var fs=[].filter.call(e.dataTransfer.files||[],function(f){return /^image\//.test(f.type)});if(fs.length)addImages(fs);else toast('Drop an image file.')});
};
function renderAttach(){$('#attach').innerHTML=S.imgs.map(function(u,i){return '<span class="chip" style="margin-right:6px"><img src="'+u+'" alt="" style="width:26px;height:26px;border-radius:6px;object-fit:cover">Photo '+(i+1)+'<button class="iconbtn" data-act="rmimg" data-i="'+i+'" style="padding:2px" aria-label="Remove photo">'+ic('x',14)+'</button></span>'}).join('')}
async function addImages(files){
  for(var k=0;k<files.length;k++){
    if(S.imgs.length>=4){toast('You can attach up to 4 photos.');break}
    try{S.imgs.push(await resizeImage(files[k]))}catch(x){toast('Could not read that image.')}
  }
  renderAttach();
}
function resizeImage(file,max,q){return new Promise(function(res,rej){var fr=new FileReader();fr.onerror=rej;fr.onload=function(){var im=new Image();im.onerror=rej;im.onload=function(){var s=Math.min(1,(max||1024)/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*s;c.height=im.height*s;c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',q||.8))};im.src=fr.result};fr.readAsDataURL(file)})}
async function ask(){
  if(S.busy)return;var q=$('#q'),text=q.value.trim();if(!text&&!S.imgs.length)return;S.busy=true;
  var imgs=S.imgs.slice(),subj=$('#subj').value,links=(text.match(/https?:\/\/[^\s<>"')]+/g)||[]).slice(0,3);S.imgs=[];$('#attach').innerHTML='';q.value='';
  var msgs=$('#msgs');if(!data.chat.length)msgs.innerHTML='';
  var um={role:'user',text:text||'(photo)',hadImg:imgs.length};data.chat.push(um);msgs.insertAdjacentHTML('beforeend',msgHTML({role:'user',text:um.text,imgs:imgs}));
  msgs.insertAdjacentHTML('beforeend','<div class="msg ai" id="think"><span class="dots"><span></span><span></span><span></span></span></div>');msgs.scrollTop=msgs.scrollHeight;
  var out=null,failed=false;
  if(!DEMO){
    try{out=await ai('homework','Subject: '+subj+'\n'+(text||'Please solve what is in the photo(s).'),{images:imgs,links:links,history:data.chat.slice(-9,-1).map(function(m){return {role:m.role==='ai'?'assistant':'user',content:m.text}})})}
    catch(e){failed=true;out='Sorry, I could not get an answer. '+e.message}
  }
  if(out==null){out=tryMath(text);if(!out){
    var notes=[];if(imgs.length)notes.push('I can see you attached '+imgs.length+' photo(s), but reading photos needs the AI service.');if(links.length)notes.push('I cannot open links in demo mode.');
    out=(notes.length?notes.join(' ')+' Connect the AI service (see the README) to use photos and links. For now, type the problem as text.':'In demo mode I can only work through plain arithmetic like `12 × (3 + 4)`. Connect the AI service (see the README) to get full step-by-step help on any subject.')}}
  var am={role:'ai',text:out};if(!failed){data.chat.push(am);data.chat=data.chat.slice(-50);points(10)}else{data.chat.pop()}
  var t=$('#think');if(t)t.remove();msgs.insertAdjacentHTML('beforeend',msgHTML(am));msgs.scrollTop=msgs.scrollHeight;S.busy=false;
}

/* Flashcards */
function dueCards(d){return d.cards.filter(function(c){return c.due<=today()})}
V.flashcards=function(id){
  if(id&&id!=='new'){var d=data.decks.filter(function(x){return x.id===id})[0];if(!d)return go('flashcards');return deckView(d)}
  view(head('Flashcards','Paste notes and turn them into spaced-repetition cards.')
  +'<div class="card stack" style="margin-bottom:24px"><h3 class="h" style="margin:0">Create a deck from your notes</h3><input class="input" id="dt" placeholder="Deck title (e.g. Cell biology)" aria-label="Deck title"><textarea class="input" id="dtxt" placeholder="Paste your notes or a textbook passage here…" aria-label="Notes"></textarea><div class="row"><button class="btn primary" data-act="gencards">'+ic('brain',16)+'Generate flashcards</button><button class="btn" data-act="blankdeck">'+ic('plus',16)+'Empty deck</button></div></div>'
  +(data.decks.length?'<div class="cards">'+data.decks.map(function(d){return '<div class="card deck" data-act="opendeck" data-id="'+d.id+'" tabindex="0" role="link"><b>'+esc(d.title)+'</b><div class="muted" style="font-size:13px;margin:4px 0 12px">'+d.cards.length+' cards · '+dueCards(d).length+' due today</div><div class="prog"><i style="width:'+(d.cards.length?Math.round(100*d.cards.filter(function(c){return c.box>=3}).length/d.cards.length):0)+'%"></i></div></div>'}).join('')+'</div>':empty('No decks yet','Paste some notes above to make your first one.')));
};
function deckView(d){
  var q=S.study&&S.study.id===d.id?S.study:null;
  var due=dueCards(d);
  var studyHTML='';
  if(q&&q.queue.length){var c=q.queue[q.i];studyHTML='<div class="prog"><i style="width:'+Math.round(100*q.i/q.queue.length)+'%"></i></div><div class="flip '+(q.flip?'on':'')+'" data-act="flip" tabindex="0" role="button" aria-label="Flip card"><div class="in"><div class="face"><small>Question</small>'+esc(c.q)+'</div><div class="face back"><small>Answer</small>'+esc(c.a)+'</div></div></div>'
    +(q.flip?'<div class="row" style="justify-content:center"><button class="btn" data-act="rate" data-v="0">Again</button><button class="btn primary" data-act="rate" data-v="1">'+ic('check',16)+'Got it</button></div>':'<p class="muted" style="text-align:center">Tap the card (or press Space) to reveal the answer.</p>');}
  else if(q){studyHTML='<div class="card empty"><b>Session complete</b>Come back tomorrow for the cards that are due.</div>'}
  view('<p><button class="btn ghost sm" data-act="go" data-r="flashcards">'+ic('back',16)+'All decks</button></p><div class="pagehead" style="margin-top:14px"><h1>'+esc(d.title)+'</h1><p>'+d.cards.length+' cards · '+due.length+' due today</p></div>'
  +'<div class="row" style="margin-bottom:8px"><button class="btn primary" data-act="study" data-id="'+d.id+'" '+(due.length?'':'disabled')+'>'+(due.length?'Study '+due.length+' due':'Nothing due')+'</button><button class="btn" data-act="quizdeck" data-id="'+d.id+'">Quiz me on this deck</button><button class="btn ghost" data-act="deldeck" data-id="'+d.id+'">'+ic('trash',16)+'Delete deck</button></div>'
  +studyHTML+'<div class="card" style="margin-top:22px"><h3 class="h">Add a card</h3><div class="row"><input class="input" id="nq" placeholder="Question" style="flex:1;min-width:180px"><input class="input" id="na" placeholder="Answer" style="flex:1;min-width:180px"><button class="btn" data-act="addcard" data-id="'+d.id+'">'+ic('plus',16)+'Add</button></div></div>'
  +'<div class="card" style="margin-top:14px"><h3 class="h">All cards</h3>'+(d.cards.length?d.cards.map(function(c){return '<div class="list-item"><div><b style="font-weight:500">'+esc(c.q)+'</b><div class="muted" style="font-size:13px">'+esc(c.a)+'</div></div><button class="iconbtn" data-act="delcard" data-id="'+d.id+'" data-c="'+c.id+'" aria-label="Delete card">'+ic('trash',16)+'</button></div>'}).join(''):'<div class="muted">No cards yet.</div>')+'</div>');
}
function addDeck(title,cards){var d={id:uid(),title:title||'Untitled deck',cards:cards.map(function(c){return {id:uid(),q:c.q,a:c.a,box:0,due:today()}})};data.decks.unshift(d);save();return d}
async function makeCards(text){
  var out=await aiSafe('flashcards',text);
  if(out!=null){try{var a=parseJSON(out);if(a.length)return a}catch(e){toast('Could not read the AI response. Using demo mode.')}}
  return localCards(text);
}

/* Quizzes */
async function makeQuiz(text,n){
  var out=await aiSafe('quiz',text,{n:n});
  if(out!=null){try{var a=parseJSON(out);if(a.length)return a}catch(e){toast('Could not read the AI response. Using demo mode.')}}
  return localQuiz(text,n);
}
V.quizzes=function(){
  if(S.quiz)return quizView();
  view(head('Quizzes','Generate a quiz from your notes or a flashcard deck.')
  +'<div class="card stack" style="margin-bottom:24px"><h3 class="h" style="margin:0">New quiz</h3><input class="input" id="qt" placeholder="Topic (e.g. World War II)" aria-label="Topic"><textarea class="input" id="qtxt" placeholder="Paste a chapter or notes…" aria-label="Source text"></textarea><div class="row"><select class="input" id="qn" style="width:auto"><option>5</option><option>8</option><option>10</option></select><span class="muted">questions</span><button class="btn primary" data-act="genquiz">'+ic('quiz',16)+'Start quiz</button></div></div>'
  +'<div class="card"><h3 class="h">History</h3>'+(data.quizzes.length?data.quizzes.slice().reverse().slice(0,15).map(function(z){return '<div class="list-item"><div><b style="font-weight:500">'+esc(z.title)+'</b><div class="muted" style="font-size:13px">'+z.date+'</div></div><b>'+z.score+'/'+z.total+'</b></div>'}).join(''):'<div class="muted">No quizzes yet.</div>')+'</div>');
};
function quizView(){
  var z=S.quiz;
  if(z.i>=z.qs.length){
    var pct=Math.round(100*z.score/z.qs.length);
    view('<div class="card" style="text-align:center;padding:40px"><div class="score">'+z.score+'/'+z.qs.length+'</div><p class="muted" style="margin:6px 0 20px">'+(pct>=80?'Excellent work.':pct>=50?'Good effort. Review the ones you missed.':'Keep going. Try flashcards on this topic first.')+'</p><div class="row" style="justify-content:center"><button class="btn primary" data-act="quizdone">Done</button></div></div>');return;
  }
  var q=z.qs[z.i];
  view('<p class="muted">'+esc(z.title)+' · Question '+(z.i+1)+' of '+z.qs.length+'</p><div class="prog" style="margin:8px 0 20px"><i style="width:'+Math.round(100*z.i/z.qs.length)+'%"></i></div><div class="card"><h2 style="font-size:20px;font-weight:500">'+esc(q.q)+'</h2><div class="opts">'
  +q.options.map(function(o,i){var cls='';if(z.sel!=null){if(i===q.answer)cls='ok';else if(i===z.sel)cls='bad'}return '<button class="optq '+cls+'" data-act="pick" data-i="'+i+'" '+(z.sel!=null?'disabled':'')+'>'+esc(o)+'</button>'}).join('')+'</div>'
  +(z.sel!=null?'<p class="muted">'+esc(q.explain||'')+'</p><button class="btn primary" data-act="nextq" style="margin-top:12px">'+(z.i+1<z.qs.length?'Next question':'See results')+'</button>':'')+'</div>');
}
async function startQuiz(title,text,n){
  var qs=await makeQuiz(text,n);
  if(!qs.length){toast('Not enough text to build questions. Paste a longer passage.');return false}
  S.quiz={title:title,qs:qs,i:0,score:0,sel:null};return true;
}

/* Photo storage (IndexedDB, so photos do not fill up the small localStorage limit) */
var IDB={db:null,
  open:function(){return new Promise(function(res,rej){if(IDB.db)return res(IDB.db);var r=indexedDB.open('studyly',1);r.onupgradeneeded=function(){r.result.createObjectStore('img')};r.onsuccess=function(){IDB.db=r.result;res(r.result)};r.onerror=function(){rej(r.error)}})},
  tx:function(mode,fn){return IDB.open().then(function(db){return new Promise(function(res,rej){var t=db.transaction('img',mode),rq=fn(t.objectStore('img'));t.oncomplete=function(){res(rq&&rq.result)};t.onerror=function(){rej(t.error)}})})},
  put:function(k,v){return IDB.tx('readwrite',function(o){return o.put(v,k)})},
  get:function(k){return IDB.tx('readonly',function(o){return o.get(k)})},
  del:function(k){return IDB.tx('readwrite',function(o){return o.delete(k)})}
};
var Photos={
  put:function(id,url){if(!CLOUD)return IDB.put(user.email+':'+id,url);return fetch(url).then(function(r){return r.blob()}).then(function(b){return SB.storage.from('note-images').upload(user.id+'/'+id+'.jpg',b,{contentType:'image/jpeg',upsert:true})}).then(function(r){if(r.error)throw r.error})},
  get:function(id){if(!CLOUD)return IDB.get(user.email+':'+id);return SB.storage.from('note-images').download(user.id+'/'+id+'.jpg').then(function(r){return r.error?null:URL.createObjectURL(r.data)})},
  del:function(id){if(!CLOUD)return IDB.del(user.email+':'+id);return SB.storage.from('note-images').remove([user.id+'/'+id+'.jpg'])}
};
function zoom(src){var o=document.createElement('div');o.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);display:grid;place-items:center;z-index:100;padding:20px;cursor:zoom-out';o.innerHTML='<img src="'+src+'" alt="Note photo" style="max-width:100%;max-height:100%;border-radius:12px">';o.onclick=function(){o.remove()};document.body.appendChild(o)}
function renderNAttach(){var el=$('#nattach');if(el)el.innerHTML=S.nimgs.map(function(u,i){return '<span class="chip" style="margin:0 6px 6px 0"><img src="'+u+'" alt="" style="width:30px;height:30px;border-radius:6px;object-fit:cover">Photo '+(i+1)+'<button class="iconbtn" data-act="rmnimg" data-i="'+i+'" style="padding:2px" aria-label="Remove photo">'+ic('x',14)+'</button></span>'}).join('')}
async function addNoteImages(files){
  for(var k=0;k<files.length;k++){
    if(S.nimgs.length>=6){toast('You can attach up to 6 photos to a note.');break}
    try{S.nimgs.push(await resizeImage(files[k],1400,.8))}catch(x){toast('Could not read that image.')}
  }
  renderNAttach();
}
function hydrateThumbs(){
  document.querySelectorAll('[data-thumbs]').forEach(function(box){
    (box.dataset.thumbs||'').split(',').filter(Boolean).forEach(function(id){
      Photos.get(id).then(function(u){if(!u)return;var im=document.createElement('img');im.src=u;im.alt='Note photo';im.dataset.act='zoom';im.style.cssText='width:96px;height:96px;object-fit:cover;border-radius:10px;cursor:zoom-in;border:1px solid var(--line2)';box.appendChild(im)}).catch(function(){});
    });
  });
}

/* Notes */
V.notes=function(){
  S.nimgs=[];
  view(head('Notes','Turn long lectures, articles or photos of your notes into short, structured notes. Photos are saved with the note.')
  +'<div class="card stack" style="margin-bottom:24px"><input class="input" id="nt" placeholder="Title" aria-label="Title"><textarea class="input" id="ntxt" style="min-height:160px" placeholder="Type or paste your notes, or add photos of a page, slide or whiteboard…" aria-label="Note text"></textarea><div id="nattach"></div>'
  +'<div class="row"><label class="btn">'+ic('image',16)+'Add photos<input type="file" id="nfile" accept="image/*" multiple hidden></label><button class="btn primary" data-act="summarize">'+ic('notes',16)+'Summarise &amp; save</button><button class="btn" data-act="savenote">Save as is</button></div></div>'
  +(data.notes.length?data.notes.map(function(n){return '<div class="card" style="margin-bottom:14px"><div class="row spread"><b>'+esc(n.title)+'</b><span class="dim" style="font-size:12px">'+n.date+'</span></div><div style="margin:10px 0;font-size:15px">'+md(n.summary)+'</div>'+((n.imgIds&&n.imgIds.length)?'<div class="row" style="margin-bottom:12px" data-thumbs="'+n.imgIds.join(',')+'"></div>':'')+'<div class="row"><button class="btn sm" data-act="note2cards" data-id="'+n.id+'">Make flashcards</button><button class="btn sm" data-act="note2quiz" data-id="'+n.id+'">Make quiz</button><button class="btn ghost sm" data-act="delnote" data-id="'+n.id+'">'+ic('trash',14)+'Delete</button></div></div>'}).join(''):empty('No notes yet','Notes you save appear here.')));
  $('#ntxt').addEventListener('paste',function(e){var fs=[].filter.call((e.clipboardData&&e.clipboardData.files)||[],function(f){return /^image\//.test(f.type)});if(fs.length){e.preventDefault();addNoteImages(fs)}});
  hydrateThumbs();
};

/* Language */
V.language=function(){
  var L=data.lang;
  view(head('Language practice','Chat in the language you are learning. Your partner corrects you as you go.')
  +'<div class="card chatbox"><div class="msgs" id="lmsgs">'+(L.msgs.length?L.msgs.map(msgHTML).join(''):empty('Say hello','Write a sentence in '+esc(L.lang)+' to begin.'))+'</div>'
  +'<div class="composer"><select id="lang" aria-label="Language">'+Object.keys(PHRASES).map(function(l){return '<option '+(l===L.lang?'selected':'')+'>'+l+'</option>'}).join('')+'</select><textarea id="lq" rows="1" placeholder="Write in your target language…" aria-label="Message"></textarea><button class="btn primary" data-act="lsend">'+ic('send',16)+'Send</button></div></div>');
  var m=$('#lmsgs');m.scrollTop=m.scrollHeight;
};
async function lsend(){
  if(S.busy)return;var q=$('#lq'),t=q.value.trim();if(!t)return;S.busy=true;var L=data.lang;L.lang=$('#lang').value;q.value='';
  var m=$('#lmsgs');if(!L.msgs.length)m.innerHTML='';var um={role:'user',text:t};L.msgs.push(um);m.insertAdjacentHTML('beforeend',msgHTML(um));
  m.insertAdjacentHTML('beforeend','<div class="msg ai" id="think"><span class="dots"><span></span><span></span><span></span></span></div>');m.scrollTop=m.scrollHeight;
  var out=await aiSafe('language',t,{lang:L.lang,history:L.msgs.slice(-9,-1).map(function(x){return {role:x.role==='ai'?'assistant':'user',content:x.text}})});
  if(out==null){var p=PHRASES[L.lang];out='Demo mode: I cannot check grammar without the AI service (see the README). Try practising these phrases:\n'+p.map(function(x){return '- '+x}).join('\n')}
  var am={role:'ai',text:out};L.msgs.push(am);L.msgs=L.msgs.slice(-40);points(4);var th=$('#think');if(th)th.remove();m.insertAdjacentHTML('beforeend',msgHTML(am));m.scrollTop=m.scrollHeight;S.busy=false;
}

/* Essay */
V.essay=function(){
  view(head('Essay grader','Paste an essay to get a score and the top things to fix.')
  +'<div class="card stack" style="margin-bottom:24px"><textarea class="input" id="es" style="min-height:220px" placeholder="Paste your essay here…" aria-label="Essay"></textarea><div><button class="btn primary" data-act="grade">'+ic('pen',16)+'Grade my essay</button></div></div><div id="eres"></div>'
  +(data.essays.length?'<div class="card"><h3 class="h">Recent grades</h3>'+data.essays.slice().reverse().slice(0,6).map(function(e){return '<div class="list-item"><span>'+esc(e.snippet)+'…</span><b>'+e.score+'/100</b></div>'}).join('')+'</div>':''));
};
function essayHTML(r){return '<div class="card" style="margin-bottom:24px"><div class="grade"><div><div class="score">'+r.score+'</div><span class="muted">out of 100</span></div><div class="cards" style="flex:1;min-width:240px;grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">'+Object.keys(r.stats||{}).map(function(k){return '<div><b style="font-size:20px">'+esc(r.stats[k])+'</b><div class="muted" style="font-size:12px">'+esc(k)+'</div></div>'}).join('')+'</div></div><h3 class="h" style="margin-top:18px">What to improve</h3><ul style="padding-left:20px;display:grid;gap:6px">'+r.feedback.map(function(f){return '<li>'+esc(f)+'</li>'}).join('')+'</ul>'+(r.demo?'<p class="dim" style="font-size:12px;margin-top:12px">Demo grading looks at length, structure and word variety only. Connect the AI service for feedback on argument and content.</p>':'')+'</div>'}
async function grade(){
  var t=$('#es').value.trim();if(t.split(/\s+/).length<30){toast('Paste at least 30 words to grade.');return}
  var r=null,out=await aiSafe('essay',t);
  if(out!=null){try{r=parseJSON(out)}catch(e){toast('Could not read the AI response. Using demo grading.')}}
  if(!r)r=localEssay(t);
  data.essays.push({score:r.score,snippet:t.slice(0,50),date:today()});points(10);$('#eres').innerHTML=essayHTML(r);
}

/* Planner */
V.planner=function(){
  var p=data.plan;
  if(!p){view(head('Study planner','Tell us your exam date and we will build a daily schedule.')
    +'<div class="card stack"><label class="f">Exam or goal<input class="input" id="pn" placeholder="Biology final"></label><label class="f">Exam date<input class="input" type="date" id="pd" min="'+today()+'"></label><label class="f">Subjects or topics (comma separated)<input class="input" id="ps" placeholder="Cells, Genetics, Ecology"></label><label class="f">Hours you can study per day<input class="input" type="number" id="ph" min="0.5" max="12" step="0.5" value="2"></label><div><button class="btn primary" data-act="mkplan">'+ic('calendar',16)+'Build my plan</button></div></div>');return}
  var done=p.days.filter(function(d){return d.done}).length;
  view(head(esc(p.name),'Exam on '+p.exam+' · '+p.days.length+' study days')+'<div class="card" style="margin-bottom:18px"><div class="row spread"><b>'+done+' of '+p.days.length+' sessions done</b><button class="btn ghost sm" data-act="resetplan">Start a new plan</button></div><div class="prog" style="margin-top:12px"><i style="width:'+Math.round(100*done/p.days.length)+'%"></i></div></div>'
  +'<div class="card">'+p.days.map(function(d){return '<label class="day '+(d.done?'done':'')+'"><input type="checkbox" data-act="tick" data-id="'+d.id+'" '+(d.done?'checked':'')+'><span>'+esc(d.task)+'</span><span class="dim" style="font-size:13px">'+d.date+(d.date===today()?' · today':'')+' · '+d.hours+'h</span></label>'}).join('')+'</div>');
};
function buildPlan(name,exam,subs,hours){
  var start=today(),n=Math.max(1,Math.min(90,Math.round((new Date(exam+'T12:00:00')-new Date(start+'T12:00:00'))/864e5))),days=[];
  for(var i=0;i<n;i++){var left=n-i,s=subs[i%subs.length],task=left<=1?'Light review of all topics and rest well':left<=2?'Practice quiz on '+s+' and weak spots':(i%7===6?'Weekly review: quiz on everything so far':'Study '+s);days.push({id:uid(),date:addDays(start,i),task:task,hours:hours,done:false})}
  return {name:name||'Study plan',exam:exam,days:days};
}

/* Progress */
V.progress=function(){
  var days=[];for(var i=6;i>=0;i--){var d=addDays(today(),-i);days.push({d:d,v:Math.min(100,data.log[d]||0)})}
  var W=400,H=200,x=function(i){return 30+i*(360/6)},y=function(v){return 180-v*1.6};
  var pts=days.map(function(o,i){return x(i)+' '+y(o.v)}),line='M'+pts.join(' L'),area=line+' L'+x(6)+' 180 L'+x(0)+' 180Z';
  var lab=days.map(function(o,i){return '<text x="'+x(i)+'" y="196" text-anchor="middle">'+new Date(o.d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'})+'</text>'}).join('');
  var grid=[0,25,50,75,100].map(function(v){return '<path d="M30 '+y(v)+'H390" stroke="#23233a"/><text x="24" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>'}).join('');
  var topics={};data.quizzes.forEach(function(z){var t=topics[z.title]||(topics[z.title]={s:0,t:0});t.s+=z.score;t.t+=z.total});
  var tk=Object.keys(topics);
  var wk=data.quizzes.filter(function(z){return z.date>=addDays(today(),-6)}).length,g=Math.max(1,data.goal);
  view(head('Progress','How your study time is adding up.')
  +'<div class="card" style="margin-bottom:18px"><div class="row spread"><div><b>Study efficiency</b><div class="dim" style="font-size:13px">Daily activity score, last 7 days</div></div></div><svg viewBox="0 0 400 210" width="100%" role="img" aria-label="Daily activity chart"><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6366f1" stop-opacity=".7"/><stop offset="1" stop-color="#6366f1" stop-opacity=".1"/></linearGradient></defs><g fill="#6c6c8c" font-size="10">'+grid+lab+'</g><path d="'+area+'" fill="url(#pg)"/><path d="'+line+'" fill="none" stroke="#818cf8" stroke-width="2.5" stroke-linejoin="round"/></svg></div>'
  +'<div class="cards"><div class="card"><h3 class="h">Cognitive analysis</h3>'+(tk.length?'<div class="bars">'+tk.map(function(k){var p=Math.round(100*topics[k].s/topics[k].t);return '<div><div class="lab"><span>'+esc(k)+'</span><span>'+p+'%</span></div><div class="prog"><i style="width:'+p+'%;'+(p<60?'background:var(--amber)':'')+'"></i></div></div>'}).join('')+'</div><p class="muted" style="font-size:13px;margin-top:12px">Review topics under 60% first.</p>':'<div class="muted">Take a quiz to see accuracy by topic.</div>')+'</div>'
  +'<div class="card"><h3 class="h">Goal tracking</h3><p class="muted" style="font-size:14px">Weekly quiz goal</p><div class="row" style="margin:8px 0 14px"><input class="input" type="number" min="1" max="30" value="'+data.goal+'" id="goal" style="width:90px" aria-label="Weekly quiz goal"><span class="muted">quizzes per week</span></div><div class="lab row spread" style="font-size:13px"><span>'+wk+' of '+g+' this week</span><span>'+Math.min(100,Math.round(100*wk/g))+'%</span></div><div class="prog"><i style="width:'+Math.min(100,Math.round(100*wk/g))+'%"></i></div></div></div>');
};

/* Settings */
V.settings=function(){
  view(head('Settings','Manage your account and install the app.')
  +'<div class="stack"><div class="card stack"><h3 class="h" style="margin:0">Profile</h3><label class="f">Name<input class="input" id="sn" value="'+esc(user.name)+'"></label><label class="f">Email<input class="input" value="'+esc(user.email)+'" disabled></label><div><button class="btn" data-act="savename">Save name</button></div></div>'
  +'<div class="card stack"><h3 class="h" style="margin:0">Install</h3><p class="muted" style="font-size:14px">Add a shortcut to this web app on your device.</p><div class="row">'+(C.INSTALLER_URL&&Sh.platform()==='win'?'<button class="btn primary" data-act="exe">'+ic('download',16)+'Windows installer</button>':'')+'<button class="btn" data-act="shortcut">'+ic('download',16)+'Web shortcut</button><button class="btn" data-act="install" id="inst" '+(Sh.canInstall()?'':'style="display:none"')+'>Install as app</button></div></div>'
  +'<div class="card"><h3 class="h">Plans</h3><p class="muted" style="font-size:14px"><b style="color:var(--text)">Free:</b> everything is unlocked for now.<br><b style="color:var(--text)">Plus:</b> in progress, coming soon.</p></div>'
  +'<div class="card stack"><h3 class="h" style="margin:0">Your data</h3><p class="muted" style="font-size:14px">'+(CLOUD?'Your study data and note photos are saved securely in your account and sync across your devices.':'Your account and study data are stored in this browser only. Export a backup (text data only, photos are not included) before clearing browser data.')+'</p><div class="row"><button class="btn" data-act="export">Export backup</button><button class="btn ghost" data-act="delacct" style="color:#fca5a5">Delete account</button></div></div></div>');
};

/* ---------------- events ---------------- */
async function onClick(e){
  var el=e.target.closest('[data-act]');if(!el||el.tagName==='INPUT')return;var a=el.dataset.act,id=el.dataset.id;
  switch(a){
  case 'go':return go(el.dataset.r);
  case 'shortcut':Sh.download();return toast('Shortcut downloaded. Drag it to your desktop or dock.');
  case 'install':Sh.install();return;
  case 'exe':Sh.exe();return toast('Installer download started.');
  case 'ask':return ask();
  case 'clearchat':data.chat=[];save();return V.homework();
  case 'gencards':{var t=$('#dtxt').value.trim(),title=$('#dt').value.trim();if(t.length<40)return toast('Paste at least a few sentences.');el.disabled=true;var cs=await makeCards(t);el.disabled=false;if(!cs.length)return toast('No cards could be made from that text. Try a longer passage.');var d=addDeck(title||t.slice(0,30),cs);points(8);return go('flashcards/'+d.id)}
  case 'blankdeck':{var d2=addDeck($('#dt').value.trim()||'New deck',[]);return go('flashcards/'+d2.id)}
  case 'opendeck':return go('flashcards/'+id);
  case 'deldeck':if(confirm('Delete this deck?')){data.decks=data.decks.filter(function(d){return d.id!==id});S.study=null;save();go('flashcards')}return;
  case 'addcard':{var q=$('#nq').value.trim(),an=$('#na').value.trim();if(!q||!an)return toast('Enter a question and an answer.');var dk=data.decks.filter(function(d){return d.id===id})[0];dk.cards.push({id:uid(),q:q,a:an,box:0,due:today()});save();return deckView(dk)}
  case 'delcard':{var dk2=data.decks.filter(function(d){return d.id===id})[0];dk2.cards=dk2.cards.filter(function(c){return c.id!==el.dataset.c});save();return deckView(dk2)}
  case 'study':{var dk3=data.decks.filter(function(d){return d.id===id})[0];S.study={id:id,queue:dueCards(dk3),i:0,flip:false};return deckView(dk3)}
  case 'flip':{S.study.flip=!S.study.flip;return deckView(data.decks.filter(function(d){return d.id===S.study.id})[0])}
  case 'rate':{var st=S.study,dk4=data.decks.filter(function(d){return d.id===st.id})[0],c=st.queue[st.i],real=dk4.cards.filter(function(x){return x.id===c.id})[0];
    if(real){if(el.dataset.v==='1'){real.box=Math.min(5,real.box+1);real.due=addDays(today(),Math.pow(2,real.box)-1||1)}else{real.box=0;real.due=today()}}
    st.i++;st.flip=false;points(3);save();if(st.i>=st.queue.length){st.queue=[]}return deckView(dk4)}
  case 'quizdeck':{var dk5=data.decks.filter(function(d){return d.id===id})[0];if(dk5.cards.length<2)return toast('Add at least 2 cards first.');var qs=dk5.cards.map(function(c){var o=dk5.cards.filter(function(x){return x.id!==c.id}).map(function(x){return x.a}).sort(function(){return Math.random()-.5}).slice(0,3).concat([c.a]).sort(function(){return Math.random()-.5});return {q:c.q,options:o,answer:o.indexOf(c.a),explain:'Correct answer: '+c.a}}).slice(0,10);S.quiz={title:dk5.title,qs:qs,i:0,score:0,sel:null};return go('quizzes')}
  case 'genquiz':{var tx=$('#qtxt').value.trim();if(tx.length<60)return toast('Paste a longer passage to build a quiz from.');el.disabled=true;var ok=await startQuiz($('#qt').value.trim()||tx.slice(0,30),tx,+$('#qn').value);el.disabled=false;if(ok)V.quizzes();return}
  case 'pick':{var z=S.quiz;if(z.sel!=null)return;z.sel=+el.dataset.i;if(z.sel===z.qs[z.i].answer)z.score++;return quizView()}
  case 'nextq':S.quiz.i++;S.quiz.sel=null;return quizView();
  case 'quizdone':{var zz=S.quiz;data.quizzes.push({title:zz.title,score:zz.score,total:zz.qs.length,date:today()});points(20);S.quiz=null;save();return V.quizzes()}
  case 'summarize':case 'savenote':{
    var nt=$('#ntxt').value.trim(),nim=S.nimgs.slice();
    if(!nt&&!nim.length)return toast('Type or paste some text, or add a photo.');
    if(a==='summarize'&&nt.length<80&&!nim.length)return toast('Paste a longer text to summarise, or add a photo.');
    el.disabled=true;var summary,text=nt;
    if(a==='summarize'){
      var out=await aiSafe('notes',nt||'Read the attached photo(s) and write the notes.',{images:nim});
      if(out==null)out=nt.length>=80?localSummary(nt):(nim.length?'Photos saved. Connect the AI service to have them read and summarised.':nt);
      summary=out;if(nim.length&&!DEMO)text=(nt+'\n'+out.replace(/\*\*/g,'')).trim();
    }else{summary=nt||'Photo note'}
    var ids=[];
    try{for(var k=0;k<nim.length;k++){var pid=uid();await Photos.put(pid,nim[k]);ids.push(pid)}}
    catch(x){toast('Could not save the photos in this browser. The note was saved without them.')}
    data.notes.unshift({id:uid(),title:$('#nt').value.trim()||(nt||'Photo note').slice(0,30),summary:summary,text:text,date:today(),imgIds:ids});points(8);save();el.disabled=false;return V.notes()}
  case 'zoom':return zoom(el.src);
  case 'rmnimg':S.nimgs.splice(+el.dataset.i,1);return renderNAttach();
  case 'delnote':{var dn=data.notes.filter(function(n){return n.id===id})[0];(dn&&dn.imgIds||[]).forEach(function(k){Photos.del(k).catch(function(){})});data.notes=data.notes.filter(function(n){return n.id!==id});save();return V.notes()}
  case 'note2cards':{var n1=data.notes.filter(function(n){return n.id===id})[0];el.disabled=true;var cs2=await makeCards(n1.text||n1.summary);el.disabled=false;if(!cs2.length)return toast('No cards could be made from this note.');var d3=addDeck(n1.title,cs2);return go('flashcards/'+d3.id)}
  case 'note2quiz':{var n2=data.notes.filter(function(n){return n.id===id})[0];el.disabled=true;var ok2=await startQuiz(n2.title,n2.text||n2.summary,5);el.disabled=false;if(ok2)go('quizzes');return}
  case 'lsend':return lsend();
  case 'grade':el.disabled=true;await grade();el.disabled=false;return;
  case 'mkplan':{var ex=$('#pd').value,sb=$('#ps').value.split(',').map(function(s){return s.trim()}).filter(Boolean),hr=+$('#ph').value||2;if(!ex)return toast('Pick an exam date.');if(ex<=today())return toast('Pick a date after today.');if(!sb.length)return toast('Add at least one subject.');data.plan=buildPlan($('#pn').value.trim(),ex,sb,hr);save();return V.planner()}
  case 'resetplan':if(confirm('Replace your current plan?')){data.plan=null;save();V.planner()}return;
  case 'savename':{var nm=$('#sn').value.trim();if(!nm)return toast('Enter a name.');if(CLOUD){var ur=await SB.auth.updateUser({data:{name:nm}});if(ur.error)return toast(ur.error.message);user.name=nm;toast('Name saved.');return enter()}var us=LS.get('sy_users',{});us[user.email].name=nm;LS.set('sy_users',us);user.name=nm;toast('Name saved.');return enter()}
  case 'export':{var b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),l=document.createElement('a');l.href=URL.createObjectURL(b);l.download='studyly-backup.json';l.click();return}
  case 'delacct':if(confirm('Delete your account data and notes photos? This cannot be undone.')){
    await Promise.all(data.notes.reduce(function(a,n){return a.concat((n.imgIds||[]).map(function(k){return Promise.resolve(Photos.del(k)).catch(function(){})}))},[]));
    if(CLOUD){await SB.from('user_data').delete().eq('user_id',user.id);LS.del('sy_cache_'+user.id);toast('Your study data was deleted.');return logout()}
    var us2=LS.get('sy_users',{});delete us2[user.email];LS.set('sy_users',us2);LS.del('sy_data_'+user.email);logout()}return;
  }
}
async function onChange(e){
  var t=e.target;
  if(t.id==='file'&&t.files.length){await addImages([].slice.call(t.files));t.value=''}
  if(t.id==='nfile'&&t.files.length){await addNoteImages([].slice.call(t.files));t.value=''}
  if(t.dataset.act==='tick'){var dd=data.plan.days.filter(function(d){return d.id===t.dataset.id})[0];dd.done=t.checked;if(t.checked)points(10);save();V.planner()}
  if(t.id==='goal'){data.goal=Math.max(1,Math.min(30,+t.value||1));save();V.progress()}
  if(t.id==='lang'){data.lang.lang=t.value;save()}
}
function onKey(e){
  if(e.target.id==='q'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}
  if(e.target.id==='lq'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();lsend()}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-act="flip"],[data-act="go"],[data-act="opendeck"]')){e.preventDefault();e.target.click()}
}
document.addEventListener('click',function(e){var r=e.target.closest('[data-act="rmimg"]');if(r){S.imgs.splice(+r.dataset.i,1);renderAttach()}});

/* ---------------- boot ---------------- */
document.addEventListener('DOMContentLoaded',function(){});
(async function boot(){
  var mode=(new URLSearchParams(location.search).get('mode')==='signup')?'signup':'login';
  if(CLOUD){
    try{var ss=await SB.auth.getSession();if(ss.data.session){await loadCloud(ss.data.session.user);return enter()}}catch(e){toast(e.message)}
    return renderAuth(mode);
  }
  var s=LS.get('sy_session',null);
  if(s&&LS.get('sy_users',{})[s]){loadUser(s);enter()}else renderAuth(mode);
})();
})();
