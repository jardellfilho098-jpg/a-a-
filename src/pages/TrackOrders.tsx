import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Clock3, RefreshCw, Truck, Store, ClipboardList, ShieldCheck, XCircle } from "lucide-react";
import { Header, Footer } from "../components/UI";
import { supabase } from "../lib/supabase";

export type SavedOrder = { tracking_id: string; order_number: number; saved_at: string };
type TrackedOrder = { order_number: number; status: string; fulfillment: "delivery" | "pickup"; created_at: string };
const STORAGE_KEY = "bora-tracked-orders";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function savedOrders(): SavedOrder[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((v): v is SavedOrder =>
      Boolean(v && typeof v.tracking_id === "string" && uuidPattern.test(v.tracking_id) &&
        typeof v.order_number === "number" && typeof v.saved_at === "string")
    ).slice(0, 25);
  } catch { return []; }
}

export function rememberOrder(data: { tracking_id: string; order_number: number }) {
  if (!uuidPattern.test(data.tracking_id) || !Number.isFinite(data.order_number)) return;
  try {
    const saved = savedOrders().filter(o => o.tracking_id !== data.tracking_id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { tracking_id: data.tracking_id, order_number: data.order_number, saved_at: new Date().toISOString() },
      ...saved
    ].slice(0, 25)));
  } catch { /* Armazenamento opcional: o link individual continua funcionando. */ }
}

const labels: Record<string,string> = {
  aguardando_confirmacao: "Aguardando confirmação",
  confirmado: "Pedido confirmado",
  em_preparo: "Em preparo",
  saiu_para_entrega: "Saiu para entrega",
  pronto_retirada: "Pronto para retirada",
  concluido: "Concluído",
  cancelado: "Cancelado"
};

function stages(fulfillment: TrackedOrder["fulfillment"]) {
  return [
    { key: "aguardando_confirmacao", label: "Pedido recebido", desc: "Estamos aguardando a confirmação da loja." },
    { key: "confirmado", label: "Confirmado", desc: "A loja confirmou seu pedido." },
    { key: "em_preparo", label: "Em preparo", desc: "Seu açaí está sendo preparado." },
    fulfillment === "delivery"
      ? { key: "saiu_para_entrega", label: "Saiu para entrega", desc: "Seu pedido está a caminho." }
      : { key: "pronto_retirada", label: "Pronto para retirada", desc: "Seu pedido está pronto para buscar." },
    { key: "concluido", label: "Concluído", desc: "Pedido finalizado pela loja." }
  ];
}

function formatNumber(n: number) { return "#" + String(n).padStart(4, "0"); }

