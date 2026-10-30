import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import brandMark from '../../images/logo/vehkix-mark-color.png'
import { supabaseClient } from '../lib/supabase'
import { getUsernameInitials } from '../lib/profile'
import ImageWithShimmer from './ImageWithShimmer'
import './AppHeader.css'

const NotificationBell = lazy(() => import('./NotificationBell'))

interface AppHeaderProps {
  publicShareView: boolean
  session: { user: { id: string } } | null
  username: string
  authReady: boolean
  isAdmin: boolean
  adminView: boolean
  collectionView: boolean
  showProfile: boolean
  showEmailConfirmation: boolean
  showVehicleForm: boolean
  profileAvatar: {
    userId: string
    revision: number
    status: 'none' | 'photo' | 'error'
    url?: string
  } | null
  profileAvatarRevision: number
  onHelp: () => void
  onOpenDeletionRequests: () => void
  onVehicleShareResponded: () => void
  onToggleAdmin: () => void
  onHome: () => void
  onOpenProfile: () => void
  onSignOut: () => void
}

function AppHeader({
  publicShareView,
  session,
  username,
  authReady,
  isAdmin,
  adminView,
  collectionView,
  showProfile,
  showEmailConfirmation,
  showVehicleForm,
  profileAvatar,
  profileAvatarRevision,
  onHelp,
  onOpenDeletionRequests,
  onVehicleShareResponded,
  onToggleAdmin,
  onHome,
  onOpenProfile,
  onSignOut,
}: AppHeaderProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileMenuOpen) return
    function closeMenu(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === 'Escape') setProfileMenuOpen(false)
      if (event instanceof PointerEvent
        && event.target instanceof Node
        && !profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeMenu)
    }
  }, [profileMenuOpen])

  if (publicShareView) return null

  const hasPhoto = profileAvatar !== null
    && profileAvatar.userId === session?.user.id
    && profileAvatar.revision === profileAvatarRevision
    && profileAvatar.status === 'photo'
    && Boolean(profileAvatar.url)

  return (
    <header className="topbar">
      {(session || showEmailConfirmation) && (
        <button className="wordmark" type="button" aria-label="Go to collection" onClick={onHome}>
          <img src={brandMark} alt="Vehkix" />
          
        </button>
      )}
      {!session && !showEmailConfirmation && <span className="wordmark wordmark-guest"><img src={brandMark} alt="Vehkix" /></span>}
      <div className="topbar-actions">
        {(!supabaseClient || !authReady) && (
          <span className="data-status" data-state={!supabaseClient ? 'error' : 'connecting'}>
            <span aria-hidden="true" />
            {!supabaseClient ? 'SETUP REQUIRED' : 'CONNECTING'}
          </span>
        )}
        {session && !showEmailConfirmation && (
          <>
            {collectionView && !showVehicleForm && (
              <button className="text-action header-help" type="button" onClick={onHelp}>Help</button>
            )}
            <Suspense fallback={null}>
              <NotificationBell
                userId={session.user.id}
                onOpenDeletionRequests={onOpenDeletionRequests}
                onVehicleShareResponded={onVehicleShareResponded}
              />
            </Suspense>
            {isAdmin && (
              <button className="text-action admin-view-toggle" type="button" aria-pressed={adminView} onClick={onToggleAdmin}>
                {adminView ? 'My collection' : 'Admin panel'}
              </button>
            )}
            {showProfile && <button className="topbar-home-button" type="button" onClick={onHome}>Home</button>}
            <div className="profile-menu" ref={profileMenuRef}>
              <button
                className="profile-menu-trigger"
                type="button"
                aria-label="Open profile menu"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                onClick={() => setProfileMenuOpen((open) => !open)}
              >
                <span className={`profile-tab-avatar${hasPhoto ? ' has-photo' : ''}`} aria-hidden="true">
                  {hasPhoto && profileAvatar?.url
                    ? <ImageWithShimmer key={profileAvatar.url} className="profile-tab-avatar-image" src={profileAvatar.url} alt="" />
                    : profileAvatar?.status === 'none' ? getUsernameInitials(username) : null}
                </span>
              </button>
              {profileMenuOpen && (
                <div className="profile-menu-popover" role="menu" aria-label="Profile options">
                  <span className="profile-menu-username" role="presentation">{username}</span>
                  <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onOpenProfile() }}>Profile</button>
                  <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onSignOut() }}>Sign out</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  )
}

export default AppHeader
