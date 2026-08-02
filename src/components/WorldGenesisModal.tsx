import React, { useState } from 'react';
import { Sparkles, Wand2, ShieldAlert, CheckCircle2, RefreshCw, X } from 'lucide-react';

interface WorldGenesisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenesisComplete: () => void;
}

export const WorldGenesisModal: React.FC<WorldGenesisModalProps> = ({ isOpen, onClose, onGenesisComplete }) => {
  const [userVision, setUserVision] = useState('');
  const [requiredConcepts, setRequiredConcepts] = useState('');
  const [forbiddenConcepts, setForbiddenConcepts] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const sampleVisions = [
    '古蜀符文与高能蒸汽结合的沉浸式机械修仙大陆，千峰耸立，空中巨型浮空灵矿舟穿梭。',
    '被霓虹霓光与近未来纳米生物兵器包围的无底地下暗河大区，黑客与古武修行者共存。',
    '异变风暴后的高能魔法废土，旧时代的魔导核反应堆遗迹遍布在焦黑的沉没都市中。',
    '极夜星域下的深海古老水下灵脉聚落，受潮汐古术与沉船遗宝引导。',
  ];

  const handleGenesisSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userVision.trim() || isGenerating) return;

    setIsGenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const reqList = requiredConcepts
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const forbList = forbiddenConcepts
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const res = await fetch('/api/v1/world/genesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userVision: userVision.trim(),
          worldId: 'world-snapshot-001',
          constraints: {
            required_concepts: reqList,
            forbidden_concepts: forbList,
          },
        }),
      });

      const data = await res.json();

      if (data.status === 'ok') {
        setSuccessMsg(`✨ 动态创世成功！生成世界【${data.profile?.display_name || '新世界'}】，绝对公理已锚定 ${data.axioms?.length || 0} 条。`);
        setTimeout(() => {
          onGenesisComplete();
          onClose();
        }, 1500);
      } else {
        setErrorMsg(`⚠️ 创世校验未通过: ${data.error}`);
      }
    } catch (err: any) {
      setErrorMsg(`⚠️ 网络或生成服务异常: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-2xl max-w-2xl w-full space-y-5 relative">
        <button
          onClick={onClose}
          disabled={isGenerating}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 p-0.5 shadow-lg flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              AI 驱动自由创世系统 (Dynamic World Genesis)
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-mono rounded-full border border-amber-500/30">
                P0/P1 Full AI Pipeline
              </span>
            </h3>
            <p className="text-xs text-slate-400">输入任意自由文本描述，AI 将自适应构筑宪法 Profile、公理 Axiom、骨架与实体</p>
          </div>
        </div>

        <form onSubmit={handleGenesisSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              1. 自由世界构想 (World Vision Description):
            </label>
            <textarea
              value={userVision}
              onChange={(e) => setUserVision(e.target.value)}
              placeholder="请输入你想创生的世界构思，如：一个高能蒸汽符文与太空巨企重叠的奇幻废墟大平原..."
              rows={4}
              disabled={isGenerating}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/50 rounded-2xl p-3.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition font-sans leading-relaxed"
            />
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] text-slate-500 font-mono">灵感灵感灵感:</span>
              {sampleVisions.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setUserVision(sample)}
                  disabled={isGenerating}
                  className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300/80 px-2 py-0.5 rounded-lg border border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  示例文本 {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                必选要素 (Required Concepts):
              </label>
              <input
                type="text"
                value={requiredConcepts}
                onChange={(e) => setRequiredConcepts(e.target.value)}
                placeholder="逗号分隔，如：精金高炉, 悬赏告示"
                disabled={isGenerating}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/50 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-rose-400 font-mono flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                禁忌要素 (Forbidden Concepts):
              </label>
              <input
                type="text"
                value={forbiddenConcepts}
                onChange={(e) => setForbiddenConcepts(e.target.value)}
                placeholder="逗号分隔，如：现代枪械, 魔法学院"
                disabled={isGenerating}
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500/50 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-xs text-rose-200 font-mono">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 font-mono">
              {successMsg}
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isGenerating || !userVision.trim()}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50 shadow-lg shadow-amber-500/10 flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>AI 正在全流程演化创世中...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 text-slate-950" />
                  <span>开始 AI 动态创世</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
