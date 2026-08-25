(() => {
  'use strict';

  const ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  ready(() => {
    const $ = (id) => document.getElementById(id);
    const cfg = window.APP_CONFIG || {};
    const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
    const client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

    let items = [];
    let profile = { perfil: 'visualizador', nome: '' };

    const statuses = ['Planejamento','Cotando','Cotado','Aguard. Autorização','Enviado p/ Licitação','Edital Publicado','Concluído','Suspenso','Cancelado'];

    const setLoginMsg = (text, type = '') => {
      const el = $('loginMsg');
      if (!el) return;
      el.textContent = text || '';
      el.className = `login-msg ${type}`.trim();
    };

    const brDate = (v) => {
      if (!v) return '—';
      const [y,m,d] = String(v).slice(0,10).split('-');
      return `${d}/${m}/${y}`;
    };

    const money = (v) => (v == null || v === '') ? '—' : Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
    const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

    const enriched = (x) => {
      const finalizado = ['Concluído','Cancelado','Suspenso'].includes(x.situacao_geral);
      const enviado = Boolean(x.data_envio_licitacao);
      const overdue = Boolean(x.data_limite_planejamento) && !enviado && !finalizado && new Date(`${x.data_limite_planejamento}T23:59:59`) < new Date();
      return { ...x, overdue };
    };

    const filtered = () => {
      const q = ($('search')?.value || '').trim().toLowerCase();
      const s = $('statusFilter')?.value || '';
      const c = $('quoteFilter')?.value || '';
      return items.map(enriched).filter((x) => {
        const matchesSearch = !q || [x.demanda,x.secretaria,x.responsavel,x.modalidade_prevista].some(v => (v || '').toLowerCase().includes(q));
        return matchesSearch && (!s || x.situacao_geral === s) && (!c || x.situacao_cotacao === c);
      });
    };

    function applyRole() {
      document.querySelectorAll('.editor-only').forEach(el => el.classList.toggle('hidden', !['administrador','editor'].includes(profile.perfil)));
      document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', profile.perfil !== 'administrador'));
    }

    function renderKpis() {
      const all = items.map(enriched);
      const active = all.filter(x => !['Concluído','Cancelado','Suspenso'].includes(x.situacao_geral));
      const kpis = [
        ['Carteira ativa', active.length],
        ['Em cotação', all.filter(x => x.situacao_cotacao === 'Cotando').length],
        ['Enviadas à licitação', all.filter(x => x.data_envio_licitacao).length],
        ['Concluídas', all.filter(x => x.situacao_geral === 'Concluído').length],
        ['Atrasadas', all.filter(x => x.overdue).length]
      ];
      if ($('kpis')) $('kpis').innerHTML = kpis.map(([label,value]) => `<div class="kpi"><small>${label}</small><b>${value}</b></div>`).join('');
    }

    function render() {
      const list = filtered();
      if (!$('tbody')) return;
      $('tbody').innerHTML = list.map((x,i) => `
        <tr class="${x.overdue ? 'overdue-row' : ''}">
          <td>${x.numero ?? i+1}</td>
          <td><div class="demand-name">${esc(x.demanda)}</div>${x.observacoes ? `<small class="muted">${esc(x.observacoes)}</small>` : ''}${x.impedimentos ? `<small class="muted">Impedimento: ${esc(x.impedimentos)}</small>` : ''}</td>
          <td>${esc(x.secretaria || '—')}</td>
          <td>${esc(x.tipo_objeto || '—')}</td>
          <td>${esc(x.modalidade_prevista || '—')}</td>
          <td>${esc(x.situacao_cotacao || '—')}</td>
          <td>${brDate(x.data_inicio_planejamento)}</td>
          <td>${brDate(x.data_limite_planejamento)} ${x.overdue ? '<span class="badge atrasado">Atrasado</span>' : ''}</td>
          <td>${brDate(x.data_envio_licitacao)}</td>
          <td class="money">${money(x.valor_estimado)}</td>
          <td>${esc(x.responsavel || '—')}</td>
          <td><span class="badge ${x.situacao_geral === 'Concluído' ? 'ok' : ['Suspenso','Cancelado'].includes(x.situacao_geral) ? 'warn' : ''}">${esc(x.situacao_geral || 'Sem status')}</span></td>
          <td><div class="actions editor-only"><button type="button" class="ghost" data-action="edit" data-id="${x.id}">Editar</button><button type="button" class="ghost admin-only" data-action="delete" data-id="${x.id}">Excluir</button></div></td>
        </tr>`).join('');
      $('emptyState')?.classList.toggle('hidden', list.length > 0);
      renderKpis();
      applyRole();
    }

    function showModule(module) {
      const map = {
        licitacoes: $('moduloLicitacoes'),
        planejamento: $('moduloPlanejamento'),
        compras: $('moduloCompras')
      };
      Object.values(map).forEach(el => el?.classList.add('hidden'));
      map[module]?.classList.remove('hidden');
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.module === module));
    }

    async function loadProfile() {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const user = userData?.user;
      if (!user) throw new Error('Usuário não autenticado.');

      const { data, error } = await client.from('perfis')
        .select('perfil,nome,ativo,modulo_planejamento,modulo_compras,modulo_licitacoes')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      if (!data?.ativo) throw new Error('Usuário desativado.');
      profile = data;
      $('userBadge').textContent = `${profile.nome || user.email} · ${profile.perfil}`;
    }

    async function loadItems() {
      const { data, error } = await client.from('planejamentos').select('*').order('numero', { ascending:true });
      if (error) throw error;
      items = data || [];
      render();
    }

    async function enterApp() {
      await loadProfile();
      await loadItems();
      $('loginView')?.classList.add('hidden');
      $('appView')?.classList.remove('hidden');
      showModule('planejamento');
      setLoginMsg('');
    }

    async function doLogin(email, password) {
      if (!configured) throw new Error('Supabase não configurado.');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.session) throw new Error('Sessão não criada.');
      return data.session;
    }

    function openDialog(x = {}) {
      const map = { itemId:'id', f_nome:'demanda', f_secretaria:'secretaria', f_tipo:'tipo_objeto', f_modalidade:'modalidade_prevista', f_cotacoes:'situacao_cotacao', f_inclusao:'data_inicio_planejamento', f_limite:'data_limite_planejamento', f_envio:'data_envio_licitacao', f_valor:'valor_estimado', f_responsavel:'responsavel', f_status:'situacao_geral', f_impedimentos:'impedimentos', f_obs:'observacoes' };
      Object.entries(map).forEach(([id,key]) => { if ($(id)) $(id).value = x[key] ?? ''; });
      if (!x.id) {
        $('f_inclusao').value = new Date().toISOString().slice(0,10);
        $('f_status').value = 'Planejamento';
      }
      $('dialogTitle').textContent = x.id ? 'Editar demanda' : 'Nova demanda';
      $('itemDialog').showModal();
    }

    statuses.forEach(s => $('statusFilter')?.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`));

    $('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = ($('email')?.value || '').trim();
      const password = $('password')?.value || '';
      setLoginMsg('Entrando...', 'info');
      $('loginBtn').disabled = true;
      try {
        await doLogin(email, password);
        await enterApp();
      } catch (err) {
        console.error('LOGIN ERROR:', err);
        setLoginMsg(`Erro: ${err?.message || 'Falha ao entrar.'}`, 'error');
      } finally {
        $('loginBtn').disabled = false;
      }
    });

    $('logoutBtn')?.addEventListener('click', async () => {
      await client.auth.signOut();
      $('appView')?.classList.add('hidden');
      $('loginView')?.classList.remove('hidden');
    });

    $('navLicitacoes')?.addEventListener('click', () => showModule('licitacoes'));
    $('navPlanejamento')?.addEventListener('click', () => showModule('planejamento'));
    $('navCompras')?.addEventListener('click', () => showModule('compras'));

    ['search','statusFilter','quoteFilter'].forEach(id => $(id)?.addEventListener('input', render));
    $('clearFilters')?.addEventListener('click', () => { $('search').value=''; $('statusFilter').value=''; $('quoteFilter').value=''; render(); });
    $('printBtn')?.addEventListener('click', () => window.print());

    $('exportBtn')?.addEventListener('click', () => {
      const data = filtered().map(x => ({
        'Nº': x.numero,
        'Demanda': x.demanda,
        'Secretaria': x.secretaria,
        'Tipo de Objeto': x.tipo_objeto,
        'Modalidade Prevista': x.modalidade_prevista,
        'Situação da Cotação': x.situacao_cotacao,
        'Início': brDate(x.data_inicio_planejamento),
        'Data Limite': brDate(x.data_limite_planejamento),
        'Envio à Licitação': brDate(x.data_envio_licitacao),
        'Valor Estimado': x.valor_estimado,
        'Responsável': x.responsavel,
        'Situação Geral': x.situacao_geral,
        'Impedimentos': x.impedimentos,
        'Observações': x.observacoes
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Planejamento');
      XLSX.writeFile(wb, 'planejamento_filtrado.xlsx');
    });

    $('newBtn')?.addEventListener('click', () => openDialog());
    $('closeDialog')?.addEventListener('click', () => $('itemDialog').close());
    $('cancelBtn')?.addEventListener('click', () => $('itemDialog').close());

    $('tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit') {
        const item = items.find(x => String(x.id) === String(id));
        if (item) openDialog(item);
      }
      if (btn.dataset.action === 'delete') {
        if (!confirm('Excluir esta demanda?')) return;
        const { error } = await client.from('planejamentos').delete().eq('id', id);
        if (error) return alert(error.message);
        await loadItems();
      }
    });

    $('itemForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('itemId').value;
      const payload = {
        demanda: $('f_nome').value.trim(),
        secretaria: $('f_secretaria').value.trim() || null,
        tipo_objeto: $('f_tipo').value || null,
        modalidade_prevista: $('f_modalidade').value.trim() || null,
        situacao_cotacao: $('f_cotacoes').value || null,
        data_inicio_planejamento: $('f_inclusao').value || null,
        data_limite_planejamento: $('f_limite').value || null,
        data_envio_licitacao: $('f_envio').value || null,
        valor_estimado: $('f_valor').value === '' ? null : Number($('f_valor').value),
        responsavel: $('f_responsavel').value.trim() || null,
        situacao_geral: $('f_status').value || null,
        impedimentos: $('f_impedimentos').value.trim() || null,
        observacoes: $('f_obs').value.trim() || null
      };
      const res = id
        ? await client.from('planejamentos').update(payload).eq('id', id)
        : await client.from('planejamentos').insert(payload);
      if (res.error) return alert(res.error.message);
      $('itemDialog').close();
      await loadItems();
    });

    (async () => {
      if (!configured) {
        setLoginMsg('Erro: configuração do Supabase não encontrada.', 'error');
        return;
      }
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (data?.session) await enterApp();
      } catch (err) {
        console.error('BOOT ERROR:', err);
        setLoginMsg(`Erro: ${err?.message || 'Falha ao iniciar.'}`, 'error');
      }
    })();
  });
})();
