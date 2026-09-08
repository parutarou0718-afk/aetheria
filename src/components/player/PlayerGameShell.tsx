import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerBootstrapView, PlayerConversationTurn } from '../../application/player/playerTypes';
import { playerApi, PlayerApiError } from '../../client/playerApi';

type Phase = 'BOOTING' | 'NEEDS_GENESIS' | 'READY' | 'ERROR';
type DmTurn = { id: string; speaker: 'PLAYER' | 'DM'; content: string; epoch: number };

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4"><h2 className="text-sm font-bold text-amber-300">{title}</h2>{children}</section>;
}

export function PlayerGameShell() {
  const [phase, setPhase] = useState<Phase>('BOOTING');
  const [bootstrap, setBootstrap] = useState<PlayerBootstrapView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dmText, setDmText] = useState('');
  const [dmTurns, setDmTurns] = useState<DmTurn[]>([]);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [npcTurns, setNpcTurns] = useState<PlayerConversationTurn[]>([]);
  const [npcText, setNpcText] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [developerInspectorOpen, setDeveloperInspectorOpen] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    try {
      const next = await playerApi.getBootstrap();
      if (requestGeneration !== generation.current) return;
      setBootstrap(next);
      setPhase(next.phase);
      if (next.phase === 'READY') {
        setDmTurns(next.recentDmHistory);
        setSelectedNpcId((current) => current && !next.visibleNpcs.some((npc) => npc.id === current) ? null : current);
      }
      setError(null);
    } catch (cause) {
      if (requestGeneration === generation.current) {
        setError(cause instanceof Error ? cause.message : 'Unable to load the world.');
        setPhase('ERROR');
      }
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const selectedNpc = useMemo(() => bootstrap?.phase === 'READY' ? bootstrap.visibleNpcs.find((npc) => npc.id === selectedNpcId) ?? null : null, [bootstrap, selectedNpcId]);
  const mutate = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof PlayerApiError ? cause.message : 'The action could not be completed.'); }
    finally { setBusy(false); }
  };
  const openNpc = async (npcId: string) => {
    setSelectedNpcId(npcId); setNpcTurns([]);
    try { setNpcTurns((await playerApi.getNpcDialogueHistory(npcId)).turns); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load conversation.'); }
  };

  if (phase === 'BOOTING') return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading your world…</main>;
  if (phase === 'ERROR') return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100"><div className="space-y-3 text-center"><p>{error}</p><button className="rounded bg-amber-400 px-3 py-2 text-slate-950" onClick={() => void refresh()}>Try again</button></div></main>;
  if (phase === 'NEEDS_GENESIS') return <PlayerGenesis busy={busy} onCreate={(userVision) => mutate(async () => { await playerApi.createWorld({ userVision }); })} />;
  if (!bootstrap || bootstrap.phase !== 'READY') return null;
  const { player } = bootstrap;

  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 pb-4">
      <div><h1 className="text-xl font-black text-amber-300">{bootstrap.world.name}</h1><p className="text-xs text-slate-400">Epoch {bootstrap.world.epoch} · {bootstrap.world.description}</p></div>
      <div className="flex gap-2">
        {bootstrap.devInspectorAvailable && <button className="rounded border border-indigo-600 px-3 py-2 text-xs text-indigo-200" onClick={() => setDeveloperInspectorOpen((open) => !open)}>Developer Inspector</button>}
        <button disabled={busy} className="rounded border border-rose-700 px-3 py-2 text-xs text-rose-200 disabled:opacity-50" onClick={() => setConfirmReset(true)}>Reset world</button>
      </div>
    </header>
    {developerInspectorOpen && bootstrap.devInspectorAvailable && <section className="mx-auto mb-4 max-w-6xl rounded-xl border border-indigo-700 bg-indigo-950/30 p-4 text-sm"><strong>Developer Inspector</strong><p className="mt-1 text-slate-300">Developer-only tools are isolated from the player experience. Open a local developer route explicitly to inspect runtime data.</p></section>}
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="space-y-4">
        <Panel title="The World Responds">
          <div className="max-h-96 space-y-3 overflow-y-auto text-sm">{dmTurns.map((turn) => <p key={turn.id} className={turn.speaker === 'PLAYER' ? 'text-amber-200' : 'text-slate-200'}><strong>{turn.speaker === 'PLAYER' ? 'You' : 'DM'}:</strong> {turn.content}</p>)}</div>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); const text = dmText.trim(); if (!text) return; void mutate(async () => { const result = await playerApi.sendDmAction(text); setDmTurns((turns) => [...turns, { id: `player-${Date.now()}`, speaker: 'PLAYER', content: text, epoch: result.epoch }, { id: `dm-${Date.now()}`, speaker: 'DM', content: result.narration, epoch: result.epoch }]); setDmText(''); }); }}>
            <input aria-label="Describe your action" className="min-w-0 flex-1 rounded bg-slate-950 p-2" value={dmText} onChange={(event) => setDmText(event.target.value)} placeholder="Describe what you do…" disabled={busy} />
            <button disabled={busy} className="rounded bg-amber-400 px-3 text-slate-950 disabled:opacity-50">Send</button>
          </form>
          <p className="text-xs text-slate-500">You can attempt any in-world action. The world responds through established state, history, causality, and rules.</p>
        </Panel>
        <Panel title={bootstrap.currentLocation?.name ?? 'In transit'}>
          <p className="text-sm">{bootstrap.currentLocation?.description ?? bootstrap.travel?.destinationName ?? 'You are travelling.'}</p>
          {bootstrap.travel ? <p className="text-sm text-amber-200">Travelling to {bootstrap.travel.destinationName}; expected by Epoch {bootstrap.travel.expectedEndEpoch}.</p> : <div className="flex flex-wrap gap-2">{bootstrap.travelOptions.map((option) => <button key={option.locationId} disabled={busy || player.capability.actionState !== 'AVAILABLE'} onClick={() => void mutate(async () => { await playerApi.travel(option.locationId); })} className="rounded border border-indigo-500 px-3 py-2 text-xs disabled:opacity-50">Travel to {option.name} · {option.estimatedEpochs} epoch</button>)}</div>}
          <button disabled={busy} className="mt-2 rounded border border-slate-600 px-3 py-2 text-xs disabled:opacity-50" onClick={() => void mutate(async () => { await playerApi.advanceTime(); })}>Advance time</button>
        </Panel>
        <Panel title="People here"><div className="flex flex-wrap gap-2">{bootstrap.visibleNpcs.map((npc) => <button key={npc.id} className="rounded border border-slate-700 px-3 py-2 text-left text-xs" onClick={() => void openNpc(npc.id)}>{npc.name} · {npc.observableActivityType}</button>)}{bootstrap.visibleNpcs.length === 0 && <p className="text-sm text-slate-500">No one is immediately present.</p>}</div></Panel>
      </div>
      <aside className="space-y-4">
        <Panel title="Character"><p className="font-bold">{player.name} <span className="font-normal text-slate-400">{player.title}</span></p><p className="text-sm">HP {player.attributes.hp}/{player.attributes.maxHp} · MP {player.attributes.mp}/{player.attributes.maxMp} · Gold {player.resources.gold}</p><p className="text-xs text-slate-400">{player.status} · {player.capability.actionState} · {player.currentAction.type}</p></Panel>
        <Panel title="Active quests">{bootstrap.activeQuests.length ? bootstrap.activeQuests.map((quest) => <div key={quest.id}><p className="text-sm font-bold">{quest.title}</p><p className="text-xs text-slate-400">{quest.objectiveDescription}</p></div>) : <p className="text-sm text-slate-500">No active quests.</p>}</Panel>
        <Panel title="What you know">{bootstrap.knowledge.confirmedFacts.slice(0, 8).map((entry, index) => <p className="text-xs" key={`${entry.subject}-${index}`}>{entry.statement}</p>)}{bootstrap.knowledge.confirmedFacts.length === 0 && <p className="text-sm text-slate-500">Your journal is still sparse.</p>}</Panel>
      </aside>
    </div>
    {error && <p role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded bg-rose-900 px-4 py-2 text-sm">{error}</p>}
    {confirmReset && <ResetConfirmation busy={busy} onCancel={() => setConfirmReset(false)} onConfirm={() => void mutate(async () => { await playerApi.resetWorld(); setConfirmReset(false); })} />}
    {selectedNpc && <NpcDialogue npcName={selectedNpc.name} turns={npcTurns} text={npcText} busy={busy} onText={setNpcText} onClose={() => setSelectedNpcId(null)} onSend={() => void mutate(async () => { const message = npcText.trim(); if (!message) return; const result = await playerApi.sendNpcDialogue(selectedNpc.id, message); setNpcTurns((turns) => [...turns, { id: `you-${Date.now()}`, speaker: 'PLAYER', content: message, epoch: result.epoch }, { id: `npc-${Date.now()}`, speaker: 'NPC', content: result.reply, epoch: result.epoch }]); setNpcText(''); })} />}
  </main>;
}

