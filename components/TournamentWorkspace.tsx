
import React, { useState, useMemo } from 'react';
import { Tournament, WorkspaceTab, Team, Match, MatchResultType, PenaltyRecord } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';

interface TournamentWorkspaceProps {
  tournament: Tournament;
  onExit: () => void;
  onUpdateTournament?: (updated: Tournament) => void;
}

// Utility: Convert overs to true decimal (e.g., 19.3 -> 19.5)
const toTrueOvers = (overs: number): number => {
  const integerPart = Math.floor(overs);
  const balls = Math.round((overs - integerPart) * 10);
  return integerPart + (balls / 6);
};

const TournamentWorkspace: React.FC<TournamentWorkspaceProps> = ({ tournament, onExit, onUpdateTournament }) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('SCHEDULE'); // Schedule opens first as per spec
  const [selectedRoundNum, setSelectedRoundNum] = useState<number>(1);
  const [securityInput, setSecurityInput] = useState('');
  
  // Modals/Actions
  const [confirmingAction, setConfirmingAction] = useState<{ 
    type: 'SAVE_RESULT' | 'REGENERATE_SCHEDULE' | 'PENALTY', 
    matchId?: string, 
    teamId?: string 
  } | null>(null);

  // Result Entry Form State (LO)
  const [loForm, setLoForm] = useState({
    t1Runs: 0, t1Wickets: 0, t1Overs: 0.0,
    t2Runs: 0, t2Wickets: 0, t2Overs: 0.0,
    notes: '', tossWinnerId: '', isDls: false
  });

  // Test Result Form State
  const [testResult, setTestResult] = useState<MatchResultType | ''>('');

  const isLO = tournament.type === 'LIMITED_OVERS';

  // --- SCHEDULE GENERATION (ROUND ROBIN) ---
  const handleRegenerateSchedule = () => {
    if (securityInput !== tournament.name) return alert("Validation Failed! Type tournament name exactly.");
    
    const teams = tournament.teams;
    if (teams.length < 2) return alert("Need at least 2 teams!");

    const matches: Match[] = [];
    const teamPool = [...teams];
    if (teamPool.length % 2 !== 0) teamPool.push({ id: 'BYE', name: 'BYE' } as any);
    
    const numRounds = teamPool.length - 1;
    const matchesPerRound = teamPool.length / 2;

    for (let r = 0; r < numRounds; r++) {
      for (let m = 0; m < matchesPerRound; m++) {
        const t1 = teamPool[m];
        const t2 = teamPool[teamPool.length - 1 - m];
        
        if (t1.id !== 'BYE' && t2.id !== 'BYE') {
          const venue = tournament.stadiums[Math.floor(Math.random() * tournament.stadiums.length)];
          
          if (isLO) {
            matches.push({
              id: `M-R${r + 1}-${m}-${Date.now()}`,
              round: r + 1,
              team1Id: t1.id,
              team2Id: t2.id,
              venueId: venue?.id || 'neutral',
              status: 'NOT_STARTED'
            });
          } else {
            // Test Mode: Series Logic (already existing or placeholder)
            const seriesId = `SERIES-${t1.id}-${t2.id}-${r}`;
            const sLen = parseInt(tournament.config.seriesLength?.split('-')[0] || '3');
            for (let i = 0; i < sLen; i++) {
              matches.push({
                id: `M-R${r + 1}-S${seriesId}-T${i + 1}`,
                round: r + 1,
                seriesId,
                team1Id: t1.id,
                team2Id: t2.id,
                venueId: venue?.id || 'neutral',
                status: 'NOT_STARTED'
              });
            }
          }
        }
      }
      teamPool.splice(1, 0, teamPool.pop()!);
    }

    onUpdateTournament?.({ ...tournament, matches });
    setConfirmingAction(null);
    setSecurityInput('');
  };

  // --- STANDINGS CALCULATION ---
  const standings = useMemo(() => {
    const teamsData = tournament.teams.map(team => {
      const teamMatches = tournament.matches.filter(m => (m.team1Id === team.id || m.team2Id === team.id));
      const completed = teamMatches.filter(m => m.status === 'COMPLETED');
      
      let mp = 0, mw = 0, ml = 0, mt = 0, nr = 0, pts = 0;
      let runsScored = 0, oversFaced = 0, runsConceded = 0, oversBowled = 0;
      let form: string[] = [];

      completed.forEach(m => {
        mp++;
        const isT1 = m.team1Id === team.id;
        const res = m.resultType;
        const maxOvers = parseFloat(tournament.config.oversPerMatch || '20');

        if ((isT1 && res === 'T1_WIN') || (!isT1 && res === 'T2_WIN')) {
          mw++; pts += tournament.config.pointsForWin; form.push('W');
        } else if (res === 'TIE') {
          mt++; pts += 1; form.push('T');
        } else if (res === 'NO_RESULT' || res === 'ABANDONED') {
          nr++; pts += 1; form.push('NR');
        } else if (res === 'DRAW') {
          pts += tournament.config.pointsForDraw; form.push('D');
        } else {
          ml++; pts += tournament.config.pointsForLoss; form.push('L');
        }

        // NRR Logic (LO Only)
        if (isLO && m.t1Runs !== undefined && m.t2Runs !== undefined) {
          const rS = isT1 ? m.t1Runs : m.t2Runs;
          const wS = isT1 ? m.t1Wickets : m.t2Wickets;
          const oS = isT1 ? (m.t1Overs || 0) : (m.t2Overs || 0);

          const rC = isT1 ? m.t2Runs : m.t1Runs;
          const wC = isT1 ? m.t2Wickets : m.t1Wickets;
          const oC = isT1 ? (m.t2Overs || 0) : (m.t1Overs || 0);

          runsScored += rS;
          runsConceded += rC;

          // All-out rule: If wickets = 10, use full match overs for that innings in NRR
          oversFaced += (wS === 10) ? maxOvers : toTrueOvers(oS);
          oversBowled += (wC === 10) ? maxOvers : toTrueOvers(oC);
        }
      });

      const totalPenalties = tournament.penalties.filter(p => p.teamId === team.id).reduce((sum, p) => sum + p.points, 0);
      const finalPts = Math.max(0, pts - totalPenalties);
      const winPct = mp > 0 ? (mw / mp) * 100 : 0;
      const nrr = (oversFaced > 0 && oversBowled > 0) ? (runsScored / oversFaced) - (runsConceded / oversBowled) : 0;

      return { 
        ...team, mp, mw, ml, mt, nr, pts: finalPts, nrr, winPct, 
        penalties: totalPenalties,
        form: form.slice(-5).reverse() 
      };
    });

    return teamsData.sort((a, b) => {
      if (isLO) {
        return (b.pts - a.pts) || (b.nrr - a.nrr) || (b.mw - a.mw) || a.name.localeCompare(b.name);
      } else {
        return (b.pct || 0) - (a.pct || 0) || (b.pts - a.pts);
      }
    });
  }, [tournament.matches, tournament.teams, tournament.penalties, tournament.config, isLO]);

  // --- RESULT PERSISTENCE ---
  const saveMatchResult = () => {
    const matchId = confirmingAction?.matchId;
    if (!matchId) return;

    const match = tournament.matches.find(m => m.id === matchId)!;
    let updatedMatch: Match = { ...match };

    if (isLO) {
      const { t1Runs, t1Wickets, t1Overs, t2Runs, t2Wickets, t2Overs } = loForm;
      
      // Validation
      const maxO = parseFloat(tournament.config.oversPerMatch || '20');
      if (t1Overs > maxO || t2Overs > maxO) return alert(`Overs cannot exceed ${maxO}`);
      if (t1Wickets > 10 || t2Wickets > 10) return alert("Wickets cannot exceed 10");
      if (t1Runs < 0 || t2Runs < 0) return alert("Runs cannot be negative");

      // Automatic Winner
      let resType: MatchResultType = 'TIE';
      if (t1Runs > t2Runs) resType = 'T1_WIN';
      else if (t2Runs > t1Runs) resType = 'T2_WIN';

      updatedMatch = {
        ...match,
        status: 'COMPLETED',
        resultType: resType,
        t1Runs, t1Wickets, t1Overs,
        t2Runs, t2Wickets, t2Overs,
        notes: loForm.notes,
        tossWinnerId: loForm.tossWinnerId,
        isDlsApplied: loForm.isDls
      };
    } else {
      if (!testResult) return alert("Select a result!");
      updatedMatch = {
        ...match,
        status: 'COMPLETED',
        resultType: testResult as MatchResultType
      };
    }

    onUpdateTournament?.({
      ...tournament,
      matches: tournament.matches.map(m => m.id === matchId ? updatedMatch : m)
    });
    setConfirmingAction(null);
  };

  // --- RENDER TABS ---
  const renderSchedule = () => {
    const rounds = Array.from(new Set(tournament.matches.map(m => m.round))).sort((a, b) => a - b);
    const filteredMatches = tournament.matches.filter(m => m.round === selectedRoundNum);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-black p-4 brutalist-border text-white">
          <div className="flex items-center gap-4">
            <span className="font-black uppercase text-xs">ROUND:</span>
            <select 
              value={selectedRoundNum} 
              onChange={e => setSelectedRoundNum(Number(e.target.value))}
              className="bg-white text-black brutalist-border px-3 py-1 font-black text-xs"
            >
              {rounds.map(r => <option key={r} value={r}>ROUND {r}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <BrutalistButton variant="magenta" compact onClick={() => setConfirmingAction({ type: 'REGENERATE_SCHEDULE' })}>REGENERATE</BrutalistButton>
            <BrutalistButton variant="cyan" compact onClick={() => window.print()}>EXPORT PDF</BrutalistButton>
          </div>
        </div>

        <div className="overflow-x-auto brutalist-border bg-white shadow-[8px_8px_0px_black]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 border-b-4 border-black sticky top-0">
              <tr className="font-black uppercase text-[10px] tracking-widest">
                <th className="p-4 border-r-2 border-black">M.NO</th>
                <th className="p-4 border-r-2 border-black">MATCHUP</th>
                <th className="p-4 border-r-2 border-black">VENUE</th>
                <th className="p-4 border-r-2 border-black">OVERS</th>
                <th className="p-4 border-r-2 border-black text-center">STATUS</th>
                <th className="p-4 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black">
              {filteredMatches.map((m, idx) => {
                const t1 = tournament.teams.find(t => t.id === m.team1Id);
                const t2 = tournament.teams.find(t => t.id === m.team2Id);
                const venue = tournament.stadiums.find(v => v.id === m.venueId);
                
                return (
                  <tr key={m.id} className="hover:bg-yellow-50 transition-colors group">
                    <td className="p-4 font-black mono border-r-2 border-black">#{idx + 1}</td>
                    <td className="p-4 border-r-2 border-black">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-black text-xs brutalist-border">
                          {t1?.name[0]}
                        </div>
                        <span className="font-black uppercase text-sm">{t1?.name}</span>
                        <span className="text-[10px] font-bold text-gray-400 italic">VS</span>
                        <span className="font-black uppercase text-sm">{t2?.name}</span>
                        <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-black text-xs brutalist-border">
                          {t2?.name[0]}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-bold uppercase text-xs border-r-2 border-black text-gray-500">{venue?.name || 'NEUTRAL'}</td>
                    <td className="p-4 font-black mono border-r-2 border-black">{tournament.config.oversPerMatch || 'TEST'}</td>
                    <td className="p-4 border-r-2 border-black text-center">
                      <span className={`px-2 py-1 brutalist-border text-[9px] font-black uppercase ${m.status === 'COMPLETED' ? 'bg-emerald-400' : m.status === 'IN_PROGRESS' ? 'bg-sky-400' : 'bg-gray-300'}`}>
                        {m.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <BrutalistButton 
                        variant="magenta" 
                        compact 
                        onClick={() => {
                          setConfirmingAction({ type: 'SAVE_RESULT', matchId: m.id });
                          if (isLO) {
                            setLoForm({
                              t1Runs: m.t1Runs || 0, t1Wickets: m.t1Wickets || 0, t1Overs: m.t1Overs || 0,
                              t2Runs: m.t2Runs || 0, t2Wickets: m.t2Wickets || 0, t2Overs: m.t2Overs || 0,
                              notes: m.notes || '', tossWinnerId: m.tossWinnerId || '', isDls: m.isDlsApplied || false
                            });
                          } else {
                            setTestResult(m.resultType || '');
                          }
                        }}
                      >
                        {m.status === 'COMPLETED' ? 'EDIT RESULT' : 'ADD RESULT'}
                      </BrutalistButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderStandings = () => {
    return (
      <div className="space-y-6">
        <div className="bg-emerald-400 p-6 brutalist-border flex justify-between items-center shadow-[6px_6px_0px_black]">
          <h2 className="font-black text-4xl uppercase tracking-tighter italic">POINT TABLE</h2>
          <BrutalistButton variant="secondary" compact onClick={() => window.print()}>DOWNLOAD EXCEL</BrutalistButton>
        </div>

        <div className="overflow-x-auto brutalist-border bg-white shadow-[10px_10px_0px_black]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-black text-white text-[10px] uppercase tracking-widest">
              <tr>
                <th className="p-4 border-r border-white/20 text-center">RANK</th>
                <th className="p-4 border-r border-white/20 sticky left-0 bg-black z-10">TEAM NAME</th>
                <th className="p-4 border-r border-white/20 text-center">MP</th>
                <th className="p-4 border-r border-white/20 text-center">W</th>
                <th className="p-4 border-r border-white/20 text-center">T</th>
                <th className="p-4 border-r border-white/20 text-center">L</th>
                <th className="p-4 border-r border-white/20 text-center">NR</th>
                <th className="p-4 border-r border-white/20 text-center bg-gray-900">PTS</th>
                {isLO && <th className="p-4 border-r border-white/20 text-center text-yellow-400">NRR</th>}
                <th className="p-4 border-r border-white/20 text-center">WIN %</th>
                <th className="p-4 text-center">FORM</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black">
              {standings.map((t, i) => {
                const isTop = i < 4;
                return (
                  <tr key={t.id} className={`hover:bg-yellow-50 transition-colors ${isTop ? 'bg-emerald-50' : ''}`}>
                    <td className={`p-4 font-black mono text-center border-r-2 border-black ${i === 0 ? 'bg-yellow-400' : ''}`}>{i + 1}</td>
                    <td className="p-4 font-black uppercase text-sm border-r-2 border-black sticky left-0 bg-white group-hover:bg-inherit z-10">
                      {t.name}
                    </td>
                    <td className="p-4 text-center border-r-2 border-black font-bold mono">{t.mp}</td>
                    <td className="p-4 text-center border-r-2 border-black text-emerald-600 font-bold mono">{t.mw}</td>
                    <td className="p-4 text-center border-r-2 border-black font-bold mono">{t.mt}</td>
                    <td className="p-4 text-center border-r-2 border-black text-rose-600 font-bold mono">{t.ml}</td>
                    <td className="p-4 text-center border-r-2 border-black font-bold mono">{t.nr}</td>
                    <td className="p-4 text-center border-r-2 border-black bg-gray-50 text-xl font-black">{t.pts}</td>
                    {isLO && (
                      <td className={`p-4 text-center border-r-2 border-black font-black mono ${t.nrr >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.nrr >= 0 ? '+' : ''}{t.nrr.toFixed(3)}
                      </td>
                    )}
                    <td className="p-4 text-center border-r-2 border-black font-bold mono">{t.winPct.toFixed(1)}%</td>
                    <td className="p-4">
                      <div className="flex gap-1 justify-center">
                        {t.form.map((f, idx) => (
                          <span key={idx} className={`w-5 h-5 flex items-center justify-center text-[8px] font-black text-white brutalist-border ${f==='W'?'bg-emerald-500':f==='L'?'bg-rose-500':'bg-gray-400'}`}>{f}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-32">
      {/* Header Info */}
      <BrutalistCard variant="white" className="p-0 overflow-hidden border-4">
        <div className="bg-black text-white p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-white brutalist-border p-2 transform rotate-2">
              <img src={tournament.header.tournamentLogoUrl || 'https://via.placeholder.com/100'} alt="Logo" className="max-h-full mx-auto" />
            </div>
            <div>
              <h1 className="text-5xl font-black uppercase tracking-tighter italic">{tournament.name}</h1>
              <p className="mono text-sm tracking-widest text-yellow-400 font-bold">{tournament.type} | {tournament.teams.length} TEAMS | {tournament.config.oversPerMatch} OVERS</p>
            </div>
          </div>
          <div className="flex gap-3">
            <BrutalistButton variant="danger" onClick={onExit} className="px-10 py-4 text-xl">EXIT</BrutalistButton>
            <BrutalistButton variant="primary" className="px-10 py-4 text-xl" onClick={() => window.print()}>REPORT</BrutalistButton>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-t-4 border-black">
          {[
            { id: 'SCHEDULE', label: '1. SCHEDULE' },
            { id: 'RESULTS', label: '2. RESULTS' },
            { id: 'POINTS', label: '3. POINT TABLE' },
            { id: 'INFO', label: '4. INFO' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as WorkspaceTab)}
              className={`p-4 font-black uppercase text-sm border-r-4 border-black last:border-r-0 transition-all ${activeTab === tab.id ? 'bg-yellow-400 text-black translate-x-1 translate-y-1' : 'bg-white hover:bg-gray-100'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </BrutalistCard>

      {/* Main Content Area */}
      <div className="animate-in fade-in duration-500">
        {activeTab === 'SCHEDULE' && renderSchedule()}
        {activeTab === 'POINTS' && renderStandings()}
        {activeTab === 'RESULTS' && (
          <div className="p-20 text-center border-8 border-dashed border-black/10 bg-white/50">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter opacity-20">Access via Schedule Tab</h2>
            <p className="mono text-xs font-bold opacity-30 mt-2">Click "ADD RESULT" on any fixture in the schedule</p>
          </div>
        )}
        {activeTab === 'INFO' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <BrutalistCard title="SYSTEM LOGS" variant="cyan">
              <div className="space-y-2 mono text-xs">
                <p>[{new Date().toISOString()}] MODULE LOADED</p>
                <p>[SYSTEM] {tournament.type} ENGINE ACTIVE</p>
                <p>[DB] {tournament.matches.length} FIXTURES FOUND</p>
              </div>
            </BrutalistCard>
            <BrutalistCard title="CONFIG DETAILS" variant="magenta">
              <div className="space-y-1 mono text-[10px] uppercase font-bold">
                <p>WIN POINTS: {tournament.config.pointsForWin}</p>
                <p>OVERS: {tournament.config.oversPerMatch}</p>
                <p>FORMAT: {tournament.config.scheduleFormat}</p>
              </div>
            </BrutalistCard>
          </div>
        )}
      </div>

      {/* MODAL: LO RESULT ENTRY */}
      {confirmingAction?.type === 'SAVE_RESULT' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in zoom-in duration-200 overflow-y-auto">
          <BrutalistCard 
            title={`RECORD SCORECARD: ${tournament.teams.find(t=>t.id===tournament.matches.find(m=>m.id===confirmingAction.matchId)?.team1Id)?.name} VS ${tournament.teams.find(t=>t.id===tournament.matches.find(m=>m.id===confirmingAction.matchId)?.team2Id)?.name}`}
            className="max-w-2xl w-full bg-white border-8"
          >
            <div className="space-y-6">
              {isLO ? (
                <>
                  <div className="grid grid-cols-2 gap-8">
                    {/* Team 1 Score */}
                    <div className="space-y-4 p-4 brutalist-border bg-emerald-50">
                      <h4 className="font-black uppercase text-xs border-b-2 border-black pb-1">TEAM 1 INNINGS</h4>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase">Runs Scored</label>
                        <input type="number" className="w-full brutalist-border p-2 font-black text-xl" value={loForm.t1Runs} onChange={e => setLoForm({...loForm, t1Runs: parseInt(e.target.value) || 0})} />
                        <label className="block text-[10px] font-black uppercase">Wickets Lost</label>
                        <input type="number" max="10" className="w-full brutalist-border p-2 font-black text-xl" value={loForm.t1Wickets} onChange={e => setLoForm({...loForm, t1Wickets: parseInt(e.target.value) || 0})} />
                        <label className="block text-[10px] font-black uppercase">Overs Faced</label>
                        <input type="number" step="0.1" className="w-full brutalist-border p-2 font-black text-xl" value={loForm.t1Overs} onChange={e => setLoForm({...loForm, t1Overs: parseFloat(e.target.value) || 0})} />
                      </div>
                    </div>
                    {/* Team 2 Score */}
                    <div className="space-y-4 p-4 brutalist-border bg-rose-50">
                      <h4 className="font-black uppercase text-xs border-b-2 border-black pb-1">TEAM 2 INNINGS</h4>
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase">Runs Scored</label>
                        <input type="number" className="w-full brutalist-border p-2 font-black text-xl" value={loForm.t2Runs} onChange={e => setLoForm({...loForm, t2Runs: parseInt(e.target.value) || 0})} />
                        <label className="block text-[10px] font-black uppercase">Wickets Lost</label>
                        <input type="number" max="10" className="w-full brutalist-border p-2 font-black text-xl" value={loForm.t2Wickets} onChange={e => setLoForm({...loForm, t2Wickets: parseInt(e.target.value) || 0})} />
                        <label className="block text-[10px] font-black uppercase">Overs Faced</label>
                        <input type="number" step="0.1" className="w-full brutalist-border p-2 font-black text-xl" value={loForm.t2Overs} onChange={e => setLoForm({...loForm, t2Overs: parseFloat(e.target.value) || 0})} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black uppercase">Match Notes</label>
                    <textarea 
                      className="w-full brutalist-border p-2 font-black mono text-xs h-20" 
                      value={loForm.notes} 
                      onChange={e => setLoForm({...loForm, notes: e.target.value})}
                      placeholder="e.g. DLS applied, Rain reduced match to 15 overs"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-4 py-10">
                  <label className="block font-black text-xl uppercase text-center">CHOOSE RESULT</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['T1_WIN', 'T2_WIN', 'DRAW', 'TIE', 'NO_RESULT', 'ABANDONED'].map(r => (
                      <button 
                        key={r}
                        onClick={() => setTestResult(r as MatchResultType)}
                        className={`p-4 brutalist-border font-black uppercase text-[10px] ${testResult === r ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'}`}
                      >
                        {r.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4 border-t-4 border-black">
                <BrutalistButton variant="success" className="flex-1 py-4 text-xl" onClick={saveMatchResult}>FINALIZE RESULT</BrutalistButton>
                <BrutalistButton variant="secondary" className="flex-1 py-4 text-xl" onClick={() => setConfirmingAction(null)}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

      {/* MODAL: REGENERATE SCHEDULE */}
      {confirmingAction?.type === 'REGENERATE_SCHEDULE' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <BrutalistCard title="⚠️ CRITICAL ACTION: REGENERATE SCHEDULE" className="max-w-md w-full border-rose-600 bg-white">
            <div className="space-y-4">
              <p className="font-black uppercase text-xs text-rose-600">This will wipe all current matches and results! Recovery is impossible.</p>
              <div className="bg-rose-100 p-2 border-2 border-dashed border-rose-600 font-black text-center uppercase text-xs text-rose-700">
                Type: {tournament.name}
              </div>
              <input 
                className="w-full brutalist-border p-4 font-black uppercase text-center"
                value={securityInput}
                onChange={e => setSecurityInput(e.target.value)}
                placeholder="TOURNAMENT NAME"
              />
              <div className="flex gap-2">
                <BrutalistButton variant="danger" className="flex-1" onClick={handleRegenerateSchedule}>REGENERATE</BrutalistButton>
                <BrutalistButton variant="secondary" className="flex-1" onClick={() => { setConfirmingAction(null); setSecurityInput(''); }}>CANCEL</BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}

    </div>
  );
};

export default TournamentWorkspace;
