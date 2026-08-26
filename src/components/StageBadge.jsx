import { getStage } from '../lib/pipeline.js'

/** 단계 색을 입힌 작은 배지. */
export default function StageBadge({ stage }) {
  const s = getStage(stage)
  return (
    <span className="badge" style={{ '--c': s.color }}>
      {s.label}
    </span>
  )
}
