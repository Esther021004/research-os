// Project workflows, calendar and source-grounded paper reading.
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readLocal = (key, fallback) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}};
function writeLocal(key, value) {localStorage.setItem(key, JSON.stringify(value))}
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const projectLabel = id => projects.find(p=>p.id===id)?.name || '미분류';
const projectId = name => projects.find(p=>p.id===name||p.name===name||p.aliases?.includes(name))?.id || (/합성|Synthetic Survey/.test(name)?'synthetic':/Silicon/.test(name)?'silicon':/방법론|Methods|개인/.test(name)?'methods':'none');
let activeProject = 'synthetic', selectedPaper = null, paperFilter = '전체';
let workflows = readLocal('research-workflows-v1', {});
const defaultFlows = {
  synthetic: '설문 데이터 수집 → 전처리 → LLM Fine-tuning → 합성 응답 생성 → 분포 및 조건부 일관성 평가',
  silicon: '연구 질문 설정 → Persona 설계 → 에이전트 표본 추출 → 반복 실행 → 인간 표본과 비교',
  methods: '연구 주제 선정 → 관련 논문 수집 → 핵심 가정 정리 → 방법론 비교 → 리딩 그룹 토론'
};
const toast = document.createElement('div');toast.className='app-toast';toast.setAttribute('role','status');document.body.append(toast);
let toastTimer;
function notifyUser(message){toast.textContent=message;toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('visible'),6000)}
async function api(path, options={}){
  if(options.method&&options.method!=='GET')options={...options,headers:{...options.headers,'X-Research-OS':'1',...(window.researchAuthCsrf?{'X-Research-CSRF':window.researchAuthCsrf}:{})}};
  let response;
  try{response=await fetch(path,options)}catch{throw new Error('저장 서버에 연결할 수 없습니다. server.py를 실행해 주세요.')}
  let result;try{result=await response.json()}catch{throw new Error('현재 미리보기에는 저장 서버가 없습니다. server.py로 실행해 주세요.')}
  if(!response.ok){const error=new Error(result.error || '요청에 실패했습니다.');error.existing_id=result.existing_id;throw error}return result;
}
const post = (path, body) => api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function cachePapers(){try{writeLocal('research-papers-v2',papers);return true}catch{notifyUser('브라우저 저장 공간이 부족합니다. 서버 연결을 확인하고 JSON으로 기록을 내보내세요.');return false}}
let syncQueue=Promise.resolve();
function storePaper(p){
  if(p._deleted)return Promise.resolve();
  p._pending=true;p._revision=(p._revision||0)+1;const revision=p._revision;
  const localSaved=cachePapers();
  const snapshot=JSON.parse(JSON.stringify(p,(key,value)=>key.startsWith('_')?undefined:value));
  syncQueue=syncQueue.catch(()=>{}).then(()=>post('/api/papers',snapshot)).then(result=>{if(p._revision===revision){p._pending=false;cachePapers()}return result}).catch(error=>{error.localSaved=localSaved;throw error});
  return syncQueue;
}
papers=papers.map((p,i)=>({...p,id:`sample-${i}`,sample:true,reading:{}}));
const cached=readLocal('research-papers-v2',null);if(Array.isArray(cached))papers=cached;
papers=papers.filter(p=>!readLocal('research-deleted-papers-v1',[]).includes(p.id));

