import { useState, useEffect, useMemo, useRef } from 'react'
import { HebrewCalendar, HDate, flags } from '@hebcal/core'
import { supabase, isConfigured } from './supabase'
import './App.css'

// ── Constants ──────────────────────────────────────────────
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
  'אבא':         '#4f46e5',
}

const MAX_COUPLES  = 2
const MONTHS_AHEAD = 8
const VAPID_PUBLIC = 'BOO3Ncsifu38ofjC-lbqKn86Vdi1Iq3sY7LV5zCcnQyh_RgfZfC_joTDRUZYkTyPkiyy2A0oN-YNRDchFCf4gq8'

// ── Push subscription ──────────────────────────────────────
function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function registerPush(coupleName, role) {
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
    await supabase.from('push_subscriptions').upsert(
      { couple_name: coupleName, role, subscription: sub.toJSON() },
      { onConflict: 'couple_name' }
    )
  } catch (e) { console.warn('Push:', e) }
}

// ── Fallback in-app notification ───────────────────────────
function showNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, dir: 'rtl', lang: 'he', icon: '/icon.svg' })
  }
}

// ── Avatar ─────────────────────────────────────────────────
function Avatar({ name, photo, size = 36 }) {
  const color   = COUPLE_COLORS[name] || '#6b7280'
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

// ── Date helpers ───────────────────────────────────────────
function localDateId(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function hebrewDate(date) { return new HDate(date).render('he') }

function buildEvents() {
  const now    = new Date()
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
    const d    = new Date(greg.getFullYear(), greg.getMonth(), greg.getDate(), 12, 0, 0)
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
      events.push({ id: dateStr, date: new Date(cursor), name: 'שבת', type: 'shabbat',
        parasha: parashaMap.get(dateStr), hebrewDate: hebrewDate(new Date(cursor)) })
    }
    cursor.setDate(cursor.getDate() + 7)
  }

  for (const chag of holidayMap.values()) events.push(chag)
  return events.sort((a, b) => a.date - b.date)
}

