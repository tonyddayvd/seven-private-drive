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
  Sparkles
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
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Formulário Novo Passageiro
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientDueDay, setNewClientDueDay] = useState("10");

  // Formulário Nova Despesa
  const [expDescription, setExpDescription] = useState("");
  const [expCategory, setExpCategory] = useState<"combustivel" | "manutencao" | "seguro" | "alimentacao" | "outros">("combustivel");
  const [expAmount, setExpAmount] = useState("");

  // Formulário Lançar Corrida Manual
  const [rideClientId, setRideClientId] = useState("");
  const [rideDate, setRideDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rideAmount, setRideAmount] = useState("");
  const [rideOrigin, setRideOrigin] = useState("");
  const [rideDest, setRideDest] = useState("");

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

    // Carrega senha cadastrada ou usa 123456 por padrão
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
      if (settsData) setSettings(settsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
      // Gera token aleatório amigável
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

  // Ação de Lançar Corrida Manual pelo Motorista
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
          origin: rideOrigin || "Lançamento Motorista",
          destination: rideDest || "Lançamento Motorista",
          amount: parsedAmount,
          status: "confirmada", // já entra confirmada pois é feita pelo motorista
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
    const text = `Olá, ${client.name}! Segue seu link exclusivo para conferir suas corridas e fatura no Seven Private Drive: ${clientUrl}`;

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
              <span>Nova Corrida</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-4 space-y-6">
        {/* DASHBOARD FINANCEIRO EXECUTIVO */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Faturamento Bruto Previsto */}
          <div className="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
            <span className="text-xs uppercase font-medium tracking-wider text-zinc-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-primary" /> Faturamento Previsto
            </span>
            <div className="text-2xl font-bold text-white mt-2">
              {formatCurrency(grossRevenue)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Soma de corridas confirmadas</p>
          </div>

          {/* Despesas Operacionais */}
          <div className="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
            <span className="text-xs uppercase font-medium tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5 text-rose-400" /> Despesas Operacionais
            </span>
            <div className="text-2xl font-bold text-rose-400 mt-2">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">Combustível, seguro e manutenções</p>
          </div>

          {/* Lucro Líquido Real */}
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

        {/* FILA DE DUPLA CHECAGEM (CORRIDAS PENDENTES DE APROVAÇÃO) */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Fila de Dupla Checagem
              </h2>
              <p className="text-xs text-zinc-400">Corridas solicitadas pelos passageiros no calendário</p>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold">
              {pendingCheckRides.length} pendente(s)
            </span>
          </div>

          {pendingCheckRides.length === 0 ? (
            <div className="text-center py-6 text-zinc-400 text-xs bg-surface/50 rounded-xl border border-border/50">
              ✓ Nenhuma corrida aguardando aprovação no momento.
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

                  <div className="pt-2 border-t border-border/60 flex items-center gap-2">
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
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

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

      {/* MODAL: LANÇAR CORRIDA MANUAL */}
      {isRideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-white">Lançar Corrida (Motorista)</h3>
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
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Data *</label>
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
    </div>
  );
}
