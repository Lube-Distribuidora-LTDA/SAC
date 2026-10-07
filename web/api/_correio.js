/**
 * _correio.js — envio do e-mail pelo SMTP da Locaweb (mesmo esquema do Gestão TI).
 *
 * Variáveis (Vercel › Settings › Environment Variables):
 *   SMTP_HOST            email-ssl.com.br   (o certificado é *.email-ssl.com.br)
 *   SMTP_PORT            465
 *   SMTP_USER            sac@lube.com.br — a caixa do SAC, por onde o SAQ sai (Júlio, 2026-10-07)
 *   SMTP_PASS            a senha dessa caixa — só aqui, nunca no código
 *   SAQ_COPIA_PARA       opcional: quem recebe cópia de todo SAQ, separado por vírgula
 *   IMAP_HOST/IMAP_USER/IMAP_PASS  guardam a cópia em Enviados do sac@ (recomendado: é o
 *                        registro de todos os SAQs dentro da própria caixa do SAC)
 *
 * REMETENTE = O PRÓPRIO RCA, NO NOME (decisão do Júlio, 2026-10-07: "como se ele
 * mesmo estivesse enviando o e-mail para ele"). O e-mail chega com o NOME do RCA
 * como remetente e a resposta volta para o RCA. O ENDEREÇO do remetente continua
 * sendo a caixa da Lube, e não o Gmail/Hotmail dele, porque:
 *  - sair "de fulano@gmail.com" por um servidor que não é do Google é falsificação
 *    de remetente: o Gmail e o Hotmail marcam como suspeito ou mandam para o spam,
 *    e o Yahoo (DMARC p=reject) recusa — e 80% dos RCAs usam Gmail/Hotmail;
 *  - enviar pela caixa do RCA de verdade exigiria a senha dele, e senha não se guarda.
 *
 * Por que guardar em Enviados: o SMTP só transmite. No Gestão TI a cobrança saía
 * de verdade e não aparecia no webmail, dando a impressão de que nada tinha saído.
 * Enquanto o SAQ não tem banco, a pasta Enviados é o registro de tudo o que foi aberto.
 *
 * SAQ_MODO_PREVIA=1 (só o servidor_local liga): não envia nada — grava o e-mail
 * em arquivo para conferir o visual. Em produção, SMTP faltando é ERRO, nunca
 * "sucesso de mentira".
 */
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const MailComposer = require("nodemailer/lib/mail-composer");

function smtpFaltando() {
  return ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((v) => !process.env[v]);
}

function listaDeCopia() {
  return (process.env.SAQ_COPIA_PARA || "")
    .split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/** Nome do RCA como remetente; em objeto, o nodemailer cuida das aspas e acentos. */
function remetente(nome) {
  return { name: String(nome || "SAQ - Lube Distribuidora").replace(/[\r\n"]/g, " ").trim(),
           address: process.env.SMTP_USER || "sac@lube.com.br" };
}

async function guardarEmEnviados(bruta) {
  const { IMAP_HOST: host, IMAP_USER: user, IMAP_PASS: pass } = process.env;
  if (!host || !user || !pass) return false;
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host, port: Number(process.env.IMAP_PORT || 993), secure: true, auth: { user, pass },
    logger: false, greetingTimeout: 10000, socketTimeout: 15000,
  });
  try {
    await client.connect();
    const pastas = await client.list();
    const enviados = pastas.find((p) => p.specialUse === "\\Sent") ||
      pastas.find((p) => ["INBOX.enviadas", "INBOX.Sent", "INBOX.Itens Enviados", "Sent", "Enviados"].includes(p.path));
    if (!enviados) { await client.logout(); return false; }
    await client.append(enviados.path, bruta, ["\\Seen"]);
    await client.logout();
    return true;
  } catch (_) {
    try { await client.close(); } catch (__) { /* já fechado */ }
    return false;
  }
}

/** Troca cid:fotoN pelas próprias imagens, para a prévia abrir no navegador. */
function htmlComImagens(html, anexos) {
  let saida = html;
  for (const a of anexos) {
    const dataUri = `data:${a.contentType};base64,${a.content.toString("base64")}`;
    saida = saida.split(`cid:${a.cid}`).join(dataUri);
  }
  return saida;
}

/**
 * Envia (ou, no modo prévia, grava) o e-mail.
 * m = { para, nomeRemetente, assunto, html, texto, anexos: [{cid, filename, content: Buffer, contentType}], protocolo }
 */
async function enviar(m) {
  const copia = listaDeCopia();
  const mensagem = {
    from: remetente(m.nomeRemetente),
    to: m.para,
    cc: copia.length ? copia : undefined,
    replyTo: m.para,
    subject: m.assunto,
    html: m.html,
    text: m.texto,
    /*
     * Cada foto vai duas vezes: embutida (cid), para aparecer no corpo, e como
     * anexo comum, para baixar e encaminhar — o Outlook não lista as embutidas
     * na barra de anexos.
     */
    attachments: m.anexos.flatMap((a) => [
      { filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid },
      { filename: a.filename, content: a.content, contentType: a.contentType },
    ]),
  };

  if (process.env.SAQ_MODO_PREVIA === "1") {
    const pasta = process.env.SAQ_PASTA_PREVIA || path.join(process.cwd(), "previas");
    fs.mkdirSync(pasta, { recursive: true });
    const base = m.protocolo;
    fs.writeFileSync(path.join(pasta, base + ".html"), htmlComImagens(m.html, m.anexos));
    fs.writeFileSync(path.join(pasta, base + ".eml"), await new MailComposer(mensagem).compile().build());
    return { ok: true, previa: "/previas/" + base + ".html", copia, copiaEmEnviados: false };
  }

  const faltam = smtpFaltando();
  if (faltam.length) {
    return { ok: false, erro: "SMTP não configurado. Faltam as variáveis: " + faltam.join(", ") };
  }

  try {
    const transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 25000,
    });

    // monta uma vez e usa duas: enviada e arquivada em Enviados, byte a byte igual
    const bruta = await new MailComposer(mensagem).compile().build();
    const info = await transporte.sendMail({
      raw: bruta,
      envelope: { from: process.env.SMTP_USER, to: [m.para, ...copia] },
    });

    let copiaEmEnviados = false;
    try { copiaEmEnviados = await guardarEmEnviados(bruta); } catch (_) { /* a mensagem já partiu */ }

    return { ok: true, messageId: info.messageId, copia, copiaEmEnviados };
  } catch (e) {
    return { ok: false, erro: e && e.message ? e.message : String(e) };
  }
}

module.exports = { enviar };
