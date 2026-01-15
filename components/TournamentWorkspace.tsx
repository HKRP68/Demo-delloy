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
  
  // Master Fixtures Filters
  const [fixtureTeam, setFixtureTeam] = useState('');
  const [fixtureRound, setFixtureRound] = useState('');
  const [fixtureStatus, setFixtureStatus] = useState('');

  // Column Visibility State
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

  // Refs for Image Download
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

  // --- HELPER TO CALCULATE POINTS FOR A SPECIFIC MATCH ---
  const getMatchPoints = (match: Match) => {
    if (match.status !== 'COMPLETED') return { t1: 0, t2: 0 };
    const { pointsForWin, pointsForDraw, pointsForLoss } = tournament.config;
    if (match.resultType === 'T1_WIN') return { t1: pointsForWin, t2: pointsForLoss };
    if (match.resultType === 'T2_WIN') return { t1: pointsForLoss, t2: pointsForWin };
    if (match.resultType === 'DRAW' || match.resultType === 'TIE') return { t1: pointsForDraw, t2: pointsForDraw };
    return { t1: 0, t2: 0 };
  };

  // --- HELPER TO CALCULATE PERFORMANCE FOR A SERIES ---
  const getSeriesPerformance = (seriesId: string) => {
    const series = tournament.series?.find(s => s.id === seriesId);
    if (!series) return null;

    const matches = tournament.matches.filter(m => m.seriesId === seriesId && m.status === 'COMPLETED');
    const t1Stats = { w: 0, l: 0, d: 0, pts: 0, sWin: 0, sLoss: 0, sDraw: 0, sPts: 0 };
    const t2Stats = { w: 0, l: 0, d: 0, pts: 0, sWin: 0, sLoss: 0, sDraw: 0, sPts: 0 };

    matches.forEach(m => {
      const p = getMatchPoints(m);
      t1Stats.pts += p.t1;
      t2Stats.pts += p.t2;
      if (m.resultType === 'T1_WIN') { t1Stats.w++; t2Stats.l++; }
      else if (m.resultType === 'T2_WIN') { t2Stats.w++; t1Stats.l++; }
      else { t1Stats.d++; t2Stats.d++; }
    });

    if (series.status === 'COMPLETED' && matches.length > 0) {
      if (t1Stats.w > t2Stats.w) {
        t1Stats.sWin = 1; t2Stats.sLoss = 1;
        if (tournament.config.countSeriesBonus) {
            t1Stats.sPts = tournament.config.pointsForSeriesWin;
            t2Stats.sPts = tournament.config.pointsForSeriesLoss;
        }
      } else if (t2Stats.w > t1Stats.w) {
        t2Stats.sWin = 1; t1Stats.sLoss = 1;
        if (tournament.config.countSeriesBonus) {
            t2Stats.sPts = tournament.config.pointsForSeriesWin;
            t1Stats.sPts = tournament.config.pointsForSeriesLoss;
        }
      } else {
        t1Stats.sDraw = 1; t2Stats.sDraw = 1;
        if (tournament.config.countSeriesBonus) {
          t1Stats.sPts = tournament.config.pointsForSeriesDraw;
          t2Stats.sPts = tournament.config.pointsForSeriesDraw;
        }
      }
    }

    return { t1: t1Stats, t2: t2Stats };
  };

  // --- STANDINGS CALCULATION ---
  const standings = useMemo(() => {
    const stats: Record<string, Team & { 
      playedFor: number; 
      seriesCompleted: number; 
      seriesTotal: number;
      maxPossiblePoints: number;
    }> = {};

    tournament.teams.forEach(t => {
      const teamSeries = (tournament.series || []).filter(s => s.team1Id === t.id || s.team2Id === t.id);
      const totalMatchesPlanned = (tournament.matches || []).filter(m => m.team1Id === t.id || m.team2Id === t.id).length;

      stats[t.id] = { 
        ...t, 
        seriesPlayed: 0, matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesDrawn: 0, 
        matchesTie: 0, matchesNR: 0, basePoints: 0, bonusPoints: 0, penaltyPoints: 0, totalPoints: 0, pct: 0,
        playedFor: 0,
        seriesCompleted: 0,
        seriesTotal: teamSeries.length,
        maxPossiblePoints: (totalMatchesPlanned * tournament.config.pointsForWin) + (teamSeries.length * tournament.config.pointsForSeriesWin)
      };
    });

    tournament.matches.filter(m => m.status === 'COMPLETED').forEach(m => {
      const t1 = stats[m.team1Id]; const t2 = stats[m.team2Id];
      if (!t1 || !t2) return;
      t1.matchesPlayed++; t2.matchesPlayed++;
      t1.playedFor += tournament.config.pointsForWin; t2.playedFor += tournament.config.pointsForWin;
      const pts = getMatchPoints(m);
      t1.basePoints += pts.t1;
      t2.basePoints += pts.t2;
      if (m.resultType === 'T1_WIN') { t1.matchesWon++; t2.matchesLost++; }
      else if (m.resultType === 'T2_WIN') { t2.matchesWon++; t1.matchesLost++; }
      else { t1.matchesDrawn++; t2.matchesDrawn++; }
    });

    tournament.series?.forEach(s => {
      const isTeam1 = stats[s.team1Id];
      const isTeam2 = stats[s.team2Id];
      if (s.status !== 'NOT_STARTED') {
        if (isTeam1) isTeam1.seriesPlayed++;
        if (isTeam2) isTeam2.seriesPlayed++;
      }
      if (s.status === 'COMPLETED') {
        if (isTeam1) isTeam1.seriesCompleted++;
        if (isTeam2) isTeam2.seriesCompleted++;
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
      const finalVal = t.totalPoints - t.penaltyPoints;
      t.pct = t.playedFor > 0 ? (finalVal / t.playedFor) * 100 : 0;
      return t;
    }).sort((a, b) => (b.pct - a.pct) || (a.penaltyPoints - b.penaltyPoints) || (b.totalPoints - a.totalPoints));
  }, [tournament]);

  const metrics = useMemo(() => {
    const total = tournament.matches.length;
    const completed = tournament.matches.filter(m => m.status === 'COMPLETED').length;
    return {
      totalMatches: total,
      completedMatches: completed,
      percent: total > 0 ? Math.floor((completed / total) * 100) : 0,
      leader: standings[0]
    };
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

  // Master Fixtures Filtered Data
  const masterFixturesData = useMemo(() => {
    if (!tournament.series) return [];
    return tournament.series.filter(s => {
      const matchesTeam = !fixtureTeam || s.team1Id === fixtureTeam || s.team2Id === fixtureTeam;
      const matchesRound = !fixtureRound || s.round === parseInt(fixtureRound);
      const matchesStatus = !fixtureStatus || s.status === fixtureStatus;
      return matchesTeam && matchesRound && matchesStatus;
    }).sort((a, b) => a.round - b.round);
  }, [tournament.series, fixtureTeam, fixtureRound, fixtureStatus]);

  // --- ACTIONS ---
  const handleSnap = (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (ref.current) {
      htmlToImage.toPng(ref.current, { backgroundColor: '#f3f4f6' }).then(dataUrl => {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
      }).catch(err => {
        console.error('Snap error:', err);
        alert('Failed to generate image. Ensure all assets are loaded.');
      });
    }
  };

  const generateTestSchedule = () => {
    const teams = tournament.teams.filter(t => t.id !== 'BYE');
    if (teams.length < 2) return alert("Min 2 teams required!");
    const matches: Match[] = [];
    const series: SeriesGroup[] = [];
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
          const bestLen = Math.floor(Math.random() * (seriesRange.max - seriesRange.min + 1)) + seriesRange.min;
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
      {/* Workspace Sub-Header */}
      <BrutalistCard variant="white" className="p-0 overflow-hidden border-4 border-black no-print">
        <div className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white brutalist-border p-2 transform rotate-3 flex items-center justify-center">
               <span className="text-black font-black text-4xl">W</span>
            </div>
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tighter leading-none">{tournament.name}</h1>
              <p className="mono text-[8px] tracking-widest text-yellow-400 font-bold uppercase mt-1">WTC CONTROL PANEL V2.6</p>
            </div>
          </div>
          <BrutalistButton variant="danger" onClick={onExit} className="px-8">EXIT</BrutalistButton>
        </div>
        
        <div className="grid grid-cols-3 md:grid-cols-6 border-t-4 border-black bg-white">
          {['DASHBOARD', 'INFO', 'SCHEDULE', 'RESULTS', 'POINTS', 'SETTINGS'].map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab as WorkspaceTab); }} 
              className={`p-4 font-black uppercase text-[10px] border-r-4 border-black last:border-r-0 transition-all ${activeTab === tab ? 'bg-yellow-400 text-black shadow-none' : 'bg-white text-black hover:bg-gray-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </BrutalistCard>

      <div className="animate-in fade-in duration-500">
        
        {/* DASHBOARD TAB */}
        {activeTab === 'DASHBOARD' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-black text-white p-8 brutalist-border brutalist-shadow">
                  <h4 className="mono text-[10px] uppercase text-yellow-400 mb-2">Completion Status</h4>
                  <div className="text-6xl font-black tracking-tighter">{metrics.percent}%</div>
                  <div className="w-full h-4 bg-gray-800 mt-4 brutalist-border relative overflow-hidden">
                    <div className="absolute inset-0 bg-yellow-400 transition-all duration-1000" style={{ width: `${metrics.percent}%` }}></div>
                  </div>
                  <p className="mono text-[9px] mt-4 uppercase font-bold">{metrics.completedMatches} OF {metrics.totalMatches} MATCHES COMPLETED</p>
                </div>
                <div className="bg-white p-8 brutalist-border brutalist-shadow">
                  <h4 className="mono text-[10px] uppercase text-gray-500 mb-2">Current Rank #1</h4>
                  <div className="text-4xl font-black tracking-tighter uppercase italic">{metrics.leader?.name || "N/A"}</div>
                  <div className="mt-4 flex items-center gap-2">
                    <span className="bg-yellow-400 px-2 py-1 brutalist-border font-black text-xl">{metrics.leader?.pct.toFixed(2)}%</span>
                    <span className="font-bold mono text-xs uppercase">POINTS PCT</span>
                  </div>
                </div>
              </div>

              {metrics.totalMatches === 0 ? (
                <BrutalistCard title="SYSTEM ACTION REQUIRED" variant="magenta" className="p-10 text-center">
                  <div className="space-y-4">
                    <p className="text-2xl font-black uppercase">Schedule not yet initialized.</p>
                    <BrutalistButton variant="primary" onClick={() => setActiveTab('SCHEDULE')} className="text-xl px-12 py-4">GO TO SCHEDULE PAGE</BrutalistButton>
                  </div>
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
                      {tournament.matches.filter(m => m.status === 'COMPLETED').length === 0 && <p className="text-center font-bold text-gray-400 uppercase italic">No matches played yet.</p>}
                   </div>
                </BrutalistCard>
              )}
            </div>
            
            <div className="space-y-8">
               <BrutalistCard title="QUICK STANDINGS" variant="yellow" compact>
                  <div className="space-y-2">
                    {standings.slice(0, 5).map((t, idx) => (
                      <div key={t.id} className="flex items-center justify-between border-b-2 border-black/10 pb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-xl">#{idx+1}</span>
                          <span className="font-bold text-xs uppercase">{t.shortName}</span>
                        </div>
                        <span className="font-black mono">{t.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                    <BrutalistButton variant="secondary" className="w-full mt-4" onClick={() => setActiveTab('POINTS')}>VIEW FULL TABLE</BrutalistButton>
                  </div>
               </BrutalistCard>
            </div>
          </div>
        )}

        {/* INFO TAB */}
        {activeTab === 'INFO' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <BrutalistCard title="WTC RULEBOOK" variant="white">
              <div className="prose prose-sm max-w-none">
                <h3 className="font-black uppercase text-xl border-b-4 border-black mb-4 pb-2">Scoring System</h3>
                <table className="w-full mono text-xs uppercase font-bold">
                  <tbody>
                    <tr className="border-b border-black/10"><td className="py-2">MATCH WIN</td><td className="text-right text-emerald-600">{tournament.config.pointsForWin} PTS</td></tr>
                    <tr className="border-b border-black/10"><td className="py-2">MATCH DRAW / TIE</td><td className="text-right text-yellow-600">{tournament.config.pointsForDraw} PTS</td></tr>
                    <tr className="border-b border-black/10"><td className="py-2">MATCH LOSS</td><td className="text-right text-rose-600">{tournament.config.pointsForLoss} PTS</td></tr>
                    {tournament.config.countSeriesBonus && (
                        <>
                            <tr className="border-b border-black/10"><td className="py-2">SERIES WIN</td><td className="text-right text-emerald-600">+{tournament.config.pointsForSeriesWin} PTS</td></tr>
                            <tr className="border-b border-black/10"><td className="py-2">SERIES DRAW</td><td className="text-right text-yellow-600">+{tournament.config.pointsForSeriesDraw} PTS</td></tr>
                            <tr className="border-b border-black/10"><td className="py-2">SERIES LOSS</td><td className="text-right text-rose-600">+{tournament.config.pointsForSeriesLoss} PTS</td></tr>
                        </>
                    )}
                  </tbody>
                </table>
                <div className="mt-8 bg-black text-white p-4 brutalist-border">
                  <p className="text-[10px] leading-relaxed">The Standings are determined by Points Percentage (PCT). In the event of a tie on PCT, total net points and matches won will act as tie-breakers.</p>
                </div>
              </div>
            </BrutalistCard>
            <BrutalistCard title="VENUE DIRECTORY" variant="blue">
               <div className="grid grid-cols-1 gap-2">
                 {tournament.stadiums.map((s, idx) => (
                   <div key={s.id} className="p-3 brutalist-border bg-white flex justify-between items-center group">
                     <span className="font-black uppercase text-sm">{idx+1}. {s.name}</span>
                     <span className="mono text-[10px] bg-gray-100 px-2 py-1">VENUE ID: {s.id.slice(-4)}</span>
                   </div>
                 ))}
                 {tournament.stadiums.length === 0 && <p className="text-center font-bold text-gray-400 py-10 uppercase italic">No stadiums listed.</p>}
               </div>
            </BrutalistCard>
          </div>
        )}

        {/* SCHEDULE TAB */}
        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
            <div className="bg-black p-4 brutalist-border text-white flex justify-between items-center no-print shadow-[6px_6px_0px_black]">
                <div className="flex gap-6 font-black text-xs uppercase">
                   <button onClick={() => { setScheduleLevel('ROUNDS'); setDrillDownRound(null); }} className={scheduleLevel === 'ROUNDS' ? 'text-yellow-400' : 'hover:text-gray-300'}>Rounds View</button>
                   <button onClick={() => { setScheduleLevel('FULL_SCHEDULE'); setDrillDownRound(null); }} className={scheduleLevel === 'FULL_SCHEDULE' ? 'text-yellow-400' : 'hover:text-gray-300'}>Master Fixtures</button>
                </div>
                {!tournament.matches?.length && <BrutalistButton variant="success" compact onClick={generateTestSchedule}>Generate WTC Schedule</BrutalistButton>}
            </div>

            {scheduleLevel === 'ROUNDS' && !drillDownRound && (
              <div ref={roundsRef} className="space-y-4">
                <div className="flex justify-between items-center bg-white p-4 brutalist-border no-print">
                   <h2 className="text-2xl font-black uppercase italic">Tournament Rounds Overview</h2>
                   <BrutalistButton variant="accent" compact onClick={() => handleSnap(roundsRef, `WTC_Rounds_${tournament.name}.png`)}>Snap Rounds PNG</BrutalistButton>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
                  {roundsData.map(r => (
                    <BrutalistCard key={r.num} title={`ROUND ${r.num}`} variant={r.status === 'COMPLETED' ? 'green' : 'white'} compact>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase">
                          <span>Series: {r.series.length}</span>
                          <span>Matches: {r.matchCount}</span>
                        </div>
                        <div className={`text-center font-black py-1 brutalist-border text-[9px] uppercase ${r.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-yellow-400'}`}>{r.status.replace('_', ' ')}</div>
                        <BrutalistButton variant="primary" className="w-full" onClick={() => { setDrillDownRound(r.num); setScheduleLevel('SERIES'); }}>Open Series</BrutalistButton>
                      </div>
                    </BrutalistCard>
                  ))}
                  {roundsData.length === 0 && <div className="col-span-full py-20 text-center font-black text-3xl text-gray-300 uppercase italic">No Rounds Generated</div>}
                </div>
              </div>
            )}

            {scheduleLevel === 'FULL_SCHEDULE' && (
              <div className="space-y-6 animate-in fade-in">
                {/* Filter Bar */}
                <BrutalistCard title="FIXTURES FILTER ENGINE" variant="yellow" compact className="no-print">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase">Filter by Team</label>
                      <select className="w-full brutalist-border p-2 text-xs font-black uppercase bg-white outline-none" value={fixtureTeam} onChange={e => setFixtureTeam(e.target.value)}>
                        <option value="">ALL TEAMS</option>
                        {tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase">Filter by Round</label>
                      <select className="w-full brutalist-border p-2 text-xs font-black uppercase bg-white outline-none" value={fixtureRound} onChange={e => setFixtureRound(e.target.value)}>
                        <option value="">ALL ROUNDS</option>
                        {roundsData.map(r => <option key={r.num} value={r.num}>ROUND {r.num}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase">Filter by Status</label>
                      <select className="w-full brutalist-border p-2 text-xs font-black uppercase bg-white outline-none" value={fixtureStatus} onChange={e => setFixtureStatus(e.target.value)}>
                        <option value="">ALL STATUSES</option>
                        <option value="NOT_STARTED">NOT STARTED</option>
                        <option value="IN_PROGRESS">IN PROGRESS</option>
                        <option value="COMPLETED">COMPLETED</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                       <BrutalistButton variant="danger" className="flex-1" onClick={() => {setFixtureTeam(''); setFixtureRound(''); setFixtureStatus('');}} compact>RESET</BrutalistButton>
                       <BrutalistButton variant="accent" className="flex-1" onClick={() => handleSnap(fixturesRef, `WTC_MasterFixtures_${tournament.name}.png`)} compact>SNAP PNG</BrutalistButton>
                    </div>
                  </div>
                </BrutalistCard>

                {/* Master Fixtures List */}
                <div ref={fixturesRef} className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden p-6">
                  <div className="border-b-4 border-black pb-4 mb-6 flex justify-between items-center">
                     <div>
                        <h2 className="text-4xl font-black uppercase italic tracking-tighter">Master Fixtures List</h2>
                        <p className="mono text-[10px] text-gray-500 font-bold uppercase">Series Level Schedule Overview</p>
                     </div>
                     <div className="bg-black text-white px-4 py-2 brutalist-border font-black text-xl">
                        {masterFixturesData.length} SERIES
                     </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {masterFixturesData.map(s => {
                      const t1 = tournament.teams.find(t => t.id === s.team1Id);
                      const t2 = tournament.teams.find(t => t.id === s.team2Id);
                      const perf = getSeriesPerformance(s.id);
                      return (
                        <div key={s.id} className="brutalist-border p-4 bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4 group hover:bg-white transition-colors">
                          <div className="flex items-center gap-4 flex-1">
                             <div className="w-12 h-12 bg-black text-white flex items-center justify-center brutalist-border font-black text-xs transform -rotate-2">
                                R{s.round}
                             </div>
                             <div className="flex flex-col">
                                <span className="text-lg font-black uppercase leading-tight">{t1?.name} <span className="text-gray-400 italic">v</span> {t2?.name}</span>
                                <span className="text-[10px] mono text-gray-500">{s.matchIds.length} MATCH SERIES | ID: {s.id}</span>
                             </div>
                          </div>
                          
                          <div className="flex items-center gap-6 bg-white brutalist-border p-2 px-4">
                             <div className="flex flex-col items-center">
                                <span className="text-[8px] font-black text-gray-400">STATUS</span>
                                <span className={`text-[10px] font-black uppercase ${s.status === 'COMPLETED' ? 'text-emerald-600' : 'text-yellow-600'}`}>{s.status.replace('_', ' ')}</span>
                             </div>
                             {perf && (
                               <div className="flex flex-col items-center border-l-2 border-black/10 pl-4">
                                  <span className="text-[8px] font-black text-gray-400">SCORELINE</span>
                                  <span className="text-sm font-black mono">{perf.t1.w} - {perf.t2.w}</span>
                               </div>
                             )}
                          </div>

                          <BrutalistButton variant="magenta" compact className="no-print" onClick={() => { setDrillDownSeries(s.id); setScheduleLevel('MATCHES'); }}>Open Matches</BrutalistButton>
                        </div>
                      );
                    })}
                    {masterFixturesData.length === 0 && (
                      <div className="py-20 text-center font-black text-gray-300 uppercase italic">No Series Match These Filters</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {scheduleLevel === 'SERIES' && (
               <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center no-print">
                    <BrutalistButton variant="secondary" compact onClick={() => { setDrillDownRound(null); setScheduleLevel('ROUNDS'); }}>← Back to Rounds</BrutalistButton>
                    <h3 className="bg-black text-white px-4 py-2 brutalist-border font-black uppercase italic">Round {drillDownRound} Pairings</h3>
                  </div>
                  <div className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden">
                     <table className="w-full text-left">
                        <thead className="bg-black text-white font-black uppercase text-[10px] border-b-4 border-black">
                           <tr>
                              <th className="p-4 border-r border-white/20">Pairing & Score</th>
                              <th className="p-4 border-r border-white/20">Performance Summary</th>
                              <th className="p-4 border-r border-white/20 text-center">Points Earned</th>
                              <th className="p-4 text-center">Action</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-black">
                           {tournament.series!.filter(s => s.round === drillDownRound).map(s => {
                              const perf = getSeriesPerformance(s.id);
                              const t1 = tournament.teams.find(t => t.id === s.team1Id);
                              const t2 = tournament.teams.find(t => t.id === s.team2Id);
                              return (
                                <tr key={s.id} className="hover:bg-blue-50 font-black uppercase text-xs transition-colors group bg-white">
                                   <td className="p-4 border-r-2 border-black bg-gray-50">
                                      <div className="flex flex-col gap-1">
                                         <div className="flex justify-between">
                                            <span>{t1?.name}</span>
                                            <span className="bg-black text-white px-1.5">{perf?.t1.w || 0}</span>
                                         </div>
                                         <div className="flex justify-between">
                                            <span>{t2?.name}</span>
                                            <span className="bg-black text-white px-1.5">{perf?.t2.w || 0}</span>
                                         </div>
                                      </div>
                                   </td>
                                   <td className="p-4 border-r-2 border-black">
                                      {perf ? (
                                        <div className="grid grid-cols-2 gap-4 mono text-[10px]">
                                           <div className="space-y-1">
                                              <p className="border-b border-black/10 font-bold">{t1?.shortName}</p>
                                              <p>W:{perf.t1.w} L:{perf.t1.l} D:{perf.t1.d}</p>
                                              <p className={perf.t1.sWin ? 'text-emerald-600' : (perf.t1.sDraw ? 'text-yellow-600' : 'text-gray-400')}>
                                                SERIES: {perf.t1.sWin ? 'WON' : (perf.t1.sDraw ? 'DRAW' : 'LOST')}
                                              </p>
                                           </div>
                                           <div className="space-y-1">
                                              <p className="border-b border-black/10 font-bold">{t2?.shortName}</p>
                                              <p>W:{perf.t2.w} L:{perf.t2.l} D:{perf.t2.d}</p>
                                              <p className={perf.t2.sWin ? 'text-emerald-600' : (perf.t2.sDraw ? 'text-yellow-600' : 'text-gray-400')}>
                                                SERIES: {perf.t2.sWin ? 'WON' : (perf.t2.sDraw ? 'DRAW' : 'LOST')}
                                              </p>
                                           </div>
                                        </div>
                                      ) : 'NOT STARTED'}
                                   </td>
                                   <td className="p-4 border-r-2 border-black text-center">
                                      {perf ? (
                                        <div className="flex flex-col gap-1 mono">
                                           <div className="bg-blue-50 p-1 brutalist-border">{t1?.shortName}: {perf.t1.pts + perf.t1.sPts}</div>
                                           <div className="bg-blue-50 p-1 brutalist-border">{t2?.shortName}: {perf.t2.pts + perf.t2.sPts}</div>
                                        </div>
                                      ) : '--'}
                                   </td>
                                   <td className="p-4 text-center">
                                      <BrutalistButton variant="magenta" compact onClick={() => { setDrillDownSeries(s.id); setScheduleLevel('MATCHES'); }}>Open Matches</BrutalistButton>
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
              <div className="space-y-6 animate-in fade-in">
                <div className="flex justify-between items-center no-print bg-black p-2 brutalist-border">
                   <BrutalistButton variant="secondary" compact onClick={() => setScheduleLevel('SERIES')}>← Back to Series</BrutalistButton>
                   <BrutalistButton variant="success" compact onClick={() => setConfirmingAction({ type: 'ADD_MATCH' })}>+ Add Match</BrutalistButton>
                </div>
                <div className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 font-black uppercase text-[10px] border-b-4 border-black">
                      <tr>
                        <th className="p-5 border-r-2 border-black w-24">Match #</th>
                        <th className="p-5 border-r-2 border-black">Outcome & Winner</th>
                        <th className="p-5 border-r-2 border-black text-center">Points Awarded</th>
                        <th className="p-5 border-r-2 border-black text-center">Status</th>
                        <th className="p-5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                      {tournament.matches.filter(m => m.seriesId === drillDownSeries).map((m, idx) => {
                          const winner = tournament.teams.find(t => t.id === m.winnerId);
                          const pts = getMatchPoints(m);
                          const t1 = tournament.teams.find(t => t.id === m.team1Id);
                          const t2 = tournament.teams.find(t => t.id === m.team2Id);
                          return (
                            <tr key={m.id} className="hover:bg-emerald-50 font-black uppercase text-xs transition-colors group bg-white">
                              <td className="p-5 border-r-2 border-black mono italic bg-gray-50"># {idx+1}</td>
                              <td className="p-5 border-r-2 border-black">
                                 {m.status === 'COMPLETED' ? (
                                    <div className="flex items-center justify-between">
                                      <span className="font-black text-sm">{m.resultType === 'DRAW' ? 'MATCH DRAWN' : (winner?.name + ' WON')}</span>
                                      <span className="text-[10px] text-gray-400 italic">ID: {m.id.split('-').pop()}</span>
                                    </div>
                                 ) : '--'}
                              </td>
                              <td className="p-5 border-r-2 border-black text-center mono">
                                 {m.status === 'COMPLETED' ? (
                                   <div className="flex justify-center gap-3">
                                      <div className="flex flex-col">
                                         <span className="text-[9px] text-gray-500">{t1?.shortName}</span>
                                         <span className="bg-yellow-400 px-1 brutalist-border">{pts.t1 > 0 ? `+${pts.t1}` : pts.t1}</span>
                                      </div>
                                      <div className="flex flex-col">
                                         <span className="text-[9px] text-gray-500">{t2?.shortName}</span>
                                         <span className="bg-yellow-400 px-1 brutalist-border">{pts.t2 > 0 ? `+${pts.t2}` : pts.t2}</span>
                                      </div>
                                   </div>
                                 ) : '--'}
                              </td>
                              <td className="p-5 border-r-2 border-black text-center">
                                 <span className={`px-2 py-1 brutalist-border text-[9px] ${m.status==='COMPLETED'?'bg-emerald-400':'bg-white'}`}>
                                    {m.status}
                                 </span>
                              </td>
                              <td className="p-5 text-center flex items-center justify-center gap-2">
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
          <div className="space-y-6">
            <BrutalistCard title="MASTER RESULTS LOG" variant="white">
              <div className="overflow-x-auto">
                <table className="w-full text-left font-black uppercase text-xs">
                  <thead className="bg-black text-white">
                    <tr>
                      <th className="p-3 border-r border-white/20">Round</th>
                      <th className="p-3 border-r border-white/20">Matchup</th>
                      <th className="p-3 border-r border-white/20">Winner</th>
                      <th className="p-3 border-r border-white/20">Status</th>
                      <th className="p-3">Venue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-black">
                    {tournament.matches.filter(m => m.status === 'COMPLETED').map(m => (
                      <tr key={m.id} className="bg-white hover:bg-emerald-50 transition-colors">
                        <td className="p-3 border-r-2 border-black text-center mono bg-gray-50">{m.round}</td>
                        <td className="p-3 border-r-2 border-black italic">
                          {tournament.teams.find(t => t.id === m.team1Id)?.name} v {tournament.teams.find(t => t.id === m.team2Id)?.name}
                        </td>
                        <td className="p-3 border-r-2 border-black font-black text-emerald-700">
                          {m.resultType === 'DRAW' ? 'DRAW' : tournament.teams.find(t => t.id === m.winnerId)?.name}
                        </td>
                        <td className="p-3 border-r-2 border-black text-center">
                          <span className="bg-black text-white px-2 py-0.5 text-[9px]">COMPLETED</span>
                        </td>
                        <td className="p-3 text-[10px] text-gray-500">
                          {tournament.stadiums.find(s => s.id === m.venueId)?.name || 'NEUTRAL'}
                        </td>
                      </tr>
                    ))}
                    {tournament.matches.filter(m => m.status === 'COMPLETED').length === 0 && (
                      <tr><td colSpan={5} className="p-20 text-center font-bold text-gray-300 uppercase italic">No completed matches found in database.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </BrutalistCard>
          </div>
        )}

        {/* POINTS TAB - ADVANCED POINT TABLE */}
        {activeTab === 'POINTS' && (
           <div className="space-y-8">
              <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print">
                 <div className="bg-black text-white p-6 brutalist-border shadow-[8px_8px_0px_#facc15] flex-1 w-full">
                    <h2 className="text-4xl md:text-5xl font-black uppercase italic leading-none">WTC Point Table</h2>
                    <p className="text-[10px] mt-2 mono text-yellow-400">QUALIFICATION STANDINGS V2.6</p>
                 </div>
                 <div className="flex gap-2">
                    <BrutalistButton variant="primary" onClick={toggleAllColumns}>
                       {Object.values(visibleColumns).every(v => v) ? 'HIDE ALL EXTRA' : 'SHOW FULL TABLE'}
                    </BrutalistButton>
                    <BrutalistButton variant="accent" onClick={() => handleSnap(pointsTableRef, `WTC_Table_${tournament.name}.png`)}>SNAP PNG</BrutalistButton>
                 </div>
              </div>

              <div ref={pointsTableRef} className="bg-white brutalist-border shadow-[15px_15px_0px_black] overflow-x-auto p-4">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-100 font-black uppercase text-[9px] border-b-4 border-black">
                    <tr>
                      <th className="p-3 border-r-2 border-black text-center">RANK</th>
                      <th className="p-3 border-r-2 border-black min-w-[200px]">TEAM</th>
                      {visibleColumns.seriesPlayed && <th className="p-3 border-r-2 border-black text-center">S.PLY</th>}
                      {visibleColumns.seriesCompleted && <th className="p-3 border-r-2 border-black text-center">S.COM</th>}
                      {visibleColumns.seriesLeft && <th className="p-3 border-r-2 border-black text-center">S.LFT</th>}
                      {visibleColumns.matchesPlayed && <th className="p-3 border-r-2 border-black text-center">MP</th>}
                      {visibleColumns.matchesWon && <th className="p-3 border-r-2 border-black text-center">W</th>}
                      {visibleColumns.matchesDrawn && <th className="p-3 border-r-2 border-black text-center">D</th>}
                      {visibleColumns.matchesLost && <th className="p-3 border-r-2 border-black text-center">L</th>}
                      {visibleColumns.totalPoints && <th className="p-3 border-r-2 border-black text-center bg-blue-50">T.PTS</th>}
                      {visibleColumns.maxPoints && <th className="p-3 border-r-2 border-black text-center">MAX</th>}
                      {visibleColumns.pct && <th className="p-3 border-r-2 border-black text-center bg-yellow-400 text-lg">PCT %</th>}
                      {visibleColumns.penalties && <th className="p-3 border-r-2 border-black text-center text-rose-600">PEN</th>}
                      {visibleColumns.finalPoints && <th className="p-3 border-r-2 border-black text-center bg-emerald-50">FINAL</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((t, idx) => {
                      const finalPoints = t.totalPoints - t.penaltyPoints;
                      const hasPenalty = t.penaltyPoints > 0;
                      return (
                        <tr key={t.id} className="font-black uppercase text-xs border-b-2 border-black bg-white hover:bg-yellow-50 transition-colors">
                          <td className="p-3 border-r-2 border-black mono text-center bg-gray-50 text-xl">#{idx+1}</td>
                          <td className="p-3 border-r-2 border-black">
                             <div className="flex items-center gap-3">
                                {t.logoUrl ? (
                                  <img src={t.logoUrl} className="w-8 h-8 object-contain brutalist-border p-0.5 bg-white" alt="" />
                                ) : (
                                  <div className="w-8 h-8 bg-black flex items-center justify-center text-[10px] text-white font-black">{t.shortName}</div>
                                )}
                                <div className="flex flex-col">
                                   <span className="text-sm leading-none">{t.name}</span>
                                   <span className="text-[9px] text-gray-400 mono">OWNER: {t.owner || 'N/A'}</span>
                                </div>
                             </div>
                          </td>
                          {visibleColumns.seriesPlayed && <td className="p-3 border-r-2 border-black mono text-center">{t.seriesPlayed}</td>}
                          {visibleColumns.seriesCompleted && <td className="p-3 border-r-2 border-black mono text-center">{t.seriesCompleted || 0}</td>}
                          {visibleColumns.seriesLeft && <td className="p-3 border-r-2 border-black mono text-center">{(t as any).seriesTotal - ((t as any).seriesCompleted || 0)}</td>}
                          {visibleColumns.matchesPlayed && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesPlayed}</td>}
                          {visibleColumns.matchesWon && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesWon}</td>}
                          {visibleColumns.matchesDrawn && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesDrawn}</td>}
                          {visibleColumns.matchesLost && <td className="p-3 border-r-2 border-black mono text-center">{t.matchesLost}</td>}
                          {visibleColumns.totalPoints && (
                             <td className={`p-3 border-r-2 border-black mono text-center bg-blue-50/30 text-lg ${hasPenalty ? 'text-rose-600 font-black' : ''}`}>
                                {t.totalPoints}
                             </td>
                          )}
                          {visibleColumns.maxPoints && <td className="p-3 border-r-2 border-black mono text-center text-gray-400">{(t as any).maxPossiblePoints}</td>}
                          {visibleColumns.pct && (
                            <td className="p-3 border-r-2 border-black mono text-center bg-yellow-400/20 text-2xl italic">
                              {t.pct.toFixed(2)}%
                            </td>
                          )}
                          {visibleColumns.penalties && <td className="p-3 border-r-2 border-black mono text-center text-rose-600">-{t.penaltyPoints}</td>}
                          {visibleColumns.finalPoints && <td className="p-3 border-r-2 border-black mono text-center bg-emerald-50/50 text-xl">{finalPoints}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Column Control Panel */}
              <BrutalistCard title="TABLE COLUMN CONFIGURATION" variant="white" compact>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 no-print">
                  {Object.keys(visibleColumns).map(colKey => (
                    <div key={colKey} className="flex items-center gap-2 bg-gray-50 p-2 brutalist-border">
                      <input 
                        type="checkbox" 
                        id={`toggle-${colKey}`}
                        checked={visibleColumns[colKey as keyof typeof visibleColumns]}
                        onChange={() => setVisibleColumns(prev => ({ ...prev, [colKey]: !prev[colKey as keyof typeof visibleColumns] }))}
                        className="w-5 h-5 accent-black cursor-pointer"
                      />
                      <label htmlFor={`toggle-${colKey}`} className="text-[10px] font-black uppercase cursor-pointer select-none truncate">
                        {colKey.replace(/([A-Z])/g, ' $1')}
                      </label>
                    </div>
                  ))}
                </div>
              </BrutalistCard>
           </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'SETTINGS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <BrutalistCard title="SYSTEM PENALTIES" variant="pink">
               <div className="space-y-4">
                 <p className="mono text-[10px] uppercase font-bold text-rose-600">Apply points deduction for over-rate or violations.</p>
                 <select className="w-full brutalist-border p-3 font-black uppercase bg-white text-black outline-none" value={penaltyForm.teamId} onChange={e => setPenaltyForm({...penaltyForm, teamId: e.target.value})}>
                   <option value="">SELECT TEAM</option>
                   {tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                 </select>
                 <div className="flex gap-2">
                   <input type="number" placeholder="PTS" className="w-24 brutalist-border p-3 font-black bg-white" value={penaltyForm.points || ''} onChange={e => setPenaltyForm({...penaltyForm, points: parseInt(e.target.value)})}/>
                   <input type="text" placeholder="REASON" className="flex-1 brutalist-border p-3 font-black uppercase text-xs" value={penaltyForm.reason} onChange={e => setPenaltyForm({...fixtureStatus, reason: e.target.value} as any)}/>
                 </div>
                 <BrutalistButton variant="danger" className="w-full py-4" onClick={handleAddPenalty}>DEDUCT POINTS</BrutalistButton>

                 <div className="mt-6 border-t-2 border-black pt-4 space-y-2">
                   {tournament.penalties.map(p => (
                     <div key={p.id} className="bg-white p-2 brutalist-border flex justify-between items-center">
                       <div className="text-[10px] font-black uppercase">
                         <span className="text-rose-600">{tournament.teams.find(t => t.id === p.teamId)?.shortName}</span>
                         <span className="mx-2">- {p.points} PTS</span>
                         <span className="text-gray-400 italic">({p.reason})</span>
                       </div>
                       <button className="text-rose-500 font-black" onClick={() => {
                          const updated = tournament.penalties.filter(pen => pen.id !== p.id);
                          onUpdateTournament?.({...tournament, penalties: updated});
                       }}>×</button>
                     </div>
                   ))}
                   {tournament.penalties.length === 0 && <p className="text-center font-bold text-gray-300 uppercase text-[9px]">No penalties applied.</p>}
                 </div>
               </div>
            </BrutalistCard>
            
            <BrutalistCard title="DANGER ZONE" variant="white">
               <div className="space-y-6">
                 <div className="p-4 bg-rose-50 brutalist-border">
                    <h5 className="font-black uppercase text-sm mb-1 text-rose-600 underline">Reset Tournament Results</h5>
                    <p className="text-[9px] mb-4 mono uppercase font-bold">This will wipe all completed matches while keeping teams and venues.</p>
                    <BrutalistButton variant="danger" compact onClick={() => {
                      if(confirm("DANGER: WIPE ALL RESULTS?")) {
                        const updated = tournament.matches.map(m => ({...m, status: 'NOT_STARTED' as const, winnerId: undefined, resultType: undefined}));
                        onUpdateTournament?.({...tournament, matches: updated});
                      }
                    }}>WIPE ALL RESULTS</BrutalistButton>
                 </div>
               </div>
            </BrutalistCard>
          </div>
        )}

      </div>

      {/* MODALS */}
      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 no-print animate-in duration-200">
          <BrutalistCard title="COMMIT WTC RESULT" className="max-w-md w-full bg-white">
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id, name: tournament.teams.find(t => t.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id)?.name },
                  { id: tournament.matches.find(m => m.id === confirmingAction.matchId)?.team2Id, name: tournament.teams.find(t => t.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team2Id)?.name }
                ].map(team => (
                  <button key={team.id} onClick={() => setResultForm({...resultForm, winnerId: team.id!, resultType: team.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id ? 'T1_WIN' : 'T2_WIN'})}
                    className={`p-5 brutalist-border font-black uppercase transition-all ${resultForm.winnerId === team.id ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}
                  >
                    {team.name} WIN
                  </button>
                ))}
                <button onClick={() => setResultForm({...resultForm, winnerId: '', resultType: 'DRAW'})} className={`p-5 brutalist-border font-black uppercase transition-all ${resultForm.resultType === 'DRAW' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}>DRAW / TIE</button>
              </div>
              <BrutalistButton variant="success" className="w-full py-4 text-xl" onClick={() => {
                   const updatedMatches = tournament.matches.map(m => m.id === confirmingAction.matchId ? { ...m, status: 'COMPLETED' as const, resultType: resultForm.resultType, winnerId: resultForm.winnerId } : m);
                   const updatedSeries = (tournament.series || []).map(s => {
                    const sMs = updatedMatches.filter(m => m.seriesId === s.id);
                    const statusStr = sMs.every(m => m.status === 'COMPLETED') ? 'COMPLETED' : (sMs.some(m => m.status === 'COMPLETED') ? 'IN_PROGRESS' : 'NOT_STARTED');
                    return { ...s, status: statusStr as SeriesGroup['status'] };
                  });
                  onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries, status: 'ONGOING' });
                  setConfirmingAction(null);
                }}>COMMIT RESULT</BrutalistButton>
              <BrutalistButton variant="secondary" className="w-full py-2" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton>
            </div>
          </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'ADD_MATCH' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 animate-in fade-in">
          <BrutalistCard title="ADD NEW WTC MATCH" className="max-w-md w-full bg-white">
            <div className="space-y-4 py-4">
              <label className="block text-[10px] font-black uppercase mb-1">Select Venue</label>
              <select className="w-full brutalist-border p-3 font-black uppercase bg-white text-black outline-none" value={addMatchVenue} onChange={e => setAddMatchVenue(e.target.value)}>
                {tournament.stadiums.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="flex gap-2">
                <BrutalistButton variant="success" className="flex-1 py-4" onClick={handleAddMatch}>CONFIRM ADD</BrutalistButton>
                <BrutalistButton variant="secondary" className="flex-1 py-4" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'ADMIN_UNLOCK' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4 no-print animate-in">
          <BrutalistCard title="🔓 UNLOCK WTC RESULT" className="max-w-md w-full bg-white border-rose-600">
            <div className="space-y-4">
              <p className="font-black uppercase text-xs text-rose-600 text-center">Verify tournament name to unlock result.</p>
              <input placeholder="TOURNAMENT NAME" className="w-full brutalist-border p-4 font-black uppercase bg-white text-black outline-none border-rose-600 text-center text-xl" value={securityInput} onChange={e => setSecurityInput(e.target.value)} />
              <div className="flex gap-2">
                <BrutalistButton variant="danger" className="flex-1 py-3" onClick={() => {
                   if (securityInput.trim().toLowerCase() !== tournament.name.trim().toLowerCase()) return alert("Verification failed.");
                   const updatedMatches = tournament.matches.map(m => m.id === confirmingAction?.matchId ? { ...m, status: 'NOT_STARTED' as const, resultType: undefined, winnerId: undefined } : m);
                   const updatedSeries = (tournament.series || []).map(s => {
                    const sMs = updatedMatches.filter(m => m.seriesId === s.id);
                    const statusStr = sMs.every(m => m.status === 'COMPLETED') ? 'COMPLETED' : (sMs.some(m => m.status === 'COMPLETED') ? 'IN_PROGRESS' : 'NOT_STARTED');
                    return { ...s, status: statusStr as SeriesGroup['status'] };
                  });
                  onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries });
                  setConfirmingAction(null); setSecurityInput('');
                }}>UNLOCK</BrutalistButton>
                <BrutalistButton variant="secondary" className="flex-1 py-3" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateY(-5px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-in { animation: slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @media print { .no-print { display: none !important; } }
      `}</style>
    </div>
  );
};

export default TournamentWorkspace;
