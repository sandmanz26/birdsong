import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestPersistence } from './db';
import { I18nContext, translator, type Lang } from './i18n';
import { NavContext, type Route } from './nav';
import { BirdDetail } from './screens/BirdDetail';
import { BirdForm } from './screens/BirdForm';
import { BirdsScreen } from './screens/Birds';
import { LibraryScreen } from './screens/Library';
import { MoreScreen } from './screens/More';
import { Player } from './screens/Player';
import { TrackEditor } from './screens/TrackEditor';

function loadLang(): Lang {
  try {
    const v = localStorage.getItem('lang');
    if (v === 'id' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('id') || !navigator.language?.startsWith('en') ? 'id' : 'en';
}

const topLevel = (r: Route) => (r.name === 'library' || r.name === 'track' ? 'library' : r.name === 'more' ? 'more' : 'birds');

export function App() {
  const [lang, setLangState] = useState<Lang>(loadLang);
  const [route, setRoute] = useState<Route>(() => (history.state as Route | null) ?? { name: 'birds' });

  const i18n = useMemo(
    () => ({
      t: translator(lang),
      lang,
      locale: lang === 'id' ? 'id-ID' : 'en-GB',
      setLang: (l: Lang) => {
        setLangState(l);
        try {
          localStorage.setItem('lang', l);
        } catch {
          /* ignore */
        }
      },
    }),
    [lang],
  );

  const nav = useCallback((r: Route) => {
    // Tab switches within a bird replace history; everything else pushes (so Android back works).
    const replace = r.name === 'bird' && history.state?.name === 'bird' && history.state?.id === r.id;
    if (replace) history.replaceState(r, '');
    else history.pushState(r, '');
    setRoute(r);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!history.state) history.replaceState({ name: 'birds' }, '');
    const onPop = (e: PopStateEvent) => setRoute((e.state as Route) ?? { name: 'birds' });
    window.addEventListener('popstate', onPop);
    requestPersistence();
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = i18n.t;
  const isPlayer = route.name === 'player';
  const showBack = route.name !== 'birds' && route.name !== 'library' && route.name !== 'more';

  return (
    <I18nContext.Provider value={i18n}>
      <NavContext.Provider value={nav}>
        <div className={'app' + (isPlayer ? ' immersive' : '')}>
          {!isPlayer && (
            <header className="topbar">
              {showBack ? (
                <button className="icon-btn" onClick={() => history.back()} aria-label={t('back')}>←</button>
              ) : (
                <span className="logo" aria-hidden>
                  <svg viewBox="0 0 64 64" width="28" height="28"><path d="M14 40c8 0 12-6 14-14 2-8 8-14 18-12l6-4-2 8c2 10-4 22-18 24l-4 10-4-9c-4 0-8-1-10-3z" fill="var(--accent)" /></svg>
                </span>
              )}
              <div className="grow">
                <h1>{t('appName')}</h1>
                {!showBack && <p className="tagline">{t('tagline')}</p>}
              </div>
              <button className="lang-toggle" onClick={() => i18n.setLang(lang === 'id' ? 'en' : 'id')} aria-label={t('language')}>
                {lang === 'id' ? 'EN' : 'ID'}
              </button>
            </header>
          )}
          <main className="content">
            {route.name === 'birds' && <BirdsScreen />}
            {route.name === 'birdForm' && <BirdForm id={route.id} />}
            {route.name === 'bird' && <BirdDetail id={route.id} tab={route.tab} checkId={route.checkId} />}
            {route.name === 'player' && <Player birdId={route.birdId} mode={route.mode} minutes={route.minutes} />}
            {route.name === 'library' && <LibraryScreen />}
            {route.name === 'track' && <TrackEditor id={route.id} />}
            {route.name === 'more' && <MoreScreen />}
          </main>
          {!isPlayer && (
            <nav className="bottombar">
              {(
                [
                  ['birds', '🐦', t('navBirds')],
                  ['library', '♫', t('navLibrary')],
                  ['more', '⋯', t('navMore')],
                ] as const
              ).map(([name, icon, label]) => (
                <button key={name} className={topLevel(route) === name ? 'on' : ''} aria-current={topLevel(route) === name ? 'page' : undefined} onClick={() => nav({ name } as Route)}>
                  <span aria-hidden className="nav-icon">{icon}</span>
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>
      </NavContext.Provider>
    </I18nContext.Provider>
  );
}
