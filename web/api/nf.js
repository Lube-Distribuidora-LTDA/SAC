/**
 * POST /api/nf — confere a NF assim que o RCA digita: existe no WinThor e foi
 * emitida até 1 mês atrás? A tela mostra a emissão e o cliente, ou o motivo da
 * recusa. Quem garante de verdade é o /api/enviar, que confere de novo.
 *
 * Só para quem está logado no SAC (o retorno traz nome de cliente).
 * Corpo: { nf }   (o RCA da conta logada desempata NF de número repetido)
 * Resposta: 200 { ok: true, nf } | 422 { ok: false, situacao, mensagem, nf? }
 */
const { faltandoVariaveis, responderErro } = require("./_db.js");
const { conferirNf } = require("./_nf.js");
const { sessaoSac } = require("./_auth.js");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, mensagem: "Use POST." });
  }
  let corpo = req.body;
  if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch (_) { corpo = null; } }
  const nf = String((corpo && corpo.nf) || "").replace(/\D/g, "");
  if (!/^\d{1,10}$/.test(nf)) return res.status(400).json({ ok: false, mensagem: "Número de NF inválido." });
  let sessao;
  try {
    sessao = await sessaoSac(req);
  } catch (e) {
    return res.status(502).json({ ok: false, mensagem: "Não consegui conferir seu login agora. Tente de novo em instantes." });
  }
  if (!sessao.ok) return res.status(sessao.status).json({ ok: false, mensagem: sessao.mensagem });
  const codusur = sessao.conta.codusur || null;

  const faltam = faltandoVariaveis();
  if (faltam.length) {
    return res.status(500).json({ ok: false, mensagem: "Faltam variáveis de ambiente do banco: " + faltam.join(", ") });
  }

  try {
    const r = await conferirNf(nf, codusur);
    return res.status(r.ok ? 200 : 422).json(r);
  } catch (e) {
    responderErro(res, e);
  }
};
