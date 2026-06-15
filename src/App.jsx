import { useState, useEffect, useMemo } from 'react'
import { HebrewCalendar, HDate, flags } from '@hebcal/core'
import { supabase, isConfigured } from './supabase'
import './App.css'

const COUPLES = [
  'אביה ונריה',
  'אור ושרון',
  'רעות וניסים',
  'חגי ושי',
  'דידי ותהל',
  'נהוראי וחן',
]

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
    start: now,
    end: future,
    il: true,
    sedrot: true,
    noRoshChodesh: true,
    noModern: true,
    noSpecialShabbat: true,
    noMinorFast: true,
  })

  const holidayMap = new Map()
  const parashaMap = new Map()

  for (const e of hebEvents) {
    const mask = e.getFlags()
    const greg = e.getDate().greg()
    const d = new Date(greg.getFullYear(), greg.getMonth(), greg.getDate(), 12, 0, 0)
    const dateStr = localDateId(d)

    if (mask & flags.CHAG) {
      if (!holidayMap.has(dateStr)) {
        holidayMap.set(dateStr, {
          id: dateStr,
          date: d,
          name: e.renderBrief('he'),
          type: 'chag',
          hebrewDate: hebrewDate(d),
        })
      }
    }
    if (mask & flags.PARSHA_HASHAVUA) {
      parashaMap.set(dateStr, e.renderBrief('he'))
    }
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
      events.push({
        id: dateStr,
        date: new Date(cursor),
        name: 'שבת',
        type: 'shabbat',
        parasha: parashaMap.get(dateStr),
        hebrewDate: hebrewDate(new Date(cursor)),
      })
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
  const [selectedCouple, setSelectedCouple] = useState(
    () => localStorage.getItem('selectedCouple') || ''
  )
  const [registrations, setRegistrations] = useState({})
  const [dbError, setDbError] = useState(false)

  const events = useMemo(() => buildEvents(), [])

  useEffect(() => {
    if (selectedCouple) localStorage.setItem('selectedCouple', selectedCouple)
  }, [selectedCouple])

  useEffect(() => {
    if (!isConfigured) { setDbError(true); return }
    supabase
      .from('registrations')
      .select('event_id, couple_name')
      .then(({ data, error }) => {
        if (error) { setDbError(true); return }
        const map = {}
        for (const row of data) {
          if (!map[row.event_id]) map[row.event_id] = []
          map[row.event_id].push(row.couple_name)
        }
        setRegistrations(map)
      })

    if (!isConfigured) return
    const channel = supabase
      .channel('registrations-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registrations' },
        ({ new: row }) => {
          setRegistrations(prev => ({
            ...prev,
            [row.event_id]: [...(prev[row.event_id] || []), row.couple_name],
          }))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'registrations' },
        ({ old: row }) => {
          setRegistrations(prev => ({
            ...prev,
            [row.event_id]: (prev[row.event_id] || []).filter(c => c !== row.couple_name),
          }))
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function toggleRegistration(eventId) {
    if (!selectedCouple) return
    const current = registrations[eventId] || []
    const isRegistered = current.includes(selectedCouple)

    if (isRegistered) {
      await supabase.from('registrations')
        .delete()
        .eq('event_id', eventId)
        .eq('couple_name', selectedCouple)
    } else if (current.length < MAX_COUPLES) {
      await supabase.from('registrations')
        .insert({ event_id: eventId, couple_name: selectedCouple })
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
        <select
          value={selectedCouple}
          onChange={(e) => setSelectedCouple(e.target.value)}
          className="name-select"
        >
          <option value="">— בחר/י שם —</option>
          {COUPLES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {dbError && (
        <div className="error-banner">
          ⚠️ שגיאה בחיבור למסד הנתונים — יש להגדיר את הפרטים בקובץ <code>.env.local</code>
        </div>
      )}

      <main className="events">
        {events.map((event) => {
          const regs = registrations[event.id] || []
          const isRegistered = !!(selectedCouple && regs.includes(selectedCouple))
          const isFull = regs.length >= MAX_COUPLES
          const spotsLeft = MAX_COUPLES - regs.length
          const isChag = event.type === 'chag' || event.type === 'chag-shabbat'

          return (
            <div
              key={event.id}
              className={`card ${isChag ? 'card-chag' : 'card-shabbat'} ${isFull && !isRegistered ? 'card-full' : ''} ${isRegistered ? 'card-mine' : ''}`}
            >
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
                  regs.map((couple) => (
                    <span
                      key={couple}
                      className={`couple-tag ${couple === selectedCouple ? 'tag-mine' : 'tag-other'}`}
                    >
                      {couple === selectedCouple ? '✓ ' : ''}{couple}
                    </span>
                  ))
                )}
              </div>

              {selectedCouple ? (
                <button
                  className={`btn ${isRegistered ? 'btn-cancel' : isFull ? 'btn-full' : 'btn-join'}`}
                  onClick={() => toggleRegistration(event.id)}
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
