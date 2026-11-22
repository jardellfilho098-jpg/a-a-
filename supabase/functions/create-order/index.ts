// Function pública: a credencial privilegiada fica APENAS no servidor.
// rate limiting simples adicional por telefone no banco; recomenda-se CAPTCHA/WAF na produção.
import {createClient} from 'npm:@supabase/supabase-js@2.112.3';
const allowedOrigin=Deno.env.get('ALLOWED_ORIGIN')||'';
function cors(origin:string){const allowed=allowedOrigin.split(',').map(x=>x.trim()).filter(Boolean);const matched=allowed.includes(origin);return {'Access-Control-Allow-Origin':matched?origin:'null','Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version','Access-Control-Allow-Methods':'POST,OPTIONS'};}
Deno.serve(async req=>{const origin=req.headers.get('origin')||'';const headers={...cors(origin),'Content-Type':'application/json'};if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST'||!allowedOrigin.split(',').map(x=>x.trim()).includes(origin))return Response.json({error:'Origem não autorizada'},{status:403,headers});try{const len=Number(req.headers.get('content-length')||0);if(len>25000)return Response.json({error:'Pedido muito grande'},{status:413,headers});const payload=await req.json();const url=Deno.env.get('SUPABASE_URL')!;const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;if(!secret)throw Error('Chave do servidor ausente');const db=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
// Não repassar credenciais externas, apenas um payload cuidadosamente limitado.
const {data,error}=await db.rpc('create_customer_order',{payload});
if(error){console.error('Falha de pedido',error.code);return Response.json({error:error.message||'Não foi possível salvar o pedido'},{status:400,headers})}
const number=String(data.whatsapp).replace(/\D/g,'');const whatsapp_url=`https://wa.me/${number}?text=${encodeURIComponent(data.message)}`;
return Response.json({order_number:data.order_number,whatsapp_url},{headers});
}catch(e){console.error('Erro ao criar pedido',e instanceof Error?e.message:'unknown');return Response.json({error:'Falha ao processar pedido'},{status:500,headers})}});
