/**
 * _auth.js — quem está mandando o chamado? (login do SAC, desde 2026-10-09)
 *
 * O SAC passou a ter login próprio (Entrar / Primeiro acesso) na base de login
 * do Painel Lube. O navegador manda o token da sessão em "Authorization:
 * Bearer"; aqui o token é conferido no próprio Supabase do Painel
 * (/auth/v1/user) e a conta precisa estar LIBERADA pelo TI
 * (sac_meu_acesso() = 'liberado'). Só a chave pública (anon) é usada — nenhum
 * segredo do Painel fica neste projeto.
 *
 * Devolve { ok: true, token, userId, email, conta } ou { ok: false, status, mensagem }.
 * Erro de rede/servidor do Painel sobe como exceção (quem chama responde 502:
 * nada sai sem conferir o login).
 */
const PAINEL = require("./_painel.js");

const TEMPO_MS = 8000;

function cabecalhos(token) {
  return { apikey: PAINEL.ANON, Authorization: "Bearer " + token, "Content-Type": "application/json" };
}

async function sessaoSac(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  // Só para os testes automáticos, no servidor local em modo prévia (nada é
  // enviado). Na Vercel SAC_MODO_PREVIA não existe, então isto nunca vale lá.
  if (process.env.SAC_MODO_PREVIA === "1" && process.env.SAC_SESSAO_TESTE) {
    if (h !== "Bearer teste") return { ok: false, status: 401, mensagem: "Entre no SAC para abrir chamado." };
    const t = JSON.parse(process.env.SAC_SESSAO_TESTE);
    return { ok: true, token: "teste", userId: "teste", email: t.email, conta: t.conta };
  }
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,})$/.exec(String(h).trim());
  if (!m) return { ok: false, status: 401, mensagem: "Entre no SAC para abrir chamado." };
  const token = m[1];

  const u = await fetch(PAINEL.URL + "/auth/v1/user", {
    headers: cabecalhos(token), signal: AbortSignal.timeout(TEMPO_MS),
  });
  if (u.status === 401 || u.status === 403) {
    return { ok: false, status: 401, mensagem: "Sua sessão expirou. Entre de novo no SAC." };
  }
  if (!u.ok) throw new Error("login do Painel respondeu " + u.status);
  const usuario = await u.json();

  const r = await fetch(PAINEL.URL + "/rest/v1/rpc/sac_meu_acesso", {
    method: "POST", headers: cabecalhos(token), body: "{}", signal: AbortSignal.timeout(TEMPO_MS),
  });
  if (!r.ok) throw new Error("sac_meu_acesso respondeu " + r.status);
  const conta = await r.json();
  if (!conta || conta.situacao !== "liberado") {
    return { ok: false, status: 403, mensagem: "Seu acesso ao SAC não está liberado. Fale com o TI." };
  }
  return { ok: true, token, userId: usuario.id, email: String(usuario.email || "").toLowerCase(), conta };
}

/** Registro de chamado enviado na aba "SAC" do painel admin. Falha aqui não derruba nada. */
async function registrar(token, acao, detalhe) {
  if (token === "teste") return;
  try {
    await fetch(PAINEL.URL + "/rest/v1/rpc/sac_registrar", {
      method: "POST", headers: cabecalhos(token),
      body: JSON.stringify({ p_acao: acao, p_detalhe: String(detalhe || "").slice(0, 200) }),
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch (_) { /* o chamado já saiu; o registro é secundário */ }
}

module.exports = { sessaoSac, registrar };
