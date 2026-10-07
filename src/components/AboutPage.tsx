import './AboutPage.css'

function AboutPage() {
  return (
    <article id="about-vehkix" className="about-page" aria-labelledby="about-title">
      <header className="about-hero">
        <p className="eyebrow">ABOUT VEHKIX</p>
        <h1 id="about-title">A clearer way to care for every vehicle.</h1>
        <p>
          Vehkix helps people keep vehicle details, maintenance, and important documents
          together—so caring for a vehicle feels simpler and more organized.
        </p>
        <a className="primary-action" href="/">Explore Vehkix</a>
      </header>

      <section className="about-intro" aria-labelledby="about-why-title">
        <p className="eyebrow">WHY VEH KIX</p>
        <h2 id="about-why-title">Vehicle information should be easy to find when it matters.</h2>
        <p>
          Service dates, insurance renewals, registration details, photos, and notes can
          end up scattered across papers, messages, and memory. Vehkix brings those details
          into one organized place and makes it easier to stay ahead of the next task.
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
          <p className="eyebrow">MADE FOR EVERYDAY OWNERSHIP</p>
          <h2 id="about-features-title">The details that help you stay prepared.</h2>
        </div>
        <ul>
          <li>
            <h3>One organized vehicle record</h3>
            <p>Keep vehicle details, notes, photos, and ownership information together.</p>
          </li>
          <li>
            <h3>Maintenance and document dates</h3>
            <p>Track service, insurance, registration, and other important dates in one place.</p>
          </li>
          <li>
            <h3>A quick view of what needs attention</h3>
            <p>See upcoming items and overdue tasks without searching through old records.</p>
          </li>
          <li>
            <h3>Share with the right people</h3>
            <p>Give another Vehkix user access to a vehicle when they help care for it.</p>
          </li>
          <li>
            <h3>Useful records when you need them</h3>
            <p>Choose the details to print or save as a PDF for your own reference.</p>
          </li>
          <li>
            <h3>A profile for your account</h3>
            <p>Personalize your account and manage your vehicle collection in one place.</p>
          </li>
        </ul>
      </section>

      <section className="about-contact" aria-labelledby="about-contact-title">
        <p className="eyebrow">WE’RE HERE TO HELP</p>
        <h2 id="about-contact-title">Questions or feedback?</h2>
        <p>We’d be glad to hear from you.</p>
        <a href="mailto:vehkix@gmail.com">vehkix@gmail.com</a>
      </section>
    </article>
  )
}

export default AboutPage
