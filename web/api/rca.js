/**
 * POST /api/rca — confere se o e-mail digitado é de um RCA ativo no WinThor.
 * A tela usa para mostrar "RCA 123 · Fulano" assim que o e-mail é digitado,
 * antes de o RCA preencher o resto. Quem garante de verdade é o /api/enviar,
 * que confere de novo.
 *
 * Corpo: { email }   Resposta: { ok: true, codusur, nome } | 404 { ok: false, mensagem }
 */
const { faltandoVariaveis, responderErro } = require("./_db.js");
const { buscarRca, nomeBonito, MSG_NAO_CADASTRADO } = require("./_rca.js");

const RE_EMAIL = /^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\]+\.[a-z]{2,}$/i;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, mensagem: "Use POST." });
  }
  let corpo = req.body;
  if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch (_) { corpo = null; } }
  const email = String((corpo && corpo.email) || "").trim().toLowerCase().slice(0, 120);
  if (!RE_EMAIL.test(email)) return res.status(400).json({ ok: false, mensagem: "E-mail inválido." });

  const faltam = faltandoVariaveis();
  if (faltam.length) {
    return res.status(500).json({ ok: false, mensagem: "Faltam variáveis de ambiente do banco: " + faltam.join(", ") });
  }

  try {
    const rca = await buscarRca(email);
    if (!rca) return res.status(404).json({ ok: false, mensagem: MSG_NAO_CADASTRADO });
    return res.status(200).json({ ok: true, codusur: rca.codusur, nome: nomeBonito(rca.nome) });
  } catch (e) {
    responderErro(res, e);
  }
};
