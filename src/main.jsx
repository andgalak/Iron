import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Catch runtime errors so we see the message instead of a fully black screen.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("App crash:", error, info); }
  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error || "Unknown error");
      const stack = String(this.state.error?.stack || "").split("\n").slice(0, 8).join("\n");
      return React.createElement("div", { style: { background:"#080808", color:"#e8e8e8", fontFamily:"'DM Mono','Courier New',monospace", minHeight:"100vh", padding:"24px 20px", fontSize:12, lineHeight:1.6, maxWidth:820, margin:"0 auto" } },
        React.createElement("div", { style: { color:"#dc2626", fontSize:14, fontWeight:700, letterSpacing:"0.06em", marginBottom:12 } }, "SOMETHING BROKE"),
        React.createElement("div", { style: { color:"#e8e8e8", marginBottom:16, whiteSpace:"pre-wrap" } }, msg),
        React.createElement("pre", { style: { color:"#888", fontSize:10, whiteSpace:"pre-wrap", marginBottom:20, padding:12, background:"#111", border:"1px solid #222", borderRadius:8 } }, stack),
        React.createElement("button", { style: { background:"#FF6B35", color:"#000", border:"none", borderRadius:8, padding:"10px 18px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", marginRight:8 }, onClick: async () => { try { if (window.caches) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())); } } catch {} window.location.reload(); } }, "Hard refresh"),
        React.createElement("button", { style: { background:"transparent", color:"#e8e8e8", border:"1px solid #333", borderRadius:8, padding:"10px 18px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }, onClick: () => this.setState({ error: null }) }, "Try again"),
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
