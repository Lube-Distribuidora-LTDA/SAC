/**
 * _email.js — o e-mail que o SAC manda para o RCA.
 *
 * Mesma pegada do e-mail de cobrança do Gestão TI (faixa azul com o nome do
 * assistente, filete azul→vermelho, tabela zebrada, rodapé cinza), com mais
 * cuidado visual: protocolo em destaque, motivo com o código do WinThor, linha
 * do andamento e as fotos dentro do corpo.
 *
 * Regras de e-mail, que não são as da web:
 *  - só tabela e estilo em linha: o Outlook do Windows desenha com o motor do
 *    Word e ignora flex, grid e quase todo CSS moderno;
 *  - todo degradê tem cor sólida antes (bgcolor) — o Outlook mostra a sólida;
 *  - a marca é texto, não imagem: cliente de e-mail bloqueia imagem externa
 *    por padrão e a identidade sumiria na primeira abertura;
 *  - as fotos vão como anexo embutido (cid:), que os leitores mostram sem
 *    pedir licença, e continuam anexas para quem quiser baixar.
 */

const AZUL = "#1e2b8c";
const AZUL_VIVO = "#2c3fc4";
const AZUL_NOITE = "#0c1547";
const VERMELHO = "#ee1b24";
const TINTA = "#1c2439";
const CINZA = "#6b7690";
const LINHA = "#e6eaf4";
const FONTE = "'Segoe UI',Arial,Helvetica,sans-serif";

/** Escapa texto que vai para dentro do HTML do e-mail. */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dataHora(d) {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const p = Object.fromEntries(f.map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

/* ---------- peças ---------- */

function faixaSac(contato) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#ffffff;">
    <tr>
      <td bgcolor="${AZUL}" style="background:${AZUL};background-image:linear-gradient(135deg,${AZUL_NOITE} 0%,${AZUL} 55%,${AZUL_VIVO} 100%);
                 padding:20px 28px 18px;border-radius:0 0 40px 0;white-space:nowrap;">
        <div style="color:#ffffff;font-family:${FONTE};font-size:30px;line-height:30px;font-weight:800;letter-spacing:3px;">SAC</div>
        <div style="color:#aab6ff;font-family:${FONTE};font-size:10px;line-height:14px;font-weight:700;letter-spacing:2px;padding-top:5px;">
          <span style="color:${VERMELHO};">&#9679;</span>&nbsp;&nbsp;CHAMADO DO RCA
        </div>
      </td>
      <td style="padding:16px 18px;white-space:nowrap;" valign="middle">
        ${contato ? `
        <span style="display:inline-block;background:${VERMELHO};color:#ffffff;font-size:11px;padding:3px 7px;border-radius:3px;vertical-align:middle;">&#9993;</span>
        <span style="color:${TINTA};font-family:${FONTE};font-size:14px;vertical-align:middle;padding-left:7px;">${esc(contato)}</span>` : ""}
      </td>
      <td align="right" valign="middle" style="padding:14px 26px;white-space:nowrap;">
        <span style="color:${AZUL};font-family:${FONTE};font-size:22px;font-weight:800;letter-spacing:-.3px;">Lube</span>
        <span style="display:inline-block;background:${VERMELHO};color:#ffffff;font-family:${FONTE};font-size:9px;font-weight:800;
                     letter-spacing:1.4px;padding:2px 6px;margin-left:5px;vertical-align:middle;">DISTRIBUIDORA</span>
        <div style="color:${AZUL};font-family:${FONTE};font-size:9px;font-weight:700;letter-spacing:1.6px;margin-top:3px;">DESDE 1959</div>
      </td>
    </tr>
  </table>`;
}

function selo(texto, cor) {
  return `<span style="display:inline-block;background:${cor};color:#ffffff;font-family:${FONTE};font-size:11px;font-weight:800;
                       text-transform:uppercase;letter-spacing:1px;padding:5px 12px;border-radius:20px;">${texto}</span>`;
}

function caixaProtocolo(protocolo, quando) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;border-collapse:separate;">
    <tr><td bgcolor="${AZUL_NOITE}" align="center"
            style="background:${AZUL_NOITE};background-image:linear-gradient(135deg,${AZUL} 0%,${AZUL_NOITE} 70%);
                   border-radius:14px;padding:22px 18px;">
      <div style="color:#aab6ff;font-family:${FONTE};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.8px;">Protocolo</div>
      <div style="color:#ffffff;font-family:Consolas,'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:2px;padding:6px 0 4px;">${esc(protocolo)}</div>
      <div style="color:#c9d1f5;font-family:${FONTE};font-size:12px;">Aberto em ${esc(quando)}</div>
    </td></tr>
  </table>`;
}

/** Registrado → Em análise → Resolvido, com o primeiro passo aceso. */
function andamento() {
  const passo = (n, texto, aceso) => `
    <td align="center" valign="top" width="33%" style="padding:0 4px;">
      <div style="width:26px;height:26px;line-height:26px;border-radius:13px;margin:0 auto;font-family:${FONTE};font-size:12px;font-weight:800;
                  ${aceso ? `background:${VERMELHO};color:#ffffff;` : `background:#ffffff;color:#aeb6cc;border:2px solid ${LINHA};line-height:22px;width:22px;height:22px;`}">${aceso ? "&#10003;" : n}</div>
      <div style="font-family:${FONTE};font-size:11px;font-weight:700;letter-spacing:.4px;padding-top:6px;color:${aceso ? TINTA : "#9aa3ba"};">${texto}</div>
    </td>`;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;">
    <tr>${passo(1, "Registrado", true)}${passo(2, "Em análise", false)}${passo(3, "Resolvido", false)}</tr>
  </table>`;
}

