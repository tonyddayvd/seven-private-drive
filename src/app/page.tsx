"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Shield, ArrowRight, Phone, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // 1. Verifica se já há um token de passageiro armazenado localmente
    const savedToken = localStorage.getItem("seven_passenger_token");
    if (savedToken) {
      router.replace(`/p/${savedToken}`);
    } else {
      setChecking(false);
    }
  }, [router]);

  async function handlePhoneLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");

    const cleanInput = phoneNumber.replace(/\D/g, "");
    if (!cleanInput || cleanInput.length < 8) {
      setErrorMessage("Por favor, digite um número de telefone ou WhatsApp válido com DDD.");
      return;
    }

    setLoadingLogin(true);

    try {
      // Busca clientes ativos no Supabase
      const { data: clients, error } = await supabase
        .from("clients")
        .select("id, name, phone, token")
        .eq("is_active", true);

      if (error) throw error;

      // Normaliza e compara os telefones removendo caracteres especiais
      const matchedClient = clients?.find((c) => {
        if (!c.phone) return false;
        const cleanClientPhone = c.phone.replace(/\D/g, "");
        return (
          cleanClientPhone === cleanInput ||
          cleanClientPhone.endsWith(cleanInput) ||
          cleanInput.endsWith(cleanClientPhone)
        );
      });

      if (matchedClient && matchedClient.token) {
        // Armazena no localStorage para persistência e login automático futuro
        localStorage.setItem("seven_passenger_token", matchedClient.token);
        router.push(`/p/${matchedClient.token}`);
      } else {
        setErrorMessage(
          "Telefone não encontrado. Verifique os dígitos com DDD ou solicite o cadastro do seu número ao motorista."
        );
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Erro de conexão ao validar telefone. Tente novamente.");
    } finally {
      setLoadingLogin(false);
    }
  }

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
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-background text-foreground">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center">
        {/* Logo / Ícone */}
        <div className="w-16 h-16 bg-primary/10 text-primary border border-primary/20 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-primary/5">
          <Car className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white mb-1 text-center">
          Seven Private Drive
        </h1>
        <p className="text-zinc-400 text-xs sm:text-sm mb-6 text-center leading-relaxed">
          Acesso exclusivo para passageiros particulares
        </p>

        {/* Formulário de Login por Telefone (Sem Senha) */}
        <form onSubmit={handlePhoneLogin} className="w-full space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
            <label className="block text-xs font-bold text-zinc-200">
              Digite seu WhatsApp ou Telefone
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                <Phone className="w-4 h-4" />
              </div>
              <input
                type="tel"
                required
                placeholder="Ex: (11) 98765-4321"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full bg-card border border-border rounded-xl pl-10 pr-3 py-2.5 text-white text-sm focus:border-primary focus:outline-none transition-all"
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              Acesso sem senha. Identificamos automaticamente suas corridas e faturas cadastradas.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loadingLogin}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary hover:bg-primary-hover text-zinc-950 text-sm font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
          >
            {loadingLogin ? (
              <span>Validando número...</span>
            ) : (
              <>
                <span>Entrar no Meu Painel</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divisor */}
        <div className="w-full my-6 flex items-center gap-3">
          <div className="h-px bg-border flex-1"></div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
            Motorista
          </span>
          <div className="h-px bg-border flex-1"></div>
        </div>

        {/* Link para o Motorista / Admin */}
        <a
          href="/admin"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-surface hover:bg-zinc-800 border border-border text-zinc-300 hover:text-white text-xs font-medium transition-colors"
        >
          <Shield className="w-4 h-4 text-accent" />
          <span>Acessar Painel do Motorista & Gestão</span>
          <ArrowRight className="w-3.5 h-3.5 ml-auto text-zinc-400" />
        </a>
      </div>
    </main>
  );
}
