import { useEffect, useRef, useState } from 'react'
import './ProductTour.css'

const tourSteps = [
  {
    eyebrow: 'Welcome to Vehkix',
    title: 'Your vehicles, all in one place.',
    description: 'Keep photos, vehicle details, service records and renewal dates together in your private collection.',
    highlight: 'collection',
    notice: 'Look at your vehicle card',
  },
  {
    eyebrow: 'Step 1',
    title: 'Add your first vehicle.',
    description: 'Choose Add vehicle to enter its details, add photos, and record important dates. You can edit everything later.',
    highlight: 'add',
    notice: 'Tap “+ Add vehicle”',
  },
  {
    eyebrow: 'Step 2',
    title: 'Find things quickly.',
    description: 'Search your collection or switch between your own vehicles and vehicles shared with you.',
    highlight: 'search',
    notice: 'Try the search field',
  },
  {
    eyebrow: 'Step 3',
    title: 'Stay ahead of due dates.',
    description: 'Track service and mileage, PUCC, insurance, tax and registration dates. The collection summary shows what needs attention soon.',
    highlight: 'due',
    notice: 'Check “due soon” here',
  },
  {
    eyebrow: 'Step 4',
    title: 'Share with confidence.',
    description: 'Choose which details trusted people can view or manage. You stay in control of your vehicle and its access.',
    highlight: 'sharing',
    notice: 'Use Shared details',
  },
  {
    eyebrow: 'Step 5',
    title: 'Handle share requests.',
    description: 'New vehicle shares appear in the notification bell. Review each request and accept or decline it.',
    highlight: 'requests',
    notice: 'Review requests in Notifications',
  },
  {
    eyebrow: 'Step 6',
    title: 'Manage each vehicle.',
    description: 'Use its actions to edit, share selected details, transfer when permitted, or create a print-ready PDF.',
    highlight: 'actions',
    notice: 'Open the ••• actions menu',
  },
  {
    eyebrow: 'Step 7',
    title: 'Make Vehkix yours.',
    description: 'Update your profile photo, username and password, or switch between light and dark themes.',
    highlight: 'profile',
    notice: 'Open your profile',
  },
  {
    eyebrow: 'Step 8',
    title: 'Explore and find help.',
    description: 'The footer links to About Vehkix and Emergency contacts, with Kerala-priority and India-wide helplines you can tap to call.',
    highlight: 'emergency',
    notice: 'Explore the footer links',
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
          <div className={`tour-preview-callout tour-preview-callout-${step.highlight}`}>
            <span className="tour-preview-callout-dot" aria-hidden="true" />
            <span>{step.notice}</span>
            <i aria-hidden="true" />
          </div>
          {step.highlight === 'profile' ? (
            <div className="tour-profile-preview">
              <div className="tour-profile-avatar">A</div>
              <div>
                <span>YOUR ACCOUNT</span>
                <strong>Alex Morgan</strong>
                <small>Profile settings</small>
              </div>
              <b>✎</b>
            </div>
          ) : step.highlight === 'emergency' ? (
            <div className="tour-emergency-preview">
              <span>ABOUT & EMERGENCY CONTACTS</span>
              <strong>Useful links in the footer</strong>
              <p>Learn more about Vehkix</p>
              <p>Kerala-priority contacts</p>
              <p>India-wide helplines</p>
              <small>Tap a number to call</small>
            </div>
          ) : step.highlight === 'requests' ? (
            <div className="tour-emergency-preview">
              <span>NOTIFICATIONS</span>
              <strong>Review a vehicle share</strong>
              <p>A person shared a vehicle with you</p>
              <small>Accept or decline the request</small>
            </div>
          ) : (
          <>
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
          {step.highlight === 'sharing' && (
            <div className="tour-sharing-preview">
              <span>SHARED DETAILS</span>
              <strong>2 people can view your vehicle</strong>
              <i>Manage access →</i>
            </div>
          )}
          <span className="tour-preview-caption">SAMPLE COLLECTION · EXAMPLE DATA</span>
          </>
          )}
        </div>
      </div>

      <div className="product-tour-footer">
        <div className="product-tour-progress" aria-live="polite">
          Step {stepIndex + 1} of {tourSteps.length}
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
