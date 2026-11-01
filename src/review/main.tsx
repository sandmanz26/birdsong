/**
 * Curator review tool (content standard v1). Dev-only: `npm run review`.
 * An expert listens to each candidate, signs the human checks, names the isian, approves or rejects,
 * and exports content/curation.json. Publishing (npm run catalog:publish) re-validates everything.
 */
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Candidate, CandidateFile } from '../../scripts/candidate-types';
import { CHECKS, publishBlockers, STANDARD_VERSION, type Approval } from '../../scripts/standard';
import { decodeMono } from '../audio/decode';
import { seriesColor } from '../components/Charts';
import { Spectrogram } from '../components/Spectrogram';
import { workerSpectrogram, type DisplaySpec } from '../dsp/client';
import '../styles.css';
import './review.css';

const BASE = '/review/candidates/';
const DRAFT_KEY = 'kc-review-draft-v1';
type Curation = { exclude: string[]; approvals: Record<string, Approval>; [k: string]: unknown };

function loadDraft(): { curator: string; role: string; approvals: Record<string, Approval>; exclude: string[] } | null {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function emptyApproval(c: Candidate, curator: string, role: string): Approval {
  return {
    decision: 'approve',
    curator,
    role,
    date: new Date().toISOString().slice(0, 10),
    checks: {},
    isian: Object.fromEntries(c.isian.map((i) => [i.id, { nameId: '', nameEn: '' }])),
    notes: '',
  };
}

function App() {
  const [file, setFile] = useState<CandidateFile | null>(null);
  const [base, setBase] = useState<Curation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = useMemo(loadDraft, []);
  const [curator, setCurator] = useState(draft?.curator ?? '');
  const [role, setRole] = useState(draft?.role ?? '');
  const [approvals, setApprovals] = useState<Record<string, Approval>>(draft?.approvals ?? {});
  const [exclude, setExclude] = useState<string[]>(draft?.exclude ?? []);
  const [species, setSpecies] = useState<string>('all');

  useEffect(() => {
    Promise.all([fetch(BASE + 'candidates.json').then((r) => r.json()), fetch('/content/curation.json').then((r) => r.json())])
      .then(([f, cur]: [CandidateFile, Curation]) => {
        setFile(f);
        setBase(cur);
        // Start from the committed curation when there is no local draft.
        if (!draft) {
          setApprovals(cur.approvals ?? {});
          setExclude(cur.exclude ?? []);
        }
      })
      .catch((e) => setError(String(e)));
  }, [draft]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ curator, role, approvals, exclude }));
    } catch {
      /* ignore */
    }
  }, [curator, role, approvals, exclude]);

  if (error) return <p className="pad warn">Tidak bisa memuat kandidat: {error}. Jalankan dulu <code>npm run catalog:candidates</code>.</p>;
  if (!file || !base) return <p className="pad">Memuat…</p>;

  const list = file.candidates.filter((c) => species === 'all' || c.species === species);
  const speciesList = [...new Set(file.candidates.map((c) => c.species))];
  const decided = Object.keys(approvals).filter((id) => file.candidates.some((c) => c.id === id));
  const publishable = file.candidates.filter((c) => publishBlockers(c.auto, approvals[c.id]).length === 0);

  const exportCuration = () => {
    const out: Curation = { ...base, exclude: [...new Set(exclude)], approvals };
    const blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'curation.json';
    a.click();
  };

  return (
    <div className="review">
      <header className="review-head">
        <h1>Kurasi Katalog Masteran · Standar Konten v{STANDARD_VERSION}</h1>
        <p className="muted small">
          Dengarkan setiap kandidat dengan headphone. Setujui hanya jika SEMUA pemeriksaan terpenuhi. Hasil ekspor: simpan sebagai <code>content/curation.json</code>, lalu jalankan <code>npm run catalog:publish</code>.
        </p>
        <div className="row gap wrap">
          <label className="inline-field">Nama kurator<input value={curator} onChange={(e) => setCurator(e.target.value)} placeholder="mis. Budi Santoso" /></label>
          <label className="inline-field">Peran / kredensial<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="mis. Juri PBI, 10 th" /></label>
          <label className="inline-field">Jenis
            <select value={species} onChange={(e) => setSpecies(e.target.value)}>
              <option value="all">Semua ({file.candidates.length})</option>
              {speciesList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <span className="small">Diputuskan: <strong>{decided.length}</strong> · Siap terbit: <strong>{publishable.length}</strong></span>
          <button className="btn primary" onClick={exportCuration}>⤓ Ekspor curation.json</button>
        </div>
        {!curator.trim() || !role.trim() ? <p className="warn small">Isi nama dan peran kurator sebelum menilai — persetujuan tanpa identitas tidak akan diterbitkan.</p> : null}
      </header>
      {list.map((c) => (
        <CandidateCard
          key={c.id}
          c={c}
          approval={approvals[c.id]}
          excluded={exclude.includes(c.key)}
          onChange={(a) => setApprovals((all) => ({ ...all, [c.id]: { ...a, curator, role } }))}
          onExclude={(x) => setExclude((all) => (x ? [...all, c.key] : all.filter((k) => k !== c.key)))}
          curator={curator}
          role={role}
        />
      ))}
    </div>
  );
}

