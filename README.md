# Bora Açaí — React + Supabase + WhatsApp

Loja online de açaí, personalização, carrinho, pedido salvo de forma segura e painel administrativo. Referência: [Figma Bora Açaí](https://www.figma.com/design/ajw90QXqK3xBBxCwa26Gqf/Untitled?node-id=0-1).

## Começar

```bash
npm install
cp .env.example .env
npm run dev
```

Sem configuração Supabase o projeto funciona **somente como prévia visual**, usando produtos demonstrativos locais, sem enviar pedidos nem liberar login administrativo.

## Supabase: usar um projeto SEPARADO do VitaLife

1. Crie um projeto **novo** em https://supabase.com/dashboard.
2. Cole `supabase/schema.sql` no SQL Editor do novo projeto e execute uma única vez (não reaplique o mesmo script inteiro; políticas são criadas sem `if not exists`).
3. Configure em `.env` a URL e a **publishable key** (ou anon key legada). Jamais coloque a service role key no Vite.
4. Em **Authentication > Users**, cadastre um usuário com email/senha. Copie o UUID e execute no SQL Editor:
   ```sql
   insert into public.admin_users(user_id) values ('COLE_UUID_DO_USUARIO_AQUI');
   ```
5. Publique a Edge Function `create-order`, usando o diretório `supabase/functions/create-order`. Consulte `supabase functions --help` e `supabase functions deploy --help` na versão instalada da CLI.
6. Configure a variável secreta `ALLOWED_ORIGIN` no ambiente da função. Exemplo: `https://sua-loja.vercel.app,http://localhost:5173`. A variável `SUPABASE_SERVICE_ROLE_KEY` deve existir **somente na Edge Function** (nunca no frontend). Em implantações recentes com keys diferentes, configure a variável secreta compatível na função.
7. A chamada pública para clientes sem login requer `verify_jwt = false` em `supabase/config.toml`. A segurança depende das validações da função, limites no banco e restrição de CORS; adicione Turnstile, controle de IP em gateway/WAF e limites de requisição antes de divulgar amplamente.
8. Entre em `/admin/login`, edite as configurações da loja, informe WhatsApp em formato `5581999999999` e marque a loja como aberta.
9. Cadastre os produtos, tamanhos, adicionais e imagens pelo painel. Os placeholders em `public/images` são ilustrativos.

**Observação de segurança:** a operação `public.create_customer_order` está na API, mas usa `SECURITY INVOKER` e somente a função de servidor pode executá-la com `service_role`. Garanta que o privilégio `EXECUTE` não seja concedido a `anon` ou `authenticated`. O segredo permanece exclusivamente na Edge Function.

## Deploy na Vercel

- Importe o repositório GitHub na Vercel.
- Framework: **Vite**; build `npm run build`; diretório `dist`.
- Cadastre `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` como variáveis da Vercel.
- Adicione o domínio final da Vercel ao `ALLOWED_ORIGIN` da Edge Function.
- Arquivo `vercel.json` fornece fallback para React Router.

## Regras do pedido

O cliente escolhe um produto, os adicionais e o tamanho. No checkout, a função no servidor consulta os preços oficiais, rejeita tamanhos indisponíveis, calcula taxa, salva pedido e itens numa transação e devolve o link `wa.me`. Somente depois do sucesso o navegador abre o WhatsApp. O pedido começa como `aguardando_confirmacao`. **Não há pagamento Pix automático** nem confirmação automática de envio da mensagem.

Chaves de idempotência evitam duplicação da solicitação repetida. Há também limite de pedidos por telefone no banco; para operação pública real, configure mitigação anti-spam adicional.

## Observações importantes

- Antes de receber pedidos reais: testar o fluxo completo com credenciais próprias, telefone real da loja e dispositivo móvel.
- O banco usa o fuso do servidor para timestamps UTC; o painel mostra os horários no navegador e computa o dia em Recife.
- O faturamento considera pedidos concluídos, não pagamentos confirmados externamente.
- Não foi executado um teste de ponta a ponta em Supabase real nem deploy remoto neste pacote.
- Há processamento de nome, telefone e endereço de clientes: publique política de privacidade, limite retenção de dados e configure permissões de acesso conforme a LGPD.
