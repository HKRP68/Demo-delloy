
import React, { useState, useMemo, useRef } from 'react';
import { Tournament, WorkspaceTab, Team, Match, MatchResultType, SeriesGroup, PenaltyRecord } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';
import * as htmlToImage from 'html-to-image';

interface TournamentWorkspaceProps {
  tournament: Tournament;
  onExit: () => void;
  onUpdateTournament?: (updated: Tournament) => void;
}

const TournamentWorkspace: React.FC<TournamentWorkspaceProps> = ({ tournament, onExit, onUpdateTournament }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('DASHBOARD');
  
  // Schedule Specific States
  const [expandedRounds, setExpandedRounds] = useState<number[]>([]);
  const [expandedSeries, setExpandedSeries] = useState<string[]>([]);
  const [scheduleFilters, setScheduleFilters] = useState({
    round: '',
    team: '',
    status: ''
  });

  const [showFullTable, setShowFullTable] = useState(false);

  // Column Visibility State
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    standing: true,
    team: true,
    seriesPlayed: false,
    seriesCompletedCount: false,
    seriesLeft: false,
    matchesPlayed: true,
    matchesWon: true,
    matchesDrawn: true,
    matchesLost: true,
    totalPoints: true,
    maxPossiblePoints: true,
    pct: true,
    penaltyPoints: true,
    finalPoints: false
  });

  // Fix: Added missing handleToggleFullTable function
  const handleToggleFullTable = () => {
    const nextVal = !showFullTable;
    setShowFullTable(nextVal);
    const updated = { ...visibleColumns };
    Object.keys(updated).forEach(k => {
      updated[k] = nextVal;
    });
    // If turning off "Full Table", restore the specific default visibility configuration
    if (!nextVal) {
      updated.seriesPlayed = false;
      updated.seriesCompletedCount = false;
      updated.seriesLeft = false;
      updated.finalPoints = false;
      updated.standing = true;
      updated.team = true;
      updated.matchesPlayed = true;
      updated.matchesWon = true;
      updated.matchesDrawn = true;
      updated.matchesLost = true;
      updated.totalPoints = true;
      updated.maxPossiblePoints = true;
      updated.pct = true;
      updated.penaltyPoints = true;
    }
    setVisibleColumns(updated);
  };

  // Fix: Added missing toggleColumn function
  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const pointsTableRef = useRef<HTMLDivElement>(null);
  
  const [confirmingAction, setConfirmingAction] = useState<{ 
    type: 'SAVE_RESULT' | 'REGENERATE_SCHEDULE' | 'ADD_MATCH' | 'REMOVE_MATCH', 
    matchId?: string
  } | null>(null);

  const [resultForm, setResultForm] = useState({
    winnerId: '',
    resultType: 'DRAW' as MatchResultType
  });

  const seriesRange = useMemo(() => {
    const raw = tournament.config.seriesLength || '3-5';
    const parts = raw.split('-').map(p => parseInt(p.replace(/\D/g, ''))).filter(n => !isNaN(n));
    const min = parts[0] || 1;
    const max = parts[1] || min;
    return { min, max };
  }, [tournament.config.seriesLength]);

  const getMatchPoints = (match: Match) => {
    if (match.status !== 'COMPLETED') return { t1: 0, t2: 0 };
    const { pointsForWin, pointsForDraw, pointsForLoss } = tournament.config;
    if (match.resultType === 'T1_WIN') return { t1: pointsForWin, t2: pointsForLoss };
    if (match.resultType === 'T2_WIN') return { t1: pointsForLoss, t2: pointsForWin };
    if (match.resultType === 'DRAW' || match.resultType === 'TIE') return { t1: pointsForDraw, t2: pointsForDraw };
    return { t1: 0, t2: 0 };
  };

  const getSeriesPerformance = (seriesId: string) => {
    const series = tournament.series?.find(s => s.id === seriesId);
    if (!series) return null;
    const matches = tournament.matches.filter(m => m.seriesId === seriesId && m.status === 'COMPLETED');
    const t1Stats = { w: 0, l: 0, d: 0, matchPts: 0, sWin: 0, sLoss: 0, sDraw: 0, sPts: 0, totalPts: 0 };
    const t2Stats = { w: 0, l: 0, d: 0, matchPts: 0, sWin: 0, sLoss: 0, sDraw: 0, sPts: 0, totalPts: 0 };

    matches.forEach(m => {
      const p = getMatchPoints(m);
      t1Stats.matchPts += p.t1; t2Stats.matchPts += p.t2;
      if (m.resultType === 'T1_WIN') { t1Stats.w++; t2Stats.l++; }
      else if (m.resultType === 'T2_WIN') { t2Stats.w++; t1Stats.l++; }
      else { t1Stats.d++; t2Stats.d++; }
    });

    if (series.status === 'COMPLETED' && matches.length > 0) {
      if (t1Stats.w > t2Stats.w) {
        t1Stats.sWin = 1; t2Stats.sLoss = 1;
        if (tournament.config.countSeriesBonus) { t1Stats.sPts = tournament.config.pointsForSeriesWin; t2Stats.sPts = tournament.config.pointsForSeriesLoss; }
      } else if (t2Stats.w > t1Stats.w) {
        t2Stats.sWin = 1; t1Stats.sLoss = 1;
        if (tournament.config.countSeriesBonus) { t2Stats.sPts = tournament.config.pointsForSeriesWin; t1Stats.sPts = tournament.config.pointsForSeriesLoss; }
      } else {
        t1Stats.sDraw = 1; t2Stats.sDraw = 1;
        if (tournament.config.countSeriesBonus) { t1Stats.sPts = tournament.config.pointsForSeriesDraw; t2Stats.sPts = tournament.config.pointsForSeriesDraw; }
      }
    }
    
    t1Stats.totalPts = t1Stats.matchPts + t1Stats.sPts;
    t2Stats.totalPts = t2Stats.matchPts + t2Stats.sPts;
    
    return { t1: t1Stats, t2: t2Stats };
  };

  const standings = useMemo(() => {
    const stats: Record<string, Team & { 
      playedFor: number; 
      seriesCompletedCount: number; 
      seriesTotalCount: number;
      maxPossiblePoints: number;
      plannedMatchesCount: number;
    }> = {};

    tournament.teams.forEach(t => {
      const teamSeries = (tournament.series || []).filter(s => s.team1Id === t.id || s.team2Id === t.id);
      const plannedMatches = (tournament.matches || []).filter(m => m.team1Id === t.id || m.team2Id === t.id);
      
      stats[t.id] = { 
        ...t, 
        seriesPlayed: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesDrawn: 0, 
        matchesTie: 0, matchesNR: 0, basePoints: 0, bonusPoints: 0, penaltyPoints: 0, totalPoints: 0, pct: 0,
        playedFor: 0,
        seriesCompletedCount: 0,
        seriesTotalCount: teamSeries.length,
        plannedMatchesCount: plannedMatches.length,
        maxPossiblePoints: (plannedMatches.length * tournament.config.pointsForWin) + (teamSeries.length * (tournament.config.countSeriesBonus ? tournament.config.pointsForSeriesWin : 0))
      };
    });

    tournament.matches.filter(m => m.status === 'COMPLETED').forEach(m => {
      const t1 = stats[m.team1Id]; const t2 = stats[m.team2Id]; if (!t1 || !t2) return;
      t1.matchesPlayed++; t2.matchesPlayed++;
      t1.playedFor += tournament.config.pointsForWin; t2.playedFor += tournament.config.pointsForWin;
      const pts = getMatchPoints(m);
      t1.basePoints += pts.t1; t2.basePoints += pts.t2;
      if (m.resultType === 'T1_WIN') { t1.matchesWon++; t2.matchesLost++; }
      else if (m.resultType === 'T2_WIN') { t2.matchesWon++; t1.matchesLost++; }
      else { t1.matchesDrawn++; t2.matchesDrawn++; }
    });

    tournament.series?.forEach(s => {
      const isTeam1 = stats[s.team1Id]; const isTeam2 = stats[s.team2Id];
      if (s.status !== 'NOT_STARTED') {
        if (isTeam1) isTeam1.seriesPlayed++;
        if (isTeam2) isTeam2.seriesPlayed++;
      }
      if (s.status === 'COMPLETED') {
        if (isTeam1) isTeam1.seriesCompletedCount++;
        if (isTeam2) isTeam2.seriesCompletedCount++;
        const perf = getSeriesPerformance(s.id);
        if (perf) {
          if (isTeam1) isTeam1.bonusPoints += perf.t1.sPts;
          if (isTeam2) isTeam2.bonusPoints += perf.t2.sPts;
        }
      }
    });

    tournament.penalties.forEach(p => {
      if (stats[p.teamId]) stats[p.teamId].penaltyPoints += p.points;
    });

    return Object.values(stats).map(t => {
      t.totalPoints = t.basePoints + t.bonusPoints; 
      const netPoints = t.totalPoints - t.penaltyPoints;
      t.pct = t.playedFor > 0 ? (netPoints / t.playedFor) * 100 : 0;
      return t;
    }).sort((a, b) => (b.pct - a.pct) || (a.penaltyPoints - b.penaltyPoints) || (b.totalPoints - a.totalPoints));
  }, [tournament]);

  const metrics = useMemo(() => {
    const total = tournament.matches.length;
    const completed = tournament.matches.filter(m => m.status === 'COMPLETED').length;
    return { totalMatches: total, completedMatches: completed, percent: total > 0 ? Math.floor((completed / total) * 100) : 0, leader: standings[0] };
  }, [tournament.matches, standings]);

  const roundsData = useMemo(() => {
    if (!tournament.series) return [];
    const rMap: Record<number, SeriesGroup[]> = {};
    tournament.series.forEach(s => { if (!rMap[s.round]) rMap[s.round] = []; rMap[s.round].push(s); });
    return Object.keys(rMap).map(Number).sort((a, b) => a - b).map(rNum => {
      const sInR = rMap[rNum];
      const mInR = tournament.matches.filter(m => m.round === rNum);
      const mComp = mInR.filter(m => m.status === 'COMPLETED').length;
      let rStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' = 'NOT_STARTED';
      if (mComp === mInR.length && mInR.length > 0) rStatus = 'COMPLETED';
      else if (mComp > 0) rStatus = 'IN_PROGRESS';

      return { 
        num: rNum, 
        series: sInR, 
        status: rStatus, 
        matchCount: mInR.length,
        completedCount: mComp,
        progress: mInR.length > 0 ? Math.floor((mComp / mInR.length) * 100) : 0
      };
    });
  }, [tournament.series, tournament.matches]);

  const filteredRounds = useMemo(() => {
    return roundsData.filter(r => {
      const matchRound = !scheduleFilters.round || r.num === parseInt(scheduleFilters.round);
      const matchTeam = !scheduleFilters.team || r.series.some(s => s.team1Id === scheduleFilters.team || s.team2Id === scheduleFilters.team);
      const matchStatus = !scheduleFilters.status || r.status === scheduleFilters.status;
      return matchRound && matchTeam && matchStatus;
    });
  }, [roundsData, scheduleFilters]);

  const handleSnap = (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
    if (ref && ref.current) {
      htmlToImage.toPng(ref.current, { backgroundColor: '#f3f4f6' }).then(dataUrl => {
        const link = document.createElement('a'); link.download = filename; link.href = dataUrl; link.click();
      }).catch(err => console.error("Snapshot error", err));
    }
  };

  const generateAutoSchedule = () => {
    const teams = tournament.teams.filter(t => t.id !== 'BYE');
    if (teams.length < 2) return alert("Min 2 teams required!");
    
    let success = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 50;

    while (!success && attempt < MAX_ATTEMPTS) {
      attempt++;
      const matches: Match[] = [];
      const series: SeriesGroup[] = [];
      const teamIds = [...teams.map(t => t.id)];
      if (teamIds.length % 2 !== 0) teamIds.push('BYE');
      const roundsCount = teamIds.length - 1;
      const tempTeamIds = [...teamIds];

      const pairings: [string, string][] = [];
      for (let r = 0; r < roundsCount; r++) {
        const roundPairings: [string, string][] = [];
        for (let i = 0; i < tempTeamIds.length / 2; i++) {
          const t1 = tempTeamIds[i]; const t2 = tempTeamIds[tempTeamIds.length - 1 - i];
          if (t1 !== 'BYE' && t2 !== 'BYE') roundPairings.push([t1, t2]);
        }
        roundPairings.forEach(p => pairings.push(p));
        tempTeamIds.splice(1, 0, tempTeamIds.pop()!);
      }

      const teamMatchCounts: Record<string, number> = {};
      teams.forEach(t => teamMatchCounts[t.id] = 0);

      pairings.forEach(([t1, t2], idx) => {
        const roundNum = Math.floor(idx / (teams.length / 2)) + 1;
        const sId = `S-AUTO-${idx}`;
        const mIds: string[] = [];
        const count = Math.floor(Math.random() * (seriesRange.max - seriesRange.min + 1)) + seriesRange.min;
        
        for (let m = 0; m < count; m++) {
          const mId = `M-${sId}-T${m+1}`; mIds.push(mId);
          matches.push({ id: mId, round: roundNum, seriesId: sId, team1Id: t1, team2Id: t2, venueId: tournament.stadiums[m % (tournament.stadiums.length || 1)]?.id || 'V1', status: 'NOT_STARTED' });
        }
        series.push({ id: sId, round: roundNum, team1Id: t1, team2Id: t2, status: 'NOT_STARTED', matchIds: mIds });
        teamMatchCounts[t1] += count;
        teamMatchCounts[t2] += count;
      });

      const counts = Object.values(teamMatchCounts);
      const countFreq: Record<number, number> = {};
      counts.forEach(c => countFreq[c] = (countFreq[c] || 0) + 1);
      const duplicates = Object.values(countFreq).filter(f => f > 1);
      const violates = Object.values(countFreq).some(f => f > 2) || duplicates.length > 1;

      if (!violates || attempt === MAX_ATTEMPTS) {
        onUpdateTournament?.({ ...tournament, matches, series, status: 'ONGOING' });
        success = true;
      }
    }
  };

  const handleAddMatch = (sId: string) => {
    const s = tournament.series?.find(ser => ser.id === sId);
    if (!s) return;
    if (s.matchIds.length >= seriesRange.max) return alert(`Series limit reached (Max: ${seriesRange.max})`);
    
    const newId = `M-ADD-${s.id}-${Date.now()}`;
    const newMatch: Match = { 
      id: newId, round: s.round, seriesId: s.id, team1Id: s.team1Id, team2Id: s.team2Id, 
      venueId: tournament.stadiums[0]?.id || 'V1', status: 'NOT_STARTED' 
    };
    
    onUpdateTournament?.({
      ...tournament,
      matches: [...tournament.matches, newMatch],
      series: tournament.series?.map(ser => ser.id === sId ? { ...ser, matchIds: [...ser.matchIds, newId] } : ser)
    });
  };

  const handleRemoveMatch = (mId: string) => {
    const m = tournament.matches.find(match => match.id === mId);
    if (!m) return;
    const s = tournament.series?.find(ser => ser.id === m.seriesId);
    if (!s) return;
    if (s.matchIds.length <= seriesRange.min) return alert(`Series minimum reached (Min: ${seriesRange.min})`);
    if (m.status !== 'NOT_STARTED') return alert("Cannot remove a match that has started or completed.");

    onUpdateTournament?.({
      ...tournament,
      matches: tournament.matches.filter(match => match.id !== mId),
      series: tournament.series?.map(ser => ser.id === m.seriesId ? { ...ser, matchIds: ser.matchIds.filter(id => id !== mId) } : ser)
    });
  };

  const toggleRound = (num: number) => {
    setExpandedRounds(prev => prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]);
  };

  const toggleSeries = (id: string) => {
    setExpandedSeries(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-8 pb-32">
      <BrutalistCard variant="white" className="p-0 overflow-hidden border-4 border-black no-print shadow-[8px_8px_0px_black]">
        <div className="grid grid-cols-2 md:grid-cols-5 border-black bg-white">
          {['INFO', 'DASHBOARD', 'SCHEDULE', 'POINTS', 'SETTINGS'].map((tab) => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab as WorkspaceTab)} 
              className={`p-4 font-black uppercase text-[10px] border-r-4 border-black last:border-r-0 transition-colors ${activeTab === tab ? 'bg-yellow-400 text-black' : 'bg-white hover:bg-gray-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </BrutalistCard>

      <div className="animate-in fade-in duration-500">
        {activeTab === 'INFO' && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <BrutalistCard title="TOURNAMENT OVERVIEW" variant="yellow">
                  <div className="space-y-4">
                     <div className="flex gap-4 items-center">
                        <div className="w-24 h-24 brutalist-border bg-white flex items-center justify-center p-2">
                           {tournament.header.tournamentLogoUrl ? <img src={tournament.header.tournamentLogoUrl} className="max-h-full max-w-full" alt="" /> : <span className="text-4xl font-black">?</span>}
                        </div>
                        <div>
                           <h2 className="text-2xl font-black uppercase">{tournament.name}</h2>
                           <p className="mono text-[10px] font-bold uppercase text-gray-400">CREATED: {tournament.createdDate}</p>
                        </div>
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 brutalist-border bg-black text-white text-center font-black text-xs uppercase">TEAMS: {tournament.teams.length}</div>
                        <div className="p-2 brutalist-border bg-white text-black text-center font-black text-xs uppercase">VENUES: {tournament.stadiums.length}</div>
                     </div>
                  </div>
              </BrutalistCard>
              <BrutalistCard title="SCORING RULES" variant="lime">
                  <div className="space-y-1 font-black uppercase text-xs">
                    <div className="flex justify-between"><span>Match Win:</span> <span>{tournament.config.pointsForWin} PTS</span></div>
                    <div className="flex justify-between"><span>Match Draw:</span> <span>{tournament.config.pointsForDraw} PTS</span></div>
                    <div className="flex justify-between"><span>Match Loss:</span> <span>{tournament.config.pointsForLoss} PTS</span></div>
                    <div className="border-t-2 border-black my-2"></div>
                    <div className="flex justify-between"><span>Series Bonus:</span> <span>{tournament.config.countSeriesBonus ? 'YES' : 'NO'}</span></div>
                    {tournament.config.countSeriesBonus && (
                      <>
                        <div className="flex justify-between"><span>Series Win:</span> <span>{tournament.config.pointsForSeriesWin} PTS</span></div>
                        <div className="flex justify-between"><span>Series Draw:</span> <span>{tournament.config.pointsForSeriesDraw} PTS</span></div>
                      </>
                    )}
                  </div>
              </BrutalistCard>
           </div>
        )}

        {activeTab === 'DASHBOARD' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-black text-white p-8 brutalist-border shadow-[10px_10px_0px_black]">
              <h4 className="mono text-[10px] uppercase text-yellow-400 mb-2">Tournament Progress</h4>
              <div className="text-6xl font-black">{metrics.percent}%</div>
              <div className="w-full h-6 bg-gray-800 mt-4 brutalist-border relative overflow-hidden">
                <div className="absolute inset-0 bg-yellow-400" style={{ width: `${metrics.percent}%` }}></div>
              </div>
              <p className="mt-4 mono text-[10px] uppercase font-bold">{metrics.completedMatches} OF {metrics.totalMatches} MATCHES COMPLETED</p>
            </div>
            <div className="bg-white p-8 brutalist-border shadow-[10px_10px_0px_black]">
              <h4 className="mono text-[10px] uppercase text-gray-500 mb-2">Current #1 Rank</h4>
              <div className="text-4xl font-black uppercase italic tracking-tighter">{metrics.leader?.name || "N/A"}</div>
              <div className="mt-4 font-black text-xl bg-yellow-400 inline-block px-3 py-1 brutalist-border">{metrics.leader?.pct.toFixed(2)}% PCT</div>
            </div>
          </div>
        )}

        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
            {/* Filter & Search Bar */}
            <BrutalistCard variant="white" compact className="no-print">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-black uppercase mb-1">Filter by Round</label>
                  <select 
                    className="w-full brutalist-border p-2 text-xs font-black uppercase bg-white"
                    value={scheduleFilters.round}
                    onChange={e => setScheduleFilters({...scheduleFilters, round: e.target.value})}
                  >
                    <option value="">ALL ROUNDS</option>
                    {roundsData.map(r => <option key={r.num} value={r.num}>ROUND {r.num}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-black uppercase mb-1">Filter by Team</label>
                  <select 
                    className="w-full brutalist-border p-2 text-xs font-black uppercase bg-white"
                    value={scheduleFilters.team}
                    onChange={e => setScheduleFilters({...scheduleFilters, team: e.target.value})}
                  >
                    <option value="">ALL TEAMS</option>
                    {tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-black uppercase mb-1">Status</label>
                  <select 
                    className="w-full brutalist-border p-2 text-xs font-black uppercase bg-white"
                    value={scheduleFilters.status}
                    onChange={e => setScheduleFilters({...scheduleFilters, status: e.target.value})}
                  >
                    <option value="">ANY STATUS</option>
                    <option value="NOT_STARTED">NOT STARTED</option>
                    <option value="IN_PROGRESS">IN PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
                {!tournament.matches.length && (
                  <BrutalistButton variant="success" compact onClick={generateAutoSchedule}>GENERATE AUTO SCHEDULE</BrutalistButton>
                )}
                <BrutalistButton variant="accent" compact onClick={() => window.print()}>PRINT SCHEDULE</BrutalistButton>
              </div>
            </BrutalistCard>

            {/* Rounds Section */}
            <div className="space-y-4">
               {filteredRounds.map(r => {
                 const isExpanded = expandedRounds.includes(r.num);
                 return (
                   <div key={r.num} className="space-y-2">
                      <div 
                        onClick={() => toggleRound(r.num)}
                        className={`p-6 brutalist-border cursor-pointer transition-all brutalist-shadow hover:translate-x-1 hover:translate-y-1 hover:shadow-none flex flex-col md:flex-row md:items-center justify-between gap-4 ${r.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-white'}`}
                      >
                         <div className="flex flex-col">
                            <h3 className="text-3xl font-black uppercase tracking-tighter">ROUND {r.num}</h3>
                            <div className="flex gap-4 mt-2 mono text-[10px] font-black uppercase">
                               <span>Total Series: {r.series.length}</span>
                               <span>Matches: {r.matchCount}</span>
                               <span className={r.status === 'COMPLETED' ? 'text-black' : 'text-blue-600'}>STATUS: {r.status.replace('_', ' ')}</span>
                            </div>
                         </div>
                         <div className="flex-1 max-w-md hidden md:block px-8">
                            <div className="w-full h-4 brutalist-border bg-gray-200 relative overflow-hidden">
                               <div className="absolute inset-0 bg-black" style={{ width: `${r.progress}%` }}></div>
                            </div>
                            <div className="text-right mono text-[10px] font-black mt-1">{r.progress}% COMPLETE</div>
                         </div>
                         <BrutalistButton variant="secondary" compact className="md:px-8">
                           {isExpanded ? 'CLOSE SERIES ↑' : 'VIEW SERIES ↓'}
                         </BrutalistButton>
                      </div>

                      {/* Series Table (Expanded) */}
                      {isExpanded && (
                        <div className="pl-4 md:pl-10 animate-in slide-in-from-top-4 duration-300">
                           <div className="bg-white brutalist-border overflow-x-auto shadow-[4px_4px_0px_black]">
                             <table className="w-full text-left font-black uppercase text-[10px] border-collapse">
                               <thead className="bg-gray-100 border-b-4 border-black">
                                 <tr>
                                   <th className="p-3 border-r-2 border-black">Series No</th>
                                   <th className="p-3 border-r-2 border-black">Team A vs Team B</th>
                                   <th className="p-3 border-r-2 border-black text-center">Matches</th>
                                   <th className="p-3 border-r-2 border-black">Status</th>
                                   <th className="p-3 border-r-2 border-black text-center">Completed</th>
                                   <th className="p-3 text-center">Action</th>
                                 </tr>
                               </thead>
                               <tbody>
                                 {r.series.map((s, sIdx) => {
                                   const isSeriesExpanded = expandedSeries.includes(s.id);
                                   const t1 = tournament.teams.find(t => t.id === s.team1Id);
                                   const t2 = tournament.teams.find(t => t.id === s.team2Id);
                                   const compMatches = tournament.matches.filter(m => m.seriesId === s.id && m.status === 'COMPLETED').length;
                                   const sPerf = getSeriesPerformance(s.id);
                                   
                                   return (
                                     <React.Fragment key={s.id}>
                                       <tr className={`border-b-2 border-black last:border-0 hover:bg-yellow-50 ${isSeriesExpanded ? 'bg-yellow-100' : ''}`}>
                                         <td className="p-3 border-r-2 border-black mono">#{sIdx + 1}</td>
                                         <td className="p-3 border-r-2 border-black text-sm">{t1?.shortName} VS {t2?.shortName}</td>
                                         <td className="p-3 border-r-2 border-black text-center">{s.matchIds.length}</td>
                                         <td className="p-3 border-r-2 border-black">{s.status.replace('_', ' ')}</td>
                                         <td className="p-3 border-r-2 border-black text-center">{compMatches} / {s.matchIds.length}</td>
                                         <td className="p-3 text-center">
                                           <BrutalistButton variant="magenta" compact onClick={() => toggleSeries(s.id)}>
                                             {isSeriesExpanded ? 'HIDE' : 'MATCHES'}
                                           </BrutalistButton>
                                         </td>
                                       </tr>
                                       
                                       {/* Match Table (Expanded Row) */}
                                       {isSeriesExpanded && (
                                         <tr>
                                           <td colSpan={6} className="bg-gray-50 p-4 border-b-2 border-black">
                                              <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                  <h4 className="text-xl font-black italic">SERIES MATCHES</h4>
                                                  <div className="flex gap-2">
                                                     {s.status !== 'COMPLETED' && (
                                                       <BrutalistButton variant="success" compact onClick={() => handleAddMatch(s.id)}>+ ADD MATCH</BrutalistButton>
                                                     )}
                                                  </div>
                                                </div>
                                                
                                                <div className="brutalist-border bg-white overflow-hidden">
                                                   <table className="w-full text-left font-black text-[9px]">
                                                      <thead className="bg-black text-white">
                                                         <tr>
                                                            <th className="p-2">No</th>
                                                            <th className="p-2">Match Name</th>
                                                            <th className="p-2">Venue</th>
                                                            <th className="p-2">Status</th>
                                                            <th className="p-2">Winner / Result</th>
                                                            <th className="p-2">Points Awarded</th>
                                                            <th className="p-2 text-center">Action</th>
                                                         </tr>
                                                      </thead>
                                                      <tbody>
                                                         {tournament.matches.filter(m => m.seriesId === s.id).map((m, mIdx) => {
                                                           const mPts = getMatchPoints(m);
                                                           return (
                                                             <tr key={m.id} className="border-b-2 border-black last:border-0">
                                                               <td className="p-2 border-r border-black">{mIdx + 1}</td>
                                                               <td className="p-2 border-r border-black">{mIdx + 1}{mIdx === 0 ? 'st' : mIdx === 1 ? 'nd' : mIdx === 2 ? 'rd' : 'th'} Test Match</td>
                                                               <td className="p-2 border-r border-black">{tournament.stadiums.find(st => st.id === m.venueId)?.name || 'V1'}</td>
                                                               <td className="p-2 border-r border-black">{m.status.replace('_', ' ')}</td>
                                                               <td className="p-2 border-r border-black font-black text-blue-600">
                                                                 {m.status === 'COMPLETED' ? (m.resultType === 'DRAW' ? 'DRAW' : (tournament.teams.find(t => t.id === m.winnerId)?.name + ' WON')) : '-'}
                                                               </td>
                                                               <td className="p-2 border-r border-black">
                                                                 {m.status === 'COMPLETED' ? `${t1?.shortName}: ${mPts.t1} | ${t2?.shortName}: ${mPts.t2}` : '-'}
                                                               </td>
                                                               <td className="p-2 text-center">
                                                                  <div className="flex gap-1 justify-center">
                                                                     {m.status === 'NOT_STARTED' && (
                                                                       <>
                                                                          <BrutalistButton variant="danger" compact onClick={() => handleRemoveMatch(m.id)}>RMV</BrutalistButton>
                                                                          <BrutalistButton variant="success" compact onClick={() => setConfirmingAction({ type: 'SAVE_RESULT', matchId: m.id })}>RES</BrutalistButton>
                                                                       </>
                                                                     )}
                                                                  </div>
                                                               </td>
                                                             </tr>
                                                           );
                                                         })}
                                                      </tbody>
                                                   </table>
                                                </div>
                                                
                                                {/* Series Summary in expansion */}
                                                {sPerf && (
                                                   <div className="grid grid-cols-2 gap-4">
                                                      {[ { t: t1, st: sPerf.t1 }, { t: t2, st: sPerf.t2 } ].map((p, i) => (
                                                         <div key={i} className="p-3 brutalist-border bg-yellow-50 text-[9px] font-black uppercase space-y-1">
                                                            <div className="flex justify-between border-b border-black pb-1"><span>{p.t?.name}</span> <span className="text-blue-600">Total: {p.st.totalPts}</span></div>
                                                            <div className="grid grid-cols-3 gap-2">
                                                               <span>W: {p.st.w}</span> <span>D: {p.st.d}</span> <span>L: {p.st.l}</span>
                                                               <span>SW: {p.st.sWin}</span> <span>SL: {p.st.sLoss}</span> <span className="text-emerald-600">SP: {p.st.sPts}</span>
                                                            </div>
                                                         </div>
                                                      ))}
                                                   </div>
                                                )}
                                              </div>
                                           </td>
                                         </tr>
                                       )}
                                     </React.Fragment>
                                   );
                                 })}
                               </tbody>
                             </table>
                           </div>
                        </div>
                      )}
                   </div>
                 );
               })}
            </div>
          </div>
        )}

        {activeTab === 'POINTS' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print">
              <div className="bg-black text-white p-6 brutalist-border shadow-[8px_8px_0px_#facc15] flex-1">
                <h2 className="text-4xl font-black uppercase italic leading-none">TEST Point Table</h2>
                <div className="flex gap-4 mt-2">
                  <button onClick={handleToggleFullTable} className="text-[10px] mono text-yellow-400 font-bold hover:underline">
                    {showFullTable ? '[HIDE FULL POINT TABLE]' : '[SHOW FULL POINT TABLE]'}
                  </button>
                </div>
              </div>
              <BrutalistButton variant="accent" onClick={() => handleSnap(pointsTableRef, "wtc_points_table.png")}>SNAP PNG</BrutalistButton>
            </div>
            
            <div ref={pointsTableRef} className="bg-white brutalist-border overflow-x-auto p-4 shadow-[12px_12px_0px_black]">
              <table className="w-full text-left uppercase font-black text-[9px] border-collapse">
                <thead className="bg-gray-100 border-b-4 border-black">
                  <tr>
                    {visibleColumns.standing && <th className="p-3 border-r-2 border-black text-center">Pos</th>}
                    {visibleColumns.team && <th className="p-3 border-r-2 border-black min-w-[180px]">Team Name</th>}
                    {visibleColumns.seriesPlayed && <th className="p-3 border-r-2 border-black text-center">S.Ply</th>}
                    {visibleColumns.seriesCompletedCount && <th className="p-3 border-r-2 border-black text-center">S.Com</th>}
                    {visibleColumns.seriesLeft && <th className="p-3 border-r-2 border-black text-center">S.Lft</th>}
                    {visibleColumns.matchesPlayed && <th className="p-3 border-r-2 border-black text-center">MP</th>}
                    {visibleColumns.matchesWon && <th className="p-3 border-r-2 border-black text-center text-emerald-600">W</th>}
                    {visibleColumns.matchesDrawn && <th className="p-3 border-r-2 border-black text-center">D</th>}
                    {visibleColumns.matchesLost && <th className="p-3 border-r-2 border-black text-center text-rose-600">L</th>}
                    {visibleColumns.totalPoints && <th className="p-3 border-r-2 border-black text-center bg-gray-200">Total Pts</th>}
                    {visibleColumns.maxPossiblePoints && <th className="p-3 border-r-2 border-black text-center">Max Pts</th>}
                    {visibleColumns.pct && <th className="p-3 border-r-2 border-black text-center bg-yellow-400/20">PCT %</th>}
                    {visibleColumns.penaltyPoints && <th className="p-3 border-r-2 border-black text-center text-rose-600">Pen</th>}
                    {visibleColumns.finalPoints && <th className="p-3 border-r-2 border-black text-center bg-emerald-50">Final</th>}
                  </tr>
                </thead>
                <tbody>
                  {standings.map((t, idx) => {
                    const finalPts = t.totalPoints - t.penaltyPoints;
                    const hasPenalty = t.penaltyPoints > 0;
                    return (
                      <tr key={t.id} className="border-b-2 border-black hover:bg-yellow-50 transition-colors bg-white">
                        {visibleColumns.standing && <td className="p-3 border-r-2 border-black mono text-center bg-gray-50 text-xl italic font-black">#{idx+1}</td>}
                        {visibleColumns.team && (
                          <td className="p-3 border-r-2 border-black">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 flex items-center justify-center brutalist-border bg-white overflow-hidden p-0.5">
                                {t.logoUrl ? <img src={t.logoUrl} className="w-full h-full object-contain" alt="" /> : <span className="text-[10px] font-black">{t.shortName}</span>}
                              </div>
                              <span className="text-[11px] tracking-tight">{t.name}</span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.seriesPlayed && <td className="p-3 border-r-2 border-black mono text-center">{t.seriesPlayed}</td>}
                        {visibleColumns.seriesCompletedCount && <td className="p-3 border-r-2 border-black mono text-center">{(t as any).seriesCompletedCount}</td>}
                        {visibleColumns.seriesLeft && <td className="p-3 border-r-2 border-black mono text-center">{(t as any).seriesTotalCount - (t as any).seriesCompletedCount}</td>}
                        {visibleColumns.matchesPlayed && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesPlayed}</td>}
                        {visibleColumns.matchesWon && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesWon}</td>}
                        {visibleColumns.matchesDrawn && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesDrawn}</td>}
                        {visibleColumns.matchesLost && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesLost}</td>}
                        {visibleColumns.totalPoints && (
                          <td className={`p-3 border-r-2 border-black mono text-center font-black text-[12px] bg-gray-50 ${hasPenalty ? 'text-rose-600' : 'text-black'}`}>
                            {t.totalPoints}
                          </td>
                        )}
                        {visibleColumns.maxPossiblePoints && <td className="p-3 border-r-2 border-black mono text-center text-gray-400">{(t as any).maxPossiblePoints}</td>}
                        {visibleColumns.pct && <td className="p-3 border-r-2 border-black mono text-center bg-yellow-400/10 text-lg italic">{t.pct.toFixed(2)}%</td>}
                        {visibleColumns.penaltyPoints && <td className="p-3 border-r-2 border-black mono text-center text-rose-600">{t.penaltyPoints > 0 ? `-${t.penaltyPoints}` : '0'}</td>}
                        {visibleColumns.finalPoints && <td className="p-3 border-r-2 border-black mono text-center bg-emerald-50/50 text-xl">{finalPts}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <BrutalistCard title="TABLE COLUMN CONFIGURATION (ON/OFF)" variant="white" compact className="no-print">
               <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  {Object.keys(visibleColumns).map(col => (
                    <button 
                      key={col} 
                      onClick={() => toggleColumn(col)} 
                      className={`p-2 brutalist-border font-black uppercase text-[9px] transition-all ${visibleColumns[col] ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'}`}
                    >
                      {col.replace(/([A-Z])/g, ' $1')} : {visibleColumns[col] ? 'ON' : 'OFF'}
                    </button>
                  ))}
               </div>
            </BrutalistCard>
          </div>
        )}

        {activeTab === 'SETTINGS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <BrutalistCard title="APPLY PENALTY" variant="pink">
               <div className="space-y-4">
                 <p className="mono text-[10px] uppercase font-bold text-rose-600">Manual deduction of points from team standings.</p>
                 <select 
                   className="w-full brutalist-border p-3 font-black uppercase bg-white text-black outline-none"
                   onChange={e => {
                     const tId = e.target.value;
                     if (tId) {
                       const ptsString = prompt("Points to deduct?");
                       const pts = ptsString ? parseInt(ptsString) : 0;
                       const rsn = prompt("Reason for penalty?") || "Over rate violation";
                       if (pts > 0) {
                          const newPen: PenaltyRecord = { id: Date.now().toString(), teamId: tId, points: pts, reason: rsn, date: new Date().toLocaleDateString() };
                          onUpdateTournament?.({ ...tournament, penalties: [...tournament.penalties, newPen] });
                       }
                     }
                   }}
                 >
                   <option value="">-- SELECT TEAM FOR PENALTY --</option>
                   {tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                 </select>
                 <div className="mt-4 space-y-2">
                   {tournament.penalties.map(p => (
                     <div key={p.id} className="bg-white p-3 border-2 border-black flex justify-between items-center text-[10px] font-black uppercase shadow-[2px_2px_0px_black]">
                       <span>{tournament.teams.find(t => t.id === p.teamId)?.shortName} | -{p.points} PTS | {p.reason}</span>
                       <button className="text-rose-600 hover:underline" onClick={() => onUpdateTournament?.({...tournament, penalties: tournament.penalties.filter(pen => pen.id !== p.id)})}>REMOVE</button>
                     </div>
                   ))}
                 </div>
               </div>
            </BrutalistCard>
          </div>
        )}
      </div>

      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
          <BrutalistCard title="COMMIT MATCH RESULT" className="max-w-md w-full bg-white">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-2">
                {[tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id, tournament.matches.find(m => m.id === confirmingAction.matchId)?.team2Id].map(tid => {
                   const team = tournament.teams.find(te => te.id === tid);
                   return (
                     <button 
                       key={tid} 
                       onClick={() => setResultForm({ winnerId: tid!, resultType: tid === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id ? 'T1_WIN' : 'T2_WIN' })} 
                       className={`p-4 brutalist-border font-black uppercase text-sm ${resultForm.winnerId === tid ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}
                     >
                       {team?.name} WIN
                     </button>
                   );
                })}
                <button 
                  onClick={() => setResultForm({ winnerId: '', resultType: 'DRAW' })} 
                  className={`p-4 brutalist-border font-black uppercase text-sm ${resultForm.resultType === 'DRAW' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}
                >
                  DRAW / TIE
                </button>
              </div>
              <div className="flex gap-2">
                <BrutalistButton variant="success" className="flex-1" onClick={() => {
                  const updatedMatches = tournament.matches.map(m => m.id === confirmingAction.matchId ? { ...m, status: 'COMPLETED' as const, resultType: resultForm.resultType, winnerId: resultForm.winnerId } : m);
                  const updatedSeries = (tournament.series || []).map(s => {
                    const sMs = updatedMatches.filter(m => m.seriesId === s.id);
                    const isComp = sMs.every(m => m.status === 'COMPLETED');
                    return { ...s, status: (isComp ? 'COMPLETED' : (sMs.some(m => m.status === 'COMPLETED') ? 'NOT_STARTED' : 'NOT_STARTED')) as SeriesGroup['status'] };
                  });
                  onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries });
                  setConfirmingAction(null);
                }}>CONFIRM COMMIT</BrutalistButton>
                <BrutalistButton variant="secondary" className="px-6" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}
    </div>
  );
};

export default TournamentWorkspace;
