import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './lib/supabase';
import CategoryList from './components/CategoryList';
import FeedbackWidget from './components/FeedbackWidget';
import LandingPage from './components/LandingPage';
import ProblemView from './components/ProblemView';
import SessionSummary from './components/SessionSummary';
import { isSectionAllowed, userSection } from './utils/categoryUtils';
import { fromDb } from './utils/problemMapper';
import { fromUserDb } from './utils/userProblemMapper';
import { shouldDeferResult, collectPendingUpgrades } from './utils/sessionResultsUtils';
import {
  saveRoundStart, saveRoundRetry, clearRound, loadRound,
  saveCurrentIndex, saveRoundResults, saveRoundAnswers,
  saveSessionFirstResults, saveSessionStartResults, saveShowSummary,
} from './utils/roundStorage';
import './App.css';

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// localStorage に保存される ON/OFF 設定（シャッフル出題・未回答のみ等）
function useLocalStorageToggle(key, defaultValue) {
  const [on, setOn] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === 'true';
  });
  const toggle = useCallback(() => {
    setOn(prev => {
      localStorage.setItem(key, String(!prev));
      return !prev;
    });
  }, [key]);
  return [on, toggle];
}

function LoadingSkeleton() {
  return (
    <div className="loading-skeleton" role="status" aria-label="読み込み中">
      <div className="skeleton-block skeleton-toggle" />
      <div className="skeleton-tabs">
        <div className="skeleton-block skeleton-tab" />
        <div className="skeleton-block skeleton-tab" />
        <div className="skeleton-block skeleton-tab" />
      </div>
      <div className="skeleton-block skeleton-heading" />
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton-block skeleton-card" />
      ))}
    </div>
  );
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) console.error('OAuth error:', error);
}

