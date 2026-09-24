"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Car,
  Calendar as CalendarIcon,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  Clock,
  QrCode,
  Copy,
  Upload,
  Sparkles,
  DollarSign,
  TrendingUp,
  AlertCircle,
  FileCheck,
  Shield
} from "lucide-react";
import { supabase, Client, Ride, MonthlyStatement, Settings } from "@/lib/supabase";
import { formatCurrency, formatDateBR, cn } from "@/lib/utils";
import QRCode from "qrcode";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PassengerPortal() {
  const params = useParams();
  const token = params.token as string;

  const [client, setClient] = useState<Client | null>(null);
  const [statement, setStatement] = useState<MonthlyStatement | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Mês de navegação do calendário
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Modal de Agendamento/Marcação de Corrida
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [rideAmount, setRideAmount] = useState("");
  const [rideOrigin, setRideOrigin] = useState("");
  const [rideDestination, setRideDestination] = useState("");
  const [rideNotes, setRideNotes] = useState("");
  const [submittingRide, setSubmittingRide] = useState(false);

  // Modal de Pagamento Pix
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedRideIds, setSelectedRideIds] = useState<string[]>([]);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptSuccess, setReceiptSuccess] = useState(false);

  // Edição de Data Flexível de Pagamento
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [customDueDate, setCustomDueDate] = useState("");

  // 1. Carrega dados do passageiro e grava token no localStorage para PWA
  useEffect(() => {
    if (!token) return;

    // Salva token para acesso persistente no PWA
    try {
      localStorage.setItem("seven_passenger_token", token);
    } catch (e) {
      console.warn("Storage not available");
    }

    loadPortalData();
  }, [token]);

  async function loadPortalData() {
    setLoading(true);
    try {
      // 1. Busca o cliente pelo token
      const { data: clientData, error: clientErr } = await supabase
        .from("clients")
        .select("*")
        .eq("token", token)
        .single();

      if (clientErr || !clientData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setClient(clientData);

      // 2. Busca configurações globais (Pix, nome)
      const { data: settingsData } = await supabase
        .from("settings")
        .select("*")
        .eq("id", "config-default")
        .single();

      if (settingsData) setSettings(settingsData);

      // 3. Busca faturas do cliente: prioriza 'em_aberto', senão 'pendente_conferencia', senão 'recusado'
      const refMonth = format(new Date(), "yyyy-MM");
      const { data: stmtsData } = await supabase
        .from("monthly_statements")
        .select("*")
        .eq("client_id", clientData.id)
        .in("status", ["em_aberto", "pendente_conferencia", "recusado"])
        .order("created_at", { ascending: false });

      let stmtData = stmtsData?.find((s) => s.status === "em_aberto") ||
                     stmtsData?.find((s) => s.status === "pendente_conferencia") ||
                     stmtsData?.find((s) => s.status === "recusado") ||
                     null;

      if (!stmtData) {
        // Gera vencimento inicial baseado no preferred_due_date ou billing_due_day
        const dueDay = clientData.billing_due_day || 10;
        const now = new Date();
        const initialDueDate = `${format(now, "yyyy-MM")}-${String(dueDay).padStart(2, "0")}`;

        const { data: newStmt } = await supabase
          .from("monthly_statements")
          .insert({
            client_id: clientData.id,
            reference_month: refMonth,
            due_date: clientData.preferred_due_date || initialDueDate,
            total_amount: 0,
            rides_count: 0,
            status: "em_aberto",
          })
          .select()
          .single();

        stmtData = newStmt;
      }

      setStatement(stmtData);

      // 4. Busca corridas do cliente
      const { data: ridesData } = await supabase
        .from("rides")
        .select("*")
        .eq("client_id", clientData.id)
        .order("ride_date", { ascending: true });

      setRides(ridesData || []);
    } catch (err) {
      console.error("Erro ao carregar dados do portal:", err);
    } finally {
      setLoading(false);
    }
  }

  // Cálculos do Dashboard do Passageiro
  const currentStatementRides = useMemo(() => {
    if (!statement) return [];
    return rides.filter(
      (r) =>
        (!r.statement_id || r.statement_id === statement.id) &&
        r.status !== "cancelada"
    );
  }, [rides, statement]);

  // Total a acertar (apenas o que ainda NÃO foi pago/faturado)
  const totalOwed = useMemo(() => {
    return currentStatementRides
      .filter((r) => r.status !== "faturada")
      .reduce((acc, r) => acc + Number(r.amount || 0), 0);
  }, [currentStatementRides]);

  const paidCount = useMemo(() => {
    return rides.filter((r) => r.status === "faturada").length;
  }, [rides]);

  const confirmedCount = useMemo(() => {
    return currentStatementRides.filter((r) => r.status === "confirmada").length;
  }, [currentStatementRides]);

  const pendingCount = useMemo(() => {
    return currentStatementRides.filter((r) => r.status === "pendente_confirmacao").length;
  }, [currentStatementRides]);

  // Corridas disponíveis para pagamento: apenas confirmadas ou pendentes (NUNCA faturadas/já pagas)
  const payableRides = useMemo(() => {
    return currentStatementRides.filter(
      (r) => r.status === "confirmada" || r.status === "pendente_confirmacao"
    );
  }, [currentStatementRides]);

  // Total das corridas selecionadas para pagamento
  const selectedRidesTotal = useMemo(() => {
    return payableRides
      .filter((r) => selectedRideIds.includes(r.id))
      .reduce((acc, r) => acc + Number(r.amount || 0), 0);
  }, [payableRides, selectedRideIds]);

  // Ao abrir o modal, pré-seleciona todas as corridas se nenhuma estiver selecionada
  useEffect(() => {
    if (isPayModalOpen) {
      if (payableRides.length > 0) {
        setSelectedRideIds(payableRides.map((r) => r.id));
      } else {
        setSelectedRideIds([]);
      }
    }
  }, [isPayModalOpen]);

  // Geração de QR Code Pix dinâmico com base no valor selecionado
  useEffect(() => {
    if (isPayModalOpen && settings?.pix_key && selectedRidesTotal > 0) {
      // Simulação de payload Pix padrão para copia e cola
      const pixPayload = `00020126360014BR.GOV.BCB.PIX0114${settings.pix_key}520400005303986540${selectedRidesTotal.toFixed(2)}5802BR5915${settings.driver_name || "Motorista"}6009SAO PAULO62070503***6304`;
      QRCode.toDataURL(pixPayload, { width: 260, margin: 2 })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error(err));
    } else {
      setQrCodeDataUrl("");
    }
  }, [isPayModalOpen, settings, selectedRidesTotal]);

  // Ações
  async function handleCreateRide(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !rideAmount) return;

    setSubmittingRide(true);
    try {
      const parsedAmount = parseFloat(rideAmount.replace(",", "."));
      const { data: newRide, error } = await supabase
        .from("rides")
        .insert({
          client_id: client.id,
          statement_id: statement?.id || null,
          ride_date: selectedDate,
          origin: rideOrigin || "A combinar",
          destination: rideDestination || "A combinar",
          amount: parsedAmount,
          status: "pendente_confirmacao",
          created_by: "passenger",
          notes: rideNotes || null,
        })
        .select()
        .single();

      if (error) throw error;

      setRides((prev) => [...prev, newRide]);
      setIsModalOpen(false);
      setRideAmount("");
      setRideOrigin("");
      setRideDestination("");
      setRideNotes("");
    } catch (err) {
      console.error("Erro ao solicitar corrida:", err);
      alert("Erro ao registrar corrida. Tente novamente.");
    } finally {
      setSubmittingRide(false);
    }
  }

  async function handleUpdateDueDate(newDate: string) {
    if (!client || !statement || !newDate) return;
    try {
      await supabase
        .from("clients")
        .update({ preferred_due_date: newDate })
        .eq("id", client.id);

      await supabase
        .from("monthly_statements")
        .update({ due_date: newDate })
        .eq("id", statement.id);

      setClient({ ...client, preferred_due_date: newDate });
      setStatement({ ...statement, due_date: newDate });
      setEditingDueDate(false);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUploadReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !statement || !client) return;

    if (selectedRideIds.length === 0) {
      alert("Por favor, selecione pelo menos uma corrida para realizar o pagamento.");
      return;
    }

    setUploadingReceipt(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `statements/${statement.id}_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("receipts")
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from("receipts")
        .getPublicUrl(filePath);

      const receiptUrl = publicUrlData.publicUrl;

      // 1. Atualiza as corridas selecionadas para estarem vinculadas a esta fatura
      await supabase
        .from("rides")
        .update({ statement_id: statement.id })
        .in("id", selectedRideIds);

      // 2. Atualiza a fatura atual com o valor e quantidade EXATA das corridas selecionadas
      await supabase
        .from("monthly_statements")
        .update({
          receipt_url: receiptUrl,
          total_amount: selectedRidesTotal,
          rides_count: selectedRideIds.length,
          status: "pendente_conferencia",
        })
        .eq("id", statement.id);

      // 3. Verifica se sobraram corridas não selecionadas (ou futuras)
      const remainingRides = currentStatementRides.filter(
        (r) => !selectedRideIds.includes(r.id)
      );

      // Se sobraram corridas não selecionadas, cria ou garante uma nova fatura 'em_aberto' para elas
      if (remainingRides.length > 0) {
        const dueDay = client.billing_due_day || 10;
        const now = new Date();
        const initialDueDate = `${format(now, "yyyy-MM")}-${String(dueDay).padStart(2, "0")}`;

        const { data: newOpenStmt } = await supabase
          .from("monthly_statements")
          .insert({
            client_id: client.id,
            reference_month: statement.reference_month || format(now, "yyyy-MM"),
            due_date: client.preferred_due_date || initialDueDate,
            total_amount: remainingRides.reduce((acc, r) => acc + Number(r.amount || 0), 0),
            rides_count: remainingRides.length,
            status: "em_aberto",
          })
          .select()
          .single();

        if (newOpenStmt) {
          // Desassocia ou associa as corridas restantes à nova fatura em aberto
          await supabase
            .from("rides")
            .update({ statement_id: newOpenStmt.id })
            .in("id", remainingRides.map((r) => r.id));
        }
      }

      setStatement({
        ...statement,
        receipt_url: receiptUrl,
        total_amount: selectedRidesTotal,
        rides_count: selectedRideIds.length,
        status: "pendente_conferencia",
      });

      setReceiptSuccess(true);
      setTimeout(() => {
        setReceiptSuccess(false);
        setIsPayModalOpen(false);
        loadPortalData();
      }, 3000);
    } catch (err) {
      console.error("Erro ao enviar comprovante:", err);
      alert("Erro ao enviar comprovante. Tente novamente.");
    } finally {
      setUploadingReceipt(false);
    }
  }

  // Calendário
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Espaçamento do primeiro dia da semana (Domingo = 0)
  const startDayIndex = monthStart.getDay();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-zinc-400 text-sm">Carregando seus dados...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="bg-card border border-border p-8 rounded-2xl max-w-sm text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Portal Não Encontrado</h2>
          <p className="text-zinc-400 text-sm">
            O link informado expirou ou é inválido. Solicite um novo link ao seu motorista.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* Topo Executivo */}
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-primary tracking-wide uppercase">Seven Private</span>
              <h1 className="text-sm font-bold text-white">{client?.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/admin"
              className="p-1.5 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-zinc-400 hover:text-white transition-all text-xs flex items-center gap-1"
              title="Acessar Painel do Motorista / Administrador"
            >
              <Shield className="w-3.5 h-3.5 text-accent" />
              <span className="hidden sm:inline text-[10px]">Área Motorista</span>
            </a>

            <button
              onClick={() => setIsPayModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-zinc-950 font-semibold text-xs transition-all shadow-md shadow-primary/20"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Pagar Fatura</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        {/* Banner de Status da Fatura */}
        {statement?.status === "pendente_conferencia" && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-amber-300">Comprovante em conferência</p>
              <p className="text-zinc-400">Seu pagamento está sendo validado pelo motorista.</p>
            </div>
          </div>
        )}

        {statement?.status === "recusado" && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-rose-300">Comprovante recusado</p>
              <p className="text-zinc-400">{statement.refusal_reason || "Por favor, reenvie o comprovante correto."}</p>
            </div>
          </div>
        )}

        {/* DASHBOARD DO PASSAGEIRO - CARDS DE CONTROLE */}
        <section className="grid grid-cols-2 gap-3">
          {/* Card 1: Total Devendo / Em Aberto */}
          <div className="col-span-2 bg-gradient-to-br from-card via-card to-surface border border-border p-5 rounded-2xl relative overflow-hidden shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase font-medium tracking-wider text-zinc-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-primary" /> Total em Aberto
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-zinc-400">
                Ciclo Atual
              </span>
            </div>

            <div className="text-3xl font-extrabold text-white tracking-tight mb-2">
              {formatCurrency(totalOwed)}
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-zinc-400 pt-2 border-t border-border/60 gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {confirmedCount} a pagar
                </span>
                {paidCount > 0 && (
                  <span className="flex items-center gap-1 text-blue-400">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    {paidCount} já paga(s)
                  </span>
                )}
              </div>
              {pendingCount > 0 && (
                <span className="flex items-center gap-1 text-amber-400">
                  <Clock className="w-3.5 h-3.5" />
                  {pendingCount} pendente(s)
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Data de Pagamento Flexível Escolhida pelo Passageiro */}
          <div className="bg-card border border-border p-4 rounded-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <CalendarIcon className="w-3.5 h-3.5 text-accent" /> Data Escolhida
              </span>
              <button
                onClick={() => {
                  setCustomDueDate(statement?.due_date || "");
                  setEditingDueDate(!editingDueDate);
                }}
                className="text-[11px] text-accent hover:underline"
              >
                {editingDueDate ? "Cancelar" : "Alterar"}
              </button>
            </div>

            {editingDueDate ? (
              <div className="mt-2 space-y-2">
                <input
                  type="date"
                  value={customDueDate}
                  onChange={(e) => setCustomDueDate(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-2 py-1 text-xs text-white"
                />
                <button
                  onClick={() => handleUpdateDueDate(customDueDate)}
                  className="w-full py-1 bg-accent hover:bg-accent-hover text-white text-xs rounded-lg font-medium"
                >
                  Salvar Data
                </button>
              </div>
            ) : (
              <div>
                <p className="text-lg font-bold text-white">
                  {formatDateBR(statement?.due_date || "")}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Você escolhe o dia ideal para quitar este mês.
                </p>
              </div>
            )}
          </div>

          {/* Card 3: Métricas Rápidas */}
          <div className="bg-card border border-border p-4 rounded-xl flex flex-col justify-between">
            <span className="text-xs text-zinc-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-primary" /> Média p/ Corrida
            </span>
            <div className="mt-2">
              <p className="text-lg font-bold text-white">
                {currentStatementRides.length > 0
                  ? formatCurrency(totalOwed / currentStatementRides.length)
                  : "R$ 0,00"}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {currentStatementRides.length} viagens no total
              </p>
            </div>
          </div>
        </section>

        {/* CALENDÁRIO INTERATIVO DE CORRIDAS (DUPLA CHECAGEM) */}
        <section className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-primary" /> Calendário de Corridas
              </h2>
              <p className="text-xs text-zinc-400">Clique em qualquer dia para registrar ou ver a corrida</p>
            </div>

            {/* Controle de Mês */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1.5 rounded-lg bg-surface hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold capitalize text-zinc-200 px-2">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </span>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1.5 rounded-lg bg-surface hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <span key={i} className="text-[11px] font-semibold text-zinc-400 py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Grid de Dias */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Espaçadores do início do mês */}
            {Array.from({ length: startDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="h-14 rounded-lg bg-transparent"></div>
            ))}

            {daysInMonth.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayRides = rides.filter((r) => r.ride_date === dateKey && r.status !== "cancelada");
              const isPaid = dayRides.some((r) => r.status === "faturada");
              const isConfirmed = dayRides.some((r) => r.status === "confirmada");
              const isPending = dayRides.some((r) => r.status === "pendente_confirmacao");
              const hasRide = dayRides.length > 0;
              const totalDayAmount = dayRides.reduce((acc, r) => acc + Number(r.amount), 0);

              // Prioridade de cor:
              // 1. Se tem viagem faturada/paga (e não tem confirmada aberta) -> Azul (#3b82f6 / sky/blue)
              // 2. Se tem viagem confirmada -> Verde (emerald)
              // 3. Se tem viagem pendente de confirmação -> Âmbar (amber)
              let statusBorderBg = "bg-surface/60 hover:bg-surface border-border/50 text-zinc-300 hover:border-zinc-700";
              if (hasRide) {
                if (isPaid && !isConfirmed && !isPending) {
                  statusBorderBg = "bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-sm shadow-blue-500/10";
                } else if (isConfirmed) {
                  statusBorderBg = "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-500/10";
                } else if (isPending) {
                  statusBorderBg = "bg-amber-500/15 border-amber-500/40 text-amber-300";
                }
              }

              return (
                <button
                  key={dateKey}
                  onClick={() => {
                    setSelectedDate(dateKey);
                    setIsModalOpen(true);
                  }}
                  className={cn(
                    "h-14 rounded-xl p-1.5 flex flex-col justify-between items-center transition-all border text-left relative",
                    isToday(day) && "ring-1 ring-accent",
                    statusBorderBg
                  )}
                >
                  <span className="text-[11px] font-medium leading-none">
                    {format(day, "d")}
                  </span>

                  {hasRide && (
                    <div className="w-full text-center">
                      <span className="text-[9px] font-bold block truncate">
                        R${totalDayAmount.toFixed(0)}
                      </span>
                      <span className="w-1.5 h-1.5 rounded-full mx-auto block mt-0.5 bg-current animate-pulse"></span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legenda do Calendário */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-4 pt-3 border-t border-border/50 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50"></span> Viagem Paga
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span> A Pagar (Confirmada)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Pendente de checagem
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-surface border border-border"></span> Sem corrida
            </span>
          </div>
        </section>

        {/* LISTA RECENTE DE CORRIDAS DO CICLO */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-bold text-white mb-3 flex items-center justify-between">
            <span>Histórico de Corridas do Ciclo</span>
            <span className="text-xs text-zinc-400 font-normal">{currentStatementRides.length} registros</span>
          </h2>

          {currentStatementRides.length === 0 ? (
            <div className="text-center py-6 text-zinc-400 text-xs">
              Nenhuma corrida registrada neste ciclo ainda. Clique no calendário para adicionar a primeira!
            </div>
          ) : (
            <div className="space-y-2">
              {currentStatementRides.map((ride) => (
                <div
                  key={ride.id}
                  className="bg-surface border border-border/70 rounded-xl p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                        ride.status === "faturada"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : ride.status === "confirmada"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      )}
                    >
                      <Car className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">
                          {formatDateBR(ride.ride_date)}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            ride.status === "faturada"
                              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                              : ride.status === "confirmada"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-amber-500/15 text-amber-400"
                          )}
                        >
                          {ride.status === "faturada"
                            ? "Paga"
                            : ride.status === "confirmada"
                            ? "Confirmada"
                            : "Pendente"}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {ride.origin && ride.destination ? `${ride.origin} ➔ ${ride.destination}` : "Viagem registrada"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">
                      {formatCurrency(Number(ride.amount))}
                    </span>

                    {/* Se a corrida foi lançada pelo motorista e ainda está pendente de confirmação pelo passageiro */}
                    {ride.status === "pendente_confirmacao" && ride.created_by === "driver" && (
                      <button
                        onClick={async () => {
                          try {
                            await supabase.from("rides").update({ status: "confirmada" }).eq("id", ride.id);
                            setRides((prev) =>
                              prev.map((r) => (r.id === ride.id ? { ...r, status: "confirmada" } : r))
                            );
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-bold transition-all"
                        title="Confirmar que você realizou esta corrida"
                      >
                        Confirmar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* MODAL: REGISTRAR/CHECAR CORRIDA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Dia {formatDateBR(selectedDate)}</h3>
                <p className="text-xs text-zinc-400">Detalhes do dia e novas corridas</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Corridas já existentes nesta data */}
            {rides.filter((r) => r.ride_date === selectedDate && r.status !== "cancelada").length > 0 && (
              <div className="space-y-2 pb-2 border-b border-border/60">
                <span className="text-xs font-semibold text-zinc-300 block">Viagens deste dia:</span>
                <div className="space-y-1.5">
                  {rides
                    .filter((r) => r.ride_date === selectedDate && r.status !== "cancelada")
                    .map((r) => (
                      <div
                        key={r.id}
                        className={cn(
                          "p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2",
                          r.status === "faturada"
                            ? "bg-blue-500/10 border-blue-500/30 text-white"
                            : r.status === "confirmada"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-white"
                            : "bg-amber-500/10 border-amber-500/30 text-white"
                        )}
                      >
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.2 rounded font-bold uppercase",
                                r.status === "faturada"
                                  ? "bg-blue-500/20 text-blue-300"
                                  : r.status === "confirmada"
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-amber-500/20 text-amber-300"
                              )}
                            >
                              {r.status === "faturada" ? "✓ Paga" : r.status === "confirmada" ? "A Pagar" : "Pendente"}
                            </span>
                            <span className="font-semibold">{r.origin && r.destination ? `${r.origin} ➔ ${r.destination}` : "Corrida"}</span>
                          </div>
                          {r.notes && <p className="text-[10px] text-zinc-400 mt-0.5">{r.notes}</p>}
                        </div>
                        <span className="font-bold text-sm shrink-0">{formatCurrency(Number(r.amount))}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <form onSubmit={handleCreateRide} className="space-y-3.5">
              <span className="text-xs font-semibold text-zinc-300 block">Registrar nova corrida para este dia:</span>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Valor da Corrida (R$) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 35,00"
                  value={rideAmount}
                  onChange={(e) => setRideAmount(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Origem (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Casa"
                    value={rideOrigin}
                    onChange={(e) => setRideOrigin(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Destino (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Trabalho"
                    value={rideDestination}
                    onChange={(e) => setRideDestination(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Observações (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Ida e volta, parada rápida..."
                  value={rideNotes}
                  onChange={(e) => setRideNotes(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-white text-xs focus:border-primary focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-surface border border-border text-zinc-300 text-xs font-medium hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRide}
                  className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-zinc-950 text-xs font-bold transition-all disabled:opacity-50"
                >
                  {submittingRide ? "Enviando..." : "Confirmar Corrida"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PAGAR FATURA VIA PIX E ENVIAR COMPROVANTE */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Pagamento Pix</h3>
                <p className="text-xs text-zinc-400">Total a acertar: {formatCurrency(totalOwed)}</p>
              </div>
              <button
                onClick={() => setIsPayModalOpen(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Seleção de Corridas para Pagamento Parcial */}
            <div className="bg-surface border border-border rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    Selecione as corridas a pagar
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    {selectedRideIds.length} de {payableRides.length} selecionada(s)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedRideIds.length === payableRides.length) {
                        setSelectedRideIds([]);
                      } else {
                        setSelectedRideIds(payableRides.map((r) => r.id));
                      }
                    }}
                    className="text-[11px] text-primary hover:underline font-semibold"
                  >
                    {selectedRideIds.length === payableRides.length ? "Desmarcar todas" : "Marcar todas"}
                  </button>
                </div>
              </div>

              {/* Lista com scroll das corridas */}
              <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/40">
                {payableRides.map((ride) => {
                  const isSelected = selectedRideIds.includes(ride.id);
                  return (
                    <label
                      key={ride.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border text-xs",
                        isSelected
                          ? "bg-primary/10 border-primary/40 text-white"
                          : "bg-card/50 border-border/60 text-zinc-400 hover:bg-zinc-800/50"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRideIds((prev) => [...prev, ride.id]);
                            } else {
                              setSelectedRideIds((prev) => prev.filter((id) => id !== ride.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary accent-amber-500 cursor-pointer"
                        />
                        <div className="truncate">
                          <p className="font-semibold text-white truncate">
                            {formatDateBR(ride.ride_date)} - {ride.origin && ride.destination ? `${ride.origin} ➔ ${ride.destination}` : "Corrida"}
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            {ride.notes ? `Obs: ${ride.notes}` : "Viagem individual"}
                          </p>
                        </div>
                      </div>

                      <span className="font-bold text-white shrink-0 ml-2">
                        {formatCurrency(Number(ride.amount))}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Resumo do Valor a Pagar */}
              <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="text-zinc-400">Subtotal selecionado:</span>
                <span className="text-base font-extrabold text-primary">
                  {formatCurrency(selectedRidesTotal)}
                </span>
              </div>
            </div>

            {/* QR Code */}
            {selectedRideIds.length > 0 && qrCodeDataUrl ? (
              <div className="flex flex-col items-center p-4 bg-white rounded-xl shadow-inner mx-auto w-fit">
                <img src={qrCodeDataUrl} alt="QR Code Pix" className="w-44 h-44" />
                <span className="text-[10px] text-zinc-700 font-semibold mt-1">Escaneie com seu app de banco</span>
              </div>
            ) : selectedRideIds.length === 0 ? (
              <div className="text-center py-4 bg-surface/50 border border-border rounded-xl text-zinc-400 text-xs">
                Selecione ao menos 1 corrida acima para gerar o pagamento.
              </div>
            ) : (
              <div className="text-center py-4 text-zinc-400 text-xs">Gerando QR Code...</div>
            )}

            {/* Chave Pix e Copia e Cola */}
            <div className="bg-surface border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Chave Pix ({settings?.pix_key_type || "Chave"}):</span>
                <span className="font-semibold text-white truncate max-w-[200px]">{settings?.pix_key}</span>
              </div>

              <button
                onClick={() => {
                  if (settings?.pix_key) {
                    navigator.clipboard.writeText(settings.pix_key);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2500);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-card border border-border hover:bg-zinc-800 text-xs font-semibold text-white transition-all"
              >
                <Copy className="w-3.5 h-3.5 text-primary" />
                <span>{copySuccess ? "Copiado com sucesso!" : "Copiar Chave Pix"}</span>
              </button>
            </div>

            {/* Upload de Comprovante */}
            <div className="bg-surface border border-dashed border-zinc-700 rounded-xl p-4 text-center space-y-2">
              <FileCheck className="w-8 h-8 text-primary mx-auto" />
              <div>
                <p className="text-xs font-semibold text-white">Já realizou o Pix?</p>
                <p className="text-[11px] text-zinc-400">Envie o comprovante bancário para confirmação da baixa.</p>
              </div>

              <label className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-zinc-950 font-semibold text-xs rounded-xl cursor-pointer transition-all">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingReceipt ? "Enviando..." : "Anexar Comprovante"}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={uploadingReceipt}
                  onChange={handleUploadReceipt}
                  className="hidden"
                />
              </label>

              {receiptSuccess && (
                <p className="text-xs text-emerald-400 font-semibold animate-fade-in">
                  ✓ Comprovante enviado com sucesso! Aguarde a validação.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