function blocoMotivo(m) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-collapse:separate;">
    <tr>
      <td width="5" bgcolor="${VERMELHO}" style="background:${VERMELHO};border-radius:4px 0 0 4px;font-size:0;line-height:0;">&nbsp;</td>
      <td bgcolor="#fff5f5" style="background:#fff5f5;padding:14px 18px;border-radius:0 10px 10px 0;">
        <div style="color:${CINZA};font-family:${FONTE};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;">Motivo</div>
        <div style="color:${TINTA};font-family:${FONTE};font-size:19px;font-weight:800;padding:3px 0 2px;">${esc(m.rotulo)}</div>
        <div style="color:${CINZA};font-family:Consolas,'Courier New',monospace;font-size:12px;">WinThor · assunto ${esc(m.cod)} · ${esc(m.winthor)}</div>
      </td>
    </tr>
  </table>`;
}

function tabela(linhas) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="border:1px solid ${LINHA};border-radius:10px;border-collapse:separate;overflow:hidden;margin:18px 0;">
    ${linhas.map(([k, v], i) => `
    <tr>
      <td bgcolor="${i % 2 ? "#f7f9fd" : "#ffffff"}" width="36%"
          style="background:${i % 2 ? "#f7f9fd" : "#ffffff"};padding:11px 14px;color:${CINZA};font-family:${FONTE};font-size:13px;font-weight:600;
                 ${i < linhas.length - 1 ? `border-bottom:1px solid ${LINHA};` : ""}">${k}</td>
      <td bgcolor="${i % 2 ? "#f7f9fd" : "#ffffff"}"
          style="background:${i % 2 ? "#f7f9fd" : "#ffffff"};padding:11px 14px;color:${TINTA};font-family:${FONTE};font-size:14px;font-weight:600;
                 ${i < linhas.length - 1 ? `border-bottom:1px solid ${LINHA};` : ""}">${v}</td>
    </tr>`).join("")}
  </table>`;
}

function blocoDetalhe(texto) {
  return `
  <div style="color:${CINZA};font-family:${FONTE};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin:4px 0 8px;">Detalhes informados</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
    <tr>
      <td width="4" bgcolor="${AZUL}" style="background:${AZUL};font-size:0;line-height:0;">&nbsp;</td>
      <td bgcolor="#f5f7fc" style="background:#f5f7fc;padding:14px 18px;border-radius:0 10px 10px 0;color:${TINTA};font-family:${FONTE};
                                   font-size:14px;line-height:1.6;">${esc(texto).replace(/\r?\n/g, "<br>")}</td>
    </tr>
  </table>`;
}

function blocoFotos(fotos) {
  if (!fotos.length) return "";
  const celula = (f, i) => `
    <td width="33%" valign="top" style="padding:0 ${i < 2 ? 8 : 0}px 0 0;">
      <img src="cid:${f.cid}" width="170" alt="Foto ${i + 1}"
           style="display:block;width:100%;max-width:170px;height:auto;border-radius:10px;border:1px solid ${LINHA};">
      <div style="color:${CINZA};font-family:${FONTE};font-size:11px;padding-top:5px;">Foto ${i + 1}</div>
    </td>`;
  const vazias = Array.from({ length: 3 - fotos.length }, () => `<td width="33%">&nbsp;</td>`).join("");
  return `
  <div style="color:${CINZA};font-family:${FONTE};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;margin:24px 0 10px;">
    Fotos comprobatórias (${fotos.length})
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${fotos.map(celula).join("")}${vazias}</tr></table>
  <div style="color:#9aa3ba;font-family:${FONTE};font-size:11px;padding-top:8px;">As fotos também seguem anexas a este e-mail.</div>`;
}

