import { useState, useMemo } from 'react'
import { equipmentCatalog } from '../data/equipmentCatalog'
import { useDragAndDrop } from '../hooks/useDragAndDrop'
import { CATEGORY_COLORS } from '../types'
import type { EquipmentCategory } from '../types'
import type { GymLayoutState, GymLayoutDispatch } from '../hooks/useGymLayout'
import './EquipmentCatalog.css'

interface Props {
  state: GymLayoutState
  dispatch: GymLayoutDispatch
}

const categories: EquipmentCategory[] = ['Strength', 'Cardio', 'Storage', 'Accessories']

export default function EquipmentCatalog({ state: _state, dispatch: _dispatch }: Props) {
  void _state
  void _dispatch
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<EquipmentCategory | 'All'>('All')
  const { handleDragStart } = useDragAndDrop()

  const filtered = useMemo(() => {
    return equipmentCatalog.filter((eq) => {
      const matchesSearch = eq.name.toLowerCase().includes(search.toLowerCase())
      const matchesCategory = filterCategory === 'All' || eq.category === filterCategory
      return matchesSearch && matchesCategory
    })
  }, [search, filterCategory])

  return (
    <div className="equipment-catalog">
      <h3 className="section-title">Equipment</h3>
      <input
        type="text"
        placeholder="Search equipment..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="catalog-search"
      />
      <div className="category-filters">
        <button
          className={filterCategory === 'All' ? 'active' : ''}
          onClick={() => setFilterCategory('All')}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={filterCategory === cat ? 'active' : ''}
            style={{ '--cat-color': CATEGORY_COLORS[cat] } as React.CSSProperties}
            onClick={() => setFilterCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <ul className="catalog-list">
        {filtered.map((eq) => (
          <li
            key={eq.id}
            className="catalog-item"
            draggable
            onDragStart={(e) => handleDragStart(e, { equipmentId: eq.id })}
            style={{ borderLeftColor: CATEGORY_COLORS[eq.category] }}
          >
            <div className="item-name">{eq.name}</div>
            <div className="item-meta">
              {eq.width}×{eq.depth} ft &middot; ${eq.price}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
