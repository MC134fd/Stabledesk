import { Card, CardHeader, CardTitle } from './ui/Card';
import { fmtUsdc } from '../lib/format';

const STABLECOIN_ORDER = ['USDC', 'USDT', 'USDS', 'PYUSD', 'USDG', 'USD1'] as const;

const STABLECOIN_NAMES: Record<string, string> = {
  USDC: 'USD Coin',
  USDT: 'Tether USD',
  USDS: 'Sky Dollar',
  PYUSD: 'PayPal USD',
  USDG: 'Global Dollar',
  USD1: 'USD1',
};

export function BalanceSheet({ balances }: { balances: Record<string, number> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stablecoin Balances</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="pb-2 font-medium">Token</th>
              <th className="pb-2 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {STABLECOIN_ORDER.map((symbol) => {
              const balance = balances[symbol] ?? 0;
              return (
                <tr key={symbol} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-text-primary">{symbol}</span>
                      <span className="text-text-muted text-xs">{STABLECOIN_NAMES[symbol]}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right font-mono text-text-primary">
                    {fmtUsdc(balance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
