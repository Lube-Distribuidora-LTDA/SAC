# SAC — Lube Distribuidora

> Até 2026-10-09 o sistema se chamava **SAQ**; o nome certo é **SAC** (Júlio). Endereço, repositório,
> protocolo e textos foram trocados juntos. O endereço antigo `saq-lube.vercel.app` continua ligado ao
> projeto e redireciona (308) para `sac-lube.vercel.app` — regra `redirects` do `web/vercel.json`.

Tela em que o **RCA (ou supervisor) abre um chamado para o SAC**: nota fiscal, motivo, detalhes, produto e
até 3 fotos comprobatórias. Ao enviar, o sistema gera um **protocolo** e manda o comprovante **em nome de
quem está logado, para ele mesmo** — na pegada do e-mail de cobrança do Gestão TI.

**Login próprio (desde 2026-10-09):** "Entrar" e "Primeiro acesso", no mesmo jeito do Painel Lube, na
**mesma base de login do Painel** (Supabase Auth do projeto PAINEL LUBE DISTRIBUIDORA). A conta é do SAC,
não do painel: nasce **pendente**, aparece como aviso na aba **"SAC · externos"** do painel admin e só entra
depois que o TI libera. O atalho na tela de login do Painel continua levando até aqui. Detalhes em
"Login" abaixo.

> **Fase 1 (2026-10-07):** só a tela e o e-mail. Ainda **não há banco**: o chamado não fica gravado em lugar
> nenhum além do e-mail (e da cópia em Enviados, se o IMAP estiver configurado). O sistema de chamados
> (fila, andamento, resposta do SAC) é a fase seguinte.

## Campos

| Campo | Regra |
|---|---|
| Nota fiscal | só números, até 10 dígitos |
| Motivo | um dos 9 assuntos **"SAC - ..."** do WinThor (`PCMANASSUNTO`, códigos 65 a 73) — ver `web/motivos.js` |
| Detalhes | texto livre, mínimo 15 caracteres |
| Cód. produto | só números; **completa o nome do produto** pelo cadastro do WinThor |
| Produto | preenchido pelo código, ou buscado pelo nome (todas as palavras digitadas) |
| Fotos | de 1 a 3, do produto ou da NF; reduzidas no celular para 1600 px antes de subir |

## Como funciona

```
Tela de login do Painel Lube ──► atalho "SAC" ──► login do SAC (acesso.js) ──► formulário (app.js)
                     │  Entrar / Primeiro acesso ◄─► Supabase Auth do PAINEL (conta sac_usuarios, liberada pelo TI)
                     │  GET  /api/produtos  ◄── core.dim_produto (DATA WAREHOUSE), cache no CDN
                     │  POST /api/rca       ◄── core.dim_rca: o e-mail do cadastro é de um RCA ativo?
                     │  POST /api/nf        ◄── token + core.dim_nf_saida: NF emitida até 1 mês atrás?
                     │  POST /api/enviar    ──► token + RCA + NF conferidos ──► SMTP da Locaweb ──► quem está logado
```

### Login
- **Primeiro acesso:** nome, "Você é RCA ou Supervisor", e-mail e senha. RCA: o e-mail é conferido no WinThor
  (`/api/rca`) e o código do RCA vai junto. Supervisor: o WinThor não tem o e-mail dele (rotina 516 vazia em
  2026-10-09), então o TI confere antes de liberar. O cadastro chama `signUp` do Supabase Auth do Painel com
  `sistema: 'sac'` nos metadados; o gatilho `handle_new_user` do Painel cria a linha em `sac_usuarios` como
  **pendente**, **sem** perfil do painel (migração `sac_acesso_v1`, arquivo `db/03_sac_acesso.sql` no
  repositório do Painel). A base confirma o e-mail na hora e abre sessão: o SAC sai dela logo em seguida.
