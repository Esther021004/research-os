// Shared project views: records are never copied when moving between pages.
const recordProject = record => record.projectId || projectId(record.project);
const projectOptions = (id, all=false) => `${all?'<option value="all">전체 프로젝트</option>':''}<option value="none" ${id==='none'?'selected':''}>기타 (미분류)</option>`+projects.map(p=>`<option value="${p.id}" ${p.id===id?'selected':''}>${escapeHTML(p.name)}</option>`).join('');
let libraryProject='all', meetingFilter='all', activeMeeting=null;
let meetings=readLocal('research-meetings-v1',null);
if(!Array.isArray(meetings))meetings=meetingEvents.map(e=>({...e,transcript:'',summary:e.id==='meeting-1'?'LoRA 비교 실험과 WVS 검증 변수 점검을 논의했습니다.':'기존 화면의 예시 미팅입니다. 수정 버튼으로 내용을 기록하세요.',decisions:'',sample:true}));
const connectionDialog=document.createElement('dialog');connectionDialog.className='editor-dialog connection-dialog';document.body.append(connectionDialog);
function closeConnection(){connectionDialog.close()}
function rememberDeletedPaper(id){try{writeLocal('research-deleted-papers-v1',[...new Set([...readLocal('research-deleted-papers-v1',[]),id])])}catch{/* The server tombstone remains authoritative. */}}
function taskDate(t){if(t.dueDate)return t.dueDate;if(t.due==='오늘')return dateKey(today);const m=t.due?.match(/^(\d+)월 (\d+)일$/);return m?`${today.getFullYear()}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:''}
function ensureTaskIds(){for(const t of tasks)t.id ||= uid()}
ensureTaskIds();
function sharedTaskRows(list){return list.map(t=>`<div class="linked-row"><label><input type="checkbox" data-shared-task="${escapeHTML(t.id)}" ${t.done?'checked':''}> <span class="${t.done?'completed':''}">${escapeHTML(t.title)}</span><small>${escapeHTML(t.project)} · ${escapeHTML(taskDate(t)||'날짜 없음')}</small></label><button class="text-button" data-edit-task="${escapeHTML(t.id)}">수정</button>${taskDate(t)?`<button class="text-button" data-task-calendar="${escapeHTML(t.id)}">캘린더 ↗</button>`:''}</div>`).join('')||'<p class="muted">등록된 할 일이 없습니다.</p>'}
function bindSharedTasks(root){root.querySelectorAll('[data-shared-task]').forEach(b=>b.onchange=()=>{const t=tasks.find(t=>t.id===b.dataset.sharedTask);t.done=b.checked;persistTasks();refreshConnections()});root.querySelectorAll('[data-edit-task]').forEach(b=>b.onclick=()=>editLinkedTask(tasks.find(t=>t.id===b.dataset.editTask)));root.querySelectorAll('[data-task-calendar]').forEach(b=>b.onclick=()=>showTaskCalendar(tasks.find(t=>t.id===b.dataset.taskCalendar)))}
function refreshConnections(){renderTasks();renderKanban();renderCalendar();if($('#project-detail').classList.contains('active'))renderProjectDetail();if($('#meetings').classList.contains('active'))renderMeetings()}
renderTasks=function(){ensureTaskIds();$('#today-tasks').innerHTML=sharedTaskRows(tasks.filter(t=>!t.done).slice(0,3));bindSharedTasks($('#today-tasks'))};
const previousKanban=renderKanban;
renderKanban=function(){ensureTaskIds();previousKanban();for(const group of ['inbox','planned','progress','waiting']){const root=$(`#${group}-column`);root.innerHTML=sharedTaskRows(tasks.filter(t=>t.group===group&&!t.done));bindSharedTasks(root)}};
function showTaskCalendar(t){const date=taskDate(t);if(!date)return editLinkedTask(t);selectedDate=date;const [y,m]=date.split('-').map(Number);month=new Date(y,m-1,1);eventFilter=recordProject(t);navigate('calendar')}
function editLinkedTask(t=null,project=activeProject,meetingId=null){
  connectionDialog.innerHTML=`<form id="linked-task-form"><h2>${t?'할 일 수정':'할 일 추가'}</h2><label>제목<input name="title" required maxlength="300" value="${escapeHTML(t?.title||'')}"></label><label>프로젝트<select name="projectId">${projectOptions(t?recordProject(t):project)}</select></label><label>마감일 · 캘린더 자동 연결<input name="dueDate" type="date" value="${escapeHTML(t?taskDate(t):selectedDate)}"></label><label>상태<select name="group">${[['inbox','인박스'],['planned','계획됨'],['progress','진행 중'],['waiting','대기 중']].map(([id,label])=>`<option value="${id}" ${t?.group===id?'selected':''}>${label}</option>`).join('')}</select></label><label><input name="done" type="checkbox" ${t?.done?'checked':''}> 완료</label><div class="action-row"><button type="button" class="button secondary" data-close>취소</button><button class="button primary">저장</button></div><p class="muted">이 브라우저에 저장됩니다. 날짜가 있는 할 일은 연구 캘린더에 표시됩니다.</p></form>`;
  connectionDialog.querySelector('[data-close]').onclick=closeConnection;
  $('#linked-task-form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(!data.title.trim())return;const item={...t,...data,id:t?.id||uid(),title:data.title.trim(),project:projectLabel(data.projectId),due:data.dueDate||'날짜 없음',done:data.done==='on',priority:t?.priority||'low',meetingId:t?.meetingId||meetingId};if(t)Object.assign(t,item);else tasks.push(item);persistTasks();closeConnection();refreshConnections();notifyUser('할 일을 저장했습니다. 날짜가 있으면 캘린더에도 표시됩니다.')};connectionDialog.showModal();
}
$('#inbox-add').onclick=()=>editLinkedTask(null,'none');
$('#add-task').onclick=()=>editLinkedTask(null,activeProject);

const beforeConnectedPapers=renderPapers;
renderPapers=function(){beforeConnectedPapers();if(!$('#library-project')){const select=document.createElement('select');select.id='library-project';select.setAttribute('aria-label','프로젝트별 논문');$('#library-tools').append(select);select.onchange=()=>{libraryProject=select.value;renderPapers()}}
  $('#library-project').innerHTML=projectOptions(libraryProject,true);$('#library-project').value=libraryProject;
  $$('#paper-rows .paper-row').forEach(row=>{const p=papers.find(x=>x.id===row.querySelector('[data-id]').dataset.id);row.hidden=row.hidden||(libraryProject!=='all'&&recordProject(p)!==libraryProject);const button=document.createElement('button');button.className='text-button danger';button.textContent='삭제';button.onclick=()=>deletePaper(p);row.lastElementChild.append(button)});
};
const beforeConnectedDetail=renderPaperDetail;
renderPaperDetail=function(p){beforeConnectedDetail(p);const label=document.createElement('label');label.innerHTML=`프로젝트 연결<select name="projectId">${projectOptions(recordProject(p))}</select>`;$('#reader-meta').prepend(label);const save=$('#reader-meta').onsubmit;$('#reader-meta').onsubmit=e=>{p.projectId=$('#reader-meta [name=projectId]').value;p.project=projectLabel(p.projectId);save(e)};const button=document.createElement('button');button.className='button secondary danger';button.textContent='논문 삭제';button.onclick=()=>deletePaper(p);$('.paper-detail-header').append(button)};
async function deletePaper(p){
  if(!confirm(`“${p.title}”을(를) 삭제할까요?\n논문 정보·분석·읽기 기록·메모가 삭제되며 되돌릴 수 없습니다. 업로드한 PDF 파일은 보존합니다.`))return;
  p._deleted=true;
  try{await syncQueue.catch(()=>{});await post('/api/papers/delete',{id:p.id});rememberDeletedPaper(p.id);papers=papers.filter(x=>x.id!==p.id);cachePapers();if(selectedPaper?.id===p.id){selectedPaper=null;navigate('papers')}renderPapers();renderReading();if($('#project-detail').classList.contains('active'))renderProjectDetail();notifyUser('논문과 읽기 기록을 삭제했습니다. 업로드한 PDF 파일은 보존했습니다.')}catch(e){delete p._deleted;notifyUser('삭제하지 못했습니다. 서버 연결을 확인해 주세요. '+e.message)}
}
function openProjectLibrary(id){libraryProject=id;paperFilter='전체';libraryQuery='';libraryTag='';libraryCollection='';if($('#library-search'))$('#library-search').value='';renderPapers();navigate('papers')}
function linkProjectPaper(id){connectionDialog.innerHTML=`<form id="link-paper-form"><h2>라이브러리 논문 연결</h2><p class="muted">논문은 복사되지 않습니다. 선택한 논문의 프로젝트 분류가 변경됩니다.</p><label>논문<select name="paper">${papers.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.title)} · ${escapeHTML(p.project)}</option>`).join('')}</select></label><div class="action-row"><button class="button secondary" type="button" data-close>취소</button><button class="button primary" ${papers.length?'':'disabled'}>연결 저장</button></div></form>`;connectionDialog.querySelector('[data-close]').onclick=closeConnection;$('#link-paper-form').onsubmit=async e=>{e.preventDefault();const p=papers.find(p=>p.id===new FormData(e.target).get('paper'));if(!p)return;Object.assign(p,{projectId:id,project:projectLabel(id)});await persistReader(p);closeConnection();renderProjectDetail();renderPapers()};connectionDialog.showModal()}

function workflowFromDocument(text){
  const lines=text.replace(/\r/g,'').split('\n');
  const steps=lines.filter(l=>/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/.test(l)).map(l=>l.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/,''));
  const headings=lines.filter(l=>/^#{1,6}\s+/.test(l)).map(l=>l.replace(/^#+\s+/,''));
  return (steps.length?steps:headings.length?headings:lines.filter(l=>l.trim())).join('\n');
}
const beforeConnectedProject=renderProjectDetail;
renderProjectDetail=function(){beforeConnectedProject();const id=activeProject,p=projects.find(p=>p.id===id);if(!p)return;
  const actions=document.createElement('div');actions.className='connection-tools';actions.innerHTML='<div class="action-row file-actions" aria-label="워크플로 파일 작업"><button type="button" class="button secondary" id="workflow-import">MD·TXT·PDF 불러오기</button><input type="file" id="workflow-file" accept=".md,.markdown,.txt,.pdf" hidden><button class="button secondary" id="workflow-md">MD 내보내기</button><button class="button secondary" id="workflow-pdf">PDF로 저장 / 인쇄</button></div><p class="muted" id="workflow-import-status" role="status">불러온 텍스트는 검토 후 생성·저장을 눌러주세요.</p>';$('#workflow-form').before(actions);$('#workflow-import').onclick=()=>$('#workflow-file').click();
  $('#workflow-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const status=$('#workflow-import-status');status.textContent='파일을 읽고 있습니다…';try{if(file.size>20*1024*1024)throw new Error('20MB 이하 파일을 선택해 주세요.');let text;if(/\.pdf$/i.test(file.name))text=(await uploadPDF(file)).source_text;else if(/\.(md|markdown|txt)$/i.test(file.name))text=await file.text();else throw new Error('MD, TXT 또는 PDF만 가능합니다.');if(!text.trim())throw new Error('텍스트가 없습니다. 스캔 PDF는 OCR 후 사용해 주세요.');const prepared=workflowFromDocument(text);if(prepared.length>6000)throw new Error('내용이 너무 깁니다. 연구 단계만 추린 파일을 사용해 주세요 (6,000자 이하).');if($('#project-detail').classList.contains('active')&&activeProject===id){$('#workflow-text').value=prepared;status.textContent=`${file.name} · 목록/제목을 추출했습니다. 20단계 이하로 수정 후 생성·저장하세요. AI 요약이 아닙니다.`}}catch(error){status.textContent=error.message}finally{e.target.value=''}};
  $('#workflow-md').onclick=()=>{const w=workflows[id]||{text:defaultFlows[id]||'',nodes:defaultFlows[id]?parseWorkflow(defaultFlows[id]):[]};downloadFile(`${id}-workflow.md`,`# ${p.name}\n\n${w.nodes.map(n=>`- [${n.done?'x':' '}] ${n.label}`).join('\n')}\n`,'text/markdown;charset=utf-8');notifyUser('마지막으로 저장한 Workflow를 내보냈습니다.')};
  $('#workflow-pdf').onclick=()=>{const w=workflows[id]||{text:defaultFlows[id]||''};const text=document.createElement('div');text.className='workflow-print-text preserve-lines';text.textContent=w.text;$('#workflow-form').after(text);document.body.classList.add('print-workflow');try{window.print()}finally{document.body.classList.remove('print-workflow');text.remove()}};
  $('#project-tasks').innerHTML=`<div class="action-row"><button class="text-button" id="project-add-task">+ 할 일</button><button class="text-button" id="project-calendar">프로젝트 캘린더 ↗</button></div>`+sharedTaskRows(tasks.filter(t=>recordProject(t)===id));bindSharedTasks($('#project-tasks'));$('#project-add-task').onclick=()=>editLinkedTask(null,id);$('#project-calendar').onclick=()=>{eventFilter=id;navigate('calendar')};
  $('#project-paper-links').innerHTML=`<div class="action-row"><button class="text-button" id="project-link-paper">+ 기존 논문 연결</button><button class="text-button" id="project-library">라이브러리 ↗</button></div>`+papers.filter(x=>recordProject(x)===id).map(x=>`<button class="paper-link" data-project-paper="${escapeHTML(x.id)}">${escapeHTML(x.title)} <small>${escapeHTML(x.status)} · ${x.progress}%</small></button>`).join('');$('#project-link-paper').onclick=()=>linkProjectPaper(id);$('#project-library').onclick=()=>openProjectLibrary(id);$$('[data-project-paper]').forEach(b=>b.onclick=()=>openPaper(b.dataset.projectPaper));
  const section=document.createElement('section');section.className='panel project-meetings';section.innerHTML=`<div class="section-heading"><div><p class="eyebrow">PROJECT MEETINGS</p><h2>프로젝트 미팅록</h2></div><div class="action-row"><button class="button primary" id="project-add-meeting">+ 미팅 기록</button><button class="text-button" id="project-all-meetings">미팅 탭에서 보기 ↗</button></div></div>${meetingList(meetings.filter(m=>m.project===id))}`;$('#project-detail').append(section);$('#project-add-meeting').onclick=()=>editMeeting(null,id);$('#project-all-meetings').onclick=()=>{meetingFilter=id;activeMeeting=null;navigate('meetings')};bindMeetingLinks(section);
};
function meetingList(list){return [...list].sort((a,b)=>b.date.localeCompare(a.date)).map(m=>`<button class="meeting-select" data-meeting-id="${escapeHTML(m.id)}"><small>${escapeHTML(m.date)} · ${escapeHTML(projectLabel(m.project))}${m.sample?' · 예시':''}</small><strong>${escapeHTML(m.title)}</strong></button>`).join('')||'<p class="muted">아직 미팅 기록이 없습니다.</p>'}
function bindMeetingLinks(root){root.querySelectorAll('[data-meeting-id]').forEach(b=>b.onclick=()=>{activeMeeting=b.dataset.meetingId;const m=meetings.find(m=>m.id===activeMeeting);meetingFilter=m.project;if(root.id==='meetings'){renderMeetings();$('#meetings [aria-pressed="true"]')?.focus({preventScroll:true});if(window.matchMedia('(max-width: 1050px)').matches)$('#meeting-detail-panel')?.scrollIntoView({behavior:'smooth',block:'nearest'})}else navigate('meetings')})}
function meetingProjectGroups(){
  const groups=projects.map(p=>({...p,items:meetings.filter(m=>m.project===p.id).sort((a,b)=>b.date.localeCompare(a.date))}));
  const unassigned=meetings.filter(m=>!projects.some(p=>p.id===m.project)).sort((a,b)=>b.date.localeCompare(a.date));
  if(unassigned.length)groups.push({id:'none',name:'미분류',theme:'neutral',items:unassigned});
  return groups;
}
function groupedMeetingsHTML(){return meetingProjectGroups().map(p=>`<section class="meeting-project-section meeting-tone-${escapeHTML(p.theme)}"><header class="meeting-project-heading"><div><p class="eyebrow">PROJECT MEETINGS · ${p.items.length}개</p><h2>${escapeHTML(p.name)}</h2><small>${p.items.length?'최근 미팅 · '+escapeHTML(p.items[0].date):'첫 미팅을 기록해 보세요'}</small></div><button class="button secondary" data-new-project-meeting="${escapeHTML(p.id)}">+ 미팅 기록</button></header><div class="meeting-project-cards">${p.items.map(m=>`<button class="meeting-overview-card ${m.id===activeMeeting?'selected':''}" data-meeting-id="${escapeHTML(m.id)}" aria-pressed="${m.id===activeMeeting}" aria-controls="meeting-detail-panel"><small>${escapeHTML(m.date)}${m.sample?' · 예시':''}</small><strong>${escapeHTML(m.title)}</strong><span>${escapeHTML(m.summary||'요약이 없습니다. 미팅을 열어 내용을 기록하세요.')}</span><em>${m.id===activeMeeting?'선택됨 · 상세 보기':'상세 보기 ↗'}</em></button>`).join('')||'<p class="muted meeting-empty">등록된 미팅이 없습니다. 위의 버튼으로 추가할 수 있습니다.</p>'}</div></section>`).join('')}
function placeMeetingDetail(){const panel=$('#meeting-detail-panel'),slot=$('#meeting-detail-slot'),selected=$('#meetings [aria-pressed="true"]');if(!panel||!slot)return;if(window.matchMedia('(max-width: 1050px)').matches&&selected)selected.after(panel);else slot.append(panel)}
window.matchMedia('(max-width: 1050px)').addEventListener('change',placeMeetingDetail);
function renderMeetings(){const ordered=[...meetings].sort((a,b)=>b.date.localeCompare(a.date));const m=meetings.find(m=>m.id===activeMeeting)||ordered.find(m=>m.project===meetingFilter)||ordered[0];activeMeeting=m?.id||null;
  $('#meetings').innerHTML=`<div class="page-intro compact"><div><p class="eyebrow">MEETING MEMORY</p><h1>미팅</h1><p class="lede">모든 프로젝트의 대화를 한눈에. 미팅을 선택해 결정과 다음 할 일을 확인하세요.</p></div><button class="button primary" id="new-linked-meeting">+ 미팅 기록</button></div><p class="muted">프로젝트 ${projects.length}개 · 미팅 ${meetings.length}개 · 이 브라우저에 저장 · 프로젝트 페이지와 같은 기록</p><div class="meetings-overview"><div class="meeting-project-stack">${groupedMeetingsHTML()}</div><div id="meeting-detail-slot"><article class="meeting-detail panel" id="meeting-detail-panel" aria-label="선택한 미팅 상세">${m?`<div class="section-heading"><div><p class="eyebrow">${escapeHTML(m.date)} · ${escapeHTML(projectLabel(m.project))}</p><h2>${escapeHTML(m.title)}</h2></div><button class="button secondary" id="edit-linked-meeting">수정</button></div><h3>요약</h3><p class="preserve-lines">${escapeHTML(m.summary||'아직 요약이 없습니다.')}</p><h3>결정 사항</h3><p class="preserve-lines">${escapeHTML(m.decisions||'아직 결정 사항이 없습니다.')}</p><details><summary>전사문 / 원문 보기</summary><p class="preserve-lines">${escapeHTML(m.transcript||'전사문이 없습니다.')}</p></details><div class="section-heading"><h3>연결된 할 일</h3><button class="text-button" id="meeting-new-task">+ 후속 할 일</button></div><div id="linked-meeting-tasks">${sharedTaskRows(tasks.filter(t=>t.meetingId===m.id))}</div>`:'<p class="muted">프로젝트에 미팅을 추가하면 이곳에서 내용을 확인할 수 있습니다.</p>'}</article></div></div>`;
  $('#new-linked-meeting').onclick=()=>editMeeting(null,m?.project||activeProject);$('#meetings').querySelectorAll('[data-new-project-meeting]').forEach(b=>b.onclick=()=>editMeeting(null,b.dataset.newProjectMeeting));bindMeetingLinks($('#meetings'));if(m){$('#edit-linked-meeting').onclick=()=>editMeeting(m);$('#meeting-new-task').onclick=()=>editLinkedTask(null,m.project,m.id);bindSharedTasks($('#linked-meeting-tasks'))}placeMeetingDetail();
}
function editMeeting(m=null,project=activeProject){connectionDialog.innerHTML=`<form id="meeting-editor"><h2>${m?'미팅록 수정':'미팅 기록'}</h2><label>제목<input name="title" required maxlength="300" value="${escapeHTML(m?.title||'')}"></label><div class="event-fields"><label>프로젝트<select name="project">${projectOptions(m?.project||project)}</select></label><label>날짜<input name="date" type="date" required value="${escapeHTML(m?.date||dateKey(today))}"></label></div><label>전사문 / 미팅 노트<textarea name="transcript" rows="5" maxlength="100000">${escapeHTML(m?.transcript||'')}</textarea></label><label>요약 · 직접 작성<textarea name="summary" rows="3" maxlength="10000">${escapeHTML(m?.summary||'')}</textarea></label><label>결정 사항<textarea name="decisions" rows="3" maxlength="10000">${escapeHTML(m?.decisions||'')}</textarea></label><p class="muted">저장 후 ‘후속 할 일’에서 마감일을 지정하면 캘린더에도 연결됩니다. 자동 AI 요약은 실행하지 않습니다.</p><div class="action-row"><button class="button secondary" type="button" data-close>취소</button><button class="button primary">미팅록 저장</button></div></form>`;connectionDialog.querySelector('[data-close]').onclick=closeConnection;$('#meeting-editor').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(!data.title.trim())return;const item={...m,...data,id:m?.id||uid(),sample:false};const next=meetings.filter(x=>x.id!==item.id).concat(item);try{writeLocal('research-meetings-v1',next)}catch{return notifyUser('브라우저 저장 공간이 부족합니다. 내용을 복사해 보관해 주세요.')}meetings=next;for(const t of tasks.filter(t=>t.meetingId===item.id)){t.projectId=item.project;t.project=projectLabel(item.project)}persistTasks();activeMeeting=item.id;meetingFilter=item.project;closeConnection();refreshConnections();notifyUser('미팅록을 저장했습니다. 프로젝트·미팅·캘린더에 함께 반영됩니다.')};connectionDialog.showModal()}
allEvents=function(){return [...events,...meetings.map(m=>({...m,kind:'미팅',readonly:true,meetingId:m.id})),...tasks.filter(t=>taskDate(t)).map(t=>({id:`task-${t.id}`,taskId:t.id,title:t.title,date:taskDate(t),project:recordProject(t),kind:'할 일',done:t.done,readonly:true}))].filter(e=>eventFilter==='all'||e.project===eventFilter)};
const beforeConnectedCalendar=renderCalendar;
renderCalendar=function(){beforeConnectedCalendar();const entries=allEvents();$$('#day-events [data-event]').forEach(b=>b.onclick=()=>{const e=entries.find(x=>x.id===b.dataset.event);if(e.taskId)editLinkedTask(tasks.find(t=>t.id===e.taskId));else if(e.meetingId){activeMeeting=e.meetingId;meetingFilter=e.project;navigate('meetings')}else editEvent(e)})};
const beforeConnectedNavigate=navigate;
navigate=function(id){if(id==='project-detail')renderProjectDetail();if(id==='meetings')renderMeetings();if(id==='papers')renderPapers();if(id==='inbox'){renderTasks();renderKanban()}beforeConnectedNavigate(id)};
renderPapers();renderTasks();renderKanban();renderCalendar();renderMeetings();

