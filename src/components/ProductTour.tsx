import { useEffect, useRef, useState } from 'react'
import './ProductTour.css'

const tourSteps = [
  {
    eyebrow: 'Welcome to Vehkix',
    title: 'Your vehicles, all in one place.',
    description: 'Keep your vehicle details, documents, and upcoming maintenance together in a private collection.',
    highlight: 'collection',
  },
  {
    eyebrow: 'Step 1',
    title: 'Add your first vehicle.',
    description: 'Choose Add vehicle to enter its details, add photos, and record important dates. You can edit everything later.',
    highlight: 'add',
  },
  {
    eyebrow: 'Step 2',
    title: 'Find things quickly.',
    description: 'Search your collection or switch between your own vehicles and vehicles shared with you.',
    highlight: 'search',
  },
  {
    eyebrow: 'Step 3',
    title: 'Stay ahead of due dates.',
    description: 'The collection summary shows items due soon. Open it to see the dates and which vehicle needs attention.',
    highlight: 'due',
  },
  {
    eyebrow: 'Step 4',
    title: 'Share when you need to.',
    description: 'Use a vehicle’s actions to share or export its details. You can come back to this tour any time from Help.',
    highlight: 'actions',
  },
] as const

interface ProductTourProps {
  onClose: () => void
}

function ProductTour({ onClose }: ProductTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const step = tourSteps[stepIndex]
  const isLastStep = stepIndex === tourSteps.length - 1

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="product-tour"
      aria-labelledby="product-tour-title"
      aria-describedby="product-tour-description"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="product-tour-heading">
        <span className="product-tour-mark" aria-hidden="true">V</span>
        <span>VEHKIX GUIDE</span>
        <button className="product-tour-close" type="button" aria-label="Close tour" onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="product-tour-content">
        <div className="product-tour-copy">
          <p className="product-tour-eyebrow">{step.eyebrow}</p>
          <h2 id="product-tour-title">{step.title}</h2>
          <p id="product-tour-description">{step.description}</p>
        </div>

        <div className="tour-preview" aria-label="Sample Vehkix collection preview">
          <div className="tour-preview-topbar">
            <span className="tour-preview-logo">VEHKIX</span>
            <span className={`tour-preview-summary${step.highlight === 'due' ? ' is-highlighted' : ''}`}>
              <strong>01</strong> vehicle <i /> <strong>01</strong> due soon
            </span>
          </div>
          <div className="tour-preview-title">
            <div>
              <span>YOUR GARAGE</span>
              <strong>My vehicles</strong>
            </div>
            <span className={`tour-preview-add${step.highlight === 'add' ? ' is-highlighted' : ''}`}>+ Add vehicle</span>
          </div>
          <div className={`tour-preview-search${step.highlight === 'search' ? ' is-highlighted' : ''}`}>
            <span aria-hidden="true" /> Search vehicles
          </div>
          <div className={`tour-preview-card${step.highlight === 'collection' ? ' is-highlighted' : ''}`}>
            <div className="tour-preview-car" aria-hidden="true">
              <span className="tour-car-roof" />
              <span className="tour-car-body" />
              <span className="tour-car-wheel tour-car-wheel-left" />
              <span className="tour-car-wheel tour-car-wheel-right" />
            </div>
            <div className="tour-preview-car-info">
              <span>KA 03 MK 4821</span>
              <strong>Honda City</strong>
              <small>2022 · Petrol</small>
            </div>
            <span className={`tour-preview-menu${step.highlight === 'actions' ? ' is-highlighted' : ''}`}>•••</span>
          </div>
          <span className="tour-preview-caption">SAMPLE COLLECTION · EXAMPLE DATA</span>
        </div>
      </div>

      <div className="product-tour-footer">
        <div className="product-tour-progress" aria-label={`Step ${stepIndex + 1} of ${tourSteps.length}`}>
          {tourSteps.map((tourStep, index) => (
            <span
              className={index === stepIndex ? 'is-current' : index < stepIndex ? 'is-complete' : ''}
              key={tourStep.title}
            />
          ))}
          <span className="product-tour-step-count">{stepIndex + 1} / {tourSteps.length}</span>
        </div>
        <div className="product-tour-actions">
          <button className="product-tour-skip" type="button" onClick={onClose}>Skip tour</button>
          {stepIndex > 0 && (
            <button
              className="product-tour-previous"
              type="button"
              onClick={() => setStepIndex((index) => index - 1)}
            >
              Back
            </button>
          )}
          <button
            className="product-tour-next"
            type="button"
            onClick={() => {
              if (isLastStep) onClose()
              else setStepIndex((index) => index + 1)
            }}
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default ProductTour
