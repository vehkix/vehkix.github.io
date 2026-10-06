import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import brandWordmark from '../../images/logo/vehkix-wordmark-color-transparent.png'
import { useSharePreferences } from '../hooks/useSharePreferences'
import VehicleAccessManager from './VehicleAccessManager'
import type { ShareSection } from './vehicleShare'

interface PrintDocument {
  fileName: string
  vehicleName: string
  printTimestamp: string | null
  sections: ShareSection[]
}

interface VehicleShareDialogProps {
  sections: ShareSection[]
  fileName: string
  userId: string
  vehicleId: string
  mode: 'share' | 'print'
  canManageSharing: boolean
  canGrantEdit: boolean
  canGrantDelete: boolean
  onClose: () => void
}

function getSafeFileName(fileName: string) {
  return Array.from(fileName)
    .filter((character) => character.charCodeAt(0) >= 32 && !/[<>:"/\\|?*]/.test(character))
    .join('')
    .trim() || 'Vehicle record'
}

function VehicleShareDialog({
  sections,
  fileName,
  userId,
  vehicleId,
  mode,
  canManageSharing,
  canGrantEdit,
  canGrantDelete,
  onClose,
}: VehicleShareDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousDocumentTitle = useRef<string | null>(null)
  const allFieldIds = sections.flatMap((section) => section.fields.map((field) => field.id))
  const {
    selectedFieldIds,
    updateSelection,
    loaded: preferencesLoaded,
    saveState: preferenceSaveState,
    error: preferencesError,
  } =
    useSharePreferences(userId, allFieldIds)
  const [printDocument, setPrintDocument] = useState<PrintDocument | null>(null)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    dialog.scrollTop = 0
    return () => dialog.close()
  }, [])

  useEffect(() => {
    if (!printDocument) return

    const setPrintTitle = () => {
      document.title = printDocument.fileName || 'Vehicle record'
    }
    setPrintTitle()
    document.body.classList.add('vehicle-printing')

    const finishPrint = () => {
      if (previousDocumentTitle.current !== null) {
        document.title = previousDocumentTitle.current
        previousDocumentTitle.current = null
      }
      onClose()
    }
    window.addEventListener('beforeprint', setPrintTitle)
    window.addEventListener('afterprint', finishPrint, { once: true })

    const print = async () => {
      const logo = document.querySelector<HTMLImageElement>('.vehicle-print-logo img')

      if (logo) {
        if (!logo.complete) {
          await new Promise<void>((resolve) => {
            logo.addEventListener('load', () => resolve(), { once: true })
            logo.addEventListener('error', () => resolve(), { once: true })
          })
        }

        if (logo.decode) {
          try {
            await logo.decode()
          } catch {
            // Continue printing even if decode is unavailable
          }
        }
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          dialogRef.current?.close()
          setPrintTitle()
          window.print()
        })
      })
    }

    void print()

    return () => {
      window.removeEventListener('beforeprint', setPrintTitle)
      window.removeEventListener('afterprint', finishPrint)
      document.body.classList.remove('vehicle-printing')
      if (previousDocumentTitle.current !== null) {
        document.title = previousDocumentTitle.current
        previousDocumentTitle.current = null
      }
    }
  }, [onClose, printDocument])

  function handlePrint() {
    const availableFields = sections.flatMap((section) => section.fields)
    const selectedTitle = availableFields.find((field) => field.id === 'vehicle-title')
    const printFileName = getSafeFileName(fileName)
    if (previousDocumentTitle.current === null) {
      previousDocumentTitle.current = document.title
    }
    document.title = printFileName
    const printTimestamp = selectedFieldIds.includes('print-timestamp')
      ? new Date().toISOString()
      : null
    setPrintDocument({
      fileName: printFileName,
      vehicleName: selectedTitle?.value ?? fileName,
      printTimestamp,
      sections: sections
        .map((section) => ({
          ...section,
          fields: section.fields.filter((field) => (
            field.id !== 'vehicle-title'
            && field.id !== 'print-timestamp'
            && selectedFieldIds.includes(field.id)
          )),
        }))
        .filter((section) => section.fields.length > 0),
    })
  }

  function requestExit() {
    if (mode === 'share') {
      onClose()
      return
    }
    setShowExitConfirm(true)
  }

  return (
    <>
      <dialog
        ref={dialogRef}
        className="vehicle-share-dialog"
        aria-labelledby="vehicle-share-title"
        onCancel={(event) => { event.preventDefault(); requestExit() }}
        onClick={(event) => {
          if (event.target === event.currentTarget) requestExit()
        }}
      >
        <div className="vehicle-share-content">
          <header className="vehicle-share-heading">
            <p className="eyebrow">{mode === 'share' ? 'SHARE VEHICLE' : 'PRINT VEHICLE'}</p>
            <h2 id="vehicle-share-title">{mode === 'share' ? 'Manage vehicle access' : 'Choose details to print'}</h2>
            <p>
              {mode === 'share'
                ? 'Share this vehicle with another Vehkix user. Find them by username or registered email, then choose the access to grant.'
                : 'Choose the details for a print-ready copy. Select “Save as PDF” in the print dialog to save it to your device.'}
            </p>
          </header>
          {mode === 'share' && canManageSharing && (
            <VehicleAccessManager
              vehicleId={vehicleId}
              canGrantEdit={canGrantEdit}
              canGrantDelete={canGrantDelete}
            />
          )}
          {mode === 'print' && (
            <>
              <div className="vehicle-share-controls">
                <span>{selectedFieldIds.length} of {allFieldIds.length} selected</span>
                <button type="button" className="text-action" disabled={!preferencesLoaded} onClick={() => updateSelection(() => allFieldIds)}>
                  Select all
                </button>
                <button type="button" className="text-action" disabled={!preferencesLoaded} onClick={() => updateSelection(() => [])}>
                  Clear all
                </button>
                <span className="vehicle-share-save-status" role="status" aria-live="polite">
                  {preferencesError
                    ? 'Choices not saved'
                    : !preferencesLoaded || preferenceSaveState === 'saving'
                      ? 'Saving choices…'
                      : 'Choices saved'}
                </span>
              </div>
              {preferencesError && <p className="vehicle-share-preferences-error" role="alert">{preferencesError}</p>}
              <div className="vehicle-share-sections">
                {sections.map((section) => (
                  <fieldset className="vehicle-share-section" key={section.title}>
                    <legend>{section.title}</legend>
                    {section.fields.map((field) => (
                      <label className="vehicle-share-field" key={field.id}>
                        <input
                          type="checkbox"
                          checked={selectedFieldIds.includes(field.id)}
                          disabled={!preferencesLoaded}
                          onChange={(event) => updateSelection((current) => event.target.checked
                            ? current.includes(field.id) ? current : [...current, field.id]
                            : current.filter((id) => id !== field.id))}
                        />
                        <span>
                          <strong>{field.label}</strong>
                          <small>{field.imageUrl ? 'Photo will be included' : field.value}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </>
          )}
          <footer className="vehicle-share-actions">
            <button type="button" className="text-action" onClick={requestExit}>Close</button>
            {mode === 'print' && (
              <button
                type="button"
                className="primary-action"
                disabled={!preferencesLoaded || selectedFieldIds.length === 0}
                onClick={handlePrint}
              >
                Print / Save PDF
              </button>
            )}
          </footer>
        </div>
        {showExitConfirm && (
          <div className="vehicle-share-exit-backdrop">
            <section
              className="vehicle-share-exit-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="vehicle-share-exit-title"
              aria-describedby="vehicle-share-exit-description"
            >
              <h3 id="vehicle-share-exit-title">Close this window?</h3>
              <p id="vehicle-share-exit-description">
                Your current {mode === 'share' ? 'sharing' : 'print'} screen will close. Are you sure?
              </p>
              <div className="vehicle-share-exit-actions">
                <button type="button" className="text-action" autoFocus onClick={() => setShowExitConfirm(false)}>
                  Keep open
                </button>
                <button type="button" className="primary-action" onClick={onClose}>
                  Close
                </button>
              </div>
            </section>
          </div>
        )}
      </dialog>
      {printDocument && (
        createPortal(
        <article className="vehicle-print-sheet" aria-hidden="true">
          <header>
            <div className="vehicle-print-logo">
              <img src={brandWordmark} alt="Vehkix" />
            </div>
            <div className="vehicle-print-heading">
              {printDocument.vehicleName && <h1>{printDocument.vehicleName}</h1>}
              {printDocument.printTimestamp && (
                <time className="vehicle-print-timestamp" dateTime={printDocument.printTimestamp}>
                  Printed {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                    .format(new Date(printDocument.printTimestamp))}
                </time>
              )}
            </div>
          </header>
          {printDocument.sections.map((section) => (
            <section
              className={`vehicle-print-section${section.title === 'Notes'
                ? ' vehicle-print-notes'
                : section.title === 'Photos' ? ' vehicle-print-photos' : ''}`}
              key={section.title}
            >
              <h2>{section.title}</h2>
              <dl>
                {section.fields.map((field) => (
                  <div className="vehicle-print-field" key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.imageUrl
                        ? <img src={field.imageUrl} alt={field.label} />
                        : field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </article>
        , document.body,
        )
      )}
    </>
  )
}

export default VehicleShareDialog
