(() => {
  'use strict';
  const ready = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();

  ready(() => {
    const $ = (id) => document.getElementById(id);
    const cfg = window.APP_CONFIG || {};
    const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
    const client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

    let items = [];
    let profile = { perfil:'visualizador', nome:'', pode_receber_licitacao:false }; let protocolView='all';
    let currentDetailId = null;
    let planningScope = 'ongoing';
    let licitacoes = [];

    const statuses = ['Planejamento','Cotando','Cotado','Aguard. Autorização','Enviado p/ Protocolo','Edital Publicado','Concluído','Suspenso','Cancelado'];
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
    const NEXT_TAG='[PRÓXIMA PROVIDÊNCIA]';
    function splitObs(v){
      const s=String(v||''); const idx=s.indexOf(NEXT_TAG);
      if(idx<0) return {obs:s,proxima:''};
      const before=s.slice(0,idx).trim(); const after=s.slice(idx+NEXT_TAG.length).trim();
      const end=after.indexOf('\n\n');
      return end<0?{obs:before,proxima:after}:{obs:[before,after.slice(end+2).trim()].filter(Boolean).join('\n\n'),proxima:after.slice(0,end).trim()};
    }
    function joinObs(obs,proxima){ const o=String(obs||'').trim(),p=String(proxima||'').trim(); return [p?`${NEXT_TAG} ${p}`:'',o].filter(Boolean).join('\n\n')||null; }

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

    function openDialog(x=null){
      try{
        const novo=!x, set=(id,val)=>{const el=$(id);if(el)el.value=val??'';};
        if($('dialogTitle')) $('dialogTitle').textContent=novo?'Nova demanda':'Editar demanda';
        set('itemId',x?.id||''); set('f_nome',x?.demanda||''); set('f_secretaria',x?.secretaria||'');
        set('f_tipo',x?.tipo_objeto||''); set('f_modalidade',x?.modalidade_prevista||''); set('f_cotacoes',x?.situacao_cotacao||'');
        set('f_inclusao',x?.data_inicio_planejamento?String(x.data_inicio_planejamento).slice(0,10):'');
        set('f_limite',x?.data_limite_planejamento?String(x.data_limite_planejamento).slice(0,10):'');
        set('f_envio',x?.data_envio_licitacao?String(x.data_envio_licitacao).slice(0,10):''); set('f_valor',x?.valor_estimado??'');
        set('f_responsavel',x?.responsavel||''); set('f_status',x?.situacao_geral||'Planejamento'); set('f_impedimentos',x?.impedimentos||'');
        const obs=splitObs(x?.observacoes); set('f_obs',obs.obs); set('f_proxima',obs.proxima);
        const dlg=$('itemDialog'); if(!dlg) throw new Error('Janela de Planejamento não encontrada.'); dlg.showModal();
      }catch(err){ alert('Erro ao abrir o formulário do Planejamento: '+(err?.message||err)); }
    }



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
        const hay=[x.demanda,x.secretaria,x.responsavel,x.modalidade_prevista,x.observacoes,x.impedimentos,splitObs(x.observacoes).proxima].map(v=>(v||'').toLowerCase());
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
      const perfil=String(profile.perfil||'').trim().toLowerCase();
      // Quem possui acesso ao módulo Planejamento pode criar/editar demandas.
      // As funções internas do setor não devem bloquear a operação do módulo.
      const podeEditar=!!profile.modulo_planejamento && (['editor','administrador'].includes(String(profile.nivel_planejamento||profile.perfil||'').toLowerCase()) || perfil==='administrador'||perfil==='admin');
      document.querySelectorAll('.editor-only').forEach(el=>el.classList.toggle('hidden',!podeEditar));
      document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',!(perfil==='administrador'||perfil==='admin')));
    }

    function renderKpis(){
      const all=items.map(enriched), active=all.filter(x=>!x.data_envio_licitacao && !['Concluído','Cancelado','Suspenso'].includes(x.situacao_geral));
      const cards=[
        ['Carteira ativa',active.length,''], ['Em cotação',all.filter(x=>x.situacao_cotacao==='Cotando').length,'info'],
        ['Enviadas ao Protocolo',all.filter(x=>x.data_envio_licitacao).length,'info'], ['Atrasadas',all.filter(x=>x.deadline.key==='atrasado').length,'danger'],
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
          <td>${brDate(x.data_envio_licitacao)}</td><td class="money">${money(x.valor_estimado)}</td><td>${esc(x.responsavel||'—')}</td><td>${esc(splitObs(x.observacoes).proxima||'—')}</td>
          <td><span class="badge ${x.situacao_geral==='Concluído'?'ok':x.situacao_geral==='Suspenso'||x.situacao_geral==='Cancelado'?'neutral':''}">${esc(x.situacao_geral||'Sem status')}</span></td>
          <td><div class="actions editor-only"><button class="ghost" data-action="edit" data-id="${esc(x.id)}">Editar</button></div></td>
        </tr>`;
      }).join('');
      $('emptyState').classList.toggle('hidden',list.length>0);
      $('resultCount').textContent=`${list.length} processo${list.length===1?'':'s'}`;
      renderKpis(); applyRole();
    }

    function weekRange(){
      const now=new Date(); now.setHours(12,0,0,0);
      const back=now.getDay()===0?6:now.getDay()-1;
      const start=new Date(now); start.setDate(now.getDate()-back);
      return {start,end:new Date(now),startIso:start.toISOString().slice(0,10),endIso:now.toISOString().slice(0,10)};
    }
    async function buildWeeklyWhatsapp(){
      const r=weekRange(), all=items.map(enriched);
      const active=all.filter(x=>!x.data_envio_licitacao&&!['Concluído','Cancelado','Suspenso'].includes(x.situacao_geral));
      const sent=all.filter(x=>{const d=dateOnly(x.data_envio_licitacao);return d&&d>=r.start&&d<=r.end;});
      let concluded=[];
      try{
        const {data,error}=await client.from('historico_planejamentos').select('*').gte('criado_em',r.startIso+'T00:00:00').lte('criado_em',r.endIso+'T23:59:59');
        if(!error&&data){
          const ids=new Set(data.filter(h=>h.dados_novos?.situacao_geral==='Concluído'&&h.dados_anteriores?.situacao_geral!=='Concluído').map(h=>String(h.planejamento_id)));
          concluded=all.filter(x=>ids.has(String(x.id)));
        }
      }catch(_){}
      const overdue=active.filter(x=>x.deadline.key==='atrasado'), impeded=active.filter(x=>(x.impedimentos||'').trim()), due7=active.filter(x=>x.deadline.key==='vence7');
      const next=active.filter(x=>splitObs(x.observacoes).proxima).slice(0,8);
      const fmt=d=>d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
      const list=(arr,fn)=>arr.length?arr.map(x=>'• '+fn(x)).join('\n'):'• Nenhuma';
      const attention=[...new Map([...overdue,...impeded].map(x=>[String(x.id),x])).values()].slice(0,8);
      return ['📊 *ACOMPANHAMENTO SEMANAL – PLANEJAMENTO*','📅 Período: '+fmt(r.start)+' a '+fmt(r.end),'','📌 *CENÁRIO ATUAL*','• Demandas em andamento: '+active.length,'• Em cotação: '+active.filter(x=>x.situacao_cotacao==='Cotando').length,'• Atrasadas: '+overdue.length,'• Com impedimento: '+impeded.length,'• A vencer em 7 dias: '+due7.length,'','✅ *ENVIADAS AO PROTOCOLO NA SEMANA*',list(sent,x=>x.demanda+' — '+brDate(x.data_envio_licitacao)),'','🏁 *CONCLUÍDAS NA SEMANA*',list(concluded,x=>x.demanda),'','⚠️ *PONTOS DE ATENÇÃO*',list(attention,x=>x.demanda+' — '+(x.impedimentos||x.deadline.label)),'','📋 *PRÓXIMAS PROVIDÊNCIAS*',list(next,x=>x.demanda+' — '+splitObs(x.observacoes).proxima),'','🏛️ Planejamento | Prefeitura Municipal de Seabra'].join('\n');
    }
    async function openWeeklyWhatsapp(){ const ta=$('weeklyWhatsappText'); ta.value='Gerando resumo...'; $('weeklyWhatsappDialog').showModal(); ta.value=await buildWeeklyWhatsapp(); }

    async function loadProfile(){
      const {data:{user},error:userError}=await client.auth.getUser(); if(userError) throw userError; if(!user) throw new Error('Usuário não autenticado.');
      const {data,error}=await client.from('perfis').select('id,perfil,nome,ativo,modulo_planejamento,modulo_compras,modulo_licitacoes,pode_receber_licitacao,nivel_planejamento,nivel_licitacoes,nivel_compras').eq('id',user.id).maybeSingle();
      if(error) throw error;
      if(!data) throw new Error('Cadastro aguardando aprovação do administrador.');
      profile=data;
      if(!profile.ativo) throw new Error('Cadastro aguardando aprovação ou usuário desativado.');
      $('userBadge').textContent=`${profile.nome||user.email} · ${profile.perfil}`;
    }
    async function loadItems(){ if(!profile.modulo_planejamento){items=[];return;} const {data,error}=await client.from('planejamentos').select('*').order('numero',{ascending:true}); if(error) throw error; items=data||[]; refreshDynamicOptions(); render(); }


    function showModule(module){
      ['Licitacoes','Planejamento','Compras','EtapaLicitacao'].forEach(n=>$(`modulo${n}`)?.classList.add('hidden'));
      $(`modulo${module.charAt(0).toUpperCase()+module.slice(1)}`)?.classList.remove('hidden');
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.module===module));
    }


    function protocolStatus(x){
      if(x.status_recebimento==='Cancelado'||x.situacao==='Cancelado') return 'Cancelado';
      if(x.status_recebimento==='Pendente'||x.situacao==='Pendente') return 'Pendente';
      if(x.responsavel) return 'Distribuído';
      if(x.recebido_em) return 'Aguardando distribuição';
      return 'Aguardando recebimento';
    }
    function protocolWeekRange(){
      const now=today(), start=new Date(now); const day=start.getDay(); start.setDate(start.getDate()-(day===0?6:day-1));
      return {start,end:now};
    }
    function protocolDateTime(v){
      if(!v) return '—'; const d=new Date(v); if(Number.isNaN(d.getTime())) return brDate(v);
      return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    }
    function buildWeeklyProtocol(){
      const r=protocolWeekRange(), startKey=r.start.toISOString().slice(0,10), endKey=r.end.toISOString().slice(0,10);
      const fmt=d=>d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
      const inWeek=v=>{const k=String(v||'').slice(0,10);return k&&k>=startKey&&k<=endKey;};
      const entrada=licitacoes.filter(x=>inWeek(x.encaminhado_em));
      const recebidas=licitacoes.filter(x=>inWeek(x.recebido_em));
      const distribuidas=licitacoes.filter(x=>inWeek(x.distribuido_em));
      const aguardaReceb=licitacoes.filter(x=>protocolStatus(x)==='Aguardando recebimento');
      const aguardaDist=licitacoes.filter(x=>protocolStatus(x)==='Aguardando distribuição');
      const pendentes=licitacoes.filter(x=>protocolStatus(x)==='Pendente');
      const atrasadas=licitacoes.filter(x=>x.data_limite_execucao && String(x.data_limite_execucao).slice(0,10)<endKey && protocolStatus(x)==='Distribuído');
      const list=(arr,fn)=>arr.length?arr.map(x=>'• '+fn(x)).join('\n'):'• Nenhuma';
      return ['📋 *RESUMO SEMANAL – LICITAÇÕES / PROTOCOLO*','📅 Período: '+fmt(r.start)+' a '+fmt(r.end),'',
        '📊 *POSIÇÃO ATUAL*','• Total no painel: '+licitacoes.length,'• Aguardando recebimento: '+aguardaReceb.length,'• Aguardando distribuição: '+aguardaDist.length,'• Distribuídas: '+licitacoes.filter(x=>protocolStatus(x)==='Distribuído').length,'• Pendentes: '+pendentes.length,'• Prazo vencido: '+atrasadas.length,'',
        '📥 *ENTRADAS NA SEMANA*',list(entrada,x=>(x.objeto||'Demanda')+' — '+(x.secretaria||'Sem secretaria')),'',
        '✅ *RECEBIDAS NA SEMANA*',list(recebidas,x=>(x.objeto||'Demanda')+' — '+protocolDateTime(x.recebido_em)),'',
        '👤 *DISTRIBUÍDAS NA SEMANA*',list(distribuidas,x=>(x.objeto||'Demanda')+' → '+(x.responsavel||'Sem responsável')+(x.data_limite_execucao?' | limite '+brDate(x.data_limite_execucao):'')),'',
        '⚠️ *PONTOS DE ATENÇÃO*',list([...aguardaReceb,...aguardaDist,...pendentes,...atrasadas].filter((x,i,a)=>a.findIndex(y=>String(y.id)===String(x.id))===i),x=>(x.objeto||'Demanda')+' — '+protocolStatus(x)+(x.data_limite_execucao?' | '+brDate(x.data_limite_execucao):'')),'',
        '🏛️ Licitações - Protocolo | Prefeitura Municipal de Seabra'].join('\n');
    }
    function openWeeklyProtocol(){ $('weeklyProtocolText').value=buildWeeklyProtocol(); $('weeklyProtocolDialog').showModal(); }

    function protocolDeadline(x){
      if(!x.data_limite_execucao) return '';
      const d=dateOnly(x.data_limite_execucao), now=today();
      if(d<now) return 'atrasado'; const n=businessDaysDiff(now,d); return n<=2?'vence7':'noprazo';
    }
    function protocolCanEdit(){return String(profile.nivel_licitacoes||'').toLowerCase()==='editor'||['administrador','admin'].includes(String(profile.perfil||'').toLowerCase());}
    function isMaster(){return ['administrador','admin'].includes(String(profile.perfil||'').toLowerCase());}
    function demandPhase(x){if(x?.encaminhado_licitacao_em)return 'Licitação';if(x?.recebido_em||x?.origem==='Protocolo')return 'Protocolo';return 'Planejamento';}
    function isMyProtocol(x){const me=String(profile.nome||'').trim().toLowerCase(), r=String(x.responsavel||'').trim().toLowerCase(); if(!me||!r)return false; return me===r||me.startsWith(r+' ')||r.startsWith(me.split(' ')[0]);}
    function renderLicitacoes(){
      if(!$('licitacaoTbody')) return;
      const mine=licitacoes.filter(isMyProtocol); if($('protocolMineCount')) $('protocolMineCount').textContent=mine.length?'('+mine.length+')':'';
      const source=protocolView==='mine'?mine:licitacoes;
      const q=($('protocolSearch')?.value||'').toLowerCase(), st=$('protocolStatus')?.value||'';
      const list=source.filter(x=>{const s=protocolStatus(x); const hay=[x.objeto,x.secretaria,x.responsavel,x.tipo_demanda,x.referencia].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!st||s===st);});
      $('licitacaoTbody').innerHTML=list.map(x=>{const s=protocolStatus(x), dl=protocolDeadline(x);return `<tr>
        <td>${brDate(x.encaminhado_em||x.criado_em)}</td><td>${esc(x.tipo_demanda||'Processo Licitatório')}</td><td><button type="button" class="link-button" data-protocol-history="${esc(x.id)}"><strong>${esc(x.objeto||'—')}</strong></button></td><td>${esc(x.secretaria||'—')}</td>
        <td>${x.recebido_em?new Date(x.recebido_em).toLocaleString('pt-BR'):'—'}</td><td>${esc(x.responsavel||'—')}</td><td>${x.distribuido_em?new Date(x.distribuido_em).toLocaleString('pt-BR'):'—'}</td>
        <td>${x.prazo_execucao_dias?esc(x.prazo_execucao_dias)+' dias úteis':'—'}</td><td>${x.data_limite_execucao?`<span class="badge ${dl}">${brDate(x.data_limite_execucao)}</span>`:'—'}</td><td><span class="badge ${x.situacao_execucao==='Concluída'?'ok':x.situacao_execucao==='Pendente'?'warn':s==='Distribuído'?'info':''}">${esc(x.situacao_execucao&&x.responsavel?x.situacao_execucao:s)}</span></td>
        <td>${protocolView==='mine'&&isMyProtocol(x)&&x.responsavel?`<button class="primary" data-progress="${esc(x.id)}">Atualizar andamento</button> ${x.situacao_execucao==='Concluída'&&!x.encaminhado_licitacao_em&&(x.tipo_demanda==='Processo Licitatório'||!!x.planejamento_id)?`<button class="ghost" data-forward="${esc(x.id)}">Encaminhar p/ Licitação</button>`:''}`:!x.recebido_em&&profile.pode_receber_licitacao&&protocolCanEdit()?`<button class="receive-btn" data-receive="${esc(x.id)}">Receber</button>`:x.recebido_em&&!x.responsavel&&protocolCanEdit()?`<button class="primary" data-distribute="${esc(x.id)}">Distribuir</button>`:'—'}</td>
      </tr>`;}).join('');
      $('licitacaoEmpty')?.classList.toggle('hidden',list.length>0); $('licitacaoResultCount').textContent=`${list.length} demanda${list.length===1?'':'s'}`;
      const stats=[['Aguardando recebimento',source.filter(x=>protocolStatus(x)==='Aguardando recebimento').length],['Aguardando distribuição',source.filter(x=>protocolStatus(x)==='Aguardando distribuição').length],['Distribuídas',source.filter(x=>protocolStatus(x)==='Distribuído').length],['Pendentes',source.filter(x=>protocolStatus(x)==='Pendente').length]];
      $('licitacaoKpis').innerHTML=stats.map(([n,v])=>`<div class="kpi"><small>${n}</small><b>${v}</b></div>`).join('');
    }
    async function openProtocolHistory(id){
      const x=licitacoes.find(v=>String(v.id)===String(id)); if(!x)return;
      $('protocolHistoryTitle').textContent=x.objeto||'Histórico da demanda';
      $('protocolHistorySummary').innerHTML=`<div class="detail-grid">${detailField('Tipo',esc(x.tipo_demanda||'Processo Licitatório'))}${detailField('Modalidade',esc(x.modalidade||'—'))}${detailField('Secretaria',esc(x.secretaria||'—'))}${detailField('Responsável',esc(x.responsavel||'—'))}${detailField('Situação atual',esc(x.situacao_execucao||protocolStatus(x)))}${detailField('Próxima providência',esc(x.proxima_providencia||'—'),'span-3')}</div>`;
      $('protocolHistoryContent').innerHTML='<div class="history-empty">Carregando histórico...</div>';
      $('masterDemandId').value=id; $('protocolMasterActions')?.classList.toggle('hidden',!isMaster()); $('protocolHistoryDialog').showModal();
      const {data,error}=await client.from('licitacoes_andamentos').select('id,situacao,andamento,proxima_providencia,impedimento,criado_por,criado_em').eq('licitacao_id',id).order('criado_em',{ascending:false});
      if(error){$('protocolHistoryContent').innerHTML=`<div class="history-empty">${esc(error.message)}</div>`;return;}
      const rows=data||[], hasReceiptEvent=rows.some(r=>r.situacao==='Recebida'), hasDistributionEvent=rows.some(r=>r.situacao==='Distribuída');
      const inicio=`<div class="history-item"><div class="history-meta"><strong>Entrada no Protocolo</strong><span>${protocolDateTime(x.encaminhado_em||x.criado_em)}</span></div><div class="history-changes">Demanda registrada${x.origem?' via '+esc(x.origem):''}.</div></div>`;
      const receb=x.recebido_em&&!hasReceiptEvent?`<div class="history-item"><div class="history-meta"><strong>Recebimento</strong><span>${protocolDateTime(x.recebido_em)}</span></div><div class="history-changes">Demanda recebida no Protocolo.</div></div>`:'';
      const dist=x.distribuido_em&&!hasDistributionEvent?`<div class="history-item"><div class="history-meta"><strong>Distribuição</strong><span>${protocolDateTime(x.distribuido_em)}</span></div><div class="history-changes">Distribuída para <strong>${esc(x.responsavel||'—')}</strong>${x.data_limite_execucao?' · prazo até '+brDate(x.data_limite_execucao):''}${x.observacao_distribuicao?'<br>'+esc(x.observacao_distribuicao):''}</div></div>`:'';
      const ands=rows.map(r=>`<div class="history-item"><div class="history-meta"><strong>${esc(r.situacao||'Andamento')}</strong><span>${protocolDateTime(r.criado_em)}</span></div><div class="history-changes"><strong>Andamento:</strong> ${esc(r.andamento||'—')}${r.proxima_providencia?'<br><strong>Próxima providência:</strong> '+esc(r.proxima_providencia):''}${r.impedimento?'<br><strong>Impedimento/observação:</strong> '+esc(r.impedimento):''}</div></div>`).join('');
      $('protocolHistoryContent').innerHTML=ands+dist+receb+inicio;
    }
    function openMasterDemand(id){
      if(!isMaster()) return;
      const x=licitacoes.find(v=>String(v.id)===String(id)); if(!x)return;
      $('masterDemandId').value=id; const phase=demandPhase(x), ret=$('masterReturnDemand');
      ret.disabled=phase==='Planejamento';
      ret.querySelector('small').textContent=phase==='Licitação'?'Devolve a demanda para o Protocolo, preservando todo o histórico.':phase==='Protocolo'?'Devolve a demanda para o Planejamento, preservando todo o histórico.':'A demanda já está na primeira fase.';
      $('protocolHistoryDialog')?.close(); $('masterDemandDialog').showModal();
    }
    async function masterReturnDemand(){
      if(!isMaster())return; const id=$('masterDemandId').value,x=licitacoes.find(v=>String(v.id)===String(id));if(!x)return;
      const phase=demandPhase(x);if(phase==='Planejamento')return alert('A demanda já está na primeira fase.');
      const destino=phase==='Licitação'?'Protocolo':'Planejamento';
      if(!confirm('Deseja retornar esta demanda de '+phase+' para '+destino+'? O histórico será preservado.'))return;
      const {error}=await client.rpc('admin_retornar_demanda',{p_licitacao_id:id});
      if(error)return alert('Não foi possível retornar a demanda: '+error.message);
      $('masterDemandDialog').close();await loadLicitacoes();if(profile.modulo_planejamento)await loadItems();alert('Demanda retornada para '+destino+'.');
    }
    async function masterDeleteDemand(){
      if(!isMaster())return;const id=$('masterDemandId').value,x=licitacoes.find(v=>String(v.id)===String(id));if(!x)return;
      if(!confirm('ATENÇÃO: esta ação excluirá definitivamente a demanda e todos os registros relacionados.\n\nDeseja continuar?'))return;
      if(!confirm('Confirma a EXCLUSÃO TOTAL da demanda "'+(x.objeto||'Demanda')+'"? Esta ação não poderá ser desfeita.'))return;
      const {error}=await client.rpc('admin_excluir_demanda_total',{p_licitacao_id:id});
      if(error)return alert('Não foi possível excluir a demanda: '+error.message);
      $('masterDemandDialog').close();await loadLicitacoes();if(profile.modulo_planejamento)await loadItems();alert('Demanda excluída totalmente.');
    }
    function renderEtapaLicitacao(){
      if(!$('etapaLicitacaoTbody'))return;
      const all=licitacoes.filter(x=>x.encaminhado_licitacao_em);
      const finais=['Homologado','Fracassado','Deserto','Revogado','Anulado'];
      if($('etapaLicitacaoCount'))$('etapaLicitacaoCount').textContent=all.length?'('+all.filter(x=>!finais.includes(x.situacao_execucao)).length+')':'';
      const q=($('etapaLicitacaoSearch')?.value||'').toLowerCase(),st=$('etapaLicitacaoStatus')?.value||'',scope=$('etapaLicitacaoScope')?.value||'ongoing';
      const list=all.filter(x=>{const sit=x.situacao_execucao||'Encaminhada à Licitação',fin=finais.includes(sit),hay=[x.objeto,x.secretaria,x.modalidade,x.responsavel_licitacao,x.numero_licitacao].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!st||sit===st)&&(scope==='all'||(scope==='finished'?fin:!fin));});
      const hoje=new Date().toISOString().slice(0,10);
      $('etapaLicitacaoTbody').innerHTML=list.map(x=>{const ds=String(x.data_sessao||'').slice(0,10),fin=finais.includes(x.situacao_execucao),late=ds&&ds<hoje&&!fin&&!['Sessão realizada','Em julgamento/habilitação'].includes(x.situacao_execucao),soon=ds&&ds>=hoje&&businessDaysDiff(new Date(),dateOnly(ds))<=3&&!fin;const prazo=late?'🔴 '+brDate(ds):soon?'🟡 '+brDate(ds):brDate(ds);return `<tr><td><button type="button" class="link-button" data-lic-history="${esc(x.id)}"><strong>${esc(x.objeto||'—')}</strong></button>${x.numero_licitacao?'<br><small>'+esc(x.numero_licitacao)+'</small>':''}</td><td>${esc(x.modalidade||'—')}</td><td>${esc(x.secretaria||'—')}</td><td>${esc(x.responsavel_licitacao||'—')}</td><td>${prazo}</td><td><span class="badge info">${esc(x.situacao_execucao||'Encaminhada à Licitação')}</span></td><td><button class="primary" data-lic-progress="${esc(x.id)}">Atualizar</button></td></tr>`;}).join('');
      $('etapaLicitacaoEmpty')?.classList.toggle('hidden',list.length>0);$('etapaLicitacaoResultCount').textContent=`${list.length} processo${list.length===1?'':'s'}`;
      const abertas=all.filter(x=>!finais.includes(x.situacao_execucao)),proximas=abertas.filter(x=>{const d=String(x.data_sessao||'').slice(0,10);return d&&d>=hoje&&businessDaysDiff(new Date(),dateOnly(d))<=3;}).length,atrasadas=abertas.filter(x=>{const d=String(x.data_sessao||'').slice(0,10);return d&&d<hoje&&!['Sessão realizada','Em julgamento/habilitação'].includes(x.situacao_execucao);}).length;
      $('etapaLicitacaoKpis').innerHTML=[['Em andamento',abertas.length],['Sessões próximas',proximas],['Sessões vencidas',atrasadas],['Finalizados',all.length-abertas.length]].map(([n,v])=>`<div class="kpi"><small>${n}</small><b>${v}</b></div>`).join('');
    }
    async function loadLicitacoes(){
      if(!profile.modulo_licitacoes){ licitacoes=[]; renderLicitacoes(); return; }
      const {data,error}=await client.rpc('listar_licitacoes_painel'); if(error) throw error;
      // A função antiga do painel não retorna os novos campos do Protocolo.
      // Busca esses campos diretamente e combina pelo id para refletir a distribuição imediatamente.
      const {data:dist,error:distError}=await client.from('licitacoes').select('id,responsavel,distribuido_em,prazo_execucao_dias,data_limite_execucao,observacao_distribuicao,tipo_demanda,referencia,solicitante,prioridade,origem,modalidade,situacao_execucao,proxima_providencia,impedimento_execucao,execucao_iniciada_em,execucao_concluida_em,encaminhado_licitacao_em,responsavel_licitacao,data_sessao,numero_licitacao,data_publicacao,data_homologacao,valor_homologado');
      if(distError) throw distError;
      const distMap=new Map((dist||[]).map(x=>[String(x.id),x]));
      (data||[]).forEach(x=>Object.assign(x,distMap.get(String(x.id))||{}));
      // Marco inicial do novo Protocolo (01/10/2026): o painel não carrega o histórico anterior.
      // Durante a fase de testes, mantém somente duas demandas legadas:
      // 1 aguardando recebimento e 1 aguardando distribuição.
      const base=(data||[]);
      // Marco inicial do Protocolo: preserva Caixa de Som para teste e passa a exibir
      // toda demanda efetivamente encaminhada pelo Planejamento a partir de 01/10/2026.
      const caixa=base.find(x=>String(x.objeto||'').toLowerCase().includes('caixa de som'));
      const novas=base.filter(x=>{
        const enviado=String(x.encaminhado_em||x.criado_em||'').slice(0,10);
        return (x.origem==='Protocolo'||enviado>='2026-10-01') && x.id!==caixa?.id;
      });
      licitacoes=[...(caixa?[caixa]:[]),...novas];
      renderLicitacoes(); renderEtapaLicitacao();
    }
    async function receiveLicitacao(id){
      if(!protocolCanEdit()||!profile.pode_receber_licitacao)return alert('Você não possui permissão para receber demandas.');
      if(!confirm('Confirmar o recebimento desta demanda? A data e hora serão registradas.')) return;
      const {error}=await client.rpc('receber_licitacao',{p_licitacao_id:id}); if(error){alert(error.message);return;} await loadLicitacoes();
    }
    function openDistribution(id){
      if(!protocolCanEdit())return alert('Seu acesso ao Protocolo é somente para visualização.');
      const x=licitacoes.find(v=>String(v.id)===String(id)); if(!x)return;
      $('pd_id').value=id; $('pd_responsavel').value=''; $('pd_prazo').value=''; $('pd_limite').value=''; $('pd_obs').value=''; $('protocolDistributeDialog').showModal();
    }
    function calcDistributionLimit(){ const base=new Date().toISOString().slice(0,10); $('pd_limite').value=$('pd_prazo').value?addBusinessDays(base,Number($('pd_prazo').value)):''; }

    function detailField(label,value,span=''){ return `<div class="detail-field ${span}"><small>${esc(label)}</small><div>${value||'—'}</div></div>`; }
    function openDetail(id){
      const x=items.find(v=>String(v.id)===String(id)); if(!x) return; currentDetailId=id; const d=deadlineInfo(x);
      $('detailTitle').textContent=`${x.numero?`Nº ${x.numero} · `:''}${x.demanda}`;
      $('detailContent').innerHTML=`<div class="detail-grid">
        ${detailField('Secretaria',esc(x.secretaria||'—'))}${detailField('Tipo',esc(x.tipo_objeto||'—'))}${detailField('Modalidade',esc(x.modalidade_prevista||'—'))}
        ${detailField('Situação das cotações',esc(x.situacao_cotacao||'—'))}${detailField('Situação geral',`<span class="badge">${esc(x.situacao_geral||'Sem status')}</span>`)}
        ${detailField('Início',brDate(x.data_inicio_planejamento))}${detailField('Data limite',`${brDate(x.data_limite_planejamento)}<br><span class="badge ${d.class}">${esc(d.label)}</span>`)}
        ${detailField('Envio ao Protocolo',brDate(x.data_envio_licitacao))}${detailField('Valor estimado',money(x.valor_estimado))}${detailField('Responsável',esc(x.responsavel||'—'))}
        ${detailField('Próxima providência',esc(splitObs(x.observacoes).proxima||'Sem providência registrada'),'span-3')}${detailField('Impedimentos',esc(x.impedimentos||'Sem impedimentos'),'span-3')}${detailField('Observações',esc(splitObs(x.observacoes).obs||'Sem observações'),'span-3')}
        ${detailField('Criado em',x.criado_em?new Date(x.criado_em).toLocaleString('pt-BR'):'—')}${detailField('Atualizado em',x.atualizado_em?new Date(x.atualizado_em).toLocaleString('pt-BR'):'—')}
      </div>`;
      applyRole(); $('detailDialog').showModal();
    }

    function formatChange(k,oldV,newV){
      const labels={demanda:'Demanda',secretaria:'Secretaria',tipo_objeto:'Tipo',modalidade_prevista:'Modalidade',situacao_cotacao:'Situação da cotação',data_inicio_planejamento:'Início',data_limite_planejamento:'Data limite',data_envio_licitacao:'Envio ao Protocolo',valor_estimado:'Valor estimado',responsavel:'Responsável',situacao_geral:'Situação geral',impedimentos:'Impedimentos',observacoes:'Observações'};
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

    function signupMsg(t,type=''){const el=$('signupMsg');if(el){el.textContent=t||'';el.className='login-msg '+type;}}
    async function requestSignup(){
      const nome=$('su_nome').value.trim(), email=$('su_email').value.trim(), senha=$('su_senha').value, senha2=$('su_senha2').value;
      if(senha!==senha2) throw new Error('As senhas não conferem.');
      if(senha.length<8) throw new Error('A senha deve possuir pelo menos 8 caracteres.');
      const {data,error}=await client.auth.signUp({email,password:senha,options:{data:{nome,solicitacao_acesso:true}}});
      if(error) throw error;
      await client.auth.signOut();
      return data;
    }
    async function loadAdminUsers(){
      const {data,error}=await client.from('perfis').select('id,nome,email,perfil,ativo,modulo_planejamento,modulo_licitacoes,modulo_compras,pode_receber_licitacao,nivel_planejamento,nivel_licitacoes,nivel_compras').order('nome');
      if(error) throw error;
      $('adminUsersList').innerHTML=(data||[]).map(u=>`<div class="table-card" style="padding:14px;margin-bottom:10px"><strong>${esc(u.nome||u.email||'Usuário')}</strong><div class="muted">${esc(u.email||'')} · ${u.ativo?'Ativo':'Aguardando/Bloqueado'}</div><div class="form-grid" style="margin-top:10px"><label>Planejamento<select data-level="nivel_planejamento" data-uid="${esc(u.id)}"><option value="sem_acesso">Sem acesso</option><option value="visualizador" ${u.nivel_planejamento==='visualizador'?'selected':''}>Visualizador</option><option value="editor" ${u.nivel_planejamento==='editor'?'selected':''}>Editor</option></select></label><label>Licitações / Protocolo<select data-level="nivel_licitacoes" data-uid="${esc(u.id)}"><option value="sem_acesso">Sem acesso</option><option value="visualizador" ${u.nivel_licitacoes==='visualizador'?'selected':''}>Visualizador</option><option value="editor" ${u.nivel_licitacoes==='editor'?'selected':''}>Editor</option></select></label><label>Compras<select data-level="nivel_compras" data-uid="${esc(u.id)}"><option value="sem_acesso">Sem acesso</option><option value="visualizador" ${u.nivel_compras==='visualizador'?'selected':''}>Visualizador</option><option value="editor" ${u.nivel_compras==='editor'?'selected':''}>Editor</option></select></label></div><label style="display:block;margin:10px 0"><input type="checkbox" data-special="pode_receber_licitacao" data-uid="${esc(u.id)}" ${u.pode_receber_licitacao?'checked':''}> Pode receber demandas do Protocolo</label><button class="primary user-approve" data-uid="${esc(u.id)}">${u.ativo?'Salvar permissões':'Aprovar e liberar'}</button> <button class="ghost user-block" data-uid="${esc(u.id)}">${u.ativo?'Bloquear':'Manter bloqueado'}</button></div>`).join('')||'<p>Nenhum usuário encontrado.</p>';
    }

    async function enterApp(){ await loadProfile(); if(profile.modulo_planejamento) await loadItems(); if(profile.modulo_licitacoes) await loadLicitacoes(); $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); applyRole(); const inicial=profile.modulo_planejamento?'planejamento':profile.modulo_licitacoes?'licitacoes':profile.modulo_compras?'compras':null; if(inicial) showModule(inicial); }
    async function doLogin(email,password){ if(!configured) throw new Error('Supabase não configurado.'); const {data,error}=await client.auth.signInWithPassword({email,password}); if(error) throw error; if(!data?.session) throw new Error('Sessão não criada.'); }

    $('openSignupBtn')?.addEventListener('click',()=>{$('signupForm').reset();signupMsg('');$('signupDialog').showModal();});
    $('closeSignup')?.addEventListener('click',()=>$('signupDialog').close()); $('cancelSignup')?.addEventListener('click',()=>$('signupDialog').close());
    $('signupForm')?.addEventListener('submit',async e=>{e.preventDefault();signupMsg('Enviando...','info');try{await requestSignup();signupMsg('Solicitação enviada. Aguarde a aprovação do administrador.','info');setTimeout(()=>$('signupDialog').close(),1800);}catch(err){signupMsg('Erro: '+(err?.message||err),'error');}});
    $('adminUsersBtn')?.addEventListener('click',async()=>{try{await loadAdminUsers();$('adminUsersDialog').showModal();}catch(err){alert(err.message);}});
    $('closeAdminUsers')?.addEventListener('click',()=>$('adminUsersDialog').close());
    $('adminUsersList')?.addEventListener('click',async e=>{const b=e.target.closest('[data-uid]');if(!b||(!b.classList.contains('user-approve')&&!b.classList.contains('user-block')))return;const id=b.dataset.uid;if(b.classList.contains('user-block')){const {error}=await client.from('perfis').update({ativo:false}).eq('id',id);if(error)return alert(error.message);return loadAdminUsers();}const card=b.closest('.table-card'),payload={ativo:true,perfil:'editor'}; card.querySelectorAll('select[data-level]').forEach(c=>payload[c.dataset.level]=c.value); payload.modulo_planejamento=payload.nivel_planejamento!=='sem_acesso'; payload.modulo_licitacoes=payload.nivel_licitacoes!=='sem_acesso'; payload.modulo_compras=payload.nivel_compras!=='sem_acesso'; const special=card.querySelector('input[data-special="pode_receber_licitacao"]'); payload.pode_receber_licitacao=!!special?.checked;const {data:salvo,error}=await client.from('perfis').update(payload).eq('id',id).select('id,nome,nivel_planejamento,nivel_licitacoes,nivel_compras,ativo').maybeSingle();if(error)return alert('Não foi possível salvar: '+error.message);if(!salvo)return alert('Nenhuma alteração foi gravada. Verifique as permissões do administrador.');await loadAdminUsers();const aviso=$('adminUsersNotice');if(aviso){aviso.textContent='✓ Alterações de '+(salvo.nome||'usuário')+' salvas com sucesso.';aviso.classList.remove('hidden');aviso.style.background='#e8f5e9';aviso.style.color='#1b5e20';setTimeout(()=>aviso.classList.add('hidden'),4000);} });
    $('loginForm')?.addEventListener('submit',async e=>{ e.preventDefault(); setLoginMsg('Entrando...','info'); $('loginBtn').disabled=true; try{ await doLogin(($('email').value||'').trim(),$('password').value||''); await enterApp(); setLoginMsg(''); }catch(err){ await client.auth.signOut(); setLoginMsg(`Erro: ${err?.message||'Falha ao entrar.'}`,'error'); }finally{$('loginBtn').disabled=false;} });
    $('logoutBtn')?.addEventListener('click',async()=>{ await client.auth.signOut(); $('appView').classList.add('hidden'); $('loginView').classList.remove('hidden'); });
    $('navMinhasDemandas')?.addEventListener('click',async()=>{if(!profile.modulo_licitacoes)return alert('Usuário sem acesso ao Protocolo.');await loadLicitacoes();protocolView='mine';showModule('licitacoes');document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));$('navMinhasDemandas').classList.add('active');renderLicitacoes();});
    $('newProtocolBtn')?.addEventListener('click',()=>{if(!protocolCanEdit())return alert('Seu acesso ao Protocolo é somente para visualização.'); $('p_tipo').value=''; $('p_novo_tipo').value=''; $('p_novo_tipo_wrap').classList.add('hidden'); $('p_modalidade').value=''; $('p_outra_modalidade').value=''; $('p_modalidade_wrap').classList.add('hidden'); $('p_outra_modalidade_wrap').classList.add('hidden'); $('protocolNewDialog').showModal(); });
    $('p_secretaria')?.addEventListener('change',()=>{const outro=$('p_secretaria').value==='__outro__';$('p_outra_secretaria_wrap')?.classList.toggle('hidden',!outro);if(outro)$('p_outra_secretaria')?.focus();});
    $('p_tipo')?.addEventListener('change',()=>{ const novo=$('p_tipo').value==='__novo__', proc=$('p_tipo').value==='Processo Licitatório'; $('p_novo_tipo_wrap').classList.toggle('hidden',!novo); $('p_novo_tipo').required=novo; $('p_modalidade_wrap')?.classList.toggle('hidden',!proc); $('p_modalidade').required=proc; if(novo) $('p_novo_tipo').focus(); });
    $('p_modalidade')?.addEventListener('change',()=>{const outra=$('p_modalidade').value==='Outra';$('p_outra_modalidade_wrap')?.classList.toggle('hidden',!outra);$('p_outra_modalidade').required=outra;if(outra)$('p_outra_modalidade').focus();});
    $('closeProtocolNew')?.addEventListener('click',()=>$('protocolNewDialog').close()); $('cancelProtocolNew')?.addEventListener('click',()=>$('protocolNewDialog').close());
    $('closeProtocolDistribute')?.addEventListener('click',()=>$('protocolDistributeDialog').close()); $('cancelProtocolDistribute')?.addEventListener('click',()=>$('protocolDistributeDialog').close());
    $('pd_prazo')?.addEventListener('input',calcDistributionLimit); $('protocolSearch')?.addEventListener('input',renderLicitacoes); $('protocolStatus')?.addEventListener('change',renderLicitacoes);
    $('licitacaoTbody')?.addEventListener('click',e=>{const h=e.target.closest('[data-protocol-history]'),r=e.target.closest('[data-receive]'),d=e.target.closest('[data-distribute]'),p=e.target.closest('[data-progress]'),f=e.target.closest('[data-forward]');if(h){openProtocolHistory(h.dataset.protocolHistory);return;}if(r)receiveLicitacao(r.dataset.receive);if(d)openDistribution(d.dataset.distribute);if(p){const x=licitacoes.find(v=>String(v.id)===String(p.dataset.progress));$('pa_id').value=p.dataset.progress;$('pa_situacao').value=x?.situacao_execucao==='Não iniciada'?'Em andamento':(x?.situacao_execucao||'Em andamento');$('pa_andamento').value='';$('pa_proxima').value=x?.proxima_providencia||'';$('pa_impedimento').value=x?.impedimento_execucao||'';$('protocolProgressDialog').showModal();}if(f){$('pf_id').value=f.dataset.forward;$('pf_responsavel').value='';$('pf_data').value='';$('pf_obs').value='';$('protocolForwardDialog').showModal();}});
    $('protocolNewForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      if(!protocolCanEdit()) return alert('Seu acesso ao Protocolo é somente para visualização.');
      const tipo=$('p_tipo').value==='__novo__'?$('p_novo_tipo').value.trim():$('p_tipo').value;
      const assunto=$('p_assunto').value.trim();
      if(!tipo||!assunto) return alert('Informe o tipo de demanda e o assunto.');
      const btn=e.submitter; if(btn){btn.disabled=true;btn.textContent='Cadastrando...';}
      const payload={
        planejamento_id:null,
        objeto:assunto,
        secretaria:($('p_secretaria').value==='__outro__'?$('p_outra_secretaria').value.trim():$('p_secretaria').value)||null,
        tipo_demanda:tipo,
        modalidade:tipo==='Processo Licitatório'?($('p_modalidade').value==='Outra'?($('p_outra_modalidade').value.trim()||null):($('p_modalidade').value||null)):null,
        referencia:$('p_referencia').value.trim()||null,
        solicitante:$('p_solicitante').value.trim()||null,
        prioridade:$('p_prioridade').value||'Normal',
        origem:'Protocolo',
        observacoes:$('p_observacao').value.trim()||null,
        status_recebimento:'Aguardando recebimento',
        criado_por:profile.id||null
      };
      const {data:created,error}=await client.from('licitacoes').insert(payload).select('id').maybeSingle();
      if(error) alert('Não foi possível cadastrar a demanda: '+error.message);
      else if(!created) alert('A demanda não foi gravada. Verifique a permissão de inclusão no Supabase.');
      else { $('protocolNewDialog').close(); $('protocolNewForm').reset(); $('p_novo_tipo_wrap').classList.add('hidden'); await loadLicitacoes(); }
      if(btn){btn.disabled=false;btn.textContent='Cadastrar';}
    });
    $('closeProtocolHistory')?.addEventListener('click',()=>$('protocolHistoryDialog').close());
    $('masterManageDemand')?.addEventListener('click',()=>openMasterDemand($('masterDemandId').value));
    $('closeMasterDemand')?.addEventListener('click',()=>$('masterDemandDialog').close());
    $('cancelMasterDemand')?.addEventListener('click',()=>$('masterDemandDialog').close());
    $('masterReturnDemand')?.addEventListener('click',masterReturnDemand);
    $('masterDeleteDemand')?.addEventListener('click',masterDeleteDemand);
    $('closeProtocolProgress')?.addEventListener('click',()=>$('protocolProgressDialog').close()); $('cancelProtocolProgress')?.addEventListener('click',()=>$('protocolProgressDialog').close());
    $('closeProtocolForward')?.addEventListener('click',()=>$('protocolForwardDialog').close()); $('cancelProtocolForward')?.addEventListener('click',()=>$('protocolForwardDialog').close());
    $('protocolProgressForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=$('pa_id').value,x=licitacoes.find(v=>String(v.id)===String(id));if(!x||!isMyProtocol(x))return alert('Somente o responsável designado pode atualizar esta demanda.');const sit=$('pa_situacao').value,andamento=$('pa_andamento').value.trim(),proxima=$('pa_proxima').value.trim(),imp=$('pa_impedimento').value.trim(),agora=new Date().toISOString();if(!andamento)return alert('Informe o andamento ou providência realizada.');const reg=await client.rpc('registrar_andamento_licitacao',{p_licitacao_id:id,p_situacao:sit,p_andamento:andamento,p_proxima_providencia:proxima||null,p_impedimento:imp||null});if(reg.error)return alert('Não foi possível registrar o andamento: '+reg.error.message);$('protocolProgressDialog').close();$('protocolProgressForm').reset();await loadLicitacoes();});
    $('protocolForwardForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=$('pf_id').value,x=licitacoes.find(v=>String(v.id)===String(id));if(!x||!isMyProtocol(x))return alert('Somente o responsável designado pode encaminhar esta demanda.');const resp=$('pf_responsavel').value,data=$('pf_data').value||null,obs=$('pf_obs').value.trim();if(!resp)return alert('Informe o responsável pela Licitação.');if(['Pregão Eletrônico','Dispensa Eletrônica','Concorrência Eletrônica'].includes(x.modalidade)&&!data)return alert('Informe a data prevista / sessão para esta modalidade.');const u=await client.rpc('encaminhar_demanda_licitacao',{p_licitacao_id:id,p_responsavel_licitacao:resp,p_data_sessao:data,p_observacao:obs||null});if(u.error)return alert('Não foi possível encaminhar: '+u.error.message);$('protocolForwardDialog').close();$('protocolForwardForm').reset();await loadLicitacoes();});
    $('navEtapaLicitacao')?.addEventListener('click',async()=>{if(!profile.modulo_licitacoes)return alert('Usuário sem acesso à Licitação.');await loadLicitacoes();showModule('etapaLicitacao');renderEtapaLicitacao();});
    $('etapaLicitacaoSearch')?.addEventListener('input',renderEtapaLicitacao);$('etapaLicitacaoStatus')?.addEventListener('change',renderEtapaLicitacao);$('etapaLicitacaoScope')?.addEventListener('change',renderEtapaLicitacao);
    $('closeEtapaLicitacaoProgress')?.addEventListener('click',()=>$('etapaLicitacaoProgressDialog').close());$('cancelEtapaLicitacaoProgress')?.addEventListener('click',()=>$('etapaLicitacaoProgressDialog').close());
    $('etapaLicitacaoTbody')?.addEventListener('click',e=>{const h=e.target.closest('[data-lic-history]'),p=e.target.closest('[data-lic-progress]');if(h)return openProtocolHistory(h.dataset.licHistory);if(p){const x=licitacoes.find(v=>String(v.id)===String(p.dataset.licProgress));$('el_id').value=p.dataset.licProgress;$('el_situacao').value=['Encaminhada à Licitação','Concluída'].includes(x?.situacao_execucao)?'Preparando publicação':(x?.situacao_execucao||'Preparando publicação');$('el_data_sessao').value=String(x?.data_sessao||'').slice(0,10);$('el_numero_licitacao').value=x?.numero_licitacao||'';$('el_data_publicacao').value=String(x?.data_publicacao||'').slice(0,10);$('el_data_homologacao').value=String(x?.data_homologacao||'').slice(0,10);$('el_valor_homologado').value=x?.valor_homologado??'';$('el_andamento').value='';$('el_proxima').value=x?.proxima_providencia||'';$('etapaLicitacaoProgressDialog').showModal();}});
    $('etapaLicitacaoProgressForm')?.addEventListener('submit',async e=>{e.preventDefault();const id=$('el_id').value,sit=$('el_situacao').value,andamento=$('el_andamento').value.trim(),prox=$('el_proxima').value.trim(),data=$('el_data_sessao').value||null,num=$('el_numero_licitacao').value.trim()||null,pub=$('el_data_publicacao').value||null,hom=$('el_data_homologacao').value||null,val=$('el_valor_homologado').value===''?null:Number($('el_valor_homologado').value);if(!andamento)return alert('Informe o andamento da Licitação.');
      if(['Publicado','Sessão realizada','Em julgamento/habilitação','Homologado','Fracassado','Deserto'].includes(sit)&&!pub)return alert('Informe a data de publicação para esta situação.');
      if(['Sessão realizada','Em julgamento/habilitação','Homologado','Fracassado','Deserto'].includes(sit)&&!data)return alert('Informe a data da sessão para esta situação.');
      if(sit==='Homologado'&&!hom)return alert('Informe a data de homologação.');
      if(sit==='Homologado'&&val===null)return alert('Informe o valor homologado.');
      const r=await client.rpc('registrar_andamento_etapa_licitacao',{p_licitacao_id:id,p_situacao:sit,p_andamento:andamento,p_proxima_providencia:prox||null,p_data_sessao:data,p_numero_licitacao:num,p_data_publicacao:pub,p_data_homologacao:hom,p_valor_homologado:val});if(r.error)return alert('Não foi possível atualizar a Licitação: '+r.error.message);$('etapaLicitacaoProgressDialog').close();$('etapaLicitacaoProgressForm').reset();await loadLicitacoes();renderEtapaLicitacao();});
    $('protocolDistributeForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      if(!protocolCanEdit()) return alert('Seu acesso ao Protocolo é somente para visualização.');
      const id=$('pd_id').value, responsavel=$('pd_responsavel').value, prazo=Number($('pd_prazo').value||0);
      if(!responsavel||!prazo){alert('Informe o responsável e o prazo para execução.');return;}
      const btn=e.submitter; if(btn){btn.disabled=true;btn.textContent='Distribuindo...';}
      const obs=$('pd_obs').value.trim();
      const {error}=await client.rpc('distribuir_demanda_protocolo',{p_licitacao_id:id,p_responsavel:responsavel,p_prazo_dias:prazo,p_observacao:obs||null});
      if(error) alert('Não foi possível distribuir a demanda: '+error.message);
      else { $('protocolDistributeDialog').close(); await loadLicitacoes(); }
      if(btn){btn.disabled=false;btn.textContent='Distribuir';}
    });
    $('navLicitacoes')?.addEventListener('click',async()=>{if(!profile.modulo_licitacoes)return alert('Usuário sem acesso ao módulo Protocolo.');protocolView='all';await loadLicitacoes();showModule('licitacoes');}); $('navPlanejamento')?.addEventListener('click',()=>{if(!profile.modulo_planejamento)return alert('Usuário sem acesso ao módulo Planejamento.');showModule('planejamento');}); $('navCompras')?.addEventListener('click',()=>showModule('compras'));
    $('scopeOngoing')?.addEventListener('click',()=>{planningScope='ongoing';$('scopeOngoing').classList.add('active');$('scopeAll').classList.remove('active');render();});
    $('scopeAll')?.addEventListener('click',()=>{planningScope='all';$('scopeAll').classList.add('active');$('scopeOngoing').classList.remove('active');render();});
    ['search','statusFilter','quoteFilter','secretariaFilter','responsavelFilter','tipoFilter','modalidadeFilter','prazoFilter'].forEach(id=>$(id)?.addEventListener('input',render));
    $('clearFilters')?.addEventListener('click',()=>{ ['search','statusFilter','quoteFilter','secretariaFilter','responsavelFilter','tipoFilter','modalidadeFilter','prazoFilter'].forEach(id=>{if($(id))$(id).value='';}); render(); });
    $('printBtn')?.addEventListener('click',()=>window.print());
    $('exportBtn')?.addEventListener('click',()=>{
      const data=filtered().map(x=>({'Nº':x.numero,'Demanda':x.demanda,'Secretaria':x.secretaria,'Tipo':x.tipo_objeto,'Modalidade':x.modalidade_prevista,'Cotação':x.situacao_cotacao,'Início':brDate(x.data_inicio_planejamento),'Data Limite':brDate(x.data_limite_planejamento),'Situação do Prazo':x.deadline.label,'Envio ao Protocolo':brDate(x.data_envio_licitacao),'Valor Estimado':x.valor_estimado,'Responsável':x.responsavel,'Situação Geral':x.situacao_geral,'Impedimentos':x.impedimentos,'Próxima Providência':splitObs(x.observacoes).proxima,'Observações':splitObs(x.observacoes).obs}));
      const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Planejamento'); XLSX.writeFile(wb,'planejamento_filtrado.xlsx');
    });
    $('weeklyProtocolBtn')?.addEventListener('click',openWeeklyProtocol);
    $('closeWeeklyProtocol')?.addEventListener('click',()=>$('weeklyProtocolDialog').close());
    $('copyWeeklyProtocol')?.addEventListener('click',async()=>{ try{await navigator.clipboard.writeText($('weeklyProtocolText').value); alert('Resumo copiado.');}catch(_){$('weeklyProtocolText').select(); document.execCommand('copy'); alert('Resumo copiado.');} });
    $('weeklyWhatsappBtn')?.addEventListener('click',openWeeklyWhatsapp);
    $('closeWeeklyWhatsapp')?.addEventListener('click',()=>$('weeklyWhatsappDialog').close());
    $('copyWeeklyWhatsapp')?.addEventListener('click',async()=>{ try{await navigator.clipboard.writeText($('weeklyWhatsappText').value); alert('Resumo copiado.');}catch(_){$('weeklyWhatsappText').select(); document.execCommand('copy'); alert('Resumo copiado.');} });
    $('newBtn')?.addEventListener('click',()=>openDialog()); $('closeDialog')?.addEventListener('click',()=>$('itemDialog').close()); $('cancelBtn')?.addEventListener('click',()=>$('itemDialog').close());
    $('tbody')?.addEventListener('click',e=>{ const btn=e.target.closest('button[data-action]'); if(btn){e.stopPropagation(); if(btn.dataset.action==='edit'){const x=items.find(v=>String(v.id)===String(btn.dataset.id)); if(x)openDialog(x);} return;} const row=e.target.closest('tr[data-id]'); if(row) openDetail(row.dataset.id); });
    $('closeDetail')?.addEventListener('click',()=>$('detailDialog').close()); $('detailEditBtn')?.addEventListener('click',()=>{if(!profile.modulo_planejamento||!(['editor','administrador'].includes(String(profile.nivel_planejamento||profile.perfil||'').toLowerCase())||isMaster()))return;const x=items.find(v=>String(v.id)===String(currentDetailId)); $('detailDialog').close(); if(x)openDialog(x);});
    $('historyBtn')?.addEventListener('click',openHistory); $('closeHistory')?.addEventListener('click',()=>$('historyDialog').close());
    $('detailDeleteBtn')?.addEventListener('click',async()=>{ if(!isMaster()||!currentDetailId)return; if(!confirm('ATENÇÃO: deseja excluir totalmente esta demanda do Planejamento e todos os registros relacionados? Esta ação não poderá ser desfeita.'))return; const {error}=await client.rpc('admin_excluir_planejamento_total',{p_planejamento_id:currentDetailId}); if(error)return alert('Não foi possível excluir a demanda: '+error.message); $('detailDialog').close(); await loadItems(); if(profile.modulo_licitacoes)await loadLicitacoes(); });
    $('itemForm')?.addEventListener('submit',async e=>{
      e.preventDefault(); if(!profile.modulo_planejamento||!(['editor','administrador'].includes(String(profile.nivel_planejamento||profile.perfil||'').toLowerCase())||isMaster()))return alert('Seu acesso ao Planejamento é somente para visualização.'); const id=$('itemId').value;
      const payload={demanda:$('f_nome').value.trim(),secretaria:$('f_secretaria').value.trim()||null,tipo_objeto:$('f_tipo').value||null,modalidade_prevista:$('f_modalidade').value.trim()||null,situacao_cotacao:$('f_cotacoes').value||null,data_inicio_planejamento:$('f_inclusao').value||null,data_limite_planejamento:$('f_limite').value||null,data_envio_licitacao:$('f_envio').value||null,valor_estimado:$('f_valor').value===''?null:Number($('f_valor').value),responsavel:$('f_responsavel').value.trim()||null,situacao_geral:$('f_status').value||null,impedimentos:$('f_impedimentos').value.trim()||null,observacoes:joinObs($('f_obs').value,$('f_proxima').value)};
      if(payload.data_envio_licitacao) payload.situacao_geral='Enviado p/ Protocolo';
      const res=id?await client.from('planejamentos').update(payload).eq('id',id):await client.from('planejamentos').insert(payload); if(res.error)return alert(res.error.message); $('itemDialog').close(); await loadItems(); if(profile.modulo_licitacoes) await loadLicitacoes();
    });

    (async()=>{ if(!configured){setLoginMsg('Erro: configuração do Supabase não encontrada.','error');return;} try{const {data,error}=await client.auth.getSession(); if(error)throw error; if(data?.session)await enterApp();}catch(err){setLoginMsg(`Erro: ${err?.message||'Falha ao iniciar.'}`,'error');} })();
  });
})();