renderProjects=function(){
  const cards=projects.map(p=>`<button class="project-card project-${p.theme}" data-project="${p.id}"><div class="top"><span class="symbol">${p.symbol}</span><span class="status">${p.status}</span></div><h3>${p.name}</h3><p>${p.desc}</p><div class="card-bottom"><div class="progress-label"><span>진행률</span><b>${p.progress}%</b></div>${progress(p.progress)}<div class="next">다음 · <b>${p.next}</b></div></div></button>`).join('');
  $('#project-cards').innerHTML=cards;$('#all-project-cards').innerHTML=cards;
  $$('.project-card').forEach(card=>card.onclick=()=>openProject(card.dataset.project));
};
function parseWorkflow(text){
  const clean=text.replace(/^\s*(?:[-*•]|\d+[.)])\s*/gm,'');
  const lines=clean.split(/\r?\n|→|->|⇒|;|\.(?:\s|$)/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length)throw new Error('연구 단계를 입력해 주세요.');
  if(lines.length>20)throw new Error('연구 단계는 20개 이하로 입력해 주세요.');
  return lines.map((line,i)=>({id:`step-${i}`,label:line,done:false}));
}
function openProject(id){activeProject=id;renderProjectDetail();navigate('project-detail')}
function renderProjectDetail(){
  const p=projects.find(p=>p.id===activeProject), w=workflows[p.id] || {text:defaultFlows[p.id],nodes:parseWorkflow(defaultFlows[p.id])};
  $('#project-detail').dataset.project=p.id;
  $('#project-detail').innerHTML=`<button class="back text-button" data-page="projects">← 프로젝트로 돌아가기</button>
    <div class="project-header"><div><p class="eyebrow">RESEARCH PROJECT</p><h1>${p.name}</h1><p class="lede">${p.desc}</p></div><div class="progress-statement"><b>${p.progress}%</b><span>프로젝트 진행률</span>${progress(p.progress)}</div></div>
    <section class="panel workflow-editor"><p class="eyebrow">RESEARCH WORKFLOW</p><h2>연구 흐름을 그려보세요</h2><p class="muted">한 줄에 한 단계씩 또는 →로 연결해 입력하세요. 문장은 마침표로 구분할 수 있습니다.</p>
    <form id="workflow-form"><label for="workflow-text">${p.name}의 연구 단계</label><textarea id="workflow-text" rows="4" required maxlength="6000">${escapeHTML(w.text)}</textarea><div class="action-row"><button class="button primary">모식도 생성·저장</button><span class="muted">입력한 순서대로 생성 · API 불필요 · 이 브라우저에 저장</span></div></form>
    <div id="workflow" class="workflow generated-workflow"></div><p class="muted" id="workflow-note">단계를 누르면 완료 상태가 바뀝니다. 텍스트를 다시 생성하면 단계 체크는 초기화됩니다.</p></section>
    <div class="dashboard-grid"><section class="panel"><p class="eyebrow">PROJECT TASKS</p><h2>연결된 할 일</h2><div id="project-tasks"></div></section><section class="panel"><p class="eyebrow">CONNECTED PAPERS</p><h2>연결된 논문</h2><div id="project-paper-links"></div></section></div>`;
  $('#project-detail [data-page]').onclick=()=>navigate('projects');
  function draw(){
    $('#workflow').innerHTML=w.nodes.map((n,i)=>`${i?'<span class="flow-arrow" aria-hidden="true">→</span>':''}<button class="flow-node ${n.done?'done':''}" data-step="${i}" aria-pressed="${n.done}"><span>${String(i+1).padStart(2,'0')} ${n.done?'✓':''}</span>${escapeHTML(n.label)}</button>`).join('');
    $$('#workflow [data-step]').forEach(b=>b.onclick=()=>{w.nodes[b.dataset.step].done=!w.nodes[b.dataset.step].done;workflows[p.id]=w;writeLocal('research-workflows-v1',workflows);draw()});
  }draw();
  $('#workflow-form').onsubmit=e=>{e.preventDefault();try{const text=$('#workflow-text').value;workflows[p.id]={text,nodes:parseWorkflow(text)};writeLocal('research-workflows-v1',workflows);renderProjectDetail();notifyUser('이 프로젝트의 Workflow를 저장했습니다.')}catch(error){notifyUser(error.message)}};
  const relevant=tasks.filter(t=>projectId(t.project)===p.id);
  $('#project-tasks').innerHTML=relevant.map(t=>taskRow(t,tasks.indexOf(t))).join('')||'<p class="muted">연결된 할 일이 없습니다.</p>';
  $$('#project-tasks input').forEach(c=>c.onchange=()=>{tasks[c.dataset.task].done=c.checked;persistTasks();renderKanban()});
  const related=papers.filter(x=>projectId(x.project)===p.id);
  $('#project-paper-links').innerHTML=related.map(x=>`<button class="paper-link" data-paper-id="${escapeHTML(x.id)}">${escapeHTML(x.title)} <small>${escapeHTML(x.status)} · ${x.progress}%</small></button>`).join('')||'<p class="muted">연결된 논문이 없습니다.</p>';
  $$('#project-paper-links button').forEach(b=>b.onclick=()=>openPaper(b.dataset.paperId));
}

