/**
 * _rca.js — quem pode abrir SAQ: o RCA ativo cujo e-mail está no WinThor.
 *
 * O SAQ fica aberto na tela de login do Painel Lube, sem login (decisão do
 * Júlio, 2026-10-07). Sem esta conferência, a rota de envio mandaria e-mail com
 * a marca da Lube para QUALQUER endereço digitado, com texto e foto de quem
 * quisesse — um disparador de spam e golpe com o nosso nome. Conferindo, o
 * comprovante só vai para o e-mail que o próprio RCA tem no cadastro.
 *
 * Fonte: core.dim_rca (PCUSUARI), carregada pelo ETL do BI COMERCIAL, com
 * EMAIL e EMAIL2. Ativo = sem data de término e sem bloqueio.
 * Se dois RCAs ativos tiverem o mesmo e-mail (não havia nenhum em 2026-10-07),
 * vale o de menor código.
 */
const { consultar } = require("./_db.js");

const SQL = `
  select codusur, nome
    from core.dim_rca
   where (lower(email) = $1 or lower(email2) = $1)
     and dttermino is null
     and coalesce(bloqueio, 'N') <> 'S'
   order by codusur
   limit 1`;

const MSG_NAO_CADASTRADO =
  "Este e-mail não está no cadastro de nenhum RCA ativo no WinThor. " +
  "Use o e-mail do seu cadastro ou peça ao comercial para atualizá-lo.";

async function buscarRca(email) {
  const r = await consultar(SQL, [String(email || "").trim().toLowerCase()]);
  return r.rows[0] || null;
}

/** "JOAO DA SILVA" -> "Joao da Silva" (o WinThor guarda tudo em maiúsculas). */
function nomeBonito(nome) {
  const miudas = new Set(["da", "de", "do", "das", "dos", "e"]);
  return String(nome || "").trim().toLowerCase().split(/\s+/)
    .map((p, i) => (i > 0 && miudas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

function primeiroNome(nome) {
  return nomeBonito(nome).split(" ")[0] || "";
}

module.exports = { buscarRca, nomeBonito, primeiroNome, MSG_NAO_CADASTRADO };
