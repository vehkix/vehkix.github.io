import { useEffect, useRef, useState } from 'react'
import { supabaseClient } from '../lib/supabase'
import './AboutPage.css'

interface AboutPageProps {
  isSignedIn: boolean
  onGoHome: () => void
}

function AboutPage({ isSignedIn, onGoHome }: AboutPageProps) {
  const statsSection = useRef<HTMLElement | null>(null)
  const [stats, setStats] = useState<{ users: number; vehicles: number } | null>(null)
  const [animatedStats, setAnimatedStats] = useState({ users: 0, vehicles: 0 })
  const [statsUnavailable, setStatsUnavailable] = useState(!supabaseClient)

  useEffect(() => {
    if (!supabaseClient) return

    let isCurrent = true
    void supabaseClient.rpc('get_public_usage_stats').maybeSingle()
      .then(({ data, error }) => {
        if (!isCurrent) return
        const result = data as { user_count: number | string; vehicle_count: number | string } | null
        if (error || !result) {
          setStatsUnavailable(true)
          return
        }

        const users = Number(result.user_count)
        const vehicles = Number(result.vehicle_count)
        if (!Number.isSafeInteger(users) || users < 0 || !Number.isSafeInteger(vehicles) || vehicles < 0) {
          setStatsUnavailable(true)
          return
        }

        setStats({ users, vehicles })
      }, () => {
        if (isCurrent) setStatsUnavailable(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    if (!stats) return
    const targetStats = stats

    let frameId = 0
    let observer: IntersectionObserver | undefined
    let isCurrent = true

    function animateCounts() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setAnimatedStats(targetStats)
        return
      }

      const duration = 1400
      let startTime: number | undefined
      function updateCounts(timestamp: number) {
        if (!isCurrent) return
        startTime ??= timestamp
        const progress = Math.min((timestamp - startTime) / duration, 1)
        const easedProgress = 1 - (1 - progress) ** 3
        setAnimatedStats({
          users: Math.round(targetStats.users * easedProgress),
          vehicles: Math.round(targetStats.vehicles * easedProgress),
        })
        if (progress < 1) frameId = requestAnimationFrame(updateCounts)
      }
      frameId = requestAnimationFrame(updateCounts)
    }

    const section = statsSection.current
    if (!section || !('IntersectionObserver' in window)) {
      animateCounts()
    } else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect()
          animateCounts()
        }
      }, { threshold: 0.35 })
      observer.observe(section)
    }

    return () => {
      isCurrent = false
      cancelAnimationFrame(frameId)
      observer?.disconnect()
    }
  }, [stats])

  return (
    <article id="about-vehkix" className="about-page" aria-labelledby="about-title">
      <header className="about-hero">
        <p className="eyebrow">ABOUT VEHKIX</p>
        <h1 id="about-title">A clearer way to care for every vehicle.</h1>
        <p>
          Keep your vehicles, important dates, photos, and shared records organized in one
          place—so it is easier to know what needs attention and who can help.
        </p>
        <a
          className="primary-action"
          href="#top"
          onClick={(event) => {
            event.preventDefault()
            onGoHome()
          }}
        >
          {isSignedIn ? 'Go back home' : 'Explore Vehkix'}
        </a>
      </header>

      <section className="about-intro" aria-labelledby="about-why-title">
        <p className="eyebrow">WHY VEH KIX</p>
        <h2 id="about-why-title">Vehicle information should be easy to find when it matters.</h2>
        <p>
          Service history, insurance and registration renewals, photos, and notes can get
          scattered across papers, messages, and memory. Vehkix brings those records
          together and helps make upcoming and overdue items easier to spot.
        </p>
      </section>

      <section className="about-card-grid" aria-label="Vehkix purpose and community">
        <article className="about-card">
          <span className="about-card-number">01</span>
          <h2>Our vision</h2>
          <p>
            A world where every vehicle owner can understand, organize, and care for their
            vehicles with confidence.
          </p>
        </article>
        <article className="about-card">
          <span className="about-card-number">02</span>
          <h2>Our mission</h2>
          <p>
            Make everyday vehicle care more manageable by keeping useful records together
            and making important dates easier to notice.
          </p>
        </article>
        <article className="about-card">
          <span className="about-card-number">03</span>
          <h2>Who it helps</h2>
          <p>
            Individual owners, families with more than one vehicle, and people who help
            maintain or keep track of vehicles can all benefit from a shared, organized view.
          </p>
        </article>
      </section>

      <section className="about-features" aria-labelledby="about-features-title">
        <div className="about-section-heading">
          <p className="eyebrow">A GARAGE THAT WORKS AROUND YOU</p>
          <h2 id="about-features-title">Useful tools for the whole life of your vehicle.</h2>
        </div>
        <ul>
          <li>
            <h3>Your vehicles, together</h3>
            <p>
              Keep a private garage of vehicles you own and see vehicles other people have
              shared with you, in separate collection tabs.
            </p>
          </li>
          <li>
            <h3>Detailed vehicle records</h3>
            <p>
              Organize registration details, make and model, service history and mileage,
              PUCC, insurance, tax and registration validity, notes, and photos.
            </p>
          </li>
          <li>
            <h3>Stay ahead of important dates</h3>
            <p>
              See upcoming and overdue service or document renewals, with a quick view of
              items that are due soon.
            </p>
          </li>
          <li>
            <h3>Share with people you trust</h3>
            <p>
              Invite another Vehkix account and choose its access to a vehicle. New shares
              can be accepted or rejected by the recipient, and access can be managed later.
            </p>
          </li>
          <li>
            <h3>Read-only links for guests</h3>
            <p>
              Create revocable links for people without an account, choose which details
              and photos they can see, and keep the shared vehicle read-only.
            </p>
          </li>
          <li>
            <h3>Notifications that keep you in the loop</h3>
            <p>
              Get updates about vehicle sharing and respond to incoming access requests
              from your notification center.
            </p>
          </li>
          <li>
            <h3>Print or save a tailored record</h3>
            <p>
              Choose the vehicle details to include in a clean printout or save as a PDF
              for your own records.
            </p>
          </li>
          <li>
            <h3>Your account, under your control</h3>
            <p>
              Update your profile photo and username, change your password, review vehicle
              shares, and manage account deletion from your profile.
            </p>
          </li>
          <li>
            <h3>Emergency numbers close at hand</h3>
            <p>
              Browse Kerala-priority and India-wide helplines, search by service or number,
              and tap a contact to call from the <a href="#emergency-contacts">emergency contacts directory</a>.
            </p>
          </li>
        </ul>
      </section>

      <section className="about-contact" aria-labelledby="about-contact-title">
        <p className="eyebrow">WE’RE HERE TO HELP</p>
        <h2 id="about-contact-title">Questions or feedback?</h2>
        <p>We’d be glad to hear from you.</p>
        <a href="mailto:vehkix@gmail.com">vehkix@gmail.com</a>
      </section>

      <section
        ref={statsSection}
        className="about-stats"
        aria-label="Vehkix community statistics"
        aria-busy={!stats && !statsUnavailable}
      >
        <p className="eyebrow">VEHKIX COMMUNITY</p>
        <div className="about-stats-grid">
          <div className="about-stat">
            <strong>{stats ? animatedStats.users.toLocaleString() : '—'}</strong>
            <span>Users</span>
          </div>
          <div className="about-stat">
            <strong>{stats ? animatedStats.vehicles.toLocaleString() : '—'}</strong>
            <span>Vehicles</span>
          </div>
        </div>
        {statsUnavailable && <p className="about-stats-error" role="status">Statistics are currently unavailable.</p>}
      </section>
    </article>
  )
}

export default AboutPage
