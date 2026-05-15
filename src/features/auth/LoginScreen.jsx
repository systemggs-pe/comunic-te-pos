import React, { useState } from 'react';
import { Menu, X, Home, ShoppingCart, ClipboardList, Plus, Search, Edit, Trash2, Printer, Copy, Eye, CheckCircle2, AlertCircle, Users, ScanBarcode, UploadCloud, ChevronDown, ChevronUp, LogOut, FileText, Share2, Settings, ImagePlus } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { AppFooter } from '../../components/branding/AppFooter.jsx';
export function LoginScreen({ showToast, EMAILS_PERMITIDOS, auth }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      if (!EMAILS_PERMITIDOS.includes(result.user.email)) {
        await signOut(auth);
        showToast('Acceso denegado. Tu correo no está autorizado.', 'error');
        return;
      }
      window.sessionStorage.setItem('ggs_intro_after_login_uid', result.user.uid);

      showToast('Sesion iniciada con Google');
    } catch (error) {
      console.error("Error Google Auth:", error);
      if (error.code !== 'auth/popup-closed-by-user') {
        showToast('Error al iniciar sesión', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center border border-gray-100">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users size={32} />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-800 mb-2">COMUNIC@TE POS</h1>
        <p className="text-sm text-gray-500 mb-8">Acceso privado al sistema</p>
        
        <button 
          onClick={handleGoogleLogin} 
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 py-3 px-4 rounded-xl hover:bg-gray-50 transition shadow-sm mb-4 font-medium disabled:opacity-50"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {isLoading ? 'Verificando...' : 'Ingresar con Google'}
        </button>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}