export default function App() {
  // 問題一覧。どのログイン状態（key = ユーザーID or 'anon'）で取得したかをセットで持ち、
  // key が現在のセッションと食い違う間は loading 扱いにする
  const [problemsState, setProblemsState] = useState(null); // { key, problems } | null
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingKey, setPlayingKey] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [orderedProblems, setOrderedProblems] = useState([]);
  const [randomMode, toggleRandomMode] = useLocalStorageToggle('randomMode', true);
  const [unansweredOnlyMode, toggleUnansweredOnlyMode] = useLocalStorageToggle('unansweredOnlyMode', false);
  const [wrongOnlyMode, toggleWrongOnlyMode] = useLocalStorageToggle('wrongOnlyMode', false);
  const restoredRef = useRef(false);
  const [session, setSession] = useState(null);
  // セッション復元が終わったか。終わるまでは session が null なので、
  // ログイン済みでも一瞬ランディングが見えてしまうのを防ぐために持つ
  const [authChecked, setAuthChecked] = useState(false);
  // アクセス許可情報。どのメールに対する取得結果かをセットで持ち、
  // ログアウト・アカウント切替時は描画側の照合で自動的に未判定へ戻す
  const [allowedInfo, setAllowedInfo] = useState(null); // { email, isAllowed, allowedMajorCategories } | null
  // DB上の正誤記録。どのユーザーの記録かをセットで持つ（同上）
  const [resultsState, setResultsState] = useState(null); // { userId, map } | null
  // 今ラウンド（現在の出題一巡）の正誤。サマリー表示と再挑戦の抽出に使う
  const [roundResults, setRoundResults] = useState({});
  // 今ラウンドの回答内容（選んだ牌・リーチ選択・スーツ置換マップ）。
  // リロードや「前の問題」で戻ったときに回答済み状態を復元するために使う
  const [roundAnswers, setRoundAnswers] = useState({});
  // セッション内で最初に回答したときの正誤。DBへはこの1度目だけを記録する
  // （再挑戦で正解しても1度目の誤答を保持し、次回セッションで復習できるようにする）
  const [sessionFirstResults, setSessionFirstResults] = useState({});
  // ラウンド開始時点の DB 正誤スナップショット。「過去に不正解だった問題を今回正解した」の
  // 判定基準。これに該当する回答は即時記録せず、サマリーでの選択まで保留する
  const [sessionStartResults, setSessionStartResults] = useState({});
  const [showSummary, setShowSummary] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // index.html に直書きしたサイト説明（.site-about）は #root の外にあるため、
  // 何もしないと出題画面にも出続ける。トップ（ランディング・カテゴリ一覧）でだけ見せたいので
  // 出題ラウンド中は隠す。判定を「未ログインか」ではなく「出題中か」にしてあるのは、
  // 未ログインでも出題画面へ入れるようになったときに自動で追従させるため。
  // JSを実行しないクローラーは hidden が付かないまま読めるので SEO 上の意味も失われない
  // （React 側へ移してはいけない。CLAUDE.md の SEO 方針を参照）
  useEffect(() => {
    const el = document.querySelector('.site-about');
    if (!el) return;
    el.hidden = !(authChecked && !isPlaying);
  }, [authChecked, isPlaying]);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    const email = session.user.email;
    supabase
      .from('allowed_users')
      .select('email, allowed_major_categories')
      .eq('email', email)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setAllowedInfo({
          email,
          isAllowed: !!data,
          allowedMajorCategories: data?.allowed_major_categories ?? null,
        });
      });
    return () => { cancelled = true; };
  }, [session]);

  // null = 未ログイン or 判定中
  const currentAllowed = session && allowedInfo?.email === session.user.email ? allowedInfo : null;
  const isAllowed = currentAllowed ? currentAllowed.isAllowed : null;
  const allowedMajorCategories = currentAllowed?.allowedMajorCategories ?? null;

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    const userId = session.user.id;
    supabase
      .from('user_results')
      .select('problem_id, correct')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (error) { console.error('[results fetch]', error); return; }
        if (cancelled) return;
        const map = {};
        (data || []).forEach(r => { map[r.problem_id] = r.correct; });
        setResultsState({ userId, map });
      });
    return () => { cancelled = true; };
  }, [session]);

  const sessionKey = session?.user?.id ?? 'anon';
  const problems = problemsState?.problems ?? [];
  const userCategories = problemsState?.userCategories ?? [];
  const loading = problemsState?.key !== sessionKey;

  // 正誤は2箇所に分かれている。
  //   公式問題 … user_results（resultsState）
  //   自作問題 … user_problems.correct（problems の各行が持っている）
  // resultsState を後から重ねるのは、回答直後の楽観的更新を優先するため
  const results = (() => {
    const base = session && resultsState?.userId === session.user.id ? resultsState.map : {};
    const merged = {};
    for (const p of problems) {
      if (p.isUserProblem && p.correct != null) merged[p.id] = p.correct;
    }
    return Object.assign(merged, base);
  })();

  // 取得済みの正誤マップへの楽観的更新（未取得・別ユーザーの状態には触らない）
  function applyResultsUpdate(mutate) {
    setResultsState(prev => {
      if (!prev || !session || prev.userId !== session.user.id) return prev;
      return { userId: prev.userId, map: mutate(prev.map) };
    });
  }

  // 自作問題の正誤は user_results ではなく問題の行そのものが持つので、
  // 楽観的更新も problems 側へ書く（results はこの2つをマージして作っている）
  function applyUserProblemCorrect(ids, value) {
    const idSet = new Set(ids);
    setProblemsState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        problems: prev.problems.map(p =>
          p.isUserProblem && idSet.has(p.id) ? { ...p, correct: value } : p
        ),
      };
    });
  }

  function isUserProblemId(problemId) {
    return problems.find(p => p.id === problemId)?.isUserProblem === true;
  }

  // 正誤の保存先は問題の出所で変わる。
  //   公式問題 … user_results（problem_id は problems.id への FK）
  //   自作問題 … user_problems.correct（uuid は上の FK に入れられないため行が持つ）
  async function writeResults(entries) {
    if (!session || entries.length === 0) return;
    const official = entries.filter(e => !isUserProblemId(e.id));
    const mine     = entries.filter(e =>  isUserProblemId(e.id));

    const tasks = [];
    if (official.length > 0) {
      tasks.push(supabase.from('user_results').upsert(
        official.map(e => ({ user_id: session.user.id, problem_id: e.id, correct: e.correct })),
        { onConflict: 'user_id,problem_id' }
      ));
    }
    for (const e of mine) {
      tasks.push(supabase.from('user_problems')
        .update({ correct: e.correct, answered_at: new Date().toISOString() })
        .eq('id', e.id));
    }
    const failed = (await Promise.all(tasks)).find(r => r.error);
    if (failed) console.error('[writeResults]', failed.error);
  }

  // 進捗のリセット。自作問題は correct を null に戻す
  async function clearResults(problemIds) {
    if (!session || problemIds.length === 0) return;
    const official = problemIds.filter(id => !isUserProblemId(id));
    const mine     = problemIds.filter(id =>  isUserProblemId(id));

    const tasks = [];
    if (official.length > 0) {
      tasks.push(supabase.from('user_results').delete()
        .eq('user_id', session.user.id)
        .in('problem_id', official));
    }
    for (const id of mine) {
      tasks.push(supabase.from('user_problems')
        .update({ correct: null, answered_at: null })
        .eq('id', id));
    }
    const failed = (await Promise.all(tasks)).find(r => r.error);
    if (failed) console.error('[clearResults]', failed.error);
  }

  async function handleAnswer(problemId, isCorrect) {
    const nextRound = { ...roundResults, [problemId]: isCorrect };
    setRoundResults(nextRound);
    saveRoundResults(nextRound);

    // セッション内2回目以降の回答（再挑戦・前に戻っての答え直し）はDBに記録しない
    if (problemId in sessionFirstResults) return;
    const nextFirst = { ...sessionFirstResults, [problemId]: isCorrect };
    setSessionFirstResults(nextFirst);
    saveSessionFirstResults(nextFirst);

    if (!session) return;

    // 過去に不正解登録されている問題を今回正解した場合は即時に記録せず、
    // サマリー画面での選択（正解済みに更新するか）まで保留する
    if (shouldDeferResult(sessionStartResults, problemId, isCorrect)) return;

    if (isUserProblemId(problemId)) {
      applyUserProblemCorrect([problemId], isCorrect);
    } else {
      applyResultsUpdate(map => ({ ...map, [problemId]: isCorrect }));
    }
    await writeResults([{ id: problemId, correct: isCorrect }]);
  }

  // サマリーで「正解済みにする」を選んだとき、保留していた問題をまとめて正解で確定する
  async function handleConfirmUpgrades(problemIds) {
    if (!session || !problemIds.length) return;
    // 自作問題の id は uuid なので Number 変換しない（NaN になって保存先を見失う）
    const official = problemIds.filter(id => !isUserProblemId(id));
    const mine     = problemIds.filter(id =>  isUserProblemId(id));
    if (official.length > 0) {
      applyResultsUpdate(map => {
        const next = { ...map };
        official.forEach(id => { next[id] = true; });
        return next;
      });
    }
    if (mine.length > 0) applyUserProblemCorrect(mine, true);
    await writeResults(problemIds.map(id => ({ id, correct: true })));
  }

  function persistAnswer(problemId, payload) {
    const next = { ...roundAnswers, [problemId]: payload };
    setRoundAnswers(next);
    saveRoundAnswers(next);
  }

  async function handleResetResults(problemIds) {
    if (!session || !problemIds.length) return;
    applyResultsUpdate(map => {
      const next = { ...map };
      problemIds.forEach(id => delete next[id]);
      return next;
    });
    applyUserProblemCorrect(problemIds.filter(isUserProblemId), null);
    await clearResults(problemIds);
  }

  useEffect(() => {
    let cancelled = false;

    // リロード直後の初回ロード成功時に、sessionStorage から出題途中の状態を復元する
    function restoreRound(loadedProblems) {
      if (restoredRef.current) return;
      restoredRef.current = true;
      const saved = loadRound();
      if (!saved.isPlaying) return;
      const restored = saved.orderedIds.map(id => loadedProblems.find(p => p.id === id)).filter(Boolean);
      if (restored.length === 0) return;
      setOrderedProblems(restored);
      setCurrentIndex(saved.currentIndex);
      setRoundResults(saved.roundResults);
      setRoundAnswers(saved.roundAnswers);
      setSessionFirstResults(saved.sessionFirstResults);
      setSessionStartResults(saved.sessionStartResults);
      setShowSummary(saved.showSummary);
      setIsPlaying(true);
      setPlayingKey(k => k + 1);
    }

    // 公式問題と自作問題（my問題集）をまとめて取得する。
    // 自作問題は RLS により本人ぶんだけ返る（未ログインなら0件。エラーにはならない）。
    // section を u:<category_id> にして同じ配列に入れ、書籍タブで分離する
    Promise.all([
      supabase.from('problems').select('*').order('id'),
      // 出題順は表示番号（#1, #2 …）に揃える。公式問題の .order('id') と同じ考え方
      supabase.from('user_problems').select('*').order('display_no'),
      supabase.from('user_categories').select('*').order('sort_order'),
    ]).then(([official, mine, cats]) => {
        if (cancelled) return;
        const officialList = official.error
          ? null
          : (official.data || []).map(fromDb).filter(p => !p.disabled);
        const myList = mine.error
          ? []
          : (mine.data || []).map(fromUserDb)
              .filter(p => !p.disabled)
              .map(p => ({ ...p, section: userSection(p.categoryId), isUserProblem: true }));
        const fetched = officialList === null ? null : [...officialList, ...myList];
        // 取得失敗時は前回の一覧を維持したままロード完了扱いにする（従来挙動）
        setProblemsState(prev => ({
          key: sessionKey,
          problems: fetched ?? prev?.problems ?? [],
          userCategories: cats.error ? [] : (cats.data || []),
        }));
        if (fetched && fetched.length > 0) restoreRound(fetched);
      });
    return () => { cancelled = true; };
  }, [sessionKey]);

  const visibleProblems = allowedMajorCategories
    ? problems.filter(p => isSectionAllowed(allowedMajorCategories, p.section))
    : problems;

  const categories = [...new Set(visibleProblems.map(p => p.section))].sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  function startSelected(sections, count = null) {
    let catProblems = visibleProblems.filter(p => sections.has(p.section));
    if (unansweredOnlyMode || wrongOnlyMode) {
      catProblems = catProblems.filter(p => {
        if (unansweredOnlyMode && results[p.id] === undefined) return true;
        if (wrongOnlyMode && results[p.id] === false) return true;
        return false;
      });
    }
    let ordered = randomMode ? shuffled(catProblems) : catProblems;
    // 出題数の指定があれば先頭から絞る（ランダムON時はシャッフル後なので実質ランダム抽出）
    if (count != null && count < ordered.length) {
      ordered = ordered.slice(0, count);
    }
    // ラウンド開始時点の DB 正誤を固定しておく（保留判定の基準）
    const startSnapshot = { ...results };
    setOrderedProblems(ordered);
    setIsPlaying(true);
    setPlayingKey(k => k + 1);
    setCurrentIndex(0);
    setRoundResults({});
    setRoundAnswers({});
    setSessionFirstResults({});
    setSessionStartResults(startSnapshot);
    setShowSummary(false);
    saveRoundStart(ordered.map(p => p.id));
    saveSessionStartResults(startSnapshot);
  }

  function finishRound() {
    setShowSummary(true);
    saveShowSummary(true);
  }

  // 今ラウンドで間違えた問題だけで新しいラウンドを開始する
  // （sessionFirstResults は保持 = DBへの記録は1度目のまま）
  function retryWrong() {
    const wrong = orderedProblems.filter(p => roundResults[p.id] === false);
    if (wrong.length === 0) return;
    const ordered = randomMode ? shuffled(wrong) : wrong;
    setOrderedProblems(ordered);
    setCurrentIndex(0);
    setRoundResults({});
    setRoundAnswers({});
    setShowSummary(false);
    setPlayingKey(k => k + 1);
    saveRoundRetry(ordered.map(p => p.id));
  }

  function backToCategories() {
    setIsPlaying(false);
    setOrderedProblems([]);
    setCurrentIndex(0);
    setRoundResults({});
    setRoundAnswers({});
    setSessionFirstResults({});
    setSessionStartResults({});
    setShowSummary(false);
    clearRound();
  }

  function renderContent() {
    // 認証判定が終わるまではスケルトン（ログイン済みでもランディングがちらつかないように）
    if (!authChecked) {
      return <LoadingSkeleton />;
    }
    // 未ログインの訪問者にはランディングを見せる。
    // 問題一覧は RLS でどのみち0件になるため、取得完了を待たずに描画してよい
    if (!session) {
      return <LandingPage onLogin={signInWithGoogle} />;
    }
    if (isAllowed === null) {
      return <LoadingSkeleton />;
    }
    if (isAllowed === false) {
      return (
        <div className="access-denied">
          <p className="access-denied-title">このアカウントでは問題集を利用できません</p>
          <p className="access-denied-sub">
            何切る問題集は限定公開です。
            <br />
            メンチン何切るドリルは登録不要でどなたでも遊べます。
          </p>
          <a className="landing-cta landing-cta--compact" href="/chinitsu.html">
            ドリルを始める
          </a>
          <button className="btn-logout" onClick={() => supabase.auth.signOut()}>
            ログアウト
          </button>
        </div>
      );
    }
    if (loading) {
      return <LoadingSkeleton />;
    }
    if (!isPlaying) {
      return (
        <CategoryList
          categories={categories}
          problems={visibleProblems}
          randomMode={randomMode}
          onToggleRandom={toggleRandomMode}
          unansweredOnlyMode={unansweredOnlyMode}
          onToggleUnansweredOnly={toggleUnansweredOnlyMode}
          wrongOnlyMode={wrongOnlyMode}
          onToggleWrongOnly={toggleWrongOnlyMode}
          onStart={startSelected}
          results={results}
          session={session}
          onResetResults={handleResetResults}
          userCategories={userCategories}
        />
      );
    }
    if (showSummary) {
      // 過去に不正解登録されていて今回正解した問題（正解済みへ更新するか選ばせる対象）
      const pendingIds = collectPendingUpgrades(sessionStartResults, sessionFirstResults);
      const pendingUpgradeProblems = orderedProblems.filter(p => pendingIds.includes(String(p.id)));
      return (
        <SessionSummary
          problems={orderedProblems}
          roundResults={roundResults}
          pendingUpgradeProblems={pendingUpgradeProblems}
          onConfirmUpgrades={handleConfirmUpgrades}
          onRetryWrong={retryWrong}
          onBack={backToCategories}
          userCategories={userCategories}
        />
      );
    }
    return (
      <ProblemView
        key={`${playingKey}-${currentIndex}`}
        problem={orderedProblems[currentIndex]}
        index={currentIndex}
        total={orderedProblems.length}
        onBack={backToCategories}
        onPrev={() => setCurrentIndex((i) => { saveCurrentIndex(i - 1); return i - 1; })}
        onNext={() => setCurrentIndex((i) => { saveCurrentIndex(i + 1); return i + 1; })}
        onFinish={finishRound}
        onAnswer={handleAnswer}
        savedAnswer={roundAnswers[orderedProblems[currentIndex].id]}
        onPersistAnswer={persistAnswer}
      />
    );
  }

  return (
    <>
      <header className="app-header">
        <span className="app-header-title">座学する麻雀</span>
        {session ? (
          <div className="user-info">
            {session.user.user_metadata?.avatar_url && (
              <img
                src={session.user.user_metadata.avatar_url}
                alt="avatar"
                className="user-avatar"
              />
            )}
            <span className="user-name">
              {session.user.user_metadata?.name ?? session.user.email}
            </span>
            <button
              className="btn-logout"
              onClick={() => supabase.auth.signOut()}
            >
              ログアウト
            </button>
          </div>
        ) : (
          <button className="btn-login" onClick={signInWithGoogle}>
            Googleでログイン
          </button>
        )}
      </header>
      {renderContent()}
      {/* クローラーがたどれる実リンク（/chinitsu.html の発見用）とご意見・ご要望をまとめたフッター。
          ドリルの説明テキストは公開ページ（chinitsu.html）だけに置く方針なのでここには出さない。 */}
      <footer className="app-footer">
        <FeedbackWidget source="app" />
        <a href="/chinitsu.html" target="_blank" rel="noopener">メンチン何切るドリル（無料公開中）</a>
      </footer>
    </>
  );
}
