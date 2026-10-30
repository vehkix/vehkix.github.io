import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import lightMark from '../../images/logo/vehkix-mark-color.png'
import darkMark from '../../images/logo/vehkix-mark-white.png'
import lightWordmark from '../../images/logo/vehkix-wordmark-color-transparent.png'
import darkWordmark from '../../images/logo/vehkix-wordmark-white.png'
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
  darkMode: boolean
  bodyHasWordmark: boolean
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
  onToggleDarkMode: () => void
  onOpenProfile: () => void
  onOpenNotificationSettings: () => void
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
  darkMode,
  bodyHasWordmark,
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
  onToggleDarkMode,
  onOpenProfile,
  onOpenNotificationSettings,
  onSignOut,
}: AppHeaderProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const mobileNavRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileMenuOpen && !mobileNavOpen) return
    function closeMenu(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setProfileMenuOpen(false)
        setMobileNavOpen(false)
      }
      if (event instanceof PointerEvent
        && event.target instanceof Node
        && !profileMenuRef.current?.contains(event.target)
        && !mobileNavRef.current?.contains(event.target)) {
        setProfileMenuOpen(false)
        setMobileNavOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeMenu)
    }
  }, [profileMenuOpen, mobileNavOpen])

  if (publicShareView) return null

  const hasPhoto = profileAvatar !== null
    && profileAvatar.userId === session?.user.id
    && profileAvatar.revision === profileAvatarRevision
    && profileAvatar.status === 'photo'
    && Boolean(profileAvatar.url)

  return (
    <header className="topbar">
      <button className={`wordmark${bodyHasWordmark ? ' wordmark-icon' : ''}`} type="button" aria-label="Go to garage" onClick={onHome}>
        <img src={bodyHasWordmark
          ? darkMode ? darkMark : lightMark
          : darkMode ? darkWordmark : lightWordmark} alt="" />
      </button>
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
                  <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onOpenNotificationSettings() }}>Notification settings</button>
                  <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); onSignOut() }}>Sign out</button>
                </div>
              )}
            </div>
          </>
        )}
        {!showEmailConfirmation && (
          <div className="mobile-nav-menu" ref={mobileNavRef}>
            <button
              className="mobile-nav-trigger"
              type="button"
              aria-label="More navigation"
              aria-expanded={mobileNavOpen}
              aria-haspopup="menu"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span aria-hidden="true" />
            </button>
            {mobileNavOpen && (
              <div className="mobile-nav-popover" role="menu" aria-label="Navigation options">
                <button type="button" role="menuitem" onClick={() => {
                  setMobileNavOpen(false)
                  onHome()
                }}>
                  Garage
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={darkMode}
                  onClick={() => {
                    setMobileNavOpen(false)
                    onToggleDarkMode()
                  }}
                >
                  Dark mode
                </button>
                {collectionView && !showVehicleForm && (
                  <button type="button" role="menuitem" onClick={() => {
                    setMobileNavOpen(false)
                    onHelp()
                  }}>
                    Help and product tour
                  </button>
                )}
                {isAdmin && (
                  <button type="button" role="menuitem" onClick={() => {
                    setMobileNavOpen(false)
                    onToggleAdmin()
                  }}>
                    {adminView ? 'My collection' : 'Admin panel'}
                  </button>
                )}
                {showProfile && (
                  <button type="button" role="menuitem" onClick={() => {
                    setMobileNavOpen(false)
                    onHome()
                  }}>
                    Home
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {!showEmailConfirmation && (
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
            aria-pressed={darkMode}
            onClick={onToggleDarkMode}
            title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
          >
            {darkMode
              ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                </svg>
              )
              : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.2 15.4A8.5 8.5 0 0 1 8.6 3.8 8.6 8.6 0 1 0 20.2 15.4Z" />
                </svg>
              )}
            <span className="theme-toggle-label">{darkMode ? 'Light mode' : 'Dark mode'}</span>
          </button>
        )}
      </div>
    </header>
  )
}

export default AppHeader
