"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Shield, ArrowRight } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Verifica se há token de passageiro armazenado no dispositivo
    const savedToken = localStorage.getItem("seven_passenger_token");
    if (savedToken) {
      router.replace(`/p/${savedToken}`);
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-zinc-400 text-sm">Carregando seu portal...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-background text-foreground">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-2xl text-center flex flex-col items-center">
        <div className="w-16 h-16 bg-primary/10 text-primary border border-primary/20 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-primary/5">
          <Car className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          Seven Private Drive
        </h1>
        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">
          Portal exclusivo de corridas particulares e gestão executiva de transporte.
        </p>

        <div className="w-full space-y-4">
          <div className="p-4 bg-surface border border-border/80 rounded-xl text-left">
            <h3 className="text-xs uppercase font-semibold text-zinc-400 tracking-wider mb-1">
              É passageiro?
            </h3>
            <p className="text-xs text-zinc-400">
              Acesse pelo link exclusivo enviado pelo seu motorista no WhatsApp para abrir seu painel individual.
            </p>
          </div>

          <a
            href="/admin"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface hover:bg-zinc-800 border border-border text-zinc-300 hover:text-white text-sm font-medium transition-colors"
          >
            <Shield className="w-4 h-4 text-accent" />
            <span>Acessar Painel do Motorista</span>
            <ArrowRight className="w-4 h-4 ml-auto" />
          </a>
        </div>
      </div>
    </main>
  );
}
