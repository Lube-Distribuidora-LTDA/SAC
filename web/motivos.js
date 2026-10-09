/**
 * motivos.js — os motivos que o RCA pode escolher no SAC.
 *
 * Saem do WinThor: tabela PCMANASSUNTO, a família "SAC - ..." (códigos 65 a 73,
 * setor 12, todos ATIVO = 'S'), conferida no Oracle em 2026-10-07. São os assuntos
 * criados para o SAC — os demais (logística, fiscal, transportadora) não são do RCA.
 *
 * O código vai no e-mail para quem lançar a manifestação no WinThor escolher o
 * assunto certo sem precisar adivinhar. Se o WinThor ganhar ou desativar um
 * assunto "SAC - ...", é só mexer nesta lista.
 *
 * Usado pela tela (window.SAC_MOTIVOS) e pela API (require).
 */
(function (raiz) {
  var MOTIVOS = [
    { cod: 67, rotulo: "Mercadoria avariada",        winthor: "SAC - MERCADORIA AVARIADA",     dica: "Fotografe o produto avariado e a embalagem." },
    { cod: 66, rotulo: "Falta de mercadoria",        winthor: "SAC - FALTA DE MERCADORIA",     dica: "Fotografe a nota fiscal com o item que faltou." },
    { cod: 72, rotulo: "Mercadoria diferente da NF", winthor: "SAC - MERCADORIA DIFERENTE NF", dica: "Fotografe o produto recebido e a linha dele na nota." },
    { cod: 68, rotulo: "Vencimento curto",           winthor: "SAC - VENCIMENTO CURTO",        dica: "Fotografe a data de validade impressa no produto." },
    { cod: 69, rotulo: "Item vencido",               winthor: "SAC - ITEM VENCIDO",            dica: "Fotografe a data de validade impressa no produto." },
    { cod: 65, rotulo: "Pedido em desacordo",        winthor: "SAC - PEDIDO EM DESACORDO",     dica: "Fotografe a nota fiscal." },
    { cod: 71, rotulo: "Pedido duplicado",           winthor: "SAC - PEDIDO DUPLICADO",        dica: "Fotografe as duas notas fiscais." },
    { cod: 73, rotulo: "Cliente não pediu",          winthor: "SAC - CLIENTE NAO PEDIU",       dica: "Fotografe a nota fiscal." },
    { cod: 70, rotulo: "Desistiu da compra",         winthor: "SAC - DESISTIU DA COMPRA",      dica: "Fotografe a nota fiscal." }
  ];

  if (typeof module === "object" && module.exports) module.exports = MOTIVOS;
  else raiz.SAC_MOTIVOS = MOTIVOS;
})(this);
