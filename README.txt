CONTROLE DE PLANEJAMENTO — SEABRA/BA

Arquivos:
- index.html: aplicação
- styles.css: visual
- app.js: login, filtros, cadastro, edição, exclusão, exportação e indicadores
- config.js: conexão com Supabase
- schema.sql: banco, login/perfis, segurança e histórico
- dados_iniciais.sql: importação das demandas da planilha

CONFIGURAÇÃO:
1. Crie um projeto em https://supabase.com
2. No SQL Editor, execute schema.sql.
3. Em Authentication > Users, crie os usuários com e-mail e senha.
4. Para cada usuário criado, insira um registro em public.profiles usando o UUID do usuário e role: admin, editor ou viewer.
   Exemplo:
   insert into public.profiles(id,full_name,role) values ('UUID_DO_USUARIO','Nome','admin');
5. Em Project Settings > API, copie Project URL e anon public key para config.js.
6. Execute dados_iniciais.sql no SQL Editor.
7. Publique a pasta em Vercel, Netlify ou outro host estático.

PERMISSÕES:
- viewer: consulta, filtros, Excel e impressão/PDF.
- editor: tudo do viewer + criar e editar demandas.
- admin: tudo do editor + excluir demandas.

SEGURANÇA:
As permissões de escrita são verificadas no próprio banco pelo Row Level Security (RLS). Ocultar botões no navegador não é usado como única proteção.
