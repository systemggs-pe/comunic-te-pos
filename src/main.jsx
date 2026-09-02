import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // <-- ESTA LÍNEA ES VITAL PARA EL DISEÑO

const savedTheme = window.localStorage.getItem('comunicate_theme')
const initialTheme = savedTheme === 'dark' || savedTheme === 'light'
  ? savedTheme
  : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />,
)
