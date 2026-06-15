import { useState, useEffect, useMemo, useRef } from 'react'
import { HebrewCalendar, HDate, flags } from '@hebcal/core'
import { supabase, isConfigured } from './supabase'
import './App.css'

const COUPLES = [
  { name: 'אביה ונריה',  photo: '/photos/aviya-neria.jpg' },
  { name: 'אור ושרון',   photo: '/photos/or-sharon.jpg' },
  { name: 'רעות וניסים', photo: '/photos/rut-nisim.jpg' },
  { name: 'חגי ושי',     photo: '/photos/chagai-shai.jpg' },
  { name: 'דידי ותהל',   photo: '/photos/didi-tahal.jpg' },
  { name: 'נהוראי וחן',  photo: '/photos/nahorai-chen.jpg' },
]

const COUPLE_COLORS = {
  'אביה ונריה':  '#7c3aed',
  'אור ושרון':   '#0ea5e9',
  'רעות וניסים': '#10b981',
  'חגי ושי':     '#f59e0b',
  'דידי ותהל':   '#ef4444',
  'נהוראי וחן':  '#ec4899',
}

function Avatar({ name, photo, size = 36 }) {
  const color = COUPLE_COLORS[name] || '#6b7280'
  const initial = name.charAt(0)
  if (photo) {
    return <img src={photo} alt={name} className="avatar" style={{ width: size, height: size }} />
  }
  return (
    <div className="avatar avatar-initials" style={{ width: size, height: size, background: color }}>
      {initial}
    </div>
  )
}

