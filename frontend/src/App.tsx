import { useState } from 'react'

type SessionDetail = {
  id: string
  status: string
  transcription: { raw_text: string; source: string } | null
  clinical_data: Record<string, unknown> | null
  audit_events: { event_type: string }[]
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.detail ?? 'No se pudo completar la operación.')
  return result as T
}

function App() {
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [transcript, setTranscript] = useState('Paciente presenta dolor en la pieza 26 desde hace aproximadamente tres días.')
  const [dataJson, setDataJson] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<SessionDetail | { status: string; fields_count: number }>) {
    setBusy(true)
    setNotice('')
    try {
      const result = await action()
      if ('id' in result) {
        setSession(result)
        if (result.clinical_data) setDataJson(JSON.stringify(result.clinical_data, null, 2))
      } else {
        setNotice(`Mock SMILE: ${result.status} · ${result.fields_count} campos`)
        if (session) setSession(await request<SessionDetail>(`/sessions/${session.id}`))
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
    } finally {
      setBusy(false)
    }
  }

  function createSession() {
    return run(() => request<SessionDetail>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ display_name: 'Odontólogo de prueba' }),
    }))
  }

  function submitTranscript() {
    if (!session) return
    return run(() => request<SessionDetail>(`/sessions/${session.id}/transcription`, {
      method: 'POST',
      body: JSON.stringify({ raw_text: transcript }),
    }))
  }

  function processTranscript() {
    if (!session) return
    return run(() => request<SessionDetail>(`/sessions/${session.id}/process`, { method: 'POST' }))
  }

  async function saveReview() {
    if (!session) throw new Error('No hay una sesión activa.')
    const structuredData = JSON.parse(dataJson) as Record<string, unknown>
    return request<SessionDetail>(`/sessions/${session.id}/clinical-data`, {
      method: 'PATCH',
      body: JSON.stringify({ structured_data: structuredData }),
    })
  }

  async function confirmReview() {
    if (!session) throw new Error('No hay una sesión activa.')
    const saved = await saveReview()
    setSession(saved)
    return request<SessionDetail>(`/sessions/${session.id}/confirm`, { method: 'POST' })
  }

  function cancelSession() {
    if (!session) return
    return run(() => request<SessionDetail>(`/sessions/${session.id}/cancel`, { method: 'POST' }))
  }

  function syncSmile() {
    if (!session) return
    return run(() => request<{ status: string; fields_count: number }>(`/sessions/${session.id}/smile-sync`, { method: 'POST' }))
  }

  function completeSession() {
    if (!session) return
    return run(() => request<SessionDetail>(`/sessions/${session.id}/complete`, { method: 'POST' }))
  }

  const synced = session?.audit_events.some((event) => event.event_type === 'SMILE_SYNC_COMPLETED') ?? false

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="DentAI inicio">
          <span className="wordmark-mark" aria-hidden="true">D</span>
          <span>DentAI</span>
        </a>
        <span className="clinic-label">CLÍNICA CREO <span>·</span> UPCH</span>
      </header>

      <section className="welcome" aria-labelledby="page-title">
        <p className="eyebrow">ASISTENCIA CLÍNICA</p>
        <h1 id="page-title">Registro de atención</h1>
        <p className="intro">La información se revisa y confirma antes de cualquier envío.</p>
      </section>

      <section className="session-panel" aria-label="Flujo de sesión clínica">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">SESIÓN CLÍNICA</p>
            <h2>{session ? `Estado: ${session.status}` : 'Nueva atención'}</h2>
          </div>
          <span className="status"><span className="status-dot" /> MOCK LOCAL</span>
        </div>
        <div className="panel-rule" />

        {!session && <button disabled={busy} onClick={createSession}>Crear sesión</button>}

        {session?.status === 'CREATED' && (
          <div className="form-section">
            <label htmlFor="transcript">Transcripción simulada</label>
            <textarea id="transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={4} />
            <button disabled={busy || !transcript.trim()} onClick={submitTranscript}>Agregar transcripción</button>
          </div>
        )}

        {session?.status === 'PROCESSING' && (
          <div className="form-section">
            <p className="panel-note">{session.transcription?.raw_text}</p>
            <button disabled={busy} onClick={processTranscript}>Procesar información simulada</button>
          </div>
        )}

        {session?.status === 'REVIEW' && (
          <div className="form-section">
            <div>
              <label>Transcripción</label>
              <p className="transcript-preview">{session.transcription?.raw_text}</p>
            </div>
            <label htmlFor="clinical-data">Datos estructurados · JSON editable</label>
            <textarea id="clinical-data" className="code-input" value={dataJson} onChange={(event) => setDataJson(event.target.value)} rows={7} spellCheck={false} />
            <div className="actions">
              <button disabled={busy} onClick={() => run(saveReview)}>Guardar cambios</button>
              <button className="primary" disabled={busy} onClick={() => run(confirmReview)}>Confirmar revisión</button>
              <button className="quiet" disabled={busy} onClick={cancelSession}>Cancelar</button>
            </div>
          </div>
        )}

        {session?.status === 'CONFIRMED' && (
          <div className="form-section">
            <p className="confirmed-note">Revisión confirmada. La información ya puede enviarse al mock de SMILE.</p>
            <pre>{JSON.stringify(session.clinical_data, null, 2)}</pre>
            <div className="actions">
              {!synced && <button className="primary" disabled={busy} onClick={syncSmile}>Enviar al mock de SMILE</button>}
              {synced && <button disabled={busy} onClick={completeSession}>Finalizar sesión</button>}
            </div>
          </div>
        )}

        {session?.status === 'COMPLETED' && <p className="confirmed-note">Sesión finalizada. El registro simulado quedó auditado.</p>}
        {session?.status === 'CANCELLED' && <p className="panel-note">Sesión cancelada.</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {session && <p className="session-id">ID de sesión: {session.id}</p>}
      </section>

      <footer>CREO · Facultad de Estomatología <span>Prototipo local</span></footer>
    </main>
  )
}

export default App