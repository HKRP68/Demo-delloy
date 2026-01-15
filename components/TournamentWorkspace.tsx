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

const TournamentWorkspace: React.FC<TournamentWorkspaceProps> = ({ tournament, onExit, onUpdateTournament }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('DASHBOARD');
  const [scheduleLevel, setScheduleLevel] = useState<ScheduleLevel>('ROUNDS');
  const [drillDownRound, setDrillDownRound] = useState<number | null>(null);
  const [drillDownSeries, setDrillDownSeries] = useState<string | null>(null);
  
  const [fixtureTeam, setFixtureTeam] = useState('');
  const [fixtureRound, setFixtureRound] = useState('');
  const [fixtureStatus, setFixtureStatus] = useState('');

  const [visibleColumns, setVisibleColumns] = useState({
    seriesPlayed: false,
    seriesCompleted: false,
    seriesLeft: false,
    matchesPlayed: true,
    matchesWon: true,
    matchesDrawn: true,
    matchesLost: true,
    totalPoints: true,
    maxPoints: true,
    pct: true,
    penalties: true,
    finalPoints: false
  });

  const [securityInput, setSecurityInput] = useState('');
  const [penaltyForm, setPenaltyForm] = useState({ teamId: '', points: 0, reason: '' });

  // Fixed Ref types for TS compatibility
  const pointsTableRef = useRef<HTMLDivElement>(null);
  const roundsRef = useRef<HTMLDivElement>(null);
  const fixturesRef = useRef<HTMLDivElement>(null);
  
  const [confirmingAction, setConfirmingAction] = useState<{ 
    type: 'SAVE_RESULT' | 'REGENERATE_SCHEDULE' | 'ADMIN_UNLOCK' | 'ADD_MATCH' | 'REMOVE_MATCH' | 'ADD_PENALTY', 
    matchId?: string,
    penaltyId?: string
  } | null>(null);

  const [resultForm, setResultForm] = useState({
    winnerId: '',
    resultType: 'DRAW' as MatchResultType,
    notes: ''
  });

  const [addMatchVenue, setAddMatchVenue] = useState(tournament.stadiums[0]?.id || 'V1');

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
    const t1Stats = { w: 0, l: 0, d: 0, pts: 0, sWin: 0, sLoss: 0, sDraw: 0, sPts: 0 };
    const t2Stats = { w: 0, l: 0, d: 0, pts: 0, sWin: 0, sLoss: 0, sDraw: 0, sPts: 0 };

    matches.forEach(m => {
      const p = getMatchPoints(m);
      t1Stats.pts += p.t1; t2Stats.pts += p.t2;
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
    return { t1: t1Stats, t2: t2Stats };
  };

  const standings = useMemo(() => {
    const stats: Record<string, Team & { playedFor: number; seriesCompleted: number; seriesTotal: number; maxPossiblePoints: number; }> = {};
    tournament.teams.forEach(t => {
      const teamSeries = (tournament.series || []).filter(s => s.team1Id === t.id || s.team2Id === t.id);
      const totalMatchesPlanned = (tournament.matches || []).filter(m => m.team1Id === t.id || m.team2Id === t.id).length;
      stats[t.id] = { 
        ...t, seriesPlayed: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesDrawn: 0, 
        matchesTie: 0, matchesNR: 0, basePoints: 0, bonusPoints: 0, penaltyPoints: 0, totalPoints: 0, pct: 0,
        playedFor: 0, seriesCompleted: 0, seriesTotal: teamSeries.length,
        maxPossiblePoints: (totalMatchesPlanned * tournament.config.pointsForWin) + (teamSeries.length * tournament.config.pointsForSeriesWin)
      };
    });
    tournament.matches.filter(m => m.status === 'COMPLETED').forEach(m => {
      const t1 = stats[m.team1Id]; const t2 = stats[m.team2Id]; if (!t1 || !t2) return;
      t1.matchesPlayed++; t2.matchesPlayed++; t1.playedFor += tournament.config.pointsForWin; t2.playedFor += tournament.config.pointsForWin;
      const pts = getMatchPoints(m); t1.basePoints += pts.t1; t2.basePoints += pts.t2;
      if (m.resultType === 'T1_WIN') { t1.matchesWon++; t2.matchesLost++; }
      else if (m.resultType === 'T2_WIN') { t2.matchesWon++; t1.matchesLost++; }
      else { t1.matchesDrawn++; t2.matchesDrawn++; }
    });
    tournament.series?.forEach(s => {
      const isTeam1 = stats[s.team1Id]; const isTeam2 = stats[s.team2Id];
      if (s.status !== 'NOT_STARTED') { if (isTeam1) isTeam1.seriesPlayed++; if (isTeam2) isTeam2.seriesPlayed++; }
      if (s.status === 'COMPLETED') {
        if (isTeam1) isTeam1.seriesCompleted++; if (isTeam2) isTeam2.seriesCompleted++;
        const perf = getSeriesPerformance(s.id);
        if (perf) { if (isTeam1) isTeam1.bonusPoints += perf.t1.sPts; if (isTeam2) isTeam2.bonusPoints += perf.t2.sPts; }
      }
    });
    tournament.penalties.forEach(p => { if (stats[p.teamId]) stats[p.teamId].penaltyPoints += p.points; });
    return Object.values(stats).map(t => {
      t.totalPoints = t.basePoints + t.bonusPoints;
      const finalVal = t.totalPoints - t.penaltyPoints;
      t.pct = t.playedFor > 0 ? (finalVal / t.playedFor) * 100 : 0;
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
      const status = sInR.every(s => s.status === 'COMPLETED') ? 'COMPLETED' : (sInR.some(s => s.status !== 'NOT_STARTED') ? 'IN_PROGRESS' : 'NOT_STARTED');
      return { num: rNum, series: sInR, status, matchCount: sInR.reduce((sum, s) => sum + s.matchIds.length, 0) };
    });
  }, [tournament.series]);

  const masterFixturesData = useMemo(() => {
    if (!tournament.series) return [];
    return tournament.series.filter(s => {
      const matchesTeam = !fixtureTeam || s.team1Id === fixtureTeam || s.team2Id === fixtureTeam;
      const matchesRound = !fixtureRound || s.round === parseInt(fixtureRound);
      const matchesStatus = !fixtureStatus || s.status === fixtureStatus;
      return matchesTeam && matchesRound && matchesStatus;
    }).sort((a, b) => a.round - b.round);
  }, [tournament.series, fixtureTeam, fixtureRound, fixtureStatus]);

  // Fixed handleSnap typing
  const handleSnap = (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
    if (ref && ref.current) {
      htmlToImage.toPng(ref.current, { backgroundColor: '#f3f4f6' }).then(dataUrl => {
        const link = document.createElement('a'); link.download = filename; link.href = dataUrl; link.click();
      });
    }
  };

  const generateSchedule = () => {
    const teams = tournament.teams;
    if (teams.length < 2) return alert("Min 2 teams required!");
    
    const matches: Match[] = [];
    const series: SeriesGroup[] = [];
    const mode = tournament.config.schedulingMode || 'AUTO';
    const manualDraft = tournament.config.manualSeriesDraft || [];

    const addSeriesToPool = (t1Id: string, t2Id: string, matchCount: number, roundNum: number) => {
      const sId = `S-R${roundNum}-${t1Id.slice(-4)}-${t2Id.slice(-4)}`;
      const mIds: string[] = [];
      for (let m = 0; m < matchCount; m++) {
        const mId = `M-${sId}-T${m+1}`; mIds.push(mId);
        matches.push({
          id: mId, round: roundNum, seriesId: sId, team1Id: t1Id, team2Id: t2Id,
          venueId: tournament.stadiums[m % (tournament.stadiums.length || 1)]?.id || 'V1',
          status: 'NOT_STARTED'
        });
      }
      series.push({ id: sId, round: roundNum, team1Id: t1Id, team2Id: t2Id, status: 'NOT_STARTED', matchIds: mIds });
    };

    let roundCursor = 1;
    const teamUsage: Record<number, Set<string>> = {};

    if (mode === 'MANUAL' || mode === 'HYBRID') {
      manualDraft.forEach(entry => {
        let assigned = false;
        let r = 1;
        while (!assigned) {
          if (!teamUsage[r]) teamUsage[r] = new Set();
          if (!teamUsage[r].has(entry.team1Id) && !teamUsage[r].has(entry.team2Id)) {
            addSeriesToPool(entry.team1Id, entry.team2Id, entry.matchCount, r);
            teamUsage[r].add(entry.team1Id); teamUsage[r].add(entry.team2Id);
            assigned = true;
            roundCursor = Math.max(roundCursor, r + 1);
          }
          r++;
        }
      });
    }

    if (mode === 'AUTO' || mode === 'HYBRID') {
      const teamIds = [...teams.map(t => t.id)];
      if (teamIds.length % 2 !== 0) teamIds.push('BYE');
      const isDouble = tournament.config.scheduleFormat.includes('DOUBLE');
      const loops = isDouble ? 2 : 1;
      const numRounds = teamIds.length - 1;

      for (let loop = 0; loop < loops; loop++) {
        for (let r = 0; r < numRounds; r++) {
          const currentRRRound = roundCursor + (loop * numRounds) + r;
          if (!teamUsage[currentRRRound]) teamUsage[currentRRRound] = new Set();
          
          for (let i = 0; i < teamIds.length / 2; i++) {
            const t1 = teamIds[i]; const t2 = teamIds[teamIds.length - 1 - i];
            if (t1 !== 'BYE' && t2 !== 'BYE') {
              const pairExists = (mode === 'HYBRID') && manualDraft.some(m => (m.team1Id === t1 && m.team2Id === t2) || (m.team1Id === t2 && m.team2Id === t1));
              if (!pairExists) {
                const count = Math.floor(Math.random() * (seriesRange.max - seriesRange.min + 1)) + seriesRange.min;
                addSeriesToPool(t1, t2, count, currentRRRound);
              }
            }
          }
          teamIds.splice(1, 0, teamIds.pop()!);
        }
      }
    }

    onUpdateTournament?.({ ...tournament, matches, series, status: 'ONGOING' });
  };

  const handleAddPenalty = () => {
    if (!penaltyForm.teamId || penaltyForm.points <= 0) return alert("Select team and valid points");
    const newPenalty: PenaltyRecord = {
      id: Date.now().toString(),
      teamId: penaltyForm.teamId,
      points: penaltyForm.points,
      reason: penaltyForm.reason || "Slow Over Rate / Disciplinary",
      date: new Date().toLocaleDateString()
    };
    onUpdateTournament?.({ ...tournament, penalties: [...tournament.penalties, newPenalty] });
    setPenaltyForm({ teamId: '', points: 0, reason: '' });
    setConfirmingAction(null);
  };

  const handleAddMatch = () => {
    if (!drillDownSeries) return;
    const series = tournament.series?.find(s => s.id === drillDownSeries);
    if (!series) return;
    const newId = `M-ADD-${series.id}-${Date.now()}`;
    const newMatch: Match = { 
      id: newId, round: series.round, seriesId: series.id, 
      team1Id: series.team1Id, team2Id: series.team2Id, 
      venueId: addMatchVenue, status: 'NOT_STARTED' 
    };
    const updatedMs = [...tournament.matches, newMatch];
    const updatedSs = (tournament.series || []).map(s => s.id === series.id ? { ...s, matchIds: [...s.matchIds, newId] } : s);
    onUpdateTournament?.({ ...tournament, matches: updatedMs, series: updatedSs });
    setConfirmingAction(null);
  };

  const toggleAllColumns = () => {
    const anyHidden = Object.values(visibleColumns).some(v => v === false);
    const newState = Object.keys(visibleColumns).reduce((acc, key) => ({ ...acc, [key]: anyHidden }), {});
    setVisibleColumns(newState as any);
  };

  return (
    <div className="space-y-8 pb-32">
      <BrutalistCard variant="white" className="p-0 overflow-hidden border-4 border-black no-print">
        <div className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white brutalist-border p-2 transform rotate-3 flex items-center justify-center"><span className="text-black font-black text-4xl">W</span></div>
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tighter leading-none">{tournament.name}</h1>
              <p className="mono text-[8px] tracking-widest text-yellow-400 font-bold uppercase mt-1">WTC CONTROL PANEL V2.6</p>
            </div>
          </div>
          <BrutalistButton variant="danger" onClick={onExit} className="px-8">EXIT</BrutalistButton>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 border-t-4 border-black bg-white">
          {['DASHBOARD', 'INFO', 'SCHEDULE', 'RESULTS', 'POINTS', 'SETTINGS'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as WorkspaceTab)} className={`p-4 font-black uppercase text-[10px] border-r-4 border-black last:border-r-0 transition-all ${activeTab === tab ? 'bg-yellow-400 text-black' : 'bg-white hover:bg-gray-100'}`}>{tab}</button>
          ))}
        </div>
      </BrutalistCard>

      <div className="animate-in fade-in duration-500">
        {activeTab === 'DASHBOARD' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-black text-white p-8 brutalist-border brutalist-shadow">
                  <h4 className="mono text-[10px] uppercase text-yellow-400 mb-2">Completion Status</h4>
                  <div className="text-6xl font-black tracking-tighter">{metrics.percent}%</div>
                  <div className="w-full h-4 bg-gray-800 mt-4 brutalist-border relative overflow-hidden"><div className="absolute inset-0 bg-yellow-400" style={{ width: `${metrics.percent}%` }}></div></div>
                  <p className="mono text-[9px] mt-4 uppercase font-bold">{metrics.completedMatches} OF {metrics.totalMatches} MATCHES</p>
                </div>
                <div className="bg-white p-8 brutalist-border brutalist-shadow">
                  <h4 className="mono text-[10px] uppercase text-gray-500 mb-2">Current Rank #1</h4>
                  <div className="text-4xl font-black tracking-tighter uppercase italic">{metrics.leader?.name || "N/A"}</div>
                  <div className="mt-4 flex items-center gap-2"><span className="bg-yellow-400 px-2 py-1 brutalist-border font-black text-xl">{metrics.leader?.pct.toFixed(2)}%</span></div>
                </div>
              </div>
              {metrics.totalMatches === 0 ? (
                <BrutalistCard title="SYSTEM ACTION REQUIRED" variant="magenta" className="p-10 text-center">
                  <BrutalistButton variant="primary" onClick={() => setActiveTab('SCHEDULE')} className="text-xl px-12 py-4">GO TO SCHEDULE PAGE</BrutalistButton>
                </BrutalistCard>
              ) : (
                <BrutalistCard title="RECENT ACTIVITY" variant="white">
                   <div className="space-y-4">
                      {tournament.matches.filter(m => m.status === 'COMPLETED').slice(-5).reverse().map(m => (
                        <div key={m.id} className="flex justify-between items-center p-3 brutalist-border bg-gray-50 font-black uppercase text-xs">
                          <span>{tournament.teams.find(t => t.id === m.team1Id)?.shortName} v {tournament.teams.find(t => t.id === m.team2Id)?.shortName}</span>
                          <span className="bg-emerald-400 px-2 py-1 brutalist-border">{m.resultType === 'DRAW' ? 'DRAW' : tournament.teams.find(t => t.id === m.winnerId)?.shortName + ' WON'}</span>
                        </div>
                      ))}
                   </div>
                </BrutalistCard>
              )}
            </div>
            <BrutalistCard title="QUICK STANDINGS" variant="yellow" compact>
               <div className="space-y-2">
                 {standings.slice(0, 5).map((t, idx) => (
                   <div key={t.id} className="flex items-center justify-between border-b-2 border-black/10 pb-2">
                     <span className="font-bold text-xs uppercase">#{idx+1} {t.shortName}</span>
                     <span className="font-black mono">{t.pct.toFixed(1)}%</span>
                   </div>
                 ))}
                 <BrutalistButton variant="secondary" className="w-full mt-4" onClick={() => setActiveTab('POINTS')}>VIEW FULL TABLE</BrutalistButton>
               </div>
            </BrutalistCard>
          </div>
        )}

        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
            <div className="bg-black p-4 brutalist-border text-white flex justify-between items-center no-print">
                <div className="flex gap-6 font-black text-xs uppercase">
                   <button onClick={() => { setScheduleLevel('ROUNDS'); setDrillDownRound(null); }} className={scheduleLevel === 'ROUNDS' ? 'text-yellow-400' : ''}>Rounds</button>
                   <button onClick={() => setScheduleLevel('FULL_SCHEDULE')} className={scheduleLevel === 'FULL_SCHEDULE' ? 'text-yellow-400' : ''}>Master Fixtures</button>
                </div>
                {!tournament.matches?.length && <BrutalistButton variant="success" compact onClick={generateSchedule}>Generate Schedule</BrutalistButton>}
            </div>
            {scheduleLevel === 'ROUNDS' && !drillDownRound && (
              <div ref={roundsRef} className="space-y-4">
                <div className="flex justify-between items-center mb-2 no-print">
                   <h2 className="text-xl font-black uppercase">Rounds View</h2>
                   <BrutalistButton variant="accent" compact onClick={() => handleSnap(roundsRef, "rounds.png")}>Download Rounds PNG</BrutalistButton>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {roundsData.map(r => (
                    <BrutalistCard key={r.num} title={`ROUND ${r.num}`} variant={r.status === 'COMPLETED' ? 'green' : 'white'} compact>
                      <div className="space-y-4">
                        <div className="flex justify-between text-[10px] font-black uppercase"><span>Series: {r.series.length}</span><span>Matches: {r.matchCount}</span></div>
                        <BrutalistButton variant="primary" className="w-full" onClick={() => { setDrillDownRound(r.num); setScheduleLevel('SERIES'); }}>Open Round</BrutalistButton>
                      </div>
                    </BrutalistCard>
                  ))}
                </div>
              </div>
            )}
            {scheduleLevel === 'FULL_SCHEDULE' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2 no-print">
                   <h2 className="text-xl font-black uppercase">Master Fixtures</h2>
                   <BrutalistButton variant="accent" compact onClick={() => handleSnap(fixturesRef, "fixtures.png")}>Download Fixtures PNG</BrutalistButton>
                </div>
                <div ref={fixturesRef} className="space-y-2 bg-white p-4 brutalist-border">
                   {masterFixturesData.map(s => (
                     <div key={s.id} className="p-3 brutalist-border bg-gray-50 flex justify-between items-center uppercase font-black text-xs mb-2">
                       <span>R{s.round} | {tournament.teams.find(t => t.id === s.team1Id)?.shortName} V {tournament.teams.find(t => t.id === s.team2Id)?.shortName}</span>
                       <BrutalistButton variant="magenta" compact className="no-print" onClick={() => { setDrillDownSeries(s.id); setScheduleLevel('MATCHES'); }}>View Matches</BrutalistButton>
                     </div>
                   ))}
                </div>
              </div>
            )}
            {scheduleLevel === 'SERIES' && (
               <div className="space-y-4">
                  <BrutalistButton variant="secondary" onClick={() => { setDrillDownRound(null); setScheduleLevel('ROUNDS'); }}>← Back</BrutalistButton>
                  <BrutalistCard title={`Round ${drillDownRound} Pairings`}>
                    <table className="w-full text-left font-black uppercase text-xs">
                      <tbody>
                        {tournament.series!.filter(s => s.round === drillDownRound).map(s => {
                          const perf = getSeriesPerformance(s.id);
                          return (
                            <tr key={s.id} className="border-b border-black/10">
                              <td className="p-2">{tournament.teams.find(t => t.id === s.team1Id)?.shortName} V {tournament.teams.find(t => t.id === s.team2Id)?.shortName}</td>
                              <td className="p-2 text-center">{perf?.t1.w || 0} - {perf?.t2.w || 0}</td>
                              <td className="p-2 text-right"><BrutalistButton variant="magenta" compact onClick={() => { setDrillDownSeries(s.id); setScheduleLevel('MATCHES'); }}>Matches</BrutalistButton></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </BrutalistCard>
               </div>
            )}
            {scheduleLevel === 'MATCHES' && (
              <div className="space-y-4">
                <BrutalistButton variant="secondary" onClick={() => setScheduleLevel('SERIES')}>← Back</BrutalistButton>
                <div className="bg-white brutalist-border p-4">
                  {tournament.matches.filter(m => m.seriesId === drillDownSeries).map((m, idx) => {
                    const t1 = tournament.teams.find(t => t.id === m.team1Id);
                    const t2 = tournament.teams.find(t => t.id === m.team2Id);
                    return (
                      <div key={m.id} className="p-3 border-b-2 border-black last:border-0 flex justify-between items-center uppercase font-black text-xs">
                        <span>Match {idx+1}: {t1?.shortName} V {t2?.shortName}</span>
                        {m.status === 'COMPLETED' ? (
                          <span className="text-emerald-600">{m.resultType === 'DRAW' ? 'DRAW' : tournament.teams.find(t => t.id === m.winnerId)?.shortName + ' WON'}</span>
                        ) : (
                          <BrutalistButton variant="success" compact onClick={() => { setConfirmingAction({ type: 'SAVE_RESULT', matchId: m.id }); setResultForm({ winnerId: '', resultType: 'T1_WIN', notes: '' }); }}>Commit</BrutalistButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'POINTS' && (
           <div className="space-y-6">
              <div className="flex justify-between items-end no-print">
                 <div className="bg-black text-white p-4 brutalist-border"><h2 className="text-2xl font-black uppercase italic">WTC Point Table</h2></div>
                 <BrutalistButton variant="accent" onClick={() => handleSnap(pointsTableRef, "points_table.png")}>Download PNG</BrutalistButton>
              </div>
              <div ref={pointsTableRef} className="bg-white brutalist-border overflow-x-auto p-4">
                <table className="w-full text-left uppercase font-black text-[10px] border-collapse">
                  <thead className="bg-gray-100 border-b-4 border-black">
                    <tr><th className="p-3">Rank</th><th className="p-3">Team</th><th className="p-3 text-center">MP</th><th className="p-3 text-center">W</th><th className="p-3 text-center">L</th><th className="p-3 text-center">D</th><th className="p-3 text-center bg-yellow-400">PCT %</th></tr>
                  </thead>
                  <tbody>
                    {standings.map((t, idx) => (
                      <tr key={t.id} className="border-b-2 border-black hover:bg-yellow-50">
                        <td className="p-3">#{idx+1}</td>
                        <td className="p-3">{t.name}</td>
                        <td className="p-3 text-center">{t.matchesPlayed}</td>
                        <td className="p-3 text-center">{t.matchesWon}</td>
                        <td className="p-3 text-center">{t.matchesLost}</td>
                        <td className="p-3 text-center">{t.matchesDrawn}</td>
                        <td className="p-3 text-center bg-yellow-400/20">{t.pct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>
        )}

        {activeTab === 'SETTINGS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <BrutalistCard title="APPLY PENALTY" variant="pink">
               <div className="space-y-4">
                 <select className="w-full brutalist-border p-3 font-black uppercase bg-white" value={penaltyForm.teamId} onChange={e => setPenaltyForm({...penaltyForm, teamId: e.target.value})}>
                   <option value="">SELECT TEAM</option>
                   {tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                 </select>
                 <div className="flex gap-2">
                   <input type="number" placeholder="PTS" className="w-24 brutalist-border p-3 font-black bg-white" value={penaltyForm.points || ''} onChange={e => setPenaltyForm({...penaltyForm, points: parseInt(e.target.value)})}/>
                   <input type="text" placeholder="REASON" className="flex-1 brutalist-border p-3 font-black uppercase text-xs" value={penaltyForm.reason} onChange={e => setPenaltyForm({...penaltyForm, reason: e.target.value})}/>
                 </div>
                 <BrutalistButton variant="danger" className="w-full" onClick={handleAddPenalty}>DEDUCT POINTS</BrutalistButton>
               </div>
            </BrutalistCard>
          </div>
        )}
      </div>

      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
          <BrutalistCard title="COMMIT MATCH RESULT" className="max-w-md w-full">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-2">
                {[tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id, tournament.matches.find(m => m.id === confirmingAction.matchId)?.team2Id].map(tid => {
                   const t = tournament.teams.find(te => te.id === tid);
                   return <button key={tid} onClick={() => setResultForm({...resultForm, winnerId: tid!, resultType: tid === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id ? 'T1_WIN' : 'T2_WIN'})} className={`p-4 brutalist-border font-black uppercase ${resultForm.winnerId === tid ? 'bg-black text-white' : 'bg-white'}`}>{t?.name} WIN</button>
                })}
                <button onClick={() => setResultForm({...resultForm, winnerId: '', resultType: 'DRAW'})} className={`p-4 brutalist-border font-black uppercase ${resultForm.resultType === 'DRAW' ? 'bg-black text-white' : 'bg-white'}`}>DRAW</button>
              </div>
              <BrutalistButton variant="success" className="w-full" onClick={() => {
                   const updatedMatches = tournament.matches.map(m => m.id === confirmingAction.matchId ? { ...m, status: 'COMPLETED' as const, resultType: resultForm.resultType, winnerId: resultForm.winnerId } : m);
                   const updatedSeries = (tournament.series || []).map(s => {
                    const sMs = updatedMatches.filter(m => m.seriesId === s.id);
                    const statusStr = sMs.every(m => m.status === 'COMPLETED') ? 'COMPLETED' : (sMs.some(m => m.status === 'COMPLETED') ? 'IN_PROGRESS' : 'NOT_STARTED');
                    return { ...s, status: statusStr as SeriesGroup['status'] };
                  });
                  onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries });
                  setConfirmingAction(null);
                }}>Confirm</BrutalistButton>
              <BrutalistButton variant="secondary" className="w-full" onClick={() => setConfirmingAction(null)}>Cancel</BrutalistButton>
            </div>
          </BrutalistCard>
        </div>
      )}
    </div>
  );
};

export default TournamentWorkspace;