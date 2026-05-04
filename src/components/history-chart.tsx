import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TokenHistoryPoint } from "../types";

export function HistoryChart({ history }: { history: TokenHistoryPoint[] }) {
  return (
    <div className="chart-shell mt-4">
      <AreaChart data={history} height={260} width={760}>
        <defs>
          <linearGradient id="riskFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#059669" stopOpacity={0.28} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={34} />
        <Tooltip />
        <Area
          type={history.length < 3 ? "linear" : "monotone"}
          dataKey="risk"
          stroke="#059669"
          strokeWidth={3}
          fill="url(#riskFill)"
        />
      </AreaChart>
    </div>
  );
}