renderPapers=function(){
  const filtered=papers.filter(p=>paperFilter==='전체'||p.status===paperFilter);
  $('#paper-rows').innerHTML=filtered.map(p=>`<div class="paper-row"><button class="paper-title paper-open" data-id="${escapeHTML(p.id)}">${escapeHTML(p.title)}<small>${escapeHTML(p.authors)}${p.sample?' · 예시 데이터':''}</small></button><div class="paper-project">${escapeHTML(p.project)}</div><div><span class="tag">${escapeHTML(p.status)}</span></div><div class="table-progress">${progress(p.progress)}<small>${p.progress}%</small></div></div>`).join('')||'<p class="muted empty">이 상태의 논문이 없습니다.</p>';
  $$('.paper-open').forEach(b=>b.onclick=()=>openPaper(b.dataset.id));
  const names=['전체','읽을 논문','읽는 중','완독'];
  $$('.filter-tabs button').forEach((b,i)=>{b.innerHTML=`${names[i]} <b>${i?papers.filter(p=>p.status===names[i]).length:papers.length}</b>`;b.classList.toggle('active',paperFilter===names[i]);b.onclick=()=>{paperFilter=names[i];renderPapers()}});
  $('.nav-link[data-page="papers"] b').textContent=papers.length;
};
renderReading=function(){
  $('#reading-list').innerHTML=papers.filter(p=>p.status==='읽는 중').map(p=>`<button class="paper-reading paper-link" data-id="${escapeHTML(p.id)}"><strong>${escapeHTML(p.title)}</strong><p>${escapeHTML(p.section)}</p><div class="reading-progress">${progress(p.progress)}<span>${p.progress}%</span></div></button>`).join('')||'<p class="muted">목차에서 읽은 항목을 체크하면 여기에 표시됩니다.</p>';
  $$('#reading-list button').forEach(b=>b.onclick=()=>openPaper(b.dataset.id));
};
function openPaper(id){const p=papers.find(p=>p.id===id);if(p){renderPaperDetail(p);navigate('paper-detail')}}
const sectionKey=s=>s.id||s.title.trim();
function readingProgress(p){
  const sections=p.analysis?.sections||[];
  if(!sections.length)return;
  const count=sections.filter(s=>p.reading?.[sectionKey(s)]).length;
  p.progress=Math.round(count/sections.length*100);p.status=count===sections.length?'완독':count?'읽는 중':'읽을 논문';
  p.section=count===sections.length?'완독':sections.find(s=>!p.reading?.[sectionKey(s)]).title;
}
renderPaperDetail=function(p){
  selectedPaper=p;p.reading=p.reading||{};const a=p.analysis;
  $('#paper-detail').innerHTML=`<button class="back text-button" id="back-papers">← 논문 라이브러리로 돌아가기</button>
    <div class="paper-detail-header"><div><p class="eyebrow">PAPER WORKSPACE ${p.sample?'· 예시 논문':''}</p><h1>${escapeHTML(p.title)}</h1><p class="lede">${escapeHTML(p.authors)} · ${escapeHTML(p.project)}</p></div><span class="tag">${a?'분석 결과 있음':'분석 전'}</span></div>
    <section class="panel source-editor"><p class="eyebrow">SOURCE → FRAMEWORK & CONTENTS</p><h2>원문에서 구조를 추출하기</h2><p class="muted">PDF를 연결하거나 목차를 포함한 본문을 붙여넣으세요. 분석 버튼을 누르면 텍스트가 OpenAI로 전송됩니다. 제목·링크만으로 목차를 추측하지 않습니다.</p>
    <label for="paper-source">논문 본문 / 발췌문</label><textarea id="paper-source" rows="5" maxlength="100000" placeholder="목차와 Method, Experiments 등의 본문을 붙여넣으세요.">${escapeHTML(p.source_text||'')}</textarea>
    <div class="action-row"><button class="button primary" id="generate-paper">✦ AI 분석·모식도·목차 생성</button><button class="button secondary" id="attach-paper-pdf">PDF 연결</button><button class="button secondary" id="save-source">본문 저장</button><input type="file" id="detail-pdf" accept="application/pdf" hidden></div><p class="muted" id="paper-operation" role="status">${p.file_path?'연결된 PDF: '+escapeHTML(p.source):'PDF 최대 20MB · 원문 앞 50,000자까지 분석 · 상단 AI 연결에서 ChatGPT 로그인'}</p></section>
    <div class="paper-detail-grid"><section class="panel framework-panel"><p class="eyebrow">PAPER FRAMEWORK</p><h2>논문 프레임워크</h2><p class="framework-description">${escapeHTML(a?.summary||'분석 버튼을 누르면 원문에 근거한 모식도가 생성됩니다.')}</p><div class="paper-framework">${(a?.framework||[]).map((n,i)=>`${i?'<span class="framework-arrow">→</span>':''}<div class="framework-node ${['input','method','output'].includes(n.kind)?n.kind:'method'}"><small>${escapeHTML(n.label)}</small><b>${escapeHTML(n.detail)}</b></div>`).join('')}</div><p class="muted">${escapeHTML(a?.note||'아직 생성된 분석이 없습니다.')}</p></section>
    <section class="panel"><p class="eyebrow">READING PROGRESS</p><h2>목차 · 읽기 체크</h2><div id="reading-summary"></div><div id="paper-sections" class="section-map"></div><p class="muted">진행률은 추출된 목차 항목 중 읽은 항목의 비율입니다.</p></section></div>`;
  $('#back-papers').onclick=()=>navigate('papers');
  $('#save-source').onclick=async()=>{p.source_text=$('#paper-source').value;try{await storePaper(p);$('#paper-operation').textContent='본문을 서버에 저장했습니다.'}catch(error){$('#paper-operation').textContent='이 브라우저에 저장했습니다. '+error.message}};
  $('#attach-paper-pdf').onclick=()=>$('#detail-pdf').click();
  $('#detail-pdf').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(p.file_path&&p.annotations?.length){notifyUser('메모 위치 보호를 위해 PDF 교체는 제한됩니다. 다른 PDF는 새 논문으로 등록해 주세요.');e.target.value='';return}try{const data=await uploadPDF(file);Object.assign(p,{file_path:data.file_path,source:data.source,source_text:data.source_text,last_page:1});await storePaper(p);renderPaperDetail(p);$('#paper-operation').textContent='PDF가 연결되었습니다. 분석 버튼을 눌러주세요. 연결된 PDF가 분석에 우선 사용됩니다.'}catch(error){notifyUser(error.message)}};
  $('#generate-paper').onclick=async()=>{
    if(window.ensureResearchAI&&!await window.ensureResearchAI())return;
    const button=$('#generate-paper');p.source_text=$('#paper-source').value;
    if(!p.file_path&&p.source_text.trim().length<100){$('#paper-operation').textContent='PDF 또는 100자 이상의 본문이 필요합니다.';return}
    button.disabled=true;button.textContent='분석 중…';$('#paper-operation').textContent='본문에 근거한 목차와 프레임워크를 생성하고 있습니다.';
    try{
      const analysis=await post('/api/analyze',{source:p.source_text,file_path:p.file_path||undefined,hint:p.title,require_content:true});
      if(p.analysis){p.analysisCandidate=analysis;notifyUser('새 분석을 보관했습니다. 기존 편집·읽기 기록은 유지됩니다. 새 분석 적용 버튼으로 교체할 수 있습니다.')}else p.analysis=analysis;
      p.title=analysis.title||p.title;p.authors=analysis.authors||p.authors;p.project=analysis.project;readingProgress(p);cachePapers();
      let message='분석과 저장이 완료되었습니다.';try{await storePaper(p)}catch(error){message='분석 완료 · 브라우저에 저장됨. '+error.message}
      renderPapers();renderReading();if(selectedPaper===p){renderPaperDetail(p);$('#paper-operation').textContent=message}
    }catch(error){if(selectedPaper===p)$('#paper-operation').textContent=error.message}
    finally{button.disabled=false;button.textContent='✦ AI 분석·모식도·목차 생성'}
  };
  drawSections(p);
};
function drawSections(p){
  const list=p.analysis?.sections||[];
  $('#reading-summary').innerHTML=`<p>${p.progress}% · ${escapeHTML(p.status)}</p>${progress(p.progress)}`;
  $('#paper-sections').innerHTML=list.map((s,i)=>`<label class="reading-section ${s.level===2?'nested':''}"><input type="checkbox" data-section="${i}" ${p.reading[sectionKey(s)]?'checked':''}><span>${escapeHTML(s.title)}${s.page>0?`<small>p. ${s.page}</small>`:''}</span></label>`).join('')||'<p class="muted">원문을 분석하면 실제 목차가 표시됩니다. 발췌문에 목차가 없으면 항목이 비어 있을 수 있습니다.</p>';
  $$('#paper-sections input').forEach(c=>c.onchange=()=>{p.reading[sectionKey(list[c.dataset.section])]=c.checked;readingProgress(p);cachePapers();renderPapers();renderReading();drawSections(p);storePaper(p).then(()=>{if(selectedPaper===p)$('#paper-operation').textContent='읽기 진행률을 저장했습니다.'}).catch(()=>{if(selectedPaper===p)$('#paper-operation').textContent='읽기 진행률을 이 브라우저에 저장했습니다. 서버 연결 시 동기화됩니다.'})});
}

