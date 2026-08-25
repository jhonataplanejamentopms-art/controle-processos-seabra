GESTÃO DE PROCESSOS – SEABRA/BA – PLANEJAMENTO v12

OBJETIVO DESTA VERSÃO
- Finalizar o fluxo do Planejamento até o envio para Licitações.
- Processo enviado à Licitação fica VERDE na base geral.
- Processo enviado sai da visão padrão "Processos em andamento".
- Processo permanece em "Todos os processos" do Planejamento.
- O envio cria/atualiza automaticamente o processo na aba Licitações.
- A aba Licitações conta dias úteis desde o envio pelo Planejamento.
- O processo chega como "Aguardando recebimento".
- Jhonata Cerqueira pode clicar em "Dar recebimento".
- Leidiana poderá dar recebimento depois que seu usuário for criado e autorizado.

ORDEM DE ATUALIZAÇÃO
1. No Supabase > SQL Editor, execute ATUALIZAR_SUPABASE_v12.sql.
2. No GitHub, substitua index.html, styles.css e app.js pelos arquivos desta pasta.
3. Pode manter o config.js atual; o fornecido aqui aponta para o mesmo projeto.
4. Aguarde o GitHub Pages publicar e atualize o navegador com Cmd+Shift+R.

IMPORTANTE
- O SQL não apaga os planejamentos existentes.
- Os planejamentos já enviados à Licitação serão migrados automaticamente para a tabela licitacoes.
- Os planejamentos já enviados terão a situação normalizada para "Enviado p/ Licitação".
- Monica Ramos e Mabilia Anjos permanecem editoras do Planejamento, sem poder excluir.
- Para autorizar Leidiana a dar o recebido, será necessário o UID dela no Supabase.
