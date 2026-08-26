/** 대시보드 지표 타일. value 는 이미 포맷된 문자열을 받는다. */
export default function StatCard({ label, value, sub, accent, progress }) {
  return (
    <div className="stat-card" style={accent ? { '--accent': accent } : undefined}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {progress != null && (
        <div className="stat-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  )
}
