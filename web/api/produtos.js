/**
 * GET /api/produtos — o cadastro de produtos do WinThor, para o SAC completar
 * o nome do produto a partir do código (e o código a partir do nome).
 *
 * Fonte: core.dim_produto no DATA WAREHOUSE (PCPRODUT, atualizada pelo ETL do
 * BI COMPRAS). ~7.300 produtos, ~330 KB de JSON, ~70 KB comprimido.
 *
 * A tela NÃO espera por esta rota para abrir: ela usa a cópia guardada no
 * aparelho e busca esta por trás. Se o banco estiver lento, o RCA ainda
 * consegue digitar o nome do produto à mão.
 *
 * Cache no CDN da Vercel: 1 h fresco e até 7 dias entregando a cópia velha
 * enquanto busca a nova — o cadastro muda pouco e o banco já saturou duas
 * vezes (ver Supabase no cérebro). Erro nunca vai para o cache.
 *
 * Resposta: { gerado_em, produtos: [[codprod, descricao, ativo(1|0)], ...] }
 */
const { consultar, faltandoVariaveis, responderErro } = require("./_db.js");

module.exports = async (req, res) => {
  const faltam = faltandoVariaveis();
  if (faltam.length) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({
      erro: "configuracao",
      mensagem: "Faltam variáveis de ambiente do banco: " + faltam.join(", "),
    });
  }

  try {
    const r = await consultar(
      `select codprod, descricao, status
         from core.dim_produto
        where descricao is not null
        order by codprod`
    );
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=604800");
    res.status(200).json({
      gerado_em: new Date().toISOString(),
      produtos: r.rows.map((p) => [p.codprod, p.descricao.trim().replace(/\s+/g, " "), p.status === "FORALINHA" ? 0 : 1]),
    });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    responderErro(res, e);
  }
};
