/**
 * app.js — a tela do SAC.
 *
 * - Motivos: os assuntos "SAC - ..." do WinThor (motivos.js).
 * - Produto: o código completa o nome pelo cadastro do WinThor (/api/produtos).
 *   A tela não espera o cadastro para abrir: usa a cópia guardada no aparelho e
 *   busca a nova por trás. Sem cadastro, o RCA escreve o nome à mão.
 * - Fotos: reduzidas aqui (lado maior 1600 px, JPEG) antes de subir — uma foto
 *   de celular tem 4 MB e a Vercel aceita 4,5 MB por envio.
 * - RCA: a tela é pública (fica na tela de login do Painel Lube), então o
 *   e-mail precisa ser de um RCA ativo no WinThor. A tela confere assim que o
 *   e-mail é digitado (/api/rca) e mostra o nome; o servidor confere de novo.
 * - NF: precisa existir no WinThor e ter sido emitida até 1 mês atrás (regra do
 *   Júlio, 2026-10-09). Conferida ao digitar (/api/nf), com emissão e cliente
 *   na tela; o servidor confere de novo no envio.
 * - Envio: se falhar, os dados ficam na tela e a mensagem diz o que houve.
 */
(function () {
  "use strict";

  var MOTIVOS = window.SAC_MOTIVOS || [];
  var MAX_FOTOS = 3;
  var LADO_MAX = 1600;
  var QUALIDADE = 0.82;
  var MIN_DETALHE = 15;
  var CHAVE_EMAIL = "sac.email";
  var CHAVE_PRODUTOS = "sac.produtos.v1";
  var RE_EMAIL = /^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\]+\.[a-z]{2,}$/i;
  var DICA_PADRAO = "Do produto ou da nota fiscal — de 1 a 3 fotos.";

  var $ = function (s) { return document.querySelector(s); };
  var estado = {
    motivo: null, fotos: [], processando: 0,
    produtos: null, mapa: null, cadastroFalhou: false, produtoAuto: false,
    enviando: false, sugestoes: [], marcada: -1,
    rca: { email: "", situacao: "", codusur: null, nome: "", mensagem: "" }, rcaTimer: null,
    nf: { nf: "", codusur: null, situacao: "", info: null, mensagem: "" }, nfTimer: null,
  };
  var CAMPOS = ["email", "nf", "motivo", "detalhe", "codprod", "produto", "fotos"];

  /* armazenamento do aparelho: pode não existir (aba anônima, bloqueio) */
  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem espaço ou bloqueado */ } }

  /* ================= erros por campo ================= */
  function campo(nome) { return document.querySelector('[data-campo="' + nome + '"]'); }
  function marcarErro(nome, msg) {
    var c = campo(nome); if (!c) return;
    c.classList.add("tem-erro");
    c.querySelector(".campo__erro").textContent = msg;
  }
  function limparErro(nome) {
    var c = campo(nome); if (!c) return;
    c.classList.remove("tem-erro");
    c.querySelector(".campo__erro").textContent = "";
  }
  function mostrarErros(erros) {
    var primeiro = null;
    CAMPOS.forEach(function (k) {
      if (erros[k]) { marcarErro(k, erros[k]); if (!primeiro) primeiro = k; } else limparErro(k);
    });
    if (primeiro) {
      var c = campo(primeiro);
      c.scrollIntoView({ behavior: "smooth", block: "center" });
      var alvo = c.querySelector("input:not([type=file]), textarea, .motivo, .foto--add");
      if (alvo) setTimeout(function () { alvo.focus({ preventScroll: true }); }, 350);
    }
  }
  function aviso(html) {
    var a = $("#aviso");
    if (!html) { a.hidden = true; a.innerHTML = ""; return; }
    a.innerHTML = html; a.hidden = false;
    a.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function texto(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  /* ================= RCA ================= */
  function mostrarRca() {
    var el = $("#rca"), r = estado.rca;
    $("#email-ajuda").hidden = r.situacao === "ok";
    if (r.situacao === "ok") {
      el.className = "rca is-ok";
      el.innerHTML = '<span class="rca__selo" aria-hidden="true">✓</span><span>RCA <b class="rca__cod">' +
        texto(r.codusur) + "</b> · " + texto(r.nome) + "</span>";
      el.hidden = false;
      limparErro("email");
    } else if (r.situacao === "buscando") {
      el.className = "rca is-buscando";
      el.innerHTML = '<span class="enviar__giro rca__giro" aria-hidden="true"></span><span>Conferindo no cadastro de RCAs…</span>';
      el.hidden = false;
    } else if (r.situacao === "falha") {
      el.className = "rca is-aviso";
      el.textContent = "Não consegui conferir o cadastro agora. Pode seguir preenchendo — a conferência é refeita no envio.";
      el.hidden = false;
    } else {
      el.hidden = true;
      if (r.situacao === "nao") marcarErro("email", r.mensagem);
    }
  }
  function conferirRca() {
    var email = $("#email").value.trim().toLowerCase();
    clearTimeout(estado.rcaTimer);
    if (!RE_EMAIL.test(email)) { estado.rca = { email: "", situacao: "" }; mostrarRca(); return; }
    if (estado.rca.email === email && estado.rca.situacao && estado.rca.situacao !== "falha") { mostrarRca(); return; }
    estado.rca = { email: email, situacao: "buscando" };
    mostrarRca();
    fetch("/api/rca", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email }), cache: "no-store",
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if ($("#email").value.trim().toLowerCase() !== email) return; // digitou outra coisa no meio
        if (x.r.ok && x.j.ok) {
          estado.rca = { email: email, situacao: "ok", codusur: x.j.codusur, nome: x.j.nome };
          if ($("#nf").value) conferirNfTela();
        }
        else if (x.r.status === 404) estado.rca = { email: email, situacao: "nao", mensagem: x.j.mensagem };
        else estado.rca = { email: email, situacao: "falha" };
        mostrarRca();
      })
      .catch(function () {
        if ($("#email").value.trim().toLowerCase() !== email) return;
        estado.rca = { email: email, situacao: "falha" };
        mostrarRca();
      });
  }

  /* ================= NF ================= */
  function mostrarNf() {
    var el = $("#nf-conf"), n = estado.nf;
    if (n.situacao === "ok") {
      var i = n.info || {};
      el.className = "conf is-ok";
      el.innerHTML = '<span class="rca__selo" aria-hidden="true">✓</span><span>Emitida em <b class="rca__cod">' +
        texto(i.emissao) + "</b>" + (i.cliente ? " · " + texto(i.cliente) : "") + "</span>";
      el.hidden = false;
      limparErro("nf");
    } else if (n.situacao === "buscando") {
      el.className = "conf";
      el.innerHTML = '<span class="enviar__giro rca__giro" aria-hidden="true"></span><span>Conferindo a NF no WinThor…</span>';
      el.hidden = false;
    } else if (n.situacao === "falha") {
      el.className = "conf is-aviso";
      el.textContent = "Não consegui conferir a NF agora. Pode seguir preenchendo — a conferência é refeita no envio.";
      el.hidden = false;
    } else {
      el.hidden = true;
      if (n.situacao === "recusada") marcarErro("nf", n.mensagem);
    }
  }
  function conferirNfTela() {
    var nf = $("#nf").value.replace(/\D/g, "");
    var codusur = estado.rca.situacao === "ok" ? estado.rca.codusur : null;
    clearTimeout(estado.nfTimer);
    if (nf.length < 3) { estado.nf = { nf: "", situacao: "" }; mostrarNf(); return; }
    if (estado.nf.nf === nf && estado.nf.codusur === codusur && estado.nf.situacao && estado.nf.situacao !== "falha") { mostrarNf(); return; }
    estado.nf = { nf: nf, codusur: codusur, situacao: "buscando" };
    mostrarNf();
    fetch("/api/nf", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nf: nf, codusur: codusur }), cache: "no-store",
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if ($("#nf").value.replace(/\D/g, "") !== nf) return; // digitou outra coisa no meio
        if (x.r.ok && x.j.ok) estado.nf = { nf: nf, codusur: codusur, situacao: "ok", info: x.j.nf };
        else if (x.r.status === 422) estado.nf = { nf: nf, codusur: codusur, situacao: "recusada", mensagem: x.j.mensagem, info: x.j.nf };
        else estado.nf = { nf: nf, codusur: codusur, situacao: "falha" };
        mostrarNf();
      })
      .catch(function () {
        if ($("#nf").value.replace(/\D/g, "") !== nf) return;
        estado.nf = { nf: nf, codusur: codusur, situacao: "falha" };
        mostrarNf();
      });
  }

  /* ================= motivos ================= */
  function montarMotivos() {
    var caixa = $(".motivos");
    MOTIVOS.forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "motivo";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      b.dataset.cod = m.cod;
      b.innerHTML = '<span class="motivo__nome">' + texto(m.rotulo) + '</span><span class="motivo__cod mono">cód. ' + m.cod + "</span>";
      b.addEventListener("click", function () { escolherMotivo(m.cod); });
      caixa.appendChild(b);
    });
  }
  function escolherMotivo(cod) {
    estado.motivo = cod;
    var m = null;
    document.querySelectorAll(".motivo").forEach(function (b) {
      var on = Number(b.dataset.cod) === cod;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    MOTIVOS.forEach(function (x) { if (x.cod === cod) m = x; });
    $("#dica-foto").textContent = m ? m.dica + " De 1 a 3 fotos." : DICA_PADRAO;
    limparErro("motivo");
  }

  /* ================= produtos ================= */
  function normalizar(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  }
  function usarProdutos(lista) {
    if (!Array.isArray(lista) || !lista.length) return;
    estado.produtos = lista.map(function (p) {
      return { cod: String(p[0]), nome: p[1], ativo: p[2] === 1, chave: normalizar(p[1]) };
    });
    estado.mapa = new Map(estado.produtos.map(function (p) { return [p.cod, p]; }));
    if ($("#codprod").value) conferirCodigo();
  }
  function carregarProdutos() {
    var guardado = ler(CHAVE_PRODUTOS);
    if (guardado) { try { usarProdutos(JSON.parse(guardado).produtos); } catch (e) { /* cópia estragada: ignora */ } }

    // no-store: o CDN da Vercel continua valendo; o cache do navegador, não
    // (o Chrome entrega resposta velha em silêncio — ver Vercel no cérebro).
    fetch("/api/produtos", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (j) {
        usarProdutos(j.produtos);
        gravar(CHAVE_PRODUTOS, JSON.stringify(j));
      })
      .catch(function () {
        estado.cadastroFalhou = true;
        if (!estado.produtos && $("#codprod").value) conferirCodigo();
      });
  }
  function situacaoCadastro(tipo, msg) {
    var el = $("#cadastro");
    el.className = "cadastro mono" + (tipo ? " is-" + tipo : "");
    el.textContent = msg || "";
  }
  function conferirCodigo() {
    var inp = $("#codprod");
    var cod = inp.value.replace(/\D/g, "");
    if (inp.value !== cod) inp.value = cod;
    limparErro("codprod");

    if (!cod) {
      if (estado.produtoAuto) { $("#produto").value = ""; estado.produtoAuto = false; }
      situacaoCadastro("", "");
      return;
    }
    if (!estado.mapa) {
      situacaoCadastro(estado.cadastroFalhou ? "aviso" : "",
        estado.cadastroFalhou
          ? "Cadastro de produtos indisponível agora — escreva o nome do produto."
          : "Carregando o cadastro de produtos…");
      return;
    }
    var p = estado.mapa.get(cod);
    if (p) {
      $("#produto").value = p.nome;
      estado.produtoAuto = true;
      limparErro("produto");
      situacaoCadastro("ok", "✓ Cadastro do WinThor" + (p.ativo ? "" : " · produto fora de linha"));
    } else {
      if (estado.produtoAuto) { $("#produto").value = ""; estado.produtoAuto = false; }
      situacaoCadastro("aviso", "Código " + cod + " não está no cadastro. Confira o número ou escreva o nome do produto.");
    }
  }

  /* busca pelo nome: todas as palavras digitadas precisam aparecer */
  function sugerir() {
    estado.produtoAuto = false;
    var q = normalizar($("#produto").value.trim());
    if (!estado.produtos || q.length < 3) return fecharSugestoes();
    var termos = q.split(/\s+/);
    var achados = [];
    for (var i = 0; i < estado.produtos.length && achados.length < 40; i++) {
      var p = estado.produtos[i];
      if (termos.every(function (t) { return p.chave.indexOf(t) >= 0; })) achados.push(p);
    }
    achados.sort(function (a, b) { return (b.ativo - a.ativo) || a.nome.localeCompare(b.nome); });
    estado.sugestoes = achados.slice(0, 8);
    estado.marcada = -1;

    var ul = $("#sugestoes");
    ul.innerHTML = estado.sugestoes.length
      ? estado.sugestoes.map(function (p, i) {
          return '<li role="option" id="sug-' + i + '" data-i="' + i + '">' +
            '<span class="cod">' + texto(p.cod) + "</span><span>" + texto(p.nome) + "</span>" +
            (p.ativo ? "" : '<span class="fora mono">fora de linha</span>') + "</li>";
        }).join("")
      : '<li class="vazio">Nenhum produto com esse nome no cadastro.</li>';
    ul.hidden = false;
    $("#produto").setAttribute("aria-expanded", "true");
  }
  function fecharSugestoes() {
    $("#sugestoes").hidden = true;
    $("#produto").setAttribute("aria-expanded", "false");
    $("#produto").removeAttribute("aria-activedescendant");
    estado.sugestoes = []; estado.marcada = -1;
  }
  function marcarSugestao(i) {
    var lis = document.querySelectorAll("#sugestoes li[data-i]");
    if (!lis.length) return;
    estado.marcada = (i + lis.length) % lis.length;
    lis.forEach(function (li, k) { li.setAttribute("aria-selected", k === estado.marcada ? "true" : "false"); });
    lis[estado.marcada].scrollIntoView({ block: "nearest" });
    $("#produto").setAttribute("aria-activedescendant", "sug-" + estado.marcada);
  }
  function escolherProduto(p) {
    $("#codprod").value = p.cod;
    $("#produto").value = p.nome;
    estado.produtoAuto = true;
    limparErro("codprod"); limparErro("produto");
    situacaoCadastro("ok", "✓ Cadastro do WinThor" + (p.ativo ? "" : " · produto fora de linha"));
    fecharSugestoes();
  }

  /* ================= fotos ================= */
  function reduzir(arquivo) {
    return new Promise(function (ok, falha) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        try {
          var w0 = img.naturalWidth, h0 = img.naturalHeight;
          var esc = Math.min(1, LADO_MAX / Math.max(w0, h0));
          var w = Math.round(w0 * esc), h = Math.round(h0 * esc);
          var c = document.createElement("canvas");
          c.width = w; c.height = h;
          var ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // PNG transparente não vira fundo preto
          ctx.drawImage(img, 0, 0, w, h);
          var dados = c.toDataURL("image/jpeg", QUALIDADE);
          URL.revokeObjectURL(url);
          ok({ nome: arquivo.name, dados: dados, kb: Math.round((dados.length - 23) * 0.75 / 1024) });
        } catch (e) { URL.revokeObjectURL(url); falha(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); falha(new Error("formato")); };
      img.src = url;
    });
  }

  var ICONE_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.4-2h6.6l1.4 2h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/></svg>';
  var ICONE_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function desenharFotos() {
    var caixa = $("#fotos");
    caixa.innerHTML = "";
    var ocupadas = estado.fotos.length + estado.processando;
    for (var i = 0; i < MAX_FOTOS; i++) {
      var f = estado.fotos[i];
      var el;
      if (f) {
        el = document.createElement("div");
        el.className = "foto";
        el.innerHTML = '<img alt="Foto ' + (i + 1) + '" src="' + f.dados + '">' +
          '<span class="foto__info mono">' + (i + 1) + " · " + f.kb + " KB</span>" +
          '<button type="button" class="foto__tirar" aria-label="Tirar a foto ' + (i + 1) + '" data-i="' + i + '">' + ICONE_X + "</button>";
      } else if (i < ocupadas) {
        el = document.createElement("div");
        el.className = "foto foto--carregando";
        el.innerHTML = '<span class="enviar__giro" style="display:block"></span>';
      } else if (i === ocupadas) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "foto foto--add";
        el.innerHTML = ICONE_CAMERA + "<strong>Adicionar foto</strong><span class=\"mono\">câmera ou galeria</span>";
        el.addEventListener("click", function () { $("#arquivo").click(); });
      } else {
        el = document.createElement("div");
        el.className = "foto foto--vaga mono";
        el.textContent = "Foto " + (i + 1);
      }
      caixa.appendChild(el);
    }
  }

  function receberArquivos(lista) {
    var arquivos = Array.prototype.slice.call(lista || []);
    var vagas = MAX_FOTOS - estado.fotos.length - estado.processando;
    if (!arquivos.length) return;
    limparErro("fotos");
    if (arquivos.length > vagas) {
      marcarErro("fotos", "São no máximo 3 fotos — " + (vagas > 0 ? "usei as " + vagas + " primeiras." : "tire uma para trocar."));
      arquivos = arquivos.slice(0, Math.max(0, vagas));
    }
    arquivos.forEach(function (arq) {
      estado.processando++;
      desenharFotos();
      reduzir(arq).then(function (f) {
        estado.fotos.push(f);
      }, function () {
        marcarErro("fotos", "Não consegui abrir “" + arq.name + "”. Envie a foto em JPG ou PNG (no iPhone: tire pela câmera).");
      }).then(function () {
        estado.processando--;
        desenharFotos();
      });
    });
  }

  /* ================= envio ================= */
  function coletar() {
    return {
      nf: $("#nf").value.replace(/\D/g, ""),
      motivo: estado.motivo,
      detalhe: $("#detalhe").value.trim(),
      codprod: $("#codprod").value.replace(/\D/g, ""),
      produto: $("#produto").value.trim(),
      email: $("#email").value.trim().toLowerCase(),
      fotos: estado.fotos.map(function (f) { return f.dados; }),
    };
  }
  function validar(d) {
    var e = {};
    if (!/^\d{1,10}$/.test(d.nf)) e.nf = "Informe o número da nota fiscal.";
    else if (estado.nf.nf === d.nf && estado.nf.situacao === "recusada") e.nf = estado.nf.mensagem;
    if (!d.motivo) e.motivo = "Escolha o motivo.";
    if (d.detalhe.length < MIN_DETALHE) e.detalhe = "Descreva com detalhes (pelo menos " + MIN_DETALHE + " caracteres).";
    if (!/^\d{1,8}$/.test(d.codprod)) e.codprod = "Informe o código do produto.";
    if (d.produto.length < 2) e.produto = "Informe o produto.";
    if (!d.fotos.length) e.fotos = "Envie pelo menos uma foto do produto ou da nota fiscal.";
    if (!RE_EMAIL.test(d.email)) e.email = "Informe o seu e-mail de RCA.";
    else if (estado.rca.email === d.email && estado.rca.situacao === "nao") e.email = estado.rca.mensagem;
    return e;
  }
  function emEnvio(sim) {
    estado.enviando = sim;
    var b = $("#enviar");
    b.classList.toggle("is-enviando", sim);
    b.setAttribute("aria-busy", sim ? "true" : "false");
    b.querySelector(".enviar__texto").textContent = sim ? "Enviando chamado…" : "Enviar chamado";
  }

  function enviar(ev) {
    ev.preventDefault();
    if (estado.enviando) return;
    if (estado.processando) { aviso("Aguarde as fotos terminarem de carregar."); return; }
    aviso("");
    var d = coletar();
    var erros = validar(d);
    if (Object.keys(erros).length) { mostrarErros(erros); return; }

    gravar(CHAVE_EMAIL, d.email);
    emEnvio(true);
    fetch("/api/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; });
      })
      .then(function (x) {
        if (x.r.ok && x.j.ok) return mostrarEnviado(x.j, d);
        if (x.j.campos) { mostrarErros(x.j.campos); return; }
        if (x.r.status === 401 || x.r.status === 403) {
          aviso("<strong>Sua sessão expirou.</strong> Entre de novo pelo Painel Lube e envie outra vez — os dados continuam aqui.");
          return;
        }
        if (x.r.status === 413) {
          aviso("<strong>As fotos ficaram grandes demais.</strong> Tire uma delas e tente de novo.");
          return;
        }
        aviso("<strong>" + texto(x.j.mensagem || "O chamado não foi enviado.") + "</strong>" +
          (x.j.detalhe ? "<br><span class=\"mono\" style=\"font-size:.62rem;opacity:.8\">" + texto(x.j.detalhe) + "</span>" : ""));
      })
      .catch(function () {
        aviso("<strong>Sem conexão com o servidor.</strong> O chamado não foi enviado e os dados continuam na tela — confira a internet e tente de novo.");
      })
      .then(function () { emEnvio(false); });
  }

  function nomeMotivo(cod) {
    var n = ""; MOTIVOS.forEach(function (m) { if (m.cod === cod) n = m.rotulo; }); return n;
  }
  function mostrarEnviado(j, d) {
    $("#ok-protocolo").textContent = j.protocolo;
    var nome = j.rca ? j.rca.nome : "";
    $("#ok-msg").innerHTML = j.previa
      ? "Este seria o comprovante enviado em nome de <strong>" + texto(nome) + "</strong>."
      : "O comprovante saiu em seu nome, <strong>" + texto(nome.split(" ")[0]) + "</strong>. Confira a caixa de entrada (e o spam, na primeira vez).";
    $("#ok-rca").textContent = j.rca ? j.rca.codusur + " · " + j.rca.nome : "";
    $("#ok-para").textContent = j.para;
    $("#ok-motivo").textContent = nomeMotivo(d.motivo);
    $("#ok-nf").textContent = d.nf + (j.nf && j.nf.emissao ? " · emitida em " + j.nf.emissao : "");
    $("#ok-produto").textContent = d.codprod + " · " + d.produto;
    $("#ok-fotos").textContent = d.fotos.length + (d.fotos.length === 1 ? " foto" : " fotos");
    $("#ok-previa").hidden = !j.previa;
    if (j.previa) $("#ok-previa-link").href = j.previa;

    $("#tela-form").hidden = true;
    $("#tela-ok").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("#tela-ok").focus({ preventScroll: true });
  }

  function novoChamado() {
    var email = $("#email").value;
    $("#form").reset();
    $("#email").value = email;
    estado.motivo = null; estado.fotos = []; estado.produtoAuto = false;
    document.querySelectorAll(".motivo").forEach(function (b) { b.classList.remove("is-on"); b.setAttribute("aria-checked", "false"); });
    CAMPOS.forEach(limparErro);
    estado.nf = { nf: "", situacao: "" };
    mostrarNf();
    mostrarRca();
    $("#dica-foto").textContent = DICA_PADRAO;
    situacaoCadastro("", "");
    contar();
    desenharFotos();
    aviso("");
    $("#tela-ok").hidden = true;
    $("#tela-form").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    $(estado.rca.situacao === "ok" ? "#nf" : "#email").focus({ preventScroll: true });
  }

  function contar() {
    var n = $("#detalhe").value.trim().length;
    var c = $("#contador");
    c.textContent = n < MIN_DETALHE && n > 0 ? "mín. " + MIN_DETALHE + " · " + n + " / 2000" : n + " / 2000";
    c.classList.toggle("is-ok", n >= MIN_DETALHE);
  }

  /* ================= ligações ================= */
  function iniciar() {
    montarMotivos();
    desenharFotos();
    var email = ler(CHAVE_EMAIL);
    if (email) { $("#email").value = email; conferirRca(); }
    carregarProdutos();

    $("#nf").addEventListener("input", function () {
      var v = this.value.replace(/\D/g, ""); if (this.value !== v) this.value = v; limparErro("nf");
      estado.nf = { nf: "", situacao: "" };
      mostrarNf();
      clearTimeout(estado.nfTimer);
      estado.nfTimer = setTimeout(conferirNfTela, 700);
    });
    $("#nf").addEventListener("blur", conferirNfTela);
    $("#detalhe").addEventListener("input", function () { contar(); if (this.value.trim().length >= MIN_DETALHE) limparErro("detalhe"); });
    $("#codprod").addEventListener("input", conferirCodigo);
    $("#email").addEventListener("input", function () {
      limparErro("email");
      estado.rca = { email: "", situacao: "" };
      mostrarRca();
      clearTimeout(estado.rcaTimer);
      estado.rcaTimer = setTimeout(conferirRca, 600);
    });
    $("#email").addEventListener("blur", conferirRca);

    var prod = $("#produto");
    prod.addEventListener("input", function () { limparErro("produto"); sugerir(); });
    prod.addEventListener("keydown", function (e) {
      if ($("#sugestoes").hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); marcarSugestao(estado.marcada + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); marcarSugestao(estado.marcada - 1); }
      else if (e.key === "Enter" && estado.marcada >= 0) { e.preventDefault(); escolherProduto(estado.sugestoes[estado.marcada]); }
      else if (e.key === "Escape") { fecharSugestoes(); }
    });
    prod.addEventListener("blur", function () { setTimeout(fecharSugestoes, 150); });
    // mousedown (e não click) para escolher antes do blur fechar a lista
    $("#sugestoes").addEventListener("mousedown", function (e) {
      var li = e.target.closest("li[data-i]");
      if (!li) return;
      e.preventDefault();
      escolherProduto(estado.sugestoes[Number(li.dataset.i)]);
    });

    $("#arquivo").addEventListener("change", function () { receberArquivos(this.files); this.value = ""; });
    $("#fotos").addEventListener("click", function (e) {
      var b = e.target.closest(".foto__tirar");
      if (!b) return;
      estado.fotos.splice(Number(b.dataset.i), 1);
      limparErro("fotos");
      desenharFotos();
    });

    $("#form").addEventListener("submit", enviar);
    $("#novo").addEventListener("click", novoChamado);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
