/**
 * POST /api/enviar — recebe o SAC preenchido pelo RCA e manda o comprovante
 * para o e-mail dele, em nome dele: remetente com o nome do RCA, resposta para
 * o próprio RCA — "como se ele mesmo estivesse enviando para ele".
 *
 * Corpo (JSON): { nf, motivo, detalhe, codprod, produto, email, fotos: [dataURL, ...] }
 * As fotos chegam já reduzidas pelo navegador (lado maior 1600 px, JPEG), para
 * caber no limite de 4,5 MB por requisição da Vercel e não pesar no 4G do RCA.
 *
 * Tudo é conferido de novo aqui: a tela ajuda, mas quem garante é o servidor.
 * O e-mail precisa ser de um RCA ativo no WinThor (_rca.js) — a tela é pública.
 * A NF precisa existir no WinThor e ter sido emitida até 1 mês atrás (_nf.js).
 * Se o e-mail não sair, a resposta diz que não saiu — nunca um "enviado" falso.
 */
const crypto = require("crypto");
const MOTIVOS = require("../motivos.js");
const { montarEmail } = require("./_email.js");
const { enviar } = require("./_correio.js");
const { buscarRca, nomeBonito, primeiroNome, MSG_NAO_CADASTRADO } = require("./_rca.js");
const { conferirNf } = require("./_nf.js");

const MAX_FOTOS = 3;
const MAX_BYTES_FOTO = 3 * 1024 * 1024;
const RE_EMAIL = /^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\]+\.[a-z]{2,}$/i;

/** Sem caracteres de controle (exceto quebra de linha no detalhe). */
function limpo(v, max, multilinha) {
  if (typeof v !== "string") return "";
  const s = multilinha
    ? v.replace(/\r\n/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    : v.replace(/[\u0000-\u001F\u007F]/g, " ");
  return s.trim().slice(0, max);
}

/** Aceita só JPEG, PNG ou WEBP de verdade — confere a assinatura do arquivo, não o nome. */
function lerFoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length || buf.length > MAX_BYTES_FOTO) return null;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf.slice(0, 4).toString("hex") === "89504e47";
  const webp = buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP";
  const tipo = jpeg ? "jpeg" : png ? "png" : webp ? "webp" : null;
  if (!tipo) return null;
  return { content: buf, contentType: "image/" + tipo, ext: tipo === "jpeg" ? "jpg" : tipo };
}

/**
 * SAC-AAMMDD-XXXXX: data de Brasília + 5 caracteres sem ambiguidade (sem 0/O, 1/I/L).
 * 31^5 = 28 milhões de combinações por dia: com 50 chamados por dia, a chance de dois
 * protocolos iguais num ano é de ~1,6%. Quando o SAC ganhar banco, vira sequencial.
 */
function gerarProtocolo(agora) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", year: "2-digit", month: "2-digit", day: "2-digit",
  }).formatToParts(agora).map((x) => [x.type, x.value]));
  const alfabeto = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let sufixo = "";
  for (const b of crypto.randomBytes(5)) sufixo += alfabeto[b % alfabeto.length];
  return `SAC-${p.year}${p.month}${p.day}-${sufixo}`;
}