async function uploadPDF(file){
  if(file.size>20*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))throw new Error('20MB 이하 PDF를 선택해 주세요.');
  return api(`/api/upload?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});
}
function paperFeedback(message,p){const el=$('#classification-result');el.className='classification-result show';el.textContent=message;if(p){const b=document.createElement('button');b.className='text-button';b.textContent='논문 열기 →';b.onclick=()=>openPaper(p.id);el.append(b)}}
async function registerPaper(raw,extra={}){
  const p={id:uid(),title:raw,authors:'사용자 추가',project:'미분류',status:'읽을 논문',progress:0,section:'시작 전',source:raw,reading:{},...extra};
  papers.unshift(p);cachePapers();renderPapers();
  try{await storePaper(p);paperFeedback('논문을 저장했습니다. 상세 화면에서 AI 분석을 시작하세요.',p)}catch(error){if(error.existing_id){papers=papers.filter(x=>x.id!==p.id);await restorePapers();const existing=papers.find(x=>x.id===error.existing_id);paperFeedback('이미 저장된 논문입니다.',existing);cachePapers();renderPapers();return existing||p}paperFeedback('이 브라우저에 저장했습니다. '+error.message,p)}return p;
}
$('#classify-paper-button').textContent='논문 저장';
$('.paper-capture h2').textContent='논문을 모으고, 원문에서 구조를 찾아보세요.';
$('.paper-capture > div > p:not(.eyebrow)').textContent='제목·링크를 저장하거나 PDF를 업로드하세요. 논문 상세의 분석 버튼으로 프로젝트와 목차를 추출합니다.';
$('#pdf-upload-button').textContent='↑ PDF 업로드';$('.upload-row small').textContent='PDF 저장 후 상세 화면에서 AI 분석 · 최대 20MB';
$('#dashboard-paper-form').onsubmit=async e=>{e.preventDefault();const raw=$('#dashboard-paper-input').value.trim();if(raw){await registerPaper(raw);$('#dashboard-paper-input').value=''}};
$('#save-paper').onclick=null;
$('#add-dialog form').onsubmit=async e=>{if(e.submitter?.value==='cancel')return;e.preventDefault();const title=$('#new-paper-title').value.trim();if(!title)return;const project=$('#add-dialog select').value;await registerPaper(title,{project});$('#new-paper-title').value='';$('#add-dialog').close()};
$('#pdf-upload').onchange=async e=>{const file=e.target.files[0];if(!file)return;paperFeedback('PDF를 저장하고 텍스트를 추출하고 있습니다…');try{const data=await uploadPDF(file);const p=await registerPaper(file.name,{file_path:data.file_path,source:data.source,source_text:data.source_text});if(p)openPaper(p.id)}catch(error){paperFeedback(error.message)}finally{e.target.value=''}};

// Calendar: user events + dated tasks + existing meeting samples.
const today=new Date(), dateKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let month=new Date(today.getFullYear(),today.getMonth(),1), selectedDate=dateKey(today), eventFilter='all';
let events=readLocal('research-calendar-v1',[]);
const meetingEvents=[{id:'meeting-1',title:'주간 연구 미팅',date:'2026-10-11',project:'synthetic',kind:'미팅',readonly:true},{id:'meeting-2',title:'방법론 리딩 그룹',date:'2026-10-05',project:'methods',kind:'미팅',readonly:true},{id:'meeting-3',title:'Silicon Sampling 점검',date:'2026-09-28',project:'silicon',kind:'미팅',readonly:true}];
function allEvents(){return [...meetingEvents,...events,...tasks.flatMap((t,i)=>{let date=t.dueDate;if(!date&&t.due==='오늘')date=dateKey(today);const m=t.due?.match(/^(\d+)월 (\d+)일$/);if(!date&&m)date=`2026-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;return date?[{id:`task-${i}`,title:t.title,date,project:projectId(t.project),kind:'할 일',done:t.done,readonly:true,taskIndex:i}]:[]})].filter(e=>eventFilter==='all'||e.project===eventFilter)}
const calendar=document.createElement('section');calendar.id='calendar';calendar.className='page';$('.main').append(calendar);
function renderCalendar(){
  const all=allEvents(), first=new Date(month.getFullYear(),month.getMonth(),1), start=new Date(first);start.setDate(1-first.getDay());
  calendar.innerHTML=`<div class="page-intro compact"><div><p class="eyebrow">RESEARCH CALENDAR</p><h1>연구 캘린더</h1><p class="lede">모든 프로젝트의 미팅, 실험, 마감과 논문 읽기를 한곳에서 확인하세요.</p></div><button class="button primary" id="new-event">+ 일정 추가</button></div>
    <div class="calendar-toolbar"><div class="action-row"><button class="button secondary" id="prev-month" aria-label="이전 달">←</button><h2>${month.getFullYear()}년 ${month.getMonth()+1}월</h2><button class="button secondary" id="next-month" aria-label="다음 달">→</button><button class="button secondary" id="calendar-today">오늘</button></div><label>프로젝트 <select id="calendar-filter"><option value="all">전체 프로젝트</option>${projects.map(p=>`<option value="${p.id}" ${eventFilter===p.id?'selected':''}>${p.name}</option>`).join('')}</select></label></div>
    <div class="calendar-scroll"><div class="calendar-grid">${['일','월','화','수','목','금','토'].map(d=>`<div class="weekday">${d}</div>`).join('')}${Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const key=dateKey(d), entries=all.filter(e=>e.date===key);return `<button class="calendar-day ${d.getMonth()!==month.getMonth()?'outside':''} ${key===selectedDate?'selected':''} ${key===dateKey(today)?'today':''}" data-date="${key}" aria-label="${key}, 일정 ${entries.length}개"><span>${d.getDate()}</span>${entries.slice(0,3).map(e=>`<small class="event-chip color-${e.project} ${e.done?'completed':''}">${escapeHTML(e.title)}</small>`).join('')}${entries.length>3?`<small>+${entries.length-3}개 더 보기</small>`:''}</button>`}).join('')}</div></div>
    <section class="panel day-agenda"><div class="section-heading"><h2>${selectedDate} 일정</h2><button class="text-button" id="add-selected-event">+ 이 날짜에 추가</button></div><div id="day-events"></div><p class="muted">일정은 이 브라우저에 저장됩니다. 할 일은 마감일, 기존 미팅은 기록된 날짜로 표시됩니다.</p></section>`;
  $('#calendar-filter').onchange=e=>{eventFilter=e.target.value;renderCalendar()};
  $('#prev-month').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCalendar()};$('#next-month').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCalendar()};
  $('#calendar-today').onclick=()=>{month=new Date(today.getFullYear(),today.getMonth(),1);selectedDate=dateKey(today);renderCalendar()};
  $$('.calendar-day').forEach(b=>b.onclick=()=>{selectedDate=b.dataset.date;renderCalendar()});
  $('#new-event').onclick=$('#add-selected-event').onclick=()=>editEvent();
  $('#day-events').innerHTML=all.filter(e=>e.date===selectedDate).map(e=>`<div class="agenda-item"><span class="event-dot color-${e.project}"></span><div><strong>${escapeHTML(e.title)}</strong><small>${projectLabel(e.project)} · ${e.kind}${e.time?' · '+e.time:''}${e.done?' · 완료':''}</small></div><button class="text-button" data-event="${escapeHTML(e.id)}">${e.readonly?'열기':'수정'}</button></div>`).join('')||'<p class="muted">등록된 일정이 없습니다.</p>';
  $$('#day-events [data-event]').forEach(b=>b.onclick=()=>{const e=all.find(x=>x.id===b.dataset.event);if(e.readonly){navigate(e.kind==='미팅'?'meetings':'inbox')}else editEvent(e)});
}
const eventDialog=document.createElement('dialog');eventDialog.className='event-dialog';document.body.append(eventDialog);
function editEvent(event){
  eventDialog.innerHTML=`<form id="event-form"><p class="eyebrow">RESEARCH EVENT</p><h2>${event?'일정 수정':'새 일정'}</h2><label>제목<input name="title" required maxlength="200" value="${escapeHTML(event?.title||'')}"></label><div class="event-fields"><label>날짜<input name="date" type="date" required value="${event?.date||selectedDate}"></label><label>시간 (선택)<input name="time" type="time" value="${event?.time||''}"></label></div><label>프로젝트<select name="project">${projects.map(p=>`<option value="${p.id}" ${event?.project===p.id?'selected':''}>${p.name}</option>`).join('')}</select></label><label>유형<select name="kind">${['미팅','실험','마감','논문 읽기'].map(k=>`<option ${event?.kind===k?'selected':''}>${k}</option>`).join('')}</select></label><div class="action-row">${event?'<button type="button" class="button secondary" id="delete-event">일정 삭제</button>':''}<button type="button" class="button secondary" id="cancel-event">취소</button><button class="button primary">저장</button></div></form>`;
  $('#cancel-event').onclick=()=>eventDialog.close();
  if(event)$('#delete-event').onclick=()=>{const old=events;events=events.filter(e=>e.id!==event.id);writeLocal('research-calendar-v1',events);eventDialog.close();renderCalendar();toast.innerHTML='일정을 삭제했습니다. ';const undo=document.createElement('button');undo.textContent='되돌리기';undo.onclick=()=>{events=old;writeLocal('research-calendar-v1',events);renderCalendar();toast.classList.remove('visible')};toast.append(undo);toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('visible'),10000)};
  $('#event-form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(!data.title.trim())return;const item={...data,id:event?.id||uid()};events=events.filter(x=>x.id!==item.id);events.push(item);writeLocal('research-calendar-v1',events);selectedDate=item.date;const [y,m]=item.date.split('-').map(Number);month=new Date(y,m-1,1);eventDialog.close();renderCalendar();notifyUser('일정을 저장했습니다.')};eventDialog.showModal();
}
const originalNavigate=navigate;
navigate=function(id){if(id==='calendar')renderCalendar();originalNavigate(id);$('.sidebar').classList.remove('mobile-open')};
$('.mobile-menu').onclick=()=>$('.sidebar').classList.toggle('mobile-open');
async function restorePapers(){
  try{const removed=new Set(await api('/api/papers/deleted'));const saved=await api('/api/papers');for(const id of readLocal('research-deleted-papers-v1',[]))removed.add(id);for(const p of papers.filter(p=>p._deleted))removed.add(p.id);const local=new Map(papers.filter(p=>!removed.has(p.id)).map(p=>[p.id,p]));for(const row of saved){if(!removed.has(row.id)&&!local.get(row.id)?._pending)local.set(row.id,{...row,reading:row.reading_json?JSON.parse(row.reading_json):{}})}papers=[...local.values()];cachePapers();renderPapers();renderReading();for(const p of papers.filter(p=>p._pending)){storePaper(p).catch(()=>{})}}catch{/* Browser cache remains usable when server is off. */}
}
renderProjects();renderTasks();renderReading();renderPapers();renderKanban();renderCalendar();restorePapers();
