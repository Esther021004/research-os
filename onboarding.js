// Empty-state and project creation UI, shared by personal and clean releases.
function refreshWorkspaceSummary(){
  const lede=$('#dashboard .page-intro .lede');
  if(lede)lede.textContent=`프로젝트 ${projects.length}개 · 진행 중인 할 일 ${tasks.filter(t=>!t.done).length}개 · 읽는 논문 ${papers.filter(p=>p.status==='읽는 중').length}편`;
  for(const [page,count] of [['projects',projects.length],['papers',papers.length],['inbox',tasks.filter(t=>!t.done).length]]){
    const badge=$(`.nav-link[data-page="${page}"] .nav-count`) || $(`.nav-link[data-page="${page}"] b`);
    if(badge)badge.textContent=count;
  }
  for(const group of ['inbox','planned','progress','waiting']){
    const badge=$(`#${group}-column`)?.parentElement.querySelector('.kanban-head b');
    if(badge)badge.textContent=tasks.filter(t=>t.group===group&&!t.done).length;
  }
  const focus=$('#dashboard .focus-card');
  focus.querySelector('h2').textContent=projects.length?'다음 연구 단계를 기록해 보세요.':'첫 프로젝트를 만들어보세요.';
  focus.querySelector('p:not(.eyebrow)').textContent='논문, 할 일, 미팅을 프로젝트에 연결해 관리할 수 있습니다.';
  const button=focus.querySelector('button');button.textContent=projects.length?'프로젝트 보기 →':'+ 프로젝트 만들기';
  button.onclick=()=>projects.length?navigate('projects'):createProject();
}

function syncProjectChoices(){
  $('#add-dialog select').innerHTML='<option value="미분류">기타 (미분류)</option>'+projects.map(p=>`<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`).join('');
  $('#agent-scope').innerHTML=projectOptions('all',true);
  if(window.RESEARCH_CLEAN)gardenPalette.splice(0,gardenPalette.length,...projects.map(p=>({id:p.id,label:p.name,color:p.color||'#C3D6F2',shades:[0,-.16,-.32,-.55].map(n=>projectColorMix(p.color||'#C3D6F2',n))})),{id:'none',label:'기타',color:'#C3D6F2',shades:['#C3D6F2','#ABC4E6','#91AFDA','#789CCE']});
  applyProjectSettings();
}

function createProject(){
  connectionDialog.innerHTML=`<form id="create-project-form"><p class="eyebrow">NEW PROJECT</p><h2>프로젝트 만들기</h2><label>이름<input name="name" required maxlength="80" placeholder="새 연구의 이름"></label><label>간단한 설명<textarea name="desc" maxlength="1000" rows="3"></textarea></label><label>색상<input name="color" type="color" value="#FFD6DA"></label><p class="muted">빈 프로젝트로 시작합니다. 논문·할 일·미팅은 나중에 연결할 수 있어요.</p><p role="status"></p><div class="action-row"><button type="button" class="button secondary" data-cancel>취소</button><button class="button primary">프로젝트 만들기</button></div></form>`;
  connectionDialog.querySelector('[data-cancel]').onclick=closeConnection;
  $('#create-project-form').onsubmit=e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.name=data.name.trim();
    const status=e.target.querySelector('[role=status]');
    if(!data.name||/[<>]/.test(data.name+data.desc)){status.textContent='이름을 입력하고 꺾쇠(< >)는 제외해 주세요.';return}
    if(projects.some(p=>p.name===data.name||p.aliases?.includes(data.name))){status.textContent='이미 사용하는 프로젝트 이름입니다.';return}
    const id='project-'+uid();const p={...data,id,theme:id,symbol:'◇',progress:0,status:'준비 중',next:'다음 단계를 정해보세요',aliases:[]};
    try{
      const created=readLocal('research-created-projects-v1',[]);writeLocal('research-created-projects-v1',[...created,p]);
    }catch{status.textContent='저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.';return}
    projects.push(p);activeProject=id;closeConnection();syncProjectChoices();renderProjects();renderCalendar();renderMeetings();renderReadingGarden();updateAgentCounts();openProject(id);refreshWorkspaceSummary();
  };
  connectionDialog.showModal();
}

const renderWorkspaceProjects=renderProjects;
renderProjects=function(){
  renderWorkspaceProjects();
  if(!projects.length)for(const root of [$('#project-cards'),$('#all-project-cards')]){
    root.innerHTML='<section class="panel"><h2>아직 프로젝트가 없어요.</h2><p class="muted">내 연구 주제부터 하나씩 추가해 보세요.</p><button class="button primary" data-first-project>+ 첫 프로젝트 만들기</button></section>';
    root.querySelector('button').onclick=createProject;
  }
  refreshWorkspaceSummary();
};
const projectIntro=$('#projects .page-intro');
const existingProjectButton=projectIntro.querySelector('button');
const newProjectButton=existingProjectButton||document.createElement('button');
newProjectButton.className='button primary';newProjectButton.textContent='+ 프로젝트 만들기';newProjectButton.onclick=createProject;
if(!existingProjectButton)projectIntro.append(newProjectButton);
const workspaceReading=renderReading;
renderReading=function(){workspaceReading();if(!papers.some(p=>p.status==='읽는 중'))$('#reading-list').innerHTML='<p class="muted">읽고 있는 논문이 없습니다. 라이브러리에 첫 논문을 추가해 보세요.</p>';refreshWorkspaceSummary()};
const workspaceTasks=renderTasks;
renderTasks=function(){workspaceTasks();refreshWorkspaceSummary()};
syncProjectChoices();renderProjects();renderReading();renderTasks();renderKanban();renderReadingGarden();updateAgentCounts();
