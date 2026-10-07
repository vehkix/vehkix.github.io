import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import brandMark from '../images/logo/vehkix-mark-color.png'
import brandWordmark from '../images/logo/vehkix-wordmark-color-transparent.png'
import { supabaseClient } from './lib/supabase'
import { useAdminAccess } from './hooks/useAdminAccess'
import { useAuthSession } from './hooks/useAuthSession'
import { useMyVehicles } from './hooks/useMyVehicles'
import { useAdminUserManagement } from './hooks/useAdminUserManagement'
import { useVehicleFieldSettings } from './hooks/useVehicleFieldSettings'
import { getUsernameInitials } from './lib/profile'
import { formatDate, getDueItems, getVehicleName, toVehicleDraft } from './lib/vehicle'
import { vehicleFieldDefinitions } from './lib/vehicleSettings'
import type { AdminSection } from './types/admin'
import type { Vehicle, VehicleDraft } from './types/vehicle'
import './styles/page.css'

const AdminPanel = lazy(() => import('./components/AdminPanel'))
const AboutPage = lazy(() => import('./components/AboutPage'))
const AuthPanel = lazy(() => import('./components/AuthPanel'))
const NotificationBell = lazy(() => import('./components/NotificationBell'))
const PasswordRecoveryPanel = lazy(() => import('./components/PasswordRecoveryPanel'))
const ProfilePanel = lazy(() => import('./components/ProfilePanel'))
const VehicleForm = lazy(() => import('./components/VehicleForm'))
const VehicleList = lazy(() => import('./components/VehicleList'))