export function TrackOrders() {
  const { id } = useParams();
  const list = useMemo(savedOrders, []);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [busy, setBusy] = useState(Boolean(id));
  const [error, setError] = useState("");
  const refresh = useCallback(async (manual = false) => {
    if (!id) return;
    if (!uuidPattern.test(id)) { setError("Link de acompanhamento inválido."); setBusy(false); return; }
    if (!supabase) { setError("Acompanhamento indisponível."); setBusy(false); return; }
    if (manual) setBusy(true);
    try {
      const { data, error: requestError } = await supabase.functions.invoke("track-order", { body: { tracking_id: id } });
      if (requestError) {
        let detail = "Não foi possível consultar o pedido. Tente novamente.";
        try {
          const response = requestError.context as Response | undefined;
          if (response && typeof response.json === "function") {
            const body = await response.json();
            if (typeof body?.error === "string") detail = body.error;
          }
        } catch { /* Mantém mensagem genérica */ }
        throw Error(detail);
      }
      if (!data || !labels[data.status]) throw Error("Não foi possível consultar o status do pedido.");
      setOrder(data as TrackedOrder);
      setError("");
    } catch(e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar o pedido");
    } finally { setBusy(false); }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void refresh(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [id,refresh]);

  const timeline = order ? stages(order.fulfillment) : [];
  const index = order ? timeline.findIndex(stage => stage.key === order.status) : -1;
  const completed = order?.status === "concluido";
  const canceled = order?.status === "cancelado";
  return <>
    <Header back={Boolean(id)} title={id ? "Acompanhar pedido" : "Meus pedidos"} />
    <main className="container page track-page">
      <div className="track-head">
        <span className="overline">BORA AÇAÍ • ACOMPANHAMENTO</span>
        <h1>{id ? "Acompanhe seu pedido" : "Meus pedidos"}</h1>
        <p>{id ? "O andamento aparece aqui conforme a loja atualiza o pedido." : "Consulte os pedidos realizados neste dispositivo."}</p>
      </div>
      {!id ? (
        <section className="track-list">
          {list.length ? list.map(item => (
            <Link to={"/acompanhar/" + item.tracking_id} className="track-list-item" key={item.tracking_id}>
              <span className="track-list-icon"><ClipboardList size={23}/></span>
              <span className="track-list-info"><strong>Pedido {formatNumber(item.order_number)}</strong><small>{new Date(item.saved_at).toLocaleDateString("pt-BR")}</small></span>
              <ArrowRight size={20}/>
            </Link>
          )) : (
            <div className="track-empty">
              <Clock3 size={48} strokeWidth={1.5}/>
              <h2>Nenhum pedido por aqui ainda</h2>
              <p>Quando você finalizar um pedido, ele aparecerá nesta página. Você também poderá acompanhá-lo por um link exclusivo.</p>
              <Link to="/" className="btn">Ver cardápio <ArrowRight size={18}/></Link>
            </div>
          )}
          {list.length > 0 && <p className="track-privacy"><ShieldCheck size={16}/> Pedidos feitos em outros dispositivos aparecem aqui somente se você abrir o link de acompanhamento deles.</p>}
        </section>
      ) : (
        <div className="track-layout">
          <section className="track-main-card">
            {busy && !order && <div className="track-loading"><RefreshCw size={28}/> Consultando seu pedido...</div>}
            {error && <div className="alert error" role="alert">{error}</div>}
            {order && <>
              <div className="track-order-header">
                <div><span className="overline">PEDIDO {formatNumber(order.order_number)}</span><h2>{labels[order.status]}</h2></div>
                <button type="button" className="btn-outline" onClick={()=>void refresh(true)} disabled={busy}>
                  <RefreshCw size={16}/> Atualizar
                </button>
              </div>
              {canceled && <div className="track-canceled"><XCircle size={23}/><div><strong>Pedido cancelado</strong><p>Entre em contato com a loja pelo WhatsApp caso tenha dúvidas.</p></div></div>}
              {!canceled && <ol className="track-timeline">
                {timeline.map((step, i) => {
                  const done = completed || i <= index;
                  const current = !completed && i === index;
                  return <li className={"track-step " + (done?"done ":"") + (current?"current":"")} key={step.key}>
                    <div className="track-step-mark">{done?<CheckCircle2 size={24}/>:<Circle size={23}/>}</div>
                    <div className="track-step-copy"><strong>{step.label}</strong><p>{step.desc}</p></div>
                  </li>;
                })}
              </ol>}
            </>}
            {!busy && !order && <Link to="/acompanhar" className="text-link"><ArrowLeft size={16}/> Voltar aos meus pedidos</Link>}
          </section>
          <aside className="track-side">
            <div className="track-side-icon">{order?.fulfillment === "pickup"?<Store size={26}/>:<Truck size={26}/>}</div>
            <h3>{order?.fulfillment === "pickup"?"Retirada na loja":"Entrega do pedido"}</h3>
            <p>Os status são atualizados pelo estabelecimento. Acompanhe por aqui sem precisar entrar no painel administrativo.</p>
            <p className="track-privacy"><ShieldCheck size={16}/> Somente quem possui este link consegue consultar este pedido. Não compartilhe publicamente.</p>
            <Link to="/acompanhar" className="text-link">Ver meus pedidos <ArrowRight size={16}/></Link>
          </aside>
        </div>
      )}
    </main>
    <Footer/>
  </>;
}
