import React, { useState, useEffect } from 'react';
import {
  WorldSnapshot,
  Character,
  Location,
  Organization,
  Seed,
  Event,
  HiddenTruth,
  SimulationStats,
  CausalityPressure,
  UserCommercialState,
  AdventureArtCard,
} from './types';
import { Navbar } from './components/Navbar';
import { WorldMap } from './components/WorldMap';
import { NPCDialogueModal } from './components/NPCDialogueModal';
import { SeedsInspector } from './components/SeedsInspector';
import { HiddenTruthsBoard } from './components/HiddenTruthsBoard';
import { EventsTimeline } from './components/EventsTimeline';
import { SchedulerMonitor } from './components/SchedulerMonitor';
import { DMConsole, DMConsoleMessage } from './components/DMConsole';
import { AdModal } from './components/AdModal';
import { VIPModal } from './components/VIPModal';
import { AdventureGalleryModal } from './components/AdventureGalleryModal';
import { WorldGenesisModal } from './components/WorldGenesisModal';
import { Sparkles, RefreshCw, Compass, Bell } from 'lucide-react';

export default function App() {
  const [showInspector, setShowInspector] = useState<boolean>(false);
  const [inspectorTab, setInspectorTab] = useState<string>('map');
  const [isDMProcessing, setIsDMProcessing] = useState<boolean>(false);
  const [isGenesisModalOpen, setIsGenesisModalOpen] = useState<boolean>(false);

  const [dmMessages, setDmMessages] = useState<DMConsoleMessage[]>([
    {
      id: 'welcome-1',
      sender: 'DM',
      text: `🌌【AI Native 开放世界沙盒 • 创世大厅】\n\n欢迎来到全进程 AI 驱动的无界因果沙盒！在这里，没有固定死板的四选一剧情剧本，一切世界法则、时代背景与命运走向皆由你的 Prompt 决定。\n\n👉 **请点击右上角【✨ 自由 AI 创世】或直接输入你想要降临的任意自由世界描述！**\n*（例如：“一个古老符文与电磁构装结合的浮空山谷”，系统将实时生成专属世界宪法、绝对公理与初始领地！）*`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      epoch: 0,
    },
  ]);
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [stats, setStats] = useState<SimulationStats | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [pressures, setPressures] = useState<CausalityPressure[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [truths, setTruths] = useState<HiddenTruth[]>([]);

  // Commercial & VIP & Art Generation State
  const [commercialState, setCommercialState] = useState<UserCommercialState>({
    isVIP: false,
    artQuotas: 0,
    turnsSinceLastAd: 0,
    lastAdEpoch: 1,
    totalAdsWatched: 0,
  });
  const [adventureGallery, setAdventureGallery] = useState<AdventureArtCard[]>([]);
  const [isAdModalOpen, setIsAdModalOpen] = useState<boolean>(false);
  const [adRewardType, setAdRewardType] = useState<'AD_TRIGGER' | 'ART_QUOTA'>('AD_TRIGGER');
  const [isVIPModalOpen, setIsVIPModalOpen] = useState<boolean>(false);
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const [selectedNPC, setSelectedNPC] = useState<Character | null>(null);
  const [isDialogueOpen, setIsDialogueOpen] = useState<boolean>(false);
  const [isDialogueLoading, setIsDialogueLoading] = useState<boolean>(false);

  const [isTicking, setIsTicking] = useState<boolean>(false);
  const [autoTick, setAutoTick] = useState<boolean>(false);
  const [isDeducing, setIsDeducing] = useState<boolean>(false);
  const [deductionText, setDeductionText] = useState<string>('');

  // Fetch all world data
  const fetchWorldData = async () => {
    try {
      const [snapRes, charRes, locRes, orgRes, seedRes, evtRes, truthRes, statRes] =
        await Promise.all([
          fetch('/api/v1/world/snapshot'),
          fetch('/api/v1/characters'),
          fetch('/api/v1/locations'),
          fetch('/api/v1/organizations'),
          fetch('/api/v1/seeds/active'),
          fetch('/api/v1/events/recent'),
          fetch('/api/v1/truths'),
          fetch('/api/v1/admin/stats'),
        ]);

      const snapData = await snapRes.json();
      const charData = await charRes.json();
      const locData = await locRes.json();
      const orgData = await orgRes.json();
      const seedData = await seedRes.json();
      const evtData = await evtRes.json();
      const truthData = await truthRes.json();
      const statData = await statRes.json();

      setCharacters(charData || []);
      setSnapshot(snapData.snapshot);
      setStats(statData.stats);
      setLocations(locData || []);
      setOrganizations(orgData || []);
      setSeeds(seedData.seeds || []);
      setPressures(seedData.pressures || []);
      setEvents(evtData || []);
      setTruths(truthData || []);
    } catch (err) {
      console.error('Failed to fetch world data:', err);
    }
  };

  useEffect(() => {
    fetchWorldData();
  }, []);

  // Auto Tick timer effect
  useEffect(() => {
    let interval: any = null;
    if (autoTick) {
      interval = setInterval(() => {
        handleTick();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoTick]);

  const handleTick = async () => {
    if (isTicking) return;
    setIsTicking(true);
    try {
      await fetch('/api/v1/admin/epoch/tick', { method: 'POST' });
      await fetchWorldData();
    } catch (err) {
      console.error('Failed to tick epoch:', err);
    } finally {
      setIsTicking(false);
    }
  };

  const handleTravel = async (locationId: string) => {
    const pc = characters.find((c) => c.type === 'PC');
    if (!pc) return;

    try {
      await fetch(`/api/v1/characters/${pc.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_type: 'TRAVEL', target_location_id: locationId }),
      });
      await fetchWorldData();
    } catch (err) {
      console.error('Travel failed:', err);
    }
  };

  const handleNPCDialogue = (npcId: string) => {
    const npc = characters.find((c) => c.id === npcId);
    if (npc) {
      setSelectedNPC(npc);
      setIsDialogueOpen(true);
    }
  };

  const handleSendMessageToNPC = async (message: string) => {
    if (!selectedNPC) return;
    setIsDialogueLoading(true);

    try {
      await fetch(`/api/v1/characters/${selectedNPC.id}/dialogue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      await fetchWorldData();
    } catch (err) {
      console.error('Dialogue failed:', err);
    } finally {
      setIsDialogueLoading(false);
    }
  };

  const handleAIDeduce = async () => {
    setIsDeducing(true);
    try {
      const res = await fetch('/api/v1/causality/evaluate', { method: 'POST' });
      const data = await res.json();
      setDeductionText(data.evaluation);
    } catch (err) {
      console.error('Deduction failed:', err);
    } finally {
      setIsDeducing(false);
    }
  };

  const handleCollectEvidence = async (truthId: string, evidenceName: string) => {
    try {
      await fetch('/api/v1/truths/collect-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truth_id: truthId, evidence_name: evidenceName }),
      });
      await fetchWorldData();
    } catch (err) {
      console.error('Collect evidence failed:', err);
    }
  };

  const handleRevealTruth = async (truthId: string) => {
    try {
      await fetch('/api/v1/truths/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truth_id: truthId, revealer_id: 'pc-player' }),
      });
      await fetchWorldData();
    } catch (err) {
      console.error('Reveal truth failed:', err);
    }
  };

  const handlePlayerDMAction = async (actionText: string) => {
    setIsDMProcessing(true);
    try {
      const prevLocName = currentLocation?.name;
      const res = await fetch('/api/v1/dm/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_text: actionText }),
      });
      const data = await res.json();
      await fetchWorldData();

      const newTurns = commercialState.turnsSinceLastAd + 1;
      const currentEpoch = data.epoch || snapshot?.epoch || 1;
      const daysPassed = Math.max(0, currentEpoch - commercialState.lastAdEpoch);
      const locChanged = data.currentLocationName && data.currentLocationName !== prevLocName;
      const isCheckpoint = locChanged || daysPassed >= 1;

      if (newTurns >= 20 && daysPassed >= 1 && isCheckpoint) {
        if (commercialState.isVIP) {
          showToast('👑 VIP 尊享免打扰特权为您自动跳过插屏广告！');
          setCommercialState((prev) => ({
            ...prev,
            turnsSinceLastAd: 0,
            lastAdEpoch: currentEpoch,
          }));
        } else {
          setAdRewardType('AD_TRIGGER');
          setIsAdModalOpen(true);
          setCommercialState((prev) => ({
            ...prev,
            turnsSinceLastAd: 0,
            lastAdEpoch: currentEpoch,
          }));
        }
      } else {
        setCommercialState((prev) => ({
          ...prev,
          turnsSinceLastAd: newTurns,
        }));
      }

      return data;
    } finally {
      setIsDMProcessing(false);
    }
  };

  const handleActivateVIP = () => {
    setCommercialState((prev) => ({
      ...prev,
      isVIP: true,
      artQuotas: prev.artQuotas + 3,
    }));
    showToast('👑 成功开通 VIP 尊享月卡！广告已全面免除，并获赠 3 次 AI 画卷生成额度！');
    setIsVIPModalOpen(false);
  };

  const handleGenerateArtForNarration = async (locationName: string, narrationSummary: string) => {
    if (commercialState.artQuotas <= 0) {
      setIsVIPModalOpen(true);
      showToast('AI 画卷生成额度用尽，开通VIP(获3次)、看广告(+1次)或充值包(+2次)');
      return;
    }

    showToast('🎨 AI 正在结合当前地点与剧情为您生成高精场景画卷...');
    try {
      const res = await fetch('/api/v1/art/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationName, narrationSummary }),
      });
      const data = await res.json();
      if (data.artCard) {
        setAdventureGallery((prev) => [data.artCard, ...prev]);
        setCommercialState((prev) => ({
          ...prev,
          artQuotas: Math.max(0, prev.artQuotas - 1),
        }));
        setIsGalleryModalOpen(true);
        showToast('✨ 画卷生成成功，已保存至【AI 冒险画卷册】！');
      }
    } catch (err) {
      console.error('Art generation error:', err);
    }
  };

  const handleWatchAdForArtQuota = () => {
    setAdRewardType('ART_QUOTA');
    setIsAdModalOpen(true);
  };

  const handleRewardGrantedFromAd = () => {
    if (adRewardType === 'ART_QUOTA') {
      setCommercialState((prev) => ({
        ...prev,
        artQuotas: prev.artQuotas + 1,
        totalAdsWatched: prev.totalAdsWatched + 1,
      }));
      showToast('📺 完成广告观看！获得 +1 次 AI 场景画卷生图额度！');
    }
  };

  const handleRechargeArtQuota = (count: number) => {
    setCommercialState((prev) => ({
      ...prev,
      artQuotas: prev.artQuotas + count,
    }));
    showToast(`🪙 充值成功！获得 +${count} 次 AI 场景画卷额度！`);
    setIsVIPModalOpen(false);
  };

  const handleResetWorld = async () => {
    try {
      await fetch('/api/v1/world/reset', { method: 'POST' });
      await fetchWorldData();
      setDmMessages([
        {
          id: `msg-reset-${Date.now()}`,
          sender: 'DM',
          text: `⚡【AI DM 世界重置完成 • 时间溯回至 Epoch 1】\n\n请点击右上角【✨ 自由 AI 创世】或直接在此输入你的自由世界描述！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          epoch: 1,
        },
      ]);
      showToast('🔄 世界已重置！');
    } catch (err) {
      console.error('Reset failed:', err);
      showToast('⚠️ 世界重置失败，请重试');
    }
  };

  const handleGenesisComplete = async () => {
    await fetchWorldData();
    setDmMessages([
      {
        id: `msg-genesis-${Date.now()}`,
        sender: 'DM',
        text: `✨【AI 动态世界创生完成】\n\n新世界法则已完整锚定并原子持久化！世界宪法与绝对公理已生成。\n\n请设定你的角色姓名、职业背景与特长技能，即可正式展开全新沙盒探险！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        epoch: 1,
      },
    ]);
    showToast('✨ 自由 AI 动态创世成功，快开启你的全新旅途吧！');
  };

  const playerPC = characters.find((c) => c.type === 'PC') || characters[0];
  const currentLocation = locations.find((l) => l.id === playerPC?.location_id);

  if (!snapshot || !playerPC) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-2xl backdrop-blur-md">
          <Compass className="w-10 h-10 text-amber-400 animate-spin mx-auto" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-200">正在同步 AI 驱动动态世界快照...</p>
            <p className="text-xs text-slate-400">如长时间无法载入，可点击下方按钮重新生成初始世界。</p>
          </div>
          <button
            onClick={handleResetWorld}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg cursor-pointer flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>重新初始化世界快照</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500/30 selection:text-amber-200 relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-slate-950 px-4 py-2 rounded-xl font-bold text-xs shadow-2xl border border-amber-300 flex items-center gap-2 animate-in slide-in-from-top-4 duration-200">
          <Bell className="w-4 h-4 animate-bounce shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation */}
      <Navbar
        epoch={snapshot.epoch}
        onTick={handleTick}
        isTicking={isTicking}
        autoTick={autoTick}
        setAutoTick={setAutoTick}
        onReset={handleResetWorld}
        onAIDeduce={handleAIDeduce}
        isDeducing={isDeducing}
        showInspector={showInspector}
        setShowInspector={setShowInspector}
        commercialState={commercialState}
        onOpenVIPModal={() => setIsVIPModalOpen(true)}
        onOpenGalleryModal={() => setIsGalleryModalOpen(true)}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-2.5 sm:px-4 py-3 sm:py-6 space-y-4 sm:space-y-6">
        {/* AI Deduce Drawer if any */}
        {deductionText && (
          <div className="bg-gradient-to-r from-indigo-950/80 to-slate-900 border border-indigo-500/40 p-4 rounded-2xl shadow-2xl text-xs space-y-2 relative">
            <div className="flex justify-between items-center text-indigo-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Gemini 2.5 Flash - 深层因果律推演结果:
              </span>
              <button
                onClick={() => setDeductionText('')}
                className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                关闭✕
              </button>
            </div>
            <p className="text-slate-200 leading-relaxed font-serif whitespace-pre-wrap">{deductionText}</p>
          </div>
        )}

        {/* Primary View: AI DM Console */}
        <DMConsole
          playerCharacter={playerPC}
          currentLocation={currentLocation}
          npcsHere={characters.filter(
            (c) => c.type === 'NPC' && c.location_id === playerPC.location_id
          )}
          onPlayerActionSubmit={handlePlayerDMAction}
          onRefreshWorld={fetchWorldData}
          isDMProcessing={isDMProcessing}
          messages={dmMessages}
          setMessages={setDmMessages}
          onGenerateArtForNarration={handleGenerateArtForNarration}
          artQuotas={commercialState.artQuotas}
          onOpenGenesisModal={() => setIsGenesisModalOpen(true)}
        />

        {/* Background Engine Inspector (Toggleable) */}
        {showInspector && (
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl space-y-6 mt-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-400" />
                  上帝视角后台数据监视器 (Backend World State Inspector)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  查验底层逻辑：世界宪法/公理、角色卡、4层真相图谱、因果种子演化与7律调度状态
                </p>
              </div>

              <div className="flex space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                {[
                  { id: 'map', label: '世界地图' },
                  { id: 'truths', label: '4层真相板' },
                  { id: 'seeds', label: '因果种子' },
                  { id: 'events', label: '纪元编年史' },
                  { id: 'scheduler', label: '7律调度监视' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setInspectorTab(item.id)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                      inspectorTab === item.id
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inspector Tab Views */}
            {inspectorTab === 'map' && (
              <WorldMap
                locations={locations}
                characters={characters}
                currentLocationId={playerPC.location_id}
                onTravel={handleTravel}
                onSelectNPC={handleNPCDialogue}
              />
            )}

            {inspectorTab === 'truths' && (
              <HiddenTruthsBoard
                truths={truths}
                onCollectEvidence={handleCollectEvidence}
                onRevealTruth={handleRevealTruth}
              />
            )}

            {inspectorTab === 'seeds' && (
              <SeedsInspector
                seeds={seeds}
                pressures={pressures}
                onTriggerOpportunity={() => handleTick()}
              />
            )}

            {inspectorTab === 'events' && <EventsTimeline events={events} />}

            {inspectorTab === 'scheduler' && stats && (
              <SchedulerMonitor
                stats={stats}
                characters={characters}
                wakeQueueLength={stats.wake_queue_size}
              />
            )}
          </div>
        )}
      </main>

      {/* Free-Text World Genesis Modal */}
      <WorldGenesisModal
        isOpen={isGenesisModalOpen}
        onClose={() => setIsGenesisModalOpen(false)}
        onGenesisComplete={handleGenesisComplete}
      />

      {/* Interactive AI Dialogue Modal */}
      {isDialogueOpen && selectedNPC && (
        <NPCDialogueModal
          npc={selectedNPC}
          onSendMessage={handleSendMessageToNPC}
          isLoading={isDialogueLoading}
          onClose={() => setIsDialogueOpen(false)}
          playerCharacter={playerPC}
        />
      )}

      {/* Ad Trigger Modal */}
      <AdModal
        isOpen={isAdModalOpen}
        onClose={() => setIsAdModalOpen(false)}
        onUpgradeVIP={() => setIsVIPModalOpen(true)}
        isVIP={commercialState.isVIP}
        rewardType={adRewardType}
        onRewardGranted={handleRewardGrantedFromAd}
      />

      {/* VIP & Commercial Center Modal */}
      <VIPModal
        isOpen={isVIPModalOpen}
        onClose={() => setIsVIPModalOpen(false)}
        commercialState={commercialState}
        onActivateVIP={handleActivateVIP}
        onWatchAdForArtQuota={handleWatchAdForArtQuota}
        onRechargeArtQuota={handleRechargeArtQuota}
      />

      {/* Adventure Gallery Modal */}
      <AdventureGalleryModal
        isOpen={isGalleryModalOpen}
        onClose={() => setIsGalleryModalOpen(false)}
        artCards={adventureGallery}
        artQuotas={commercialState.artQuotas}
        onGenerateNewArt={() => {
          if (dmMessages.length > 0) {
            const lastDM = dmMessages.filter((m) => m.sender === 'DM').pop();
            handleGenerateArtForNarration(
              currentLocation?.name || '新世界',
              lastDM?.text || '冒险的故事在继续'
            );
          }
        }}
        onOpenVIPModal={() => setIsVIPModalOpen(true)}
      />
    </div>
  );
}
