# SAC — Lube Distribuidora

> Até 2026-10-09 o sistema se chamava **SAQ**; o nome certo é **SAC** (Júlio). Endereço, repositório,
> protocolo e textos foram trocados juntos.

Tela em que o **RCA abre um chamado para o SAC**: o e-mail dele, nota fiscal, motivo, detalhes, produto e
até 3 fotos comprobatórias. Ao enviar, o sistema gera um **protocolo** e manda o comprovante **em nome do
RCA, para o próprio RCA** — na pegada do e-mail de cobrança do Gestão TI.

**Acesso sem login** (decisão do Júlio, 2026-10-07): o SAC abre pelo atalho na **tela de login do Painel
Lube**, e o RCA não precisa de conta no portal.

> **Fase 1 (2026-10-07):** só a tela e o e-mail. Ainda **não há banco**: o chamado não fica gravado em lugar
> nenhum além do e-mail (e da cópia em Enviados, se o IMAP estiver configurado). O sistema de chamados
> (fila, andamento, resposta do SAC) é a fase seguinte.

## Campos

| Campo | Regra |
|---|---|
| E-mail do RCA | primeiro campo; precisa ser o e-mail de um **RCA ativo no WinThor** (`PCUSUARI.EMAIL`/`EMAIL2`). A tela mostra "RCA 123 · Nome" assim que reconhece; fica lembrado no aparelho |
| Nota fiscal | só números, até 10 dígitos |
| Motivo | um dos 9 assuntos **"SAC - ..."** do WinThor (`PCMANASSUNTO`, códigos 65 a 73) — ver `web/motivos.js` |
| Detalhes | texto livre, mínimo 15 caracteres |
| Cód. produto | só números; **completa o nome do produto** pelo cadastro do WinThor |
| Produto | preenchido pelo código, ou buscado pelo nome (todas as palavras digitadas) |
| Fotos | de 1 a 3, do produto ou da NF; reduzidas no celular para 1600 px antes de subir |

## Como funciona

```
Tela de login do Painel Lube ──► atalho "SAC" ──► web/index.html + app.js (celular do RCA)
                     │  GET  /api/produtos  ◄── core.dim_produto (DATA WAREHOUSE), cache no CDN
                     │  POST /api/rca       ◄── core.dim_rca: o e-mail é de um RCA ativo?
                     │  POST /api/enviar    ──► confere o RCA de novo ──► SMTP da Locaweb ──► o próprio RCA
```

### "Como se ele mesmo estivesse enviando"
O comprovante chega com o **nome do RCA como remetente**, **para** o e-mail dele e com a **resposta
voltando para ele**. O **endereço** do remetente é a caixa do SAC (`sac@lube.com.br`), não o Gmail do RCA:

- 80% dos RCAs usam Gmail ou Hotmail (WinThor, 2026-10-07). Um e-mail que diz vir de `@gmail.com` e sai
  de outro servidor é falsificação de remetente: Gmail e Hotmail marcam como suspeito ou mandam para o
  spam, e o Yahoo (`DMARC p=reject`) recusa. O comprovante não chegaria.
- Sair da caixa do próprio RCA exigiria a senha dele — e senha não se guarda.

### Por que só RCA cadastrado
A tela é pública. Sem conferir o cadastro, `/api/enviar` mandaria e-mail com a marca da Lube para
**qualquer endereço digitado**, com texto e foto de quem quisesse — disparador de spam e golpe. Com a
conferência, o comprovante só vai para o e-mail de um RCA ativo. Banco fora do ar → nada é enviado
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
| `web/motivos.js` | os 9 motivos SAC do WinThor (usado pela tela e pela API) |
| `web/api/enviar.js` | valida, confere o RCA, gera o protocolo, monta e envia o e-mail |
| `web/api/rca.js`, `_rca.js` | conferência do e-mail do RCA no `core.dim_rca` |
| `web/api/_email.js` | o HTML do e-mail (tabelas e estilo em linha, para o Outlook) |
| `web/api/_correio.js` | SMTP, cópia em Enviados, modo prévia |
| `web/api/produtos.js`, `_db.js` | cadastro de produtos do DATA WAREHOUSE |
| `web/servidor_local.js` | roda tudo no computador, com as mesmas funções da Vercel |
| `web/middleware.ts`, `sentinela-guarda.ts` | guarda da Sentinela (sem login) |
