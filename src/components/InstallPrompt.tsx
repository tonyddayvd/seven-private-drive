"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, PlusSquare } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detecta se já está instalado como standalone
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes("android-app://");

    if (isStandalone) return;

    // Detecta iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // No iOS ou Android, se não foi fechado nesta sessão, exibe o banner
    const dismissed = sessionStorage.getItem("seven_install_dismissed");
    if (!dismissed) {
      setShowPrompt(true);
    }

    // Captura evento de instalação nativa do Chrome / Android
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  async function handleInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // Caso o navegador ainda não tenha disparado beforeinstallprompt
      alert("Para instalar:\n\n• No Android/Chrome: Toque no menu de 3 pontinhos (⋮) e clique em 'Instalar aplicativo' ou 'Adicionar à tela inicial'.\n\n• No iPhone/Safari: Toque no ícone de Compartilhar e selecione 'Adicionar à Tela de Início'.");
    }
  }

  function handleDismiss() {
    setShowPrompt(false);
    sessionStorage.setItem("seven_install_dismissed", "true");
  }

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 max-w-md mx-auto bg-card/95 backdrop-blur-md border border-primary/40 p-3.5 rounded-2xl shadow-2xl shadow-primary/10 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
          <Download className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-white">Instalar o Seven Drive</h4>
          <p className="text-[11px] text-zinc-400 leading-tight">
            {isIOS ? (
              <span className="inline-flex items-center gap-1">
                Toque em <Share className="w-3 h-3 text-accent inline" /> e depois em <PlusSquare className="w-3 h-3 text-white inline" /> &apos;Tela de Início&apos;
              </span>
            ) : (
              "Adicione à tela inicial para abrir em 1 toque!"
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleInstallClick}
          className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-zinc-950 text-xs font-bold transition-all shadow-md shadow-primary/20"
        >
          Instalar
        </button>
        <button
          onClick={handleDismiss}
          className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
