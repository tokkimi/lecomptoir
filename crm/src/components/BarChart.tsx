"use client";
import { useState } from "react";

export type Bar = { key: string; label: string; value: number; display: string; sub?: string; dim?: boolean };

/** Histogramme une série (bleu). Survol = infobulle ; données également disponibles en tableau. */
export function BarChart({ data, height = 220, ariaLabel, tickEvery, unit = "eur" }: { data: Bar[]; height?: number; ariaLabel: string; tickEvery?: number; unit?: "eur" | "count" }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, padL = 46, padB = 24, padT = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max / 4, unit === "count" ? 1 : 100);
  const top = Math.ceil(max / step) * step;
  const innerW = W - padL, innerH = H - padB - padT;
  const bw = innerW / Math.max(1, data.length);
  const gap = Math.min(2, bw * 0.2);
  const every = tickEvery ?? Math.max(1, Math.ceil(data.length / 10));
  const y = (v: number) => padT + innerH - (v / top) * innerH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const fmtTick = (v: number) => unit === "count" ? v.toLocaleString("fr-FR")
    : v >= 100000 ? `${(v / 100000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€` : `${Math.round(v / 100)} €`;
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-l" x1={padL} x2={W} y1={y(t)} y2={y(t)} />
            <text className="axis-t" x={padL - 8} y={y(t) + 4} textAnchor="end">{fmtTick(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * bw;
          const bh = Math.max(0, y(0) - y(d.value));
          const r = Math.min(4, (bw - gap) / 2, bh);
          const w = Math.max(1, bw - gap);
          return (
            <g key={d.key} className="col" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1}>
              <rect className="hit" x={x} y={padT} width={bw} height={innerH} />
              {bh > 0 && <path className={"bar" + (d.dim ? " dim" : "") } d={roundedTop(x + gap / 2, y(d.value), w, bh, r)} style={hover === i ? { fill: "var(--blue-deep)" } : undefined} />}
              {i % every === 0 && <text className="axis-t" x={x + bw / 2} y={H - 6} textAnchor="middle">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="tip" style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%`, top: `${(y(h.value) / H) * 100}%` }}>
          <b>{h.display}</b>{h.sub ?? h.label}
        </div>
      )}
      <details className="small muted" style={{ marginTop: 6 }}>
        <summary>Voir les données</summary>
        <div className="tbl-wrap"><table className="t"><tbody>
          {data.map((d) => <tr key={d.key}><td>{d.sub ?? d.label}</td><td className="r">{d.display}</td></tr>)}
        </tbody></table></div>
      </details>
    </div>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function niceStep(raw: number, min: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, min))));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
