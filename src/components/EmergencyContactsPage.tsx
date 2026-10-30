import { useMemo, useState } from 'react'
import './EmergencyContactsPage.css'

interface EmergencyContact {
  service: string
  numbers: string[]
  detail?: string
}

const KeralamContacts: EmergencyContact[] = [
  { service: 'Integrated emergency response', numbers: ['112'], detail: 'Police, fire, and urgent emergencies' },
  { service: 'Police', numbers: ['100'] },
  { service: 'Fire and rescue', numbers: ['101'] },
  { service: 'Ambulance', numbers: ['102'] },
  { service: 'National Ambulance Service', numbers: ['108'] },
  { service: 'NHAI highway helpline', numbers: ['1033'], detail: 'National Highways Authority of India' },
  { service: 'Women helpline', numbers: ['181', '1091'] },
  { service: 'Child helpline', numbers: ['1098'] },
  { service: 'Pink Police Patrol', numbers: ['1515'] },
  { service: 'Keralam State Disaster Management', numbers: ['1070'] },
  { service: 'District Disaster Management', numbers: ['1077'] },
  { service: 'Dial a Doctor', numbers: ['1056'], detail: 'Keralam tele-health service' },
  { service: 'Crime Stopper', numbers: ['1090'] },
  { service: 'KSEB electricity helpline', numbers: ['1912'] },
  { service: 'Keralam Water Authority', numbers: ['1800-425-5313'] },
  { service: 'Civil Supplies', numbers: ['1967'] },
  { service: 'General Query Call Center', numbers: ['1961'] },
  { service: 'Cyber Crime Helpline', numbers: ['1930'] },
  { service: 'National Consumer Helpline', numbers: ['1915'] },
  { service: 'Railway Security and Medical', numbers: ['139'] },
  { service: 'Tourist Helpline', numbers: ['1363'] },
  { service: 'Road Accident Helpline', numbers: ['1073'] },
  { service: 'Railway Police Alert', numbers: ['9846200100'] },
  { service: 'Highway Alert', numbers: ['9846100100'] },
]

const indiaContacts: EmergencyContact[] = [
  { service: 'Integrated emergency response', numbers: ['112'], detail: 'Police, fire, and urgent emergencies' },
  { service: 'Police', numbers: ['100'] },
  { service: 'Fire', numbers: ['101'] },
  { service: 'Ambulance', numbers: ['102'] },
  { service: 'National Ambulance Service', numbers: ['108'] },
  { service: 'NHAI highway helpline', numbers: ['1033'] },
  { service: 'Women helpline', numbers: ['181', '1091'] },
  { service: 'Child helpline', numbers: ['1098'] },
  { service: 'Cyber crime helpline', numbers: ['1930'] },
  { service: 'Railway security and medical assistance', numbers: ['139'] },
  { service: 'Road accident helpline', numbers: ['1073'] },
  { service: 'Tourist helpline', numbers: ['1363'] },
  { service: 'National Consumer Helpline', numbers: ['1915'] },
]

const countNumbers = (contacts: EmergencyContact[]) => (
  contacts.reduce((total, contact) => total + contact.numbers.length, 0)
)

function EmergencyContactsPage() {
  const [activeRegion, setActiveRegion] = useState<'Keralam' | 'india'>('Keralam')
  const [searchQuery, setSearchQuery] = useState('')
  const contacts = activeRegion === 'Keralam' ? KeralamContacts : indiaContacts
  const filteredContacts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return contacts
    return contacts.filter(({ service, numbers, detail }) => (
      service.toLowerCase().includes(query)
      || numbers.some((number) => number.includes(query))
      || detail?.toLowerCase().includes(query)
    ))
  }, [contacts, searchQuery])

  return (
    <section className="emergency-directory fleet" aria-labelledby="emergency-title">
      <header className="emergency-heading">
        <div>
          <p className="eyebrow">KEEP THESE NUMBERS HANDY</p>
          <h1 id="emergency-title">Emergency contacts</h1>
          <p>Tap a number to call. If you need urgent help in India, call 112.</p>
        </div>
        <a className="emergency-call-now" href="tel:112">Call 112</a>
      </header>

      <nav className="emergency-region-tabs" aria-label="Emergency contact regions">
        <button
          type="button"
          aria-current={activeRegion === 'Keralam' ? 'page' : undefined}
          onClick={() => setActiveRegion('Keralam')}
        >
          Keralam
          <span>{countNumbers(KeralamContacts)} numbers</span>
        </button>
        <button
          type="button"
          aria-current={activeRegion === 'india' ? 'page' : undefined}
          onClick={() => setActiveRegion('india')}
        >
          India
          <span>{countNumbers(indiaContacts)} numbers</span>
        </button>
      </nav>

      <p className="emergency-region-note">
        {activeRegion === 'Keralam'
          ? 'Keralam contacts first, followed by national emergency and essential-service helplines.'
          : 'National emergency and essential-service helplines available across India.'}
      </p>

      <label className="emergency-search">
        <span className="visually-hidden">Search emergency contacts</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search services or numbers"
          aria-label="Search emergency contacts"
        />
        <span>{filteredContacts.length} {filteredContacts.length === 1 ? 'contact' : 'contacts'}</span>
      </label>

      <ul className="emergency-contact-list">
        {filteredContacts.map(({ service, numbers, detail }) => (
          <li className="emergency-contact" key={service}>
            <div>
              <h2>{service}</h2>
              {detail && <p>{detail}</p>}
            </div>
            <div className="emergency-contact-numbers" aria-label={`Call ${service}`}>
              {numbers.map((number) => (
                <a href={`tel:${number}`} key={number}>{number}</a>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {filteredContacts.length === 0 && (
        <p className="emergency-no-results" role="status">No contacts match “{searchQuery.trim()}”.</p>
      )}
      <p className="emergency-disclaimer">
        Helpline availability can vary by area and service. If a line does not connect, try 112 for an emergency.
      </p>
    </section>
  )
}

export default EmergencyContactsPage
