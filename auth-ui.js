// Tokens remain server-side. Only a short-lived CSRF value lives in page memory.
(() => {
  let state=null, catalog=[];
  const bar=document.createElement('div');bar.className='ai-connection-bar';
  bar.innerHTML='<div><strong id="ai-connection-label">AI 연결 확인 중…</strong><small>논문 분석 연결 · ChatGPT 플랜 / 선택적 API 키</small></div><button class="button secondary" id="open-ai-settings">AI 연결 설정</button>';
  $('.main').prepend(bar);
  const dialog=document.createElement('dialog');dialog.className='auth-settings';document.body.append(dialog);
  function statusLabel(){if(!state)return 'AI 연결 서버를 확인해 주세요';if(state.provider==='api_key')return 'OpenAI API 키 · 별도 과금';if(!state.connected)return 'ChatGPT 로그인 필요';if(!state.plan_enabled)return 'ChatGPT 사용 권한 승인 필요';if(!state.model)return 'ChatGPT 연결됨 · 모델 선택 필요';return 'ChatGPT 플랜 · '+state.model}
  function message(text){const element=dialog.querySelector('#auth-message');if(element)element.textContent=text;else notifyUser(text)}
  async function refresh(){state=await api('/api/auth/status');window.researchAuthCsrf=state.csrf;$('#ai-connection-label').textContent=statusLabel();return state}
  async function action(fn){try{await fn()}catch(error){message(error.message)}}
  function draw(){
    dialog.innerHTML=`<p class="eyebrow">AI CONNECTION</p><h2>ChatGPT로 논문 분석하기</h2><p>기존 구독의 허용 범위에서 사용합니다. 로그인만으로 기존 대화나 메모리가 전달되지는 않습니다.</p><p class="auth-status" id="auth-message" role="status">${escapeHTML(statusLabel())}</p>
      <label>연결 방식<select id="ai-provider"><option value="chatgpt" ${state?.provider!=='api_key'?'selected':''}>ChatGPT 플랜 (기본)</option><option value="api_key" ${state?.provider==='api_key'?'selected':''} ${state?.api_key_available?'':'disabled'}>OpenAI API 키 (별도 과금)</option></select></label>
      <label>저장된 ChatGPT 계정<select id="chatgpt-account"><option value="">새 계정 연결</option>${(state?.accounts||[]).map(a=>`<option value="${escapeHTML(a.id)}" ${a.id===state.active?'selected':''}>${escapeHTML(a.label)}${a.signed_in?'':' · 로그아웃됨'}</option>`).join('')}</select></label>
      <div class="action-row"><button class="chatgpt-login" id="chatgpt-signin" ${state?.dependency_ready?'':'disabled'}>Continue with ChatGPT</button><button class="button secondary" id="chatgpt-consent" ${state?.active?'':'disabled'}>사용 권한 승인</button></div>
      ${state&&!state.dependency_ready?'<p class="muted">로그인 보안 라이브러리가 필요합니다. 프로젝트의 start.command로 실행해 주세요.</p>':''}
      <label>분석 모델<select id="chatgpt-model"><option value="">모델 목록을 불러온 뒤 선택하세요</option>${catalog.map(m=>`<option value="${escapeHTML(m.slug)}" ${m.slug===state?.model?'selected':''}>${escapeHTML(m.name)}</option>`).join('')}</select></label>
      <div class="action-row"><button class="button secondary" id="refresh-models" ${state?.connected&&state?.plan_enabled?'':'disabled'}>모델 목록 새로고침</button><button class="button secondary" id="chatgpt-logout" ${state?.connected?'':'disabled'}>로그아웃</button></div>
      <small>계정·앱의 사용 한도가 적용됩니다. 실패하거나 한도가 소진되어도 API 키 방식으로 자동 전환하지 않습니다. 로그인 정보는 이 컴퓨터의 보호된 파일에만 보관합니다.</small><p><a href="https://chatgpt.com/#settings" target="_blank" rel="noopener noreferrer">ChatGPT 설정에서 사용량·앱 권한 확인 ↗</a></p><div class="action-row"><button class="button primary" id="close-ai-settings">닫기</button></div>`;
    $('#close-ai-settings').onclick=()=>dialog.close();
    $('#ai-provider').onchange=e=>action(async()=>{const provider=e.target.value;if(provider==='api_key'&&!confirm('OpenAI API는 ChatGPT 구독과 별도로 과금됩니다. API 키 방식으로 전환할까요?')){draw();return}await post('/api/auth/configure',{provider});await refresh();draw()});
    $('#chatgpt-account').onchange=e=>action(async()=>{catalog=[];if(e.target.value){await post('/api/auth/configure',{account:e.target.value});await refresh();draw();if(state.connected&&state.plan_enabled)await loadModels()}else{message('Continue with ChatGPT를 눌러 새 계정 또는 워크스페이스를 연결하세요.')}});
    $('#chatgpt-signin').onclick=()=>action(()=>signIn($('#chatgpt-account').value||null,false));
    $('#chatgpt-consent').onclick=()=>action(()=>signIn($('#chatgpt-account').value||null,true));
    $('#refresh-models').onclick=()=>action(loadModels);
    $('#chatgpt-model').onchange=e=>action(async()=>{if(!e.target.value)return;await post('/api/auth/configure',{model:e.target.value});await refresh();message('분석 모델을 저장했습니다. 논문 상세의 AI 분석 버튼을 사용할 수 있습니다.')});
    $('#chatgpt-logout').onclick=()=>action(async()=>{message('연결을 해제하는 중…');const result=await post('/api/auth/logout',{});catalog=[];await refresh();draw();message(result.message)});
  }
  async function loadModels(){message('이 계정에서 사용 가능한 모델을 불러오는 중…');const result=await post('/api/auth/models',{});catalog=result.models;await refresh();draw();if(!catalog.length)message('표시할 모델이 없습니다. 계정의 연동 지원 여부와 사용 권한을 확인하세요.')}
  async function signIn(account,consent){
    if(location.hostname!=='127.0.0.1'){
      const next=new URL(location.href);next.hostname='127.0.0.1';next.search='?connect-chatgpt=1';
      notifyUser('안전한 로컬 로그인 주소로 이동합니다.');location.assign(next.href);return;
    }
    $('#chatgpt-signin').disabled=true;message('OpenAI 로그인 화면으로 이동합니다…');
    try{const result=await post('/api/auth/start',{account,consent});const url=new URL(result.url);if(url.origin!=='https://auth.openai.com')throw new Error('로그인 주소를 확인할 수 없습니다.');location.assign(url.href)}catch(error){$('#chatgpt-signin').disabled=false;throw error}
  }
  async function open(){try{await refresh()}catch(e){state=null;draw();message(e.message);if(!dialog.open)dialog.showModal();return}draw();if(!dialog.open)dialog.showModal();if(state.connected&&state.plan_enabled)await action(loadModels)}
  $('#open-ai-settings').onclick=open;
  window.ensureResearchAI=async()=>{try{await refresh();if(state.provider==='api_key'&&state.api_key_available)return true;if(state.connected&&state.plan_enabled&&state.model)return true;await open();return false}catch(error){notifyUser(error.message);return false}};
  const params=new URLSearchParams(location.search);const loginMessage=params.get('auth_message');const start=params.has('connect-chatgpt');
  if(loginMessage||start)history.replaceState(null,'',location.pathname+location.hash);
  refresh().then(async()=>{if(loginMessage){await open();message(loginMessage)}else if(start){await open();await action(()=>signIn(state.active,false))}}).catch(()=>{$('#ai-connection-label').textContent='서버 실행·재시작 필요 · start.command를 열어주세요'});
})();
