/**
 * servidor_local.js — abre o SAC no seu computador, antes (ou sem) publicar na Vercel.
 *
 * Serve a pasta web/ e atende /api/produtos, /api/rca e /api/enviar com AS MESMAS funções
 * que a Vercel usa.
 *
 *   cd web
 *   npm install            (uma vez)
 *   node servidor_local.js
 *   abra http://localhost:3110
 *
 * MODO PRÉVIA (padrão): nada é enviado. O e-mail vai para a pasta web/previas/
 * (.html para ver no navegador, .eml para abrir no Outlook) e a tela mostra o link.
 *
 * ENVIO DE VERDADE: passe um arquivo com as variáveis SMTP_* (e, se quiser,
 * IMAP_* e SAC_COPIA_PARA):
 *   node servidor_local.js --smtp "C:\caminho\arquivo.env"
 * As senhas são lidas para a memória deste processo e nunca são impressas nem gravadas.
 *
 * O cadastro de produtos vem do DATA WAREHOUSE com as variáveis SUPABASE_DB_*
 * do ENV de um ETL (C:\BI\COMERCIAL\ENV, C:\BI\COMPRAS\ENV ou
 * P:\INTEGRAÇÃO BI\REPOSICOES\ENV). Sem elas, a tela abre e o RCA escreve o nome do produto.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const WEB = __dirname;
const PORTA = Number(process.env.PORTA || 3110);
const PREVIAS = path.join(WEB, "previas");

function carregarEnv(arquivo, so) {
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    if (linha.trim().startsWith("#")) continue;
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m || (so && !so.test(m[1]))) continue;
    let v = m[2];
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

/* banco: só as variáveis SUPABASE_DB_* do ENV de um ETL */
const envBanco = ["C:\\BI\\COMERCIAL\\ENV", "C:\\BI\\COMPRAS\\ENV", "P:\\INTEGRAÇÃO BI\\REPOSICOES\\ENV"]
  .find((c) => fs.existsSync(c));
if (envBanco && !process.env.SUPABASE_DB_PASSWORD) carregarEnv(envBanco, /^SUPABASE_DB_/);
process.env.SUPABASE_DB_PORT = process.env.SUPABASE_DB_PORT || "5432";

/* e-mail: prévia, a não ser que venha --smtp arquivo */
const iSmtp = process.argv.indexOf("--smtp");
if (iSmtp > 0 && process.argv[iSmtp + 1]) {
  carregarEnv(process.argv[iSmtp + 1], /^(SMTP_|IMAP_|SAC_)/);
  process.env.SAC_MODO_PREVIA = "0";
} else {
  process.env.SAC_MODO_PREVIA = "1";
  process.env.SAC_PASTA_PREVIA = PREVIAS;
}

const rotas = {
  "/api/produtos": require(path.join(WEB, "api", "produtos.js")),
  "/api/enviar": require(path.join(WEB, "api", "enviar.js")),
  "/api/rca": require(path.join(WEB, "api", "rca.js")),
  "/api/nf": require(path.join(WEB, "api", "nf.js")),
};
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".json": "application/json", ".eml": "message/rfc822",
};

http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");

  if (rotas[u.pathname]) {
    // o mesmo "res" que a Vercel entrega às funções
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); };
    req.query = Object.fromEntries(u.searchParams);
    const partes = [];
    let tamanho = 0;
    req.on("data", (p) => {
      tamanho += p.length;
      if (tamanho > 4.5 * 1024 * 1024) { res.status(413).json({ erro: "grande_demais" }); req.destroy(); return; }
      partes.push(p);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      const bruto = Buffer.concat(partes).toString("utf8");
      try { req.body = bruto ? JSON.parse(bruto) : undefined; } catch (_) { req.body = bruto; }
      Promise.resolve(rotas[u.pathname](req, res)).catch((e) => {
        console.error(e);
        if (!res.writableEnded) res.status(500).json({ erro: "interno", mensagem: String(e.message || e) });
      });
    });
    return;
  }

  const relativo = u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname).replace(/^\/+/, "");
  const f = path.resolve(WEB, relativo);
  // só serve o que está dentro de web/ — nunca a API, as dependências nem este arquivo
  const ok = f.startsWith(WEB + path.sep) &&
    !/[\\/](api|node_modules)[\\/]/.test(f.slice(WEB.length)) &&
    !/servidor_local\.js$|package(-lock)?\.json$/.test(f) &&
    fs.existsSync(f) && fs.statSync(f).isFile();
  if (!ok) { res.statusCode = 404; return res.end("não encontrado"); }
  res.setHeader("Content-Type", TIPOS[path.extname(f)] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.end(fs.readFileSync(f));
}).listen(PORTA, () => {
  console.log("SAC em http://localhost:" + PORTA + "   (Ctrl+C para parar)");
  console.log(process.env.SAC_MODO_PREVIA === "1"
    ? "Modo PRÉVIA: nada é enviado; os e-mails vão para " + PREVIAS
    : "Modo ENVIO: os e-mails SAEM de verdade por " + (process.env.SMTP_USER || "?"));
  console.log(envBanco ? "Cadastro de produtos: DATA WAREHOUSE (variáveis de " + envBanco + ")"
                       : "Cadastro de produtos: sem ENV do banco — o RCA escreve o nome do produto");
});