function CoupleSelect({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = COUPLES.find(c => c.name === value)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="couple-select" ref={ref}>
      <button className="couple-select-trigger" onClick={() => setOpen(o => !o)}>
        {selected
          ? <><Avatar name={selected.name} photo={selected.photo} size={30} /><span>{selected.name}</span></>
          : <span className="couple-select-placeholder">— בחר/י שם —</span>
        }
        <span className="couple-select-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="couple-select-list">
          <li className="couple-select-item couple-select-empty" onClick={() => { onChange(''); setOpen(false) }}>
            — בחר/י שם —
          </li>
          {COUPLES.map(c => (
            <li
              key={c.name}
              className={`couple-select-item ${c.name === value ? 'couple-select-item-active' : ''}`}
              onClick={() => { onChange(c.name); setOpen(false) }}
            >
              <Avatar name={c.name} photo={c.photo} size={32} />
              <span>{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const MAX_COUPLES = 2
const MONTHS_AHEAD = 8

function localDateId(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hebrewDate(date) {
  return new HDate(date).render('he')
}

function buildEvents() {
  const now = new Date()
  const future = new Date()
  future.setMonth(future.getMonth() + MONTHS_AHEAD)

  const hebEvents = HebrewCalendar.calendar({
    start: now, end: future, il: true, sedrot: true,
    noRoshChodesh: true, noModern: true, noSpecialShabbat: true, noMinorFast: true,
  })

  const holidayMap = new Map()
  const parashaMap = new Map()

  for (const e of hebEvents) {
    const mask = e.getFlags()
    const greg = e.getDate().greg()
    const d = new Date(greg.getFullYear(), greg.getMonth(), greg.getDate(), 12, 0, 0)
    const dateStr = localDateId(d)
    if (mask & flags.CHAG) {
      if (!holidayMap.has(dateStr))
        holidayMap.set(dateStr, { id: dateStr, date: d, name: e.renderBrief('he'), type: 'chag', hebrewDate: hebrewDate(d) })
    }
    if (mask & flags.PARSHA_HASHAVUA) parashaMap.set(dateStr, e.renderBrief('he'))
  }

  const events = []
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
  while (cursor.getDay() !== 6) cursor.setDate(cursor.getDate() + 1)

  while (cursor <= future) {
    const dateStr = localDateId(cursor)
    if (holidayMap.has(dateStr)) {
      events.push({ ...holidayMap.get(dateStr), type: 'chag-shabbat' })
      holidayMap.delete(dateStr)
    } else {
      events.push({ id: dateStr, date: new Date(cursor), name: 'שבת', type: 'shabbat', parasha: parashaMap.get(dateStr), hebrewDate: hebrewDate(new Date(cursor)) })
    }
    cursor.setDate(cursor.getDate() + 7)
  }

  for (const chag of holidayMap.values()) events.push(chag)
  return events.sort((a, b) => a.date - b.date)
}

function formatDate(date) {
  return date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function App() {
  const [selectedCouple, setSelectedCouple] = useState(() => localStorage.getItem('selectedCouple') || '')
  // registrations: { [eventId]: [{couple_name, note}] }
  const [registrations, setRegistrations] = useState({})
  const [notes, setNotes] = useState({}) // { [eventId]: string } — draft note per event
  const [dbError, setDbError] = useState(false)

  const events = useMemo(() => buildEvents(), [])

  useEffect(() => {
    if (selectedCouple) localStorage.setItem('selectedCouple', selectedCouple)
  }, [selectedCouple])

  useEffect(() => {
    if (!isConfigured) { setDbError(true); return }

    supabase.from('registrations').select('event_id, couple_name, note')
      .then(({ data, error }) => {
        if (error) { setDbError(true); return }
        const map = {}
        for (const row of data) {
          if (!map[row.event_id]) map[row.event_id] = []
          map[row.event_id].push({ couple_name: row.couple_name, note: row.note || '' })
        }
        setRegistrations(map)
      })

    const channel = supabase.channel('registrations-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registrations' },
        ({ new: row }) => setRegistrations(prev => ({
          ...prev,
          [row.event_id]: [...(prev[row.event_id] || []), { couple_name: row.couple_name, note: row.note || '' }],
        }))
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'registrations' },
        ({ old: row }) => setRegistrations(prev => ({
          ...prev,
          [row.event_id]: (prev[row.event_id] || []).filter(r => r.couple_name !== row.couple_name),
        }))
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registrations' },
        ({ new: row }) => setRegistrations(prev => ({
          ...prev,
          [row.event_id]: (prev[row.event_id] || []).map(r =>
            r.couple_name === row.couple_name ? { ...r, note: row.note || '' } : r
          ),
        }))
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function handleRegister(eventId) {
    if (!selectedCouple) return
    const current = registrations[eventId] || []
    const isRegistered = current.some(r => r.couple_name === selectedCouple)

    if (isRegistered) {
      await supabase.from('registrations')
        .delete().eq('event_id', eventId).eq('couple_name', selectedCouple)
    } else if (current.length < MAX_COUPLES) {
      const note = notes[eventId] || ''
      await supabase.from('registrations')
        .insert({ event_id: eventId, couple_name: selectedCouple, note: note || null })
      setNotes(prev => ({ ...prev, [eventId]: '' }))
    }
  }

  return (
    <div className="app" dir="rtl">
      <header className="header">
        <h1>🏠 ביקורים אצל אמא ואבא</h1>
        <p className="subtitle">מקסימום {MAX_COUPLES} זוגות בכל שבת / חג</p>
      </header>

      <div className="name-bar">
        <span className="name-label">מי אתה?</span>
        <CoupleSelect value={selectedCouple} onChange={setSelectedCouple} />
      </div>

      {dbError && (
        <div className="error-banner">
          ⚠️ שגיאה בחיבור למסד הנתונים
        </div>
      )}

      <main className="events">
        {events.map(event => {
          const regs = registrations[event.id] || []
          const myReg = regs.find(r => r.couple_name === selectedCouple)
          const isRegistered = !!myReg
          const isFull = regs.length >= MAX_COUPLES
          const spotsLeft = MAX_COUPLES - regs.length
          const isChag = event.type === 'chag' || event.type === 'chag-shabbat'

          return (
            <div key={event.id} className={`card ${isChag ? 'card-chag' : 'card-shabbat'} ${isFull && !isRegistered ? 'card-full' : ''} ${isRegistered ? 'card-mine' : ''}`}>
              <div className="card-header">
                <div className="card-title">
                  <span className="event-icon">{isChag ? '✨' : '🕯️'}</span>
                  <span className="event-name">{event.name}</span>
                </div>
                <span className={`badge ${isFull ? 'badge-full' : 'badge-open'}`}>
                  {isFull ? 'מלא' : `${spotsLeft} מקומות פנויים`}
                </span>
              </div>

              <p className="event-date">{formatDate(event.date)}</p>
              <p className="event-hebrew">
                {event.hebrewDate}
                {event.parasha ? <span className="parasha"> · {event.parasha}</span> : null}
              </p>

              <div className="registrations">
                {regs.length === 0 ? (
                  <span className="empty-slots">עוד אף אחד לא נרשם</span>
                ) : (
                  regs.map(reg => {
                    const couplePhoto = COUPLES.find(c => c.name === reg.couple_name)?.photo || ''
                    return (
                      <div key={reg.couple_name} className="couple-entry">
                        <span className={`couple-tag ${reg.couple_name === selectedCouple ? 'tag-mine' : 'tag-other'}`}>
                          <Avatar name={reg.couple_name} photo={couplePhoto} size={24} />
                          {reg.couple_name === selectedCouple ? '✓ ' : ''}{reg.couple_name}
                        </span>
                        {reg.note && (
                          <p className="couple-note">💬 {reg.note}</p>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {selectedCouple && !isRegistered && !isFull && (
                <textarea
                  className="note-input"
                  placeholder="בקשה מיוחדת — עיצוב חדר, אוכל אהוב... (אופציונלי)"
                  rows={2}
                  value={notes[event.id] || ''}
                  onChange={e => setNotes(prev => ({ ...prev, [event.id]: e.target.value }))}
                />
              )}

              {selectedCouple ? (
                <button
                  className={`btn ${isRegistered ? 'btn-cancel' : isFull ? 'btn-full' : 'btn-join'}`}
                  onClick={() => handleRegister(event.id)}
                  disabled={isFull && !isRegistered}
                >
                  {isRegistered ? '❌ ביטול' : isFull ? 'מלא' : '✅ אני בא!'}
                </button>
              ) : (
                <p className="hint">בחר/י שם למעלה כדי להירשם</p>
              )}
            </div>
          )
        })}
      </main>
    </div>
  )
}
