import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Package,
  ClipboardList,
  Settings as SettingsIcon,
  LogOut,
  Plus,
  Trash2,
  Upload,
  RefreshCw,
  Lock,
  ArrowLeft,
  Grape,
} from "lucide-react";
import { supabase, configured } from "../lib/supabase";
import {
  money,
  type Order,
  type Product,
  type Extra,
  type Settings,
} from "../lib/types";
import { useStore } from "../context/Store";
type Tab = "overview" | "orders" | "products" | "extras" | "settings";
const statusLabels: Record<string, string> = {
  aguardando_confirmacao: "Aguardando confirmação",
  confirmado: "Confirmado",
  em_preparo: "Em preparo",
  saiu_para_entrega: "Saiu para entrega",
  pronto_retirada: "Pronto para retirada",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const statusOptions = Object.keys(statusLabels);
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase || !configured) {
      setError("Supabase não configurado. Confira o arquivo .env e reinicie o Vite.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { data: authData, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

      if (loginError) {
        if (loginError.message.toLowerCase().includes("invalid login credentials")) {
          throw new Error("E-mail ou senha incorretos. Confira os dados no Supabase Auth.");
        }
        if (loginError.message.toLowerCase().includes("email not confirmed")) {
          throw new Error("Confirme seu e-mail para acessar o painel.");
        }
        throw loginError;
      }

      if (!authData.user) {
        throw new Error("Não foi possível identificar a conta autenticada.");
      }

      const { data: admin, error: permissionError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (permissionError) {
        await supabase.auth.signOut();
        throw new Error(`Erro ao verificar o administrador: ${permissionError.message}`);
      }
      if (!admin) {
        await supabase.auth.signOut();
        throw new Error("Esta conta não tem permissão de administrador.");
      }

      setPassword("");
      nav("/admin", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro desconhecido ao entrar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin-login-bg">
      <Link to="/" className="text-link">
        <ArrowLeft size={17} /> Voltar à loja
      </Link>
      <form className="admin-login-card" onSubmit={submit}>
        <div className="lock-circle">
          <Lock size={28} />
        </div>
        <h1>Área administrativa</h1>
        <p>Gerencie os pedidos e seu cardápio</p>
        <label>
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error && <p className="alert error">{error}</p>}
        <button
          disabled={!configured || busy}
          type="submit"
          className="btn full"
        >
          {busy ? "Entrando..." : "Entrar"}
        </button>
        {!configured && (
          <p className="summary-hint">
            Configure o Supabase para habilitar o painel.
          </p>
        )}
      </form>
    </div>
  );
}
export function Admin() {
  const { reload } = useStore();
  const nav = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("todos");
  const [dateFilter, setDateFilter] = useState("");
  const load = useCallback(async () => {
    if (!supabase) return;
    const [
      { data: o, error: oe },
      { data: p, error: pe },
      { data: e, error: ee },
      { data: s, error: se },
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("*,items:order_items(*)")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("products").select("*,sizes(*)").order("name"),
      supabase.from("extras").select("*").order("name"),
      supabase.from("store_settings").select("*").eq("id", 1).single(),
    ]);
    const err = oe || pe || ee || se;
    if (err) setError(err.message);
    else setError("");
    setOrders((o || []) as Order[]);
    setProducts((p || []) as Product[]);
    setExtras((e || []) as Extra[]);
    if (s) setSettings(s as Settings);
  }, []);
  useEffect(() => {
    if (!supabase) {
      setError("Supabase não configurado. Verifique o arquivo .env.");
      setAuthorized(false);
      return;
    }
    const client = supabase;
    let alive = true;

    const check = async () => {
      try {
        const { data: { user }, error: userError } = await client.auth.getUser();
        if (!alive) return;
        if (userError || !user) {
          nav("/admin/login", { replace: true });
          return;
        }

        const { data: admin, error: permissionError } = await client
          .from("admin_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!alive) return;
        if (permissionError) {
          setError(`Não foi possível verificar o acesso: ${permissionError.message}`);
          setAuthorized(false);
          return;
        }
        const isAdmin = Boolean(admin);
        setAuthorized(isAdmin);
        if (isAdmin) void load();
      } catch (cause) {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : "Erro ao verificar acesso.");
        setAuthorized(false);
      }
    };

    void check();
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") nav("/admin/login", { replace: true });
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [nav, load]);
  useEffect(() => {
    if (!supabase || !authorized) return;
    const ch = supabase
      .channel("admin-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase!.removeChannel(ch);
    };
  }, [authorized, load]);
  const run = async (
    work: () => Promise<{ error: unknown } | void>,
    message = "Alterações salvas!",
  ) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const r = await work();
      if (r && "error" in r && r.error) throw r.error;
      setSuccess(message);
      await load();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const changeStatus = (id: string, status: string) =>
    void run(async () => {
      const { error } = await supabase!
        .from("orders")
        .update({ status })
        .eq("id", id);
      return { error };
    }, "Status atualizado");
  const filtered = orders.filter(
    (o) =>
      (filter === "todos" || o.status === filter) &&
      (!dateFilter || o.created_at.slice(0, 10) === dateFilter),
  );
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Recife",
  });
  const dayOrders = orders.filter(
    (o) =>
      new Date(o.created_at).toLocaleDateString("en-CA", {
        timeZone: "America/Recife",
      }) === today,
  );
  const revenue = dayOrders
    .filter((o) => o.status === "concluido")
    .reduce((s, o) => s + o.total_cents, 0);
  const popular = Object.entries(
    orders
      .filter((o) => o.status === "concluido")
      .flatMap((o) => o.items || [])
      .reduce<Record<string, number>>((acc, item) => {
        acc[item.name] = (acc[item.name] || 0) + item.qty;
        return acc;
      }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const logout = async () => {
    await supabase?.auth.signOut();
    nav("/");
  };
  if (authorized === null)
    return <div className="center-screen">Verificando acesso...</div>;
  if (!authorized)
    return (
      <div className="center-screen">
        <h2>Acesso não autorizado</h2>
        <p>{error || "Seu usuário não está cadastrado como administrador."}</p>
        <button onClick={logout} className="btn">
          Sair
        </button>
      </div>
    );
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link to="/" className="brand admin-brand">
          <span className="admin-fruit-icon"><Grape className="black-symbol" size={23} aria-hidden="true"/></span>
          <b>
            Bora Açaí<span className="brand-dot">.</span>
          </b>
        </Link>
        <small>PAINEL DE CONTROLE</small>
        <nav>
          {(
            [
              ["overview", "Visão geral", BarChart3],
              ["orders", "Pedidos", ClipboardList],
              ["products", "Produtos", Package],
              ["extras", "Adicionais", Plus],
              ["settings", "Configurações", SettingsIcon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setError("");
                setSuccess("");
              }}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <button className="logout" onClick={logout}>
          <LogOut size={18} /> Sair
        </button>
      </aside>
      <main className="admin-main">
        <div className="admin-top">
          <div>
            <span className="overline">BORA AÇAÍ • ADMIN</span>
            <h1>
              {
                {
                  overview: "Visão geral",
                  orders: "Gerenciar pedidos",
                  products: "Produtos",
                  extras: "Adicionais",
                  settings: "Configurações",
                }[tab]
              }
            </h1>
          </div>
          <button className="btn-outline" onClick={() => void load()}>
            <RefreshCw size={17} /> Atualizar
          </button>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="alert success" role="status">
            {success}
          </div>
        )}
        {tab === "overview" && (
          <>
            <div className="stat-grid">
              {[
                ["Pedidos hoje", dayOrders.length],
                [
                  "Aguardando",
                  dayOrders.filter((x) => x.status === "aguardando_confirmacao")
                    .length,
                ],
                [
                  "Em preparo",
                  dayOrders.filter((x) => x.status === "em_preparo").length,
                ],
                [
                  "Concluídos",
                  dayOrders.filter((x) => x.status === "concluido").length,
                ],
                [
                  "Cancelados",
                  dayOrders.filter((x) => x.status === "cancelado").length,
                ],
                ["Faturamento concluído", money(revenue)],
              ].map(([name, value]) => (
                <div className="stat" key={name}>
                  <small>{name}</small>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <div className="panel">
              <h3>Produtos mais vendidos</h3>
              {popular.length ? (
                <div className="popular">
                  {popular.map(([name, qty]) => (
                    <div key={name} className="summary-line">
                      <span>{name}</span>
                      <strong>{qty} unidades</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Aguardando vendas concluídas.</p>
              )}
            </div>
            <div className="panel" style={{ marginTop: 20 }}>
              <h3>Pedidos recentes</h3>
              <OrderTable
                orders={orders.slice(0, 8)}
                changeStatus={changeStatus}
                busy={busy}
              />
            </div>
          </>
        )}
        {tab === "orders" && (
          <div className="panel">
            <div className="toolbar">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="todos">Todos os status</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {statusLabels[s]}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
              <span>{filtered.length} pedidos</span>
            </div>
            <OrderTable
              orders={filtered}
              changeStatus={changeStatus}
              busy={busy}
            />
          </div>
        )}
        {tab === "products" && (
          <ProductsPanel products={products} busy={busy} run={run} />
        )}
        {tab === "extras" && (
          <ExtrasPanel extras={extras} busy={busy} run={run} />
        )}
        {tab === "settings" && settings && (
          <SettingsPanel settings={settings} busy={busy} run={run} />
        )}
      </main>
    </div>
  );
}
function OrderTable({
  orders,
  changeStatus,
  busy,
}: {
  orders: Order[];
  changeStatus: (id: string, status: string) => void;
  busy: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Itens / Entrega</th>
            <th>Total</th>
            <th>Data</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>#{String(o.order_number).padStart(4, "0")}</strong>
              </td>
              <td>
                <b>{o.customer_name}</b>
                <small>{o.phone}</small>
              </td>
              <td>
                {o.items
                  ?.map((x) => `${x.qty}× ${x.name} (${x.size_name})`)
                  .join(", ") || "—"}
                <small>
                  {o.fulfillment === "delivery"
                    ? `${o.address || ""} · ${o.neighborhood || ""}`
                    : "Retirada"}{" "}
                  · {o.payment_method}
                </small>
              </td>
              <td>{money(o.total_cents)}</td>
              <td>{new Date(o.created_at).toLocaleString("pt-BR")}</td>
              <td>
                <select
                  disabled={busy}
                  value={o.status}
                  onChange={(e) => changeStatus(o.id, e.target.value)}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && (
        <p className="muted">Nenhum pedido encontrado.</p>
      )}
    </div>
  );
}
type Runner = (
  work: () => Promise<{ error: unknown } | void>,
  message?: string,
) => Promise<void>;
function ProductsPanel({
  products,
  busy,
  run,
}: {
  products: Product[];
  busy: boolean;
  run: Runner;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Açaí");
  const [maxExtras, setMaxExtras] = useState("3");
  const [sizes, setSizes] = useState<
    Array<{ id?: string; name: string; price: string; available: boolean }>
  >([
    { name: "300 ml", price: "12.00", available: true },
    { name: "500 ml", price: "18.00", available: true },
  ]);
  const reset = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setCategory("Açaí");
    setMaxExtras("3");
    setSizes([
      { name: "300 ml", price: "12.00", available: true },
      { name: "500 ml", price: "18.00", available: true },
    ]);
  };
  const edit = (p: Product) => {
    setEditing(p.id);
    setName(p.name);
    setDescription(p.description);
    setCategory(p.category);
    setMaxExtras(String(p.max_extras));
    setSizes(
      p.sizes.map((s) => ({
        id: s.id,
        name: s.name,
        price: (s.price_cents / 100).toFixed(2),
        available: s.available,
      })),
    );
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        category: category.trim(),
        max_extras: Number(maxExtras),
        available: true,
      };
      let id = editing;
      if (editing) {
        const r = await supabase!
          .from("products")
          .update(payload)
          .eq("id", editing);
        if (r.error) return { error: r.error };
      } else {
        const r = await supabase!
          .from("products")
          .insert(payload)
          .select("id")
          .single();
        if (r.error) return { error: r.error };
        id = r.data!.id;
      }
      const valid = sizes.filter(
        (s) =>
          s.name.trim() &&
          Number.isFinite(Number(s.price)) &&
          Number(s.price) >= 0,
      );
      if (!valid.length) throw Error("Informe pelo menos um tamanho válido");
      const { error: se } = await supabase!
        .from("sizes")
        .upsert(
          valid.map((s) => ({
            ...s,
            id: s.id || crypto.randomUUID(),
            product_id: id,
            name: s.name.trim(),
            price_cents: Math.round(Number(s.price) * 100),
          })),
        );
      return { error: se };
    }, "Produto salvo");
    reset();
  };
  const toggle = (p: Product) =>
    void run(async () => {
      const { error } = await supabase!
        .from("products")
        .update({ available: !p.available })
        .eq("id", p.id);
      return { error };
    });
  const upload = async (p: Product, file: File) => {
    if (!file.type.startsWith("image/") || file.size > 5e6)
      throw Error("Selecione imagem até 5 MB");
    await run(async () => {
      const path = `products/${p.id}/${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() || "png"}`;
      const { error: up } = await supabase!.storage
        .from("product-images")
        .upload(path, file, { upsert: false });
      if (up) return { error: up };
      const { data } = supabase!.storage
        .from("product-images")
        .getPublicUrl(path);
      const { error } = await supabase!
        .from("products")
        .update({ image_url: data.publicUrl })
        .eq("id", p.id);
      return { error };
    }, "Imagem atualizada");
  };
  return (
    <>
      <div className="panel">
        <h3>Catálogo de produtos</h3>
        <div className="admin-product-grid">
          {products.map((p) => (
            <article className="admin-product" key={p.id}>
              <img src={p.image_url || "/images/acai-300.png"} alt="" />
              <div>
                <b>{p.name}</b>
                <small>{p.description}</small>
                <small>
                  {p.sizes
                    .map((s) => `${s.name}: ${money(s.price_cents)}`)
                    .join(" · ")}
                </small>
                <div className="actions">
                  <button onClick={() => edit(p)} className="btn-outline">
                    Editar
                  </button>
                  <button
                    onClick={() => toggle(p)}
                    className="btn-outline"
                    disabled={busy}
                  >
                    {p.available ? "Desativar" : "Ativar"}
                  </button>
                  <label className="btn-outline upload">
                    <Upload size={15} /> Imagem
                    <input
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f)
                          try {
                            await upload(p, f);
                          } catch (err) {
                            alert(String(err));
                          }
                      }}
                    />
                  </label>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <form onSubmit={save} className="panel admin-form">
        <h3>{editing ? "Editar produto" : "Novo produto"}</h3>
        <div className="form-grid">
          <label>
            Nome
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Categoria
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label className="span-all">
            Descrição
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Máximo de adicionais
            <input
              type="number"
              min={0}
              max={20}
              value={maxExtras}
              onChange={(e) => setMaxExtras(e.target.value)}
            />
          </label>
        </div>
        <h4>Tamanhos</h4>
        {sizes.map((s, i) => (
          <div className="size-edit" key={s.id || i}>
            <input
              aria-label="Tamanho"
              required
              value={s.name}
              onChange={(e) =>
                setSizes((a) =>
                  a.map((x, j) =>
                    i === j ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
            <input
              aria-label="Preço"
              required
              type="number"
              min="0"
              step="0.01"
              value={s.price}
              onChange={(e) =>
                setSizes((a) =>
                  a.map((x, j) =>
                    i === j ? { ...x, price: e.target.value } : x,
                  ),
                )
              }
            />
            <label>
              <input
                type="checkbox"
                checked={s.available}
                onChange={(e) =>
                  setSizes((a) =>
                    a.map((x, j) =>
                      i === j ? { ...x, available: e.target.checked } : x,
                    ),
                  )
                }
              />{" "}
              Ativo
            </label>
            {!s.id && (
              <button
                type="button"
                onClick={() => setSizes((a) => a.filter((_, j) => i !== j))}
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="text-link"
          onClick={() =>
            setSizes((a) => [
              ...a,
              { name: "", price: "0.00", available: true },
            ])
          }
        >
          <Plus size={17} /> Adicionar tamanho
        </button>
        <div className="actions">
          <button className="btn" disabled={busy}>
            {editing ? "Salvar alterações" : "Cadastrar produto"}
          </button>
          {editing && (
            <button type="button" className="btn-outline" onClick={reset}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </>
  );
}
function ExtrasPanel({
  extras,
  busy,
  run,
}: {
  extras: Extra[];
  busy: boolean;
  run: Runner;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const create = async (e: FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const { error } = await supabase!
        .from("extras")
        .insert({
          name: name.trim(),
          price_cents: Math.round(Number(price) * 100),
        });
      return { error };
    });
    setName("");
    setPrice("0");
  };
  return (
    <div className="panel">
      <h3>Adicionais disponíveis</h3>
      {extras.map((x) => (
        <div className="extra-admin" key={x.id}>
          <div>
            <strong>{x.name}</strong>
            <small>{money(x.price_cents)}</small>
          </div>
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { error } = await supabase!
                  .from("extras")
                  .update({ available: !x.available })
                  .eq("id", x.id);
                return { error };
              })
            }
          >
            {x.available ? "Desativar" : "Ativar"}
          </button>
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() => {
              const name = prompt("Nome do adicional", x.name);
              const price = prompt(
                "Preço em reais",
                (x.price_cents / 100).toFixed(2),
              );
              if (!name || price === null) return;
              void run(async () => {
                const { error } = await supabase!
                  .from("extras")
                  .update({
                    name: name.trim(),
                    price_cents: Math.round(
                      Number(price.replace(",", ".")) * 100,
                    ),
                  })
                  .eq("id", x.id);
                return { error };
              });
            }}
          >
            Editar
          </button>
        </div>
      ))}
      <form onSubmit={create} className="inline-form">
        <input
          required
          placeholder="Nome do adicional"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required
          type="number"
          step="0.01"
          min="0"
          aria-label="Preço"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button disabled={busy} className="btn">
          <Plus size={18} /> Cadastrar
        </button>
      </form>
    </div>
  );
}
function SettingsPanel({
  settings,
  busy,
  run,
}: {
  settings: Settings;
  busy: boolean;
  run: Runner;
}) {
  const [s, setS] = useState(settings);
  useEffect(() => setS(settings), [settings]);
  const set = (key: keyof Settings, value: unknown) =>
    setS((old) => ({ ...old, [key]: value }));
  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase!
        .from("store_settings")
        .update({ ...s, whatsapp: s.whatsapp.replace(/\D/g, "") })
        .eq("id", 1);
      return { error };
    });
  };
  return (
    <form className="panel admin-form" onSubmit={save}>
      <h3>Dados da loja</h3>
      <div className="form-grid">
        <label>
          Nome
          <input
            value={s.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </label>
        <label>
          WhatsApp (DDI + DDD + número)
          <input
            value={s.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            required
            placeholder="5581999999999"
          />
        </label>
        <label className="span-all">
          Endereço da loja
          <input
            value={s.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </label>
        <label>
          Taxa de entrega (R$)
          <input
            type="number"
            min={0}
            step="0.01"
            value={(s.delivery_fee_cents / 100).toFixed(2)}
            onChange={(e) =>
              set(
                "delivery_fee_cents",
                Math.round(Number(e.target.value) * 100),
              )
            }
          />
        </label>
        <label>
          Bairros atendidos <span className="field-optional">(Opcional)</span> <span className="field-hint">— separados por vírgula</span>
          <input
            value={s.neighborhoods.join(", ")}
            onChange={(e) =>
              set(
                "neighborhoods",
                e.target.value
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <label className="span-all">
          Aviso quando fechado
          <input
            value={s.closed_message}
            onChange={(e) => set("closed_message", e.target.value)}
          />
        </label>
      </div>
      <div className="settings-checks">
        <label>
          <input
            type="checkbox"
            checked={s.open_for_orders}
            onChange={(e) => set("open_for_orders", e.target.checked)}
          />{" "}
          Loja aberta para pedidos
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.delivery_enabled}
            onChange={(e) => set("delivery_enabled", e.target.checked)}
          />{" "}
          Oferecer entrega
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.pickup_enabled}
            onChange={(e) => set("pickup_enabled", e.target.checked)}
          />{" "}
          Oferecer retirada
        </label>
        {(["pix", "dinheiro", "cartao"] as const).map((p) => (
          <label key={p}>
            <input
              type="checkbox"
              checked={s.payments.includes(p)}
              onChange={(e) =>
                set(
                  "payments",
                  e.target.checked
                    ? [...s.payments, p]
                    : s.payments.filter((x) => x !== p),
                )
              }
            />{" "}
            Aceitar {p}
          </label>
        ))}
      </div>
      <button className="btn" disabled={busy}>
        Salvar configurações
      </button>
    </form>
  );
}
