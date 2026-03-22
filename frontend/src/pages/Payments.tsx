import { useState } from 'react';
import { Send, CreditCard, Copy, ExternalLink, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/SkeletonLoader';
import { usePayments, useCreatePayment, useProcessPayment, useStablecoins } from '../api/hooks';
import { useToast } from '../context/ToastContext';
import { fmtUsdc, truncAddr, fmtDate } from '../lib/format';
import { STATUS_COLORS, STATUS_LABELS } from '../lib/constants';
import type { PaymentStatus } from '../api/types';
import clsx from 'clsx';

const filters: { label: string; value: PaymentStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Queued', value: 'queued' },
  { label: 'Awaiting Liquidity', value: 'awaiting_liquidity' },
  { label: 'Ready', value: 'ready' },
  { label: 'Processing', value: 'processing' },
  { label: 'Sent', value: 'sent' },
  { label: 'Failed', value: 'failed' },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-text-muted hover:text-text-secondary transition-colors"
      aria-label={`Copy ${text}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

export function Payments() {
  const [filter, setFilter] = useState<PaymentStatus | undefined>(undefined);
  const { data: payments, loading, refetch } = usePayments(filter);
  const { mutate: createPayment, loading: creating } = useCreatePayment();
  const { mutate: processPayment, loading: processing } = useProcessPayment();
  const { data: stablecoins } = useStablecoins();
  const { toast } = useToast();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USDC');
  const [reference, setReference] = useState('');
  const [formError, setFormError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const amountNum = parseFloat(amount);
    if (!recipient.trim()) {
      setFormError('Recipient address is required');
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFormError('Amount must be a positive number');
      return;
    }

    try {
      await createPayment({
        recipient: recipient.trim(),
        amount: amountNum,
        currency,
        reference: reference.trim() || undefined,
      });
      setRecipient('');
      setAmount('');
      setReference('');
      toast('Payment created successfully', 'success');
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create payment';
      setFormError(msg);
      toast(msg, 'error');
    }
  };

  const handleProcess = async (id: string) => {
    try {
      await processPayment(id);
      toast('Payment processing initiated', 'success');
      refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to process', 'error');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Payments</h1>
        <p className="mt-1 text-sm text-text-muted">Create and manage stablecoin payments</p>
      </div>

      {/* Create payment form */}
      <Card>
        <CardHeader>
          <CardTitle>New Payment</CardTitle>
        </CardHeader>
        <form onSubmit={handleCreate}>
          {formError && (
            <div
              className="mb-4 rounded-lg border border-status-red/20 bg-status-red-dim px-4 py-3 text-sm text-status-red"
              role="alert"
            >
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4">
              <Input
                label="Recipient"
                placeholder="Solana address..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Input
                label={`Amount (${currency})`}
                type="number"
                step="0.01"
                min="0"
                placeholder="100.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Token</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              >
                {(stablecoins ?? [{ symbol: 'USDC', name: 'USD Coin', mint: '' }]).map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Input
                label="Reference (optional)"
                placeholder="Invoice #123"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" loading={creating} className="w-full">
                <Send size={16} />
                Send
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.value)}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-teal-dim text-teal border border-teal/20'
                : 'bg-bg-card text-text-muted border border-border hover:text-text-secondary',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Payments table */}
      <Card className="overflow-hidden p-0">
        {loading && !payments ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !payments?.length ? (
          <EmptyState
            icon={<CreditCard size={48} />}
            title="No payments"
            description="Create your first payment using the form above."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Recipient
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Tx
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => {
                  const colors = STATUS_COLORS[p.status] ?? STATUS_COLORS.queued;
                  const canProcess = ['queued', 'ready'].includes(p.status);
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-bg-card-hover transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                            colors.bg,
                            colors.text,
                            `border-current/20`,
                          )}
                        >
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-text-primary" title={p.recipient}>
                            {truncAddr(p.recipient, 6)}
                          </span>
                          <CopyButton text={p.recipient} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-mono font-medium text-text-primary">
                          {fmtUsdc(p.amount)} {p.currency}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">
                          {p.reference || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-muted">{fmtDate(p.createdAt)}</span>
                      </td>
                      <td className="px-6 py-4">
                        {p.txSignature ? (
                          <a
                            href={`https://solscan.io/tx/${p.txSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-mono text-teal hover:text-teal-hover transition-colors"
                          >
                            {truncAddr(p.txSignature, 4)}
                            <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canProcess && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleProcess(p.id)}
                            loading={processing}
                          >
                            Process
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
