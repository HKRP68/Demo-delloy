
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Tournament, WorkspaceTab, Team, Match, MatchResultType, SeriesGroup, PenaltyRecord, ResultLog, ManualBonus } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';
import { toPng } from 'html-to-image';

interface TournamentWorkspaceProps {
  tournament: Tournament;
  onExit: () => void;
  onUpdateTournament?: (updated: Tournament) => void;
}

type ScheduleSubTab = 'ACTUAL' | 'FULL' | 'MATRIX';

const TournamentWorkspace: React.FC<TournamentWorkspaceProps> = ({ tournament, onExit, onUpdateTournament }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('OVERVIEW');
  const [activeScheduleSubTab, setActiveScheduleSubTab] = useState<ScheduleSubTab>('ACTUAL');
  const [tabHistory, setTabHistory] = useState<{ tab: WorkspaceTab, subTab: ScheduleSubTab }[]>([]);
  
  const [expandedRounds, setExpandedRounds] = useState<number[]>([]);
  const [expandedSeries, setExpandedSeries] = useState<string[]>([]);
  
  // Filters
  const [scheduleFilters, setScheduleFilters] = useState({ team: '' });
  const [fullScheduleFilters, setFullScheduleFilters] = useState({ round: '', team: '', status: '' });

  const [selectedProfileTeamId, setSelectedProfileTeamId] = useState<string | null>(null);

  // Refs for exports
  const pointsTableRef = useRef<HTMLDivElement>(null);
  const matrixRef = useRef<HTMLDivElement>(null);
  const distributionRef = useRef<HTMLDivElement>(null);
  const fullScheduleRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const roundRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [confirmingAction, setConfirmingAction] = useState<{ 
    type: 'SAVE_RESULT' | 'APPLY_PENALTY' | 'APPLY_BONUS' | 'REMOVE_MATCH', 
    matchId?: string,
    teamId?: string,
    seriesId?: string
  } | null>(null);

  const [penaltyForm, setPenaltyForm] = useState({ teamId: '', points: 1, reason: 'Slow Over Rate' });
  const [bonusForm, setBonusForm] = useState({ teamId: '', points: 1, reason: 'Exceptional Fair Play' });
  const [resultForm, setResultForm] = useState({ winnerId: '', resultType: 'DRAW' as MatchResultType });

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    'Standing': true,
    'Team Name': true,
    'Series Played': false,
    'Series Completed': false,
    'Series Left': false,
    'Matches Played': true,
    'Matches Won': true,
    'Matches Drawn': true,
    'Matches Lost': true,
    'Total Point': true,
    'Maximum Possible Points': true,
    'Points Percentage': true,
    'Bonus Point': true,
    'Penalty Points': true,
  });

  const safeSeries = tournament.series || [];
  const safeMatches = tournament.matches || [];
  const safeLogs = tournament.logs || [];
  const safePenalties = tournament.penalties || [];
  const safeBonuses = tournament.manualBonuses || [];

  // Track History
  const navigateTo = (tab: WorkspaceTab, subTab: ScheduleSubTab = activeScheduleSubTab) => {
    setTabHistory(prev => [...prev, { tab: activeTab, subTab: activeScheduleSubTab }]);
    setActiveTab(tab);
    setActiveScheduleSubTab(subTab);
  };

  const goBack = () => {
    if (tabHistory.length > 0) {
      const prev = tabHistory[tabHistory.length - 1];
      setTabHistory(prevHistory => prevHistory.slice(0, -1));
      setActiveTab(prev.tab);
      setActiveScheduleSubTab(prev.subTab);
    }
  };

  const handleSnap = async (ref: React.RefObject<HTMLElement | null>, fileName: string) => {
    if (ref.current) {
      try {
        const dataUrl = await toPng(ref.current, { backgroundColor: '#ffffff', style: { padding: '20px' } });
        const link = document.createElement('a');
        link.download = fileName; link.href = dataUrl; link.click();
      } catch (err) { console.error('Snapshot error:', err); }
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const getMatchPoints = (match: Match) => {
    if (match.status !== 'COMPLETED') return { t1: 0, t2: 0 };
    const { pointsForWin, pointsForDraw, pointsForLoss } = tournament.config;
    
    if (match.resultType === 'T1_WIN') return { t1: pointsForWin, t2: pointsForLoss };
    if (match.resultType === 'T2_WIN') return { t1: pointsForLoss, t2: pointsForWin };
    
    return { t1: pointsForDraw, t2: pointsForDraw };
  };

  const getSeriesPerformance = (seriesId: string) => {
    const series = safeSeries.find(s => s.id === seriesId);
    if (!series) return null;
    const matches = safeMatches.filter(m => m.seriesId === seriesId);
    const completedMatches = matches.filter(m => m.status === 'COMPLETED');
    
    const t1 = { w: 0, l: 0, d: 0, mPts: 0, sW: 0, sL: 0, sD: 0, sBonus: 0, total: 0 };
    const t2 = { w: 0, l: 0, d: 0, mPts: 0, sW: 0, sL: 0, sD: 0, sBonus: 0, total: 0 };

    completedMatches.forEach(m => {
      const p = getMatchPoints(m);
      t1.mPts += p.t1; 
      t2.mPts += p.t2;
      
      if (m.resultType === 'T1_WIN') { t1.w++; t2.l++; }
      else if (m.resultType === 'T2_WIN') { t2.w++; t1.l++; }
      else { t1.d++; t2.d++; }
    });

    if (series.status === 'COMPLETED' && matches.length > 0) {
      if (t1.w > t2.w) {
        t1.sW = 1; t2.sL = 1; 
        if (tournament.config.countSeriesBonus) {
          t1.sBonus = tournament.config.pointsForSeriesWin;
          t2.sBonus = tournament.config.pointsForSeriesLoss;
        }
      } else if (t2.w > t1.w) {
        t2.sW = 1; t1.sL = 1;
        if (tournament.config.countSeriesBonus) {
          t2.sBonus = tournament.config.pointsForSeriesWin;
          t1.sBonus = tournament.config.pointsForSeriesLoss;
        }
      } else {
        t1.sD = 1; t2.sD = 1;
        if (tournament.config.countSeriesBonus) {
          t1.sBonus = tournament.config.pointsForSeriesDraw;
          t2.sBonus = tournament.config.pointsForSeriesDraw;
        }
      }
    }
    
    t1.total = t1.mPts + t1.sBonus; 
    t2.total = t2.mPts + t2.sBonus;
    
    return { 
      t1, t2, 
      winner: t1.w > t2.w ? series.team1Id : (t2.w > t1.w ? series.team2Id : null) 
    };
  };

  const standings = useMemo(() => {
    const stats: Record<string, Team & { 
      seriesPlayedCount: number; 
      seriesCompletedCount: number; 
      seriesLeftCount: number;
      maxPossiblePoints: number; 
      playedFor: number; 
      manualBonusPoints: number;
    }> = {};

    tournament.teams.forEach(t => {
      const totalSeriesForTeam = safeSeries.filter(s => s.team1Id === t.id || s.team2Id === t.id).length;
      stats[t.id] = { 
        ...t, 
        seriesPlayedCount: 0, seriesCompletedCount: 0, seriesLeftCount: totalSeriesForTeam,
        matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesDrawn: 0, 
        basePoints: 0, bonusPoints: 0, penaltyPoints: 0, totalPoints: 0, 
        pct: 0, playedFor: 0, manualBonusPoints: 0, maxPossiblePoints: 0 
      };
    });

    safeMatches.filter(m => m.status === 'COMPLETED').forEach(m => {
      const p = getMatchPoints(m);
      if (stats[m.team1Id]) {
        stats[m.team1Id].matchesPlayed++;
        stats[m.team1Id].basePoints += p.t1;
        stats[m.team1Id].playedFor += tournament.config.pointsForWin;
        if (m.resultType === 'T1_WIN') stats[m.team1Id].matchesWon++;
        else if (m.resultType === 'T2_WIN') stats[m.team1Id].matchesLost++;
        else stats[m.team1Id].matchesDrawn++;
      }
      if (stats[m.team2Id]) {
        stats[m.team2Id].matchesPlayed++;
        stats[m.team2Id].basePoints += p.t2;
        stats[m.team2Id].playedFor += tournament.config.pointsForWin;
        if (m.resultType === 'T2_WIN') stats[m.team2Id].matchesWon++;
        else if (m.resultType === 'T1_WIN') stats[m.team2Id].matchesLost++;
        else stats[m.team2Id].matchesDrawn++;
      }
    });

    safeSeries.forEach(s => {
      const st1 = stats[s.team1Id];
      const st2 = stats[s.team2Id];
      if (s.status === 'COMPLETED') {
        const perf = getSeriesPerformance(s.id);
        if (perf) {
          if (st1) {
            st1.seriesCompletedCount++;
            st1.seriesLeftCount--;
            st1.bonusPoints += perf.t1.sBonus;
            if (tournament.config.countSeriesBonus) st1.playedFor += tournament.config.pointsForSeriesWin;
          }
          if (st2) {
            st2.seriesCompletedCount++;
            st2.seriesLeftCount--;
            st2.bonusPoints += perf.t2.sBonus;
            if (tournament.config.countSeriesBonus) st2.playedFor += tournament.config.pointsForSeriesWin;
          }
        }
      } else if (s.status === 'IN_PROGRESS') {
        if (st1) st1.seriesPlayedCount++;
        if (st2) st2.seriesPlayedCount++;
      }
    });

    safePenalties.forEach(p => { if (stats[p.teamId]) stats[p.teamId].penaltyPoints += p.points; });
    safeBonuses.forEach(b => { if (stats[b.teamId]) stats[b.teamId].manualBonusPoints += b.points; });

    return Object.values(stats).map(t => {
      t.totalPoints = t.basePoints + t.bonusPoints + t.manualBonusPoints - t.penaltyPoints;
      t.pct = t.playedFor > 0 ? (t.totalPoints / t.playedFor) * 100 : 0;
      const remainingMatches = safeMatches.filter(m => (m.team1Id === t.id || m.team2Id === t.id) && m.status !== 'COMPLETED').length;
      const remainingSeries = safeSeries.filter(s => (s.team1Id === t.id || s.team2Id === t.id) && s.status !== 'COMPLETED').length;
      t.maxPossiblePoints = t.totalPoints + (remainingMatches * tournament.config.pointsForWin) + (tournament.config.countSeriesBonus ? remainingSeries * tournament.config.pointsForSeriesWin : 0);
      return t;
    }).sort((a, b) => b.pct - a.pct || b.totalPoints - a.totalPoints);
  }, [tournament, safeMatches, safeSeries, safePenalties, safeBonuses]);

  const handleAddMatch = (seriesId: string) => {
    const series = safeSeries.find(s => s.id === seriesId);
    if (!series) return;
    
    const newMatchId = `match-${seriesId}-${Date.now()}`;
    const newMatch: Match = {
      id: newMatchId,
      round: series.round,
      seriesId: seriesId,
      team1Id: series.team1Id,
      team2Id: series.team2Id,
      venueId: tournament.stadiums[0]?.id || 'default',
      status: 'NOT_STARTED'
    };

    const updatedMatches = [...safeMatches, newMatch];
    const updatedSeries = safeSeries.map(s => s.id === seriesId ? { ...s, matchCount: s.matchCount + 1, matchIds: [...s.matchIds, newMatchId] } : s);
    
    onUpdateTournament?.({
      ...tournament,
      matches: updatedMatches,
      series: updatedSeries,
      logs: [{
        id: `LOG-${Date.now()}`,
        type: 'SETTING_CHANGE' as const,
        reason: `Added match to series ${seriesId}`,
        targetId: seriesId,
        adminName: 'Admin',
        timestamp: new Date().toLocaleString()
      } as ResultLog, ...safeLogs].slice(0, 50)
    });
  };

  const finalizeRemoveMatch = () => {
    if (!confirmingAction?.matchId) return;
    const matchToRemove = safeMatches.find(m => m.id === confirmingAction.matchId);
    if (!matchToRemove) return;

    const updatedMatches = safeMatches.filter(m => m.id !== confirmingAction.matchId);
    const updatedSeries = safeSeries.map(s => {
      if (s.id === matchToRemove.seriesId) {
        const newMatchIds = s.matchIds.filter(id => id !== confirmingAction.matchId);
        const sMs = updatedMatches.filter(m => m.seriesId === s.id);
        const isComp = sMs.length > 0 && sMs.every(m => m.status === 'COMPLETED');
        const hasStart = sMs.some(m => m.status === 'COMPLETED');
        return { 
          ...s, 
          matchCount: Math.max(0, s.matchCount - 1), 
          matchIds: newMatchIds,
          status: (isComp ? 'COMPLETED' : (hasStart ? 'IN_PROGRESS' : 'NOT_STARTED')) as SeriesGroup['status']
        };
      }
      return s;
    });

    onUpdateTournament?.({
      ...tournament,
      matches: updatedMatches,
      series: updatedSeries,
      logs: [{
        id: `LOG-${Date.now()}`,
        type: 'SETTING_CHANGE' as const,
        reason: `Removed match ${confirmingAction.matchId}`,
        targetId: matchToRemove.seriesId,
        adminName: 'Admin',
        timestamp: new Date().toLocaleString()
      } as ResultLog, ...safeLogs].slice(0, 50)
    });
    setConfirmingAction(null);
  };

  const handleCommitResult = () => {
    if (!confirmingAction?.matchId) return;
    const updatedMatches = safeMatches.map(m => m.id === confirmingAction.matchId ? { ...m, status: 'COMPLETED' as const, resultType: resultForm.resultType, winnerId: resultForm.winnerId } : m);
    const updatedSeries = safeSeries.map(s => {
      const sMs = updatedMatches.filter(m => m.seriesId === s.id);
      const isComp = sMs.length > 0 && sMs.every(m => m.status === 'COMPLETED');
      const hasStart = sMs.some(m => m.status === 'COMPLETED');
      return { ...s, status: (isComp ? 'COMPLETED' : (hasStart ? 'IN_PROGRESS' : 'NOT_STARTED')) as SeriesGroup['status'] };
    });
    const newLog: ResultLog = { id: `LOG-${Date.now()}`, type: 'RESULT_ADDED', reason: `Match result committed: ${resultForm.resultType}`, targetId: confirmingAction.matchId, adminName: 'Admin', timestamp: new Date().toLocaleString() };
    onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries, logs: [newLog, ...safeLogs].slice(0, 50) });
    setConfirmingAction(null);
  };

  const handleApplyPenalty = () => {
    if (!penaltyForm.teamId) return alert("Select a team");
    const pts = Number(penaltyForm.points);
    if (isNaN(pts) || pts <= 0) return alert("Invalid points");
    const newPen: PenaltyRecord = { id: Date.now().toString(), teamId: penaltyForm.teamId, points: pts, reason: penaltyForm.reason || "Penalty", date: new Date().toLocaleDateString() };
    const newLog: ResultLog = { id: `LOG-${Date.now()}`, type: 'PENALTY', reason: `Deducted ${pts} pts from ${tournament.teams.find(t => t.id === penaltyForm.teamId)?.shortName}`, targetId: penaltyForm.teamId, adminName: 'Admin', timestamp: new Date().toLocaleString() };
    onUpdateTournament?.({ ...tournament, penalties: [...safePenalties, newPen], logs: [newLog, ...safeLogs].slice(0, 50) });
    setConfirmingAction(null);
  };

  const handleApplyBonus = () => {
    if (!bonusForm.teamId) return alert("Select a team");
    const pts = Number(bonusForm.points);
    if (isNaN(pts) || pts <= 0) return alert("Invalid points");
    const newBonus: ManualBonus = { id: Date.now().toString(), teamId: bonusForm.teamId, points: pts, reason: bonusForm.reason || "Bonus", date: new Date().toLocaleDateString() };
    const newLog: ResultLog = { id: `LOG-${Date.now()}`, type: 'BONUS', reason: `Awarded ${pts} pts bonus to ${tournament.teams.find(t => t.id === bonusForm.teamId)?.shortName}`, targetId: bonusForm.teamId, adminName: 'Admin', timestamp: new Date().toLocaleString() };
    onUpdateTournament?.({ ...tournament, manualBonuses: [...safeBonuses, newBonus], logs: [newLog, ...safeLogs].slice(0, 50) });
    setConfirmingAction(null);
  };

  const roundsData = useMemo(() => {
    const rounds: Record<number, SeriesGroup[]> = {};
    safeSeries.forEach(s => { if (!rounds[s.round]) rounds[s.round] = []; rounds[s.round].push(s); });
    return Object.keys(rounds).map(Number).sort((a,b)=>a-b).map(num => ({ num, series: rounds[num] }));
  }, [safeSeries]);

  const toggleRound = (num: number) => {
    setExpandedRounds(prev => prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]);
  };

  const toggleSeries = (id: string) => {
    setExpandedSeries(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const filteredFullSchedule = useMemo(() => {
    return safeSeries.filter(s => {
      const t1 = tournament.teams.find(t => t.id === s.team1Id);
      const t2 = tournament.teams.find(t => t.id === s.team2Id);
      const matchRound = !fullScheduleFilters.round || s.round === Number(fullScheduleFilters.round);
      const matchTeam = !fullScheduleFilters.team || s.team1Id === fullScheduleFilters.team || s.team2Id === fullScheduleFilters.team;
      const matchStatus = !fullScheduleFilters.status || s.status === fullScheduleFilters.status;
      return matchRound && matchTeam && matchStatus;
    });
  }, [safeSeries, fullScheduleFilters, tournament.teams]);

  const teamProfileData = useMemo(() => {
    if (!selectedProfileTeamId) return null;
    const team = tournament.teams.find(t => t.id === selectedProfileTeamId);
    if (!team) return null;

    const standing = standings.find(s => s.id === selectedProfileTeamId);
    const pos = standings.findIndex(s => s.id === selectedProfileTeamId) + 1;

    const pointsLog: { reason: string, points: number, type: 'POS' | 'NEG' }[] = [];
    
    safeMatches.filter(m => m.status === 'COMPLETED' && (m.team1Id === selectedProfileTeamId || m.team2Id === selectedProfileTeamId)).forEach(m => {
        const pts = getMatchPoints(m);
        const teamPts = m.team1Id === selectedProfileTeamId ? pts.t1 : pts.t2;
        const opponent = tournament.teams.find(t => t.id === (m.team1Id === selectedProfileTeamId ? m.team2Id : m.team1Id))?.shortName;
        if (teamPts !== 0) {
            let resultTag = 'draw';
            if (teamPts === tournament.config.pointsForWin) resultTag = 'win';
            else if (teamPts === tournament.config.pointsForLoss) resultTag = 'loss';
            pointsLog.push({ reason: `Vs ${opponent} Match_${resultTag}`, points: teamPts, type: teamPts > 0 ? 'POS' : 'NEG' });
        }
    });

    safeSeries.filter(s => s.status === 'COMPLETED' && (s.team1Id === selectedProfileTeamId || s.team2Id === selectedProfileTeamId)).forEach(s => {
        const perf = getSeriesPerformance(s.id);
        if (perf) {
            const sBonus = s.team1Id === selectedProfileTeamId ? perf.t1.sBonus : perf.t2.sBonus;
            const opponent = tournament.teams.find(t => t.id === (s.team1Id === selectedProfileTeamId ? s.team2Id : s.team1Id))?.shortName;
            if (sBonus !== 0) {
                let resultTag = 'draw';
                if (sBonus === tournament.config.pointsForSeriesWin) resultTag = 'win';
                else if (sBonus === tournament.config.pointsForSeriesLoss) resultTag = 'loss';
                pointsLog.push({ reason: `Vs ${opponent} Series_${resultTag}`, points: sBonus, type: sBonus > 0 ? 'POS' : 'NEG' });
            }
        }
    });

    safePenalties.filter(p => p.teamId === selectedProfileTeamId).forEach(p => {
        pointsLog.push({ reason: `PENALTY: ${p.reason}`, points: p.points, type: 'NEG' });
    });
    safeBonuses.filter(b => b.teamId === selectedProfileTeamId).forEach(b => {
        pointsLog.push({ reason: `BONUS: ${b.reason}`, points: b.points, type: 'POS' });
    });

    const seriesStats = { w: 0, l: 0, d: 0 };
    safeSeries.filter(s => s.status === 'COMPLETED' && (s.team1Id === selectedProfileTeamId || s.team2Id === selectedProfileTeamId)).forEach(s => {
        const perf = getSeriesPerformance(s.id);
        if (perf) {
            if (perf.winner === selectedProfileTeamId) seriesStats.w++;
            else if (perf.winner === null) seriesStats.d++;
            else seriesStats.l++;
        }
    });

    const playedOpponents: { name: string, matchCount: number }[] = [];
    const leftOpponents: { name: string, matchCount: number }[] = [];

    tournament.teams.filter(t => t.id !== selectedProfileTeamId).forEach(t => {
        const series = safeSeries.find(s => (s.team1Id === selectedProfileTeamId && s.team2Id === t.id) || (s.team1Id === t.id && s.team2Id === selectedProfileTeamId));
        if (series) {
            if (series.status === 'COMPLETED') playedOpponents.push({ name: t.name, matchCount: series.matchCount });
            else leftOpponents.push({ name: t.name, matchCount: series.matchCount });
        }
    });

    return { team, standing, pos, pointsLog, seriesStats, playedOpponents, leftOpponents };
  }, [selectedProfileTeamId, tournament, standings, safeMatches, safeSeries, safePenalties, safeBonuses]);

  return (
    <div className="space-y-8 pb-32">
      {/* Navigation Utility Bar */}
      <div className="no-print flex flex-col md:flex-row justify-between items-center gap-4 bg-black text-white p-3 brutalist-border shadow-[4px_4px_0px_white] z-50 sticky top-[80px]">
        <div className="flex gap-2 w-full md:w-auto">
          <BrutalistButton variant="primary" compact onClick={onExit} className="flex-1 md:flex-none">🏠 HOME PAGE</BrutalistButton>
          <BrutalistButton variant="secondary" compact onClick={goBack} disabled={tabHistory.length === 0} className="flex-1 md:flex-none">⬅️ PREVIOUS TAB</BrutalistButton>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <BrutalistButton variant="info" compact onClick={handlePrintPDF} className="flex-1 md:flex-none">📄 PRINT ALL (PDF)</BrutalistButton>
        </div>
      </div>

      <BrutalistCard variant="white" className="p-0 overflow-hidden border-4 border-black no-print shadow-[8px_8px_0px_black]">
        <div className="grid grid-cols-4 border-black bg-white">
          {['OVERVIEW', 'SCHEDULE', 'POINTS', 'SETTINGS'].map((tab) => (
            <button 
              key={tab} onClick={() => navigateTo(tab as WorkspaceTab)} 
              className={`p-4 font-black uppercase text-[10px] border-r-4 border-black last:border-r-0 transition-colors ${activeTab === tab ? 'bg-yellow-400 text-black' : 'bg-white hover:bg-gray-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </BrutalistCard>

      <div className="animate-in fade-in duration-500">
        {activeTab === 'OVERVIEW' && (
           <div className="space-y-12">
              <BrutalistCard title="TOURNAMENT LIVE STATUS" variant="yellow">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div className="space-y-6">
                        <div className="flex gap-6 items-center">
                            <div className="w-24 h-24 brutalist-border bg-white flex items-center justify-center p-1 shadow-[4px_4px_0px_black]">
                              {tournament.header.tournamentLogoUrl ? <img src={tournament.header.tournamentLogoUrl} className="max-h-full max-w-full" alt="Logo" /> : <div className="text-3xl font-black text-gray-300 italic">LOGO</div>}
                            </div>
                            <div>
                                <h2 className="text-4xl font-black uppercase tracking-tighter leading-none mb-1">{tournament.name}</h2>
                                <p className="mono text-[10px] font-bold uppercase text-gray-400 italic">DATE: {tournament.createdDate}</p>
                            </div>
                        </div>
                    </div>
                  </div>
              </BrutalistCard>
           </div>
        )}

        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
             <BrutalistCard variant="white" className="p-0 overflow-hidden border-4 border-black no-print shadow-[4px_4px_0px_black] max-w-md mx-auto">
                <div className="grid grid-cols-3 border-black bg-white">
                  {(['ACTUAL', 'FULL', 'MATRIX'] as ScheduleSubTab[]).map((sub) => (
                    <button 
                      key={sub} onClick={() => setActiveScheduleSubTab(sub)} 
                      className={`p-3 font-black uppercase text-[9px] border-r-4 border-black last:border-r-0 transition-colors ${activeScheduleSubTab === sub ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}
                    >
                      {sub === 'ACTUAL' ? '1. Schedule' : sub === 'FULL' ? '2. Full Schedule' : '3. Distribution & Matrix'}
                    </button>
                  ))}
                </div>
             </BrutalistCard>

             {activeScheduleSubTab === 'ACTUAL' && (
               <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex justify-between items-end no-print">
                      <div className="max-w-xs w-full">
                        <label className="block text-[10px] font-black uppercase mb-1">Filter by Team</label>
                        <select className="w-full brutalist-border p-2 font-black uppercase text-xs bg-white text-black outline-none" value={scheduleFilters.team} onChange={e => setScheduleFilters({ team: e.target.value })}>
                           <option value="">ALL TEAMS</option>
                           {tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                  </div>

                  <div className="space-y-8">
                      {roundsData.map((r) => {
                        const sInR = r.series.filter(s => !scheduleFilters.team || s.team1Id === scheduleFilters.team || s.team2Id === scheduleFilters.team);
                        if (sInR.length === 0) return null;
                        const isRoundExp = expandedRounds.includes(r.num);
                        return (
                          <div key={r.num} ref={el => { roundRefs.current[r.num] = el; }} className="space-y-4 print-break-after">
                             <div className="flex gap-2 items-center">
                                <div onClick={() => toggleRound(r.num)} className="flex-1 p-3 brutalist-border bg-black text-white text-center shadow-[4px_4px_0px_black] cursor-pointer hover:bg-gray-900 transition-colors">
                                    <h3 className="text-2xl font-black uppercase italic tracking-tighter">ROUND {r.num} {isRoundExp ? '▲' : '▼'}</h3>
                                </div>
                                <div className="flex gap-1 no-print">
                                    <BrutalistButton variant="cyan" compact onClick={() => handleSnap({ current: roundRefs.current[r.num] }, `Round_${r.num}.png`)}>📸 IMG</BrutalistButton>
                                    <BrutalistButton variant="magenta" compact onClick={handlePrintPDF}>📄 PDF</BrutalistButton>
                                </div>
                             </div>
                             
                             {isRoundExp && (
                             <div className="space-y-12 animate-in slide-in-from-top-4 duration-300">
                                {sInR.map((s, sIdx) => {
                                  const t1 = tournament.teams.find(t => t.id === s.team1Id);
                                  const t2 = tournament.teams.find(t => t.id === s.team2Id);
                                  const perf = getSeriesPerformance(s.id);
                                  const seriesMatches = safeMatches.filter(m => m.seriesId === s.id);
                                  const isSeriesExp = expandedSeries.includes(s.id);

                                  return (
                                    <div key={s.id} className="brutalist-border overflow-hidden shadow-[8px_8px_0px_black] border-black bg-white">
                                       <div 
                                          onClick={() => toggleSeries(s.id)}
                                          className="bg-[#9ec5fe] border-b-2 border-black p-3 font-black uppercase text-xs text-center tracking-widest leading-none cursor-pointer hover:bg-[#7faefc] transition-colors"
                                       >
                                          ROUND {r.num} | SERIES {sIdx + 1} ({s.matchCount} MATCHES) {isSeriesExp ? '▲' : '▼'}
                                       </div>
                                       
                                       {isSeriesExp && (
                                       <div className="animate-in slide-in-from-top-2">
                                           <div className="grid grid-cols-3 text-center items-stretch bg-white border-b-2 border-black">
                                              <div className="flex flex-col justify-center p-6 border-r-2 border-black" style={{ backgroundColor: perf?.winner === s.team1Id ? '#4ade80' : (perf?.winner === s.team2Id ? '#fb2c36' : t1?.color || '#ffffff') }}>
                                                 <span className="text-xl font-black uppercase leading-tight text-black">{t1?.name}</span>
                                                 <span className="text-[10px] font-black uppercase italic mt-1 text-black">
                                                    {perf?.winner === s.team1Id ? 'SERIES WINNER' : (perf?.winner === s.team2Id ? 'SERIES LOSER' : (perf?.t1.sD ? 'SERIES DRAWN' : ''))}
                                                 </span>
                                              </div>
                                              <div className="p-6 border-r-2 border-black flex flex-col justify-center bg-white">
                                                 <span className="text-6xl font-black italic tracking-tighter leading-none text-black">{perf ? `${perf.t1.w}-${perf.t2.w}` : '0-0'}</span>
                                                 <span className="text-xs font-black uppercase mt-3 tracking-widest text-black">SERIES SCORE</span>
                                              </div>
                                              <div className="flex flex-col justify-center p-6" style={{ backgroundColor: perf?.winner === s.team2Id ? '#4ade80' : (perf?.winner === s.team1Id ? '#fb2c36' : t2?.color || '#ffffff') }}>
                                                 <span className="text-xl font-black uppercase leading-tight text-black">{t2?.name}</span>
                                                 <span className="text-[10px] font-black uppercase italic mt-1 text-black">
                                                    {perf?.winner === s.team2Id ? 'SERIES WINNER' : (perf?.winner === s.team1Id ? 'SERIES LOSER' : (perf?.t2.sD ? 'SERIES DRAWN' : ''))}
                                                 </span>
                                              </div>
                                           </div>

                                           <div className="bg-[#facc15] grid grid-cols-3 text-center items-center border-b-2 border-black py-2">
                                              <div className="text-2xl font-black italic text-black">{perf?.t1.total}</div>
                                              <div className="text-sm font-black uppercase tracking-widest text-black">TOTAL POINTS</div>
                                              <div className="text-2xl font-black italic text-black">{perf?.t2.total}</div>
                                           </div>

                                           <div className="overflow-x-auto bg-[#9ec5fe]">
                                              <table className="w-full text-center font-black uppercase text-[10px] border-collapse">
                                                 <thead className="bg-[#9ec5fe] border-b-2 border-black">
                                                    <tr>
                                                       <th className="p-2.5 border-r-2 border-black w-24 text-black">#</th>
                                                       <th className="p-2.5 border-r-2 border-black text-black">TEAM A</th>
                                                       <th className="p-2.5 border-r-2 border-black text-black">POINT A</th>
                                                       <th className="p-2.5 border-r-2 border-black text-black">POINT B</th>
                                                       <th className="p-2.5 border-r-2 border-black text-black">TEAM B</th>
                                                       <th className="p-2.5 text-black no-print">ACTION</th>
                                                    </tr>
                                                 </thead>
                                                 <tbody>
                                                    {seriesMatches.map((m, mIdx) => {
                                                       const pts = getMatchPoints(m);
                                                       return (
                                                          <tr key={m.id} className="border-b-2 border-black last:border-b-0">
                                                             <td className="p-3 border-r-2 border-black bg-[#9ec5fe] font-black text-sm text-black">{mIdx + 1}</td>
                                                             <td className="p-3 border-r-2 border-black font-black text-xs bg-white text-black">{t1?.name}</td>
                                                             <td className="p-3 border-r-2 border-black font-black text-sm bg-white text-black">{m.status === 'COMPLETED' ? pts.t1 : '-'}</td>
                                                             <td className="p-3 border-r-2 border-black font-black text-sm bg-white text-black">{m.status === 'COMPLETED' ? pts.t2 : '-'}</td>
                                                             <td className="p-3 border-r-2 border-black font-black text-xs bg-white text-black">{t2?.name}</td>
                                                             <td className="p-2 bg-[#9ec5fe] no-print">
                                                                <div className="flex gap-1 justify-center">
                                                                    <BrutalistButton variant={m.status === 'COMPLETED' ? 'secondary' : 'success'} compact className="text-[9px] shadow-none !border-2" onClick={(e) => { e.stopPropagation(); setConfirmingAction({ type: 'SAVE_RESULT', matchId: m.id }); }}>{m.status === 'COMPLETED' ? 'EDIT' : 'ENTER'}</BrutalistButton>
                                                                    <BrutalistButton variant="danger" compact className="text-[9px] shadow-none !border-2" onClick={(e) => { e.stopPropagation(); setConfirmingAction({ type: 'REMOVE_MATCH', matchId: m.id }); }}>🗑️</BrutalistButton>
                                                                </div>
                                                             </td>
                                                          </tr>
                                                       );
                                                    })}
                                                 </tbody>
                                              </table>
                                              <div className="p-2 bg-white flex justify-center no-print">
                                                 <BrutalistButton variant="info" compact onClick={() => handleAddMatch(s.id)}>➕ ADD MATCH TO SERIES</BrutalistButton>
                                              </div>
                                           </div>
                                       </div>
                                       )}
                                    </div>
                                  );
                                })}
                             </div>
                             )}
                          </div>
                        );
                      })}
                  </div>
               </div>
             )}

             {activeScheduleSubTab === 'FULL' && (
               <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print bg-white p-4 brutalist-border shadow-[4px_4px_0px_black]">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow w-full">
                        <div>
                           <label className="block text-[10px] font-black uppercase mb-1">Round</label>
                           <select className="w-full brutalist-border p-2 text-xs font-black uppercase outline-none" value={fullScheduleFilters.round} onChange={e => setFullScheduleFilters({...fullScheduleFilters, round: e.target.value})}>
                              <option value="">All Rounds</option>
                              {Array.from(new Set(safeSeries.map(s => s.round))).sort((a,b)=>a-b).map(r => <option key={r} value={r}>Round {r}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-black uppercase mb-1">Team</label>
                           <select className="w-full brutalist-border p-2 text-xs font-black uppercase outline-none" value={fullScheduleFilters.team} onChange={e => setFullScheduleFilters({...fullScheduleFilters, team: e.target.value})}>
                              <option value="">All Teams</option>
                              {tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-black uppercase mb-1">Status</label>
                           <select className="w-full brutalist-border p-2 text-xs font-black uppercase outline-none" value={fullScheduleFilters.status} onChange={e => setFullScheduleFilters({...fullScheduleFilters, status: e.target.value})}>
                              <option value="">All Statuses</option>
                              <option value="NOT_STARTED">Not Started</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="COMPLETED">Completed</option>
                           </select>
                        </div>
                     </div>
                     <div className="flex gap-2">
                        <BrutalistButton variant="cyan" compact onClick={() => handleSnap(fullScheduleRef, "Full_Schedule.png")}>📸 IMG</BrutalistButton>
                        <BrutalistButton variant="magenta" compact onClick={handlePrintPDF}>📄 PDF</BrutalistButton>
                     </div>
                  </div>

                  <div ref={fullScheduleRef} className="space-y-6">
                    {filteredFullSchedule.map((s, sIdx) => {
                       const t1 = tournament.teams.find(t => t.id === s.team1Id);
                       const t2 = tournament.teams.find(t => t.id === s.team2Id);
                       const seriesMatches = safeMatches.filter(m => m.seriesId === s.id);
                       const isSeriesExp = expandedSeries.includes(s.id);
                       const perf = getSeriesPerformance(s.id);

                       return (
                          <BrutalistCard key={s.id} variant="white" className="p-0 overflow-hidden border-4 border-black">
                             <div 
                                onClick={() => toggleSeries(s.id)}
                                className="bg-black text-white p-3 font-black uppercase text-xs flex justify-between items-center cursor-pointer hover:bg-gray-800"
                             >
                                <span>ROUND {s.round} | {t1?.shortName} VS {t2?.shortName} ({s.matchCount} MATCHES)</span>
                                <div className="flex items-center gap-3">
                                   <span className={`px-2 py-0.5 text-[8px] border border-white ${s.status === 'COMPLETED' ? 'bg-emerald-600' : (s.status === 'IN_PROGRESS' ? 'bg-yellow-600' : 'bg-gray-700')}`}>
                                      {s.status}
                                   </span>
                                   <span>{isSeriesExp ? '▲' : '▼'}</span>
                                </div>
                             </div>

                             {isSeriesExp && (
                                <div className="animate-in slide-in-from-top-2 border-t-2 border-black">
                                   <div className="grid grid-cols-3 text-center border-b-2 border-black bg-gray-50">
                                      <div className="p-4 border-r-2 border-black">
                                         <div className="text-[8px] font-black uppercase text-gray-400">Team A</div>
                                         <div className="text-sm font-black">{t1?.name}</div>
                                         <div className="text-xl font-black italic">{perf?.t1.w} Wins</div>
                                      </div>
                                      <div className="p-4 border-r-2 border-black flex flex-col justify-center items-center">
                                         <div className="text-[10px] font-black italic">SERIES SCORE</div>
                                         <div className="text-2xl font-black">{perf?.t1.w} - {perf?.t2.w}</div>
                                      </div>
                                      <div className="p-4">
                                         <div className="text-[8px] font-black uppercase text-gray-400">Team B</div>
                                         <div className="text-sm font-black">{t2?.name}</div>
                                         <div className="text-xl font-black italic">{perf?.t2.w} Wins</div>
                                      </div>
                                   </div>

                                   <div className="overflow-x-auto">
                                      <table className="w-full text-center text-[10px] font-black uppercase">
                                         <thead className="bg-yellow-400 border-b-2 border-black">
                                            <tr>
                                               <th className="p-2 border-r-2 border-black">MATCH #</th>
                                               <th className="p-2 border-r-2 border-black">VENUE</th>
                                               <th className="p-2 border-r-2 border-black">RESULT</th>
                                               <th className="p-2 no-print">ACTION</th>
                                            </tr>
                                         </thead>
                                         <tbody>
                                            {seriesMatches.map((m, mIdx) => {
                                               const venue = tournament.stadiums.find(st => st.id === m.venueId)?.name || 'Default';
                                               return (
                                                  <tr key={m.id} className="border-b border-black last:border-0 hover:bg-gray-50">
                                                     <td className="p-2 border-r-2 border-black font-black">MATCH {mIdx + 1}</td>
                                                     <td className="p-2 border-r-2 border-black">{venue}</td>
                                                     <td className="p-2 border-r-2 border-black">
                                                        {m.status === 'COMPLETED' ? (
                                                           <span className="bg-black text-white px-2 py-0.5">{m.resultType}</span>
                                                        ) : (
                                                           <span className="text-gray-300 italic">PENDING</span>
                                                        )}
                                                     </td>
                                                     <td className="p-1 no-print">
                                                        <div className="flex gap-1 justify-center">
                                                            <BrutalistButton variant={m.status === 'COMPLETED' ? 'secondary' : 'success'} compact className="text-[8px] !py-0.5" onClick={() => setConfirmingAction({ type: 'SAVE_RESULT', matchId: m.id })}>
                                                               {m.status === 'COMPLETED' ? 'EDIT' : 'ENTER'}
                                                            </BrutalistButton>
                                                            <BrutalistButton variant="danger" compact className="text-[8px] !py-0.5" onClick={() => setConfirmingAction({ type: 'REMOVE_MATCH', matchId: m.id })}>
                                                               REMOVE
                                                            </BrutalistButton>
                                                        </div>
                                                     </td>
                                                  </tr>
                                               );
                                            })}
                                         </tbody>
                                      </table>
                                   </div>
                                   <div className="p-2 bg-black flex justify-center no-print gap-2">
                                      <BrutalistButton variant="info" compact onClick={() => handleAddMatch(s.id)}>➕ ADD MATCH</BrutalistButton>
                                   </div>
                                </div>
                             )}
                          </BrutalistCard>
                       );
                    })}
                  </div>
               </div>
             )}

             {activeScheduleSubTab === 'MATRIX' && (
               <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex justify-end gap-2 no-print">
                     <BrutalistButton variant="cyan" compact onClick={() => handleSnap(matrixRef, "Match_Matrix.png")}>📸 IMG</BrutalistButton>
                     <BrutalistButton variant="magenta" compact onClick={handlePrintPDF}>📄 PDF</BrutalistButton>
                  </div>
                  <div ref={matrixRef}>
                    <BrutalistCard title="MATCH MATRIX (N × N RELATIONSHIP)" variant="blue">
                        <div className="overflow-x-auto brutalist-border bg-white p-4">
                            <table className="w-full text-center border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-2 bg-black text-white border border-black text-[10px]">TEAM</th>
                                    {tournament.teams.map((t) => (
                                        <th key={t.id} className="p-2 bg-gray-200 border border-black font-black text-[10px] uppercase text-black">
                                        {t.shortName}
                                        </th>
                                    ))}
                                    <th className="p-2 bg-yellow-400 border border-black font-black text-[10px] uppercase text-black">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tournament.teams.map((t1, i) => {
                                    let rowTotal = 0;
                                    return (
                                        <tr key={t1.id}>
                                        <td className="p-2 bg-gray-200 border border-black font-black text-[10px] uppercase text-black">
                                            {t1.shortName}
                                        </td>
                                        {tournament.teams.map((t2, j) => {
                                            const series = safeSeries.find(s => (s.team1Id === t1.id && s.team2Id === t2.id) || (s.team1Id === t2.id && s.team2Id === t1.id));
                                            const count = series?.matchCount || 0;
                                            if (i !== j) rowTotal += count;
                                            return (
                                                <td key={t2.id} className={`p-2 border border-black text-sm font-black text-black ${i === j ? 'bg-gray-100' : 'bg-white'}`}>
                                                    {i === j ? '0' : count}
                                                </td>
                                            );
                                        })}
                                        <td className="p-2 bg-yellow-50 border border-black font-black text-sm text-black">
                                            {rowTotal}
                                        </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            </table>
                        </div>
                    </BrutalistCard>
                  </div>

                  <div className="flex justify-end gap-2 no-print">
                     <BrutalistButton variant="cyan" compact onClick={() => handleSnap(distributionRef, "Distribution.png")}>📸 IMG</BrutalistButton>
                     <BrutalistButton variant="magenta" compact onClick={handlePrintPDF}>📄 PDF</BrutalistButton>
                  </div>
                  <div ref={distributionRef}>
                    <BrutalistCard title="TEAM-WISE MATCH DISTRIBUTION SUMMARY (CLICK FOR PROFILE)" variant="cyan">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {tournament.teams.map(t => {
                            const totalMatches = safeSeries.filter(s => s.team1Id === t.id || s.team2Id === t.id).reduce((sum, s) => sum + s.matchCount, 0);
                            return (
                                <div 
                                    key={t.id} 
                                    onClick={() => setSelectedProfileTeamId(t.id)}
                                    className="brutalist-border p-3 bg-white shadow-[4px_4px_0px_black] flex flex-col items-center cursor-pointer hover:bg-yellow-100 hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                                >
                                    <div className="w-12 h-12 brutalist-border mb-2 p-1 bg-white">
                                        {t.logoUrl ? <img src={t.logoUrl} className="w-full h-full object-contain" alt="Logo" /> : <span className="font-black text-xs">{t.shortName}</span>}
                                    </div>
                                    <span className="text-[10px] font-black uppercase text-center mb-1 leading-none">{t.name}</span>
                                    <div className="text-2xl font-black italic text-black">{totalMatches} <span className="text-[8px] not-italic opacity-50 uppercase">Matches</span></div>
                                </div>
                            );
                            })}
                        </div>
                    </BrutalistCard>
                  </div>
               </div>
             )}
          </div>
        )}

        {activeTab === 'POINTS' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print">
              <div className="bg-black text-white p-6 brutalist-border shadow-[8px_8px_0px_#facc15] flex-1">
                <h2 className="text-4xl font-black uppercase italic leading-none tracking-tighter">Points Table</h2>
                <p className="text-[10px] mono text-yellow-400 font-bold uppercase mt-2 italic tracking-widest leading-none">Global Ranking and Metrics</p>
              </div>
              <div className="flex gap-2">
                <BrutalistButton variant="accent" onClick={() => handleSnap(pointsTableRef, "wtc_standings.png")}>EXPORT PNG</BrutalistButton>
                <BrutalistButton variant="magenta" onClick={handlePrintPDF}>PRINT PDF</BrutalistButton>
              </div>
            </div>
            
            <div ref={pointsTableRef} className="bg-white brutalist-border overflow-x-auto p-4 shadow-[12px_12px_0px_black]">
              <table className="w-full text-left uppercase font-black text-[10px] border-collapse">
                <thead className="bg-gray-100 border-b-4 border-black">
                  <tr>
                    {visibleColumns['Standing'] && <th className="p-3 border-r-2 border-black text-center">Pos</th>}
                    {visibleColumns['Team Name'] && <th className="p-3 border-r-2 border-black min-w-[180px]">Team Name</th>}
                    {visibleColumns['Series Played'] && <th className="p-3 border-r-2 border-black text-center">SP</th>}
                    {visibleColumns['Series Completed'] && <th className="p-3 border-r-2 border-black text-center">SC</th>}
                    {visibleColumns['Series Left'] && <th className="p-3 border-r-2 border-black text-center">SL</th>}
                    {visibleColumns['Matches Played'] && <th className="p-3 border-r-2 border-black text-center">MP</th>}
                    {visibleColumns['Matches Won'] && <th className="p-3 border-r-2 border-black text-center text-emerald-600">W</th>}
                    {visibleColumns['Matches Drawn'] && <th className="p-3 border-r-2 border-black text-center text-gray-500">D</th>}
                    {visibleColumns['Matches Lost'] && <th className="p-3 border-r-2 border-black text-center text-rose-600">L</th>}
                    {visibleColumns['Total Point'] && <th className="p-3 border-r-2 border-black text-center bg-gray-200">PTS</th>}
                    {visibleColumns['Maximum Possible Points'] && <th className="p-3 border-r-2 border-black text-center italic text-gray-400">MAX</th>}
                    {visibleColumns['Points Percentage'] && <th className="p-3 border-r-2 border-black text-center bg-yellow-400/20 text-xs italic font-black">PCT%</th>}
                    {visibleColumns['Bonus Point'] && <th className="p-3 border-r-2 border-black text-center text-emerald-600">BNS</th>}
                    {visibleColumns['Penalty Points'] && <th className="p-3 border-r-2 border-black text-center text-rose-600">PEN</th>}
                    <th className="p-3 text-center no-print">ADJ</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((t, idx) => (
                    <tr key={t.id} className="border-b-2 border-black hover:bg-yellow-50 transition-colors">
                      {visibleColumns['Standing'] && <td className="p-3 border-r-2 border-black mono text-center bg-gray-50 text-xl italic font-black">#{idx+1}</td>}
                      {visibleColumns['Team Name'] && (
                        <td className="p-3 border-r-2 border-black">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 flex items-center justify-center brutalist-border bg-white overflow-hidden p-0.5 shadow-[2px_2px_0px_black]" style={{ borderColor: t.color || 'black' }}>
                                {t.logoUrl ? <img src={t.logoUrl} className="w-full h-full object-contain" alt="Logo" /> : <span className="text-[10px] font-black">{t.shortName}</span>}
                             </div>
                             <span className="text-sm tracking-tighter truncate leading-none italic font-black uppercase">{t.name}</span>
                          </div>
                        </td>
                      )}
                      {visibleColumns['Series Played'] && <td className="p-3 border-r-2 border-black mono text-center">{t.seriesPlayedCount}</td>}
                      {visibleColumns['Series Completed'] && <td className="p-3 border-r-2 border-black mono text-center">{t.seriesCompletedCount}</td>}
                      {visibleColumns['Series Left'] && <td className="p-3 border-r-2 border-black mono text-center font-bold text-gray-400">{t.seriesLeftCount}</td>}
                      {visibleColumns['Matches Played'] && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesPlayed}</td>}
                      {visibleColumns['Matches Won'] && <td className="p-3 border-r-2 border-black mono text-center text-emerald-600 font-bold">{t.matchesWon}</td>}
                      {visibleColumns['Matches Drawn'] && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesDrawn}</td>}
                      {visibleColumns['Matches Lost'] && <td className="p-3 border-r-2 border-black mono text-center text-rose-600 font-bold">{t.matchesLost}</td>}
                      {visibleColumns['Total Point'] && <td className="p-3 border-r-2 border-black mono text-center font-black bg-gray-50">{t.totalPoints}</td>}
                      {visibleColumns['Maximum Possible Points'] && <td className="p-3 border-r-2 border-black mono text-center text-gray-400 italic">{t.maxPossiblePoints}</td>}
                      {visibleColumns['Points Percentage'] && <td className="p-3 border-r-2 border-black mono text-center bg-yellow-400/10 text-xl italic font-black">{t.pct.toFixed(2)}%</td>}
                      {visibleColumns['Bonus Point'] && <td className="p-3 border-r-2 border-black mono text-center text-emerald-600 font-bold">{t.bonusPoints + t.manualBonusPoints}</td>}
                      {visibleColumns['Penalty Points'] && <td className="p-3 border-r-2 border-black mono text-center text-rose-600 font-bold">{t.penaltyPoints}</td>}
                      <td className="p-3 text-center no-print">
                        <div className="flex gap-1 justify-center">
                           <button onClick={() => setConfirmingAction({ type: 'APPLY_BONUS', teamId: t.id })} className="w-6 h-6 bg-emerald-500 text-white brutalist-border shadow-[1px_1px_0px_black] font-black text-xs hover:bg-emerald-400 transition-transform active:scale-95">+</button>
                           <button onClick={() => setConfirmingAction({ type: 'APPLY_PENALTY', teamId: t.id })} className="w-6 h-6 bg-rose-500 text-white brutalist-border shadow-[1px_1px_0px_black] font-black text-xs hover:bg-rose-400 transition-transform active:scale-95">-</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="no-print pt-6">
               <BrutalistCard title="CONFIGURE COLUMN VISIBILITY (ON / OFF)" variant="cyan" compact>
                  <div className="flex flex-wrap gap-x-6 gap-y-4 p-4 justify-center">
                    {Object.keys(visibleColumns).map(col => (
                       <label key={col} className="flex items-center gap-3 cursor-pointer group">
                          <div className="relative inline-flex items-center h-6 w-12 brutalist-border bg-white transition-colors duration-200">
                             <input 
                               type="checkbox" 
                               className="sr-only" 
                               checked={visibleColumns[col]} 
                               onChange={() => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))} 
                             />
                             <div className={`absolute h-4 w-4 brutalist-border bg-black top-0.5 left-0.5 transition-transform duration-200 ${visibleColumns[col] ? 'translate-x-6 bg-yellow-400' : ''}`}></div>
                          </div>
                          <span className="text-[10px] font-black uppercase italic group-hover:underline tracking-tighter text-black">{col}</span>
                       </label>
                    ))}
                  </div>
               </BrutalistCard>
            </div>
          </div>
        )}

        {activeTab === 'SETTINGS' && (
           <div className="space-y-8">
              <BrutalistCard title="CHAMPIONSHIP AUDIT LOGS" variant="white">
                 <div className="space-y-1 max-h-96 overflow-y-auto pr-2">
                    {safeLogs.map(log => (
                      <div key={log.id} className="p-2 border-b-2 border-black/10 text-[10px] uppercase font-black hover:bg-gray-50 text-black">
                         <span className={`font-black ${log.type === 'BONUS' ? 'text-emerald-600' : log.type === 'PENALTY' ? 'text-rose-600' : 'text-blue-600'}`}>[{log.timestamp}]</span> <span className="text-gray-400">{log.type}:</span> {log.reason}
                      </div>
                    ))}
                 </div>
              </BrutalistCard>
           </div>
        )}
      </div>

      {/* Team Profile Modal */}
      {selectedProfileTeamId && teamProfileData && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300 backdrop-blur-sm overflow-y-auto no-print">
           <BrutalistCard title={`${teamProfileData.team.name} Profile`} className="max-w-4xl w-full bg-white text-black p-0 border-4 border-black shadow-[12px_12px_0px_black] overflow-hidden">
              <div ref={profileRef} className="bg-white">
                <div className="flex flex-col md:flex-row border-b-4 border-black">
                    <div className="md:w-1/3 bg-black text-white p-8 flex flex-col items-center justify-center border-b-4 md:border-b-0 md:border-r-4 border-black">
                        <div className="w-32 h-32 brutalist-border bg-white mb-6 p-2 shadow-[6px_6px_0px_#facc15]">
                        {teamProfileData.team.logoUrl ? <img src={teamProfileData.team.logoUrl} className="w-full h-full object-contain" alt="Logo" /> : <div className="text-black font-black text-4xl h-full flex items-center justify-center">{teamProfileData.team.shortName}</div>}
                        </div>
                        <h2 className="text-3xl font-black uppercase text-center italic tracking-tighter leading-none">{teamProfileData.team.name}</h2>
                        <p className="mono text-xs text-yellow-400 font-bold uppercase mt-2 tracking-widest">{teamProfileData.team.shortName}</p>
                        <div className="mt-8 grid grid-cols-2 w-full gap-4 text-center">
                        <div className="brutalist-border border-white p-2">
                            <span className="block text-[8px] uppercase font-black opacity-50">Rank</span>
                            <span className="text-2xl font-black italic text-yellow-400">#{teamProfileData.pos}</span>
                        </div>
                        <div className="brutalist-border border-white p-2">
                            <span className="block text-[8px] uppercase font-black opacity-50">Points</span>
                            <span className="text-2xl font-black italic text-yellow-400">{teamProfileData.standing?.totalPoints}</span>
                        </div>
                        </div>
                    </div>

                    <div className="flex-1 bg-white p-6 md:p-10 space-y-10">
                        <div>
                        <h4 className="text-sm font-black uppercase border-b-2 border-black mb-4 inline-block tracking-tighter italic">Participation Stats</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="brutalist-border p-3 bg-gray-50">
                                <span className="block text-[8px] uppercase font-black text-gray-400">Series Played</span>
                                <span className="text-lg font-black">{teamProfileData.standing?.seriesCompletedCount} / {safeSeries.filter(s => s.team1Id === selectedProfileTeamId || s.team2Id === selectedProfileTeamId).length}</span>
                            </div>
                            <div className="brutalist-border p-3 bg-gray-50">
                                <span className="block text-[8px] uppercase font-black text-gray-400">Series W/L/D</span>
                                <span className="text-lg font-black text-emerald-600">{teamProfileData.seriesStats.w} / {teamProfileData.seriesStats.l} / {teamProfileData.seriesStats.d}</span>
                            </div>
                            <div className="brutalist-border p-3 bg-gray-50">
                                <span className="block text-[8px] uppercase font-black text-gray-400">Matches Played</span>
                                <span className="text-lg font-black">{teamProfileData.standing?.matchesPlayed} / {safeSeries.filter(s => s.team1Id === selectedProfileTeamId || s.team2Id === selectedProfileTeamId).reduce((sum, s) => sum + s.matchCount, 0)}</span>
                            </div>
                            <div className="brutalist-border p-3 bg-gray-50">
                                <span className="block text-[8px] uppercase font-black text-gray-400">Match W/L/D</span>
                                <span className="text-lg font-black text-emerald-600">{teamProfileData.standing?.matchesWon} / {teamProfileData.standing?.matchesLost} / {teamProfileData.standing?.matchesDrawn}</span>
                            </div>
                        </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-sm font-black uppercase border-b-2 border-black mb-4 inline-block tracking-tighter italic">Granular Points Log</h4>
                            <div className="brutalist-border p-2 max-h-48 overflow-y-auto bg-gray-50 mono text-[9px] uppercase font-black">
                                {teamProfileData.pointsLog.length > 0 ? (
                                    teamProfileData.pointsLog.map((log, idx) => (
                                    <div key={idx} className="flex justify-between items-center py-1 border-b border-black/10 last:border-0">
                                        <span>{log.reason}</span>
                                        <span className={log.type === 'POS' ? 'text-emerald-600' : 'text-rose-600'}>
                                            {log.type === 'POS' ? '+' : '-'}{log.points}
                                        </span>
                                    </div>
                                    ))
                                ) : (
                                    <div className="text-center py-4 text-gray-300">No points recorded yet</div>
                                )}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-sm font-black uppercase border-b-2 border-black mb-4 inline-block tracking-tighter italic">Opponent Tracker</h4>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="brutalist-border p-2 bg-emerald-50">
                                    <span className="block text-[8px] uppercase font-black text-emerald-800 mb-1">COMPLETED OPPONENTS</span>
                                    <div className="flex flex-wrap gap-1">
                                    {teamProfileData.playedOpponents.length > 0 ? teamProfileData.playedOpponents.map(opp => (
                                        <span key={opp.name} className="bg-emerald-200 px-2 py-0.5 brutalist-border border-emerald-800 text-[8px] font-black">{opp.name} ({opp.matchCount} Matches)</span>
                                    )) : <span className="text-[8px] text-emerald-400 italic">None</span>}
                                    </div>
                                </div>
                                <div className="brutalist-border p-2 bg-gray-50">
                                    <span className="block text-[8px] uppercase font-black text-gray-400 mb-1">REMAINING OPPONENTS</span>
                                    <div className="flex flex-wrap gap-1">
                                    {teamProfileData.leftOpponents.length > 0 ? teamProfileData.leftOpponents.map(opp => (
                                        <span key={opp.name} className="bg-white px-2 py-0.5 brutalist-border text-[8px] font-black">{opp.name} ({opp.matchCount} Matches)</span>
                                    )) : <span className="text-[8px] text-gray-400 italic">Tournament Completed</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>
              </div>
              <div className="bg-yellow-400 p-4 border-t-0 flex justify-between no-print">
                 <div className="flex gap-2">
                    <BrutalistButton variant="cyan" compact onClick={() => handleSnap(profileRef, `${teamProfileData.team.shortName}_Profile.png`)}>📸 EXPORT IMG</BrutalistButton>
                    <BrutalistButton variant="magenta" compact onClick={handlePrintPDF}>📄 PRINT PDF</BrutalistButton>
                 </div>
                 <BrutalistButton variant="primary" onClick={() => setSelectedProfileTeamId(null)}>CLOSE PROFILE</BrutalistButton>
              </div>
           </BrutalistCard>
        </div>
      )}

      {/* Confirmation Modals */}
      {confirmingAction?.type === 'REMOVE_MATCH' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200 no-print">
          <BrutalistCard title="⚠️ DANGER: REMOVE MATCH" className="max-w-md w-full bg-white text-black">
             <div className="space-y-4 py-4">
                <p className="font-black uppercase text-sm text-center italic">Are you sure you want to permanently remove this match? This will recalculate all team standings.</p>
                <div className="flex gap-2 pt-6">
                    <BrutalistButton variant="danger" className="flex-1" onClick={finalizeRemoveMatch}>YES, REMOVE</BrutalistButton>
                    <BrutalistButton variant="secondary" className="flex-1" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton>
                </div>
             </div>
          </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200 no-print">
          <BrutalistCard title="COMMIT MATCH RESULT" className="max-w-md w-full bg-white text-black">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-3">
                {[safeMatches.find(m => m.id === confirmingAction.matchId)?.team1Id, safeMatches.find(m => m.id === confirmingAction.matchId)?.team2Id].map(tid => {
                   const team = tournament.teams.find(te => te.id === tid);
                   return (<button key={tid} onClick={() => setResultForm({ winnerId: tid!, resultType: tid === safeMatches.find(m => m.id === confirmingAction.matchId)?.team1Id ? 'T1_WIN' : 'T2_WIN' })} className={`p-4 brutalist-border font-black uppercase text-sm brutalist-shadow transition-all ${resultForm.winnerId === tid ? 'bg-black text-white shadow-none' : 'bg-white hover:bg-gray-100'}`}>{team?.name} WIN</button>);
                })}
                <button onClick={() => setResultForm({ winnerId: '', resultType: 'DRAW' })} className={`p-4 brutalist-border font-black uppercase text-sm brutalist-shadow transition-all ${resultForm.resultType === 'DRAW' ? 'bg-black text-white shadow-none' : 'bg-white hover:bg-gray-100'}`}>DRAW / TIE / NO RESULT</button>
              </div>
              <div className="flex gap-2 pt-6"><BrutalistButton variant="success" className="flex-1" onClick={handleCommitResult}>SAVE RESULT</BrutalistButton><BrutalistButton variant="secondary" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton></div>
            </div>
          </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'APPLY_PENALTY' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200 no-print">
          <BrutalistCard title="DEDUCT POINTS" className="max-w-md w-full bg-white text-black">
             <div className="space-y-4 py-4">
                <div><label className="block text-[10px] font-black uppercase mb-1">Target Team</label><select className="w-full brutalist-border p-3 font-black uppercase text-xs bg-white text-black outline-none" value={penaltyForm.teamId || confirmingAction.teamId} onChange={e => setPenaltyForm({ ...penaltyForm, teamId: e.target.value })}><option value="">-- SELECT TEAM --</option>{tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-black uppercase mb-1">Deduction</label><input type="number" className="w-full brutalist-border p-3 font-black text-sm text-black outline-none bg-white" value={penaltyForm.points} onChange={e => setPenaltyForm({ ...penaltyForm, points: Number(e.target.value) })}/></div><div><label className="block text-[10px] font-black uppercase mb-1">Reason</label><input className="w-full brutalist-border p-3 font-black uppercase text-xs text-black outline-none bg-white" value={penaltyForm.reason} onChange={e => setPenaltyForm({ ...penaltyForm, reason: e.target.value })} placeholder="E.G. OVER RATE"/></div></div>
                <div className="flex gap-2 pt-6"><BrutalistButton variant="danger" className="flex-1" onClick={handleApplyPenalty}>DEDUCT</BrutalistButton><BrutalistButton variant="secondary" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton></div>
             </div>
          </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'APPLY_BONUS' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200 no-print">
          <BrutalistCard title="AWARD MANUAL BONUS" className="max-w-md w-full bg-white text-black">
             <div className="space-y-4 py-4">
                <div><label className="block text-[10px] font-black uppercase mb-1">Target Team</label><select className="w-full brutalist-border p-3 font-black uppercase text-xs bg-white text-black outline-none" value={bonusForm.teamId || confirmingAction.teamId} onChange={e => setBonusForm({ ...bonusForm, teamId: e.target.value })}><option value="">-- SELECT TEAM --</option>{tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                <div className="grid grid-cols-2 gap-4"><div><label className="block text-[10px] font-black uppercase mb-1">Points</label><input type="number" className="w-full brutalist-border p-3 font-black text-sm text-black outline-none bg-white" value={bonusForm.points} onChange={e => setBonusForm({ ...bonusForm, points: Number(e.target.value) })}/></div><div><label className="block text-[10px] font-black uppercase mb-1">Reason</label><input className="w-full brutalist-border p-3 font-black uppercase text-xs text-black outline-none bg-white" value={bonusForm.reason} onChange={e => setBonusForm({ ...bonusForm, reason: e.target.value })} placeholder="E.G. PERFORMANCE"/></div></div>
                <div className="flex gap-2 pt-6"><BrutalistButton variant="success" className="flex-1" onClick={handleApplyBonus}>AWARD</BrutalistButton><BrutalistButton variant="secondary" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton></div>
             </div>
          </BrutalistCard>
        </div>
      )}
    </div>
  );
};

export default TournamentWorkspace;
