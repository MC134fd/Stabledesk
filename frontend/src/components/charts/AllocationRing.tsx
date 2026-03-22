import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

type AllocationRingProps = {
  liquid: number;
  deployed: number;
};

export function AllocationRing({ liquid, deployed }: AllocationRingProps) {
  const total = liquid + deployed;
  const deployedPct = total > 0 ? Math.round((deployed / total) * 100) : 0;

  const data = [
    { name: 'Deployed', value: deployed, color: '#60a5fa' },
    { name: 'Liquid', value: liquid, color: '#2dd4bf' },
  ];

  // Don't render empty chart
  if (total === 0) {
    data[0].value = 0;
    data[1].value = 1;
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={95}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-bold text-text-primary font-mono">
          {deployedPct}%
        </span>
        <span className="text-xs text-text-muted mt-1">Deployed</span>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs text-text-secondary">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
