# Mensagem para colar no Antigravity

---

Já resolvi a parte de código (o app agora usa a conta de serviço do Google corretamente, autenticando e lendo do Drive com sucesso — confirmado por teste real em produção). Mas encontrei um bloqueio de configuração do Google que só é resolvido pelo lado do Google Workspace, não por código.

**Erro exato recebido ao tentar criar um arquivo no Drive:**
```
403: Service Accounts do not have storage quota. Leverage shared drives
(https://developers.google.com/workspace/drive/api/guides/about-shareddrives),
or use OAuth delegation (http://support.google.com/a/answer/7281227) instead.
```

**O que isso significa:** a pasta raiz usada pelo sistema (`Aplicativo-Relatórios`, ID `1buEmIk9ksuC3n9ndQRxqQkyN5SYgugAb`) é uma pasta comum do Google Drive, só compartilhada com a conta de serviço. Contas de serviço do Google **nunca conseguem criar arquivos novos** numa pasta pessoal — elas não têm cota de armazenamento própria, mesmo com permissão de Editor. Isso não é um bug do app, é uma regra do Google. A leitura funciona (por isso os módulos que só leem, como Programação, funcionam hoje); a escrita nunca funcionou por essa mesma causa, mesmo antes das minhas mudanças de hoje.

**Preciso que você resolva UMA das duas opções abaixo** (ambas exigem acesso administrativo à conta Google que hospeda esses arquivos — não é algo que dá pra fazer só pelo código):

### Opção 1 — Transformar a pasta em Drive Compartilhado (recomendado, mais simples)
Isso exige uma conta **Google Workspace paga** (não funciona em conta Gmail pessoal gratuita — Drives Compartilhados são um recurso do Workspace).
1. Crie um Drive Compartilhado novo (ou verifique se já existe um disponível).
2. Mova o conteúdo da pasta `Aplicativo-Relatórios` (ID `1buEmIk9ksuC3n9ndQRxqQkyN5SYgugAb`) pra dentro desse Drive Compartilhado — ou crie a estrutura equivalente diretamente lá.
3. Adicione a conta de serviço (o `client_email` que está na variável de ambiente `GOOGLE_SERVICE_ACCOUNT_JSON`) como **Gerenciador de Conteúdo** ou **Colaborador** desse Drive Compartilhado.
4. Me passe o novo ID da pasta raiz dentro do Drive Compartilhado, pra eu atualizar `DRIVE_ROOT_FOLDER_ID` no código (hoje está fixo como `1buEmIk9ksuC3n9ndQRxqQkyN5SYgugAb` em `src/lib/driveStorage.ts` e `src/lib/driveSync.functions.ts`).

### Opção 2 — Delegação de domínio (Domain-Wide Delegation)
Exige acesso ao **Admin Console do Google Workspace** (admin.google.com).
1. No Admin Console, em Segurança → Controles de API → Delegação em todo o domínio, autorize o Client ID da conta de serviço com o escopo `https://www.googleapis.com/auth/drive`.
2. Isso faz a conta de serviço agir "como" um usuário real do Workspace (precisa escolher qual usuário — normalmente o dono da pasta), usando a cota de armazenamento dele.
3. Depois disso, me avise — vou precisar ajustar o código pra passar o parâmetro `subject` (o e-mail do usuário a impersonar) na autenticação.

**Como eu vou confirmar que funcionou:** tenho uma página de teste temporária em `https://labsuporte-gestao.vercel.app/admin-migrar-labstate` com um botão "Testar Drive (ler/escrever)" que mostra exatamente esse erro hoje — depois do ajuste, deve mostrar sucesso na criação do arquivo de teste.

---
