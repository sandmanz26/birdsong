import { useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { getSpecies, OTHER_SPECIES, searchSpecies, type SpeciesInfo } from '../species';

/** Searchable species list (name, scientific name or local alias, e.g. "pentet" → Cendet). */
export function SpeciesPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchSpecies(query), [query]);
  const name = (s: SpeciesInfo) => (lang === 'id' ? s.nameId : s.nameEn);
  const option = (id: string, label: string, sub?: string) => (
    <label key={id} className={'species-option' + (value === id ? ' on' : '')}>
      <input type="radio" name="species" value={id} checked={value === id} onChange={() => onChange(id)} />
      <span>
        <strong>{label}</strong>
        {sub && <span className="muted small block">{sub}</span>}
      </span>
    </label>
  );
  return (
    <fieldset className="field">
      <legend>{t('species')}</legend>
      <input type="search" placeholder={t('speciesSearch')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('speciesSearch')} />
      <div className="species-list" role="radiogroup" aria-label={t('species')}>
        {results.map((s) => option(s.id, name(s), [s.sci, ...s.aliases.slice(0, 2)].join(' · ')))}
        {option(OTHER_SPECIES, lang === 'id' ? 'Jenis lain' : 'Other species')}
      </div>
      {results.length === 0 && <p className="muted small">{t('speciesNoMatch')}</p>}
      <SpeciesNotices id={value} />
    </fieldset>
  );
}

/** Legal and conservation notices with their sources (information, not legal advice). */
export function SpeciesNotices({ id }: { id: string }) {
  const { t } = useI18n();
  const s = getSpecies(id);
  if (!s || (!s.legal && !s.conservation)) return null;
  return (
    <div className="stack">
      {s.legal?.status === 'protected' && (
        <p className="notice warn-notice">⚠ {t('legalProtected')} <a href={s.legal.source} target="_blank" rel="noreferrer">{t('source')}</a></p>
      )}
      {s.legal?.status === 'permit_reported' && (
        <p className="notice warn-notice">⚠ {t('legalPermitReported')} <a href={s.legal.source} target="_blank" rel="noreferrer">{t('source')}</a></p>
      )}
      {s.legal?.status === 'delisted_2018' && (
        <p className="notice">ⓘ {t('legalDelisted')} <a href={s.legal.source} target="_blank" rel="noreferrer">{t('source')}</a></p>
      )}
      {s.conservation && <p className="notice warn-notice">🌿 {t('conservationNote')} {s.conservation}</p>}
    </div>
  );
}
