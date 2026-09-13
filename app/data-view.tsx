import type { CanvasElement } from './document-model.ts';
const PALETTE = ['#6d5dfc', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];
export function chartSeries(chart: NonNullable<CanvasElement['chart']>) { return chart.series?.length ? chart.series : [{ name: chart.title, values: chart.values }]; }
export function chartColors(chart: NonNullable<CanvasElement['chart']>, count: number): string[] {
  return chart.colors?.length ? chart.colors : Array.from({ length: count }, (_, i) => PALETTE[i % PALETTE.length]);
}
export function DataView({item}:{item:CanvasElement}) {
  if(item.type==='table'&&item.table)return <table className="slide-table" style={{fontSize:item.style.fontSize}}><tbody>{item.table.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=>r===0&&item.table!.header?<th key={c} scope="col">{cell}</th>:<td key={c}>{cell}</td>)}</tr>)}</tbody></table>;
  if(!item.chart)return null;
  const {labels,values,title,kind}=item.chart;
  const series=chartSeries(item.chart),colors=chartColors(item.chart,series.length);
  const lo=Math.min(0,...series.flatMap(s=>s.values)),hi=Math.max(1,...series.flatMap(s=>s.values)),range=hi-lo;
  const yy=(v:number)=>240-(v-lo)/range*190;const step=520/labels.length;
  return <svg className="slide-chart" viewBox="0 0 600 320" role="img" aria-label={`${title}: ${labels.map((label,i)=>`${label} ${values[i]}`).join(', ')}`}>
    <text x="300" y="28" textAnchor="middle" fontSize="20" fontWeight="700" fill={item.style.color}>{title}</text>
    {item.chart.grid===false?'':[0,1,2,3,4,5].map((t)=>{const v=lo+range*t/5;return <g key={t}><line x1="50" y1={yy(v)} x2="580" y2={yy(v)} stroke={v===0?'#94a3b8':'#e2e8f0'}/><text x="44" y={yy(v)+4} textAnchor="end" fontSize="10" fill="#64748b">{hi===lo?v:Number(v.toFixed(Math.abs(hi)<10?1:0))}</text></g>;})}
    {series.map((serie,si)=>{const fill=colors[si%colors.length],w=step*.64/series.length;
      return <g key={si}>{kind==='bar'
        ?serie.values.map((v,i)=>{const x=50+step*(i+.5),offset=(si-(series.length-1)/2)*(w+2);return <rect key={i} x={x-w/2+offset} y={Math.min(yy(0),yy(v))} width={w} height={Math.max(1,Math.abs(yy(v)-yy(0)))} rx="2" fill={fill}/>;})
        :<g><polyline points={serie.values.map((v,i)=>`${50+step*(i+.5)},${yy(v)}`).join(' ')} fill="none" stroke={fill} strokeWidth="3"/>{serie.values.map((v,i)=><circle key={i} cx={50+step*(i+.5)} cy={yy(v)} r="4" fill={fill}/>)}</g>}</g>;})}
    {series.map((serie,si)=><text key={si} x={100+si*60} y="310" fontSize="12" fill={colors[si%colors.length]}>■ {serie.name}</text>)}
    {labels.map((label,i)=><text key={i} x={50+step*(i+.5)} y="285" textAnchor="middle" fontSize="13" fill={item.style.color}>{label}</text>)}
  </svg>;
}
