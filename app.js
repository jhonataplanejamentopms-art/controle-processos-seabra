document.addEventListener('DOMContentLoaded', () => {

  const cfg = window.APP_CONFIG || {};

  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY;

  const supabaseClient = configured
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      )
    : null;


  let items = [];

  let profile = {
    perfil: 'visualizador'
  };


  const $ = id => document.getElementById(id);


  const statuses = [
    'Planejamento',
    'Cotando',
    'Cotado',
    'Aguard. Autorização',
    'Enviado p/ Licitação',
    'Edital Publicado',
    'Concluído',
    'Suspenso',
    'Cancelado'
  ];


  // =========================================================
  // UTILIDADES
  // =========================================================

  function brDate(v) {

    if (!v) return '—';

    const [y, m, d] =
      v.slice(0, 10).split('-');

    return `${d}/${m}/${y}`;

  }


  function money(v) {

    if (v == null || v === '')
      return '—';

    return Number(v).toLocaleString(
      'pt-BR',
      {
        style: 'currency',
        currency: 'BRL'
      }
    );

  }


  function esc(v) {

    return String(v ?? '')
      .replace(
        /[&<>'"]/g,
        c => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[c])
      );

  }


  function enriched(x) {

    const finalizado =
      [
        'Concluído',
        'Cancelado',
        'Suspenso'
      ]
      .includes(x.situacao_geral);


    const enviado =
      !!x.data_envio_licitacao;


    const overdue =
      x.data_limite_planejamento &&
      !enviado &&
      !finalizado &&
      new Date(
        x.data_limite_planejamento +
        'T23:59:59'
      ) < new Date();


    return {
      ...x,
      overdue
    };

  }


  // =========================================================
  // MENU PRINCIPAL
  // =========================================================

  function openModule(module) {

    const modules = {
      licitacoes: $('moduloLicitacoes'),
      planejamento: $('moduloPlanejamento'),
      compras: $('moduloCompras')
    };


    Object.values(modules)
      .forEach(el => {
        if (el)
          el.classList.add('hidden');
      });


    if (modules[module])
      modules[module]
        .classList.remove('hidden');


    document
      .querySelectorAll('.nav-btn')
      .forEach(btn => {

        btn.classList.toggle(
          'active',
          btn.dataset.module === module
        );

      });

  }


  $('navLicitacoes')
    ?.addEventListener(
      'click',
      () => openModule('licitacoes')
    );


  $('navPlanejamento')
    ?.addEventListener(
      'click',
      () => openModule('planejamento')
    );


  $('navCompras')
    ?.addEventListener(
      'click',
      () => openModule('compras')
    );


  // =========================================================
  // FILTROS
  // =========================================================

  statuses.forEach(s => {

    if ($('statusFilter')) {

      $('statusFilter')
        .insertAdjacentHTML(
          'beforeend',
          `<option>${s}</option>`
        );

    }

  });


  function filtered() {

    const q =
      $('search')
        ?.value
        .trim()
        .toLowerCase() || '';


    const s =
      $('statusFilter')
        ?.value || '';


    const c =
      $('quoteFilter')
        ?.value || '';


    return items
      .map(enriched)
      .filter(x => {

        const matchesSearch =
          !q ||
          [
            x.demanda,
            x.secretaria,
            x.responsavel,
            x.modalidade_prevista
          ]
          .some(v =>
            (v || '')
              .toLowerCase()
              .includes(q)
          );


        const matchesStatus =
          !s ||
          x.situacao_geral === s;


        const matchesQuote =
          !c ||
          x.situacao_cotacao === c;


        return (
          matchesSearch &&
          matchesStatus &&
          matchesQuote
        );

      });

  }


  // =========================================================
  // KPIs
  // =========================================================

  function renderKpis() {

    const all =
      items.map(enriched);


    const active =
      all.filter(x =>
        ![
          'Concluído',
          'Cancelado',
          'Suspenso'
        ]
        .includes(
          x.situacao_geral
        )
      );


    const k = [

      [
        'Carteira ativa',
        active.length
      ],

      [
        'Em cotação',
        all.filter(
          x =>
          x.situacao_cotacao ===
          'Cotando'
        ).length
      ],

      [
        'Enviadas à licitação',
        all.filter(
          x =>
          x.data_envio_licitacao
        ).length
      ],

      [
        'Concluídas',
        all.filter(
          x =>
          x.situacao_geral ===
          'Concluído'
        ).length
      ],

      [
        'Atrasadas',
        all.filter(
          x => x.overdue
        ).length
      ]

    ];


    if (!$('kpis'))
      return;


    $('kpis').innerHTML =
      k.map(
        ([a, b]) => `
          <div class="kpi">
            <small>${a}</small>
            <b>${b}</b>
          </div>
        `
      )
      .join('');

  }


  // =========================================================
  // PERMISSÕES
  // =========================================================

  function applyRole() {

    document
      .querySelectorAll(
        '.editor-only'
      )
      .forEach(el => {

        el.classList.toggle(
          'hidden',
          ![
            'administrador',
            'editor'
          ]
          .includes(profile.perfil)
        );

      });


    document
      .querySelectorAll(
        '.admin-only'
      )
      .forEach(el => {

        el.classList.toggle(
          'hidden',
          profile.perfil !==
          'administrador'
        );

      });

  }


  // =========================================================
  // TABELA
  // =========================================================

  function render() {

    const list =
      filtered();


    if (!$('tbody'))
      return;


    $('tbody').innerHTML =
      list.map(
        (x, i) => `

        <tr
          class="${
            x.overdue
              ? 'overdue-row'
              : ''
          }">

          <td>
            ${x.numero ?? i + 1}
          </td>

          <td>

            <div class="demand-name">

              ${esc(x.demanda)}

            </div>

            ${
              x.observacoes
              ? `
                <small class="muted">
                  ${esc(x.observacoes)}
                </small>
              `
              : ''
            }

            ${
              x.impedimentos
              ? `
                <small class="muted">
                  Impedimento:
                  ${esc(x.impedimentos)}
                </small>
              `
              : ''
            }

          </td>

          <td>
            ${esc(x.secretaria || '—')}
          </td>

          <td>
            ${esc(x.tipo_objeto || '—')}
          </td>

          <td>
            ${esc(x.modalidade_prevista || '—')}
          </td>

          <td>
            ${esc(x.situacao_cotacao || '—')}
          </td>

          <td>
            ${brDate(x.data_inicio_planejamento)}
          </td>

          <td>

            ${brDate(x.data_limite_planejamento)}

            ${
              x.overdue
              ? `
                <span class="badge atrasado">
                  Atrasado
                </span>
              `
              : ''
            }

          </td>

          <td>
            ${brDate(x.data_envio_licitacao)}
          </td>

          <td class="money">
            ${money(x.valor_estimado)}
          </td>

          <td>
            ${esc(x.responsavel || '—')}
          </td>

          <td>

            <span class="
              badge
              ${
                x.situacao_geral ===
                'Concluído'
                  ? 'ok'
                  : (
                    x.situacao_geral ===
                    'Suspenso' ||
                    x.situacao_geral ===
                    'Cancelado'
                      ? 'warn'
                      : ''
                  )
              }
            ">

              ${
                esc(
                  x.situacao_geral ||
                  'Sem status'
                )
              }

            </span>

          </td>

          <td>

            <div
              class="
                actions
                editor-only
              ">

              <button
                class="ghost"
                onclick="
                  editItem(
                    '${x.id}'
                  )
                ">

                Editar

              </button>


              <button
                class="
                  ghost
                  admin-only
                "
                onclick="
                  deleteItem(
                    '${x.id}'
                  )
                ">

                Excluir

              </button>

            </div>

          </td>

        </tr>

      `
      )
      .join('');


    $('emptyState')
      ?.classList
      .toggle(
        'hidden',
        list.length > 0
      );


    renderKpis();

    applyRole();

  }


  // =========================================================
  // PERFIL
  // =========================================================

  async function loadProfile() {

    const {
      data: {
        user
      }
    } =
      await supabaseClient
        .auth
        .getUser();


    if (!user)
      throw new Error(
        'Usuário não autenticado.'
      );


    const {
      data,
      error
    } =
      await supabaseClient
        .from('perfis')
        .select(`
          perfil,
          nome,
          ativo,
          modulo_planejamento,
          modulo_compras,
          modulo_licitacoes
        `)
        .eq(
          'id',
          user.id
        )
        .single();


    if (error)
      throw error;


    profile =
      data || {
        perfil: 'visualizador'
      };


    if (!profile.ativo)
      throw new Error(
        'Usuário desativado.'
      );


    if ($('userBadge')) {

      $('userBadge')
        .textContent =
          `${
            profile.nome ||
            user.email
          } · ${
            profile.perfil
          }`;

    }

  }


  // =========================================================
  // CARREGAR PLANEJAMENTOS
  // =========================================================

  async function loadItems() {

    const {
      data,
      error
    } =
      await supabaseClient
        .from('planejamentos')
        .select('*')
        .order(
          'numero',
          {
            ascending: true
          }
        );


    if (error)
      throw error;


    items =
      data || [];


    render();

  }


  // =========================================================
  // ENTRAR NO SISTEMA
  // =========================================================

  async function enterApp() {

    await loadProfile();

    await loadItems();


    $('loginView')
      ?.classList
      .add('hidden');


    $('appView')
      ?.classList
      .remove('hidden');


    openModule(
      'planejamento'
    );

  }


  // =========================================================
  // LOGIN
  // =========================================================

  const loginForm =
    $('loginForm');


  if (loginForm) {

    loginForm
      .addEventListener(
        'submit',
        async e => {

          e.preventDefault();


          if (!$('loginMsg'))
            return;


          $('loginMsg')
            .textContent =
              'Entrando...';


          if (!configured) {

            $('loginMsg')
              .textContent =
                'Erro: Supabase não configurado.';

            return;

          }


          const email =
            $('email')
              .value
              .trim();


          const password =
            $('password')
              .value;


          try {

            const {
              data,
              error
            } =
              await supabaseClient
                .auth
                .signInWithPassword({
                  email,
                  password
                });


            if (error)
              throw error;


            if (
              !data ||
              !data.session
            ) {

              throw new Error(
                'Sessão não criada.'
              );

            }


            $('loginMsg')
              .textContent =
                'Login realizado.';


            await enterApp();

          }
          catch (err) {

            console.error(
              'ERRO LOGIN:',
              err
            );


            $('loginMsg')
              .textContent =
                `Erro: ${
                  err.message ||
                  'Falha ao entrar.'
                }`;

          }

        }
      );

  }


  // =========================================================
  // LOGOUT
  // =========================================================

  $('logoutBtn')
    ?.addEventListener(
      'click',
      async () => {

        await supabaseClient
          .auth
          .signOut();


        $('appView')
          ?.classList
          .add('hidden');


        $('loginView')
          ?.classList
          .remove('hidden');

      }
    );


  // =========================================================
  // FILTROS
  // =========================================================

  [
    'search',
    'statusFilter',
    'quoteFilter'
  ]
  .forEach(id => {

    $(id)
      ?.addEventListener(
        'input',
        render
      );

  });


  $('clearFilters')
    ?.addEventListener(
      'click',
      () => {

        $('search').value = '';

        $('statusFilter').value = '';

        $('quoteFilter').value = '';

        render();

      }
    );


  // =========================================================
  // IMPRESSÃO
  // =========================================================

  $('printBtn')
    ?.addEventListener(
      'click',
      () =>
        window.print()
    );


  // =========================================================
  // EXCEL
  // =========================================================

  $('exportBtn')
    ?.addEventListener(
      'click',
      () => {

        const data =
          filtered()
            .map(x => ({

              'Nº':
                x.numero,

              'Demanda':
                x.demanda,

              'Secretaria':
                x.secretaria,

              'Tipo de Objeto':
                x.tipo_objeto,

              'Modalidade Prevista':
                x.modalidade_prevista,

              'Situação da Cotação':
                x.situacao_cotacao,

              'Início':
                brDate(
                  x.data_inicio_planejamento
                ),

              'Data Limite':
                brDate(
                  x.data_limite_planejamento
                ),

              'Envio à Licitação':
                brDate(
                  x.data_envio_licitacao
                ),

              'Valor Estimado':
                x.valor_estimado,

              'Responsável':
                x.responsavel,

              'Situação Geral':
                x
