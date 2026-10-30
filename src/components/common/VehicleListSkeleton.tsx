import './VehicleListSkeleton.css'

function VehicleListSkeleton() {
  return (
    <div className="vehicle-list-skeleton" role="status" aria-label="Loading vehicles" aria-busy="true">
      <span className="visually-hidden">Loading your vehicle collection…</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div className="vehicle-skeleton-row" key={index} aria-hidden="true">
          <span className="vehicle-skeleton-image" />
          <span className="vehicle-skeleton-copy">
            <span />
            <span />
            <span />
          </span>
          <span className="vehicle-skeleton-meta" />
          <span className="vehicle-skeleton-meta" />
        </div>
      ))}
    </div>
  )
}

export default VehicleListSkeleton