// Reading garden: explicit activity only; never infer dates from old progress.
function gardenDate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function gardenShift(date,days){const d=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12);d.setDate(d.getDate()+days);return d}
function readingGardenData(list,now=new Date()){
  const counts=new Map();
  for(const p of list){for(const day of new Set(Array.isArray(p.readDays)?p.readDays:[])){if(/^\d{4}-\d{2}-\d{2}$/.test(day)&&day<=gardenDate(now))counts.set(day,(counts.get(day)||0)+1)}}
  let cursor=gardenShift(now,counts.has(gardenDate(now))?0:-1),streak=0;
  while(counts.has(gardenDate(cursor))){streak++;cursor=gardenShift(cursor,-1)}
  const start=gardenShift(now,-((now.getDay()+6)%7)-77);
  const days=Array.from({length:84},(_,i)=>{const date=gardenShift(start,i),key=gardenDate(date);return {key,date,count:counts.get(key)||0,future:key>gardenDate(now)}});
  return {days,streak,activeDays:days.filter(d=>d.count>0).length,total:days.reduce((sum,d)=>sum+d.count,0),today:counts.get(gardenDate(now))||0};
}
window.markPaperReadToday=function(p){p.readDays=[...new Set([...(Array.isArray(p.readDays)?p.readDays:[]),gardenDate(new Date())])];renderReadingGarden()};
let gardenSelectedDay=gardenDate(new Date());
const garden=document.createElement('section');garden.id='reading-garden';garden.className='panel reading-garden';garden.setAttribute('aria-label','논문 읽기 잔디');
const dashboardGreeting=$('#dashboard .page-intro');dashboardGreeting.classList.add('dashboard-greeting');const weekChip=dashboardGreeting.querySelector('.date-chip');if(weekChip)dashboardGreeting.querySelector('.eyebrow').append(weekChip);dashboardGreeting.append(garden);
function dashboardGreetingText(hour){
  if(hour>=5&&hour<12)return '좋은 아침이에요.';
  if(hour>=12&&hour<18)return '좋은 오후예요.';
  if(hour>=18&&hour<22)return '좋은 저녁이에요.';
  return '늦은 시간이네요. 쉬어가며 연구해요.';
}
function updateDashboardGreeting(){
  const now=new Date();
  dashboardGreeting.querySelector('h1').textContent=dashboardGreetingText(now.getHours());
  const label=dashboardGreeting.querySelector('.eyebrow');
  const stamp=document.createTextNode(`${now.getMonth()+1}월 ${now.getDate()}일 · ${['일','월','화','수','목','금','토'][now.getDay()]}요일 `);
  label.replaceChildren(stamp);
  if(weekChip){
    const thursday=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
    thursday.setUTCDate(thursday.getUTCDate()+4-(thursday.getUTCDay()||7));
    const year=thursday.getUTCFullYear(),week=Math.ceil(((thursday-new Date(Date.UTC(year,0,1)))/86400000+1)/7);
    weekChip.innerHTML=`W${week} <span>·</span> ${year}`;
    label.append(weekChip);
  }
}
updateDashboardGreeting();
setInterval(updateDashboardGreeting,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDashboardGreeting()});
const gardenPalette=[{id:'synthetic',label:'합성 설문',color:'#FFD6DA',shades:['#FFD6DA','#FFC6D0','#EDA5B4','#D78398']},{id:'silicon',label:'Silicon',color:'#E1F7E7',shades:['#E1F7E7','#BFE6CB','#97CEAA','#70B38A']},{id:'methods',label:'방법론',color:'#D1EAF5',shades:['#D1EAF5','#ADDAED','#85C4E0','#5CAACB']},{id:'none',label:'기타',color:'#C3D6F2',shades:['#C3D6F2','#ABC4E6','#91AFDA','#789CCE']}];
function gardenProjectShade(id,count){const palette=gardenPalette.find(p=>p.id===id)||gardenPalette.find(p=>p.id==='none');return count>0?palette.shades[Math.min(4,Math.floor(count))-1]:'#15242d'}
function gardenProjectParts(list,day){const counts=new Map();for(const p of list){if(!Array.isArray(p.readDays)||!p.readDays.includes(day))continue;const raw=recordProject(p),id=gardenPalette.some(c=>c.id===raw)?raw:'none';counts.set(id,(counts.get(id)||0)+1)}return gardenPalette.filter(c=>counts.has(c.id)).map(c=>({...c,count:counts.get(c.id)}))}
const gardenManager=document.createElement('section');gardenManager.id='reading-records';gardenManager.className='panel reading-records';gardenManager.setAttribute('aria-label','읽기 기록 관리');$('#papers .page-intro').after(gardenManager);
function validReadingDay(day){const d=new Date(day+'T12:00:00');return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(d.getTime())&&gardenDate(d)===day&&day<=gardenDate(new Date())}
function openReadingRecords(){navigate('papers');gardenManager.scrollIntoView({behavior:'smooth',block:'start'});$('#garden-record-date').focus({preventScroll:true})}
function renderReadingGarden(){
  const now=new Date(),data=readingGardenData(papers,now),selected=papers.filter(p=>Array.isArray(p.readDays)&&p.readDays.includes(gardenSelectedDay));
  const months=data.days.filter((_,i)=>i%7===0).map((d,i,all)=>`<span>${i===0||d.date.getMonth()!==all[i-1].date.getMonth()?`${d.date.getMonth()+1}월`:''}</span>`).join('');
  garden.innerHTML=`<div class="garden-heading"><div><p class="eyebrow">READ PAPERS · LITTLE BY LITTLE</p><h2>차곡차곡, 논문 잔디</h2></div><span class="garden-streak">🔥 <strong>${data.streak}일</strong> 연속 읽기</span></div><div class="garden-body"><div class="garden-chart"><div class="garden-months" aria-hidden="true">${months}</div><div class="garden-chart-row"><div class="garden-weekdays" aria-hidden="true">${['월','','수','','금','','일'].map(d=>`<span>${d}</span>`).join('')}</div><div class="garden-cells" aria-label="최근 12주 날짜별 읽기 기록">${data.days.map(d=>`<button class="garden-cell level-${Math.min(d.count,4)} ${d.key===gardenSelectedDay?'selected':''} ${d.key===gardenDate(now)?'is-today':''}" data-garden-day="${d.key}" aria-label="${d.key}, ${d.future?'아직 오지 않은 날':d.count+'편 읽음'}" title="${d.key} · ${d.count}편 읽음" aria-pressed="${d.key===gardenSelectedDay}" ${d.future?'disabled':''}></button>`).join('')}</div></div><div class="garden-legend"><span>최근 12주 · ${data.activeDays}일 읽었어요</span><span>적게 ${[0,1,2,3,4].map(n=>`<i class="level-${n}"></i>`).join('')} 많이</span></div></div><div class="garden-companion"><svg viewBox="0 0 180 150" aria-hidden="true"><ellipse cx="91" cy="137" rx="63" ry="8" fill="#dceadd"/><path d="M88 67Q68 31 43 43Q48 72 88 67M89 66Q100 28 133 32Q136 61 89 66" fill="#73b889"/><path d="M88 48V90" stroke="#347455" stroke-width="5" stroke-linecap="round"/><path d="M25 82Q57 70 88 87Q121 70 154 82V125Q120 116 88 135Q56 116 25 125Z" fill="#fffdf4" stroke="#347455" stroke-width="4" stroke-linejoin="round"/><path d="M88 87V134" stroke="#347455" stroke-width="3"/><circle cx="60" cy="99" r="3" fill="#347455"/><circle cx="118" cy="99" r="3" fill="#347455"/><path d="M77 106Q89 119 101 106" fill="none" stroke="#347455" stroke-width="3" stroke-linecap="round"/><path d="M145 46v14m-7-7h14" stroke="#dcbf66" stroke-width="3" stroke-linecap="round"/></svg><strong>${data.today?'오늘도 한 칸 자랐어요':'한 페이지도 좋은 시작이에요'}</strong><span>오늘 ${data.today}편 · 최근 12주 ${data.total}편·일</span></div></div><div class="garden-footer"><div class="garden-log-form"><label for="garden-paper">오늘 읽은 논문</label><select id="garden-paper" ${papers.length?'':'disabled'}><option value="">논문을 선택하세요</option>${papers.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.title)}</option>`).join('')}</select><button class="button secondary" id="garden-mark" ${papers.length?'':'disabled'}>오늘 읽음 +</button></div><p class="muted garden-help">목차 읽음 체크 또는 ‘오늘 읽음’으로 기록 · 하루에 같은 논문은 1편 · 완독 수가 아닙니다.</p><div class="garden-day-detail" aria-live="polite"><strong>${escapeHTML(gardenSelectedDay)} · ${selected.length}편</strong>${selected.length?selected.map(p=>`<div><button class="text-button" data-garden-paper="${escapeHTML(p.id)}">${escapeHTML(p.title)} ↗</button>${gardenSelectedDay===gardenDate(now)?`<button class="text-button" data-garden-undo="${escapeHTML(p.id)}">오늘 기록 취소</button>`:''}</div>`).join(''):'<p>이날 기록된 읽기 활동이 없습니다.</p>'}</div><p class="muted garden-help">기록은 논문과 함께 저장됩니다. 이전 읽기 날짜는 추정하지 않으며, 논문 삭제 시 해당 잔디도 제외됩니다. 목차 체크 해제는 활동 기록을 지우지 않습니다.</p></div>`;
  // Move the management controls, rather than keeping hidden duplicate inputs on the dashboard.
  garden.querySelectorAll('[data-garden-day]').forEach(cell=>{const parts=gardenProjectParts(papers,cell.dataset.gardenDay);if(!parts.length)return;cell.classList.add('project-colored');cell.innerHTML=parts.map(c=>`<span aria-hidden="true" style="background:${gardenProjectShade(c.id,c.count)};flex:${c.count}"></span>`).join('');const description=`${cell.dataset.gardenDay} · ${parts.map(c=>`${c.label} ${c.count}편`).join(', ')}`;cell.title=description;cell.setAttribute('aria-label',description)});
  garden.querySelector('.garden-heading h2').textContent='Read papers';
  garden.querySelector('.garden-companion').innerHTML=`<svg viewBox="0 0 140 140" role="img" aria-label="손을 흔드는 치이카와"><ellipse cx="74" cy="129" rx="43" ry="6" fill="#000" opacity=".25"/><g stroke="#302d2a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M47 93Q39 108 48 123Q42 132 53 133Q62 134 65 126L85 126Q88 134 98 132Q105 128 99 122Q109 105 97 93Z" fill="#fffdf7"/><path d="M33 46Q18 24 29 20Q40 15 48 34Q64 26 88 32Q99 16 109 24Q119 33 107 47Q123 65 114 86Q105 106 76 108Q47 109 31 95Q13 79 23 57Z" fill="#fffdf7"/><path d="M30 28Q29 24 33 26L40 37M103 31Q108 25 108 32L103 40" fill="none" stroke="#efd3cd" stroke-width="4"/><path d="M38 49l8-5M90 45l8 4" fill="none"/><ellipse cx="49" cy="66" rx="6" ry="8" fill="#302d2a" stroke="none"/><ellipse cx="90" cy="66" rx="6" ry="8" fill="#302d2a" stroke="none"/><circle cx="47" cy="63" r="2.2" fill="white" stroke="none"/><circle cx="88" cy="63" r="2.2" fill="white" stroke="none"/><path d="M63 78Q66 84 70 79Q75 85 78 78" fill="none" stroke-width="2.4"/><path d="M67 88Q71 91 75 87" fill="none" stroke-width="2"/><ellipse cx="37" cy="81" rx="12" ry="7" fill="#f5bfc7" stroke="none"/><ellipse cx="103" cy="81" rx="12" ry="7" fill="#f5bfc7" stroke="none"/><path d="M31 79l2 5M36 78l2 5M41 78l2 5M97 78l2 5M102 78l2 5M107 79l2 5" stroke="#bd7f89" stroke-width="1.4"/><path d="M38 99Q28 91 26 96L20 85Q17 80 14 83Q11 85 15 96L8 93Q2 91 2 97Q3 102 10 105Q4 106 6 111Q10 117 22 111L38 109" fill="#fffdf7"/><path d="M96 103Q102 99 107 105Q108 112 100 114" fill="#fffdf7"/></g><path d="M123 47v9m-4-5h8" stroke="#e9cc90" stroke-width="2" stroke-linecap="round"/></svg>`;
  gardenManager.innerHTML='<p class="eyebrow">READING LOG</p><h2>읽기 기록 관리</h2>';
  const footer=garden.querySelector('.garden-footer');gardenManager.append(footer);
  const dateLabel=document.createElement('label');dateLabel.className='garden-date-label';dateLabel.innerHTML=`읽은 날짜<input id="garden-record-date" type="date" value="${gardenSelectedDay}" max="${gardenDate(now)}" required>`;footer.prepend(dateLabel);
  $('#garden-record-date').onchange=e=>{if(!validReadingDay(e.target.value)){e.target.value=gardenSelectedDay;return notifyUser('오늘 또는 이전의 올바른 날짜를 선택해 주세요.')}gardenSelectedDay=e.target.value;renderReadingGarden()};
  footer.querySelector('label[for="garden-paper"]').textContent='읽은 논문';$('#garden-mark').textContent='읽기 기록 추가';
  footer.querySelector('.garden-help').textContent='날짜와 논문을 선택해 기록하세요. 같은 논문은 하루 1편으로 집계되며, 목차 읽음 체크는 오늘 날짜로 자동 기록됩니다.';
  footer.querySelector('.garden-day-detail').innerHTML=`<strong>${escapeHTML(gardenSelectedDay)} · ${selected.length}편</strong>${selected.length?selected.map(p=>`<div><button class="text-button" data-garden-paper="${escapeHTML(p.id)}">${escapeHTML(p.title)} ↗</button><button class="text-button" data-garden-undo="${escapeHTML(p.id)}">기록 취소</button></div>`).join(''):'<p>이날 기록된 읽기 활동이 없습니다.</p>'}`;
  const manage=document.createElement('button');manage.className='text-button garden-manage-link';manage.textContent='읽기 기록 관리 ↗';manage.onclick=openReadingRecords;garden.append(manage);
  const legend=document.createElement('div');legend.className='garden-project-legend';legend.setAttribute('aria-label','프로젝트별 잔디 색상');legend.innerHTML=gardenPalette.map(c=>`<span><i style="background:${c.color}"></i>${c.label}</span>`).join('');manage.before(legend);
  const colorHelp=document.createElement('div');colorHelp.className='garden-color-guide';colorHelp.innerHTML='<p class="muted garden-help">색은 현재 프로젝트, 농도는 해당 프로젝트에서 하루 동안 읽은 서로 다른 논문 수입니다. 여러 프로젝트를 읽은 날은 편수 비율로 칸을 나눕니다. 목차 읽음 체크 또는 직접 추가한 기록만 집계하며, 열기만 한 논문은 포함하지 않습니다. 미지정 프로젝트는 기타입니다.</p>'+gardenPalette.map(c=>`<div><strong>${c.label}</strong>${[1,2,3,4].map(n=>`<span><i style="background:${gardenProjectShade(c.id,n)}"></i>${n}편${n===4?'+':''}</span>`).join('')}</div>`).join('');footer.append(colorHelp);
  garden.querySelectorAll('[data-garden-day]').forEach(b=>b.onclick=()=>{gardenSelectedDay=b.dataset.gardenDay;openReadingRecords()});
  $('#garden-mark').onclick=()=>{const p=papers.find(p=>p.id===$('#garden-paper').value);if(!p)return notifyUser('먼저 논문을 선택해 주세요.');if(!validReadingDay(gardenSelectedDay))return notifyUser('날짜를 확인해 주세요.');p.readDays=[...new Set([...(Array.isArray(p.readDays)?p.readDays:[]),gardenSelectedDay])];persistReader(p);renderReadingGarden()};
  gardenManager.querySelectorAll('[data-garden-paper]').forEach(b=>b.onclick=()=>openPaper(b.dataset.gardenPaper));
  gardenManager.querySelectorAll('[data-garden-undo]').forEach(b=>b.onclick=()=>{const p=papers.find(p=>p.id===b.dataset.gardenUndo);p.readDays=p.readDays.filter(d=>d!==gardenSelectedDay);persistReader(p);renderReadingGarden()});
}
const gardenOriginalReading=renderReading;
renderReading=function(){gardenOriginalReading();renderReadingGarden()};
const gardenOriginalNavigate=navigate;
navigate=function(id){if(id==='dashboard'||id==='papers')renderReadingGarden();gardenOriginalNavigate(id)};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderReadingGarden()});
renderReadingGarden();

// AI proposals never write data until the user reviews and confirms them.
const agentHistory=[];
let agentBusy=false;
const agentContext=$('.agent-context');
agentContext.innerHTML='<div id="agent-counts"></div><label>참고 범위 <select id="agent-scope">'+projectOptions('all',true)+'</select></label><label class="agent-consent"><input type="checkbox" id="agent-consent"> 질문·최근 대화와 선택 범위의 논문 정보/메모, 미팅록, 할 일, 일정을 AI 제공자에게 전달합니다.</label><small>원문 PDF 전체는 전송하지 않습니다. 대화는 새로고침하면 초기화됩니다.</small>';
$('#chat').replaceChildren();
function agentMessage(text,user=false){const div=document.createElement('div');div.className=user?'user-message':'assistant-message';const p=document.createElement('p');p.textContent=text;div.append(p);$('#chat').append(div);$('#chat').scrollTop=$('#chat').scrollHeight;return div}
agentMessage('논문 제목이나 링크를 알려주시면 등록안을 만들고, 일정은 날짜와 시간을 확인한 뒤 캘린더에 저장할 수 있어요. 미팅 질문에는 저장된 기록을 근거로 답합니다. 먼저 참고 범위와 자료 전송 안내를 확인해 주세요.');
function updateAgentCounts(){$('#agent-counts').textContent=`프로젝트 ${projects.length}개 · 논문 ${papers.length}편 · 미팅 ${meetings.length}개 (예시 ${meetings.filter(m=>m.sample).length}개 포함)`}
$('#open-agent').onclick=()=>{updateAgentCounts();$('#agent-panel').classList.add('open')};
function agentRecords(){
  const scope=$('#agent-scope').value,inside=r=>scope==='all'||(projects.some(p=>p.id===r.project)?r.project:recordProject(r))===scope;
  const records=[];
  const add=(type,r,text)=>records.push({id:type+':'+r.id,title:r.title||r.name,text:String(text).slice(0,9700)+(String(text).length>9700?'\n[분량 제한으로 이후 내용 생략]':'')});
  projects.filter(p=>scope==='all'||p.id===scope).forEach(p=>add('project',p,`${p.name}\n${p.desc}\n${workflows[p.id]?.text||defaultFlows[p.id]}`));
  papers.filter(inside).forEach(p=>add('paper',p,`${p.sample?'[예시 데이터]\n':''}${p.title}\n프로젝트: ${p.project}\n상태: ${p.status}, 읽기 ${p.progress}%\n${p.analysis?.summary||''}\n메모: ${(p.annotations||[]).map(a=>`p.${a.page} ${a.text} ${a.quote}`).join('\n')}`));
  meetings.filter(inside).forEach(m=>add('meeting',m,`${m.sample?'[예시 데이터]\n':''}${m.date} ${m.title}\n요약: ${m.summary||''}\n결정: ${m.decisions||''}\n전사문: ${m.transcript||''}`));
  tasks.filter(inside).forEach(t=>add('task',t,`${t.title}\n마감: ${taskDate(t)}\n완료: ${!!t.done}`));
  events.filter(e=>scope==='all'||e.project===scope).forEach(e=>add('event',e,`${e.title}\n${e.date} ${e.time||'종일'} · ${e.kind}`));
  return records;
}
ask=async function(q){
  q=q.trim();if(!q||agentBusy)return;
  $('#agent-panel').classList.add('open');updateAgentCounts();
  const searchQuery=externalPaperQuery(q);
  if(searchQuery!==null){agentMessage(q,true);$('#agent-input').value='';openExternalPaperSearch(searchQuery);return}
  if(!$('#agent-consent').checked){notifyUser('Agent 상단에서 AI에 전달할 자료 범위와 전송 안내를 확인해 주세요.');return}
  if(q.length>4000){notifyUser('질문은 4,000자 이하로 입력해 주세요.');return}
  const records=agentRecords();
  if(records.length>250||JSON.stringify(records).length>180000){notifyUser('참고 자료가 많습니다. Agent 상단에서 프로젝트 범위를 좁혀 주세요.');return}
  agentBusy=true;const send=$('#agent-form button');send.disabled=true;
  agentMessage(q,true);$('#agent-input').value='';const loading=agentMessage('자료를 확인하고 있어요…');
  try{
    const result=await post('/api/agent',{message:q,records,history:agentHistory.slice(-8),today:gardenDate(new Date()),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,project:$('#agent-scope').value});
    loading.remove();const reply=agentMessage(result.answer);
    agentHistory.push({role:'user',content:q},{role:'assistant',content:result.answer});
    for(const ref of result.references||[]){const record=records.find(r=>r.id===ref.id);if(!record)continue;const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='근거 · '+record.title;const quote=document.createElement('blockquote');quote.textContent=ref.quote;details.append(summary,quote);reply.append(details)}
    for(const action of result.actions||[]){const button=document.createElement('button');button.className='button secondary';button.textContent=(action.type==='paper'?'논문 등록안 검토 · ':'일정 등록안 검토 · ')+action.title;button.onclick=()=>reviewAgentAction(action,button);reply.append(button)}
  }catch(error){loading.querySelector('p').textContent='연결하지 못했어요: '+error.message+' 새 기능 반영 후에는 서버 재시작이 필요할 수 있습니다. AI 연결 설정도 확인해 주세요.';$('#agent-input').value=q}
  finally{agentBusy=false;send.disabled=false;$('#chat').scrollTop=$('#chat').scrollHeight}
};
$('#agent-form').onsubmit=e=>{e.preventDefault();ask($('#agent-input').value)};
const agentReview=document.createElement('dialog');agentReview.className='connection-dialog agent-review';document.body.append(agentReview);
function reviewAgentAction(action,button){
  const paper=action.type==='paper';
  agentReview.innerHTML=`<form><h2>${paper?'논문 등록 확인':'일정 등록 확인'}</h2><p class="muted">AI가 작성한 초안입니다. 내용을 확인·수정한 뒤 저장하세요.</p><label>제목<input name="title" required maxlength="500" value="${escapeHTML(action.title)}"></label><label>프로젝트<select name="project">${projectOptions(action.project)}</select></label>${paper?`<label>링크 / DOI (선택)<input name="source" maxlength="2000" value="${escapeHTML(action.source)}"></label><p class="muted">제목·링크를 저장합니다. 저자·목차·원문 분석은 라이브러리에서 진행하세요.</p>`:`<label>날짜<input name="date" type="date" required value="${escapeHTML(action.date)}"></label><label>시간 (비워두면 종일)<input name="time" type="time" value="${escapeHTML(action.time)}"></label><label>유형<select name="kind">${['미팅','실험','마감','논문 읽기'].map(k=>`<option ${k===action.kind?'selected':''}>${k}</option>`).join('')}</select></label><p class="muted">앱 내부 연구 캘린더에 저장됩니다. 외부 캘린더와는 동기화하지 않습니다.</p>`}<p class="agent-save-status" role="status"></p><div class="action-row"><button type="button" class="button secondary" data-cancel>취소</button><button class="button primary">확인 후 저장</button></div></form>`;
  agentReview.querySelector('[data-cancel]').onclick=()=>agentReview.close();
  if(action.metadata){
    agentReview.querySelector('.muted').textContent='Crossref에서 조회한 정보입니다. 원하는 논문인지 확인 후 저장하세요.';
    const fields=document.createElement('div');
    fields.innerHTML=`<label>저자<input name="authors" maxlength="3000" value="${escapeHTML(action.metadata.authors)}"></label><label>발행 연도<input name="year" maxlength="4" value="${escapeHTML(action.metadata.year)}"></label><label>DOI<input name="doi" maxlength="500" value="${escapeHTML(action.metadata.doi)}" readonly></label>`;
    agentReview.querySelector('.agent-save-status').before(fields);
  }
  const draftId=uid();
  agentReview.querySelector('form').onsubmit=async e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.title=data.title.trim();if(!data.title)return;
    const save=e.target.querySelector('[type=submit]')||e.target.querySelector('.primary');save.disabled=true;
    const status=e.target.querySelector('.agent-save-status');
    try{
      if(paper){
        const duplicate=papers.find(p=>p.title.trim().toLocaleLowerCase()===data.title.toLocaleLowerCase()||(data.source&&p.source===data.source));
        if(duplicate){status.textContent='이미 라이브러리에 있는 논문입니다.';save.disabled=false;return}
        const item={id:draftId,title:data.title,source:data.source.trim(),project:projectLabel(data.project),projectId:data.project,authors:data.authors||'',year:data.year||'',doi:data.doi||'',venue:action.metadata?.venue||'',metadata_provider:action.metadata?.provider||'',status:'읽을 논문',progress:0,section:'시작 전',reading:{},annotations:[]};
        const saved=await post('/api/papers',item);papers.push({...item,...saved});cachePapers();renderPapers();renderReading();
      }else{
        if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date))throw new Error('날짜를 확인해 주세요.');
        if(events.some(e=>e.title===data.title&&e.date===data.date&&e.time===data.time&&e.project===data.project))throw new Error('같은 일정이 이미 등록되어 있습니다.');
        const next=[...events,{...data,id:draftId}];writeLocal('research-calendar-v1',next);events=next;selectedDate=data.date;month=new Date(Number(data.date.slice(0,4)),Number(data.date.slice(5,7))-1,1);renderCalendar();
      }
      button.disabled=true;button.textContent='저장 완료 · '+data.title;agentReview.close();updateAgentCounts();
      const done=agentMessage(`${paper?'논문 라이브러리':'연구 캘린더'}에 “${data.title}”을 저장했습니다.`);
      const open=document.createElement('button');open.className='button secondary';open.textContent=paper?'라이브러리에서 보기':'캘린더에서 보기';open.onclick=()=>{if(paper){libraryProject='all';paperFilter='전체'}else{eventFilter='all';selectedDate=data.date;month=new Date(Number(data.date.slice(0,4)),Number(data.date.slice(5,7))-1,1)}navigate(paper?'papers':'calendar');$('#agent-panel').classList.remove('open')};done.append(open);
      agentHistory.push({role:'assistant',content:`사용자가 확인하여 ${paper?'논문':'일정'} 저장 완료: ${JSON.stringify(data)}`});
    }catch(error){status.textContent=error.existing_id?'이미 저장된 논문입니다. 라이브러리에서 확인해 주세요.':error.message;save.disabled=false}
  };
  agentReview.showModal();
}
updateAgentCounts();
function externalPaperQuery(q){
  if(!/(찾아|검색|search|find)/i.test(q)||!/(논문|paper|doi)/i.test(q))return null;
  return q.replace(/(?:논문\s*)?(?:찾아\s*줘|찾아주세요|검색해\s*줘|검색해\s*주세요|검색해주세요)[.!?]?\s*$/i,'').replace(/^(?:find|search(?: for)?)\s+(?:the\s+)?(?:paper\s+)?/i,'').replace(/\s*논문\s*$/,'').trim();
}
function searchDuplicate(item){return papers.find(p=>(item.doi&&String(p.doi||p.source||'').toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//,'')===item.doi.toLowerCase())||p.title.trim().toLowerCase()===item.title.trim().toLowerCase())}
function openExternalPaperSearch(query=''){
  const box=agentMessage('외부 논문 검색 · Crossref');
  const form=document.createElement('form');form.className='external-paper-search';
  form.innerHTML='<label>논문 제목 / DOI<input name="query" required minlength="2" maxlength="500" placeholder="논문 제목 또는 DOI"></label><small>검색어만 Crossref로 전달됩니다. 미팅록·메모는 전송하지 않습니다. AI 로그인 없이 검색할 수 있어요.</small><button class="button secondary">외부 검색</button>';
  form.elements.query.value=query;box.append(form);
  const results=document.createElement('div');results.className='paper-search-results';results.setAttribute('aria-live','polite');box.append(results);
  form.onsubmit=async e=>{
    e.preventDefault();const button=form.querySelector('button');button.disabled=true;results.textContent='학술 정보를 검색하고 있어요…';
    try{
      const data=await post('/api/paper-search',{query:form.elements.query.value.trim()});results.replaceChildren();
      const info=document.createElement('p');info.textContent=data.items.length?'비슷한 제목도 포함됩니다. 저자·연도·출처를 확인해 주세요. PDF 원문은 자동 다운로드하지 않습니다.':'검색 결과가 없습니다. 제목 일부나 DOI로 다시 검색해 주세요. Crossref에 없는 논문은 제목으로 직접 등록할 수 있습니다.';results.append(info);
      for(const item of data.items){
        const card=document.createElement('article');const title=document.createElement('strong');title.textContent=item.title;
        const detail=document.createElement('p');detail.textContent=`${item.authors||'저자 정보 없음'} · ${item.year||'연도 미상'}\n${item.venue||''}`;
        const link=document.createElement('a');link.textContent='출처 · Crossref / DOI ↗';link.href='https://doi.org/'+encodeURI(item.doi);link.target='_blank';link.rel='noopener noreferrer';
        const add=document.createElement('button');add.className='button secondary';const existing=searchDuplicate(item);add.textContent=existing?'이미 저장됨 · 열기':'이 논문 선택';
        add.onclick=()=>{const duplicate=searchDuplicate(item);if(duplicate){openPaper(duplicate.id);$('#agent-panel').classList.remove('open');return}reviewAgentAction({type:'paper',title:item.title,source:item.source,project:$('#agent-scope').value==='all'?'none':$('#agent-scope').value,metadata:item},add)};
        card.append(title,detail,link,add);results.append(card);
      }
    }catch(error){results.textContent='검색하지 못했습니다. '+error.message+' 서버를 업데이트했다면 재시작 후 다시 시도해 주세요.'}
    finally{button.disabled=false}
  };
  $('#agent-panel').classList.add('open');form.elements.query.focus();$('#chat').scrollTop=$('#chat').scrollHeight;
}
const externalSearchButton=document.createElement('button');externalSearchButton.textContent='외부 논문 검색';externalSearchButton.onclick=()=>openExternalPaperSearch($('#agent-input').value);$('.suggestions').prepend(externalSearchButton);

// Capture is local-first: questions and external searches remain explicit modes.
let reviewDrafts=readLocal('research-review-drafts-v1',[]);
if(!Array.isArray(reviewDrafts))reviewDrafts=[];
function classifyDraft(text){
  if(/논문|paper|doi\.org|arxiv\.org|https?:\/\//i.test(text))return 'paper';
  if(/미팅|회의|약속|일정|세미나|발표|면담|meeting|schedule/i.test(text))return 'event';
  return 'task';
}
function captureLines(text){return text.split(/\n+/).map(s=>s.replace(/^\s*[-*•]\s*/,'').trim()).filter(Boolean)}
function persistDrafts(next){writeLocal('research-review-drafts-v1',next);reviewDrafts=next}
const draftNames={paper:'논문',event:'일정',task:'할 일'};
const reviewPage=document.createElement('section');reviewPage.id='review';reviewPage.className='page';$('.main').append(reviewPage);
const reviewNav=document.createElement('button');reviewNav.className='nav-link';reviewNav.dataset.page='review';reviewNav.innerHTML='<span>◷</span> 검토할 항목 <b>0</b>';reviewNav.onclick=()=>navigate('review');$('.nav').append(reviewNav);
function chatIntent(text){
  if(/하지\s*마|말아|말고|취소|삭제|수정|바꿔|don't|do not/i.test(text))return 'ask';
  if(externalPaperQuery(text)!==null)return 'ask';
  const lines=captureLines(text);
  const isRecord=s=>/(?:해야\s*(?:해|함|겠|지)|읽어야지|나중에\s*읽|저장해|기록해|추가해|담아\s*줘|등록해|기억해)/.test(s)||(/(?:내일|모레|다음\s*주|이번\s*주|\d+월|\d+일|월요일|화요일|수요일|목요일|금요일|토요일|일요일)/.test(s)&&/(?:미팅|회의|세미나|면담|약속)/.test(s)&&!/[?？]|언제|어떻게|뭐|무엇|할까|있어|알려/.test(s));
  const isQuestion=s=>/[?？]|알려\s*줘|설명|요약|추천|어떻게|무엇|뭘|왜|언제|어떤|정리해\s*줘/.test(s);
  if(lines.every(s=>isRecord(s)&&!isQuestion(s)&&!(/할까|할까요|좋을까/.test(s))))return 'capture';
  if(lines.some(isRecord)&&lines.some(isQuestion))return 'confirm';
  if(isQuestion(text))return 'ask';
  return 'confirm';
}
$('#agent-input').placeholder='할 일, 일정, 논문 또는 궁금한 내용을 자유롭게 적어주세요…';
$('#agent-form').onsubmit=e=>{
  e.preventDefault();const text=$('#agent-input').value.trim();if(!text)return;
  if(agentBusy)return;
  if(text.length>12000)return notifyUser('한 번에 12,000자 이하로 입력해 주세요.');
  const intent=chatIntent(text);
  if(intent==='ask'){ask(text);return}
  if(intent==='capture'){captureChatDrafts(text);return}
  agentMessage(text,true);$('#agent-input').value='';
  const reply=agentMessage('이 내용을 검토할 항목으로 담을까요, 아니면 AI에게 질문할까요?');
  const choose=(label,fn)=>{const b=document.createElement('button');b.className='button secondary';b.textContent=label;b.onclick=()=>{if(fn()===false)return;reply.querySelectorAll('button').forEach(x=>x.disabled=true)};reply.append(b)};
  choose('미정 항목으로 담기',()=>captureChatDrafts(text,false));
  choose('AI에게 질문',()=>{if(!$('#agent-consent').checked){notifyUser('상단에서 AI 자료 전송 안내를 확인해 주세요.');return false}if(text.length>4000){notifyUser('AI 질문은 4,000자 이하로 줄여 주세요.');return false}if(agentBusy)return false;ask(text)});
  choose('그냥 두기',()=>{reply.querySelector('p').textContent='기록하지 않았어요.'});
};
function captureChatDrafts(text,echo=true){
  const lines=captureLines(text);if(lines.length>30){notifyUser('한 번에 30개 항목까지 기록할 수 있어요.');return false}
  try{
    const drafts=lines.map(raw=>({id:uid(),raw,title:raw.slice(0,500),notes:raw.length>500?raw:'',type:classifyDraft(raw),project:'none',date:'',time:'',source:/^https?:\/\/\S+$/.test(raw)?raw:'',state:'pending',created:new Date().toISOString()}));
    persistDrafts([...reviewDrafts,...drafts]);$('#agent-input').value='';if(echo)agentMessage(text,true);
    const reply=agentMessage(`${drafts.length}개를 미정으로 저장했어요. 각 탭의 회색 항목과 ‘검토할 항목’에서 확인할 수 있습니다. 날짜·프로젝트는 아직 확정하지 않았어요.`);
    const open=document.createElement('button');open.className='button secondary';open.textContent='검토할 항목 열기';open.onclick=()=>{navigate('review');$('#agent-panel').classList.remove('open')};reply.append(open);renderReviewViews();
    const edit=document.createElement('button');edit.className='button secondary';edit.textContent='수정';edit.onclick=()=>{if(drafts.length===1)editReviewDraft(drafts[0].id);else{navigate('review');$('#agent-panel').classList.remove('open')}};reply.append(edit);
    const undo=document.createElement('button');undo.className='button secondary';undo.textContent='되돌리기';undo.onclick=()=>{
      const unchanged=new Set(drafts.filter(original=>reviewDrafts.some(d=>d.id===original.id&&JSON.stringify(d)===JSON.stringify(original))).map(d=>d.id));
      if(!unchanged.size)return notifyUser('이미 수정하거나 확정한 항목은 되돌리지 않습니다. 검토 탭에서 확인해 주세요.');
      try{persistDrafts(reviewDrafts.map(d=>unchanged.has(d.id)?{...d,state:'undone'}:d));renderReviewViews();undo.disabled=true;reply.querySelector('p').textContent=`${unchanged.size}개 기록을 되돌렸어요. 이후 수정·확정한 항목은 유지됩니다.`}catch{notifyUser('되돌리기를 저장하지 못했습니다.')}
    };reply.append(undo);
    return true;
  }catch{notifyUser('저장 공간이 부족해 기록하지 못했어요. 내용을 다시 복사해 주세요.');return false}
}
function pendingDrafts(type){return reviewDrafts.filter(d=>d.state==='pending'&&(!type||d.type===type))}
function draftCards(list){return list.map(d=>`<article class="pending-record"><div><span class="pending-badge">미정 · ${draftNames[d.type]||'할 일'}</span><strong>${escapeHTML(d.title)}</strong><small>${d.date?escapeHTML(d.date):'날짜 미정'} · ${d.project==='none'?'프로젝트 미정':escapeHTML(projectLabel(d.project))}</small></div><button class="button secondary" data-review-draft="${escapeHTML(d.id)}">구체화하기</button></article>`).join('')}
function bindDraftCards(root){root.querySelectorAll('[data-review-draft]').forEach(b=>b.onclick=()=>editReviewDraft(b.dataset.reviewDraft))}
function renderReviewViews(){
  const list=pendingDrafts();reviewNav.querySelector('b').textContent=list.length;
  reviewPage.innerHTML=`<div class="page-intro compact"><div><p class="eyebrow">REVIEW INBOX</p><h1>검토할 항목</h1><p class="lede">거칠게 적은 생각을 구체적인 연구 기록으로 바꿔보세요. ${list.length}개 검토 대기</p></div></div><p class="muted">미정 항목은 현재 브라우저에 저장됩니다. 원문은 보존하며, 확정 전에는 실제 일정·읽기 통계에 반영하지 않습니다.</p><div class="review-draft-list">${draftCards(list)||'<section class="panel">검토할 항목이 없어요. Agent 채팅에 할 일이나 일정을 자유롭게 적어보세요.</section>'}</div>`;
  bindDraftCards(reviewPage);
  for(const [page,type] of [['papers','paper'],['calendar','event'],['inbox','task']]){
    const root=$('#'+page);let section=root.querySelector('.pending-section');if(section)section.remove();const drafts=pendingDrafts(type);if(!drafts.length)continue;
    section=document.createElement('section');section.className='panel pending-section';section.innerHTML=`<h2>${type==='event'?'미정 일정 · 날짜 검토':'검토 대기'} <small>${drafts.length}</small></h2><p class="muted">아직 확정되지 않은 ${draftNames[type]}입니다. 내용을 구체화한 뒤 확정하세요.</p>${draftCards(drafts)}`;
    root.querySelector('.page-intro').after(section);bindDraftCards(section);
  }
}
const draftDialog=document.createElement('dialog');draftDialog.className='connection-dialog editor-dialog';document.body.append(draftDialog);
function editReviewDraft(id){
  const draft=reviewDrafts.find(d=>d.id===id&&d.state==='pending');if(!draft)return;
  draftDialog.innerHTML=`<form><h2>항목 구체화</h2><label>종류<select name="type">${Object.entries(draftNames).map(([k,v])=>`<option value="${k}" ${draft.type===k?'selected':''}>${v}</option>`).join('')}</select></label><label>제목<input name="title" maxlength="500" required value="${escapeHTML(draft.title)}"></label><label>프로젝트<select name="project">${projectOptions(draft.project)}</select></label><div class="draft-date-fields"><label>날짜 / 할 일 마감일<input name="date" type="date" value="${escapeHTML(draft.date)}"></label><label>시간 (일정만, 비우면 종일)<input name="time" type="time" value="${escapeHTML(draft.time)}"></label></div><label>논문 링크 / DOI<input name="source" maxlength="2000" value="${escapeHTML(draft.source)}"></label><label>세부 메모<textarea name="notes" rows="3" maxlength="12000">${escapeHTML(draft.notes)}</textarea></label><details><summary>처음 입력한 원문</summary><p class="preserve-lines">${escapeHTML(draft.raw)}</p></details><p class="muted">‘미정으로 저장’은 나중에 이어서 검토합니다. 일정 확정에는 날짜가 필요합니다. 프로젝트는 기타로 남겨도 됩니다.</p><p role="status" class="draft-status"></p><div class="action-row"><button type="button" class="button secondary" data-close>닫기</button><button type="submit" name="saveMode" value="draft" class="button secondary">미정으로 저장</button><button type="submit" name="saveMode" value="confirm" class="button primary">확정하여 등록</button></div></form>`;
  draftDialog.querySelector('[data-close]').onclick=()=>draftDialog.close();
  const form=draftDialog.querySelector('form');
  const kindField=document.createElement('label');kindField.textContent='일정 유형';const kindSelect=document.createElement('select');kindSelect.name='kind';for(const kind of ['미팅','실험','마감','논문 읽기']){const option=document.createElement('option');option.textContent=kind;option.selected=kind===(draft.kind||'미팅');kindSelect.append(option)}kindField.append(kindSelect);form.querySelector('.draft-date-fields').after(kindField);
  const adjust=()=>{form.querySelector('.draft-date-fields').hidden=form.elements.type.value==='paper';form.elements.source.parentElement.hidden=form.elements.type.value!=='paper';kindField.hidden=form.elements.type.value!=='event'};form.elements.type.onchange=adjust;adjust();
  form.onsubmit=async e=>{
    e.preventDefault();const values=Object.fromEntries(new FormData(form));values.title=values.title.trim();if(!values.title)return;
    const next={...draft,...values};const confirm=e.submitter?.value==='confirm';const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try{
      if(confirm){
        if(next.type==='event'&&!next.date)throw new Error('일정 날짜를 정하거나 미정으로 저장해 주세요.');
        const targetId='capture-'+draft.id;
        if(next.type==='paper'){
          const item={id:targetId,title:next.title,source:next.source,project:projectLabel(next.project),projectId:next.project,authors:'',status:'읽을 논문',progress:0,reading:{},annotations:[],notes:next.notes,captureOriginal:next.raw};
          const saved=await post('/api/papers',item);papers=papers.filter(p=>p.id!==targetId).concat(saved);cachePapers();renderPapers();renderReading();
        }else if(next.type==='event'){
          const updated=events.filter(x=>x.id!==targetId).concat({id:targetId,title:next.title,date:next.date,time:next.time,project:next.project,kind:next.kind,notes:next.notes,captureOriginal:next.raw});
          writeLocal('research-calendar-v1',updated);events=updated;renderCalendar();
        }else{
          const updated=tasks.filter(x=>x.id!==targetId).concat({id:targetId,title:next.title,projectId:next.project,project:projectLabel(next.project),dueDate:next.date,due:next.date||'날짜 없음',group:'inbox',done:false,priority:'low',notes:next.notes,captureOriginal:next.raw});
          writeLocal('research-os-tasks',updated);tasks=updated;renderTasks();renderKanban();renderCalendar();
        }
        next.state='confirmed';next.targetId=targetId;
      }
      persistDrafts(reviewDrafts.map(d=>d.id===id?next:d));renderReviewViews();draftDialog.close();notifyUser(confirm?'정식 항목으로 등록했습니다.':'미정 항목을 저장했습니다.');
    }catch(error){form.querySelector('.draft-status').textContent=error.existing_id?'이미 저장된 논문입니다. 제목 또는 링크를 확인해 주세요.':error.message}
    finally{buttons.forEach(b=>b.disabled=false)}
  };draftDialog.showModal();
}
const beforeReviewNavigate=navigate;navigate=function(id){beforeReviewNavigate(id);renderReviewViews()};
const beforeReviewPapers=renderPapers;renderPapers=function(...args){const result=beforeReviewPapers(...args);renderReviewViews();return result};
const beforeReviewCalendar=renderCalendar;renderCalendar=function(...args){const result=beforeReviewCalendar(...args);renderReviewViews();return result};
const beforeReviewKanban=renderKanban;renderKanban=function(...args){const result=beforeReviewKanban(...args);renderReviewViews();return result};
renderReviewViews();

// Project settings use stable IDs; historical names remain resolvable aliases.
const projectSettingsDialog=document.createElement('dialog');projectSettingsDialog.className='connection-dialog';document.body.append(projectSettingsDialog);
const customProjectStyle=document.createElement('style');document.head.append(customProjectStyle);
function projectColorMix(hex,white){const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16));return '#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(white<0?v*(1+white):v+(255-v)*white))).toString(16).padStart(2,'0')).join('')}
function applyProjectSettings(){
  customProjectStyle.textContent=projects.filter(p=>/^#[0-9a-f]{6}$/i.test(p.color||'')).map(p=>{
    const color=p.color,dark=projectColorMix(color,-.55);const palette=gardenPalette.find(c=>c.id===p.id);if(palette){palette.color=color;palette.shades=[color,projectColorMix(color,-.16),projectColorMix(color,-.32),dark]}
    return `.project-card[data-project="${p.id}"],#project-detail[data-project="${p.id}"]{--project-pastel:${color};--project-accent:${color};--project-ink:#384152}.color-${p.id}{background:${color};color:#384152}.meeting-tone-${p.theme}{--meeting-accent:${color};--meeting-tint:${projectColorMix(color,.8)}}`;
  }).join('');
  for(const p of projects){const palette=gardenPalette.find(c=>c.id===p.id);if(palette)palette.label=p.name}
}
function editProjectSettings(id){
  const p=projects.find(p=>p.id===id);if(!p)return;
  projectSettingsDialog.innerHTML=`<form><h2>프로젝트 수정</h2><label>이름<input name="name" required maxlength="80" value="${escapeHTML(p.name)}"></label><label>설명<textarea name="desc" rows="3" maxlength="1000">${escapeHTML(p.desc)}</textarea></label><label>색상<input name="color" type="color" value="${escapeHTML(p.color||gardenPalette.find(c=>c.id===id)?.color||'#C3D6F2')}"></label><label>상태<select name="status">${[...new Set([p.status,'준비 중','진행 중','보류','완료'])].map(s=>`<option ${s===p.status?'selected':''}>${escapeHTML(s)}</option>`).join('')}</select></label><label>다음 할 일<input name="next" maxlength="200" value="${escapeHTML(p.next)}"></label><p class="muted">이 브라우저에 저장됩니다. 이름을 바꿔도 연결된 논문·미팅·할 일은 유지됩니다.</p><p role="status"></p><div class="action-row"><button type="button" class="button secondary" data-close>취소</button><button class="button primary">저장</button></div></form>`;
  projectSettingsDialog.querySelector('[data-close]').onclick=()=>projectSettingsDialog.close();
  projectSettingsDialog.querySelector('form').onsubmit=e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.name=data.name.trim();const status=e.target.querySelector('[role=status]');
    if(!data.name||/[<>]/.test(data.name+data.desc+data.next)){status.textContent='이름을 입력하고 꺾쇠(< >) 없이 작성해 주세요.';return}
    if(projects.some(x=>x.id!==id&&(x.name===data.name||x.aliases?.includes(data.name)))){status.textContent='다른 프로젝트에서 사용하는 이름입니다.';return}
    const updated={...data,aliases:[...new Set([...(p.aliases||[]),p.name])]};
    try{const settings=readLocal('research-project-settings-v1',{});settings[id]=updated;writeLocal('research-project-settings-v1',settings);Object.assign(p,updated);applyProjectSettings();renderProjects();renderProjectDetail();renderMeetings();renderCalendar();renderReadingGarden();renderReviewViews();$('#agent-scope').innerHTML=projectOptions('all',true);projectSettingsDialog.close();notifyUser('프로젝트를 수정했습니다. 연결된 기록은 유지됩니다.')}catch{status.textContent='저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'}
  };projectSettingsDialog.showModal();
}
const beforeEditableProject=renderProjectDetail;
renderProjectDetail=function(){beforeEditableProject();if(!projects.some(p=>p.id===activeProject))return;const header=$('#project-detail .project-header');const button=document.createElement('button');button.className='button secondary';button.textContent='프로젝트 수정';button.style.marginTop='16px';button.onclick=()=>editProjectSettings(activeProject);header.firstElementChild.append(button)};
applyProjectSettings();renderProjects();renderReadingGarden();
