import { useGymLayout } from './hooks/useGymLayout'
import RoomSetup from './components/RoomSetup'
import EquipmentCatalog from './components/EquipmentCatalog'
import FloorPlanGrid from './components/FloorPlanGrid'
import BudgetSummary from './components/BudgetSummary'
import './App.css'

function App() {
  const { state, dispatch } = useGymLayout()

  return (
    <div className="app-layout">
      <aside className="sidebar sidebar-left">
        <RoomSetup state={state} dispatch={dispatch} />
        <EquipmentCatalog state={state} dispatch={dispatch} />
      </aside>

      <main className="main-area">
        <FloorPlanGrid state={state} dispatch={dispatch} />
      </main>

      <aside className="sidebar sidebar-right">
        <BudgetSummary state={state} dispatch={dispatch} />
      </aside>
    </div>
  )
}

export default App
