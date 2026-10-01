GESTÃO DE PROCESSOS – SEABRA/BA

Projeto web para acompanhamento interno dos processos da Prefeitura Municipal de Seabra/BA.

ARQUITETURA ATUAL
- Front-end: GitHub Pages
- Repositório: jhonataplanejamentopms-art/controle-processos-seabra
- Banco e autenticação: Supabase
- Módulos, nesta ordem:
  1. Planejamento
  2. Licitações
  3. Compras
- Contratos NÃO integra este fluxo. Será tratado futuramente como módulo/projeto independente, embora possa usar o mesmo ambiente de acesso.

FLUXO OPERACIONAL
Planejamento -> Licitações -> Compras

PLANEJAMENTO
- Cadastro e edição de demandas.
- Controle de secretaria, tipo de objeto, modalidade, situação da cotação, datas, valor estimado, responsável, impedimentos, observações e próxima providência.
- Processos enviados à Licitação permanecem na base geral e saem da visão padrão de processos em andamento.
- Indicadores de carteira ativa, cotações, atrasos, vencimentos, impedimentos e encaminhamentos.
- Histórico das alterações.
- Exportação e impressão.
- Resumo semanal para WhatsApp, pensado para envio às sextas-feiras, considerando a semana corrente (segunda até o dia da geração), com cenário atual, enviados à Licitação, concluídos, pontos de atenção e próximas providências.

LICITAÇÕES
- Recebe os processos encaminhados pelo Planejamento.
- Exibe situação de recebimento e contagem do fluxo.
- O vínculo com Planejamento é feito por planejamento_id.
- Existe automação no Supabase para encaminhamento.
- Observação técnica: o trigger legado de encaminhamento executa em BEFORE INSERT/UPDATE. O front-end foi ajustado para NÃO enviar data_envio_licitacao no INSERT de uma nova demanda. O encaminhamento deve ocorrer posteriormente por UPDATE, quando o planejamento já existe, evitando violação da FK licitacoes_planejamento_id_fkey.

COMPRAS
- Módulo existente na navegação, ainda a ser desenvolvido.

USUÁRIOS E PERFIS
- Jhonata Cerqueira: administrador.
- Monica Ramos: editora do Planejamento.
- O acesso da Monica foi vinculado ao perfil dela usando o novo usuário de autenticação criado para esse fim.
- Perfis e permissões são controlados pela tabela perfis no Supabase.
- Editores podem criar/editar conforme permissões; exclusão definitiva é reservada ao administrador.

DECISÕES IMPORTANTES
- A ordem da navegação é Planejamento -> Licitações -> Compras.
- Não criar campos no banco apenas para resolver diferenças do front-end sem antes verificar o schema real.
- As colunas prazo_interno_dias e qtd_cotacoes não existem no schema atual de planejamentos e foram retiradas das gravações do front-end.
- Próxima providência é armazenada dentro de observacoes com marcador interno [PRÓXIMA PROVIDÊNCIA], evitando alteração do schema.
- A antiga interface “Atualizar demandas 30/09” foi retirada após a atualização das demandas.
- Preservar os processos já existentes ao realizar novas alterações.

PUBLICAÇÃO
Site:
https://jhonataplanejamentopms-art.github.io/controle-processos-seabra/

Repositório:
https://github.com/jhonataplanejamentopms-art/controle-processos-seabra

SUPABASE
Projeto: gestao-processo-seabra
Project ref: toitytpnaxifucxrfutu

ARQUIVOS PRINCIPAIS
- index.html: estrutura da interface.
- styles.css: apresentação.
- app.js: regras da aplicação, Supabase, filtros, módulos e relatórios.
- config.js: configuração pública necessária para conexão do front-end ao Supabase.

CUIDADOS AO ALTERAR
1. Buscar a versão atual do arquivo antes de editar.
2. Preservar os registros existentes no Supabase.
3. Não remover chaves estrangeiras para contornar erros de fluxo.
4. Validar nomes de colunas contra o schema real antes de adicionar campos aos payloads.
5. Após alterações em JavaScript, atualizar o parâmetro de versão do app.js em index.html para evitar cache do GitHub Pages.
6. Testar primeiro: nova demanda -> edição -> envio à Licitação -> recebimento em Licitações.

PRÓXIMOS PASSOS
- Estabilizar completamente o cadastro e edição do Planejamento.
- Validar o fluxo Planejamento -> Licitações após os ajustes recentes.
- Revisar permissões dos usuários.
- Desenvolver o módulo Compras.
- Refinar o resumo semanal de WhatsApp conforme o uso real.
- Tratar Controle de Contratos futuramente como iniciativa independente.

ÚLTIMA ORGANIZAÇÃO DO PROJETO
01/10/2026
