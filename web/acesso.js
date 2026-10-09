/**
 * acesso.js — login do SAC (2026-10-09).
 *
 * Mesmo jeito do Painel Lube: "Entrar" e "Primeiro acesso". A conta mora na base
 * de login do Painel (Supabase Auth), mas é uma conta do SAC: nasce PENDENTE e
 * só entra depois que o TI libera na aba "SAC · externos" do painel admin, onde
 * o primeiro acesso aparece como aviso. Conta do SAC não abre o painel.
 *
 * - RCA: no cadastro, o e-mail é conferido no WinThor (/api/rca) e o código do
 *   RCA vai junto. Supervisor: o WinThor não tem o e-mail dele (rotina 516
 *   vazia), então o TI confere antes de liberar.
 * - Usuário do painel (@lube) que entrar aqui sem conta do SAC pode pedir acesso.
 * - O formulário de chamado (app.js) pega o token daqui: window.SAC_ACESSO.
 */
(function () {
  "use strict";

  var CFG = window.SAC_CFG;
  var sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "sac-lube-sessao" },
  });

  var $ = function (s) { return document.querySelector(s); };
  var RE_EMAIL = /^[^\s@<>(),;:"\[\]\\]+@[^\s@<>(),;:"\[\]\\]+\.[a-z]{2,}$/i;
  var CHAVE_EMAIL = "sac.email";
  var MSG = {
    pendente: "Seu cadastro ainda não foi liberado pelo TI. Assim que for, é só entrar.",
    recusado: "Seu cadastro no SAC foi recusado. Fale com o TI (cpd@lube.com.br).",
    bloqueado: "Seu acesso ao SAC está bloqueado. Fale com o TI (cpd@lube.com.br).",
  };

  var conta = null;
  var tipo = "rca";
  var rca = { email: "", situacao: "" }, rcaTimer = null;

  function ler(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bloqueado */ } }
  function texto(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function erro(html) {
    var el = $("#gate-erro");
    el.innerHTML = html || "";
    el.hidden = !html;
  }
  function ocupado(botao, sim, rotulo) {
    botao.classList.toggle("is-enviando", sim);
    botao.setAttribute("aria-busy", sim ? "true" : "false");
    if (rotulo) botao.querySelector(".enviar__texto").textContent = rotulo;
  }

  /* ================= telas ================= */
  function irPara(modo) {
    document.querySelectorAll(".gate__modo").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-modo") === modo); });
    document.querySelectorAll(".gate__form").forEach(function (f) { f.classList.toggle("is-on", f.getAttribute("data-form") === modo); });
    $(".gate__modos").hidden = false;
    $("#gate-ok").hidden = true;
    $("#btn-pedir").hidden = true;
    erro("");
  }
  function mostrarLogin(modo, mensagem) {
    conta = null;
    $("#carregando").hidden = true;
    $("#tela-app").hidden = true;
    $("#tela-login").hidden = false;
    irPara(modo || "entrar");
    if (mensagem) erro(mensagem);
  }
  function mostrarOk(mensagem) {
    document.querySelectorAll(".gate__form").forEach(function (f) { f.classList.remove("is-on"); });
    $(".gate__modos").hidden = true;
    $("#gate-ok-msg").innerHTML = mensagem;
    $("#gate-ok").hidden = false;
    erro("");
  }
  function mostrarApp(c) {
    conta = c;
    $("#carregando").hidden = true;
    $("#tela-login").hidden = true;
    $("#tela-app").hidden = false;
    $("#conta-nome").textContent = c.nome || c.email || "";
    $("#conta-tipo").textContent = c.tipo === "supervisor" ? "Supervisor" : "RCA" + (c.codusur ? " " + c.codusur : "");
    if (window.SAC_APP && window.SAC_APP.pronto) window.SAC_APP.pronto(c);
  }

  /* ================= conta ================= */
  function minhaConta() {
    return sb.rpc("sac_meu_acesso").then(function (r) {
      if (r.error) throw r.error;
      return r.data || {};
    });
  }
  function decidir(c, acabouDeEntrar) {
    if (c.situacao === "liberado") {
      if (acabouDeEntrar) sb.rpc("sac_registrar", { p_acao: "login", p_detalhe: "" }).then(function () {}, function () {});
      mostrarApp(c);
      return;
    }
    if (c.situacao === "sem_cadastro") {
      // conta do painel (e-mail @lube) que ainda não tem SAC: pode pedir
      mostrarLogin("entrar", c.corporativo
        ? "Sua conta é do Painel Lube e ainda não tem acesso ao SAC. Peça abaixo — o TI libera."
        : "Esta conta não tem acesso ao SAC.");
      if (c.corporativo) $("#btn-pedir").hidden = false;
      return;
    }
    return sb.auth.signOut().then(function () {
      mostrarLogin("entrar", MSG[c.situacao] || "Seu acesso ao SAC não está liberado. Fale com o TI.");
    });
  }

  /* ================= Entrar ================= */
  function entrar(ev) {
    ev.preventDefault();
    var email = $("#l-email").value.trim().toLowerCase();
    var senha = $("#l-senha").value;
    erro("");
    if (!RE_EMAIL.test(email)) { erro("Informe o seu e-mail."); $("#l-email").focus(); return; }
    if (!senha) { erro("Informe a senha."); $("#l-senha").focus(); return; }
    var b = $("#btn-entrar");
    ocupado(b, true, "Entrando…");
    sb.auth.signInWithPassword({ email: email, password: senha })
      .then(function (r) {
        if (r.error) {
          var m = String(r.error.message || "");
          throw new Error(/invalid login|credentials/i.test(m) ? "E-mail ou senha incorretos." : "Não consegui entrar agora: " + m);
        }
        gravar(CHAVE_EMAIL, email);
        $("#l-senha").value = "";
        return minhaConta().then(function (c) { return decidir(c, true); });
      })
      .catch(function (e) { erro(texto(e && e.message ? e.message : "Não consegui entrar agora. Tente de novo.")); })
      .then(function () { ocupado(b, false, "Entrar"); });
  }

  /* usuário do painel pede acesso ao SAC */
  function pedirAcesso() {
    var b = $("#btn-pedir");
    ocupado(b, true);
    sb.auth.getSession()
      .then(function (r) {
        var email = r.data.session ? r.data.session.user.email : "";
        // é RCA no WinThor? então pede como RCA; senão, como supervisor
        return fetch("/api/rca", { method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ email: email }), cache: "no-store" })
          .then(function (x) { return x.ok ? "rca" : "supervisor"; }, function () { return "supervisor"; });
      })
      .then(function (t) { return sb.rpc("sac_pedir_acesso", { p_tipo: t }); })
      .then(function (r) {
        if (r.error) throw r.error;
        return sb.auth.signOut();
      })
      .then(function () {
        mostrarOk("O TI recebeu seu pedido no painel administrativo. Assim que liberar, é só entrar com o mesmo e-mail e senha.");
      })
      .catch(function (e) { erro(texto(e && e.message ? e.message : "Não consegui pedir agora. Tente de novo.")); })
      .then(function () { ocupado(b, false); });
  }

  /* ================= Primeiro acesso ================= */
  function escolherTipo(t) {
    tipo = t;
    document.querySelectorAll(".tipo").forEach(function (b) {
      var on = b.getAttribute("data-tipo") === t;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    $("#c-email").placeholder = t === "rca" ? "o e-mail do seu cadastro no WinThor" : "seu e-mail";
    rca = { email: "", situacao: "" };
    mostrarRcaCadastro();
    if (t === "rca") conferirRcaCadastro();
  }
  function mostrarRcaCadastro() {
    var el = $("#c-rca");
    if (tipo !== "rca" || !rca.situacao) { el.hidden = true; return; }
    if (rca.situacao === "ok") {
      el.className = "rca is-ok";
      el.innerHTML = '<span class="rca__selo" aria-hidden="true">✓</span><span>RCA <b class="rca__cod">' +
        texto(rca.codusur) + "</b> · " + texto(rca.nome) + "</span>";
    } else if (rca.situacao === "buscando") {
      el.className = "rca";
      el.innerHTML = '<span class="enviar__giro rca__giro" aria-hidden="true"></span><span>Conferindo no cadastro de RCAs…</span>';
    } else if (rca.situacao === "nao") {
      el.className = "rca is-aviso";
      el.textContent = rca.mensagem || "Este e-mail não está no cadastro de nenhum RCA ativo no WinThor.";
    } else {
      el.className = "rca is-aviso";
      el.textContent = "Não consegui conferir o cadastro agora. Tente de novo em instantes.";
    }
    el.hidden = false;
  }
  function conferirRcaCadastro() {
    var email = $("#c-email").value.trim().toLowerCase();
    clearTimeout(rcaTimer);
    if (tipo !== "rca" || !RE_EMAIL.test(email)) { rca = { email: "", situacao: "" }; mostrarRcaCadastro(); return Promise.resolve(); }
    if (rca.email === email && (rca.situacao === "ok" || rca.situacao === "nao")) { mostrarRcaCadastro(); return Promise.resolve(); }
    rca = { email: email, situacao: "buscando" };
    mostrarRcaCadastro();
    return fetch("/api/rca", { method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ email: email }), cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if ($("#c-email").value.trim().toLowerCase() !== email) return;
        if (x.r.ok && x.j.ok) rca = { email: email, situacao: "ok", codusur: x.j.codusur, nome: x.j.nome };
        else if (x.r.status === 404) rca = { email: email, situacao: "nao", mensagem: x.j.mensagem };
        else rca = { email: email, situacao: "falha" };
        mostrarRcaCadastro();
      }, function () {
        rca = { email: email, situacao: "falha" };
        mostrarRcaCadastro();
      });
  }

  function cadastrar(ev) {
    ev.preventDefault();
    erro("");
    var nome = $("#c-nome").value.trim().replace(/\s+/g, " ");
    var email = $("#c-email").value.trim().toLowerCase();
    var s1 = $("#c-senha").value, s2 = $("#c-senha2").value;
    if (nome.length < 3) { erro("Informe o seu nome completo."); $("#c-nome").focus(); return; }
    if (!RE_EMAIL.test(email)) { erro("Informe um e-mail válido."); $("#c-email").focus(); return; }
    if (s1.length < 8) { erro("A senha precisa ter pelo menos 8 caracteres."); $("#c-senha").focus(); return; }
    if (s1 !== s2) { erro("As duas senhas não são iguais."); $("#c-senha2").focus(); return; }

    var b = $("#btn-cadastrar");
    ocupado(b, true, "Enviando…");
    var conferir = tipo === "rca" ? conferirRcaCadastro() : Promise.resolve();
    conferir
      .then(function () {
        if (tipo === "rca") {
          if (rca.situacao === "nao") throw new Error(rca.mensagem || "Este e-mail não está no cadastro de nenhum RCA ativo no WinThor.");
          if (rca.situacao !== "ok") throw new Error("Não consegui conferir seu cadastro de RCA agora. Tente de novo em instantes.");
        }
        var dados = { sistema: "sac", nome: nome, tipo: tipo };
        if (tipo === "rca") dados.codusur = String(rca.codusur);
        return sb.auth.signUp({ email: email, password: s1, options: { data: dados } });
      })
      .then(function (r) {
        if (r.error) {
          var m = String(r.error.message || "");
          if (/already|registered|exists/i.test(m)) throw new Error("Este e-mail já tem cadastro. Use “Entrar”.");
          throw new Error("Não consegui cadastrar agora: " + m);
        }
        var u = r.data && r.data.user;
        if (u && Array.isArray(u.identities) && u.identities.length === 0) {
          throw new Error("Este e-mail já tem cadastro. Use “Entrar”.");
        }
        gravar(CHAVE_EMAIL, email);
        // a base confirma o e-mail na hora e já abre sessão: sai dela, a conta está pendente
        return sb.auth.signOut();
      })
      .then(function () {
        ["#c-nome", "#c-email", "#c-senha", "#c-senha2"].forEach(function (s) { $(s).value = ""; });
        rca = { email: "", situacao: "" };
        mostrarRcaCadastro();
        $("#l-email").value = email;
        mostrarOk("Seu cadastro chegou ao TI, no painel administrativo. Assim que for liberado, é só entrar com este e-mail e a senha que você criou.");
      })
      .catch(function (e) { erro(texto(e && e.message ? e.message : "Não consegui cadastrar agora. Tente de novo.")); })
      .then(function () { ocupado(b, false, "Pedir meu acesso"); });
  }

  /* ================= sair / sessão vencida ================= */
  function sair() {
    sb.rpc("sac_registrar", { p_acao: "logout", p_detalhe: "" })
      .then(function () {}, function () {})
      .then(function () { return sb.auth.signOut(); })
      .then(function () { mostrarLogin("entrar"); $("#l-email").value = ler(CHAVE_EMAIL) || ""; });
  }
  function expirou() {
    // o formulário fica como está (escondido): depois de entrar de novo, os dados continuam lá
    sb.auth.signOut().then(function () {
      mostrarLogin("entrar", "Sua sessão expirou. Entre de novo — os dados do chamado continuam guardados nesta tela.");
    });
  }
  function token() {
    return sb.auth.getSession().then(function (r) { return r.data.session ? r.data.session.access_token : null; });
  }

  /* ================= ligações ================= */
  function iniciar() {
    document.querySelectorAll(".gate__modo").forEach(function (b) {
      b.addEventListener("click", function () { irPara(b.getAttribute("data-modo")); });
    });
    document.querySelectorAll(".tipo").forEach(function (b) {
      b.addEventListener("click", function () { escolherTipo(b.getAttribute("data-tipo")); });
    });
    $('[data-form="entrar"]').addEventListener("submit", entrar);
    $('[data-form="primeiro"]').addEventListener("submit", cadastrar);
    $("#btn-pedir").addEventListener("click", pedirAcesso);
    $("[data-voltar-login]").addEventListener("click", function () { irPara("entrar"); });
    $("#btn-sair").addEventListener("click", sair);
    $("#c-email").addEventListener("input", function () {
      rca = { email: "", situacao: "" };
      mostrarRcaCadastro();
      clearTimeout(rcaTimer);
      rcaTimer = setTimeout(conferirRcaCadastro, 600);
    });
    $("#c-email").addEventListener("blur", function () { conferirRcaCadastro(); });
    $("#l-email").value = ler(CHAVE_EMAIL) || "";

    sb.auth.getSession()
      .then(function (r) {
        if (!r.data.session) { mostrarLogin("entrar"); return; }
        return minhaConta().then(function (c) { return decidir(c, false); });
      })
      .catch(function () {
        mostrarLogin("entrar", "Não consegui conferir seu acesso agora. Confira a internet e tente entrar de novo.");
      });
  }

  window.SAC_ACESSO = {
    token: token,
    expirou: expirou,
    conta: function () { return conta; },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