function layout(conteudo, contato) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>SAC</title></head>
<body style="margin:0;padding:0;background:#eef1f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef1f8" style="background:#eef1f8;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(14,23,66,.16);">
        <tr><td style="padding:0;">${faixaSac(contato)}</td></tr>
        <tr><td height="4" bgcolor="${AZUL}" style="height:4px;line-height:4px;font-size:0;background:${AZUL};background-image:linear-gradient(90deg,${AZUL},${VERMELHO});">&nbsp;</td></tr>
        <tr><td style="padding:30px 32px 32px;color:${TINTA};font-family:${FONTE};font-size:15px;line-height:1.65;">
          ${conteudo}
        </td></tr>
        <tr><td bgcolor="#f5f7fc" style="background:#f5f7fc;border-top:1px solid ${LINHA};padding:20px 32px;color:${CINZA};font-family:${FONTE};font-size:12px;line-height:1.6;">
          <strong style="color:${AZUL};">Lube Distribuidora</strong> &middot; SAC<br>
          Mensagem automática do SAC, enviada em nome do RCA para o próprio e-mail. Guarde-a: é o comprovante do chamado.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Monta o e-mail de comprovante.
 * d = { protocolo, quando: Date, nf, motivo: {cod, rotulo, winthor}, detalhe,
 *       codprod, produto, email, fotos: [{cid}], rca: {cod, nome, primeiro},
 *       nfInfo: {emissao, filial, codcli, cliente} (da conferência no WinThor) }
 */
function montarEmail(d) {
  const quando = dataHora(d.quando);
  const assunto = `[${d.protocolo}] Chamado registrado — ${d.motivo.rotulo} — NF ${d.nf}`;

  const html = layout(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>${selo("Chamado registrado", "#059669")}</td>
      <td align="right" style="color:${CINZA};font-family:${FONTE};font-size:12px;">${esc(quando)}</td>
    </tr></table>

    <p style="margin:18px 0 0;">Olá, <strong>${esc(d.rca.primeiro)}</strong>!</p>
    <p style="margin:8px 0 0;">
      Seu chamado foi registrado e este e-mail é o seu <strong>comprovante</strong>.
      Guarde o número do protocolo — ele identifica o chamado em qualquer conversa com o SAC.
    </p>

    ${caixaProtocolo(d.protocolo, quando)}
    ${andamento()}
    ${blocoMotivo(d.motivo)}

    ${tabela([
      ["RCA", `<span style="font-family:Consolas,'Courier New',monospace;font-size:15px;">${esc(d.rca.cod)}</span> &middot; ${esc(d.rca.nome)}`],
      ["Nota fiscal", `<span style="font-family:Consolas,'Courier New',monospace;font-size:15px;">${esc(d.nf)}</span>` +
        (d.nfInfo ? ` <span style="color:${CINZA};font-weight:500;font-size:13px;">&middot; emitida em ${esc(d.nfInfo.emissao)}` +
                    (d.nfInfo.filial != null ? ` &middot; filial ${esc(d.nfInfo.filial)}` : "") + `</span>` : "")],
      ...(d.nfInfo && d.nfInfo.cliente
        ? [["Cliente", `<span style="font-family:Consolas,'Courier New',monospace;font-size:15px;">${esc(d.nfInfo.codcli)}</span> &middot; ${esc(d.nfInfo.cliente)}`]]
        : []),
      ["Cód. produto", `<span style="font-family:Consolas,'Courier New',monospace;font-size:15px;">${esc(d.codprod)}</span>`],
      ["Produto", esc(d.produto)],
      ["E-mail do RCA", `<a href="mailto:${esc(d.email)}" style="color:${AZUL};text-decoration:none;">${esc(d.email)}</a>`],
    ])}

    ${blocoDetalhe(d.detalhe)}
    ${blocoFotos(d.fotos)}

    <p style="margin:28px 0 0;color:#3a4460;">
      Atenciosamente,<br>
      <strong style="color:${AZUL};">${esc(d.rca.nome)}</strong><br>
      RCA ${esc(d.rca.cod)} &middot; Lube Distribuidora
    </p>
  `, d.email);

  const texto = [
    `CHAMADO REGISTRADO — protocolo ${d.protocolo}`,
    `Aberto em ${quando}`,
    "",
    `RCA: ${d.rca.cod} — ${d.rca.nome}`,
    `Motivo: ${d.motivo.rotulo} (WinThor, assunto ${d.motivo.cod} — ${d.motivo.winthor})`,
    `Nota fiscal: ${d.nf}` + (d.nfInfo ? ` (emitida em ${d.nfInfo.emissao}${d.nfInfo.filial != null ? `, filial ${d.nfInfo.filial}` : ""})` : ""),
    ...(d.nfInfo && d.nfInfo.cliente ? [`Cliente: ${d.nfInfo.codcli} — ${d.nfInfo.cliente}`] : []),
    `Cód. produto: ${d.codprod}`,
    `Produto: ${d.produto}`,
    `E-mail do RCA: ${d.email}`,
    "",
    "Detalhes informados:",
    d.detalhe,
    "",
    `Fotos comprobatórias: ${d.fotos.length} (em anexo)`,
    "",
    "Mensagem automática do SAC — Lube Distribuidora, enviada em nome do RCA para o próprio e-mail.",
  ].join("\n");

  return { assunto, html, texto };
}

module.exports = { montarEmail, esc };