function formatDate(date) {
  return date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ── Login Screen ───────────────────────────────────────────
const ALL_USERS = [...COUPLES, { name: 'אבא', photo: '' }]

function LoginScreen({ onLogin }) {
  const [step,     setStep]     = useState('select')
  const [selected, setSelected] = useState(null)
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  function pickUser(user) {
    setSelected(user)
    setStep('password')
    setPassword('')
    setError('')
  }

  async function handleLogin(e) {
    e.preventDefault()
    if (!password) return setError('הכנס/י סיסמה')
    setLoading(true)
    setError('')

    const { data } = await supabase
      .from('app_users')
      .select('couple_name, role')
      .eq('couple_name', selected.name)
      .eq('password', password)
      .maybeSingle()

    setLoading(false)
    if (!data) return setError('סיסמה שגויה')
    onLogin({ couple_name: data.couple_name, role: data.role })
  }

  if (step === 'select') {
    return (
      <div className="login-screen" dir="rtl">
        <div className="login-header">
          <div className="login-logo">🏠</div>
          <h1>ביקורים אצל אמא ואבא</h1>
          <p>בחר/י את הזוג שלך</p>
        </div>
        <div className="login-grid">
          {ALL_USERS.map(user => (
            <button key={user.name} className="login-couple-btn" onClick={() => pickUser(user)}>
              <Avatar name={user.name} photo={user.photo} size={60} />
              <span>{user.name}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen" dir="rtl">
      <div className="login-card">
        <button className="back-btn" onClick={() => setStep('select')}>→ חזור</button>
        <Avatar name={selected.name} photo={selected.photo} size={80} />
        <h2>{selected.name}</h2>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="password-input"
            autoFocus
            dir="ltr"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-join login-btn">
            {loading ? '...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Change Password Modal ──────────────────────────────────
function ChangePasswordModal({ currentUser, onClose }) {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (next.length < 4)       return setError('הסיסמה חייבת להכיל לפחות 4 תווים')
    if (next !== confirm)      return setError('הסיסמאות לא תואמות')

    setLoading(true)

    // verify current password
    const { data } = await supabase
      .from('app_users')
      .select('couple_name')
      .eq('couple_name', currentUser.couple_name)
      .eq('password', current)
      .maybeSingle()

    if (!data) {
      setLoading(false)
      return setError('הסיסמה הנוכחית שגויה')
    }

    const { error: updateError } = await supabase
      .from('app_users')
      .update({ password: next })
      .eq('couple_name', currentUser.couple_name)

    setLoading(false)
    if (updateError) return setError('שגיאה בשמירה, נסה שוב')
    setSuccess(true)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" dir="rtl">
        <div className="modal-header">
          <h2>🔑 שינוי סיסמה</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {success ? (
          <div className="modal-success">
            <p>✅ הסיסמה שונתה בהצלחה!</p>
            <button className="btn btn-join" onClick={onClose}>סגור</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <label>סיסמה נוכחית</label>
            <input type="password" value={current}  onChange={e => setCurrent(e.target.value)}
              className="password-input" dir="ltr" autoFocus />

            <label>סיסמה חדשה</label>
            <input type="password" value={next}     onChange={e => setNext(e.target.value)}
              className="password-input" dir="ltr" />

            <label>אימות סיסמה חדשה</label>
            <input type="password" value={confirm}  onChange={e => setConfirm(e.target.value)}
              className="password-input" dir="ltr" />

            {error && <p className="login-error">{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-join">
              {loading ? '...' : 'שמור סיסמה'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────
export default function App() {
  const [currentUser,  setCurrentUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('currentUser')) } catch { return null }
  })
  const [registrations,      setRegistrations]      = useState({})
  const [blockedDates,       setBlockedDates]       = useState(new Set())
  const [notes,              setNotes]              = useState({})
  const [dbError,            setDbError]            = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  const events  = useMemo(() => buildEvents(), [])
  const isAdmin = currentUser?.role === 'admin'

  function handleLogin(user) {
    setCurrentUser(user)
    localStorage.setItem('currentUser', JSON.stringify(user))
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      registerPush(user.couple_name, user.role)
    }
  }

  function handleLogout() {
    setCurrentUser(null)
    localStorage.removeItem('currentUser')
  }

  // ── Load data + realtime ──
  useEffect(() => {
    if (!isConfigured) { setDbError(true); return }

    supabase.from('registrations').select('event_id, couple_name, note, status')
      .then(({ data, error }) => {
        if (error) { setDbError(true); return }
        const map = {}
        for (const row of (data || [])) {
          if (!map[row.event_id]) map[row.event_id] = []
          map[row.event_id].push({ couple_name: row.couple_name, note: row.note || '', status: row.status || 'approved' })
        }
        setRegistrations(map)
      })

    supabase.from('blocked_dates').select('date_id')
      .then(({ data }) => {
        if (data) setBlockedDates(new Set(data.map(d => d.date_id)))
      })

    const regChannel = supabase.channel('registrations-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'registrations' },
        ({ new: row }) => {
          setRegistrations(prev => ({
            ...prev,
            [row.event_id]: [...(prev[row.event_id] || []), { couple_name: row.couple_name, note: row.note || '', status: row.status || 'pending' }],
          }))
          // Notify admin when a new pending request arrives
          const stored = localStorage.getItem('currentUser')
          const user   = stored ? JSON.parse(stored) : null
          if (user?.role === 'admin' && row.status === 'pending') {
            showNotification('🏠 בקשה חדשה!', `${row.couple_name} מבקשים לבוא`)
          }
        }
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
            r.couple_name === row.couple_name ? { ...r, note: row.note || '', status: row.status } : r
          ),
        }))
      )
      .subscribe()

    const blockedChannel = supabase.channel('blocked-dates-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'blocked_dates' },
        ({ new: row }) => setBlockedDates(prev => new Set([...prev, row.date_id]))
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'blocked_dates' },
        ({ old: row }) => setBlockedDates(prev => { const s = new Set(prev); s.delete(row.date_id); return s })
      )
      .subscribe()

    return () => {
      supabase.removeChannel(regChannel)
      supabase.removeChannel(blockedChannel)
    }
  }, [])

  // ── Actions ──
  async function handleRegister(eventId) {
    if (!currentUser || isAdmin) return
    const current = registrations[eventId] || []
    const myReg   = current.find(r => r.couple_name === currentUser.couple_name)

    if (myReg) {
      await supabase.from('registrations')
        .delete().eq('event_id', eventId).eq('couple_name', currentUser.couple_name)
    } else {
      const approvedCount = current.filter(r => r.status === 'approved').length
      if (approvedCount >= MAX_COUPLES) return
      const note = notes[eventId] || ''
      const { error } = await supabase.from('registrations')
        .insert({ event_id: eventId, couple_name: currentUser.couple_name, note: note || null, status: 'pending' })
      if (!error) {
        setNotes(prev => ({ ...prev, [eventId]: '' }))
        // שלח התראה לאבא דרך השרת
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: { couple_name: currentUser.couple_name, event_id: eventId } }),
        }).catch(() => {})
      }
    }
  }

  async function handleApprove(eventId, coupleName) {
    await supabase.from('registrations')
      .update({ status: 'approved' })
      .eq('event_id', eventId).eq('couple_name', coupleName)
  }

  async function handleReject(eventId, coupleName) {
    await supabase.from('registrations')
      .delete()
      .eq('event_id', eventId).eq('couple_name', coupleName)
  }

  async function handleBlockDate(dateId) {
    if (blockedDates.has(dateId)) {
      await supabase.from('blocked_dates').delete().eq('date_id', dateId)
    } else {
      await supabase.from('blocked_dates').insert({ date_id: dateId })
    }
  }

  const pendingCount = Object.values(registrations).flat().filter(r => r.status === 'pending').length

  // ── Render ──
  if (!currentUser) return <LoginScreen onLogin={handleLogin} />

  return (
    <div className="app" dir="rtl">
      <header className="header">
        <h1>🏠 ביקורים אצל אמא ואבא</h1>
        <p className="subtitle">מקסימום {MAX_COUPLES} זוגות בכל שבת / חג</p>
      </header>

      <div className="name-bar">
        <div className="name-bar-user">
          <Avatar
            name={currentUser.couple_name}
            photo={COUPLES.find(c => c.name === currentUser.couple_name)?.photo || ''}
            size={32}
          />
          <span className="name-label">{currentUser.couple_name}</span>
          {isAdmin && <span className="admin-badge">מנהל</span>}
        </div>
        <button className="change-pass-btn" onClick={() => setShowChangePassword(true)} title="שינוי סיסמה">🔑</button>
        <button className="logout-btn" onClick={handleLogout}>יציאה</button>
      </div>

      {showChangePassword && (
        <ChangePasswordModal currentUser={currentUser} onClose={() => setShowChangePassword(false)} />
      )}

      {isAdmin && pendingCount > 0 && (
        <div className="pending-banner">
          ⏳ {pendingCount} בקש{pendingCount === 1 ? 'ה' : 'ות'} ממתינ{pendingCount === 1 ? 'ת' : 'ות'} לאישור
        </div>
      )}

      {dbError && (
        <div className="error-banner">⚠️ שגיאה בחיבור למסד הנתונים</div>
      )}

      <main className="events">
        {events.map(event => {
          const regs        = registrations[event.id] || []
          const approvedRegs = regs.filter(r => r.status === 'approved')
          const pendingRegs  = regs.filter(r => r.status === 'pending')
          const myReg        = regs.find(r => r.couple_name === currentUser.couple_name)
          const isBlocked    = blockedDates.has(event.id)
          const isChag       = event.type === 'chag' || event.type === 'chag-shabbat'
          const isFull       = approvedRegs.length >= MAX_COUPLES
          const spotsLeft    = MAX_COUPLES - approvedRegs.length

          // pending regs visible to couple: only their own; to admin: all
          const visiblePending = isAdmin ? pendingRegs : pendingRegs.filter(r => r.couple_name === currentUser.couple_name)

          return (
            <div key={event.id} className={[
              'card',
              isChag ? 'card-chag' : 'card-shabbat',
              isBlocked ? 'card-blocked' : '',
              myReg?.status === 'approved' ? 'card-mine' : '',
            ].join(' ')}>

              <div className="card-header">
                <div className="card-title">
                  <span className="event-icon">{isChag ? '✨' : isBlocked ? '🚫' : '🕯️'}</span>
                  <span className="event-name">{event.name}</span>
                </div>
                <div className="card-header-right">
                  {isBlocked
                    ? <span className="badge badge-blocked">לא פנוי</span>
                    : <span className={`badge ${isFull ? 'badge-full' : 'badge-open'}`}>
                        {isFull ? 'מלא' : `${spotsLeft} מקומות פנויים`}
                      </span>
                  }
                  {isAdmin && (
                    <button
                      className={`block-btn ${isBlocked ? 'block-btn-active' : ''}`}
                      onClick={() => handleBlockDate(event.id)}
                    >
                      {isBlocked ? '✅ פתח' : '🚫 חסום'}
                    </button>
                  )}
                </div>
              </div>

              <p className="event-date">{formatDate(event.date)}</p>
              <p className="event-hebrew">
                {event.hebrewDate}
                {event.parasha ? <span className="parasha"> · {event.parasha}</span> : null}
              </p>

              <div className="registrations">
                {approvedRegs.length === 0 && visiblePending.length === 0 ? (
                  <span className="empty-slots">עוד אף אחד לא נרשם</span>
                ) : (
                  <>
                    {approvedRegs.map(reg => {
                      const photo = COUPLES.find(c => c.name === reg.couple_name)?.photo || ''
                      return (
                        <div key={reg.couple_name} className="couple-entry">
                          <span className={`couple-tag ${reg.couple_name === currentUser.couple_name ? 'tag-mine' : 'tag-other'}`}>
                            <Avatar name={reg.couple_name} photo={photo} size={24} />
                            {reg.couple_name === currentUser.couple_name ? '✓ ' : ''}{reg.couple_name}
                          </span>
                          {reg.note && <p className="couple-note">💬 {reg.note}</p>}
                        </div>
                      )
                    })}

                    {visiblePending.map(reg => {
                      const photo = COUPLES.find(c => c.name === reg.couple_name)?.photo || ''
                      return (
                        <div key={reg.couple_name} className="couple-entry">
                          <span className="couple-tag tag-pending">
                            <Avatar name={reg.couple_name} photo={photo} size={24} />
                            ⏳ {reg.couple_name}
                          </span>
                          {reg.note && <p className="couple-note">💬 {reg.note}</p>}
                          {isAdmin && (
                            <div className="admin-actions">
                              <button className="approve-btn" onClick={() => handleApprove(event.id, reg.couple_name)}>✅ אשר</button>
                              <button className="reject-btn"  onClick={() => handleReject(event.id, reg.couple_name)}>❌ דחה</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>

              {/* Register area — couples only */}
              {!isAdmin && !isBlocked && (
                <>
                  {!myReg && !isFull && (
                    <textarea
                      className="note-input"
                      placeholder="בקשה מיוחדת — עיצוב חדר, אוכל אהוב... (אופציונלי)"
                      rows={2}
                      value={notes[event.id] || ''}
                      onChange={e => setNotes(prev => ({ ...prev, [event.id]: e.target.value }))}
                    />
                  )}
                  <button
                    className={`btn ${
                      myReg
                        ? myReg.status === 'pending' ? 'btn-pending' : 'btn-cancel'
                        : isFull ? 'btn-full' : 'btn-join'
                    }`}
                    onClick={() => handleRegister(event.id)}
                    disabled={isFull && !myReg}
                  >
                    {myReg
                      ? myReg.status === 'pending' ? '⏳ ממתין לאישור — לחץ לביטול' : '❌ ביטול'
                      : isFull ? 'מלא' : '✅ שלח בקשה'
                    }
                  </button>
                </>
              )}

              {!isAdmin && isBlocked && (
                <p className="blocked-message">🚫 השבת הזאת לא פנויה לאירוח</p>
              )}
            </div>
          )
        })}
      </main>
    </div>
  )
}
