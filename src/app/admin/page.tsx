"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Users,
  Car,
  TrendingUp,
  Receipt,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Copy,
  DollarSign,
  Fuel,
  Shield,
  Search,
  ChevronRight,
  Sparkles,
  Settings as SettingsIcon,
  Check,
  Trash2,
  AlertTriangle
} from "lucide-react";
import { supabase, Client, Ride, MonthlyStatement, Expense, Settings } from "@/lib/supabase";
import { formatCurrency, formatDateBR, cn } from "@/lib/utils";
import { format } from "date-fns";

export default function AdminDashboard() {
  // Autenticação simples por senha mestre
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState(false);

  // Estados principais
  const [clients, setClients] = useState<Client[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [statements, setStatements] = useState<MonthlyStatement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Modais
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isRideModalOpen, setIsRideModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Formulário Configurações de Pix e Perfil
  const [pixDriverName, setPixDriverName] = useState("");
  const [pixType, setPixType] = useState("Chave Aleatória");
  const [pixKeyVal, setPixKeyVal] = useState("");
  const [adminPassVal, setAdminPassVal] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false);

  // Formulário Novo Passageiro
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientDueDay, setNewClientDueDay] = useState("10");

  // Formulário Nova Despesa
  const [expDescription, setExpDescription] = useState("");
  const [expCategory, setExpCategory] = useState<"combustivel" | "manutencao" | "seguro" | "alimentacao" | "outros">("combustivel");
  const [expAmount, setExpAmount] = useState("");

  // Formulário Lançar Corrida pelo Motorista
  const [rideClientId, setRideClientId] = useState("");
  const [rideDate, setRideDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rideAmount, setRideAmount] = useState("");
  const [rideOrigin, setRideOrigin] = useState("");
  const [rideDest, setRideDest] = useState("");
  const [rideInitialStatus, setRideInitialStatus] = useState<"confirmada" | "pendente_confirmacao">("pendente_confirmacao");

  useEffect(() => {
    const isAuth = sessionStorage.getItem("seven_admin_auth");
    if (isAuth === "true") {
      setIsAuthenticated(true);
      loadAdminData();
    } else {
      setLoading(false);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(false);

    const { data: setts } = await supabase
      .from("settings")
      .select("admin_password")
      .eq("id", "config-default")
      .single();

    const validPass = setts?.admin_password || "123456";
    if (passwordInput === validPass) {
      sessionStorage.setItem("seven_admin_auth", "true");
      setIsAuthenticated(true);
      loadAdminData();
    } else {
      setAuthError(true);
    }
  }

  async function loadAdminData() {
    setLoading(true);
    try {
      const [
        { data: clientsData },
        { data: ridesData },
        { data: stmtsData },
        { data: expensesData },
        { data: settsData },
      ] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("rides").select("*").order("created_at", { ascending: false }),
        supabase.from("monthly_statements").select("*").order("created_at", { ascending: false }),
        supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
        supabase.from("settings").select("*").eq("id", "config-default").single(),
      ]);

      if (clientsData) setClients(clientsData);
      if (ridesData) setRides(ridesData);
      if (stmtsData) setStatements(stmtsData);
      if (expensesData) setExpenses(expensesData);
      if (settsData) {
        setSettings(settsData);
        setPixDriverName(settsData.driver_name || "");
        setPixType(settsData.pix_key_type || "Chave Aleatória");
        setPixKeyVal(settsData.pix_key || "");
        setAdminPassVal(settsData.admin_password || "123456");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Salvar Configurações de Pix e Senha
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const { data, error } = await supabase
        .from("settings")
        .upsert({
          id: "config-default",
          driver_name: pixDriverName,
          pix_key_type: pixType,
          pix_key: pixKeyVal,
          admin_password: adminPassVal,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      setSettings(data);
      setSettingsSavedSuccess(true);
      setTimeout(() => {
        setSettingsSavedSuccess(false);
        setIsSettingsModalOpen(false);
      }, 1500);
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar configurações.");
    } finally {
      setSavingSettings(false);
    }
  }

  // Métricas do Dashboard Executivo
  const pendingCheckRides = useMemo(() => {
    return rides.filter((r) => r.status === "pendente_confirmacao");
  }, [rides]);

  const grossRevenue = useMemo(() => {
    return rides
      .filter((r) => r.status === "confirmada" || r.status === "faturada")
      .reduce((acc, r) => acc + Number(r.amount || 0), 0);
  }, [rides]);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((acc, exp) => acc + Number(exp.amount || 0), 0);
  }, [expenses]);

  const netProfit = grossRevenue - totalExpenses;

  // Ações de Dupla Checagem
  async function handleApproveRide(rideId: string) {
    try {
      await supabase.from("rides").update({ status: "confirmada" }).eq("id", rideId);
      setRides((prev) =>
        prev.map((r) => (r.id === rideId ? { ...r, status: "confirmada" } : r))
      );
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRejectRide(rideId: string) {
    try {
      await supabase.from("rides").update({ status: "cancelada" }).eq("id", rideId);
      setRides((prev) =>
        prev.map((r) => (r.id === rideId ? { ...r, status: "cancelada" } : r))
      );
    } catch (err) {
      console.error(err);
    }
  }

  // Ações de Criação de Passageiro
  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientName) return;

    try {
      const rawToken = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);

      const { data: newC, error } = await supabase
        .from("clients")
        .insert({
          name: newClientName,
          phone: newClientPhone || null,
          token: rawToken,
          billing_due_day: parseInt(newClientDueDay) || 10,
        })
        .select()
        .single();

      if (error) throw error;

      setClients((prev) => [...prev, newC]);
      setIsClientModalOpen(false);
      setNewClientName("");
      setNewClientPhone("");
    } catch (err) {
      console.error(err);
      alert("Erro ao cadastrar passageiro.");
    }
  }

  // Ação de Excluir Passageiro
  async function handleDeleteClient() {
    if (!clientToDelete) return;
    setDeletingClient(true);
    try {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientToDelete.id);

      if (error) throw error;

      setClients((prev) => prev.filter((c) => c.id !== clientToDelete.id));
      setRides((prev) => prev.filter((r) => r.client_id !== clientToDelete.id));
      setStatements((prev) => prev.filter((s) => s.client_id !== clientToDelete.id));
      setClientToDelete(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir passageiro.");
    } finally {
      setDeletingClient(false);
    }
  }

  // Ação de Lançar Despesa
  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expDescription || !expAmount) return;

    try {
      const parsedAmount = parseFloat(expAmount.replace(",", "."));
      const { data: newExp, error } = await supabase
        .from("expenses")
        .insert({
          description: expDescription,
          category: expCategory,
          amount: parsedAmount,
          expense_date: format(new Date(), "yyyy-MM-dd"),
        })
        .select()
        .single();

      if (error) throw error;

      setExpenses((prev) => [newExp, ...prev]);
      setIsExpenseModalOpen(false);
      setExpDescription("");
      setExpAmount("");
    } catch (err) {
      console.error(err);
      alert("Erro ao lançar despesa.");
    }
  }

  // Ação de Lançar Corrida pelo Motorista (pode ser enviada para confirmação do passageiro ou direto confirmada)
  async function handleCreateManualRide(e: React.FormEvent) {
    e.preventDefault();
    if (!rideClientId || !rideAmount) return;

    try {
      const parsedAmount = parseFloat(rideAmount.replace(",", "."));
      const { data: newR, error } = await supabase
        .from("rides")
        .insert({
          client_id: rideClientId,
          ride_date: rideDate,
          origin: rideOrigin || "Lançado pelo Motorista",
          destination: rideDest || "Lançado pelo Motorista",
          amount: parsedAmount,
          status: rideInitialStatus,
          created_by: "driver",
        })
        .select()
        .single();

      if (error) throw error;

      setRides((prev) => [newR, ...prev]);
      setIsRideModalOpen(false);
      setRideAmount("");
      setRideOrigin("");
      setRideDest("");
    } catch (err) {
      console.error(err);
      alert("Erro ao lançar corrida.");
    }
  }

  function copyWhatsAppLink(client: Client) {
    const originUrl = typeof window !== "undefined" ? window.location.origin : "";
    const clientUrl = `${originUrl}/p/${client.token}`;
    const text = `Olá, ${client.name}! 👋 Segue seu portal exclusivo Seven Private Drive para acompanhar suas viagens e faturas: ${clientUrl}`;

    navigator.clipboard.writeText(text);
    setCopiedToken(client.token);
    setTimeout(() => setCopiedToken(null), 2500);
  }

  // Tela de Login Admin
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="bg-card border border-border w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mx-auto mb-3">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-white">Painel do Motorista</h1>
            <p className="text-xs text-zinc-400">Digite a senha master para gerenciar o sistema.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <input
                type="password"
                required
                placeholder="Senha Master"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-white text-sm focus:border-accent focus:outline-none text-center tracking-widest"
              />
            </div>

            {authError && (
              <p className="text-xs text-rose-400 text-center font-medium">
                Senha incorreta. Tente novamente.
              </p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-xs transition-all shadow-md shadow-accent/20"
            >
              Entrar no Painel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header Admin */}
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-none">Seven Private Admin</h1>
              <span className="text-[10px] text-zinc-400">Controle Financeiro & Corridas</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/"
              className="p-2 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-zinc-400 hover:text-white transition-all text-xs"
              title="Ir para tela inicial / portal"
            >
              <Car className="w-4 h-4" />
            </a>

            {/* Botão Configurações Pix */}
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-zinc-300 hover:text-white transition-all"
              title="Configurações de Pix e Motorista"
            >
              <SettingsIcon className="w-4 h-4 text-primary" />
            </button>
            <button
              onClick={() => setIsExpenseModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-zinc-300 hover:text-white text-xs font-medium"
            >
              <Fuel className="w-3.5 h-3.5 text-rose-400" />
              <span>Despesa</span>
            </button>
            <button
              onClick={() => setIsRideModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-zinc-950 text-xs font-bold shadow-md shadow-primary/10"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Lançar Corrida</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-4 space-y-6">
        {/* Banner Pix Ativo */}
        <div className="bg-surface border border-border/80 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Chave Pix Cadastrada para Recebimento:</p>
              <p className="text-[11px] text-zinc-400">
                {settings?.pix_key ? `${settings.pix_key_type}: ${settings.pix_key} (${settings.driver_name})` : "Nenhum Pix configurado"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="text-xs text-primary hover:underline font-semibold"
          >
            Editar Pix
          </button>
        </div>

        {/* DASHBOARD FINANCEIRO EXECUTIVO */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
            <span className="text-xs uppercase font-medium tracking-wider text-zinc-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary" /> Faturamento Previsto
            </span>
            <div className="text-2xl font-bold text-white mt-2">
              {formatCurrency(grossRevenue)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Soma de corridas confirmadas</p>
          </div>

          <div className="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
            <span className="text-xs uppercase font-medium tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5 text-rose-400" /> Despesas Operacionais
            </span>
            <div className="text-2xl font-bold text-rose-400 mt-2">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Combustível, seguro e manutenções</p>
          </div>

          <div className="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
            <span className="text-xs uppercase font-medium tracking-wider text-zinc-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Lucro Líquido Real
            </span>
            <div className="text-2xl font-bold text-emerald-400 mt-2">
              {formatCurrency(netProfit)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Faturamento líquido em caixa</p>
          </div>
        </section>

        {/* FILA DE DUPLA CHECAGEM */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Fila de Dupla Checagem
              </h2>
              <p className="text-xs text-zinc-400">Corridas aguardando confirmação (solicitadas pelo passageiro ou lançadas por você)</p>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold">
              {pendingCheckRides.length} pendente(s)
            </span>
          </div>

          {pendingCheckRides.length === 0 ? (
            <div className="text-center py-6 text-zinc-400 text-xs bg-surface/50 rounded-xl border border-border/50">
              ✓ Nenhuma corrida pendente de aprovação no momento.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingCheckRides.map((ride) => {
                const client = clients.find((c) => c.id === ride.client_id);
                return (
                  <div
                    key={ride.id}
                    className="bg-surface border border-amber-500/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{client?.name || "Passageiro"}</span>
                        <span className="text-[10px] bg-card px-2 py-0.5 rounded border border-border text-zinc-300">
                          {formatDateBR(ride.ride_date)}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          (Lançado por: {ride.created_by === "driver" ? "Motorista" : "Passageiro"})
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {ride.origin} ➔ {ride.destination} {ride.notes ? `(${ride.notes})` : ""}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-border/60">
                      <span className="text-sm font-extrabold text-white">
                        {formatCurrency(Number(ride.amount))}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRejectRide(ride.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium"
                        >
                          Rejeitar
                        </button>
                        <button
                          onClick={() => handleApproveRide(ride.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-bold"
                        >
                          Aprovar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* GESTÃO DE PASSAGEIROS & LINKS EXCLUSIVOS */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Passageiros & Links Exclusivos
              </h2>
              <p className="text-xs text-zinc-400">Copie o link individual ou gerencie o perfil do passageiro</p>
            </div>
            <button
              onClick={() => setIsClientModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-zinc-200 hover:text-white text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>Novo Passageiro</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {clients.map((c) => {
              const clientRides = rides.filter((r) => r.client_id === c.id && r.status !== "cancelada");
              const clientTotal = clientRides.reduce((acc, r) => acc + Number(r.amount), 0);

              return (
                <div key={c.id} className="bg-surface border border-border rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-bold text-white truncate">{c.name}</h3>
                      <span className="text-[10px] bg-card px-2 py-0.5 rounded border border-border text-zinc-400">
                        Venc: dia {c.billing_due_day}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">{c.phone || "Sem telefone"}</p>
                    <p className="text-xs font-bold text-emerald-400 mt-2">
                      Total acumulado: {formatCurrency(clientTotal)}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-center gap-1.5">
                    <button
                      onClick={() => copyWhatsAppLink(c)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-card hover:bg-zinc-800 border border-border text-[11px] font-semibold text-white transition-all"
                    >
                      <Copy className="w-3 h-3 text-primary" />
                      <span>{copiedToken === c.token ? "Copiado!" : "Link WhatsApp"}</span>
                    </button>
                    <a
                      href={`/p/${c.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-card hover:bg-zinc-800 border border-border text-zinc-400 hover:text-white"
                      title="Abrir como Passageiro"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => setClientToDelete(c)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 transition-all"
                      title="Excluir Passageiro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* MODAL: CONFIGURAÇÕES DE PIX E PERFIL DO MOTORISTA */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-primary" /> Configurações de Recebimento
              </h3>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Seu Nome / Nome de Exibição</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Tony Silva"
                  value={pixDriverName}
                  onChange={(e) => setPixDriverName(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Tipo de Chave Pix</label>
                  <select
                    value={pixType}
                    onChange={(e) => setPixType(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                  >
                    <option value="CPF">CPF</option>
                    <option value="CNPJ">CNPJ</option>
                    <option value="Celular">Celular</option>
                    <option value="E-mail">E-mail</option>
                    <option value="Chave Aleatória">Chave Aleatória</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Chave Pix Real *</label>
                  <input
                    type="text"
                    required
                    placeholder="Sua chave Pix"
                    value={pixKeyVal}
                    onChange={(e) => setPixKeyVal(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Senha Master de Acesso Admin</label>
                <input
                  type="text"
                  required
                  value={adminPassVal}
                  onChange={(e) => setAdminPassVal(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                />
              </div>

              {settingsSavedSuccess && (
                <p className="text-xs text-emerald-400 font-semibold text-center flex items-center justify-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Dados de Pix atualizados com sucesso!
                </p>
              )}

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface border border-border text-zinc-300 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-zinc-950 text-xs font-bold"
                >
                  {savingSettings ? "Salvando..." : "Salvar Configurações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LANÇAR CORRIDA PELO MOTORISTA */}
      {isRideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Lançar Corrida (Motorista)</h3>
                <p className="text-xs text-zinc-400">Caso o passageiro tenha esquecido de registrar a viagem</p>
              </div>
              <button onClick={() => setIsRideModalOpen(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateManualRide} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Passageiro *</label>
                <select
                  required
                  value={rideClientId}
                  onChange={(e) => setRideClientId(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                >
                  <option value="">Selecione o passageiro</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Data da Corrida *</label>
                  <input
                    type="date"
                    required
                    value={rideDate}
                    onChange={(e) => setRideDate(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Valor (R$) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 40,00"
                    value={rideAmount}
                    onChange={(e) => setRideAmount(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Origem (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Trabalho"
                    value={rideOrigin}
                    onChange={(e) => setRideOrigin(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Destino (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Casa"
                    value={rideDest}
                    onChange={(e) => setRideDest(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Status Inicial da Corrida</label>
                <select
                  value={rideInitialStatus}
                  onChange={(e: any) => setRideInitialStatus(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                >
                  <option value="pendente_confirmacao">Aguardar confirmação do passageiro no portal</option>
                  <option value="confirmada">Já lançar confirmada</option>
                </select>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsRideModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface border border-border text-zinc-300 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-zinc-950 text-xs font-bold"
                >
                  Lançar Corrida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO PASSAGEIRO */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-white">Cadastrar Passageiro</h3>
              <button onClick={() => setIsClientModalOpen(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">WhatsApp / Telefone</label>
                <input
                  type="text"
                  placeholder="Ex: (11) 98765-4321"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Dia Padrão de Vencimento</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={newClientDueDay}
                  onChange={(e) => setNewClientDueDay(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface border border-border text-zinc-300 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-zinc-950 text-xs font-bold"
                >
                  Salvar Passageiro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LANÇAR DESPESA */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-white">Lançar Despesa Operacional</h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-zinc-400 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Descrição *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Abastecimento Gasolina"
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-rose-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Categoria</label>
                  <select
                    value={expCategory}
                    onChange={(e: any) => setExpCategory(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-rose-400 focus:outline-none"
                  >
                    <option value="combustivel">Combustível</option>
                    <option value="manutencao">Manutenção</option>
                    <option value="seguro">Seguro</option>
                    <option value="alimentacao">Alimentação</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Valor (R$) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 150,00"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-rose-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface border border-border text-zinc-300 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold"
                >
                  Registrar Despesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE PASSAGEIRO */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-white">Excluir Passageiro</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Tem certeza que deseja excluir o passageiro <span className="font-bold text-white">&quot;{clientToDelete.name}&quot;</span>?
              </p>
              <p className="text-[11px] text-zinc-400 mt-2">
                Todas as corridas e faturas deste cliente serão removidas do sistema.
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                disabled={deletingClient}
                onClick={() => setClientToDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface border border-border text-zinc-300 text-xs font-medium hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingClient}
                onClick={handleDeleteClient}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/20"
              >
                {deletingClient ? "Excluindo..." : "Sim, Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