function CandidateCard({ c, approval, excluded, onChange, onExclude, curator, role }: {
  c: Candidate; approval?: Approval; excluded: boolean; curator: string; role: string;
  onChange: (a: Approval) => void; onExclude: (x: boolean) => void;
}) {
  const [spec, setSpec] = useState<DisplaySpec | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const a = approval ?? emptyApproval(c, curator, role);
  const blockers = publishBlockers(c.auto, approval ? { ...approval, curator, role } : undefined);

  useEffect(() => {
    let alive = true;
    fetch(BASE + c.file)
      .then((r) => r.blob())
      .then(decodeMono)
      .then((x) => workerSpectrogram(x, Math.ceil(c.durationSec * 60)))
      .then((s) => alive && setSpec(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [c.file, c.durationSec]);

  const playRange = (start: number, end: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, start - 0.15);
    stopAt.current = end + 0.15;
    void el.play();
  };

  const set = (patch: Partial<Approval>) => onChange({ ...a, ...patch });
  const humanChecks = CHECKS.filter((k) => k.kind === 'human');
  const autoList = CHECKS.filter((k) => k.kind === 'auto');

  return (
    <section className={'card review-card' + (blockers.length === 0 ? ' ok' : '')}>
      <div className="row between wrap">
        <div>
          <h2>{c.nameId} <em className="muted small">{c.sci}</em></h2>
          <p className="small">
            “{c.title}” · {c.recordist} · {c.country ?? 'lokasi ?'} · <a href={c.sourceUrl} target="_blank" rel="noreferrer">{c.source}</a> ·{' '}
            <a href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a> · <code>{c.id}</code>
          </p>
        </div>
        <span className={'status ' + (blockers.length === 0 ? 'status-masuk' : 'status-belum')}>{blockers.length === 0 ? '✓ Siap terbit' : `${blockers.length} hambatan`}</span>
      </div>
      <audio ref={audioRef} controls preload="none" src={BASE + c.file} onTimeUpdate={(e) => {
        if (stopAt.current !== null && e.currentTarget.currentTime >= stopAt.current) {
          e.currentTarget.pause();
          stopAt.current = null;
        }
      }} />
      <Spectrogram
        spec={spec}
        durationSec={c.durationSec}
        minPxPerSec={40}
        regions={c.isian.map((i, k) => ({ key: i.id, startSec: i.startSec, endSec: i.endSec, color: seriesColor(k), label: a.isian[i.id]?.nameId || `isian ${k + 1}` }))}
        onRegionClick={(k) => {
          const i = c.isian.find((x) => x.id === k);
          if (i) playRange(i.startSec, i.endSec);
        }}
        ariaLabel={c.nameId}
      />
      <div className="review-grid">
        <div>
          <h3>Pemeriksaan otomatis</h3>
          <table className="data-table">
            <tbody>
              {autoList.map((k) => {
                const r = c.auto[k.id];
                return (
                  <tr key={k.id}>
                    <td><strong>{k.id}</strong> {k.titleId}<div className="muted small">{k.basis}</div></td>
                    <td className={'chk chk-' + r?.status}>{r?.status === 'pass' ? '✓' : r?.status === 'fail' ? '✗' : '?'} {r?.value}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Pemeriksaan ahli (wajib semua)</h3>
          {humanChecks.map((k) => (
            <label key={k.id} className="check-row">
              <input type="checkbox" checked={!!a.checks[k.id]} onChange={(e) => set({ checks: { ...a.checks, [k.id]: e.target.checked } })} />
              <span><strong>{k.id}</strong> {k.titleId}</span>
            </label>
          ))}
          <h3>Nama isian (nama komunitas)</h3>
          {c.isian.length === 0 && <p className="muted small">Tidak ada frasa berulang ≥ 0,5 dtk yang terdeteksi otomatis.</p>}
          {c.isian.map((i, k) => (
            <div key={i.id} className="row gap wrap isian-name">
              <button className="btn small" onClick={() => playRange(i.startSec, i.endSec)}>▶ {k + 1}</button>
              <span className="muted small">{i.startSec.toFixed(2)}–{i.endSec.toFixed(2)} dtk · {i.repeats}×</span>
              <input placeholder="Nama (ID), kosong = buang" value={a.isian[i.id]?.nameId ?? ''} onChange={(e) => set({ isian: { ...a.isian, [i.id]: { nameEn: a.isian[i.id]?.nameEn ?? '', nameId: e.target.value } } })} />
              <input placeholder="Name (EN)" value={a.isian[i.id]?.nameEn ?? ''} onChange={(e) => set({ isian: { ...a.isian, [i.id]: { nameId: a.isian[i.id]?.nameId ?? '', nameEn: e.target.value } } })} />
            </div>
          ))}
          <label className="field">
            <span>Catatan</span>
            <input value={a.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
          </label>
          <div className="row gap wrap">
            <button className={'btn ' + (approval?.decision === 'approve' ? 'primary' : '')} onClick={() => set({
              decision: 'approve', date: new Date().toISOString().slice(0, 10),
              // Isian left unnamed are dropped from the publication.
              isian: Object.fromEntries(Object.entries(a.isian).filter(([, n]) => n.nameId.trim() && n.nameEn.trim())),
            })}>✓ Setujui</button>
            <button className={'btn ' + (approval?.decision === 'reject' ? 'danger' : '')} onClick={() => set({ decision: 'reject', date: new Date().toISOString().slice(0, 10) })}>✗ Tolak</button>
            <label className="check-row small"><input type="checkbox" checked={excluded} onChange={(e) => onExclude(e.target.checked)} /> Jangan pakai rekaman ini lagi</label>
          </div>
        </div>
      </div>
      {blockers.length > 0 && <p className="warn small">Belum bisa terbit: {blockers.join(' · ')}</p>}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
