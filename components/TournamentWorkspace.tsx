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

  // Refs for capture
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

  const handleDownloadImage = async (ref: React.RefObject<HTMLDivElement | null>, fileName: string) => {
    if (!ref.current || isCapturing) return;
    
    setIsCapturing(true);
    // Give state time to render the overlay
    await new Promise(r => setTimeout(r, 200));

    try {
      const el = ref.current;
      
      // Force loading of all images
      const images = Array.from(el.getElementsByTagName('img')) as HTMLImageElement[];
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // Calculate true dimensions by removing constraints temporarily
      const originalStyle = el.getAttribute('style') || '';
      el.style.width = 'auto';
      el.style.minWidth = 'none';
      el.style.maxWidth = 'none';
      
      const width = el.scrollWidth;
      const height = el.scrollHeight;
      
      // Reset after measuring
      el.setAttribute('style', originalStyle);

      // Scale detection for memory safety
      const area = width * height;
      const pixelRatio = area > 4000000 ? 1 : 2;

      const options = {
        backgroundColor: '#ffffff',
        width,
        height,
        pixelRatio,
        cacheBust: true,
        skipFonts: true,
        style: {
          transform: 'none',
          margin: '0',
          padding: '20px',
          width: `${width}px`,
          height: `${height}px`,
          position: 'relative',
          left: '0',
          top: '0',
          overflow: 'visible',
          display: 'block' // Ensure it's not inline-block which can mess with width
        },
        onClone: (clonedDoc: Document) => {
            const allElements = clonedDoc.querySelectorAll('*');
            allElements.forEach((node) => {
                const style = (node as HTMLElement).style;
                if (style) {
                    // Disable sticky for capture
                    if (style.position === 'sticky') {
                        style.position = 'static';
                    }
                    // Disable snap scrolling
                    if (style.scrollSnapAlign) {
                      style.scrollSnapAlign = 'none';
                    }
                }
            });
        },
        filter: (node: HTMLElement) => {
          if (node.classList?.contains('no-print')) return false;
          return true;
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
      let errorDetail = err?.message || JSON.stringify(err, Object.getOwnPropertyNames(err));
      alert(`IMAGE CAPTURE FAILED\n\nReason: ${errorDetail}\n\nTip: For extremely wide tables, try the Print button.`);
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAddPenalty = () => {
    if (!penaltyForm.teamId || penaltyForm.points <= 0 || !penaltyForm.reason.trim()) {
      return alert("Please fill all penalty fields correctly.");
    }
    const newPenalty: PenaltyRecord = {
      id: Date.now().toString(),
      teamId: penaltyForm.teamId,
      points: penaltyForm.points,
      reason: penaltyForm.reason,
      date: new Date().toLocaleDateString()
    };
    const updatedPenalties = [...tournament.penalties, newPenalty];
    onUpdateTournament?.({ ...tournament, penalties: updatedPenalties });
    setPenaltyForm({ teamId: '', points: 0, reason: '' });
  };

  const handleRemovePenalty = (id: string) => {
    const updatedPenalties = tournament.penalties.filter(p => p.id !== id);
    onUpdateTournament?.({ ...tournament, penalties: updatedPenalties });
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
      t1.sDone++;
      t2.sDone++;
      
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
      const statusValue = sInR.every(s => s.status === 'COMPLETED') ? 'COMPLETED' :
                     (sInR.some(s => s.status !== 'NOT_STARTED') ? 'IN_PROGRESS' : 'NOT_STARTED');
      const matchCount = sInR.reduce((sum, s) => sum + s.matchIds.length, 0);
      return { 
        num: rNum, 
        series: sInR, 
        status: statusValue as SeriesGroup['status'], 
        matchCount 
      };
    });
  }, [tournament.series]);

  const toggleColumn = (col: string) => {
    setColumnVisibility(prev => ({ ...prev, [col]: !prev[col] }));
  };

  const showFullTable = () => {
    const allOn: Record<string, boolean> = {};
    Object.keys(columnVisibility).forEach(k => allOn[k] = true);
    setColumnVisibility(allOn);
  };

  const handleSaveIdentity = () => {
    if (securityInput.trim().toLowerCase() !== tournament.name.trim().toLowerCase()) return alert(`Security Check Failed.`);
    onUpdateTournament?.({ ...tournament, name: tempTournamentName });
    setIsEditingIdentity(false);
    setSecurityInput('');
  };

  const generateTestSchedule = () => {
    const baseTeams = tournament.teams.filter(t => t.id !== 'BYE' && t.name.trim() !== '');
    if (baseTeams.length < 2) return alert("Min 2 teams required to generate schedule!");
    
    const matches: Match[] = [];
    const series: SeriesGroup[] = [];
    const teamIds = baseTeams.map(t => t.id);
    if (teamIds.length % 2 !== 0) teamIds.push('BYE');
    
    const numRounds = teamIds.length - 1;
    const teamMatchTotals: Record<string, number> = {};
    teamIds.forEach(id => teamMatchTotals[id] = 0);

    const venues = tournament.stadiums.length > 0 ? tournament.stadiums : [{ id: 'V1', name: 'Default Ground' }];

    const rotatedTeamIds = [...teamIds];

    for (let r = 0; r < numRounds; r++) {
      for (let i = 0; i < rotatedTeamIds.length / 2; i++) {
        const t1 = rotatedTeamIds[i];
        const t2 = rotatedTeamIds[rotatedTeamIds.length - 1 - i];
        
        if (t1 !== 'BYE' && t2 !== 'BYE') {
          const sId = `SERIES-R${r + 1}-P${i + 1}`;
          const mIds: string[] = [];
          
          let chosenLen = seriesRange.min;
          if (seriesRange.max > seriesRange.min) {
            chosenLen = Math.floor(Math.random() * (seriesRange.max - seriesRange.min + 1)) + seriesRange.min;
          }

          teamMatchTotals[t1] += chosenLen;
          teamMatchTotals[t2] += chosenLen;

          for (let m = 0; m < chosenLen; m++) {
            const mId = `MATCH-${sId}-G${m + 1}`;
            mIds.push(mId);
            matches.push({
              id: mId,
              round: r + 1,
              seriesId: sId,
              team1Id: t1,
              team2Id: t2,
              venueId: venues[m % venues.length].id,
              status: 'NOT_STARTED'
            });
          }
          
          series.push({
            id: sId,
            round: r + 1,
            team1Id: t1,
            team2Id: t2,
            status: 'NOT_STARTED',
            matchIds: mIds
          });
        }
      }
      rotatedTeamIds.splice(1, 0, rotatedTeamIds.pop()!);
    }

    onUpdateTournament?.({ 
      ...tournament, 
      matches, 
      series, 
      status: 'ONGOING' 
    });
    
    setScheduleLevel('OVERVIEW');
  };

  const getDetailedSeriesStats = (seriesId: string) => {
    const series = tournament.series?.find(s => s.id === seriesId);
    if (!series) return null;
    const ms = tournament.matches.filter(m => m.seriesId === seriesId);
    const completed = ms.filter(m => m.status === 'COMPLETED');
    const team1 = tournament.teams.find(t => t.id === series.team1Id);
    const team2 = tournament.teams.find(t => t.id === series.team2Id);
    const t1Wins = completed.filter(m => m.winnerId === series.team1Id).length;
    const t2Wins = completed.filter(m => m.winnerId === series.team2Id).length;
    const t1Losses = completed.filter(m => m.winnerId === series.team2Id).length;
    const draws = completed.filter(m => m.resultType === 'DRAW' || m.resultType === 'TIE' || m.resultType === 'NO_RESULT').length;
    const t1MatchPts = (t1Wins * tournament.config.pointsForWin) + (t1Losses * tournament.config.pointsForLoss) + (draws * tournament.config.pointsForDraw);
    const t2MatchPts = (t2Wins * tournament.config.pointsForWin) + (completed.filter(m => m.winnerId === series.team1Id).length * tournament.config.pointsForLoss) + (draws * tournament.config.pointsForDraw);
    let t1SeriesPts = 0, t2SeriesPts = 0, winnerName = 'PENDING';
    if (series.status === 'COMPLETED') {
      if (t1Wins > t2Wins) { winnerName = team1?.name || 'T1'; if (tournament.config.countSeriesBonus) t1SeriesPts = tournament.config.pointsForSeriesWin; }
      else if (t2Wins > t1Wins) { winnerName = team2?.name || 'T2'; if (tournament.config.countSeriesBonus) t2SeriesPts = tournament.config.pointsForSeriesWin; }
      else if (completed.length > 0) { winnerName = 'DRAWN'; if (tournament.config.countSeriesBonus) { t1SeriesPts = tournament.config.pointsForSeriesDraw; t2SeriesPts = tournament.config.pointsForSeriesDraw; } }
    }
    return { team1, team2, t1Wins, t2Wins, t1Losses, draws, t1MatchPts, t2MatchPts, t1SeriesPts, t2SeriesPts, t1Total: t1MatchPts + t1SeriesPts, t2Total: t2MatchPts + t2SeriesPts, winnerName, totalMatches: ms.length, doneMatches: completed.length };
  };

  const getTeamPointLog = (teamId: string) => {
    const logs: { type: string, opponent: string, points: number, date?: string, reason?: string }[] = [];
    
    tournament.matches.filter(m => (m.team1Id === teamId || m.team2Id === teamId) && m.status === 'COMPLETED').forEach(m => {
      const isT1 = m.team1Id === teamId;
      const opp = tournament.teams.find(t => t.id === (isT1 ? m.team2Id : m.team1Id))?.name || 'Unknown';
      let pts = 0;
      if (m.resultType === 'T1_WIN') pts = isT1 ? tournament.config.pointsForWin : tournament.config.pointsForLoss;
      else if (m.resultType === 'T2_WIN') pts = !isT1 ? tournament.config.pointsForWin : tournament.config.pointsForLoss;
      else pts = tournament.config.pointsForDraw;
      
      logs.push({ type: 'MATCH', opponent: opp, points: pts });
    });

    if (tournament.config.countSeriesBonus) {
      tournament.series?.filter(s => (s.team1Id === teamId || s.team2Id === teamId) && s.status === 'COMPLETED').forEach(s => {
        const stats = getDetailedSeriesStats(s.id)!;
        const isT1 = s.team1Id === teamId;
        const opp = (isT1 ? stats.team2?.name : stats.team1?.name) || 'Unknown';
        const t1Wins = stats.t1Wins;
        const t2Wins = stats.t2Wins;
        let bonus = 0;
        if (isT1) {
          if (t1Wins > t2Wins) bonus = tournament.config.pointsForSeriesWin;
          else if (t2Wins === t1Wins) bonus = tournament.config.pointsForSeriesDraw;
        } else {
          if (t2Wins > t1Wins) bonus = tournament.config.pointsForSeriesWin;
          else if (t2Wins === t1Wins) bonus = tournament.config.pointsForSeriesDraw;
        }
        if (bonus > 0) logs.push({ type: 'SERIES BONUS', opponent: opp, points: bonus });
      });
    }

    tournament.penalties.filter(p => p.teamId === teamId).forEach(p => {
      logs.push({ type: 'PENALTY', opponent: 'SYSTEM', points: -p.points, date: p.date, reason: p.reason });
    });

    return logs;
  };

  return (
    <div className="space-y-8 pb-32">
      {/* Capture Overlay */}
      {isCapturing && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="text-center space-y-6 p-10 brutalist-border bg-white shadow-[10px_10px_0px_white]">
            <div className="w-16 h-16 border-8 border-black border-t-yellow-400 rounded-full animate-spin mx-auto"></div>
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">GENERATING IMAGE...</h2>
            <p className="mono text-xs font-bold uppercase">Synthesizing full visual archive. Please Wait.</p>
          </div>
        </div>
      )}

      <BrutalistCard variant="white" className="p-0 overflow-hidden border-4 border-black no-print">
        <div className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white brutalist-border p-2 transform rotate-3">
              <img src={tournament.header.siteLogoUrl} className="max-h-full mx-auto" alt="Logo" crossOrigin="anonymous" />
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
                    <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none">Official Standings</h2>
                    <p className="mono text-[10px] text-yellow-400 mt-2 font-black uppercase">Live Performance Tracking Board</p>
                 </div>
                 <div className="flex gap-2">
                    <BrutalistButton variant="primary" onClick={showFullTable}>Full View</BrutalistButton>
                    <BrutalistButton variant="magenta" onClick={() => handleDownloadImage(pointsTableRef, `${tournament.name}_Standings`)}>Download PNG</BrutalistButton>
                 </div>
              </div>

              <div className="bg-white brutalist-border shadow-[15px_15px_0px_black] overflow-x-auto relative group/scroll">
                <div ref={pointsTableRef} className="bg-white inline-block min-w-full">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead className="bg-gray-100 font-black uppercase text-[10px] border-b-4 border-black sticky top-0 z-20">
                      <tr className="capture-static">
                        {columnVisibility.standing && <th className="p-4 border-r-2 border-black w-16 text-center">STND</th>}
                        {columnVisibility.team && <th className={`p-4 border-r-2 border-black ${wrapTeamNames ? 'w-40' : 'w-px whitespace-nowrap'}`}>TEAM IDENTITY</th>}
                        {columnVisibility.sPlayed && <th className="p-4 border-r-2 border-black text-center w-16">S.PLD</th>}
                        {columnVisibility.sDone && <th className="p-4 border-r-2 border-black text-center w-16">S.DONE</th>}
                        {columnVisibility.sLeft && <th className="p-4 border-r-2 border-black text-center w-16">S.LFT</th>}
                        {columnVisibility.mPlayed && <th className="p-4 border-r-2 border-black text-center w-16">M.PLD</th>}
                        {columnVisibility.mWon && <th className="p-4 border-r-2 border-black text-center w-16 text-emerald-600">WON</th>}
                        {columnVisibility.mDrawn && <th className="p-4 border-r-2 border-black text-center w-16 text-sky-600">DRW</th>}
                        {columnVisibility.mLost && <th className="p-4 border-r-2 border-black text-center w-16 text-rose-600">LST</th>}
                        {columnVisibility.totalPts && <th className="p-4 border-r-2 border-black text-center w-20">PTS</th>}
                        {columnVisibility.maxPts && <th className="p-4 border-r-2 border-black text-center w-16 opacity-40">MAX</th>}
                        {columnVisibility.pct && <th className="p-4 border-r-2 border-black text-center bg-yellow-400 text-black w-24">PCT %</th>}
                        {columnVisibility.penalty && <th className="p-4 border-r-2 border-black text-center w-16 text-rose-500">PEN</th>}
                        {columnVisibility.finalPts && <th className="p-4 border-r-2 border-black text-center w-24 bg-black text-white">FINAL</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                      {standings.map((t, idx) => (
                        <tr key={t.id} className={`hover:bg-yellow-50 font-black uppercase text-sm transition-all group ${idx < 2 ? 'bg-emerald-50' : 'bg-white'}`}>
                          {columnVisibility.standing && <td className="p-4 border-r-2 border-black mono text-center bg-gray-50 text-2xl group-hover:bg-yellow-100 transition-colors italic">#{idx + 1}</td>}
                          {columnVisibility.team && (
                            <td className={`p-4 border-r-2 border-black ${wrapTeamNames ? 'w-40' : 'whitespace-nowrap w-px min-w-max'} cursor-pointer`} onClick={() => setSelectedTeamId(t.id)}>
                              <div className="flex items-center gap-4 w-fit hover:translate-x-1 transition-transform pr-6">
                                <div className="w-10 h-10 brutalist-border bg-white p-1 transform -rotate-3 flex-shrink-0"><img src={t.logoUrl || ''} className="max-h-full mx-auto" alt="Logo" crossOrigin="anonymous" /></div>
                                <span className={`text-lg tracking-tighter ${wrapTeamNames ? 'whitespace-normal leading-none' : 'whitespace-nowrap'} underline decoration-dotted decoration-2 underline-offset-4`}>{t.name}</span>
                              </div>
                            </td>
                          )}
                          {columnVisibility.sPlayed && <td className="p-4 border-r-2 border-black mono text-center opacity-60">{t.sPlayed}</td>}
                          {columnVisibility.sDone && <td className="p-4 border-r-2 border-black mono text-center text-emerald-600">{t.sDone}</td>}
                          {columnVisibility.sLeft && <td className="p-4 border-r-2 border-black mono text-center text-gray-400">{t.sPlayed - t.sDone}</td>}
                          {columnVisibility.mPlayed && <td className="p-4 border-r-2 border-black mono text-center bg-gray-50/50">{t.matchesPlayed}</td>}
                          {columnVisibility.mWon && <td className="p-4 border-r-2 border-black mono text-center text-emerald-600">{t.matchesWon}</td>}
                          {columnVisibility.mDrawn && <td className="p-4 border-r-2 border-black mono text-center text-sky-600">{t.matchesDrawn}</td>}
                          {columnVisibility.mLost && <td className="p-4 border-r-2 border-black mono text-center text-rose-600">{t.matchesLost}</td>}
                          {columnVisibility.totalPts && (
                            <td className={`p-4 border-r-2 border-black mono text-center font-black text-xl ${t.penaltyPoints > 0 ? 'text-rose-600 bg-rose-50' : 'bg-gray-50'}`}>
                              {t.basePoints + t.bonusPoints}
                            </td>
                          )}
                          {columnVisibility.maxPts && <td className="p-4 border-r-2 border-black mono text-center opacity-40">{t.playedFor}</td>}
                          {columnVisibility.pct && <td className="p-4 border-r-2 border-black mono text-center font-black bg-yellow-400/20 text-3xl italic tracking-tighter">{t.pct.toFixed(2)}%</td>}
                          {columnVisibility.penalty && <td className="p-4 border-r-2 border-black mono text-center text-rose-500">-{t.penaltyPoints}</td>}
                          {columnVisibility.finalPts && <td className="p-4 border-r-2 border-black mono text-center font-black text-2xl bg-black text-white">{t.totalPoints}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Penalty Management & Settings Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 no-print">
                <BrutalistCard title="⚠️ APPLY PENALTY" variant="pink">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase mb-1">Team</label>
                        <select 
                          className="w-full brutalist-border p-2 font-black uppercase bg-white text-black text-xs"
                          value={penaltyForm.teamId}
                          onChange={e => setPenaltyForm({...penaltyForm, teamId: e.target.value})}
                        >
                          <option value="">-- SELECT --</option>
                          {tournament.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase mb-1">Points</label>
                        <input 
                          type="number"
                          className="w-full brutalist-border p-2 font-black uppercase bg-white text-black text-xs"
                          value={penaltyForm.points}
                          onChange={e => setPenaltyForm({...penaltyForm, points: Number(e.target.value)})}
                        />
                      </div>
                    </div>
                    <input 
                      className="w-full brutalist-border p-2 font-black uppercase bg-white text-black text-xs"
                      placeholder="REASON: SLOW OVER RATE"
                      value={penaltyForm.reason}
                      onChange={e => setPenaltyForm({...penaltyForm, reason: e.target.value})}
                    />
                    <BrutalistButton variant="danger" className="w-full" onClick={handleAddPenalty}>APPLY</BrutalistButton>
                  </div>
                </BrutalistCard>

                <BrutalistCard title="⚙️ TABLE SETTINGS" variant="white">
                  <div className="space-y-4">
                    <button 
                      onClick={() => setWrapTeamNames(!wrapTeamNames)}
                      className={`w-full p-4 brutalist-border font-black uppercase text-sm transition-all flex items-center justify-between ${wrapTeamNames ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}
                    >
                      Wrap Team Names
                      <span>{wrapTeamNames ? '[ ON ]' : '[ OFF ]'}</span>
                    </button>
                    <p className="mono text-[9px] text-gray-400 uppercase leading-tight">Wrapping names reduces column width for easier horizontal viewing on smaller screens.</p>
                  </div>
                </BrutalistCard>

                <BrutalistCard title="📜 PENALTY LOG" variant="white">
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2">
                    {tournament.penalties.length > 0 ? (
                      tournament.penalties.slice().reverse().map(p => (
                        <div key={p.id} className="p-2 brutalist-border bg-white flex justify-between items-center group">
                          <div className="overflow-hidden">
                            <p className="font-black uppercase text-[10px] truncate">{tournament.teams.find(t => t.id === p.teamId)?.name}</p>
                            <p className="text-[8px] opacity-60 italic truncate">-{p.points} Pt: {p.reason}</p>
                          </div>
                          <button onClick={() => handleRemovePenalty(p.id)} className="text-[10px] font-black uppercase text-rose-600 opacity-0 group-hover:opacity-100 ml-2">DEL</button>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-gray-300 italic font-black uppercase text-xs">No entries.</div>
                    )}
                  </div>
                </BrutalistCard>
              </div>

              {/* Advanced Visibility Toggles */}
              <BrutalistCard title="DATA COLUMN VISIBILITY" variant="white" className="no-print">
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    {Object.keys(columnVisibility).map(col => {
                      const labels: Record<string, string> = {
                        standing: "Rank", team: "Identity", sPlayed: "S.PLD", sDone: "S.DONE", sLeft: "S.LEFT",
                        mPlayed: "M.PLD", mWon: "WON", mDrawn: "DRAW", mLost: "LOST",
                        totalPts: "PTS", maxPts: "MAX", pct: "PCT %", penalty: "PENALTY", finalPts: "FINAL"
                      };
                      return (
                        <button 
                          key={col} 
                          onClick={() => toggleColumn(col)}
                          className={`p-2 brutalist-border font-black uppercase text-[10px] flex items-center justify-between gap-2 transition-all ${columnVisibility[col] ? 'bg-black text-white' : 'bg-white text-black opacity-30 hover:opacity-100'}`}
                        >
                          {labels[col]}
                          <span>{columnVisibility[col] ? 'ON' : 'OFF'}</span>
                        </button>
                      );
                    })}
                 </div>
              </BrutalistCard>
           </div>
        )}

        {activeTab === 'SCHEDULE' && (
          <div className="space-y-6">
            <div className="bg-black p-4 brutalist-border text-white flex flex-wrap justify-between items-center gap-4 no-print shadow-[6px_6px_0px_black]">
                <div className="flex gap-4 font-black text-[12px] uppercase overflow-x-auto pb-1">
                   <button onClick={() => setScheduleLevel('OVERVIEW')} className={scheduleLevel === 'OVERVIEW' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'hover:text-yellow-200'}>OVERVIEW</button>
                   <button onClick={() => setScheduleLevel('DISTRIBUTION')} className={scheduleLevel === 'DISTRIBUTION' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'hover:text-yellow-200'}>MATRIX</button>
                   <button onClick={() => setScheduleLevel('ROUNDS')} className={scheduleLevel === 'ROUNDS' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'hover:text-yellow-200'}>ROUNDS</button>
                   <button onClick={() => setScheduleLevel('FULL_SCHEDULE')} className={scheduleLevel === 'FULL_SCHEDULE' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'hover:text-yellow-200'}>FULL SCHEDULE</button>
                </div>
                <div className="flex gap-3">
                  {(!tournament.matches || tournament.matches.length === 0) ? 
                    <BrutalistButton variant="success" compact onClick={generateTestSchedule}>Generate Schedule</BrutalistButton> : 
                    <BrutalistButton variant="danger" compact onClick={() => setConfirmingAction({ type: 'REGENERATE_SCHEDULE' })}>Reset Engine</BrutalistButton>
                  }
                </div>
            </div>

            {scheduleLevel === 'OVERVIEW' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
                {(!tournament.matches || tournament.matches.length === 0) ? (
                   <div className="col-span-full p-20 text-center bg-white brutalist-border shadow-[10px_10px_0px_black]">
                      <h3 className="text-3xl font-black uppercase italic text-gray-400 mb-4">Awaiting Schedule Generation</h3>
                      <BrutalistButton variant="success" onClick={generateTestSchedule}>Initialize Season</BrutalistButton>
                   </div>
                ) : (
                  <>
                    <BrutalistCard title="ROUND SYNOPSIS" variant="white">
                       <div className="space-y-3">
                          {roundsData.map(r => (
                            <div key={r.num} className="flex justify-between items-center p-3 brutalist-border bg-gray-50">
                               <span className="font-black uppercase text-sm">Round {r.num}</span>
                               <span className={`px-2 py-0.5 text-[9px] font-black brutalist-border ${r.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-yellow-400'}`}>{r.status}</span>
                            </div>
                          ))}
                       </div>
                    </BrutalistCard>
                    <BrutalistCard title="NEXT UP" variant="blue">
                       <div className="space-y-3">
                          {tournament.series?.filter(s => s.status !== 'COMPLETED').slice(0, 5).map(s => (
                            <div key={s.id} className="p-3 brutalist-border bg-white flex justify-between items-center">
                               <div className="font-black text-[10px] uppercase truncate flex-1">
                                 {tournament.teams.find(t => t.id === s.team1Id)?.name} vs {tournament.teams.find(t => t.id === s.team2Id)?.name}
                               </div>
                               <BrutalistButton variant="secondary" compact onClick={() => { setDrillDownSeries(s.id); setScheduleLevel('MATCHES'); }}>OPEN</BrutalistButton>
                            </div>
                          ))}
                       </div>
                    </BrutalistCard>
                  </>
                )}
              </div>
            )}

            {scheduleLevel === 'DISTRIBUTION' && (
               <div className="space-y-8 animate-in fade-in">
                  <BrutalistCard title="MATCHUP MATRIX (OFFICIAL MAPPING)" variant="white">
                    <div className="flex justify-end mb-4 no-print">
                      <BrutalistButton variant="magenta" compact onClick={() => handleDownloadImage(distributionTableRef, `${tournament.name}_Matrix`)}>Download Matrix</BrutalistButton>
                    </div>
                    <div className="overflow-x-auto bg-white brutalist-border relative group/scroll">
                      <div ref={distributionTableRef} className="bg-white p-4 inline-block">
                        <table className="border-collapse">
                          <thead>
                              <tr className="capture-static">
                                <th className="p-2 border-2 border-black bg-gray-100 min-w-[100px]"></th>
                                {tournament.teams.filter(t => t.id !== 'BYE').map(t => (
                                    <th key={t.id} className="p-2 border-2 border-black bg-black text-white text-[9px] uppercase font-black vertical-text h-32">
                                      <div className="flex flex-col items-center gap-2">
                                        <img src={t.logoUrl} className="w-5 h-5 object-contain bg-white p-0.5 border border-white" alt="" crossOrigin="anonymous" />
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
                                        <img src={t1.logoUrl} className="w-5 h-5 object-contain bg-white p-0.5 border border-white" alt="" crossOrigin="anonymous" />
                                        {t1.name}
                                      </div>
                                    </td>
                                    {tournament.teams.filter(t => t.id !== 'BYE').map(t2 => {
                                      const s = tournament.series?.find(ser => (ser.team1Id === t1.id && ser.team2Id === t2.id) || (ser.team1Id === t2.id && ser.team2Id === t1.id));
                                      const mCount = s ? s.matchIds.length : 0;
                                      const isDone = s?.status === 'COMPLETED';
                                      return (
                                          <td key={t2.id} className={`p-2 border-2 border-black text-center font-black text-xs min-w-[40px] ${t1.id === t2.id ? 'bg-gray-200' : (s ? (isDone ? 'bg-emerald-100' : 'bg-yellow-50') : 'bg-rose-50 opacity-10')}`}>
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
                  </BrutalistCard>
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
                      <BrutalistButton variant="primary" className="w-full" onClick={() => { setDrillDownRound(r.num); setScheduleLevel('SERIES'); }}>Open Panel</BrutalistButton>
                    </div>
                  </BrutalistCard>
                ))}
              </div>
            )}

            {scheduleLevel === 'SERIES' && (
               <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center no-print bg-black p-3 brutalist-border border-white">
                    <BrutalistButton variant="secondary" compact onClick={() => setScheduleLevel('ROUNDS')}>← Back</BrutalistButton>
                    <BrutalistButton variant="magenta" compact onClick={() => handleDownloadImage(roundCaptureRef, `${tournament.name}_Round_${drillDownRound}`)}>Download Log</BrutalistButton>
                  </div>
                  <div ref={roundCaptureRef} className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden p-6">
                     <h3 className="text-3xl font-black uppercase italic tracking-tighter mb-4 border-b-4 border-black pb-2">ROUND {drillDownRound} PAIRINGS</h3>
                     <table className="w-full text-left">
                        <thead className="bg-black text-white font-black uppercase text-[10px] border-b-4 border-black">
                           <tr className="capture-static">
                              <th className="p-4 border-r border-white/20">Series Matchup</th>
                              <th className="p-4 border-r border-white/20">Outcome</th>
                              <th className="p-4 border-r border-white/20 text-center">Breakdown</th>
                              <th className="p-4 text-center no-print">Action</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-black">
                           {tournament.series!.filter(s => s.round === drillDownRound).map(s => {
                              const stats = getDetailedSeriesStats(s.id)!;
                              return (
                                 <tr key={s.id} className="hover:bg-blue-50 font-black uppercase text-xs transition-colors bg-white">
                                    <td className="p-4 border-r-2 border-black bg-gray-50">{stats.team1?.name} vs {stats.team2?.name}</td>
                                    <td className={`p-4 border-r-2 border-black font-black ${stats.winnerName === 'DRAWN' ? 'text-sky-600' : 'text-emerald-600'}`}>{stats.winnerName}</td>
                                    <td className="p-4 border-r-2 border-black text-center mono text-[10px]">
                                       W:{stats.t1Wins} | L:{stats.t1Losses} | D:{stats.draws}
                                    </td>
                                    <td className="p-4 text-center no-print"><BrutalistButton variant="magenta" compact onClick={() => { setDrillDownSeries(s.id); setScheduleLevel('MATCHES'); }}>View Games</BrutalistButton></td>
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
                <div className="flex justify-between items-center no-print">
                   <BrutalistButton variant="secondary" compact onClick={() => setScheduleLevel('SERIES')}>← Back</BrutalistButton>
                </div>
                <div className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-gray-100 font-black uppercase text-[10px] border-b-4 border-black">
                      <tr className="capture-static">
                        <th className="p-5 border-r-2 border-black w-24">Match #</th>
                        <th className="p-5 border-r-2 border-black">Result</th>
                        <th className="p-5 border-r-2 border-black text-center">Pts</th>
                        <th className="p-5 border-r-2 border-black text-center">Status</th>
                        <th className="p-5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-black">
                      {tournament.matches.filter(m => m.seriesId === drillDownSeries).map((m, idx) => {
                          const winner = tournament.teams.find(t => t.id === m.winnerId);
                          return (
                            <tr key={m.id} className="hover:bg-emerald-50 font-black uppercase text-xs transition-colors bg-white">
                              <td className="p-5 border-r-2 border-black mono italic bg-gray-50">#0{idx+1}</td>
                              <td className="p-5 border-r-2 border-black">{m.status === 'COMPLETED' ? (m.resultType === 'DRAW' ? 'DRAWN' : winner?.name) : '--'}</td>
                              <td className="p-5 border-r-2 border-black text-center mono text-[10px]">{m.status === 'COMPLETED' ? `OK` : '--'}</td>
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

            {scheduleLevel === 'FULL_SCHEDULE' && (
               <div className="space-y-6 animate-in fade-in">
                  <div className="flex justify-between items-center no-print">
                    <BrutalistButton variant="magenta" onClick={() => handleDownloadImage(fullScheduleRef, `${tournament.name}_Full_Schedule`)}>Download Full View</BrutalistButton>
                  </div>
                  <div ref={fullScheduleRef} className="bg-white brutalist-border shadow-[12px_12px_0px_black] overflow-hidden p-8 print:shadow-none print:border-none">
                     <div className="mb-8 border-b-4 border-black pb-6">
                        <h2 className="text-4xl font-black uppercase italic tracking-tighter leading-none">{tournament.name} - OFFICIAL FIXTURES</h2>
                        <p className="mono text-[10px] text-gray-400 mt-2 uppercase font-black">Round-by-Round Series Protocol</p>
                     </div>
                     
                     <div className="space-y-12">
                        {roundsData.map(r => (
                          <div key={r.num} className="space-y-6">
                            <h3 className="text-2xl font-black bg-black text-white px-6 py-2 inline-block uppercase italic tracking-tighter">ROUND {r.num}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {r.series.map(s => {
                                const t1 = tournament.teams.find(t => t.id === s.team1Id);
                                const t2 = tournament.teams.find(t => t.id === s.team2Id);
                                return (
                                  <div key={s.id} className="p-4 brutalist-border bg-gray-50 flex justify-between items-center shadow-[6px_6px_0px_black] hover:translate-x-1 transition-transform">
                                    <div className="flex items-center gap-4">
                                      <div className="flex flex-col items-center">
                                        <img src={t1?.logoUrl} className="w-10 h-10 object-contain mb-1" alt="" crossOrigin="anonymous" />
                                        <span className="font-black text-[10px] uppercase text-center w-20 truncate">{t1?.name}</span>
                                      </div>
                                      <span className="font-black italic text-gray-300">VS</span>
                                      <div className="flex flex-col items-center">
                                        <img src={t2?.logoUrl} className="w-10 h-10 object-contain mb-1" alt="" crossOrigin="anonymous" />
                                        <span className="font-black text-[10px] uppercase text-center w-20 truncate">{t2?.name}</span>
                                      </div>
                                    </div>
                                    <div className="text-right border-l-2 border-black/10 pl-4">
                                      <div className="mono text-[8px] font-black uppercase text-gray-400">Match Count</div>
                                      <div className="font-black text-xl italic tracking-tighter">{s.matchIds.length}G</div>
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
          </div>
        )}

        {selectedTeamId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 no-print">
            <BrutalistCard title={`TEAM DATA: ${tournament.teams.find(t => t.id === selectedTeamId)?.name}`} className="max-w-2xl w-full bg-white max-h-[90vh] overflow-hidden flex flex-col">
               <div className="overflow-y-auto p-4">
                 <div className="flex items-center gap-6 mb-8 border-b-4 border-black pb-8">
                    <img src={tournament.teams.find(t => t.id === selectedTeamId)?.logoUrl} className="w-24 h-24 brutalist-border bg-white p-2" alt="" crossOrigin="anonymous" />
                    <div>
                       <h2 className="text-4xl font-black uppercase italic tracking-tighter leading-none">{tournament.teams.find(t => t.id === selectedTeamId)?.name}</h2>
                       <p className="mono text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-widest">Official Competition Profile & Point Log</p>
                    </div>
                 </div>

                 <h4 className="font-black text-xs uppercase bg-black text-white px-2 py-1 mb-4 inline-block tracking-tighter italic">Point Log Archive</h4>
                 <div className="space-y-3 mb-8">
                    {getTeamPointLog(selectedTeamId).length > 0 ? getTeamPointLog(selectedTeamId).map((log, i) => (
                      <div key={i} className={`p-4 brutalist-border flex justify-between items-center ${log.points > 0 ? 'bg-emerald-50' : (log.points < 0 ? 'bg-rose-50' : 'bg-gray-50')}`}>
                        <div className="font-black uppercase text-[10px]">
                           {log.type}: <span className="opacity-50 italic">{log.opponent}</span>
                           {log.reason && <p className="text-[9px] mono text-rose-600 mt-1">{log.reason}</p>}
                        </div>
                        <div className={`text-xl font-black mono ${log.points > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {log.points > 0 ? `+${log.points}` : log.points} Pt
                        </div>
                      </div>
                    )) : (
                      <div className="p-12 text-center text-gray-300 italic font-black uppercase text-sm">No recorded match logs.</div>
                    )}
                 </div>

                 <BrutalistButton variant="primary" className="w-full" onClick={() => setSelectedTeamId(null)}>CLOSE PANEL</BrutalistButton>
               </div>
            </BrutalistCard>
          </div>
        )}

        {activeTab === 'DASHBOARD' && (
           <div className="space-y-12">
              <BrutalistCard title="LIVE SEASON PROGRESS" variant="white">
                 <div className="flex gap-1 h-16">
                    {roundsData.length > 0 ? roundsData.map((r) => (
                      <div key={r.num} className={`flex-1 brutalist-border flex items-center justify-center mono font-black text-sm relative transition-all ${r.status === 'COMPLETED' ? 'bg-emerald-400' : r.status === 'IN_PROGRESS' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                        R{r.num}
                      </div>
                    )) : <div className="flex-1 brutalist-border bg-gray-50 flex items-center justify-center mono text-gray-300">SYSTEM READY...</div>}
                 </div>
              </BrutalistCard>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <BrutalistCard title="MATCH ENGINE" variant="cyan">
                   <div className="space-y-4">
                      <div className="p-4 bg-white brutalist-border flex justify-between items-center shadow-[4px_4px_0px_black]"><span className="font-black uppercase text-xs text-gray-400">Matches Loaded</span><span className="text-3xl font-black">{tournament.matches.length}</span></div>
                      <div className="space-y-2">
                         {[{ label: 'Done', val: tournament.matches.filter(m => m.status === 'COMPLETED').length, color: 'text-emerald-600' }, { label: 'Active', val: tournament.matches.filter(m => m.status === 'IN_PROGRESS').length, color: 'text-yellow-600' }, { label: 'Pending', val: tournament.matches.filter(m => m.status === 'NOT_STARTED').length, color: 'text-gray-400' }].map(s => (
                           <div key={s.label} className="flex justify-between items-center px-2 py-1 border-b-2 border-black border-dotted"><span className="font-bold text-[10px] uppercase">{s.label}</span><span className={`mono font-black ${s.color}`}>{s.val}</span></div>
                         ))}
                      </div>
                   </div>
                </BrutalistCard>
                <BrutalistCard title="SERIES STATUS" variant="magenta">
                   <div className="grid grid-cols-2 gap-4 h-full">
                      {[{ label: 'TOTAL', val: tournament.series?.length || 0 }, { label: 'DONE', val: tournament.series?.filter(s => s.status === 'COMPLETED').length || 0 }].map(item => (
                        <div key={item.label} className="brutalist-border bg-white p-4 flex flex-col items-center justify-center shadow-[4px_4px_0px_black] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
                           <p className="text-3xl font-black">{item.val}</p>
                           <p className="mono text-[8px] uppercase font-bold text-gray-400">{item.label}</p>
                        </div>
                      ))}
                   </div>
                </BrutalistCard>
                <BrutalistCard title="CHAMPIONSHIP RACE" variant="yellow">
                   <div className="space-y-4">
                      {standings.slice(0, 2).map((t, i) => (
                        <div key={t.id} className="p-3 brutalist-border bg-white flex flex-col shadow-[4px_4px_0px_black] relative overflow-hidden group">
                          <div className="flex justify-between items-center z-10"><span className="font-black text-sm italic uppercase tracking-tighter">#{i+1} {t.name}</span><span className="bg-black text-white px-2 py-0.5 mono text-[9px]">{t.pct.toFixed(1)}%</span></div>
                          <div className="absolute right-[-10%] bottom-[-20%] text-5xl opacity-5 font-black italic">#{i+1}</div>
                        </div>
                      ))}
                      <p className="mono text-[8px] uppercase font-black text-center opacity-40">Top 2 automatically qualify for finals</p>
                   </div>
                </BrutalistCard>
              </div>
           </div>
        )}

        {activeTab === 'INFO' && (
          <div className="space-y-12">
            <BrutalistCard title="TOURNAMENT IDENTITY" variant="white">
               <div className="flex flex-col md:flex-row gap-8 items-center">
                  <div className="flex-1 space-y-6">
                    <div>
                      <label className="mono text-[10px] font-black uppercase text-gray-400">Current Designation</label>
                      {isEditingIdentity ? (
                        <input value={tempTournamentName} onChange={e => setTempTournamentName(e.target.value)} className="text-3xl font-black uppercase bg-white brutalist-border p-4 w-full outline-none focus:bg-yellow-50 shadow-[8px_8px_0px_black]" />
                      ) : (
                        <h3 className="text-5xl font-black uppercase italic tracking-tighter leading-none">{tournament.name}</h3>
                      )}
                    </div>
                    {isEditingIdentity && (
                      <div className="p-4 bg-rose-50 brutalist-border border-rose-600 space-y-4 animate-in slide-in-from-top-4">
                         <p className="font-black uppercase text-[10px] text-rose-600">Verification: Type current name to confirm edit</p>
                         <div className="flex gap-2">
                           <input placeholder="CONFIRM NAME" value={securityInput} onChange={e => setSecurityInput(e.target.value)} className="flex-1 brutalist-border p-3 font-black uppercase text-sm" />
                           <BrutalistButton variant="success" onClick={handleSaveIdentity}>SAVE</BrutalistButton>
                           <BrutalistButton variant="secondary" onClick={() => { setIsEditingIdentity(false); setSecurityInput(''); }}>CANCEL</BrutalistButton>
                         </div>
                      </div>
                    ) : (
                      <BrutalistButton variant="primary" onClick={() => setIsEditingIdentity(true)} compact>Edit Designation</BrutalistButton>
                    )}
                  </div>
                  <div className="w-48 h-48 brutalist-border bg-white flex items-center justify-center p-4 shadow-[10px_10px_0px_black]">
                    {tournament.header.tournamentLogoUrl ? <img src={tournament.header.tournamentLogoUrl} className="max-h-full object-contain" alt="Logo" crossOrigin="anonymous" /> : <span className="font-black text-gray-200 text-6xl">?</span>}
                  </div>
               </div>
            </BrutalistCard>
          </div>
        )}

        {activeTab === 'RESULTS' && (
           <div className="space-y-8 animate-in fade-in">
              <div className="bg-black p-8 brutalist-border text-white shadow-[10px_10px_0px_#f472b6]">
                 <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none">Archives</h2>
                 <p className="mono text-[10px] text-pink-400 mt-2 font-black uppercase">Official Result Verification Protocol</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <BrutalistCard title="MATCH RESULTS" variant="white">
                   <div className="space-y-3">
                      {tournament.matches.filter(m => m.status === 'COMPLETED').length > 0 ? (
                        tournament.matches.filter(m => m.status === 'COMPLETED').slice().reverse().slice(0, 10).map(m => {
                           const t1 = tournament.teams.find(t => t.id === m.team1Id);
                           const t2 = tournament.teams.find(t => t.id === m.team2Id);
                           const winner = tournament.teams.find(t => t.id === m.winnerId);
                           return (
                              <div key={m.id} className="p-3 brutalist-border bg-white flex justify-between items-center shadow-[4px_4px_0px_black]">
                                 <div className="font-black uppercase text-[10px]">R{m.round}: {t1?.name} vs {t2?.name}</div>
                                 <span className={`px-2 py-0.5 brutalist-border font-black text-[9px] uppercase ${m.resultType === 'DRAW' ? 'bg-sky-400' : 'bg-emerald-400'}`}>
                                    {m.resultType === 'DRAW' ? 'DRAWN' : winner?.name}
                                 </span>
                              </div>
                           );
                        })
                      ) : <div className="p-10 text-center text-gray-300 italic uppercase font-black text-xs">No entries.</div>}
                   </div>
                </BrutalistCard>
                <BrutalistCard title="SERIES ARCHIVE" variant="magenta">
                   <div className="space-y-3">
                      {tournament.series?.filter(s => s.status === 'COMPLETED').map(s => {
                         const stats = getDetailedSeriesStats(s.id)!;
                         return (
                            <div key={s.id} className="p-4 bg-white brutalist-border flex justify-between items-center shadow-[4px_4px_0px_black]">
                               <div className="font-black uppercase text-xs italic">{stats.team1?.name} v {stats.team2?.name}</div>
                               <div className="text-right">
                                  <span className="text-emerald-600 font-black uppercase text-[10px] block">WINNER: {stats.winnerName}</span>
                                  <span className="mono text-[9px] text-gray-400">{stats.t1Wins}-{stats.t2Wins}-{stats.draws}</span>
                               </div>
                            </div>
                         );
                      })}
                   </div>
                </BrutalistCard>
              </div>
           </div>
        )}
      </div>

      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 no-print animate-in fade-in">
          <BrutalistCard title="COMMIT RESULT" className="max-w-md w-full bg-white">
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 gap-3">
                {[
                  { id: tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id, name: tournament.teams.find(t => t.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id)?.name },
                  { id: tournament.matches.find(m => m.id === confirmingAction.matchId)?.team2Id, name: tournament.teams.find(t => t.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team2Id)?.name }
                ].map(team => (
                  <button 
                    key={team.id} 
                    onClick={() => setResultForm({...resultForm, winnerId: team.id!, resultType: team.id === tournament.matches.find(m => m.id === confirmingAction.matchId)?.team1Id ? 'T1_WIN' : 'T2_WIN'})}
                    className={`p-4 brutalist-border font-black uppercase transition-all ${resultForm.winnerId === team.id ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}
                  >
                    {team.name} WIN
                  </button>
                ))}
                <button onClick={() => setResultForm({...resultForm, winnerId: '', resultType: 'DRAW'})} className={`p-4 brutalist-border font-black uppercase transition-all ${resultForm.resultType === 'DRAW' ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}>DRAW</button>
              </div>
              <BrutalistButton variant="success" className="w-full" onClick={() => {
                   const updatedMatches = tournament.matches.map(m => m.id === confirmingAction.matchId ? { ...m, status: 'COMPLETED' as const, resultType: resultForm.resultType, winnerId: resultForm.winnerId } : m);
                   const updatedSeries = tournament.series?.map(s => {
                    const sMs = updatedMatches.filter(m => m.seriesId === s.id);
                    const statusStr = sMs.every(m => m.status === 'COMPLETED') ? 'COMPLETED' : (sMs.some(m => m.status === 'COMPLETED') ? 'IN_PROGRESS' : 'NOT_STARTED');
                    return { ...s, status: statusStr as SeriesGroup['status'] };
                  });
                  onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries });
                  setConfirmingAction(null);
                }}>COMMIT TO RECORD</BrutalistButton>
            </div>
          </BrutalistCard>
        </div>
      )}

      {confirmingAction?.type === 'ADMIN_UNLOCK' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 no-print animate-in fade-in">
          <BrutalistCard title="UNAUTHORIZED OVERRIDE" className="max-w-md w-full bg-white border-rose-600">
            <div className="space-y-4">
              <p className="font-black uppercase text-xs text-rose-600">Enter designation to unlock record</p>
              <input placeholder=" Designation Name" className="w-full brutalist-border p-4 font-black uppercase outline-none" value={securityInput} onChange={e => setSecurityInput(e.target.value)} />
              <div className="flex gap-2">
                <BrutalistButton variant="danger" className="flex-1" onClick={() => {
                   if (securityInput.trim().toLowerCase() !== tournament.name.trim().toLowerCase()) return alert("Security Check Failed.");
                   const updatedMatches = tournament.matches.map(m => m.id === confirmingAction?.matchId ? { ...m, status: 'NOT_STARTED' as const, resultType: undefined, winnerId: undefined } : m);
                   const updatedSeries = tournament.series?.map(s => { const sMs = updatedMatches.filter(m => m.seriesId === s.id); const statusStr = sMs.every(m => m.status === 'COMPLETED') ? 'COMPLETED' : (sMs.some(m => m.status === 'COMPLETED') ? 'IN_PROGRESS' : 'NOT_STARTED'); return { ...s, status: statusStr as SeriesGroup['status'] }; });
                   onUpdateTournament?.({ ...tournament, matches: updatedMatches, series: updatedSeries });
                   setConfirmingAction(null); setSecurityInput('');
                }}>UNLOCK</BrutalistButton>
                <BrutalistButton variant="secondary" className="flex-1" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateY(-5px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .animate-in { animation: slideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
        @media print { .no-print { display: none !important; } }
        .vertical-text { writing-mode: vertical-rl; transform: rotate(180deg); }
        .capture-static { position: static !important; }
        
        /* Smooth Horizontal Scrolling Indicator Overlay */
        .group\\/scroll::after {
          content: '→';
          position: absolute;
          right: 10px;
          bottom: 50%;
          background: black;
          color: white;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          opacity: 0.3;
          pointer-events: none;
          animation: bounceX 2s infinite;
        }
        @keyframes bounceX { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(5px); } }
      `}</style>
    </div>
  );
};

export default TournamentWorkspace;