- **Entrar:** `signInWithPassword` + `sac_meu_acesso()`. Só `liberado` entra; `pendente`, `recusado` e
  `bloqueado` saem com a mensagem certa. Usuário do painel (@lube) sem conta do SAC pode **pedir acesso**
  (`sac_pedir_acesso`).
- **API:** `/api/nf` e `/api/enviar` exigem `Authorization: Bearer <token>`; `_auth.js` confere o token no
  próprio Supabase do Painel (`/auth/v1/user`) e a conta liberada — só com a chave **pública** (anon), nenhum
  segredo do Painel neste projeto. O comprovante vai para o e-mail **da conta**, nunca para um digitado.
  RCA precisa continuar ativo no WinThor; supervisor entra pela conta liberada.
- **Registro:** cadastro, pedido, entrada, saída e chamado enviado vão para `sac_acessos` (aba do admin).
- **Teste local:** com `SAC_MODO_PREVIA=1` e `SAC_SESSAO_TESTE` (JSON com `email` e `conta`), o `_auth.js`
  aceita o token `teste` — só para os testes automáticos; na Vercel essas variáveis não existem.
```

### "Como se ele mesmo estivesse enviando"
O comprovante chega com o **nome do RCA como remetente**, **para** o e-mail dele e com a **resposta
voltando para ele**. O **endereço** do remetente é a caixa do SAC (`sac@lube.com.br`), não o Gmail do RCA:

- 80% dos RCAs usam Gmail ou Hotmail (WinThor, 2026-10-07). Um e-mail que diz vir de `@gmail.com` e sai
  de outro servidor é falsificação de remetente: Gmail e Hotmail marcam como suspeito ou mandam para o
  spam, e o Yahoo (`DMARC p=reject`) recusa. O comprovante não chegaria.
- Sair da caixa do próprio RCA exigiria a senha dele — e senha não se guarda.

### Por que só conta liberada (e RCA ativo)
Antes do login (07–09/10) a tela era pública e a conferência do RCA era a única barreira contra virar
disparador de e-mail com a marca da Lube. Com o login, só conta **liberada pelo TI** envia, e o comprovante vai
para o e-mail **dela**; o RCA ainda precisa estar ativo no WinThor. Banco ou login fora do ar → nada é enviado
(falha fechada) e a tela diz isso.

O e-mail vem de `core.dim_rca` (colunas `email`, `email2`, `bloqueio`, `dttermino`), carregada pelo ETL do
**BI COMERCIAL** — dono da dimensão (`web/db/07-dim-rca-email.sql` no repositório do COMERCIAL).
Em 2026-10-07: 128 RCAs ativos, **101 com e-mail válido; 20 sem e-mail e 7 com e-mail errado no WinThor**
(`@gmailcom`, `@htmail.com`…). Esses 27 só conseguem abrir chamado depois de corrigido o cadastro no WinThor.

- **Abre na hora:** o cadastro de produtos (~7.300 itens) fica guardado no aparelho e é atualizado por trás.
  Se o banco estiver lento, o RCA escreve o nome do produto à mão — nada trava.
- **O servidor confere tudo de novo:** motivo da lista, e-mail único e sem quebra de linha, foto que é foto de
  verdade (assinatura do arquivo, não o nome), texto escapado no HTML.
- **Nunca "enviado" de mentira:** se o SMTP falhar ou faltar, a tela diz que **não** foi e os dados continuam lá.
- **Fotos no corpo e em anexo:** embutidas (aparecem no e-mail) e anexas (para baixar e encaminhar).
- **Protocolo:** `SAC-AAMMDD-XXXXX` (data de Brasília + 5 caracteres). Vira sequencial quando houver banco.

## Rodar no computador

```powershell
cd "C:\Users\gti.julio.alves\Desktop\BI\10. SAC\web"
npm install
node servidor_local.js
```

Abra http://localhost:3110. Por padrão é **modo prévia**: nada é enviado, o e-mail vai para `web/previas/`
(`.html` para ver no navegador, `.eml` para abrir no Outlook) e a tela de sucesso mostra o link.

Para **enviar de verdade** do computador, passe um arquivo com as variáveis `SMTP_*`:

```powershell
node servidor_local.js --smtp "C:\caminho\arquivo.env"
```

O cadastro de produtos usa as variáveis `SUPABASE_DB_*` do ENV de um ETL (`C:\BI\COMERCIAL\ENV`,
`C:\BI\COMPRAS\ENV` ou `P:\INTEGRAÇÃO BI\REPOSICOES\ENV`). Senhas são lidas para a memória e nunca gravadas.

## Publicar na Vercel (ainda não publicado)

Mesmo molde do REPOSIÇÕES: **Root Directory = `web`**, região `gru1`, sem build. Endereço previsto:
`https://sac-lube.vercel.app` (é o que o atalho do portal abre).