function ResetConfirmation({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="fixed inset-0 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-md space-y-4 rounded-xl bg-slate-900 p-5"><h2 className="font-bold text-rose-200">Reset this world?</h2><p className="text-sm text-slate-300">This permanently removes the current world and returns to creation.</p><div className="flex justify-end gap-2"><button disabled={busy} onClick={onCancel}>Cancel</button><button disabled={busy} className="rounded bg-rose-700 px-3 py-2" onClick={onConfirm}>Confirm reset</button></div></div></div>; }
function NpcDialogue({ npcName, turns, text, busy, onText, onClose, onSend }: { npcName: string; turns: PlayerConversationTurn[]; text: string; busy: boolean; onText: (text: string) => void; onClose: () => void; onSend: () => void }) { return <div className="fixed inset-0 grid place-items-center bg-black/60 p-4"><div className="w-full max-w-lg space-y-3 rounded-xl bg-slate-900 p-4"><div className="flex justify-between"><h2 className="font-bold">{npcName}</h2><button onClick={onClose}>Close</button></div><div className="max-h-72 space-y-2 overflow-y-auto text-sm">{turns.map((turn) => <p key={turn.id}><strong>{turn.speaker === 'PLAYER' ? 'You' : npcName}:</strong> {turn.content}</p>)}</div><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); onSend(); }}><input aria-label="Speak to NPC" className="min-w-0 flex-1 rounded bg-slate-950 p-2" value={text} onChange={(event) => onText(event.target.value)} disabled={busy} /><button disabled={busy} className="rounded bg-amber-400 px-3 text-slate-950">Speak</button></form></div></div>; }
function PlayerGenesis({ busy, onCreate }: { busy: boolean; onCreate: (vision: string) => void }) { const [vision, setVision] = useState(''); return <main className="grid min-h-screen place-items-center bg-slate-950 p-4 text-slate-100"><form className="w-full max-w-xl space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6" onSubmit={(event) => { event.preventDefault(); onCreate(vision); }}><h1 className="text-xl font-black text-amber-300">Create your world</h1><p className="text-sm text-slate-300">Describe the world you want to explore. The world will establish its own history, rules, and people.</p><textarea className="min-h-40 w-full rounded bg-slate-950 p-3" value={vision} onChange={(event) => setVision(event.target.value)} minLength={20} disabled={busy} /><button disabled={busy || vision.trim().length < 20} className="rounded bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{busy ? 'Creating…' : 'Create world'}</button></form></main>; }
