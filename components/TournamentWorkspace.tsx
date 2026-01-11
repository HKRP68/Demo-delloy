
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

type ScheduleLevel = 'OVERVIEW' | 'ROUNDS' | 'SERIES' | 'MATCHES' | 'FULL_SCHEDULE';

interface PointLogEntry {
  round: number;
  seriesId: string;
  type: 'MATCH' | 'SERIES_BONUS' | 'PENALTY';
  identifier: string; // "Match 1", "Series Win", etc.
  how: string; // "WIN", "LOSE", "DRAW"
  points: number;
}

const TournamentWorkspace: React.FC<TournamentWorkspaceProps> = ({ tournament, onExit, onUpdateTournament }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('DASHBOARD');
  const [scheduleLevel, setScheduleLevel] = useState<ScheduleLevel>('OVERVIEW');
  const [drillDownRound, setDrillDownRound] = useState<number | null>(null);
  const [drillDownSeries, setDrillDownSeries] = useState<string | null>(null);
  
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [selectedLogTeamId, setSelectedLogTeamId] = useState<string | null>(null);
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [tempTournamentName, setTempTournamentName] = useState(tournament.name);
  const [securityInput, setSecurityInput] = useState('');

  // Refs for Image Download
  const pointsTableRef = useRef<HTMLDivElement>(null);
  const roundScheduleRef = useRef<HTMLDivElement>(null);
  
  const [confirmingAction, setConfirmingAction] = useState<{ 
    type: 'SAVE_RESULT' | 'REGENERATE_SCHEDULE' | 'ADMIN_UNLOCK' | 'DELETE_PENALTY' | 'LOCK_TOURNAMENT', 
    matchId?: string,
    penaltyId?: string
  } | null>(null);

  const [resultForm, setResultForm] = useState({
    winnerId: '',
    resultType: 'DRAW' as MatchResultType,
    notes: ''
  });

  // --- DOWNLOAD LOGIC ---
  const handleDownloadImage = async (ref: React.RefObject<HTMLDivElement | null>, fileName: string) => {
    if (!ref.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(ref.current, { 
        backgroundColor: '#ffffff',
        style: { transform: 'scale(1)', margin: '0' }
      });
      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to capture image:', err);
      alert('Snapshot engine error. Please try again.');
    }
  };

  // --- CALCULATIONS ---
  const standings = useMemo(() => {
    const stats: Record<string, Team & { playedFor: number; sWin: number; sLoss: number; sDraw: number }> = {};
    tournament.teams.forEach(t => {
      stats[t.id] = { 
        ...t, 
        seriesPlayed: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesDrawn: 0, 
        matchesTie: 0, matchesNR: 0, basePoints: 0, bonusPoints: 0, penaltyPoints: 0, totalPoints: 0, pct: 0,
        playedFor: 0, sWin: 0, sLoss: 0, sDraw: 0
      };
    });

    tournament.matches.filter(m => m.status === 'COMPLETED').forEach(m => {
      const t1 = stats[m.team1Id];
      const t2 = stats[m.team2Id];
      if (!t1 || !t2) return;
      
      t1.matchesPlayed++;
      t2.matchesPlayed++;
      t1.playedFor += tournament.config.pointsForWin;
      t2.playedFor += tournament.config.pointsForWin;

      if (m.resultType === 'T1_WIN') {
        t1.matchesWon++; t1.basePoints += tournament.config.pointsForWin;
        t2.matchesLost++; t2.basePoints += tournament.config.pointsForLoss;
      } else if (m.resultType === 'T2_WIN') {
        t2.matchesWon++; t2.basePoints += tournament.config.pointsForWin;
        t1.matchesLost++; t1.basePoints += tournament.config.pointsForLoss;
      } else if (m.resultType === 'DRAW' || m.resultType === 'TIE') {
        t1.matchesDrawn++; t1.basePoints += tournament.config.pointsForDraw;
        t2.matchesDrawn++; t2.basePoints += tournament.config.pointsForDraw;
      }
    });

    tournament.series?.filter(s => s.status === 'COMPLETED').forEach(s => {
      const t1 = stats[s.team1Id];
      const t2 = stats[s.team2Id];
      if (!t1 || !t2) return;
      t1.seriesPlayed++;
      t2.seriesPlayed++;
      
      const sMs = tournament.matches.filter(m => m.seriesId === s.id && m.status === 'COMPLETED');
      const t1Wins = sMs.filter(m => m.winnerId === s.team1Id).length;
      const t2Wins = sMs.filter(m => m.winnerId === s.team2Id).length;

      if (t1Wins > t2Wins) { t1.sWin++; t2.sLoss++; }
      else if (t2Wins > t1Wins) { t2.sWin++; t1.sLoss++; }
      else if (sMs.length > 0) { t1.sDraw++; t2.sDraw++; }

      if (tournament.config.countSeriesBonus) {
        t1.playedFor += tournament.config.pointsForSeriesWin;
        t2.playedFor += tournament.config.pointsForSeriesWin;
        if (t1Wins > t2Wins) t1.bonusPoints += tournament.config.pointsForSeriesWin;
        else if (t2Wins > t1Wins) t2.bonusPoints += tournament.config.pointsForSeriesWin;
        else if (sMs.length > 0) { t1.bonusPoints += tournament.config.pointsForSeriesDraw; t2.bonusPoints += tournament.config.pointsForSeriesDraw; }
      }
    });

    tournament.penalties.forEach(p => {
      if (stats[p.teamId]) stats[p.teamId].penaltyPoints += Math.abs(p.points);
    });

    return Object.values(stats).map(t => {
      t.totalPoints = (t.basePoints + t.bonusPoints) - t.penaltyPoints;
      t.pct = t.playedFor > 0 ? (t.totalPoints / t.playedFor) * 100 : 0;
      return t;
    }).sort((a, b) => {
      let diff = b.pct - a.pct;
      if (diff === 0) diff = b.totalPoints - a.totalPoints;
      return diff;
    });
  }, [tournament]);

  const roundsData = useMemo(() => {
    if (!tournament.series) return [];
    const rMap: Record<number, SeriesGroup[]> = {};
    tournament.series.forEach(s => {
      if (!rMap[s.round]) rMap[s.round] = [];
      rMap[s.round].push(s);
    });
    return Object.keys(rMap).map(Number).sort((a, b) => a - b).map(rNum => {
      const sInR = rMap[rNum];
      const status = sInR.every(s => s.status === 'COMPLETED') ? 'COMPLETED' :
                     (sInR.some(s => s.status !== 'NOT_STARTED') ? 'IN_PROGRESS' : 'NOT_STARTED');
      const matchCount = sInR.reduce((sum, s) => sum + s.matchIds.length, 0);
      return { num: rNum, series: sInR, status, matchCount };
    });
  }, [tournament.series]);

  // --- ACTIONS ---
  const handleSaveIdentity = () => {
    if (securityInput.trim().toLowerCase() !== tournament.name.trim().toLowerCase()) {
      alert(`Security Check Failed. Please type "${tournament.name}" exactly to save.`);
      return;
    }
    onUpdateTournament?.({ ...tournament, name: tempTournamentName });
    setIsEditingIdentity(false);
    setSecurityInput('');
  };

  const updateTeamIdentity = (teamId: string, updates: Partial<Team>) => {
    if (updates.name) {
      const exists = tournament.teams.find(t => t.id !== teamId && t.name.toLowerCase() === updates.name?.toLowerCase());
      if (exists) {
        alert("A team with this name already exists.");
        return;
      }
    }
    const updatedTeams = tournament.teams.map(t => t.id === teamId ? { ...t, ...updates } : t);
    onUpdateTournament?.({ ...tournament, teams: updatedTeams });
  };

  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      onUpdateTournament?.({
        ...tournament,
        header: { ...tournament.header, tournamentLogoUrl: reader.result as string }
      });
    };
    reader.readAsDataURL(file);
  };

  const generateTestSchedule = () => {
    const teams = tournament.teams.filter(t => t.id !== 'BYE');
    if (teams.length < 2) return alert("Min 2 teams required!");
    const matches: Match[] = [];
    const series: SeriesGroup[] = [];
    const range = (tournament.config.seriesLength || '3-5').split('-').map(Number);
    const minLen = range[0] || 3;
    const maxLen = range[1] || range[0] || 5;
    const teamIds = [...teams.map(t => t.id)];
    if (teamIds.length % 2 !== 0) teamIds.push('BYE');
    const roundsCount = teamIds.length - 1;

    for (let r = 0; r < roundsCount; r++) {
      for (let i = 0; i < teamIds.length / 2; i++) {
        const t1 = teamIds[i];
        const t2 = teamIds[teamIds.length - 1 - i];
        if (t1 !== 'BYE' && t2 !== 'BYE') {
          const sId = `S-R${r+1}-P${i}`;
          const mIds: string[] = [];
          const bestLen = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
          for (let m = 0; m < bestLen; m++) {
            const mId = `M-${sId}-T${m+1}`;
            mIds.push(mId);
            matches.push({
              id: mId, round: r + 1, seriesId: sId, team1Id: t1, team2Id: t2,
              venueId: tournament.stadiums[m % (tournament.stadiums.length || 1)]?.id || 'V1',
              status: 'NOT_STARTED'
            });
          }
          series.push({ id: sId, round: r + 1, team1Id: t1, team2Id: t2, status: 'NOT_STARTED', matchIds: mIds });
        }
      }
      teamIds.splice(1, 0, teamIds.pop()!);
    }
    onUpdateTournament?.({ ...tournament, matches, series, status: 'ONGOING' });
    setScheduleLevel('OVERVIEW');
  };

  const handleRegenerateSchedule = () => {
    if (securityInput.trim().toLowerCase() !== tournament.name.trim().toLowerCase()) return alert("Name mismatch!");
    onUpdateTournament?.({ ...tournament, matches: [], series: [], status: 'UPCOMING' });
    setConfirmingAction(null);
    setSecurityInput('');
    setScheduleLevel('OVERVIEW');
  };

  // --- HELPERS ---
  const getDetailedSeriesStats = (seriesId: string) => {
    const series = tournament.series?.find(s => s.id === seriesId);
    if (!series) return null;
    const ms = tournament.matches.filter(m => m.seriesId === seriesId);
    const completed = ms.filter(m => m.status === 'COMPLETED');
    const team1 = tournament.teams.find(t => t.id === series.team1Id);
    const team2 = tournament.teams.find(t => t.id === series.team2Id);
    
    // Match Counts
    const t1Wins = completed.filter(m => m.winnerId === series.team1Id).length;
    const t2Wins = completed.filter(m => m.winnerId === series.team2Id).length;
    const t1Losses = completed.filter(m => m.winnerId === series.team2Id).length;
    const t2Losses = completed.filter(m => m.winnerId === series.team1Id).length;
    const draws = completed.filter(m => m.resultType === 'DRAW' || m.resultType === 'TIE' || m.resultType === 'NO_RESULT').length;

    // Points from Matches
    const t1MatchPts = (t1Wins * tournament.config.pointsForWin) + (t1Losses * tournament.config.pointsForLoss) + (draws * tournament.config.pointsForDraw);
    const t2MatchPts = (t2Wins * tournament.config.pointsForWin) + (t2Losses * tournament.config.pointsForLoss) + (draws * tournament.config.pointsForDraw);

    // Series outcome bonus
    let t1SeriesPts = 0;
    let t2SeriesPts = 0;
    let winnerName = 'PENDING';
    let sWin1 = 0, sLoss1 = 0, sDraw1 = 0;
    let sWin2 = 0, sLoss2 = 0, sDraw2 = 0;

    if (series.status === 'COMPLETED') {
      if (t1Wins > t2Wins) {
        winnerName = team1?.name || 'T1';
        sWin1 = 1; sLoss2 = 1;
        if (tournament.config.countSeriesBonus) t1SeriesPts = tournament.config.pointsForSeriesWin;
      } else if (t2Wins > t1Wins) {
        winnerName = team2?.name || 'T2';
        sWin2 = 1; sLoss1 = 1;
        if (tournament.config.countSeriesBonus) t2SeriesPts = tournament.config.pointsForSeriesWin;
      } else if (completed.length > 0) {
        winnerName = 'DRAWN';
        sDraw1 = 1; sDraw2 = 1;
        if (tournament.config.countSeriesBonus) {
          t1SeriesPts = tournament.config.pointsForSeriesDraw;
          t2SeriesPts = tournament.config.pointsForSeriesDraw;
        }
      }
    }

    // Get venues (unique)
    const venues = Array.from(new Set(ms.map(m => tournament.stadiums.find(s => s.id === m.venueId)?.name || 'V-UNKNOWN'))).join(', ');

    return { 
      team1, team2, 
      t1Wins, t2Wins, t1Losses, t2Losses, draws, 
      t1MatchPts, t2MatchPts, t1SeriesPts, t2SeriesPts,
      t1Total: t1MatchPts + t1SeriesPts,
      t2Total: t2MatchPts + t2SeriesPts,
      sWin1, sLoss1, sDraw1,
      sWin2, sLoss2, sDraw2,
      winnerName, totalMatches: ms.length, doneMatches: completed.length,
      venues
    };
  };

  const getTeamPointLog = (teamId: string): PointLogEntry[] => {
    const log: PointLogEntry[] = [];
    const tMatches = tournament.matches.filter(m => (m.team1Id === teamId || m.team2Id === teamId) && m.status === 'COMPLETED');
    const tSeries = tournament.series?.filter(s => (s.team1Id === teamId || s.team2Id === teamId) && s.status === 'COMPLETED') || [];

    // Process Matches
    tMatches.forEach((m) => {
      const sMatches = tournament.matches.filter(sm => sm.seriesId === m.seriesId);
      const matchIdx = sMatches.findIndex(sm => sm.id === m.id) + 1;
      
      let how = "DRAW";
      let pts = tournament.config.pointsForDraw;

      if (m.winnerId === teamId) {
        how = "WIN";
        pts = tournament.config.pointsForWin;
      } else if (m.winnerId && m.winnerId !== teamId) {
        how = "LOSE";
        pts = tournament.config.pointsForLoss;
      }

      log.push({
        round: m.round,
        seriesId: m.seriesId,
        type: 'MATCH',
        identifier: `Match ${matchIdx}`,
        how,
        points: pts
      });
    });

    // Process Series Bonus
    if (tournament.config.countSeriesBonus) {
      tSeries.forEach(s => {
        const ms = tournament.matches.filter(m => m.seriesId === s.id && m.status === 'COMPLETED');
        const teamWins = ms.filter(m => m.winnerId === teamId).length;
        const oppWins = ms.filter(m => m.winnerId && m.winnerId !== teamId).length;

        if (teamWins > oppWins) {
          log.push({
            round: s.round,
            seriesId: s.id,
            type: 'SERIES_BONUS',
            identifier: 'Series Win',
            how: 'WIN',
            points: tournament.config.pointsForSeriesWin
          });
        } else if (teamWins === oppWins && ms.length > 0) {
          log.push({
            round: s.round,
            seriesId: s.id,
            type: 'SERIES_BONUS',
            identifier: 'Series Draw',
            how: 'DRAW',
            points: tournament.config.pointsForSeriesDraw
          });
        }
      });
    }

    // Sort by Round then Series
    return log.sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.seriesId.localeCompare(b.seriesId);
    });
  };

  const getProgressColor = (pct: number) => {
    if (pct === 100) return 'bg-emerald-400';
    if (pct > 0) return 'bg-yellow-400';
    return 'bg-gray-200';
  };

  const renderProgress = (completed: number, total: number) => {
    const pct = total > 0 ? (completed / total) * 100 : 0;
    return (
      <div className="w-full h-4 brutalist-border bg-white relative overflow-hidden group">
        <div className={`h-full ${getProgressColor(pct)} transition-all duration-1000`} style={{ width: `${pct}%` }}></div>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black mix-blend-difference text-white">
          {Math.round(pct)}%
        </span>
      </div>
    );
  };

  const getFullScheduleRows = useMemo(() => {
    if (!tournament.series) return [];
    return [...tournament.series].sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.id.localeCompare(b.id);
    }).map((s) => {
      const stats = getDetailedSeriesStats(s.id);
      return {
        roundNo: s.round,
        seriesId: s.id,
        matchCount: s.matchIds.length,
        pairing: `${stats?.team1?.name} vs ${stats?.team2?.name}`,
        venue: stats?.venues || 'N/A',
        status: s.status === 'COMPLETED' ? 'Complete' : s.status === 'IN_PROGRESS' ? 'In Progress' : 'Incomplete'
      };
    });
  }, [tournament.series, tournament.matches]);

  return (
    <div className="space-y-8 pb-32">
      {/* Navigation Header */}
      <BrutalistCard variant="white" className="p-0 overflow-hidden border-4 border-black no-print">
        <div className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white brutalist-border p-2 transform rotate-3">
              <img src={tournament.header.siteLogoUrl} className="max-h-full mx-auto" alt="Logo" />
            </div>
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tighter leading-none">{tournament.name}</h1>
              <p className="mono text-[8px] tracking-widest text-yellow-400 font-bold uppercase mt-1">AUTHORITY CONSOLE ACTIVE</p>
            </div>
          </div>
          <BrutalistButton variant="danger" onClick={onExit} className="px-8">EXIT WORKSPACE</BrutalistButton>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-6 border-t-4 border-black bg-white">
          {['DASHBOARD', 'INFO', 'SCHEDULE', 'RESULTS', 'POINTS', 'SETTINGS'].map((tab) => (
            <button 
              key={tab} 
              onClick={() => { setActiveTab(tab as WorkspaceTab); setScheduleLevel('OVERVIEW'); }} 
              className={`p-4 font-black uppercase text-xs border-r-4 border-black last:border-r-0 transition-all ${activeTab === tab ? 'bg-yellow-400 text-black translate-x-0.5 translate-y-0.5 shadow-none' : 'bg-white text-black hover:bg-gray-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </BrutalistCard>

      <div className="animate-in fade-in duration-500">
        {/* DASHBOARD TAB */}
        {activeTab === 'DASHBOARD' && (
           <div className="space-y-12">
              {/* ROUND PROGRESS BAR */}
              <BrutalistCard title="TOURNAMENT TIMELINE: ROUND PROGRESS" variant="white">
                 <div className="flex gap-2 h-16">
                    {roundsData.length > 0 ? roundsData.map((r) => (
                      <div 
                        key={r.num} 
                        className={`flex-1 brutalist-border flex items-center justify-center mono font-black text-sm relative group cursor-help transition-all transform hover:-translate-y-1
                          ${r.status === 'COMPLETED' ? 'bg-emerald-400' : r.status === 'IN_PROGRESS' ? 'bg-yellow-400' : 'bg-gray-100 text-gray-400'}`}
                      >
                        R{r.num}
                        <div className="absolute bottom-full mb-3 hidden group-hover:block z-50 bg-black text-white p-4 text-[10px] whitespace-nowrap brutalist-border shadow-[4px_4px_0px_white] animate-in slide-in-from-bottom-2">
                           <p className="font-black uppercase mb-1">ROUND {r.num} STATS</p>
                           <p className="opacity-70">SERIES: {r.series.length} | MATCHES: {r.matchCount}</p>
                           <p className="font-black text-yellow-400 mt-1 uppercase">STATUS: {r.status.replace('_', ' ')}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="flex-1 brutalist-border bg-gray-50 flex items-center justify-center mono italic text-gray-300">AWAITING SCHEDULE ENGINE...</div>
                    )}
                 </div>
              </BrutalistCard>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* MATCH ENGINE STATS */}
                <BrutalistCard title="MATCH ENGINE HEALTH" variant="cyan">
                   <div className="space-y-4">
                      <div className="p-4 bg-white brutalist-border flex justify-between items-center shadow-[4px_4px_0px_black]">
                         <span className="font-black uppercase text-xs text-gray-400">Total Matches</span>
                         <span className="text-3xl font-black">{tournament.matches.length}</span>
                      </div>
                      <div className="space-y-2">
                         {[
                           { label: 'Completed', val: tournament.matches.filter(m => m.status === 'COMPLETED').length, color: 'text-emerald-600' },
                           { label: 'In Progress', val: tournament.matches.filter(m => m.status === 'IN_PROGRESS').length, color: 'text-yellow-600' },
                           { label: 'Remaining', val: tournament.matches.filter(m => m.status === 'NOT_STARTED').length, color: 'text-gray-400' }
                         ].map(s => (
                           <div key={s.label} className="flex justify-between items-center px-2 py-1 border-b-2 border-black border-dotted">
                              <span className="font-bold text-[10px] uppercase">{s.label} Matches</span>
                              <span className={`mono font-black ${s.color}`}>{s.val}</span>
                           </div>
                         ))}
                      </div>
                   </div>
                </BrutalistCard>

                {/* SERIES ENGINE STATS */}
                <BrutalistCard title="SERIES STATUS LOG" variant="magenta">
                   <div className="grid grid-cols-2 gap-4 h-full">
                      {[
                        { label: 'TOTAL', val: tournament.series?.length || 0, bg: 'bg-white' },
                        { label: 'CONCLUDED', val: tournament.series?.filter(s => s.status === 'COMPLETED').length || 0, bg: 'bg-emerald-50' },
                        { label: 'ONGOING', val: tournament.series?.filter(s => s.status === 'IN_PROGRESS').length || 0, bg: 'bg-yellow-50' },
                        { label: 'PENDING', val: tournament.series?.filter(s => s.status === 'NOT_STARTED').length || 0, bg: 'bg-white' }
                      ].map(item => (
                        <div key={item.label} className={`brutalist-border ${item.bg} p-4 flex flex-col items-center justify-center shadow-[4px_4px_0px_black] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all`}>
                           <p className="text-3xl font-black">{item.val}</p>
                           <p className="mono text-[8px] uppercase font-bold text-gray-400">{item.label}</p>
                        </div>
                      ))}
                   </div>
                </BrutalistCard>

                {/* QUALIFICATION TRACKER */}
                <BrutalistCard title="QUALIFICATION TRACKER" variant="yellow">
                   <div className="space-y-4">
                      <p className="mono text-[10px] uppercase font-black border-b border-black pb-1">Top 2 Qualifiers (Live PCT):</p>
                      {standings.slice(0, 2).map((t, i) => (
                        <div key={t.id} className="p-4 brutalist-border bg-white flex flex-col shadow-[4px_4px_0px_black] relative overflow-hidden group hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all">
                          <div className="flex justify-between items-center z-10">
                             <span className="font-black text-lg italic uppercase tracking-tighter">#{i+1} {t.name}</span>
                             <span className="bg-black text-white px-2 py-1 mono text-[10px]">{t.pct.toFixed(2)}%</span>
                          </div>
                          <div className="mt-2 z-10">
                             <span className="px-2 py-0.5 bg-emerald-400 text-black brutalist-border text-[8px] font-black uppercase">
                                Qualified for Test Championship Final
                             </span>
                          </div>
                          <div className="absolute right-[-10%] bottom-[-20%] text-6xl opacity-5 font-black italic group-hover:opacity-10 transition-opacity">#{i+1}</div>
                        </div>
                      ))}
                      {standings.length < 2 && <p className="mono text-[10px] text-gray-400 italic">Calculating standings...</p>}
                   </div>
                </BrutalistCard>
              </div>
           </div>
        )}

        {/* INFO TAB */}
        {activeTab === 'INFO' && (
          <div className="space-y-12">
            {/* PANEL 1: TOURNAMENT IDENTITY */}
            <BrutalistCard title="SECTION 1: TOURNAMENT INFORMATION (IDENTITY)" variant="white">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="md:col-span-3 space-y-8">
                    <div className="group relative">
                      <label className="mono text-[10px] font-black uppercase text-gray-400">Tournament Name Field</label>
                      <div className="flex items-center gap-4">
                        {isEditingIdentity ? (
                          <input 
                            value={tempTournamentName} 
                            onChange={e => setTempTournamentName(e.target.value)}
                            className="text-4xl font-black uppercase bg-white brutalist-border p-4 w-full outline-none focus:bg-yellow-50 shadow-[8px_8px_0px_black]"
                          />
                        ) : (
                          <div className="flex items-center gap-4 group/name p-2 transition-all brutalist-border border-transparent hover:border-black hover:bg-yellow-50 hover:shadow-[4px_4px_0px_black]">
                             <h3 className="text-5xl font-black uppercase italic tracking-tighter cursor-default">
                                {tournament.name}
                             </h3>
                             <button onClick={() => setIsEditingIdentity(true)} className="p-2 opacity-0 group-hover/name:opacity-100 transition-opacity">📝</button>
                          </div>
                        )}
                      </div>
                      
                      {isEditingIdentity && (
                        <div className="mt-4 p-6 bg-rose-50 brutalist-border border-rose-600 animate-in slide-in-from-top-4">
                           <div className="flex items-center gap-2 text-rose-600 font-black uppercase text-[10px] mb-4">
                              <span>⚠️ SECURITY OVERRIDE: TYPE EXACT NAME TO COMMIT IDENTITY CHANGE</span>
                           </div>
                           <div className="flex gap-4">
                              <input 
                                placeholder="VERIFY CURRENT NAME"
                                value={securityInput}
                                onChange={e => setSecurityInput(e.target.value)}
                                className="flex-1 brutalist-border p-3 font-black uppercase mono text-sm outline-none"
                              />
                              <BrutalistButton variant="success" onClick={handleSaveIdentity}>SAVE NAME</BrutalistButton>
                              <BrutalistButton variant="secondary" onClick={() => { setIsEditingIdentity(false); setTempTournamentName(tournament.name); setSecurityInput(''); }}>CANCEL</BrutalistButton>
                           </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                       <div className="p-4 brutalist-border bg-gray-50 flex justify-between items-center group relative cursor-help">
                          <div>
                            <p className="mono text-[8px] font-black uppercase text-gray-400">Tournament Format</p>
                            <p className="font-black text-xl">TEST MATCH</p>
                          </div>
                          <span className="text-xl" title="Format locked after scheduling">🔒</span>
                       </div>
                       <div className="p-4 brutalist-border bg-gray-50 flex justify-between items-center group">
                          <div>
                            <p className="mono text-[8px] font-black uppercase text-gray-400">Total Teams</p>
                            <p className="font-black text-2xl mono">{tournament.teams.length}</p>
                          </div>
                          <span className="text-xl grayscale group-hover:grayscale-0 transition-all">🔒</span>
                       </div>
                    </div>
                  </div>

                  {/* LOGO CARD */}
                  <div className="flex flex-col items-center gap-4">
                     <div className="w-full aspect-square brutalist-border bg-white flex items-center justify-center p-4 shadow-[8px_8px_0px_black] group relative overflow-hidden transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[12px_12px_0px_black]">
                        {tournament.header.tournamentLogoUrl ? (
                          <img src={tournament.header.tournamentLogoUrl} className="max-h-full object-contain" alt="Tournament Logo" />
                        ) : (
                          <span className="font-black text-gray-200 text-6xl">?</span>
                        )}
                        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity p-4 text-center">
                           <p className="text-white font-black text-[10px] uppercase mb-4">Replace Tournament Logo</p>
                           <input type="file" id="logo-swap-master" className="hidden" accept="image/*" onChange={e => handleLogoUpload(e.target.files?.[0] || null)} />
                           <label htmlFor="logo-swap-master" className="bg-yellow-400 text-black px-4 py-2 brutalist-border font-black text-[10px] cursor-pointer hover:bg-white mb-4">UPLOAD FILE</label>
                           <input 
                             placeholder="PASTE URL" 
                             className="w-full text-[8px] p-2 brutalist-border bg-white font-black outline-none"
                             onBlur={e => e.target.value && onUpdateTournament?.({...tournament, header: {...tournament.header, tournamentLogoUrl: e.target.value}})}
                           />
                        </div>
                     </div>
                  </div>
               </div>
            </BrutalistCard>

            {/* SECTION 2: TEAM PARTICIPATION LOG */}
            <BrutalistCard title="SECTION 2: TEAM PARTICIPATION LOG" variant="white">
               <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse border-4 border-black">
                     <thead className="bg-black text-white uppercase text-[10px] font-black">
                        <tr>
                           <th className="p-4 border-r border-white/20 w-16 text-center">LOGO</th>
                           <th className="p-4 border-r border-white/20">TEAM NAME</th>
                           <th className="p-4 border-r border-white/20">OWNER</th>
                           <th className="p-4 border-r border-white/20 text-center w-24">SERIES (T/C)</th>
                           <th className="p-4 border-r border-white/20 text-center w-24">MATCHES (T/C)</th>
                           <th className="p-4 border-r border-white/20">PROGRESS</th>
                           <th className="p-4 text-center w-24">ACTION</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y-4 divide-black">
                        {tournament.teams.map((t) => {
                          const tSeries = tournament.series?.filter(s => s.team1Id === t.id || s.team2Id === t.id) || [];
                          const doneSeries = tSeries.filter(s => s.status === 'COMPLETED').length;
                          const tMatches = tournament.matches.filter(m => m.team1Id === t.id || m.team2Id === t.id);
                          const doneMatches = tMatches.filter(m => m.status === 'COMPLETED').length;

                          return (
                            <React.Fragment key={t.id}>
                              <tr className="hover:bg-yellow-50 font-black uppercase text-xs transition-colors group">
                                 <td className="p-2 border-r-4 border-black text-center">
                                    <div className="relative group/logo w-12 h-12 mx-auto transition-transform hover:scale-110">
                                       <img src={t.logoUrl || ''} className="w-full h-full brutalist-border bg-white p-1" alt="T" />
                                       <input 
                                          type="file" 
                                          id={`logo-${t.id}`} 
                                          className="hidden" 
                                          onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              const reader = new FileReader();
                                              reader.onloadend = () => updateTeamIdentity(t.id, { logoUrl: reader.result as string });
                                              reader.readAsDataURL(file);
                                            }
                                          }}
                                       />
                                       <label htmlFor={`logo-${t.id}`} className="absolute inset-0 bg-black/80 text-white text-[6px] flex items-center justify-center opacity-0 group-hover/logo:opacity-100 cursor-pointer">CHANGE</label>
                                    </div>
                                 </td>
                                 <td className="p-4 border-r-4 border-black">
                                    <input 
                                       value={t.name} 
                                       onChange={e => updateTeamIdentity(t.id, { name: e.target.value })}
                                       className="bg-transparent border-none outline-none font-black text-sm uppercase focus:bg-white px-2 py-1 w-full transition-all border-b-2 border-transparent hover:border-black"
                                    />
                                 </td>
                                 <td className="p-4 border-r-4 border-black">
                                    <input 
                                       value={t.owner || ''} 
                                       placeholder="ADD OWNER"
                                       onChange={e => updateTeamIdentity(t.id, { owner: e.target.value })}
                                       className="bg-transparent border-none outline-none font-black text-[10px] uppercase focus:bg-white px-2 py-1 w-full italic transition-all border-b-2 border-transparent hover:border-black"
                                    />
                                 </td>
                                 <td className="p-4 border-r-4 border-black text-center mono font-bold bg-gray-50 text-lg">
                                    {tSeries.length}<span className="text-gray-400 mx-1">/</span><span className="text-emerald-600">{doneSeries}</span>
                                 </td>
                                 <td className="p-4 border-r-4 border-black text-center mono font-bold bg-gray-50 text-lg">
                                    {tMatches.length}<span className="text-gray-400 mx-1">/</span><span className="text-emerald-600">{doneMatches}</span>
                                 </td>
                                 <td className="p-4 border-r-4 border-black min-w-[150px]">
                                    {renderProgress(doneMatches, tMatches.length)}
                                 </td>
                                 <td className="p-4 text-center">
                                    <button 
                                      onClick={() => setExpandedTeamId(expandedTeamId === t.id ? null : t.id)}
                                      className={`p-2 brutalist-border font-black text-[10px] transition-all w-full shadow-[2px_2px_0px_black] active:shadow-none active:translate-x-0.5 active:translate-y-0.5 ${expandedTeamId === t.id ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}
                                    >
                                      {expandedTeamId === t.id ? 'CLOSE' : 'EXPAND'}
                                    </button>
                                 </td>
                              </tr>
                              {expandedTeamId === t.id && (
                                <tr className="bg-gray-50 animate-in slide-in-from-top-4">
                                   <td colSpan={7} className="p-8 border-b-8 border-black">
                                      <div className="bg-white brutalist-border p-6 shadow-[8px_8px_0px_black]">
                                         <h4 className="font-black uppercase text-sm mb-6 italic underline decoration-4 decoration-yellow-400">Authority Breakdown: Series Log</h4>
                                         <table className="w-full text-left text-[10px] uppercase font-black">
                                            <thead className="border-b-4 border-black">
                                               <tr>
                                                  <th className="pb-2">SERIES ID</th>
                                                  <th className="pb-2">VS TEAM</th>
                                                  <th className="pb-2 text-center">MATCHES</th>
                                                  <th className="pb-2 text-center">DONE</th>
                                                  <th className="pb-2 text-right">STATUS</th>
                                               </tr>
                                            </thead>
                                            <tbody className="divide-y-2 divide-gray-100">
                                               {tSeries.map((s, idx) => {
                                                  const stats = getDetailedSeriesStats(s.id)!;
                                                  const vsTeam = s.team1Id === t.id ? stats.team2 : stats.team1;
                                                  return (
                                                     <tr key={s.id} className="hover:bg-gray-50 transition-colors group/row">
                                                        <td className="py-3 mono font-black">#{idx + 1} ({s.id})</td>
                                                        <td className="py-3 font-black">{vsTeam?.name || 'BYE'}</td>
                                                        <td className="py-3 text-center mono">{stats.totalMatches}</td>
                                                        <td className="py-3 text-center mono">{stats.doneMatches}</td>
                                                        <td className="py-3 text-right">
                                                           <span className={`px-2 py-0.5 brutalist-border border-2 text-[8px] ${s.status === 'COMPLETED' ? 'bg-emerald-400' : s.status === 'IN_PROGRESS' ? 'bg-yellow-400' : 'bg-white'}`}>
                                                              {s.status.replace('_', ' ')}
                                                           </span>
                                                        </td>
                                                     </tr>
                                                  );
                                               })}
                                            </tbody>
                                         </table>
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
            </BrutalistCard>
          </div>
        )}

        {/* SCHEDULE TAB */}
        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
            <div className="bg-black p-4 brutalist-border text-white flex flex-wrap justify-between items-center gap-4 no-print shadow-[6px_6px_0px_black]">
                <div className="flex gap-6 items-center">
                  <div className="flex gap-4 font-black text-[12px] uppercase">
                     <button onClick={() => setScheduleLevel('OVERVIEW')} className={scheduleLevel === 'OVERVIEW' ? 'text-yellow-400 underline underline-offset-4 decoration-2' : 'hover:text-yellow-200 transition-colors'}>1. OVERVIEW</button>
                     <span className="text-gray-600">/</span>
                     <button onClick={() => setScheduleLevel('ROUNDS')} className={scheduleLevel === 'ROUNDS' ? 'text-yellow-400 underline underline-offset-4 decoration-2' : 'hover:text-yellow-200 transition-colors'}>2. ROUNDS</button>
                     <span className="text-gray-600">/</span>
                     <button onClick={() => setScheduleLevel('FULL_SCHEDULE')} className={scheduleLevel === 'FULL_SCHEDULE' ? 'text-yellow-400 underline underline-offset-4 decoration-2' : 'hover:text-yellow-200 transition-colors'}>3. FULL SCHEDULE</button>
                  </div>
                </div>
                <div className="flex gap-3">
                  {!tournament.matches || tournament.matches.length === 0 ? (
                    <BrutalistButton variant="success" compact onClick={generateTestSchedule}>Generate Schedule</BrutalistButton>
                  ) : (
                    <BrutalistButton variant="danger" compact onClick={() => setConfirmingAction({ type: 'REGENERATE_SCHEDULE' })}>Regenerate Schedule</BrutalistButton>
                  )}
                </div>
            </div>

            {scheduleLevel === 'OVERVIEW' && (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <BrutalistCard title="MATCH DISTRIBUTION SUMMARY" variant="white">
                     <table className="w-full text-left border-collapse brutalist-border">
                        <thead className="bg-gray-100 text-[10px] uppercase font-black">
                           <tr><th className="p-3 border border-black">Team Name</th><th className="p-3 border border-black text-center w-24">Series</th><th className="p-3 border border-black text-center w-24">Matches</th></tr>
                        </thead>
                        <tbody className="text-[12px] font-bold uppercase">
                           {tournament.teams.map(t => (
                              <tr key={t.id} className="hover:bg-yellow-50 bg-white">
                                 <td className="p-3 border border-black">{t.name}</td>
                                 <td className="p-3 border border-black text-center mono font-black italic">{tournament.series?.filter(s => s.team1Id === t.id || s.team2Id === t.id).length || 0}</td>
                                 <td className="p-3 border border-black text-center mono font-black italic">{tournament.matches.filter(m => m.team1Id === t.id || m.team2Id === t.id).length}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </BrutalistCard>
                  <BrutalistCard title="HEAD-TO-HEAD SERIES MATRIX" variant="white">
                     <div className="overflow-x-auto brutalist-border">
                        <table className="w-full text-left text-[10px]">
                           <thead className="bg-black text-white uppercase">
                              <tr><th className="p-2 border border-white/20 bg-gray-900">PAIRING</th>{tournament.teams.map(t => <th key={t.id} className="p-2 border border-white/20 text-center font-black">{t.name.substring(0,4)}</th>)}</tr>
                           </thead>
                           <tbody>
                              {tournament.teams.map(rowTeam => (
                                 <tr key={rowTeam.id}>
                                    <td className="p-2 border-r border-black font-black bg-gray-100 uppercase italic">{rowTeam.name}</td>
                                    {tournament.teams.map(colTeam => {
                                       const matches = tournament.matches.filter(m => (m.team1Id === rowTeam.id && m.team2Id === colTeam.id) || (m.team1Id === colTeam.id && m.team2Id === rowTeam.id)).length;
                                       return (
                                          <td key={colTeam.id} className={`p-2 border border-black text-center font-black text-sm ${rowTeam.id === colTeam.id ? 'bg-gray-300 text-gray-400' : (matches > 0 ? 'bg-white hover:bg-yellow-100' : 'bg-gray-50 text-gray-300')}`}>{rowTeam.id === colTeam.id ? '--' : (matches || '0')}</td>
                                       );
                                    })}
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </BrutalistCard>
               </div>
            )}

            {scheduleLevel === 'ROUNDS' && (
              <div className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden">
                 <table className="w-full text-left">
                    <thead className="bg-gray-100 font-black uppercase text-[12px] border-b-4 border-black">
                       <tr><th className="p-5 border-r-2 border-black w-32">Round #</th><th className="p-5 border-r-2 border-black">Status</th><th className="p-5 border-r-2 border-black">Breakdown</th><th className="p-5 text-center">Action</th></tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                       {roundsData.map(r => (
                          <tr key={r.num} className="hover:bg-yellow-50 font-black uppercase text-sm transition-colors">
                             <td className="p-5 border-r-2 border-black mono italic text-2xl bg-gray-50">R-{r.num}</td>
                             <td className="p-5 border-r-2 border-black">
                                <span className={`px-3 py-1 brutalist-border text-[10px] ${r.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : r.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-50 text-gray-400'}`}>{r.status.replace('_', ' ')}</span>
                             </td>
                             <td className="p-5 border-r-2 border-black mono text-[12px] italic text-gray-500">{r.series.filter(s=>s.status==='COMPLETED').length}/{r.series.length} SERIES DONE</td>
                             <td className="p-5 text-center">
                                <BrutalistButton variant="primary" compact onClick={() => { setDrillDownRound(r.num); setScheduleLevel('SERIES'); }}>Open Log</BrutalistButton>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
            )}

            {scheduleLevel === 'FULL_SCHEDULE' && (
              <div className="bg-white brutalist-border shadow-[15px_15px_0px_black] overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-black text-white font-black uppercase text-[11px] border-b-4 border-black">
                    <tr>
                      <th className="p-4 border-r border-white/20 text-center">ROUND NO</th>
                      <th className="p-4 border-r border-white/20">Series No (ID)</th>
                      <th className="p-4 border-r border-white/20 text-center">No of Match</th>
                      <th className="p-4 border-r border-white/20">Series Pairing</th>
                      <th className="p-4 border-r border-white/20">Venue</th>
                      <th className="p-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-4 divide-black font-black uppercase text-xs">
                    {getFullScheduleRows.length > 0 ? getFullScheduleRows.map((row) => (
                      <tr key={row.seriesId} className="hover:bg-yellow-50 transition-colors">
                        <td className="p-4 border-r-4 border-black text-center mono bg-gray-50">{row.roundNo}</td>
                        <td className="p-4 border-r-4 border-black mono">{row.seriesId}</td>
                        <td className="p-4 border-r-4 border-black text-center mono">{row.matchCount}</td>
                        <td className="p-4 border-r-4 border-black italic">{row.pairing}</td>
                        <td className="p-4 border-r-4 border-black text-[10px] opacity-70 truncate max-w-[200px]">{row.venue}</td>
                        <td className="p-4 text-right">
                          <span className={`px-2 py-0.5 brutalist-border border-2 text-[9px] ${
                            row.status === 'Complete' ? 'bg-emerald-400' : 
                            row.status === 'In Progress' ? 'bg-yellow-400' : 
                            'bg-gray-200'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="p-20 text-center text-gray-400 italic">No schedule data available. Please generate the schedule first.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {scheduleLevel === 'SERIES' && (
               <div className="space-y-6">
                  <div className="flex justify-between items-center no-print">
                    <BrutalistButton variant="secondary" compact onClick={() => setScheduleLevel('ROUNDS')}>← Back to Rounds</BrutalistButton>
                    <BrutalistButton variant="lime" compact onClick={() => handleDownloadImage(roundScheduleRef, `${tournament.name}_Round_${drillDownRound}`)}>Download Round PNG</BrutalistButton>
                  </div>
                  <div ref={roundScheduleRef} className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden">
                     <table className="w-full text-left">
                        <thead className="bg-black text-white font-black uppercase text-[10px] border-b-4 border-black">
                           <tr>
                              <th className="p-4 border-r border-white/20">Series Pairing</th>
                              <th className="p-4 border-r border-white/20">Performance Breakdown (W-L-D)</th>
                              <th className="p-4 border-r border-white/20 text-center">Winner</th>
                              <th className="p-4 border-r border-white/20 text-center">Points (Pts + Bonus)</th>
                              <th className="p-4 text-center">Action</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-black">
                           {tournament.series!.filter(s => s.round === drillDownRound).map(s => {
                              const stats = getDetailedSeriesStats(s.id)!;
                              return (
                                 <tr key={s.id} className="hover:bg-blue-50 font-black uppercase text-xs transition-colors">
                                    <td className="p-4 border-r-2 border-black bg-gray-50">
                                       <div className="font-black text-sm">{stats.team1?.name} vs {stats.team2?.name}</div>
                                       <div className="mono text-[8px] text-gray-400 mt-1">SERIES ID: {s.id}</div>
                                    </td>
                                    <td className="p-4 border-r-2 border-black">
                                       <div className="grid grid-cols-2 gap-4">
                                          <div>
                                             <p className="text-[8px] text-gray-400">{stats.team1?.name}</p>
                                             <p className="mono font-black">{stats.t1Wins}-{stats.t1Losses}-{stats.draws} <span className="opacity-40 italic">({stats.sWin1}-{stats.sLoss1}-{stats.sDraw1})</span></p>
                                          </div>
                                          <div>
                                             <p className="text-[8px] text-gray-400">{stats.team2?.name}</p>
                                             <p className="mono font-black">{stats.t2Wins}-{stats.t2Losses}-{stats.draws} <span className="opacity-40 italic">({stats.sWin2}-{stats.sLoss2}-{stats.sDraw2})</span></p>
                                          </div>
                                       </div>
                                    </td>
                                    <td className={`p-4 border-r-2 border-black text-center font-black ${stats.winnerName === 'DRAWN' ? 'text-sky-600' : 'text-emerald-600'}`}>
                                       {stats.winnerName}
                                    </td>
                                    <td className="p-4 border-r-2 border-black text-center mono">
                                       <div className="flex flex-col gap-1">
                                          <div className="flex justify-between px-2 bg-white brutalist-border border-[1px]">
                                             <span className="text-[8px]">{stats.team1?.name}:</span>
                                             <span className="font-black">{stats.t1Total} <span className="text-[7px] opacity-40">({stats.t1MatchPts}+{stats.t1SeriesPts})</span></span>
                                          </div>
                                          <div className="flex justify-between px-2 bg-white brutalist-border border-[1px]">
                                             <span className="text-[8px]">{stats.team2?.name}:</span>
                                             <span className="font-black">{stats.t2Total} <span className="text-[7px] opacity-40">({stats.t2MatchPts}+{stats.t2SeriesPts})</span></span>
                                          </div>
                                       </div>
                                    </td>
                                    <td className="p-4 text-center">
                                       <BrutalistButton variant="magenta" compact onClick={() => { setDrillDownSeries(s.id); setScheduleLevel('MATCHES'); }}>Matches</BrutalistButton>
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}

            {scheduleLevel === 'MATCHES' && (
              <div className="space-y-6">
                <BrutalistButton variant="secondary" compact onClick={() => setScheduleLevel('SERIES')}>← Back to Series</BrutalistButton>
                <div className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 font-black uppercase text-[10px] border-b-4 border-black">
                      <tr>
                        <th className="p-5 border-r-2 border-black w-24">Entry #</th>
                        <th className="p-5 border-r-2 border-black">Outcome / Result</th>
                        <th className="p-5 border-r-2 border-black text-center">Match Points</th>
                        <th className="p-5 border-r-2 border-black text-center">Status</th>
                        <th className="p-5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                      {tournament.matches.filter(m => m.seriesId === drillDownSeries).map((m, idx) => {
                          const t1 = tournament.teams.find(t => t.id === m.team1Id);
                          const t2 = tournament.teams.find(t => t.id === m.team2Id);
                          const winner = tournament.teams.find(t => t.id === m.winnerId);
                          
                          let t1Pts = 0, t2Pts = 0;
                          if (m.status === 'COMPLETED') {
                             if (m.resultType === 'T1_WIN') { t1Pts = tournament.config.pointsForWin; t2Pts = tournament.config.pointsForLoss; }
                             else if (m.resultType === 'T2_WIN') { t2Pts = tournament.config.pointsForWin; t1Pts = tournament.config.pointsForLoss; }
                             else { t1Pts = tournament.config.pointsForDraw; t2Pts = tournament.config.pointsForDraw; }
                          }

                          return (
                            <tr key={m.id} className="hover:bg-emerald-50 font-black uppercase text-xs transition-colors">
                              <td className="p-5 border-r-2 border-black mono italic bg-gray-50">DAY_{idx+1}</td>
                              <td className="p-5 border-r-2 border-black">
                                 {m.status === 'COMPLETED' ? (
                                    <div className="flex flex-col">
                                       <span className="font-black text-sm">{m.resultType === 'DRAW' ? 'DRAWN' : (winner?.name + ' WON')}</span>
                                       <span className="mono text-[8px] opacity-40">{t1?.name} vs {t2?.name}</span>
                                    </div>
                                 ) : <span className="italic text-gray-300">AWAITING COMMITTAL...</span>}
                              </td>
                              <td className="p-5 border-r-2 border-black text-center mono">
                                 {m.status === 'COMPLETED' ? (
                                    <div className="flex gap-2 justify-center">
                                       <div className="px-2 py-0.5 brutalist-border border-[1px] bg-white text-[8px]">
                                          {t1?.name.substring(0,3)}: <span className="font-black">{t1Pts}</span>
                                       </div>
                                       <div className="px-2 py-0.5 brutalist-border border-[1px] bg-white text-[8px]">
                                          {t2?.name.substring(0,3)}: <span className="font-black">{t2Pts}</span>
                                       </div>
                                    </div>
                                 ) : '--'}
                              </td>
                              <td className="p-5 border-r-2 border-black text-center">
                                 <span className={`px-4 py-1 brutalist-border text-[9px] ${m.status==='COMPLETED'?'bg-emerald-400':'bg-white'}`}>
                                    {m.status}
                                 </span>
                              </td>
                              <td className="p-5 text-center">
                                {m.status === 'COMPLETED' ? (
                                  <BrutalistButton variant="danger" compact onClick={() => setConfirmingAction({ type: 'ADMIN_UNLOCK', matchId: m.id })}>Unlock</BrutalistButton>
                                ) : (
                                  <BrutalistButton variant="success" compact onClick={() => { setConfirmingAction({ type: 'SAVE_RESULT', matchId: m.id }); setResultForm({ winnerId: '', resultType: 'T1_WIN', notes: '' }); }}>Commit</BrutalistButton>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RESULTS TAB */}
        {activeTab === 'RESULTS' && (
           <div className="space-y-8">
              <div className="bg-black p-8 brutalist-border text-white shadow-[10px_10px_0px_#f472b6]">
                 <h2 className="text-5xl font-black uppercase italic tracking-tighter">Results Archive</h2>
                 <p className="mono text-[10px] text-pink-400 mt-2 font-black uppercase">Official Point Allocation Logs & History</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div className="lg:col-span-2 space-y-6">
                    <BrutalistCard title="RECENT MATCH OUTCOMES" variant="white">
                       <div className="space-y-4">
                          {tournament.matches.filter(m => m.status === 'COMPLETED').slice().reverse().map(m => {
                            const t1 = tournament.teams.find(t => t.id === m.team1Id);
                            const t2 = tournament.teams.find(t => t.id === m.team2Id);
                            const winner = tournament.teams.find(t => t.id === m.winnerId);
                            return (
                              <div key={m.id} className="p-4 brutalist-border bg-white flex justify-between items-center group">
                                 <div className="flex items-center gap-4">
                                    <span className="mono text-[10px] bg-black text-white px-2 py-1">R{m.round}</span>
                                    <span className="font-black text-sm">{t1?.name} vs {t2?.name}</span>
                                 </div>
                                 <span className={`font-black text-[10px] px-3 py-1 brutalist-border ${m.resultType === 'DRAW' ? 'bg-sky-100 text-sky-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                    {m.resultType === 'DRAW' ? 'DRAWN' : winner?.name + ' WON'}
                                 </span>
                              </div>
                            );
                          })}
                       </div>
                    </BrutalistCard>
                 </div>
                 <BrutalistCard title="SERIES AUTHORITY LOG" variant="magenta">
                    <div className="space-y-4">
                       {tournament.series?.filter(s => s.status === 'COMPLETED').map(s => {
                         const stats = getDetailedSeriesStats(s.id)!;
                         return (
                           <div key={s.id} className="p-4 bg-white brutalist-border shadow-[4px_4px_0px_black]">
                              <div className="font-black uppercase text-xs mb-1">{stats.team1?.name} vs {stats.team2?.name}</div>
                              <div className="flex justify-between items-center text-[10px] font-black uppercase text-emerald-600">
                                 <span>WINNER: {stats.winnerName}</span>
                              </div>
                           </div>
                         );
                       })}
                    </div>
                 </BrutalistCard>
              </div>
           </div>
        )}

        {/* POINTS TAB */}
        {activeTab === 'POINTS' && (
           <div className="space-y-8">
              <div className="bg-black p-8 brutalist-border text-white flex justify-between items-center shadow-[10px_10px_0px_#fbbf24]">
                <div><h2 className="text-5xl font-black uppercase italic tracking-tighter">WTC Standings</h2><p className="mono text-[10px] text-yellow-400 mt-2 font-black uppercase">Authority Logic Active</p></div>
                <div className="flex gap-4">
                   <BrutalistButton variant="magenta" onClick={() => handleDownloadImage(pointsTableRef, `${tournament.name}_Standings`)}>Download PNG</BrutalistButton>
                   <BrutalistButton variant="cyan" onClick={() => window.print()}>Export Log</BrutalistButton>
                </div>
              </div>
              <div ref={pointsTableRef} className="bg-white brutalist-border shadow-[15px_15px_0px_black] overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-100 font-black uppercase text-[10px] border-b-4 border-black">
                    <tr>
                      <th className="p-4 border-r-2 border-black w-16 text-center">RANK</th>
                      <th className="p-4 border-r-2 border-black">TEAM</th>
                      <th className="p-4 border-r-2 border-black text-center w-16">MP</th>
                      <th className="p-4 border-r-2 border-black text-center w-16">W</th>
                      <th className="p-4 border-r-2 border-black text-center w-16">L</th>
                      <th className="p-4 border-r-2 border-black text-center w-16">D</th>
                      <th className="p-4 border-r-2 border-black text-center bg-blue-50 w-24">PTS</th>
                      <th className="p-4 border-r-2 border-black text-center font-black bg-yellow-400 w-32 text-lg">PCT %</th>
                      <th className="p-4 text-center w-24 no-print">LOG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-black">
                    {standings.map((t, idx) => (
                      <tr key={t.id} className={`hover:bg-yellow-50 font-black uppercase text-sm transition-all ${idx < 2 ? 'bg-emerald-50' : ''}`}>
                        <td className="p-4 border-r-2 border-black mono text-center bg-gray-50 text-2xl">#{idx + 1}</td>
                        <td className="p-4 border-r-2 border-black font-black">
                           <button 
                             onClick={() => setSelectedLogTeamId(t.id)}
                             className="flex items-center gap-4 hover:bg-black hover:text-white p-2 transition-all w-full text-left"
                           >
                             {t.logoUrl && <img src={t.logoUrl} className="w-8 h-8 brutalist-border bg-white" alt="L" />}
                             <span className="text-xl italic">{t.name}</span>
                           </button>
                        </td>
                        <td className="p-4 border-r-2 border-black mono text-center">{t.matchesPlayed}</td>
                        <td className="p-4 border-r-2 border-black mono text-center text-emerald-600">{t.matchesWon}</td>
                        <td className="p-4 border-r-2 border-black mono text-center text-rose-600">{t.matchesLost}</td>
                        <td className="p-4 border-r-2 border-black mono text-center text-sky-600">{t.matchesDrawn}</td>
                        <td className="p-4 border-r-2 border-black mono text-center font-black bg-blue-50/50 text-2xl">{t.totalPoints + t.penaltyPoints}</td>
                        <td className="p-4 border-r-2 border-black mono text-center font-black bg-yellow-400/20 text-3xl italic tracking-tighter">{t.pct.toFixed(2)}%</td>
                        <td className="p-4 text-center no-print">
                          <BrutalistButton 
                            variant="secondary" 
                            compact 
                            onClick={() => setSelectedLogTeamId(t.id)}
                            className="bg-white hover:bg-black hover:text-white"
                          >
                            VIEW
                          </BrutalistButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'SETTINGS' && (
           <div className="p-32 text-center brutalist-border bg-white shadow-[8px_8px_0px_black]">
              <h2 className="text-4xl font-black uppercase italic tracking-tighter">Authority Module Active</h2>
              <p className="mono text-xs text-gray-400 mt-2 uppercase">Accessing Configuration Data Engine...</p>
           </div>
        )}
      </div>

      {/* MODALS */}
      {selectedLogTeamId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 no-print animate-in fade-in duration-200">
           <BrutalistCard 
             title={`POINT LOG: ${tournament.teams.find(t => t.id === selectedLogTeamId)?.name}`} 
             className="max-w-2xl w-full bg-white max-h-[80vh] flex flex-col"
           >
             <div className="overflow-y-auto flex-1">
                <table className="w-full text-left border-collapse">
                   <thead className="bg-black text-white font-black uppercase text-[10px] sticky top-0">
                      <tr>
                         <th className="p-3 border-r border-white/20 text-center">ROUND</th>
                         <th className="p-3 border-r border-white/20">SERIES</th>
                         <th className="p-3 border-r border-white/20">ITEM / HOW</th>
                         <th className="p-3 text-right">POINTS Earned</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y-2 divide-black font-black uppercase text-xs">
                      {getTeamPointLog(selectedLogTeamId).length > 0 ? getTeamPointLog(selectedLogTeamId).map((entry, idx) => (
                        <tr key={idx} className="hover:bg-yellow-50">
                           <td className="p-3 border-r-2 border-black text-center mono">{entry.round}</td>
                           <td className="p-3 border-r-2 border-black mono">{entry.seriesId}</td>
                           <td className="p-3 border-r-2 border-black">
                              <div className="flex flex-col">
                                 <span className="text-[10px]">{entry.identifier}</span>
                                 <span className={`text-[8px] ${entry.how === 'WIN' ? 'text-emerald-600' : entry.how === 'LOSE' ? 'text-rose-600' : 'text-sky-600'}`}>{entry.how}</span>
                              </div>
                           </td>
                           <td className="p-3 text-right mono font-black text-sm">
                              {entry.points > 0 ? `+${entry.points}` : entry.points}
                           </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={4} className="p-20 text-center text-gray-400 italic">No points allocated yet. Complete matches to see logs.</td></tr>
                      )}
                   </tbody>
                   {getTeamPointLog(selectedLogTeamId).length > 0 && (
                     <tfoot className="bg-gray-100 border-t-4 border-black sticky bottom-0 font-black">
                        <tr>
                           <td colSpan={3} className="p-3 text-right text-sm">TOTAL ACCUMULATED:</td>
                           <td className="p-3 text-right text-lg underline decoration-double">
                              {getTeamPointLog(selectedLogTeamId).reduce((sum, e) => sum + e.points, 0)}
                           </td>
                        </tr>
                     </tfoot>
                   )}
                </table>
             </div>
             <div className="mt-6">
                <BrutalistButton variant="primary" className="w-full py-4" onClick={() => setSelectedLogTeamId(null)}>CLOSE LOG</BrutalistButton>
             </div>
           </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'REGENERATE_SCHEDULE' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 no-print animate-in zoom-in-95 duration-200">
          <BrutalistCard title="⚠️ WARNING: AUTHORITY OVERRIDE" className="max-w-md w-full bg-white">
            <div className="space-y-6">
              <p className="font-black uppercase text-sm text-rose-600 text-center">THIS WIPES ALL MATCHES AND RESULTS. Enter tournament name to confirm reset.</p>
              <input placeholder="ENTER FULL NAME" className="w-full brutalist-border p-4 font-black uppercase bg-white text-black text-center text-xl outline-none border-rose-600" value={securityInput} onChange={e => setSecurityInput(e.target.value)} />
              <div className="flex gap-2">
                <BrutalistButton variant="danger" className="flex-1 py-4 text-xl" onClick={handleRegenerateSchedule}>RESET ENGINE</BrutalistButton>
                <BrutalistButton variant="secondary" className="flex-1 py-4 text-xl" onClick={() => { setConfirmingAction(null); setSecurityInput(''); }}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 no-print animate-in fade-in duration-200">
          <BrutalistCard title="COMMIT MATCH RESULT" className="max-w-md w-full bg-white">
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id, name: tournament.teams.find(t => t.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id)?.name },
                  { id: tournament.matches.find(m => m.id === confirmingAction.matchId)?.team2Id, name: tournament.teams.find(t => t.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team2Id)?.name }
                ].map(team => (
                  <button 
                    key={team.id} 
                    onClick={() => setResultForm({...resultForm, winnerId: team.id!, resultType: team.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id ? 'T1_WIN' : 'T2_WIN'})}
                    className={`p-5 brutalist-border font-black uppercase text-lg transition-all ${resultForm.winnerId === team.id ? 'bg-black text-white translate-x-1 translate-y-1' : 'bg-white text-black hover:bg-gray-100'}`}
                  >
                    {team.name} WIN
                  </button>
                ))}
                <button onClick={() => setResultForm({...resultForm, winnerId: '', resultType: 'DRAW'})} className={`p-5 brutalist-border font-black uppercase text-lg transition-all ${resultForm.resultType === 'DRAW' ? 'bg-black text-white translate-x-1 translate-y-1' : 'bg-white text-black hover:bg-gray-100'}`}>DRAW 🤝</button>
              </div>
              <BrutalistButton variant="success" className="w-full py-4 text-xl" onClick={() => {
                   const updatedMatches = tournament.matches.map(m => m.id === confirmingAction.matchId ? { ...m, status: 'COMPLETED' as const, resultType: resultForm.resultType, winnerId: resultForm.winnerId } : m);
                   const updatedSeries = tournament.series?.map(s => {
                    const sMs = updatedMatches.filter(m => m.seriesId === s.id);
                    return { ...s, status: sMs.every(m => m.status === 'COMPLETED') ? 'COMPLETED' : (sMs.some(m => m.status === 'COMPLETED') ? 'IN_PROGRESS' : 'NOT_STARTED') } as SeriesGroup;
                  });
                  onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries, status: 'ONGOING' });
                  setConfirmingAction(null);
                }}>COMMIT RESULT</BrutalistButton>
            </div>
          </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'ADMIN_UNLOCK' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 no-print animate-in fade-in">
          <BrutalistCard title="🔓 BYPASS LOCK" className="max-w-md w-full bg-white">
            <div className="space-y-4">
              <p className="font-black uppercase text-xs text-rose-600">Enter tournament name to unlock result for editing.</p>
              <input placeholder="ENTER NAME" className="w-full brutalist-border p-4 font-black uppercase bg-white text-black outline-none border-rose-600" value={securityInput} onChange={e => setSecurityInput(e.target.value)} />
              <div className="flex gap-2">
                <BrutalistButton variant="danger" className="flex-1 py-3" onClick={() => {
                   if (securityInput.trim().toLowerCase() !== tournament.name.trim().toLowerCase()) return alert("Security Mismatch!");
                   const updatedMatches = tournament.matches.map(m => m.id === confirmingAction?.matchId ? { ...m, status: 'NOT_STARTED' as const, resultType: undefined, winnerId: undefined } : m);
                   const updatedSeries = tournament.series?.map(s => {
                    const sMs = updatedMatches.filter(m => m.seriesId === s.id);
                    return { ...s, status: sMs.every(m => m.status === 'COMPLETED') ? 'COMPLETED' : (sMs.some(m => m.status === 'COMPLETED') ? 'IN_PROGRESS' : 'NOT_STARTED') } as SeriesGroup;
                  });
                  onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries });
                  setConfirmingAction(null);
                  setSecurityInput('');
                }}>UNLOCK RECORD</BrutalistButton>
                <BrutalistButton variant="secondary" className="flex-1 py-3" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-in { animation: slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @media print { .no-print { display: none !important; } body { background: white !important; } }
      `}</style>
    </div>
  );
};

export default TournamentWorkspace;