| Variável | Valor |
|---|---|
| `SUPABASE_DB_HOST` | `aws-0-sa-east-1.pooler.supabase.com` |
| `SUPABASE_DB_PORT` | `5432` |
| `SUPABASE_DB_NAME` | `postgres` |
| `SUPABASE_DB_USER` | `postgres.ivcnotrynogaljrvvyes` |
| `SUPABASE_DB_PASSWORD` | senha do DATA WAREHOUSE |
| `SMTP_HOST` | `email-ssl.com.br` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `sac@lube.com.br` — a caixa do SAC, por onde o chamado sai (o nome mostrado é o do RCA) |
| `SMTP_PASS` | senha do `sac@` — cadastrada pelo Júlio, nunca em arquivo |
| `IMAP_HOST` | `email-ssl.com.br` |
| `IMAP_USER` | `sac@lube.com.br` |
| `IMAP_PASS` | a mesma senha do `sac@` |
| `SAC_COPIA_PARA` | opcional — quem recebe cópia de todo chamado na caixa de entrada |

Com o IMAP cadastrado, cada chamado enviado fica guardado em **Enviados do `sac@`**: é o registro de todos os
chamados dentro da caixa do próprio SAC, enquanto o sistema não tem banco. Sem o IMAP o e-mail sai igual, só
não fica a cópia.

**Guarda da Sentinela:** `middleware.ts` + `sentinela-guarda.ts` já estão em `web/` (cópia do portal,
guarda 1.1.0). Na publicação: cadastrar o projeto em `sentinela.sistemas` com **`exige_login = false`**
(o SAC é aberto por decisão do Júlio) e conferir `/.sentinela/saude`. O guarda não pede login, mas barra
ataque, robô e rajada — o que protege `/api/rca` de quem quiser testar e-mails em série.

## Arquivos

| Arquivo | O que é |
|---|---|
| `web/index.html`, `estilo.css`, `app.js` | a tela (celular primeiro, tema escuro do Painel Lube) |
| `web/acesso.js`, `config.js` | login (Entrar / Primeiro acesso) na base do Painel; endereço e chave pública |
| `web/api/_auth.js`, `_painel.js` | confere o token e a conta liberada no Supabase do Painel |
| `web/api/nf.js`, `_nf.js` | conferência da NF (emitida até 1 mês atrás) em `core.dim_nf_saida` |
| `web/motivos.js` | os 9 motivos SAC do WinThor (usado pela tela e pela API) |
| `web/api/enviar.js` | confere login, RCA e NF, gera o protocolo, monta e envia o e-mail |
| `web/api/rca.js`, `_rca.js` | conferência do e-mail do RCA no `core.dim_rca` |
| `web/api/_email.js` | o HTML do e-mail (tabelas e estilo em linha, para o Outlook) |
| `web/api/_correio.js` | SMTP, cópia em Enviados, modo prévia |
| `web/api/produtos.js`, `_db.js` | cadastro de produtos do DATA WAREHOUSE |
| `web/servidor_local.js` | roda tudo no computador, com as mesmas funções da Vercel |
| `web/middleware.ts`, `sentinela-guarda.ts` | guarda da Sentinela (sem login) |
