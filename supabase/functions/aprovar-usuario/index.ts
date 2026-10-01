import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) throw new Error("Sessão inválida.");

    const token = authHeader.replace("Bearer ", "");
    const publicClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await publicClient.auth.getUser(token);
    if (authError || !authData.user) throw new Error("Usuário não autenticado.");

    const admin = createClient(url, service);
    const { data: caller, error: callerError } = await admin.from("perfis")
      .select("perfil,ativo").eq("id", authData.user.id).single();
    if (callerError || !caller || !caller.ativo || caller.perfil !== "administrador")
      return new Response(JSON.stringify({ error: "Apenas administrador pode aprovar usuários." }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json();
    const id = String(body.id || "");
    if (!id) throw new Error("Usuário não informado.");

    const levels = ["sem_acesso", "visualizador", "editor"];
    const np = levels.includes(body.nivel_planejamento) ? body.nivel_planejamento : "sem_acesso";
    const nl = levels.includes(body.nivel_licitacoes) ? body.nivel_licitacoes : "sem_acesso";
    const nc = levels.includes(body.nivel_compras) ? body.nivel_compras : "sem_acesso";

    const { error: confirmError } = await admin.auth.admin.updateUserById(id, { email_confirm: true });
    if (confirmError) throw confirmError;

    const payload = {
      ativo: true, perfil: "editor",
      nivel_planejamento: np, nivel_licitacoes: nl, nivel_compras: nc,
      modulo_planejamento: np !== "sem_acesso",
      modulo_licitacoes: nl !== "sem_acesso",
      modulo_compras: nc !== "sem_acesso",
      pode_receber_licitacao: !!body.pode_receber_licitacao
    };
    const { data: saved, error: saveError } = await admin.from("perfis").update(payload).eq("id", id).select("id,nome").single();
    if (saveError) throw saveError;

    return new Response(JSON.stringify({ ok: true, user: saved }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
