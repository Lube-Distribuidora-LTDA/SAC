/**
 * _nf.js — a nota fiscal digitada pelo RCA existe no WinThor e foi emitida até 1 mês atrás?
 *
 * Regra do Júlio (2026-10-09): o SAC só aceita NF emitida há no máximo 1 mês
 * (mês de calendário: emitida em 09/09, vale até 09/10). Nota mais antiga,
 * cancelada ou que não existe não deixa abrir o chamado.
 *
 * Fonte: core.dim_nf_saida (capa da PCNFSAID), carregada pelo ETL do BI
 * COMERCIAL 8 vezes por dia (07h, 08h, 09h, 10h, 13h, 15h, 16h e 17h), com as
 * notas dos últimos 45 dias. Nota emitida depois da última carga só aparece na
 * próxima — a mensagem diz isso.
 *
 * O número da NF se repete entre filiais. Entre as candidatas vale a não
 * cancelada, depois a do próprio RCA, depois a mais recente.
 */
const { consultar } = require("./_db.js");

const SQL = `
  select n.numnota, n.dtsaida::text as dtsaida, n.dtcancel::text as dtcancel,
         n.codfilial, n.codcli, n.codusur, n.especie,
         c.cliente,
         (n.dtsaida + interval '1 month')::date >= (now() at time zone 'America/Sao_Paulo')::date as dentro_prazo
    from core.dim_nf_saida n
    left join core.dim_cliente c on c.codcli = n.codcli
   where n.numnota = $1
   order by (n.dtcancel is null) desc,
            (n.codusur is not distinct from $2::integer) desc,
            n.dtsaida desc
   limit 1`;

function dataBr(d) {
  if (!d) return "";
  const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const [a, m, dia] = iso.split("-");
  return `${dia}/${m}/${a}`;
}

/**
 * Devolve { ok, situacao, mensagem, nf }.
 * situacao: "ok" | "nao_encontrada" | "cancelada" | "fora_prazo"
 */
async function conferirNf(numnota, codusur) {
  const r = await consultar(SQL, [Number(numnota), codusur == null ? null : Number(codusur)]);
  const n = r.rows[0];
  if (!n) {
    return {
      ok: false, situacao: "nao_encontrada",
      mensagem: "NF não encontrada entre as notas do último mês no WinThor. Confira o número. " +
                "Nota emitida hoje aparece depois da próxima atualização (7h, 8h, 9h, 10h, 13h, 15h, 16h e 17h).",
    };
  }
  const nf = {
    numnota: String(n.numnota),
    emissao: dataBr(n.dtsaida),
    filial: n.codfilial,
    codcli: n.codcli,
    cliente: n.cliente ? String(n.cliente).trim().replace(/\s+/g, " ") : null,
    especie: n.especie,
  };
  if (n.dtcancel) {
    return { ok: false, situacao: "cancelada", nf,
             mensagem: `Esta NF foi cancelada no WinThor em ${dataBr(n.dtcancel)}.` };
  }
  if (!n.dentro_prazo) {
    return { ok: false, situacao: "fora_prazo", nf,
             mensagem: `NF emitida em ${nf.emissao}, há mais de 1 mês. O SAC só aceita notas emitidas até 1 mês atrás.` };
  }
  return { ok: true, situacao: "ok", nf, mensagem: "" };
}

module.exports = { conferirNf };
