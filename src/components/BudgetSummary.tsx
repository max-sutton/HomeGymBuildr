import { useMemo } from 'react'
import { equipmentCatalog } from '../data/equipmentCatalog'
import { CATEGORY_COLORS } from '../types'
import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import './BudgetSummary.css'

interface Props {
  state: GymLayoutState
  dispatch: GymLayoutDispatch
}

export default function BudgetSummary({ state, dispatch: _dispatch }: Props) {
  void _dispatch
  const { room } = state

  const items = useMemo(() => {
    return room.placedEquipment.map((p) => {
      const eq = equipmentCatalog.find((e) => e.id === p.equipmentId)!
      return { ...p, equipment: eq }
    })
  }, [room.placedEquipment])

  const totalCost = useMemo(() => items.reduce((sum, i) => sum + i.equipment.price, 0), [items])

  const overBudget = totalCost > room.budget

  return (
    <div className="budget-summary">
      <h3 className="section-title">Budget</h3>

      <div className="budget-bar-container">
        <div
          className={`budget-bar ${overBudget ? 'over' : ''}`}
          style={{ width: `${Math.min(100, (totalCost / room.budget) * 100)}%` }}
        />
      </div>
      <div className={`budget-numbers ${overBudget ? 'over' : ''}`}>
        ${totalCost.toLocaleString()} / ${room.budget.toLocaleString()}
      </div>

      <h4 className="section-title" style={{ marginTop: 16 }}>
        Placed Items ({items.length})
      </h4>
      <ul className="placed-list">
        {items.map((item) => (
          <li key={item.instanceId} className="placed-item">
            <span
              className="placed-dot"
              style={{ backgroundColor: CATEGORY_COLORS[item.equipment.category] }}
            />
            <span className="placed-name">{item.equipment.name}</span>
            <span className="placed-price">${item.equipment.price}</span>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <div className="empty-message">Drag equipment onto the grid to get started</div>
      )}
    </div>
  )
}
