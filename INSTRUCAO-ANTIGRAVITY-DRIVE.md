# Mensagem para colar no Antigravity

---

Preciso que você configure as credenciais do Google Drive nas variáveis de ambiente do projeto na Vercel (produção). Confirmei via um teste direto no servidor de produção que elas **não estão configuradas** — o sistema está caindo num modo de fallback local que finge que funcionou, mas não grava nada de verdade no Drive.

Faltam estas duas variáveis de ambiente na Vercel:

```
LOVABLE_API_KEY=<chave da API do Lovable, usada para autenticar no gateway do conector do Google Drive>
GOOGLE_DRIVE_API_KEY=<chave/token de conexão do conector Google Drive do Lovable Cloud>
```

Onde encontrar: no painel do Lovable Cloud (lovable.dev), na seção de integrações/conectores do projeto, deve existir a conexão "Google Drive" já configurada (é essa que os recursos de fotos/PDF do sistema tentam usar) — preciso das credenciais dessa conexão, ou que você mesmo adicione essas duas variáveis diretamente nas Environment Variables do projeto na Vercel (Settings → Environment Variables → Production).

Depois de adicionar, é necessário fazer um novo deploy (ou redeploy do último commit) para as variáveis novas entrarem em vigor.

Como confirmar que funcionou: acesse `https://labsuporte-gestao.vercel.app/admin-migrar-labstate` e clique em "Testar Drive (ler/escrever)". Se aparecer `hasDriveCredentials(): true` e o restante dos passos sem erro, está funcionando. Essa página é temporária, criada só para diagnóstico — pode ser removida depois.

---
