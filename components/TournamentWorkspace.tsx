import React, { useState, useMemo, useRef } from 'react';
import { Tournament, WorkspaceTab, Team, Match, MatchResultType, SeriesGroup, Stadium, PenaltyRecord } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';
import { toPng } from 'html-to-image';

interface TournamentWorkspaceProps {
  tournament: Tournament;
  onExit: () => void;
  onUpdateTournament?: (updated: Tournament) => void;
}

type ScheduleLevel = 'OVERVIEW' | 'DISTRIBUTION' | 'ROUNDS' | 'SERIES' | 'MATCHES' | 'FULL_SCHEDULE';

const TournamentWorkspace: React.FC<TournamentWorkspaceProps> = ({ tournament, onExit, onUpdateTournament }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('DASHBOARD');
  const [scheduleLevel, setScheduleLevel] = useState<ScheduleLevel>('OVERVIEW');
  const [drillDownRound, setDrillDownRound] = useState<number | null>(null);
  const [drillDownSeries, setDrillDownSeries] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [wrapTeamNames, setWrapTeamNames] = useState(false);
  
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [tempTournamentName, setTempTournamentName] = useState(tournament.name);
  const [securityInput, setSecurityInput] = useState('');

  // Standardized Refs for Capture Engine
  const pointsTableRef = useRef<HTMLDivElement>(null);
  const fullScheduleRef = useRef<HTMLDivElement>(null);
  const roundCaptureRef = useRef<HTMLDivElement>(null);
  const distributionTableRef = useRef<HTMLDivElement>(null);
  
  const [penaltyForm, setPenaltyForm] = useState({
    teamId: '',
    points: 0,
    reason: ''
  });

  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    standing: true,
    team: true,
    sPlayed: false,
    sDone: false,
    sLeft: false,
    mPlayed: true,
    mWon: true,
    mDrawn: true,
    mLost: true,
    totalPts: true,
    maxPts: true,
    pct: true,
    penalty: true,
    finalPts: false
  });

  const [confirmingAction, setConfirmingAction] = useState<{ 
    type: 'SAVE_RESULT' | 'REGENERATE_SCHEDULE' | 'ADMIN_UNLOCK' | 'DELETE_PENALTY' | 'LOCK_TOURNAMENT' | 'ADD_MATCH' | 'REMOVE_MATCH', 
    matchId?: string,
    penaltyId?: string,
    seriesId?: string
  } | null>(null);

  const [resultForm, setResultForm] = useState({
    winnerId: '',
    resultType: 'DRAW' as MatchResultType,
    notes: ''
  });

  const seriesRange = useMemo(() => {
    const raw = tournament.config.seriesLength || '3-5';
    const parts = raw.split('-').map(p => parseInt(p.replace(/\D/g, ''))).filter(n => !isNaN(n));
    const min = parts[0] || 1;
    const max = parts[1] || min;
    return { min, max };
  }, [tournament.config.seriesLength]);

  /**
   * Refined Standardized Capture Engine
   * Fixes truncation on wide tables by calculating true scroll dimensions.
   */
  const handleDownloadImage = async (ref: React.RefObject<HTMLDivElement | null>, fileName: string) => {
    if (!ref.current || isCapturing) return;
    
    setIsCapturing(true);
    await new Promise(r => setTimeout(r, 400)); // UI Grace period

    try {
      const el = ref.current;
      
      // Force loading of all images (logos, etc.)
      const images = Array.from(el.getElementsByTagName('img')) as HTMLImageElement[];
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // Calculate the true dimensions for wide content
      const width = el.scrollWidth;
      const height = el.scrollHeight;

      const options = {
        backgroundColor: '#ffffff',
        width,
        height,
        pixelRatio: (width * height > 4500000) ? 1 : 2, 
        cacheBust: true,
        style: {
          transform: 'none',
          margin: '0',
          padding: '40px',
          width: `${width}px`,
          height: `${height}px`,
          position: 'relative',
          left: '0',
          top: '0',
          overflow: 'visible',
          display: 'block'
        },
        onClone: (clonedDoc: Document) => {
          const stickyNodes = clonedDoc.querySelectorAll('*');
          stickyNodes.forEach((node) => {
            const style = (node as HTMLElement).style;
            if (style && style.position === 'sticky') {
              style.position = 'static';
            }
          });
        }
      };

      const dataUrl = await toPng(el, options as any);
      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Capture Failure:', err);
      alert(`DOWNLOAD ERROR: ${err?.message || 'Check browser console.'}`);
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAddPenalty = () => {
    if (!penaltyForm.teamId || penaltyForm.points <= 0 || !penaltyForm.reason.trim()) {
      return alert("Complete penalty details required.");
    }
    const newPenalty: PenaltyRecord = {
      id: Date.now().toString(),
      teamId: penaltyForm.teamId,
      points: penaltyForm.points,
      reason: penaltyForm.reason,
      date: new Date().toLocaleDateString()
    };
    onUpdateTournament?.({ ...tournament, penalties: [...tournament.penalties, newPenalty] });
    setPenaltyForm({ teamId: '', points: 0, reason: '' });
  };

  const handleRemovePenalty = (id: string) => {
    onUpdateTournament?.({ ...tournament, penalties: tournament.penalties.filter(p => p.id !== id) });
  };

  const getDetailedSeriesStats = (seriesId: string) => {
    const s = tournament.series?.find(ser => ser.id === seriesId);
    if (!s) return null;
    const ms = tournament.matches.filter(m => m.seriesId === seriesId);
    const completed = ms.filter(m => m.status === 'COMPLETED');
    const team1 = tournament.teams.find(t => t.id === s.team1Id);
    const team2 = tournament.teams.find(t => t.id === s.team2Id);
    const t1Wins = completed.filter(m => m.winnerId === s.team1Id).length;
    const t2Wins = completed.filter(m => m.winnerId === s.team2Id).length;
    const t1Losses = completed.filter(m => m.winnerId === s.team2Id).length;
    const draws = completed.filter(m => m.resultType === 'DRAW' || m.resultType === 'TIE' || m.resultType === 'NO_RESULT').length;
    
    let winnerName = 'PENDING';
    if (s.status === 'COMPLETED') {
      if (t1Wins > t2Wins) winnerName = team1?.name || 'T1';
      else if (t2Wins > t1Wins) winnerName = team2?.name || 'T2';
      else if (completed.length > 0) winnerName = 'DRAWN';
    }
    return { team1, team2, t1Wins, t2Wins, t1Losses, draws, winnerName, totalMatches: ms.length, doneMatches: completed.length };
  };

  const standings = useMemo(() => {
    const stats: Record<string, Team & { playedFor: number; sWin: number; sLoss: number; sDraw: number; sDone: number; sPlayed: number }> = {};
    tournament.teams.forEach(t => {
      const playerSeries = tournament.series?.filter(s => s.team1Id === t.id || s.team2Id === t.id) || [];
      stats[t.id] = { 
        ...t, 
        seriesPlayed: playerSeries.length, 
        matchesPlayed: 0, matchesWon: 0, matchesLost: 0, matchesDrawn: 0, 
        matchesTie: 0, matchesNR: 0, basePoints: 0, bonusPoints: 0, penaltyPoints: 0, totalPoints: 0, pct: 0,
        playedFor: 0, sWin: 0, sLoss: 0, sDraw: 0, sDone: 0, sPlayed: playerSeries.length
      };
    });

    tournament.matches.filter(m => m.status === 'COMPLETED').forEach(m => {
      const t1 = stats[m.team1Id];
      const t2 = stats[m.team2Id];
      if (!t1 || !t2) return;
      t1.matchesPlayed++; t2.matchesPlayed++;
      t1.playedFor += tournament.config.pointsForWin; t2.playedFor += tournament.config.pointsForWin;
      if (m.resultType === 'T1_WIN') { t1.matchesWon++; t1.basePoints += tournament.config.pointsForWin; t2.matchesLost++; }
      else if (m.resultType === 'T2_WIN') { t2.matchesWon++; t2.basePoints += tournament.config.pointsForWin; t1.matchesLost++; }
      else if (m.resultType === 'DRAW' || m.resultType === 'TIE') { t1.matchesDrawn++; t1.basePoints += tournament.config.pointsForDraw; t2.matchesDrawn++; t2.basePoints += tournament.config.pointsForDraw; }
    });

    tournament.series?.filter(s => s.status === 'COMPLETED').forEach(s => {
      const t1 = stats[s.team1Id];
      const t2 = stats[s.team2Id];
      if (!t1 || !t2) return;
      t1.sDone++; t2.sDone++;
      const sMs = tournament.matches.filter(m => m.seriesId === s.id && m.status === 'COMPLETED');
      const t1W = sMs.filter(m => m.winnerId === s.team1Id).length;
      const t2W = sMs.filter(m => m.winnerId === s.team2Id).length;
      if (t1W > t2W) { t1.sWin++; } else if (t2W > t1W) { t2.sWin++; } else if (sMs.length > 0) { t1.sDraw++; t2.sDraw++; }
      if (tournament.config.countSeriesBonus) {
        t1.playedFor += tournament.config.pointsForSeriesWin; t2.playedFor += tournament.config.pointsForSeriesWin;
        if (t1W > t2W) t1.bonusPoints += tournament.config.pointsForSeriesWin;
        else if (t2W > t1W) t2.bonusPoints += tournament.config.pointsForSeriesWin;
        else if (sMs.length > 0) { t1.bonusPoints += tournament.config.pointsForSeriesDraw; t2.bonusPoints += tournament.config.pointsForSeriesDraw; }
      }
    });

    tournament.penalties.forEach(p => { if (stats[p.teamId]) stats[p.teamId].penaltyPoints += Math.abs(p.points); });

    return Object.values(stats).map(t => {
      t.totalPoints = (t.basePoints + t.bonusPoints) - t.penaltyPoints;
      t.pct = t.playedFor > 0 ? (t.totalPoints / t.playedFor) * 100 : 0;
      return t;
    }).sort((a, b) => (b.pct - a.pct) || (b.totalPoints - a.totalPoints));
  }, [tournament]);

  const roundsData = useMemo(() => {
    if (!tournament.series) return [];
    const rMap: Record<number, SeriesGroup[]> = {};
    tournament.series.forEach(s => { if (!rMap[s.round]) rMap[s.round] = []; rMap[s.round].push(s); });
    return Object.keys(rMap).map(Number).sort((a, b) => a - b).map(rNum => {
      const sInR = rMap[rNum];
      const statusValue = sInR.every(s => s.status === 'COMPLETED') ? 'COMPLETED' : (sInR.some(s => s.status !== 'NOT_STARTED') ? 'IN_PROGRESS' : 'NOT_STARTED');
      return { num: rNum, series: sInR, status: statusValue as SeriesGroup['status'], matchCount: sInR.reduce((sum, s) => sum + s.matchIds.length, 0) };
    });
  }, [tournament.series]);

  const toggleColumn = (col: string) => { setColumnVisibility(prev => ({ ...prev, [col]: !prev[col] })); };
  const showFullTable = () => { const all: Record<string, boolean> = {}; Object.keys(columnVisibility).forEach(k => all[k] = true); setColumnVisibility(all); };

  const generateTestSchedule = () => {
    const baseTeams = tournament.teams.filter(t => t.id !== 'BYE' && t.name.trim() !== '');
    if (baseTeams.length < 2) return alert("Min 2 teams required!");
    const matches: Match[] = []; const series: SeriesGroup[] = []; const teamIds = baseTeams.map(t => t.id);
    if (teamIds.length % 2 !== 0) teamIds.push('BYE');
    const numRounds = teamIds.length - 1; const venues = tournament.stadiums.length > 0 ? tournament.stadiums : [{ id: 'V1', name: 'Standard' }];
    const rotated = [...teamIds];
    for (let r = 0; r < numRounds; r++) {
      for (let i = 0; i < rotated.length / 2; i++) {
        const t1 = rotated[i]; const t2 = rotated[rotated.length - 1 - i];
        if (t1 !== 'BYE' && t2 !== 'BYE') {
          const sId = `SERIES-R${r + 1}-P${i + 1}`; const mIds: string[] = [];
          const chosenLen = Math.floor(Math.random() * (seriesRange.max - seriesRange.min + 1)) + seriesRange.min;
          for (let m = 0; m < chosenLen; m++) {
            const mId = `MATCH-${sId}-G${m + 1}`; mIds.push(mId);
            matches.push({ id: mId, round: r + 1, seriesId: sId, team1Id: t1, team2Id: t2, venueId: venues[m % venues.length].id, status: 'NOT_STARTED' });
          }
          series.push({ id: sId, round: r + 1, team1Id: t1, team2Id: t2, status: 'NOT_STARTED', matchIds: mIds });
        }
      }
      rotated.splice(1, 0, rotated.pop()!);
    }
    onUpdateTournament?.({ ...tournament, matches, series, status: 'ONGOING' });
    setScheduleLevel('OVERVIEW');
  };

  return (
    <div className="space-y-8 pb-32">
      {isCapturing && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="text-center space-y-6 p-10 brutalist-border bg-white shadow-[10px_10px_0px_white]">
            <div className="w-16 h-16 border-8 border-black border-t-yellow-400 rounded-full animate-spin mx-auto"></div>
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">GENERATING EXPORT...</h2>
            <p className="mono text-xs font-bold uppercase">Processing high-fidelity data capture. Please wait.</p>
          </div>
        </div>
      )}

      <BrutalistCard variant="white" className="p-0 overflow-hidden border-4 border-black no-print">
        <div className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white brutalist-border p-2 transform rotate-3 flex-shrink-0">
              <img src={tournament.header.siteLogoUrl} className="max-h-full mx-auto" alt="Logo" crossOrigin="anonymous" />
            </div>
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tighter leading-none">{tournament.name}</h1>
              <p className="mono text-[8px] tracking-widest text-yellow-400 font-bold uppercase mt-1">ADMIN CONSOLE ACTIVE</p>
            </div>
          </div>
          <BrutalistButton variant="danger" onClick={onExit} className="px-8">EXIT WORKSPACE</BrutalistButton>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 border-t-4 border-black bg-white">
          {['DASHBOARD', 'INFO', 'SCHEDULE', 'RESULTS', 'POINTS', 'SETTINGS'].map((tab) => (
            <button key={tab} onClick={() => { setActiveTab(tab as WorkspaceTab); setScheduleLevel('OVERVIEW'); setSelectedTeamId(null); }} 
              className={`p-4 font-black uppercase text-xs border-r-4 border-black last:border-r-0 transition-all ${activeTab === tab ? 'bg-yellow-400 text-black translate-x-0.5 translate-y-0.5 shadow-none' : 'bg-white text-black hover:bg-gray-100'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </BrutalistCard>

      <div className="animate-in fade-in duration-500">
        {activeTab === 'POINTS' && (
           <div className="space-y-8 animate-in fade-in">
              <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print">
                 <div className="bg-black text-white p-6 brutalist-border shadow-[8px_8px_0px_#facc15] flex-1">
                    <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none">Standings</h2>
                    <p className="mono text-[10px] text-yellow-400 mt-2 font-black uppercase">Official Season Ranking Board</p>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    <BrutalistButton variant="magenta" onClick={() => setWrapTeamNames(!wrapTeamNames)}>
                      {wrapTeamNames ? 'Disable Warp' : 'Warp (Wrap) Text'}
                    </BrutalistButton>
                    <BrutalistButton variant="primary" onClick={showFullTable}>Full Stats</BrutalistButton>
                    <BrutalistButton variant="accent" onClick={() => handleDownloadImage(pointsTableRef, `${tournament.name}_Standings`)}>Download PNG</BrutalistButton>
                 </div>
              </div>

              <div className="bg-white brutalist-border shadow-[15px_15px_0px_black] overflow-x-auto relative group/scroll transition-all">
                <div ref={pointsTableRef} className="bg-white inline-block min-w-full p-6">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead className="bg-gray-100 font-black uppercase text-[10px] border-b-4 border-black sticky top-0 z-20">
                      <tr className="capture-static">
                        {columnVisibility.standing && <th className="p-4 border-r-2 border-black w-16 text-center">STND</th>}
                        {columnVisibility.team && <th className={`p-4 border-r-2 border-black ${wrapTeamNames ? 'w-48' : 'w-px whitespace-nowrap'}`}>TEAM IDENTITY</th>}
                        {columnVisibility.sPlayed && <th className="p-4 border-r-2 border-black text-center w-16">S.PLD</th>}
                        {columnVisibility.sDone && <th className="p-4 border-r-2 border-black text-center w-16 text-emerald-600">S.CON</th>}
                        {columnVisibility.mPlayed && <th className="p-4 border-r-2 border-black text-center w-16">M.PLD</th>}
                        {columnVisibility.mWon && <th className="p-4 border-r-2 border-black text-center w-16 text-emerald-600">WON</th>}
                        {columnVisibility.mDrawn && <th className="p-4 border-r-2 border-black text-center w-16 text-sky-600">DRW</th>}
                        {columnVisibility.mLost && <th className="p-4 border-r-2 border-black text-center w-16 text-rose-600">LST</th>}
                        {columnVisibility.totalPts && <th className="p-4 border-r-2 border-black text-center w-24">PTS</th>}
                        {columnVisibility.pct && <th className="p-4 border-r-2 border-black text-center bg-yellow-400 text-black w-24">PCT %</th>}
                        {columnVisibility.penalty && <th className="p-4 border-r-2 border-black text-center w-16 text-rose-500">PEN</th>}
                        {columnVisibility.finalPts && <th className="p-4 border-r-2 border-black text-center w-24 bg-black text-white">FINAL</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                      {standings.map((t, idx) => (
                        <tr key={t.id} className={`hover:bg-yellow-50 font-black uppercase text-sm transition-all group ${idx < 2 ? 'bg-emerald-50' : 'bg-white'}`}>
                          {columnVisibility.standing && <td className="p-4 border-r-2 border-black mono text-center bg-gray-50 text-2xl italic">#{idx + 1}</td>}
                          {columnVisibility.team && (
                            <td className={`p-4 border-r-2 border-black ${wrapTeamNames ? 'w-48 whitespace-normal' : 'whitespace-nowrap w-px min-w-max'} cursor-pointer`} onClick={() => setSelectedTeamId(t.id)}>
                              <div className="flex items-center gap-4 w-fit hover:translate-x-1 transition-transform pr-6">
                                <div className="w-10 h-10 brutalist-border bg-white p-1 transform -rotate-3 flex-shrink-0">
                                  <img src={t.logoUrl || ''} className="max-h-full mx-auto" alt="Logo" crossOrigin="anonymous" />
                                </div>
                                <span className={`text-lg tracking-tighter ${wrapTeamNames ? 'leading-none' : 'whitespace-nowrap'} underline decoration-dotted decoration-2 underline-offset-4`}>{t.name}</span>
                              </div>
                            </td>
                          )}
                          {columnVisibility.sPlayed && <td className="p-4 border-r-2 border-black mono text-center opacity-60">{t.sPlayed}</td>}
                          {columnVisibility.sDone && <td className="p-4 border-r-2 border-black mono text-center text-emerald-600">{t.sDone}</td>}
                          {columnVisibility.mPlayed && <td className="p-4 border-r-2 border-black mono text-center bg-gray-50/50">{t.matchesPlayed}</td>}
                          {columnVisibility.mWon && <td className="p-4 border-r-2 border-black mono text-center text-emerald-600">{t.matchesWon}</td>}
                          {columnVisibility.mDrawn && <td className="p-4 border-r-2 border-black mono text-center text-sky-600">{t.matchesDrawn}</td>}
                          {columnVisibility.mLost && <td className="p-4 border-r-2 border-black mono text-center text-rose-600">{t.matchesLost}</td>}
                          {columnVisibility.totalPts && <td className="p-4 border-r-2 border-black mono text-center font-black text-xl">{t.basePoints + t.bonusPoints}</td>}
                          {columnVisibility.pct && <td className="p-4 border-r-2 border-black mono text-center font-black bg-yellow-400/20 text-3xl italic tracking-tighter">{t.pct.toFixed(2)}%</td>}
                          {columnVisibility.penalty && <td className="p-4 border-r-2 border-black mono text-center text-rose-500">-{t.penaltyPoints}</td>}
                          {columnVisibility.finalPts && <td className="p-4 border-r-2 border-black mono text-center font-black text-2xl bg-black text-white">{t.totalPoints}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
           </div>
        )}

        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
            <div className="bg-black p-4 brutalist-border text-white flex flex-wrap justify-between items-center gap-4 no-print shadow-[6px_6px_0px_black]">
                <div className="flex gap-4 font-black text-[12px] uppercase overflow-x-auto pb-2">
                   <button onClick={() => setScheduleLevel('OVERVIEW')} className={scheduleLevel === 'OVERVIEW' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'hover:text-yellow-200'}>1. OVERVIEW</button>
                   <button onClick={() => setScheduleLevel('DISTRIBUTION')} className={scheduleLevel === 'DISTRIBUTION' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'hover:text-yellow-200'}>2. MATRIX LOG</button>
                   <button onClick={() => setScheduleLevel('ROUNDS')} className={scheduleLevel === 'ROUNDS' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'hover:text-yellow-200'}>3. ROUNDS</button>
                   <button onClick={() => setScheduleLevel('FULL_SCHEDULE')} className={scheduleLevel === 'FULL_SCHEDULE' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'hover:text-yellow-200'}>4. FULL SCHEDULE</button>
                </div>
                <div className="flex gap-3">
                  {(!tournament.matches || tournament.matches.length === 0) ? 
                    <BrutalistButton variant="success" compact onClick={generateTestSchedule}>Generate Schedule</BrutalistButton> : 
                    <BrutalistButton variant="danger" compact onClick={() => setConfirmingAction({ type: 'REGENERATE_SCHEDULE' })}>Reset Season</BrutalistButton>
                  }
                </div>
            </div>

            {scheduleLevel === 'DISTRIBUTION' && (
               <div className="space-y-8 animate-in fade-in">
                  <div className="flex justify-between items-center no-print bg-black p-4 brutalist-border text-white">
                    <h3 className="font-black uppercase italic">Matchup Distribution Matrix</h3>
                    <BrutalistButton variant="magenta" compact onClick={() => handleDownloadImage(distributionTableRef, `${tournament.name}_Matrix`)}>Download Matrix PNG</BrutalistButton>
                  </div>
                  <div ref={distributionTableRef} className="bg-white brutalist-border shadow-[15px_15px_0px_black] overflow-x-auto relative">
                    <div className="bg-white inline-block p-10">
                      <table className="border-collapse">
                        <thead>
                            <tr className="capture-static">
                              <th className="p-2 border-2 border-black bg-gray-100 min-w-[120px]"></th>
                              {tournament.teams.filter(t => t.id !== 'BYE').map(t => (
                                  <th key={t.id} className="p-2 border-2 border-black bg-black text-white text-[9px] uppercase font-black vertical-text h-32">
                                    <div className="flex flex-col items-center gap-2">
                                      <img src={t.logoUrl} className="w-6 h-6 object-contain bg-white p-0.5 border border-white" alt="" crossOrigin="anonymous" />
                                      {t.name}
                                    </div>
                                  </th>
                              ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tournament.teams.filter(t => t.id !== 'BYE').map(t1 => (
                              <tr key={t1.id}>
                                  <td className="p-2 border-2 border-black bg-black text-white text-[9px] uppercase font-black whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <img src={t1.logoUrl} className="w-6 h-6 object-contain bg-white p-0.5 border border-white" alt="" crossOrigin="anonymous" />
                                      {t1.name}
                                    </div>
                                  </td>
                                  {tournament.teams.filter(t => t.id !== 'BYE').map(t2 => {
                                    const s = tournament.series?.find(ser => (ser.team1Id === t1.id && ser.team2Id === t2.id) || (ser.team1Id === t2.id && ser.team2Id === t1.id));
                                    const mCount = s ? s.matchIds.length : 0;
                                    return (
                                        <td key={t2.id} className={`p-2 border-2 border-black text-center font-black text-xs min-w-[50px] ${t1.id === t2.id ? 'bg-gray-200' : (s ? (s.status === 'COMPLETED' ? 'bg-emerald-100' : 'bg-yellow-50') : 'bg-rose-50 opacity-20')}`}>
                                          {t1.id === t2.id ? '-' : (s ? `${mCount}G` : '')}
                                        </td>
                                    );
                                  })}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
               </div>
            )}

            {scheduleLevel === 'FULL_SCHEDULE' && (
               <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center no-print">
                    <BrutalistButton variant="magenta" onClick={() => handleDownloadImage(fullScheduleRef, `${tournament.name}_Full_Schedule`)}>Download Full PNG</BrutalistButton>
                  </div>
                  <div ref={fullScheduleRef} className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden p-12 print:shadow-none print:border-none">
                     <div className="mb-10 border-b-4 border-black pb-8 text-center">
                        <h2 className="text-6xl font-black uppercase italic tracking-tighter leading-none">{tournament.name}</h2>
                        <h3 className="text-xl font-black uppercase tracking-widest text-gray-400 mt-2">OFFICIAL SEASON FIXTURES BREAKDOWN</h3>
                     </div>
                     <div className="space-y-16">
                        {roundsData.map(r => (
                          <div key={r.num} className="space-y-8">
                            <h3 className="text-4xl font-black bg-black text-white px-8 py-3 inline-block uppercase italic tracking-tighter">ROUND {r.num}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              {r.series.map(s => {
                                const t1 = tournament.teams.find(t => t.id === s.team1Id);
                                const t2 = tournament.teams.find(t => t.id === s.team2Id);
                                return (
                                  <div key={s.id} className="p-6 brutalist-border bg-gray-50 flex justify-between items-center shadow-[8px_8px_0px_black]">
                                    <div className="flex items-center gap-6">
                                      <div className="flex flex-col items-center">
                                        <img src={t1?.logoUrl} className="w-12 h-12 object-contain mb-2" alt="" crossOrigin="anonymous" />
                                        <span className="font-black text-xs uppercase text-center w-24 truncate">{t1?.name}</span>
                                      </div>
                                      <span className="font-black italic text-4xl text-gray-200">VS</span>
                                      <div className="flex flex-col items-center">
                                        <img src={t2?.logoUrl} className="w-12 h-12 object-contain mb-2" alt="" crossOrigin="anonymous" />
                                        <span className="font-black text-xs uppercase text-center w-24 truncate">{t2?.name}</span>
                                      </div>
                                    </div>
                                    <div className="text-right border-l-4 border-black/10 pl-6">
                                      <div className="mono text-[10px] font-black uppercase text-gray-400">Match Protocol</div>
                                      <div className="font-black text-4xl italic tracking-tighter">{s.matchIds.length} GAMES</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                     </div>
                  </div>
               </div>
            )}

            {scheduleLevel === 'SERIES' && (
               <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center no-print bg-black p-3 brutalist-border border-white">
                    <BrutalistButton variant="secondary" compact onClick={() => setScheduleLevel('ROUNDS')}>← Back</BrutalistButton>
                    <BrutalistButton variant="magenta" compact onClick={() => handleDownloadImage(roundCaptureRef, `${tournament.name}_Round_${drillDownRound}`)}>Download Log PNG</BrutalistButton>
                  </div>
                  <div ref={roundCaptureRef} className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden p-10">
                     <h3 className="text-4xl font-black uppercase italic tracking-tighter mb-4 border-b-4 border-black pb-4">ROUND {drillDownRound} MATCHUPS LOG</h3>
                     <table className="w-full text-left">
                        <thead className="bg-black text-white font-black uppercase text-[10px] border-b-4 border-black">
                           <tr className="capture-static">
                              <th className="p-4 border-r border-white/20">Series Pairing</th>
                              <th className="p-4 border-r border-white/20">Outcome</th>
                              <th className="p-4 border-r border-white/20 text-center">Summary Record</th>
                              <th className="p-4 text-center no-print">Action</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-black">
                           {tournament.series!.filter(s => s.round === drillDownRound).map(s => {
                              const stats = getDetailedSeriesStats(s.id)!;
                              return (
                                 <tr key={s.id} className="hover:bg-blue-50 font-black uppercase text-xs transition-colors bg-white">
                                    <td className="p-4 border-r-2 border-black bg-gray-50 text-base">{stats.team1?.name} vs {stats.team2?.name}</td>
                                    <td className={`p-4 border-r-2 border-black font-black text-sm ${stats.winnerName === 'DRAWN' ? 'text-sky-600' : 'text-emerald-600'}`}>{stats.winnerName}</td>
                                    <td className="p-4 border-r-2 border-black text-center mono text-sm bg-gray-100">
                                       WIN:{stats.t1Wins} | LOSS:{stats.t1Losses} | DRAW:{stats.draws}
                                    </td>
                                    <td className="p-4 text-center no-print"><BrutalistButton variant="magenta" compact onClick={() => { setDrillDownSeries(s.id); setScheduleLevel('MATCHES'); }}>Matches</BrutalistButton></td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}

            {scheduleLevel === 'ROUNDS' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
                {roundsData.map(r => (
                  <BrutalistCard key={r.num} title={`ROUND ${r.num}`} variant={r.status === 'COMPLETED' ? 'green' : 'white'} compact>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase">
                        <span>Series: {r.series.length}</span>
                        <span>Matches: {r.matchCount}</span>
                      </div>
                      <BrutalistButton variant="primary" className="w-full" onClick={() => { setDrillDownRound(r.num); setScheduleLevel('SERIES'); }}>Open Details</BrutalistButton>
                    </div>
                  </BrutalistCard>
                ))}
              </div>
            )}

            {scheduleLevel === 'MATCHES' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="flex justify-between items-center no-print">
                   <BrutalistButton variant="secondary" compact onClick={() => setScheduleLevel('SERIES')}>← Back</BrutalistButton>
                </div>
                <div className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 font-black uppercase text-[10px] border-b-4 border-black">
                      <tr className="capture-static">
                        <th className="p-5 border-r-2 border-black w-24">Match #</th>
                        <th className="p-5 border-r-2 border-black">Winner / Outcome</th>
                        <th className="p-5 border-r-2 border-black text-center">Status</th>
                        <th className="p-5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                      {tournament.matches.filter(m => m.seriesId === drillDownSeries).map((m, idx) => {
                          const winner = tournament.teams.find(t => t.id === m.winnerId);
                          return (
                            <tr key={m.id} className="hover:bg-emerald-50 font-black uppercase text-xs transition-colors bg-white">
                              <td className="p-5 border-r-2 border-black mono italic bg-gray-50">GAME_{idx+1}</td>
                              <td className="p-5 border-r-2 border-black">{m.status === 'COMPLETED' ? (m.resultType === 'DRAW' ? 'DRAWN' : winner?.name) : '--'}</td>
                              <td className="p-5 border-r-2 border-black text-center"><span className={`px-2 py-1 brutalist-border text-[9px] ${m.status==='COMPLETED'?'bg-emerald-400':'bg-white'}`}>{m.status}</span></td>
                              <td className="p-5 text-center flex items-center justify-center gap-2">
                                {m.status === 'COMPLETED' ? <BrutalistButton variant="danger" compact onClick={() => setConfirmingAction({ type: 'ADMIN_UNLOCK', matchId: m.id })}>Unlock</BrutalistButton> : <BrutalistButton variant="success" compact onClick={() => { setConfirmingAction({ type: 'SAVE_RESULT', matchId: m.id }); setResultForm({ winnerId: '', resultType: 'T1_WIN', notes: '' }); }}>Commit</BrutalistButton>}
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

        {activeTab === 'DASHBOARD' && (
          <div className="p-10 text-center bg-white brutalist-border shadow-[10px_10px_0px_black]">
             <h2 className="text-4xl font-black uppercase italic italic">DASHBOARD UNDER CONSTRUCTION</h2>
             <p className="mono text-gray-400 mt-2 uppercase font-black">Navigate to SCHEDULE or POINTS to view data.</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-in { animation: slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        @media print { .no-print { display: none !important; } }
        .vertical-text { writing-mode: vertical-rl; transform: rotate(180deg); }
        .capture-static { position: static !important; }
        
        /* Smooth Horizontal Scrolling Indicator Affordance */
        .group\\/scroll::after {
          content: '→';
          position: absolute;
          right: 20px;
          bottom: 20px;
          background: #facc15;
          color: black;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid black;
          font-weight: 900;
          opacity: 0.8;
          pointer-events: none;
          box-shadow: 4px 4px 0px black;
          animation: bounceHorizontal 1.5s infinite;
        }
        @keyframes bounceHorizontal { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(10px); } }
      `}</style>
    </div>
  );
};

export default TournamentWorkspace;