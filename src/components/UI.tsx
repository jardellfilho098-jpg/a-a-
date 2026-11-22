import { ArrowLeft, ShoppingBag, Leaf } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../context/Store";
export function Header({ back, title }: { back?: boolean; title?: string }) {
  const nav = useNavigate();
  const { settings, cart, demo } = useStore();
  return (
    <header className="topbar">
      <div className="container header-inner">
        {back ? (
          <button
            className="iconbtn"
            aria-label="Voltar"
            onClick={() => nav(-1)}
          >
            <ArrowLeft />
          </button>
        ) : (
          <Link to="/" className="brand">
            <span className="brand-icon">
              <Leaf size={25} />
            </span>
            <span>
              <b>
                {settings.name}
                <span className="brand-dot">.</span>
              </b>
              <small>Açaí do seu jeito</small>
            </span>
          </Link>
        )}
        {title && <strong className="header-title">{title}</strong>}
        <Link className="cart-link" to="/carrinho" aria-label="Ver carrinho">
          <ShoppingBag size={22} />
          {cart.length > 0 && (
            <span className="cart-count">
              {cart.reduce((s, x) => s + x.qty, 0)}
            </span>
          )}
        </Link>
      </div>
      {demo && (
        <div className="demo-ribbon">
          Prévia visual • configure o Supabase para habilitar pedidos reais
        </div>
      )}
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span>💜 Bora Açaí — feito com carinho.</span>
        <Link to="/admin/login">Área administrativa</Link>
      </div>
    </footer>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-emoji">🥤</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
