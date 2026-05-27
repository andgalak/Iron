import React from 'react'
import ReactDOM from 'react-dom/client'
// Current app: os-v1 (unified OS — Home/Iron/Focus/Progress + Rooney).
// To flip back to iron-v3 (the previous standalone tracker), change the line below
// to:  import App from './AppV3.jsx'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
