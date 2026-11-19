"use client";

import { useEffect, useState } from "react";
import {
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ChevronLeft,
  DollarSign,
  AlertCircle,
  Eye
} from "lucide-react";
import { supabase, MonthlyStatement, Client, Ride } from "@/lib/supabase";
import { formatCurrency, formatDateBR, cn } from "@/lib/utils";

export default function PaymentAuditPage() {
  const [statements, setStatements] = useState<MonthlyStatement[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de Recusa com Motivo e Modal de Visualização de Comprovante
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [refusalReason, setRefusalReason] = useState("");
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    loadAuditData();
  }, []);

  async function loadAuditData() {
    setLoading(true);
    try {
      const savedDriverId = sessionStorage.getItem("seven_driver_id") || "config-default";

      const [{ data: stmts }, { data: cls }, { data: rds }] = await Promise.all([
        supabase
          .from("monthly_statements")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("clients").select("*"),
        supabase.from("rides").select("*").order("ride_date", { ascending: true }),
      ]);

      // Filtragem por motorista:
      let filteredClients: Client[] = [];
      if (savedDriverId === "config-default") {
        filteredClients = (cls || []).filter((c) => !c.token || !c.token.startsWith("drv_"));
      } else {
        filteredClients = (cls || []).filter((c) => c.token && c.token.startsWith(savedDriverId));
      }

      const clientIds = new Set(filteredClients.map((c) => c.id));
      const filteredStmts = (stmts || []).filter((s) => clientIds.has(s.client_id));
      const filteredRides = (rds || []).filter((r) => clientIds.has(r.client_id));

      setClients(filteredClients);
      setStatements(filteredStmts);
      setRides(filteredRides);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Aprovar Baixa e Fechar Fatura
  async function handleApprovePayment(statementId: string, clientId: string) {
    try {
      const stmt = statements.find((s) => s.id === statementId);

      // 1. Marca fatura como paga
      await supabase
        .from("monthly_statements")
        .update({
          status: "pago",
          paid_at: new Date().toISOString(),
        })
        .eq("id", statementId);

      // 2. Marca todas as corridas atreladas a esta fatura como faturadas
      await supabase
        .from("rides")
        .update({ status: "faturada" })
        .eq("statement_id", statementId);

      // 3. Se foi pagamento em dinheiro ou Pix com saldo/troco a favor do passageiro (ex: "dinheiro:pago=50:devido=30:saldo=20" ou "pix:pago=15:devido=10:saldo=5")
      // Lança uma entrada de saldo/crédito na próxima fatura em aberto
      let surplusAmount = 0;
      let creditOrigin = "Crédito Pago em Dinheiro";
      let creditNotes = `Crédito de troco pago a maior em dinheiro na fatura ${stmt?.reference_month || ""}`;

      if (stmt?.receipt_url) {
        if (stmt.receipt_url.startsWith("dinheiro:") || stmt.receipt_url.startsWith("pix:")) {
          const isPix = stmt.receipt_url.startsWith("pix:");
          const metaStr = isPix && stmt.receipt_url.includes("|") ? stmt.receipt_url.split("|")[0] : stmt.receipt_url;
          const parts = metaStr.split(":");
          const saldoPart = parts.find((p) => p.startsWith("saldo="));
          if (saldoPart) {
            surplusAmount = parseFloat(saldoPart.replace("saldo=", "")) || 0;
            if (isPix) {
              creditOrigin = "Crédito Pago via Pix";
              creditNotes = `Crédito pago a mais via Pix na fatura ${stmt?.reference_month || ""}`;
            }
          }
        }
      }

      // 4. Verifica se já existe uma fatura 'em_aberto' para este cliente
      const { data: existingOpen } = await supabase
        .from("monthly_statements")
        .select("id")
        .eq("client_id", clientId)
        .eq("status", "em_aberto")
        .maybeSingle();

      let targetOpenStmtId = existingOpen?.id;

      // Se não existir, cria a nova fatura em aberto
      if (!targetOpenStmtId) {
        const client = clients.find((c) => c.id === clientId);
        const dueDay = client?.billing_due_day || 10;
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextDue = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;

        const { data: newOpen } = await supabase.from("monthly_statements").insert({
          client_id: clientId,
          reference_month: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`,
          due_date: nextDue,
          total_amount: 0,
          rides_count: 0,
          status: "em_aberto",
        }).select().single();

        if (newOpen) {
          targetOpenStmtId = newOpen.id;
        }
      }

      // 5. Se gerou saldo em dinheiro ou Pix (ex: R$ 5 a mais), cria o registro de crédito no histórico do passageiro
      if (surplusAmount > 0) {
        const nowStr = new Date().toISOString().split("T")[0];
        await supabase.from("rides").insert({
          client_id: clientId,
          statement_id: targetOpenStmtId || null,
          ride_date: nowStr,
          origin: creditOrigin,
          destination: "Saldo para Próximas Corridas",
          amount: -surplusAmount, // Valor negativo abate automaticamente
          status: "faturada",
          created_by: "driver",
          notes: creditNotes,
        });
      }

      loadAuditData();
    } catch (err) {
      console.error(err);
      alert("Erro ao aprovar pagamento.");
    }
  }

  // Recusar Comprovante com Motivo
  async function handleRejectPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStatementId || !refusalReason) return;

    try {
      await supabase
        .from("monthly_statements")
        .update({
          status: "recusado",
          refusal_reason: refusalReason,
        })
        .eq("id", selectedStatementId);

      setRejectModalOpen(false);
      setRefusalReason("");
      setSelectedStatementId(null);
      loadAuditData();
    } catch (err) {
      console.error(err);
      alert("Erro ao recusar comprovante.");
    }
  }

  const pendingPayments = statements.filter((s) => s.status === "pendente_conferencia");
  const processedPayments = statements.filter((s) => s.status === "pago" || s.status === "recusado");

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/admin" className="p-1.5 rounded-lg bg-surface border border-border text-zinc-400 hover:text-white">
              <ChevronLeft className="w-4 h-4" />
            </a>
            <div>
              <h1 className="text-sm font-bold text-white">Conferência de Pagamentos</h1>
              <p className="text-[10px] text-zinc-400">Validação de comprovantes Pix e baixa em faturas</p>
            </div>
          </div>

          <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold">
            {pendingPayments.length} aguardando
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-4 space-y-6">
        {/* FILA DE CONFERÊNCIA */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" /> Comprovantes Pendentes
          </h2>

          {pendingPayments.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 text-xs bg-surface/40 rounded-xl border border-border/40">
              ✓ Nenhum comprovante pendente de conferência no momento.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingPayments.map((stmt) => {
                const client = clients.find((c) => c.id === stmt.client_id);
                const stmtRides = rides.filter((r) => r.statement_id === stmt.id);

                return (
                  <div
                    key={stmt.id}
                    className="bg-surface border border-border rounded-xl p-4 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{client?.name || "Passageiro"}</span>
                          <span className="text-[10px] bg-card px-2 py-0.5 rounded border border-border text-zinc-400">
                            Ref: {stmt.reference_month}
                          </span>
                          <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded font-semibold">
                            {stmtRides.length} corrida(s) selecionada(s)
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          Vencimento da fatura: {formatDateBR(stmt.due_date)}
                        </p>

                        {stmt.receipt_url?.startsWith("dinheiro:") ? (
                          <div className="mt-2 flex flex-col gap-1">
                            <span className="text-[11px] text-emerald-400 font-bold inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg w-fit">
                              💵 Pagamento em Dinheiro Físico
                            </span>
                            <div className="text-[11px] text-zinc-300 bg-card p-2 rounded-lg border border-border/60 max-w-sm space-y-0.5">
                              {(() => {
                                const parts = stmt.receipt_url.split(":");
                                const pago = parts.find((p) => p.startsWith("pago="))?.replace("pago=", "") || "0";
                                const devido = parts.find((p) => p.startsWith("devido="))?.replace("devido=", "") || "0";
                                const saldo = parts.find((p) => p.startsWith("saldo="))?.replace("saldo=", "") || "0";
                                const saldoNum = parseFloat(saldo);

                                return (
                                  <>
                                    <div className="flex justify-between text-zinc-400">
                                      <span>Total das viagens:</span>
                                      <span>{formatCurrency(parseFloat(devido))}</span>
                                    </div>
                                    <div className="flex justify-between font-semibold text-white">
                                      <span>Valor pago em dinheiro:</span>
                                      <span className="text-emerald-400 font-bold">{formatCurrency(parseFloat(pago))}</span>
                                    </div>
                                    {saldoNum > 0 && (
                                      <div className="flex justify-between font-bold text-emerald-300 pt-1 border-t border-border">
                                        <span>Saldo a creditar ao passageiro:</span>
                                        <span>+{formatCurrency(saldoNum)}</span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            <p className="text-[10px] text-zinc-400">
                              Ao confirmar a baixa, o saldo a favor do passageiro será gerado automaticamente para abater as próximas corridas.
                            </p>
                          </div>
                        ) : stmt.receipt_url?.startsWith("pix:") ? (
                          <div className="mt-2 flex flex-col gap-1">
                            <span className="text-[11px] text-primary font-bold inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-lg w-fit">
                              📱 Pagamento via Pix com Valor Maior
                            </span>
                            <div className="text-[11px] text-zinc-300 bg-card p-2 rounded-lg border border-border/60 max-w-sm space-y-0.5">
                              {(() => {
                                const metaStr = stmt.receipt_url?.includes("|") ? stmt.receipt_url.split("|")[0] : stmt.receipt_url;
                                const fileUrl = stmt.receipt_url?.includes("|") ? stmt.receipt_url.split("|")[1] : null;
                                const parts = (metaStr || "").split(":");
                                const pago = parts.find((p) => p.startsWith("pago="))?.replace("pago=", "") || "0";
                                const devido = parts.find((p) => p.startsWith("devido="))?.replace("devido=", "") || "0";
                                const saldo = parts.find((p) => p.startsWith("saldo="))?.replace("saldo=", "") || "0";
                                const saldoNum = parseFloat(saldo);

                                return (
                                  <>
                                    <div className="flex justify-between text-zinc-400">
                                      <span>Total das viagens:</span>
                                      <span>{formatCurrency(parseFloat(devido))}</span>
                                    </div>
                                    <div className="flex justify-between font-semibold text-white">
                                      <span>Valor pago via Pix:</span>
                                      <span className="text-primary font-bold">{formatCurrency(parseFloat(pago))}</span>
                                    </div>
                                    {saldoNum > 0 && (
                                      <div className="flex justify-between font-bold text-emerald-300 pt-1 border-t border-border">
                                        <span>Saldo a creditar ao passageiro:</span>
                                        <span>+{formatCurrency(saldoNum)}</span>
                                      </div>
                                    )}
                                    {fileUrl && (
                                      <div className="pt-1.5 mt-1 border-t border-border">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewReceiptUrl(fileUrl)}
                                          className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                          <span>Ver Comprovante Anexado</span>
                                        </button>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                            <p className="text-[10px] text-zinc-400">
                              Ao confirmar a baixa, o saldo pago a mais no Pix será creditado automaticamente ao passageiro.
                            </p>
                          </div>
                        ) : stmt.receipt_url === "cartao_credito" || stmt.receipt_url?.includes("cartao") ? (
                          <div className="mt-2 flex flex-col gap-1">
                            <span className="text-[11px] text-amber-400 font-bold inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg w-fit">
                              💳 Pagamento via Cartão de Crédito (+10%)
                            </span>
                            <p className="text-[10px] text-zinc-400">
                              O passageiro solicitou o link de pagamento do cartão pelo WhatsApp. Após receber o pagamento, dê a baixa abaixo.
                            </p>
                          </div>
                        ) : stmt.receipt_url ? (
                          <div className="flex items-center gap-3 mt-2">
                            <button
                              type="button"
                              onClick={() => setPreviewReceiptUrl(stmt.receipt_url || null)}
                              className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver Comprovante</span>
                            </button>
                            <a
                              href={stmt.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Abrir original</span>
                            </a>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1 mt-2 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                            💬 Pix informado via WhatsApp / Aguardando conferência bancária
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-0 border-border/60">
                        <div className="text-right">
                          <span className="text-xs text-zinc-400 block">Total a receber:</span>
                          <span className="text-base font-extrabold text-white">
                            {formatCurrency(Number(stmt.total_amount))}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedStatementId(stmt.id);
                              setRejectModalOpen(true);
                            }}
                            className="px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold"
                          >
                            Recusar
                          </button>
                          <button
                            onClick={() => handleApprovePayment(stmt.id, stmt.client_id)}
                            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 text-xs font-bold shadow-md shadow-emerald-500/20"
                          >
                            Dar Baixa
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Detalhamento das corridas inclusas neste acerto parcial/total */}
                    {stmtRides.length > 0 && (
                      <div className="pt-2 border-t border-border/40">
                        <span className="text-[11px] font-semibold text-zinc-300 block mb-1.5">
                          Corridas inclusas neste pagamento:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {stmtRides.map((ride) => (
                            <div
                              key={ride.id}
                              className="text-xs bg-card/60 border border-border/50 rounded-lg px-2.5 py-1.5 flex items-center justify-between"
                            >
                              <div className="truncate pr-2">
                                <span className="font-medium text-white">{formatDateBR(ride.ride_date)}</span>
                                <span className="text-[10px] text-zinc-400 ml-1.5 truncate">
                                  {ride.origin && ride.destination ? `${ride.origin} ➔ ${ride.destination}` : "Viagem"}
                                </span>
                              </div>
                              <span className="font-semibold text-white shrink-0">
                                {formatCurrency(Number(ride.amount))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* HISTÓRICO DE BAIXAS REALIZADAS */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <h2 className="text-sm font-bold text-white mb-3">Histórico Recente</h2>
          {processedPayments.length === 0 ? (
            <p className="text-xs text-zinc-400">Nenhum pagamento processado ainda.</p>
          ) : (
            <div className="space-y-2">
              {processedPayments.slice(0, 10).map((stmt) => {
                const client = clients.find((c) => c.id === stmt.client_id);
                const isPaid = stmt.status === "pago";
                return (
                  <div
                    key={stmt.id}
                    className="bg-surface/50 border border-border/60 rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{client?.name}</span>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            isPaid ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                          )}
                        >
                          {isPaid ? "Pago" : "Recusado"}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">
                        {isPaid && stmt.paid_at ? `Baixa em: ${formatDateBR(stmt.paid_at.split("T")[0])}` : `Motivo: ${stmt.refusal_reason || "Sem motivo"}`}
                      </p>
                    </div>

                    <span className="text-xs font-bold text-white">
                      {formatCurrency(Number(stmt.total_amount))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* MODAL: RECUSAR COMPROVANTE */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Recusar Comprovante</h3>
            <p className="text-xs text-zinc-400">
              Informe o motivo da recusa para que o passageiro possa reenviar o comprovante correto.
            </p>

            <form onSubmit={handleRejectPayment} className="space-y-3">
              <textarea
                required
                rows={3}
                placeholder="Ex: Valor incorreto no comprovante, faltando taxa ou ilegível..."
                value={refusalReason}
                onChange={(e) => setRefusalReason(e.target.value)}
                className="w-full bg-surface border border-border rounded-xl p-3 text-white text-xs focus:border-rose-400 focus:outline-none"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-surface border border-border text-zinc-300 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold"
                >
                  Confirmar Recusa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: VISUALIZAR COMPROVANTE BANCÁRIO */}
      {previewReceiptUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-2xl rounded-2xl p-5 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-white">Comprovante de Pagamento</h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewReceiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg bg-surface border border-border text-zinc-300 hover:text-white text-xs flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Abrir Original</span>
                </a>
                <button
                  onClick={() => setPreviewReceiptUrl(null)}
                  className="text-zinc-400 hover:text-white text-base px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center bg-zinc-950/80 rounded-xl p-2 min-h-[300px]">
              {previewReceiptUrl.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewReceiptUrl}
                  className="w-full h-[65vh] rounded-lg"
                  title="Comprovante PDF"
                />
              ) : (
                <img
                  src={previewReceiptUrl}
                  alt="Comprovante Pix Anexado"
                  className="max-h-[68vh] max-w-full object-contain rounded-lg"
                />
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setPreviewReceiptUrl(null)}
                className="px-4 py-2 rounded-xl bg-surface border border-border hover:bg-zinc-800 text-xs font-semibold text-white transition-all"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
