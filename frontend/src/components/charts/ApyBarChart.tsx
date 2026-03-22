import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { LendingPositionResponse } from '../../api/types';

type ApyBarChartProps = {
  positions: LendingPositionResponse[];
};

export function ApyBarChart({ positions }: ApyBarChartProps) {
  const data = positions.map((p) => ({
    protocol: p.protocol.charAt(0).toUpperCase() + p.protocol.slice(1),
    apy: +(p.apy * 100).toFixed(2),
  }));

  // Deduplicate by protocol (take highest APY)
  const byProtocol = new Map<string, number>();
  for (const d of data) {
    const existing = byProtocol.get(d.protocol);
    if (!existing || d.apy > existing) {
      byProtocol.set(d.protocol, d.apy);
    }
  }
  const chartData = [...byProtocol].map(([protocol, apy]) => ({ protocol, apy }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#14213a" vertical={false} />
        <XAxis
          dataKey="protocol"
          tick={{ fill: '#8ba3c0', fontSize: 12 }}
          axisLine={{ stroke: '#14213a' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#8ba3c0', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0c1525',
            border: '1px solid #14213a',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontSize: '13px',
          }}
          formatter={(value) => [`${value}%`, 'APY']}
        />
        <Bar dataKey="apy" radius={[6, 6, 0, 0]} maxBarSize={48}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={i === 0 ? '#2dd4bf' : '#60a5fa'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