function validar(c) {
  const erros = {};
  const d = {
    nf: limpo(c.nf, 20).replace(/\D/g, ""),
    motivo: MOTIVOS.find((m) => m.cod === Number(c.motivo)),
    detalhe: limpo(c.detalhe, 2000, true),
    codprod: limpo(c.codprod, 20).replace(/\D/g, ""),
    produto: limpo(c.produto, 160),
    email: limpo(c.email, 120).toLowerCase(),
    fotos: [],
  };

  if (!/^\d{1,10}$/.test(d.nf)) erros.nf = "Informe o número da nota fiscal (só números).";
  if (!d.motivo) erros.motivo = "Escolha o motivo.";
  if (d.detalhe.length < 15) erros.detalhe = "Descreva o motivo com detalhes (pelo menos 15 caracteres).";
  if (!/^\d{1,8}$/.test(d.codprod)) erros.codprod = "Informe o código do produto (só números).";
  if (d.produto.length < 2) erros.produto = "Informe o produto.";
  if (!RE_EMAIL.test(d.email)) erros.email = "Informe um e-mail válido.";

  const fotos = Array.isArray(c.fotos) ? c.fotos : [];
  if (fotos.length < 1) erros.fotos = "Envie pelo menos uma foto do produto ou da nota fiscal.";
  else if (fotos.length > MAX_FOTOS) erros.fotos = `No máximo ${MAX_FOTOS} fotos.`;
  else {
    for (const f of fotos) {
      const lida = lerFoto(f);
      if (!lida) { erros.fotos = "Uma das fotos não é uma imagem válida (JPG, PNG ou WEBP, até 3 MB)."; break; }
      d.fotos.push(lida);
    }
  }
  return { d, erros };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ erro: "metodo", mensagem: "Use POST." });
  }

  let corpo = req.body;
  if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch (_) { corpo = null; } }
  if (!corpo || typeof corpo !== "object") {
    return res.status(400).json({ erro: "corpo", mensagem: "Requisição sem dados." });
  }

  const { d, erros } = validar(corpo);
  if (Object.keys(erros).length) {
    return res.status(400).json({ erro: "dados_invalidos", mensagem: "Confira os campos destacados.", campos: erros });
  }

  // quem é o RCA: sem conferir o cadastro, não sai nada (a tela é pública)
  let rca;
  try {
    rca = await buscarRca(d.email);
  } catch (e) {
    console.error("SAC: falha ao conferir o RCA", e && e.message);
    return res.status(502).json({
      erro: "falha_cadastro",
      mensagem: "Não consegui conferir seu cadastro de RCA agora. Nada foi enviado — seus dados continuam na tela, tente de novo em instantes.",
      detalhe: String(e && e.message ? e.message : e),
    });
  }
  if (!rca) {
    return res.status(400).json({ erro: "dados_invalidos", mensagem: "Confira os campos destacados.", campos: { email: MSG_NAO_CADASTRADO } });
  }
  const nomeRca = nomeBonito(rca.nome);

  // a NF existe no WinThor e foi emitida até 1 mês atrás? (regra do Júlio, 2026-10-09)
  let conf;
  try {
    conf = await conferirNf(d.nf, rca.codusur);
  } catch (e) {
    console.error("SAC: falha ao conferir a NF", e && e.message);
    return res.status(502).json({
      erro: "falha_nf",
      mensagem: "Não consegui conferir a nota fiscal no WinThor agora. Nada foi enviado — seus dados continuam na tela, tente de novo em instantes.",
      detalhe: String(e && e.message ? e.message : e),
    });
  }
  if (!conf.ok) {
    return res.status(400).json({ erro: "dados_invalidos", mensagem: "Confira os campos destacados.", campos: { nf: conf.mensagem } });
  }

  const agora = new Date();
  const protocolo = gerarProtocolo(agora);
  const anexos = d.fotos.map((f, i) => ({
    cid: `foto${i + 1}.${protocolo.toLowerCase()}@sac.lube`,
    filename: `${protocolo}-foto-${i + 1}.${f.ext}`,
    content: f.content,
    contentType: f.contentType,
  }));

  const { assunto, html, texto } = montarEmail({
    protocolo, quando: agora, nf: d.nf, nfInfo: conf.nf, motivo: d.motivo, detalhe: d.detalhe,
    codprod: d.codprod, produto: d.produto, email: d.email, fotos: anexos,
    rca: { cod: rca.codusur, nome: nomeRca, primeiro: primeiroNome(rca.nome) },
  });

  const r = await enviar({ para: d.email, nomeRemetente: nomeRca, assunto, html, texto, anexos, protocolo });
  if (!r.ok) {
    console.error("SAC: falha no envio", protocolo, r.erro);
    return res.status(502).json({
      erro: "falha_envio",
      mensagem: "O e-mail NÃO foi enviado. Seus dados continuam na tela — tente de novo em instantes.",
      detalhe: r.erro,
    });
  }

  console.log("SAC enviado", protocolo, "rca", rca.codusur, "motivo", d.motivo.cod, "nf", d.nf, "fotos", anexos.length);
  return res.status(200).json({
    ok: true,
    protocolo,
    para: d.email,
    rca: { codusur: rca.codusur, nome: nomeRca },
    nf: conf.nf,
    copia: r.copia,
    copiaEmEnviados: r.copiaEmEnviados,
    previa: r.previa || null,
  });
};

module.exports.gerarProtocolo = gerarProtocolo;
module.exports.validar = validar;