function App() {
  const [activeView, setActiveView] = useState<'collection' | 'admin'>(() =>
    window.location.hash === '#admin' ? 'admin' : 'collection',
  )
  const [showAbout, setShowAbout] = useState(() => window.location.hash === '#about-vehkix')
  const [query, setQuery] = useState('')
  const [showDueVehicles, setShowDueVehicles] = useState(false)
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(null)
  const [collectionSectionPreference, setCollectionSectionPreference] = useState<{
    userId: string
    section: 'own' | 'shared'
  } | null>(null)
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [adminSection, setAdminSection] = useState<AdminSection>('overview')
  const [showProfile, setShowProfile] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [selectedAdminOwnerId, setSelectedAdminOwnerId] = useState('')
  const [adminRefreshToken, setAdminRefreshToken] = useState(0)
  const [profileAvatarRevision, setProfileAvatarRevision] = useState(0)
  const [profileAvatar, setProfileAvatar] = useState<{ userId: string; url: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const {
    session,
    isReady: authReady,
    error: authError,
    profileSyncError,
    isPasswordRecovery,
    submitAuth,
    requestPasswordReset,
    updatePassword,
    updateUsername,
    signOut,
  } = useAuthSession()
  const { isAdmin, loading: adminAccessLoading, error: adminAccessError } = useAdminAccess(session)
  const {
    requests: deletionRequests,
    loading: deletionRequestsLoading,
    error: deletionRequestsError,
    loadRequests: loadDeletionRequests,
    deleteAccount,
    resolveRequest,
  } = useAdminUserManagement(isAdmin)
  const {
    settings: fieldSettings,
    loading: fieldSettingsLoading,
    error: fieldSettingsError,
    updateSetting: updateFieldSetting,
  } = useVehicleFieldSettings(session?.user.id, isAdmin)
  const adminView = activeView === 'admin' && isAdmin && !isPasswordRecovery && !showProfile
  const collectionView = !isPasswordRecovery && !showProfile && (activeView !== 'admin'
    || (Boolean(session) && !adminAccessLoading && !isAdmin))
  const {
    vehicles: vehicleRecords,
    loading: myVehiclesLoading,
    error: myVehiclesError,
    deleteBusy,
    userCount,
    accounts,
    saveVehicle,
    deleteVehicle,
  } = useMyVehicles(session, adminView, adminRefreshToken)

  useEffect(() => {
    if (!supabaseClient || !session?.user.id) return
    const client = supabaseClient
    const activeUserId = session.user.id
    let current = true

    void Promise.resolve(client
      .from('profiles')
      .select('avatar_path')
      .eq('id', activeUserId)
      .single())
      .then(async ({ data, error }) => {
        if (!current) return
        if (error) {
          setActionError('Could not load your profile photo. Run the latest user-account SQL setup.')
          return
        }
        if (!data.avatar_path) {
          setProfileAvatar(null)
          return
        }
        const { data: signedData, error: signedError } = await client.storage
          .from('user-profile-images')
          .createSignedUrl(data.avatar_path, 60 * 60 * 24)
        if (!current) return
        if (signedError) {
          setActionError('Could not load your profile photo from Supabase Storage.')
          return
        }
        setProfileAvatar({ userId: activeUserId, url: signedData.signedUrl })
      })
      .catch(() => {
        if (current) setActionError('Could not load your profile photo from Supabase.')
      })

    return () => { current = false }
  }, [session?.user.id, profileAvatarRevision])

  useEffect(() => {
    function syncViewFromHash() {
      setActiveView(window.location.hash === '#admin' ? 'admin' : 'collection')
      setShowAbout(window.location.hash === '#about-vehkix')
      setShowProfile(false)
    }

    window.addEventListener('hashchange', syncViewFromHash)
    return () => window.removeEventListener('hashchange', syncViewFromHash)
  }, [])

  useEffect(() => {
    if (!authReady || !session || adminAccessLoading || isAdmin) return
    if (window.location.hash !== '#admin') return

    window.location.replace('#top')
  }, [authReady, session, adminAccessLoading, isAdmin])

  function navigateToView(view: 'collection' | 'admin') {
    setActiveView(view)
    setShowAbout(false)
    window.location.hash = view === 'admin' ? 'admin' : 'top'
  }

  function handleAdminSectionChange(section: AdminSection) {
    setAdminSection(section)
    setQuery('')
    if (section === 'deletion-requests') void loadDeletionRequests()
  }

  async function handleVehicleSave(
    draft: VehicleDraft,
    images: File[],
    retainedImagePaths: string[],
    primaryImageIndex: number | null,
  ) {
    const message = await saveVehicle(
      draft,
      images,
      retainedImagePaths,
      primaryImageIndex,
      editingVehicle?.id,
    )
    if (!message) {
      setShowVehicleForm(false)
      setEditingVehicle(null)
    }
    return message
  }

  async function handleDeleteVehicle(vehicle: Vehicle) {
    setActionError(await deleteVehicle(vehicle))
  }

  async function handleSignOut() {
    setActionError(await signOut())
    setShowProfile(false)
    setShowVehicleForm(false)
    setEditingVehicle(null)
    navigateToView('collection')
  }

  async function handleDeleteAccount(account: typeof accounts[number]) {
    const message = await deleteAccount(account.id, account.username)
    if (message) {
      if (message !== 'Account deletion was cancelled.') setActionError(message)
      return
    }
    if (selectedAdminOwnerId === account.id) setSelectedAdminOwnerId('')
    setAdminRefreshToken((token) => token + 1)
    setActionError(null)
  }

  async function handleResolveDeletionRequest(
    request: (typeof deletionRequests)[number],
    approve: boolean,
  ) {
    const message = await resolveRequest(request, approve)
    if (message) {
      if (message !== 'Account deletion was cancelled.') setActionError(message)
      return
    }
    setAdminRefreshToken((token) => token + 1)
    setActionError(null)
  }

  const visibleDetailFields = new Set(
    vehicleFieldDefinitions
      .filter((field) => fieldSettings[field.key].show_in_details)
      .map((field) => field.key),
  )
  const filteredVehicles = vehicleRecords.filter((vehicle) =>
    (!adminView || !selectedAdminOwnerId || vehicle.user_id === selectedAdminOwnerId)
    &&
    [
      fieldSettings.id.show_in_details ? vehicle.id : null,
      fieldSettings.vehicle_number.show_in_details ? vehicle.vehicle_number : null,
      fieldSettings.vehicle_title.show_in_details ? getVehicleName(
        fieldSettings.company.show_in_details ? vehicle.company : null,
        fieldSettings.model.show_in_details ? vehicle.model : null,
      ) : null,
      fieldSettings.model.show_in_details ? vehicle.model : null,
      fieldSettings.company.show_in_details ? vehicle.company : null,
      !adminView && vehicle.user_id !== session?.user.id ? vehicle.owner_username : null,
      adminView ? vehicle.owner_username : null,
      adminView ? vehicle.owner_email : null,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const ownVehicles = vehicleRecords.filter((vehicle) => vehicle.user_id === session?.user.id)
  const sharedVehicles = vehicleRecords.filter((vehicle) => vehicle.user_id !== session?.user.id)
  const filteredOwnVehicles = filteredVehicles.filter((vehicle) => vehicle.user_id === session?.user.id)
  const filteredSharedVehicles = filteredVehicles.filter((vehicle) => vehicle.user_id !== session?.user.id)
  const activeCollectionSection = collectionSectionPreference
    && collectionSectionPreference.userId === session?.user.id
    && (collectionSectionPreference.section === 'own' || sharedVehicles.length > 0)
    ? collectionSectionPreference.section
    : ownVehicles.length === 0 && sharedVehicles.length > 0
      ? 'shared'
      : 'own'
  const displayedCollectionVehicles = activeCollectionSection === 'own'
    ? filteredOwnVehicles
    : filteredSharedVehicles
  const matchingOwnerIds = new Set(filteredVehicles.map((vehicle) => vehicle.user_id).filter(Boolean))
  const searchTerm = query.trim().toLowerCase()
  const filteredAccounts = accounts.filter((account) => (
    !searchTerm
    || account.username.toLowerCase().includes(searchTerm)
    || account.email?.toLowerCase().includes(searchTerm)
    || matchingOwnerIds.has(account.id)
  ))
  const dueVehicles = vehicleRecords
    .map((vehicle) => ({
      vehicle,
      items: getDueItems(vehicle, visibleDetailFields).filter((item) => item.days <= 10),
    }))
    .filter(({ items }) => items.length > 0)
  const attentionCount = dueVehicles.length


  const username = session?.user.user_metadata.username || session?.user.email || ''
  const connectionState = !supabaseClient ? 'error' : !authReady ? 'connecting' : 'live'

  useEffect(() => {
    if (!profileMenuOpen) return

    function closeOnOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setProfileMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileMenuOpen])

  return (
    <main className="page-shell">
      <header className="topbar">
        {(session || showAbout) && (
          <span className="wordmark"><img src={brandMark} alt="Vehkix" /></span>
        )}
        <div className="topbar-actions">
          <span className="data-status" data-state={connectionState}>
            <span aria-hidden="true" />
            {!supabaseClient ? 'SETUP REQUIRED' : !authReady ? 'CONNECTING' : 'CONNECTED'}
          </span>
          {session && (
            <>
              <Suspense fallback={null}>
                <NotificationBell
                  userId={session.user.id}
                  onOpenDeletionRequests={() => {
                    setShowProfile(false)
                    navigateToView('admin')
                    handleAdminSectionChange('deletion-requests')
                  }}
                  onVehicleShareResponded={() => {
                    setAdminRefreshToken((token) => token + 1)
                  }}
                />
              </Suspense>
              {isAdmin && (
                <button
                  className="text-action admin-view-toggle"
                  type="button"
                  aria-pressed={adminView}
                  onClick={() => {
                    setShowProfile(false)
                    navigateToView(adminView ? 'collection' : 'admin')
                    setAdminSection('overview')
                    setQuery('')
                  }}
                >
                  {adminView ? 'My collection' : 'Admin panel'}
                </button>
              )}
              {showProfile && (
                <button className="topbar-home-button" type="button" onClick={() => setShowProfile(false)}>
                  Home
                </button>
              )}
              <div className="profile-menu" ref={profileMenuRef}>
                <button
                  className="profile-menu-trigger"
                  type="button"
                  aria-label="Open profile menu"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setProfileMenuOpen((open) => !open)}
                >
                  <span className="profile-tab-avatar" aria-hidden="true">
                    {profileAvatar?.userId === session.user.id
                      ? <img src={profileAvatar.url} alt="" />
                      : getUsernameInitials(username)}
                  </span>
                </button>
                {profileMenuOpen && (
                  <div className="profile-menu-popover" role="menu" aria-label="Profile options">
                    <span className="profile-menu-username" role="presentation">{username}</span>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowAbout(false)
                        setShowProfile(true)
                        setShowVehicleForm(false)
                        setEditingVehicle(null)
                        setProfileMenuOpen(false)
                        if (window.location.hash !== '#top') {
                          window.history.replaceState(null, '', `${window.location.pathname}#top`)
                        }
                      }}
                    >
                      Profile
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        void handleSignOut()
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      <section className="fleet" id="top" aria-labelledby="page-title" hidden={showAbout}>
        <div className="page-heading">
          <div>
            <h1 id="page-title">
              {session
                ? showProfile
                  ? 'Profile'
                  : adminView
                  ? adminSection === 'vehicles'
                    ? 'Vehicles'
                    : adminSection === 'users'
                      ? 'Users'
                      : adminSection === 'deletion-requests'
                        ? 'Deletion requests'
                        : adminSection === 'overview'
                          ? 'Admin panel'
                          : 'Field visibility'
                  : 'My vehicles'
                : <img className="brand-wordmark" src={brandWordmark} alt="Vehkix" />}
            </h1>
          </div>
          {session && collectionView && (
            <div className="summary" aria-label="Collection summary">
              <div className="summary-item">
                <strong>{String(vehicleRecords.length).padStart(2, '0')}</strong>
                <span>vehicles</span>
              </div>
              <div className="summary-divider" />
              <button
                className="summary-item due-summary-toggle"
                type="button"
                aria-expanded={showDueVehicles}
                aria-controls="due-vehicle-list"
                onClick={() => setShowDueVehicles((visible) => !visible)}
              >
                <strong>{String(attentionCount).padStart(2, '0')}</strong>
                <span>due within 10 days</span>
              </button>
            </div>
          )}
        </div>

        {session && collectionView && showDueVehicles && (
          <section className="due-summary-panel" id="due-vehicle-list" aria-labelledby="due-summary-title">
            <div className="due-summary-heading">
              <h2 id="due-summary-title">Due within 10 days</h2>
              <span>{attentionCount} {attentionCount === 1 ? 'vehicle' : 'vehicles'}</span>
            </div>
            {dueVehicles.length > 0 ? (
              <ul className="due-vehicle-list">
                {dueVehicles.map(({ vehicle, items }) => (
                  <li className="due-vehicle" key={vehicle.id}>
                    <div className="due-vehicle-heading">
                      {fieldSettings.vehicle_title.show_in_details && (
                        <strong>{getVehicleName(
                          fieldSettings.company.show_in_details ? vehicle.company : null,
                          fieldSettings.model.show_in_details ? vehicle.model : null,
                        )}</strong>
                      )}
                      {fieldSettings.vehicle_number.show_in_details && (
                        <span>{vehicle.vehicle_number || 'Not set'}</span>
                      )}
                      {!fieldSettings.vehicle_number.show_in_details && fieldSettings.id.show_in_details && (
                        <span>{vehicle.id}</span>
                      )}
                    </div>
                    <ul className="due-item-list">
                      {items.map(({ label, date, days }) => (
                        <li className="due-item" key={label}>
                          <span>{label}</span>
                          <strong>{formatDate(date)}</strong>
                          <span className={days < 0 ? 'overdue' : 'upcoming'}>
                            {days < 0
                              ? `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
                              : days === 0 ? 'Due today' : days === 1 ? 'Due in 1 day' : `Due in ${days} days`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="due-summary-empty">No vehicles are due within 10 days.</p>
            )}
          </section>
        )}

        {!session && authReady && supabaseClient && (
          <Suspense fallback={<p className="empty-state" role="status">Loading sign in…</p>}>
            <AuthPanel onSubmit={submitAuth} onForgotPassword={requestPasswordReset} />
          </Suspense>
        )}

        {session && isPasswordRecovery && (
          <Suspense fallback={<p className="empty-state" role="status">Loading password reset…</p>}>
            <PasswordRecoveryPanel onUpdatePassword={updatePassword} />
          </Suspense>
        )}

        {!authReady && (
          <p className="empty-state" role="status">Checking your session…</p>
        )}

        {authReady && !supabaseClient && (
          <p className="empty-state error-state" role="alert">Supabase is not configured, so your private collection is unavailable.</p>
        )}

        {session && adminAccessLoading && (
          <p className="empty-state" role="status">Verifying admin access…</p>
        )}

        {session && showProfile && (
          <Suspense fallback={<p className="empty-state" role="status">Loading your profile…</p>}>
            <ProfilePanel
              userId={session.user.id}
              initialUsername={username}
              onUpdateUsername={updateUsername}
              onAvatarChanged={() => setProfileAvatarRevision((revision) => revision + 1)}
            />
          </Suspense>
        )}

        {session && adminView && (
          <Suspense fallback={<p className="empty-state" role="status">Loading admin panel…</p>}>
            <AdminPanel
              userCount={userCount}
              vehicleCount={vehicleRecords.length}
              dueCount={attentionCount}
              fieldSettings={fieldSettings}
              settingsLoading={fieldSettingsLoading}
              settingsError={fieldSettingsError}
              onUpdateFieldSetting={updateFieldSetting}
              activeSection={adminSection}
              accounts={accounts}
              accountsLoading={myVehiclesLoading}
              accountsError={myVehiclesError}
              deletionRequests={deletionRequests}
              deletionRequestsLoading={deletionRequestsLoading}
              deletionRequestsError={deletionRequestsError}
              selectedAccountId={selectedAdminOwnerId}
              onSelectAccount={setSelectedAdminOwnerId}
              onManageAccount={(account) => {
                setSelectedAdminOwnerId(account.id)
                setAdminSection('vehicles')
                setQuery('')
              }}
              onDeleteAccount={(account) => { void handleDeleteAccount(account) }}
              onResolveDeletionRequest={(request, approve) => {
                void handleResolveDeletionRequest(request, approve)
              }}
              onSelectSection={handleAdminSectionChange}
            >
              {adminSection === 'vehicles' && (
                <>
                  <label className="search-box">
                    <span className="search-icon" aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search username, email, or vehicles"
                      aria-label="Search users and vehicles"
                    />
                    <span className="result-count">{filteredVehicles.length} shown</span>
                  </label>
                  {myVehiclesLoading && <p className="empty-state" role="status">Loading user vehicles…</p>}
                  {myVehiclesError && <p className="empty-state error-state" role="alert">{myVehiclesError}</p>}
                  {!myVehiclesLoading && !myVehiclesError && (
                    <VehicleList
                      vehicles={filteredVehicles}
                      ownerAccounts={filteredAccounts.filter((account) => account.vehicleCount > 0)}
                      query={query}
                      expandedVehicleId={expandedVehicleId}
                      deleteBusy={deleteBusy}
                      showOwner
                      canTransferAll={isAdmin}
                      userId={session.user.id}
                      fieldSettings={fieldSettings}
                      onToggleExpanded={(vehicleId) => setExpandedVehicleId(
                        expandedVehicleId === vehicleId ? null : vehicleId,
                      )}
                      onEdit={(vehicle) => { setEditingVehicle(vehicle); setShowVehicleForm(true) }}
                      onDelete={(vehicle) => { void handleDeleteVehicle(vehicle) }}
                      onTransferComplete={() => {
                        setAdminRefreshToken((token) => token + 1)
                        setShowVehicleForm(false)
                        setEditingVehicle(null)
                      }}
                    />
                  )}
                </>
              )}
            </AdminPanel>
          </Suspense>
        )}

        {session && collectionView && (
          <div className="private-toolbar">
            <p>Your collection includes your vehicles and any shared with you.</p>
            {!showVehicleForm && (
              <button
                className="primary-action"
                type="button"
                onClick={() => { setEditingVehicle(null); setShowVehicleForm(true) }}
              >
                Add vehicle
              </button>
            )}
          </div>
        )}

        {session && showVehicleForm && ((collectionView && !adminView) || editingVehicle) && (
          <Suspense fallback={<p className="empty-state" role="status">Loading vehicle form…</p>}>
            <VehicleForm
              key={editingVehicle?.id ?? 'new-vehicle'}
              initialDraft={editingVehicle ? toVehicleDraft(editingVehicle) : undefined}
              fieldSettings={fieldSettings}
              existingImages={editingVehicle?.signed_images ?? []}
              initialPrimaryImagePath={editingVehicle?.primary_image}
              onSave={handleVehicleSave}
              onCancel={() => { setShowVehicleForm(false); setEditingVehicle(null) }}
            />
          </Suspense>
        )}

        {session && collectionView && (
          <label className="search-box">
            <span className="search-icon" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search vehicles"
              aria-label="Search vehicles"
            />
            <span className="result-count">{filteredVehicles.length} shown</span>
          </label>
        )}

        {session && collectionView && myVehiclesLoading && (
          <p className="empty-state" role="status">Loading your collection…</p>
        )}
        {(authError || profileSyncError || (session && collectionView && myVehiclesError) || (session && adminAccessError) || actionError) && (
          <p className="empty-state error-state" role="alert">
            {authError || profileSyncError || myVehiclesError || adminAccessError || actionError}
          </p>
        )}

        {session && collectionView && !myVehiclesLoading && !myVehiclesError && (
          <Suspense fallback={<p className="empty-state" role="status">Loading vehicles…</p>}>
            <div className="collection-sections">
              <nav className="collection-section-switcher" aria-label="Vehicle collections">
                <button
                  className="collection-section-option"
                  type="button"
                  aria-pressed={activeCollectionSection === 'own'}
                  onClick={() => setCollectionSectionPreference({
                    userId: session.user.id,
                    section: 'own',
                  })}
                >
                  <span>My vehicles</span>
                  <span className="collection-section-count">{ownVehicles.length}</span>
                </button>
                {sharedVehicles.length > 0 && (
                  <button
                    className="collection-section-option"
                    type="button"
                    aria-pressed={activeCollectionSection === 'shared'}
                    onClick={() => setCollectionSectionPreference({
                      userId: session.user.id,
                      section: 'shared',
                    })}
                  >
                    <span>Shared with me</span>
                    <span className="collection-section-count">{sharedVehicles.length}</span>
                  </button>
                )}
              </nav>
              <section
                className="collection-section-content"
                aria-label={activeCollectionSection === 'own' ? 'My vehicles' : 'Shared with me'}
              >
                <VehicleList
                  vehicles={displayedCollectionVehicles}
                  query={query}
                  expandedVehicleId={expandedVehicleId}
                  deleteBusy={deleteBusy}
                  showOwner={false}
                  userId={session.user.id}
                  fieldSettings={fieldSettings}
                  onToggleExpanded={(vehicleId) => setExpandedVehicleId(
                    expandedVehicleId === vehicleId ? null : vehicleId,
                  )}
                  onEdit={(vehicle) => { setEditingVehicle(vehicle); setShowVehicleForm(true) }}
                  onDelete={(vehicle) => { void handleDeleteVehicle(vehicle) }}
                  onTransferComplete={() => {
                    setAdminRefreshToken((token) => token + 1)
                    setShowVehicleForm(false)
                    setEditingVehicle(null)
                  }}
                />
              </section>
            </div>
          </Suspense>
        )}
        {session && collectionView && (
          <footer className="list-footer">
            <span>“The road ahead belongs to those who keep moving.”</span>
          </footer>
        )}
      </section>
      {showAbout && (
        <Suspense fallback={<p className="empty-state" role="status">Loading About Vehkix…</p>}>
          <AboutPage />
        </Suspense>
      )}
      <footer className="site-footer">
        <a href="#about-vehkix">About Vehkix</a>
        <a href="mailto:vehkix@gmail.com">Support</a>
      </footer>
    </main>
  )
}

export default App
