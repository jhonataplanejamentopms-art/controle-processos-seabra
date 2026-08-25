(() => {
  'use strict';
  const ready = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();

  ready(() => {
    const $ = (id) => document.getElementById(id);
    const cfg = window.APP_CONFIG || {};
    const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
    const client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

    let items = [];
    let profile = { perfil:'visualizador', nome:'', pode_receber_licitacao:false };
    let currentDetailId = null;
    let planningScope = 'ongoing';
    let licitacoes = [];

    const statuses = ['Planejamento','Cotando','Cotado','Aguard. Autorização','Enviado p/ Licitação','Edital Publicado','Concluído','Suspenso','Cancelado'];
    const types = ['Bem','Serviço','Obra','Serviço de Engenharia'];
    statuses.forEach(s => $('statusFilter')?.insertAdjacentHTML('beforeend', `<option>${esc(s)}</option>`));
    types.forEach(s => $('tipoFilter')?.insertAdjacentHTML('beforeend', `<option>${esc(s)}</option>`));

    function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
    function brDate(v){ if(!v) return '—'; const [y,m,d]=String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; }
    function money(v){ return (v==null||v==='') ? '—' : Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
    function dateOnly(v){ return v ? new Date(`${String(v).slice(0,10)}T12:00:00`) : null; }
    function today(){ const d=new Date(); d.setHours(12,0,0,0); return d; }
    function isWeekday(d){ const day=d.getDay(); return day!==0 && day!==6; }
    function addBusinessDays(dateStr, days){
      if(!dateStr || !days) return '';
      const d=dateOnly(dateStr); let remaining=Number(days);
      while(remaining>0){ d.setDate(d.getDate()+1); if(isWeekday(d)) remaining--; }
      return d.toISOString().slice(0,10);
    }
    function businessDaysDiff(fromDate,toDate){
      if(!fromDate || !toDate) return 0;
      let a=new Date(fromDate); let b=new Date(toDate); a.setHours(12,0,0,0); b.setHours(12,0,0,0);
      const sign=a<=b?1:-1; if(sign<0){ const t=a;a=b;b=t; }
      let count=0; const d=new Date(a);
      while(d<b){ d.setDate(d.getDate()+1); if(d<=b && isWeekday(d)) count++; }
      return count*sign;
    }
    function setLoginMsg(text,type=''){ const el=$('loginMsg'); if(el){ el.textContent=text||''; el.className=`login-msg ${type}`.trim(); } }

    function deadlineInfo(x){
      if(x.data_envio_licitacao) return {key:'enviado',label:`Planejamento concluído · ${brDate(x.data_envio_licitacao)}`,class:'sent',priority:4,days:0};
      if(['Concluído','Cancelado','Suspenso'].includes(x.situacao_geral)) return {key:'finalizado',label:x.situacao_geral,class:'neutral',priority:5,days:0};
      if(!x.data_limite_planejamento) return {key:'semlimite',label:'Sem data limite',class:'neutral',priority:3,days:null};
      const lim=dateOnly(x.data_limite_planejamento), now=today();
      if(lim<now){ const days=Math.abs(businessDaysDiff(lim,now)); return {key:'atrasado',label:`Atrasado há ${days} dia${days===1?'':'s'} útil${days===1?'':'eis'}`,class:'atrasado',priority:0,days:-days}; }
      const days=businessDaysDiff(now,lim);
      if(days===0) return {key:'vence7',label:'Vence hoje',class:'warn',priority:1,days:0};
      if(days<=7) return {key:'vence7',label:`Vence em ${days} dias úteis`,class:'warn',priority:1,days};
      return {key:'noprazo',label:`No prazo · ${days} dias úteis`,class:'ok',priority:2,days};
    }
    function enriched(x){ return {...x, deadline:deadlineInfo(x)}; }

    function uniqueValues(field){ return [...new Set(items.map(x => (x[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')); }
    function fillSelect(id, values, label){ const el=$(id); if(!el) return; const current=el.value; el.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option>${esc(v)}</option>`).join(''); if(values.includes(current)) el.value=current; }
    function fillDatalist(id, values){ const el=$(id); if(el) el.innerHTML=values.map(v=>`<option value="${esc(v)}"></option>`).join(''); }
    function refreshDynamicOptions(){
      fillSelect('secretariaFilter',uniqueValues('secretaria'),'Secretaria');
      fillSelect('responsavelFilter',uniqueValues('responsavel'),'Responsável');
      fillSelect('modalidadeFilter',uniqueValues('modalidade_prevista'),'Modalidade');
      fillDatalist('secretariasList',uniqueValues('secretaria'));
      fillDatalist('modalidadesList',uniqueValues('modalidade_prevista'));
    }

    function filtered(){
      const q=($('search')?.value||'').trim().toLowerCase();
      const filters={
        status:$('statusFilter')?.value||'', quote:$('quoteFilter')?.value||'', secretaria:$('secretariaFilter')?.value||'',
        responsavel:$('responsavelFilter')?.value||'', tipo:$('tipoFilter')?.value||'', modalidade:$('modalidadeFilter')?.value||'', prazo:$('prazoFilter')?.value||''
      };
      return items.map(enriched).filter(x=>{
        if(planningScope==='ongoing' && x.data_envio_licitacao) return false;
        const hay=[x.demanda,x.secretaria,x.responsavel,x.modalidade_prevista,x.observacoes,x.impedimentos].map(v=>(v||'').toLowerCase());
        return (!q||hay.some(v=>v.includes(q))) &&
          (!filters.status||x.situacao_geral===filters.status) && (!filters.quote||x.situacao_cotacao===filters.quote) &&
          (!filters.secretaria||x.secretaria===filters.secretaria) && (!filters.responsavel||x.responsavel===filters.responsavel) &&
          (!filters.tipo||x.tipo_objeto===filters.tipo) && (!filters.modalidade||x.modalidade_prevista===filters.modalidade) &&
          (!filters.prazo||x.deadline.key===filters.prazo);
      }).sort((a,b)=>{
        if(a.deadline.priority!==b.deadline.priority) return a.deadline.priority-b.deadline.priority;
        const ad=a.data_limite_planejamento||'9999-12-31', bd=b.data_limite_planejamento||'9999-12-31';
        if(ad!==bd) return ad.localeCompare(bd);
        return Number(a.numero||9999)-Number(b.numero||9999);
      });
    }

    function applyRole(){
      document.querySelectorAll('.editor-only').forEach(el=>el.classList.toggle('hidden',!['administrador','editor'].includes(profile.perfil)));
      document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',profile.perfil!=='administrador'));
    }

    function renderKpis(){
      const all=items.map(enriched), active=all.filter(x=>!x.data_envio_licitacao && !['Concluído','Cancelado','Suspenso'].includes(x.situacao_geral));
      const cards=[
        ['Carteira ativa',active.length,''], ['Em cotação',all.filter(x=>x.situacao_cotacao==='Cotando').length,'info'],
        ['Enviadas à licitação',all.filter(x=>x.data_envio_licitacao).length,'info'], ['Atrasadas',all.filter(x=>x.deadline.key==='atrasado').length,'danger'],
        ['A vencer em 7 dias',all.filter(x=>x.deadline.key==='vence7').length,'warn'], ['Com impedimento',all.filter(x=>(x.impedimentos||'').trim()).length,'warn'],
        ['Sem responsável',active.filter(x=>!(x.responsavel||'').trim()).length,'danger'], ['Concluídas',all.filter(x=>x.situacao_geral==='Concluído').length,'']
      ];
      $('kpis').innerHTML=cards.map(([a,b,c])=>`<div class="kpi ${c}"><small>${a}</small><b>${b}</b></div>`).join('');
    }

    function render(){
      const list=filtered();
      $('tbody').innerHTML=list.map((x,i)=>{
        const rowClass=x.deadline.key==='enviado'?'sent-row':x.deadline.key==='atrasado'?'overdue-row':x.deadline.key==='vence7'?'soon-row':'';
        return `<tr class="clickable-row ${rowClass}" data-id="${esc(x.id)}">
          <td>${x.numero??i+1}</td>
          <td><div class="demand-name"><span class="priority-dot ${x.deadline.key==='atrasado'?'red':x.deadline.key==='vence7'?'yellow':x.deadline.key==='enviado'?'green-strong':x.deadline.key==='noprazo'?'green':''}"></span>${esc(x.demanda)}</div>${x.impedimentos?`<small class="muted">Impedimento: ${esc(x.impedimentos)}</small>`:''}</td>
          <td>${esc(x.secretaria||'—')}</td><td>${esc(x.tipo_objeto||'—')}</td><td>${esc(x.modalidade_prevista||'—')}</td><td>${esc(x.situacao_cotacao||'—')}</td>
          <td>${brDate(x.data_limite_planejamento)}<br><span class="badge ${x.deadline.class}">${esc(x.deadline.label)}</span></td>
          <td>${brDate(x.data_envio_licitacao)}</td><td class="money">${money(x.valor_estimado)}</td><td>${esc(x.responsavel||'—')}</td>
          <td><span class="badge ${x.situacao_geral==='Concluído'?'ok':x.situacao_geral==='Suspenso'||x.situacao_geral==='Cancelado'?'neutral':''}">${esc(x.situacao_geral||'Sem status')}</span></td>
          <td><div class="actions editor-only"><button class="ghost" data-action="edit" data-id="${esc(x.id)}">Editar</button></div></td>
        </tr>`;
      }).join('');
      $('emptyState').classList.toggle('hidden',list.length>0);
      $('resultCount').textContent=`${list.length} processo${list.length===1?'':'s'}`;
      renderKpis(); applyRole();
    }

    async function loadProfile(){
      const {data:{user},error:userError}=await client.auth.getUser(); if(userError) throw userError; if(!user) throw new Error('Usuário não autenticado.');
      const {data,error}=await client.from('perfis').select('perfil,nome,ativo,modulo_planejamento,modulo_compras,modulo_licitacoes,pode_receber_licitacao').eq('id',user.id).single();
      if(error) throw error; profile=data||{perfil:'visualizador'}; if(!profile.ativo) throw new Error('Usuário desativado.');
      $('userBadge').textContent=`${profile.nome||user.email} · ${profile.perfil}`;
    }
    async function loadItems(){ if(!profile.modulo_planejamento){items=[];return;} const {data,error}=await client.from('planejamentos').select('*').order('numero',{ascending:true}); if(error) throw error; items=data||[]; refreshDynamicOptions(); render(); }

    function showModule(module){
      ['Licitacoes','Planejamento','Compras'].forEach(n=>$(`modulo${n}`)?.classList.add('hidden'));
      $(`modulo${module.charAt(0).toUpperCase()+module.slice(1)}`)?.classList.remove('hidden');
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.module===module));
    }


    function licitacaoDays(x){
      const start=x.encaminhado_em?dateOnly(x.encaminhado_em):null;
      if(!start) return '—';
      return `${businessDaysDiff(start,today())} dia${businessDaysDiff(start,today())===1?'':'s'} útil${businessDaysDiff(start,today())===1?'':'eis'}`;
    }
    function renderLicitacoes(){
      if(!$('licitacaoTbody')) return;
      $('licitacaoTbody').innerHTML=licitacoes.map(x=>`<tr>
        <td>${esc(x.numero_processo||'—')}</td><td><strong>${esc(x.objeto||'—')}</strong></td><td>${esc(x.secretaria||'—')}</td><td>${esc(x.modalidade||'—')}</td>
        <td>${brDate(x.encaminhado_em)}</td><td><span class="badge info">${esc(licitacaoDays(x))}</span></td>
        <td>${x.recebido_em?`<span class="badge received">Recebido em ${new Date(x.recebido_em).toLocaleString('pt-BR')}</span>`:'<span class="badge waiting">Aguardando recebimento</span>'}</td>
        <td>${esc(x.recebido_por_nome||'—')}</td>
        <td>${!x.recebido_em && profile.modulo_licitacoes && profile.pode_receber_licitacao?`<button class="receive-btn" data-receive="${esc(x.id)}">Dar recebimento</button>`:'—'}</td>
      </tr>`).join('');
      $('licitacaoEmpty')?.classList.toggle('hidden',licitacoes.length>0);
      if($('licitacaoResultCount')) $('licitacaoResultCount').textContent=`${licitacoes.length} processo${licitacoes.length===1?'':'s'}`;
      if($('licitacaoKpis')) $('licitacaoKpis').innerHTML=[['Total em Licitações',licitacoes.length],['Aguardando recebimento',licitacoes.filter(x=>!x.recebido_em).length],['Recebidos',licitacoes.filter(x=>x.recebido_em).length]].map(([a,b])=>`<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join('');
    }
    async function loadLicitacoes(){
      if(!profile.modulo_licitacoes){ licitacoes=[]; renderLicitacoes(); return; }
      const {data,error}=await client.rpc('listar_licitacoes_painel');
      if(error) throw error; licitacoes=data||[]; renderLicitacoes();
    }
    async function receiveLicitacao(id){
      if(!confirm('Confirmar o recebimento deste processo na etapa de Licitações?')) return;
      const {error}=await client.rpc('receber_licitacao',{p_licitacao_id:id});
      if(error){alert(error.message);return;} await loadLicitacoes();
    }

    function openDialog(x={}){
      const map={itemId:'id',f_nome:'demanda',f_secretaria:'secretaria',f_tipo:'tipo_objeto',f_modalidade:'modalidade_prevista',f_cotacoes:'situacao_cotacao',f_qtd_cotacoes:'qtd_cotacoes',f_inclusao:'data_inicio_planejamento',f_prazo_interno:'prazo_interno_dias',f_limite:'data_limite_planejamento',f_envio:'data_envio_licitacao',f_valor:'valor_estimado',f_responsavel:'responsavel',f_status:'situacao_geral',f_impedimentos:'impedimentos',f_obs:'observacoes'};
      Object.entries(map).forEach(([id,k])=>{ if($(id)) $(id).value=x[k]??''; });
      if(!x.id){ $('f_inclusao').value=new Date().toISOString().slice(0,10); $('f_prazo_interno').value='20'; $('f_limite').value=addBusinessDays($('f_inclusao').value,20); $('f_status').value='Planejamento'; }
      $('dialogTitle').textContent=x.id?'Editar demanda':'Nova demanda'; $('itemDialog').showModal();
    }

    function detailField(label,value,span=''){ return `<div class="detail-field ${span}"><small>${esc(label)}</small><div>${value||'—'}</div></div>`; }
    function openDetail(id){
      const x=items.find(v=>String(v.id)===String(id)); if(!x) return; currentDetailId=id; const d=deadlineInfo(x);
      $('detailTitle').textContent=`${x.numero?`Nº ${x.numero} · `:''}${x.demanda}`;
      $('detailContent').innerHTML=`<div class="detail-grid">
        ${detailField('Secretaria',esc(x.secretaria||'—'))}${detailField('Tipo',esc(x.tipo_objeto||'—'))}${detailField('Modalidade',esc(x.modalidade_prevista||'—'))}
        ${detailField('Situação das cotações',esc(x.situacao_cotacao||'—'))}${detailField('Qtd. cotações',x.qtd_cotacoes??'—')}${detailField('Situação geral',`<span class="badge">${esc(x.situacao_geral||'Sem status')}</span>`)}
        ${detailField('Início',brDate(x.data_inicio_planejamento))}${detailField('Prazo interno',x.prazo_interno_dias?`${x.prazo_interno_dias} dias úteis`:'—')}${detailField('Data limite',`${brDate(x.data_limite_planejamento)}<br><span class="badge ${d.class}">${esc(d.label)}</span>`)}
        ${detailField('Envio à Licitação',brDate(x.data_envio_licitacao))}${detailField('Valor estimado',money(x.valor_estimado))}${detailField('Responsável',esc(x.responsavel||'—'))}
        ${detailField('Impedimentos',esc(x.impedimentos||'Sem impedimentos'),'span-3')}${detailField('Observações',esc(x.observacoes||'Sem observações'),'span-3')}
        ${detailField('Criado em',x.criado_em?new Date(x.criado_em).toLocaleString('pt-BR'):'—')}${detailField('Atualizado em',x.atualizado_em?new Date(x.atualizado_em).toLocaleString('pt-BR'):'—')}
      </div>`;
      applyRole(); $('detailDialog').showModal();
    }

    function formatChange(k,oldV,newV){
      const labels={demanda:'Demanda',secretaria:'Secretaria',tipo_objeto:'Tipo',modalidade_prevista:'Modalidade',situacao_cotacao:'Situação da cotação',qtd_cotacoes:'Qtd. cotações',data_inicio_planejamento:'Início',prazo_interno_dias:'Prazo interno',data_limite_planejamento:'Data limite',data_envio_licitacao:'Envio à Licitação',valor_estimado:'Valor estimado',responsavel:'Responsável',situacao_geral:'Situação geral',impedimentos:'Impedimentos',observacoes:'Observações'};
      if(!(k in labels)) return '';
      const fmt=(v)=>k.startsWith('data_')?brDate(v):(k==='valor_estimado'?money(v):(v==null||v===''?'—':String(v)));
      return `<div><strong>${labels[k]}:</strong> ${esc(fmt(oldV))} → ${esc(fmt(newV))}</div>`;
    }
    async function openHistory(){
      if(!currentDetailId) return; $('historyContent').innerHTML='<div class="history-empty">Carregando...</div>'; $('historyDialog').showModal();
      let data=null,error=null;
      const rpc=await client.rpc('historico_planejamento_detalhado',{p_planejamento_id:currentDetailId});
      if(!rpc.error){ data=rpc.data; } else {
        const fallback=await client.from('historico_planejamentos').select('*').eq('planejamento_id',currentDetailId).order('criado_em',{ascending:false}); data=fallback.data; error=fallback.error;
      }
      if(error){ $('historyContent').innerHTML=`<div class="history-empty">${esc(error.message)}</div>`; return; }
      if(!data?.length){ $('historyContent').innerHTML='<div class="history-empty">Nenhum histórico encontrado.</div>'; return; }
      $('historyContent').innerHTML=data.map(h=>{
        const oldD=h.dados_anteriores||{}, newD=h.dados_novos||{}; const keys=[...new Set([...Object.keys(oldD),...Object.keys(newD)])];
        const changes=h.acao==='ALTERACAO'?keys.filter(k=>JSON.stringify(oldD[k])!==JSON.stringify(newD[k])).map(k=>formatChange(k,oldD[k],newD[k])).filter(Boolean).join(''):'';
        return `<div class="history-item"><div class="history-meta"><strong>${esc(h.acao||'ALTERAÇÃO')} · ${esc(h.usuario_nome||h.nome_usuario||'Usuário')}</strong><span>${new Date(h.criado_em).toLocaleString('pt-BR')}</span></div><div class="history-changes">${changes|| (h.acao==='CRIACAO'?'Registro criado.':h.acao==='EXCLUSAO'?'Registro excluído.':'Alteração registrada.')}</div></div>`;
      }).join('');
    }

    async function enterApp(){ await loadProfile(); if(profile.modulo_planejamento) await loadItems(); if(profile.modulo_licitacoes) await loadLicitacoes(); $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); showModule(profile.modulo_planejamento?'planejamento':'licitacoes'); }
    async function doLogin(email,password){ if(!configured) throw new Error('Supabase não configurado.'); const {data,error}=await client.auth.signInWithPassword({email,password}); if(error) throw error; if(!data?.session) throw new Error('Sessão não criada.'); }

    $('loginForm')?.addEventListener('submit',async e=>{ e.preventDefault(); setLoginMsg('Entrando...','info'); $('loginBtn').disabled=true; try{ await doLogin(($('email').value||'').trim(),$('password').value||''); await enterApp(); setLoginMsg(''); }catch(err){ setLoginMsg(`Erro: ${err?.message||'Falha ao entrar.'}`,'error'); }finally{$('loginBtn').disabled=false;} });
    $('logoutBtn')?.addEventListener('click',async()=>{ await client.auth.signOut(); $('appView').classList.add('hidden'); $('loginView').classList.remove('hidden'); });
    $('navLicitacoes')?.addEventListener('click',async()=>{if(!profile.modulo_licitacoes)return alert('Usuário sem acesso ao módulo Licitações.');await loadLicitacoes();showModule('licitacoes');}); $('navPlanejamento')?.addEventListener('click',()=>{if(!profile.modulo_planejamento)return alert('Usuário sem acesso ao módulo Planejamento.');showModule('planejamento');}); $('navCompras')?.addEventListener('click',()=>showModule('compras'));
    $('scopeOngoing')?.addEventListener('click',()=>{planningScope='ongoing';$('scopeOngoing').classList.add('active');$('scopeAll').classList.remove('active');render();});
    $('scopeAll')?.addEventListener('click',()=>{planningScope='all';$('scopeAll').classList.add('active');$('scopeOngoing').classList.remove('active');render();});
    $('licitacaoTbody')?.addEventListener('click',e=>{const b=e.target.closest('[data-receive]');if(b)receiveLicitacao(b.dataset.receive);});
    ['search','statusFilter','quoteFilter','secretariaFilter','responsavelFilter','tipoFilter','modalidadeFilter','prazoFilter'].forEach(id=>$(id)?.addEventListener('input',render));
    $('clearFilters')?.addEventListener('click',()=>{ ['search','statusFilter','quoteFilter','secretariaFilter','responsavelFilter','tipoFilter','modalidadeFilter','prazoFilter'].forEach(id=>{if($(id))$(id).value='';}); render(); });
    $('printBtn')?.addEventListener('click',()=>window.print());
    $('exportBtn')?.addEventListener('click',()=>{
      const data=filtered().map(x=>({'Nº':x.numero,'Demanda':x.demanda,'Secretaria':x.secretaria,'Tipo':x.tipo_objeto,'Modalidade':x.modalidade_prevista,'Cotação':x.situacao_cotacao,'Qtd. Cotações':x.qtd_cotacoes,'Início':brDate(x.data_inicio_planejamento),'Prazo Interno':x.prazo_interno_dias,'Data Limite':brDate(x.data_limite_planejamento),'Situação do Prazo':x.deadline.label,'Envio à Licitação':brDate(x.data_envio_licitacao),'Valor Estimado':x.valor_estimado,'Responsável':x.responsavel,'Situação Geral':x.situacao_geral,'Impedimentos':x.impedimentos,'Observações':x.observacoes}));
      const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Planejamento'); XLSX.writeFile(wb,'planejamento_filtrado.xlsx');
    });
    $('newBtn')?.addEventListener('click',()=>openDialog()); $('closeDialog')?.addEventListener('click',()=>$('itemDialog').close()); $('cancelBtn')?.addEventListener('click',()=>$('itemDialog').close());
    $('f_inclusao')?.addEventListener('change',()=>{ if($('f_inclusao').value&&$('f_prazo_interno').value) $('f_limite').value=addBusinessDays($('f_inclusao').value,$('f_prazo_interno').value); });
    $('f_prazo_interno')?.addEventListener('change',()=>{ if($('f_inclusao').value&&$('f_prazo_interno').value) $('f_limite').value=addBusinessDays($('f_inclusao').value,$('f_prazo_interno').value); });
    $('tbody')?.addEventListener('click',e=>{ const btn=e.target.closest('button[data-action]'); if(btn){e.stopPropagation(); if(btn.dataset.action==='edit'){const x=items.find(v=>String(v.id)===String(btn.dataset.id)); if(x)openDialog(x);} return;} const row=e.target.closest('tr[data-id]'); if(row) openDetail(row.dataset.id); });
    $('closeDetail')?.addEventListener('click',()=>$('detailDialog').close()); $('detailEditBtn')?.addEventListener('click',()=>{const x=items.find(v=>String(v.id)===String(currentDetailId)); $('detailDialog').close(); if(x)openDialog(x);});
    $('historyBtn')?.addEventListener('click',openHistory); $('closeHistory')?.addEventListener('click',()=>$('historyDialog').close());
    $('detailDeleteBtn')?.addEventListener('click',async()=>{ if(profile.perfil!=='administrador'||!currentDetailId)return; if(!confirm('Excluir definitivamente esta demanda? Esta ação ficará registrada no histórico.'))return; const {error}=await client.from('planejamentos').delete().eq('id',currentDetailId); if(error)return alert(error.message); $('detailDialog').close(); await loadItems(); });
    $('itemForm')?.addEventListener('submit',async e=>{
      e.preventDefault(); const id=$('itemId').value;
      const payload={demanda:$('f_nome').value.trim(),secretaria:$('f_secretaria').value.trim()||null,tipo_objeto:$('f_tipo').value||null,modalidade_prevista:$('f_modalidade').value.trim()||null,situacao_cotacao:$('f_cotacoes').value||null,qtd_cotacoes:$('f_qtd_cotacoes').value===''?null:Number($('f_qtd_cotacoes').value),data_inicio_planejamento:$('f_inclusao').value||null,prazo_interno_dias:$('f_prazo_interno').value===''?null:Number($('f_prazo_interno').value),data_limite_planejamento:$('f_limite').value||null,data_envio_licitacao:$('f_envio').value||null,valor_estimado:$('f_valor').value===''?null:Number($('f_valor').value),responsavel:$('f_responsavel').value.trim()||null,situacao_geral:$('f_status').value||null,impedimentos:$('f_impedimentos').value.trim()||null,observacoes:$('f_obs').value.trim()||null};
      if(payload.data_envio_licitacao) payload.situacao_geral='Enviado p/ Licitação';
      const res=id?await client.from('planejamentos').update(payload).eq('id',id):await client.from('planejamentos').insert(payload); if(res.error)return alert(res.error.message); $('itemDialog').close(); await loadItems(); if(profile.modulo_licitacoes) await loadLicitacoes();
    });

    (async()=>{ if(!configured){setLoginMsg('Erro: configuração do Supabase não encontrada.','error');return;} try{const {data,error}=await client.auth.getSession(); if(error)throw error; if(data?.session)await enterApp();}catch(err){setLoginMsg(`Erro: ${err?.message||'Falha ao iniciar.'}`,'error');} })();
  });
})();
