
import React, { useState, useEffect, useMemo } from 'react';
import { Tournament, TournamentType, Team, Stadium, TournamentConfig, SeriesGroup, Match, ResultLog } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';

const AI_TEAM_NAMES = ["Thunder Gods", "Shadow Strikers", "Neon Knights", "Cyber Challengers", "Void Vipers", "Pixel Pirates", "Binary Batters", "Glitch Guardians"];
const AI_TEAM_COLORS = ["#fb2c36", "#4ade80", "#3b82f6", "#facc15", "#a855f7", "#ec4899", "#06b6d4", "#f97316"];
const AI_STADIUMS = ["The Grid Arena", "Discord Dome", "Vertex Oval", "Fragment Field", "Matrix Stadium"];

interface CreateTournamentFormProps {
  onCreate: (tournament: Tournament) => void;
}

const CreateTournamentForm: React.FC<CreateTournamentFormProps> = ({ onCreate }) => {
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [type] = useState<TournamentType>('TEST');
  
  // Series Length Config
  const [seriesLengthPreset, setSeriesLengthPreset] = useState('3-5');
  const [minMatches, setMinMatches] = useState(3);
  const [maxMatches, setMaxMatches] = useState(5);
  
  const [numTeams, setNumTeams] = useState(8);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stadiums, setStadiums] = useState<Stadium[]>([]);
  const [currentStadium, setCurrentStadium] = useState('');
  const [scheduleFormat] = useState('SINGLE ROUND ROBIN (SRR)');
  const [playoffSystem] = useState('WTC FINAL (TOP 2 AT NEUTRAL VENUE)');

  // Matrix State: Matrix[teamIndex][teamIndex] = matchCount
  const [matrix, setMatrix] = useState<number[][]>([]);

  // Points State
  const [winPts, setWinPts] = useState(12);
  const [drawPts, setDrawPts] = useState(6);
  const [lossPts, setLossPts] = useState(4);
  const [countBonus, setCountBonus] = useState(true);
  const [sWinPts, setSWinPts] = useState(6);
  const [sDrawPts, setSDrawPts] = useState(3);
  const [sLossPts, setSLossPts] = useState(1.5);
  
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize Teams
  useEffect(() => {
    setTeams(prevTeams => {
      const newTeams: Team[] = Array.from({ length: numTeams }, (_, i) => {
        if (prevTeams[i]) return prevTeams[i];
        return {
          id: `team-${Date.now()}-${i}`,
          name: '',
          shortName: '',
          logoUrl: '',
          color: '#ffffff',
          owner: '',
          seriesPlayed: 0,
          matchesPlayed: 0,
          matchesWon: 0,
          matchesLost: 0,
          matchesDrawn: 0,
          matchesTie: 0,
          matchesNR: 0,
          basePoints: 0,
          bonusPoints: 0,
          penaltyPoints: 0,
          totalPoints: 0,
          pct: 0,
        };
      });
      return newTeams;
    });
  }, [numTeams]);

  // Handle Preset Changes
  useEffect(() => {
    if (seriesLengthPreset !== 'Custom') {
      const parts = seriesLengthPreset.split('-');
      if (parts.length === 2) {
        const min = Number(parts[0]);
        const max = Number(parts[1]);
        setMinMatches(min);
        setMaxMatches(max);
      }
    }
  }, [seriesLengthPreset]);

  // Initialize/Regenerate Matrix
  const generateMatrix = () => {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
      const tempMatrix = Array.from({ length: numTeams }, () => Array(numTeams).fill(0));
      for (let i = 0; i < numTeams; i++) {
        for (let j = i + 1; j < numTeams; j++) {
          const count = Math.floor(Math.random() * (maxMatches - minMatches + 1)) + minMatches;
          tempMatrix[i][j] = count;
          tempMatrix[j][i] = count;
        }
      }
      
      const totals = tempMatrix.map(row => row.reduce((a, b) => a + b, 0));
      const counts: Record<number, number> = {};
      let valid = true;
      for (const t of totals) {
        counts[t] = (counts[t] || 0) + 1;
        if (counts[t] > 2) {
          valid = false;
          break;
        }
      }
      
      if (valid || attempts === maxAttempts - 1) {
        setMatrix(tempMatrix);
        break;
      }
      attempts++;
    }
  };

  useEffect(() => {
    if (teams.length === numTeams) {
      generateMatrix();
    }
  }, [numTeams, minMatches, maxMatches, teams.length]);

  const updateMatrixCell = (i: number, j: number, val: number) => {
    if (i === j) return;
    const newVal = Math.max(minMatches, Math.min(maxMatches, val));
    const newMatrix = matrix.map(row => [...row]);
    if (newMatrix[i] && newMatrix[j]) {
        newMatrix[i][j] = newVal;
        newMatrix[j][i] = newVal;
        setMatrix(newMatrix);
    }
  };

  const teamTotals = useMemo(() => {
    return matrix.map(row => row.reduce((a, b) => a + b, 0));
  }, [matrix]);

  const distributionWarning = useMemo(() => {
    if (teamTotals.length === 0) return null;
    const avg = teamTotals.reduce((a, b) => a + b, 0) / teamTotals.length;
    const warnings = [];
    for (let i = 0; i < teamTotals.length; i++) {
      const diff = Math.abs(teamTotals[i] - avg) / avg;
      if (diff > 0.4) {
        warnings.push(`${teams[i]?.shortName || teams[i]?.name || 'Team '+(i+1)} has ${teamTotals[i]} matches (deviation >40% from avg ${avg.toFixed(1)})`);
      }
    }
    return warnings;
  }, [teamTotals, teams]);

  const handleImageUpload = (file: File | null, callback: (base64: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => callback(reader.result as string);
    reader.readAsDataURL(file);
  };

  const fillAiTeams = () => {
    setTeams(teams.map((t, i) => {
      const generatedName = AI_TEAM_NAMES[i % AI_TEAM_NAMES.length] + " " + (Math.floor(i / AI_TEAM_NAMES.length) + 1);
      return {
        ...t,
        name: generatedName,
        shortName: generatedName.split(' ').map(s => s[0]).join('').substring(0, 3).toUpperCase(),
        color: AI_TEAM_COLORS[i % AI_TEAM_COLORS.length]
      };
    }));
  };

  const fillAiStadiums = () => {
    setStadiums(AI_STADIUMS.map(s => ({ id: Math.random().toString(), name: s })));
  };

  const addStadium = () => {
    if (currentStadium.trim()) {
      setStadiums([...stadiums, { id: Date.now().toString(), name: currentStadium }]);
      setCurrentStadium('');
    }
  };

  const generateFixtures = (finalTeams: Team[], config: TournamentConfig, venues: Stadium[]) => {
    const series: SeriesGroup[] = [];
    const matches: Match[] = [];
    
    const n = finalTeams.length;
    const teamIndices = Array.from({ length: n }, (_, i) => i);
    if (n % 2 !== 0) teamIndices.push(-1); // Bye

    const roundsCount = teamIndices.length - 1;
    const matchesPerRound = teamIndices.length / 2;

    for (let r = 0; r < roundsCount; r++) {
      for (let i = 0; i < matchesPerRound; i++) {
        const idx1 = teamIndices[i];
        const idx2 = teamIndices[teamIndices.length - 1 - i];

        if (idx1 !== -1 && idx2 !== -1) {
          const t1Id = finalTeams[idx1].id;
          const t2Id = finalTeams[idx2].id;
          // Ensure matrix bounds
          const matchCount = (matrix[idx1] && matrix[idx1][idx2]) ? matrix[idx1][idx2] : minMatches;
          
          const seriesId = `series-${r}-${idx1}-${idx2}-${Date.now()}`;
          const seriesMatchIds: string[] = [];

          for (let m = 0; m < matchCount; m++) {
            const matchId = `match-${seriesId}-${m}`;
            seriesMatchIds.push(matchId);
            matches.push({
              id: matchId,
              round: r + 1,
              seriesId: seriesId,
              team1Id: t1Id,
              team2Id: t2Id,
              venueId: venues.length > 0 ? venues[(r + m) % venues.length].id : 'default-venue',
              status: 'NOT_STARTED'
            });
          }

          series.push({
            id: seriesId,
            round: r + 1,
            team1Id: t1Id,
            team2Id: t2Id,
            status: 'NOT_STARTED',
            matchIds: seriesMatchIds,
            matchCount: matchCount
          });
        }
      }
      const last = teamIndices.pop();
      if (last !== undefined) {
        teamIndices.splice(1, 0, last);
      }
    }

    return { series, matches };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("Tournament Name Required!");
    if (teams.some(t => !t.name.trim())) return alert("All Team Names Required!");
    if (stadiums.length === 0) return alert("At least one stadium is required!");
    if (matrix.length !== numTeams) return alert("Match matrix not ready. Please try again.");
    
    setIsProcessing(true);
    
    const config: TournamentConfig = {
      seriesLength: seriesLengthPreset === 'Custom' ? `${minMatches}-${maxMatches}` : seriesLengthPreset,
      minMatchesPerSeries: minMatches,
      maxMatchesPerSeries: maxMatches,
      scheduleFormat,
      playoffSystem,
      pointsForWin: winPts,
      pointsForDraw: drawPts,
      pointsForLoss: lossPts,
      countSeriesBonus: countBonus,
      pointsForSeriesWin: sWinPts,
      pointsForSeriesDraw: sDrawPts,
      pointsForSeriesLoss: sLossPts,
      officials: []
    };

    const processedTeams = teams.map(t => ({
      ...t,
      shortName: t.shortName || t.name.substring(0, 3).toUpperCase()
    }));

    const { series, matches } = generateFixtures(processedTeams, config, stadiums);

    const initLog: ResultLog = {
      id: `log-init-${Date.now()}`,
      type: 'SETTING_CHANGE',
      reason: 'Tournament Initialized with Match Matrix',
      adminName: 'System',
      timestamp: new Date().toLocaleString(),
      targetId: 'tournament'
    };

    const finalTournament: Tournament = {
      id: Date.now().toString(),
      name,
      type,
      createdDate: new Date().toLocaleDateString(),
      teams: processedTeams,
      stadiums,
      matches,
      series,
      penalties: [],
      manualBonuses: [],
      logs: [initLog],
      teamsCount: processedTeams.length,
      header: { 
        siteLogoUrl: '', 
        tournamentName: name, 
        tournamentLogoUrl: logoUrl,
        confirmed: true
      },
      config
    };

    setTimeout(() => {
      onCreate(finalTournament);
      setIsProcessing(false);
    }, 800);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-12 pb-32 max-w-7xl mx-auto relative">
      <BrutalistCard title="PANEL 1: TOURNAMENT BASIC INFORMATION" variant="yellow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block font-black text-xl mb-2 text-black">TOURNAMENT NAME *</label>
              <input 
                className="w-full brutalist-border p-4 text-2xl font-black uppercase focus:bg-white outline-none bg-white text-black" 
                value={name} onChange={e => setName(e.target.value)} placeholder="E.G. WTC SEASON 3"
                required
              />
            </div>
            <div>
              <label className="block font-black text-sm mb-2 uppercase text-black">Upload Tournament Logo</label>
              <div className="flex gap-2">
                <input type="file" id="t-logo" className="hidden" accept="image/*" onChange={e => handleImageUpload(e.target.files?.[0] || null, setLogoUrl)} />
                <label htmlFor="t-logo" className="flex-1 brutalist-border bg-white text-black p-3 font-black text-center cursor-pointer hover:bg-yellow-400 text-sm">
                  {logoUrl ? 'CHANGE LOGO' : 'CHOOSE IMAGE'}
                </label>
                {logoUrl && <BrutalistButton type="button" variant="danger" compact onClick={() => setLogoUrl('')}>CLEAR</BrutalistButton>}
              </div>
            </div>
          </div>
          <div className="brutalist-border bg-white flex items-center justify-center p-4 min-h-[150px]">
            {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-32 object-contain" /> : <div className="text-4xl font-black text-gray-200 italic select-none">LOGO PREVIEW</div>}
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 2: SERIES LENGTH RULES" variant="magenta">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="block font-black text-xl mb-2 text-black uppercase">Series Length Options</label>
            <select className="w-full brutalist-border p-4 font-black text-xl uppercase bg-white text-black outline-none" value={seriesLengthPreset} onChange={e => setSeriesLengthPreset(e.target.value)}>
              <option value="2-5">FIXED: 2–5 MATCHES</option>
              <option value="3-5">FIXED: 3–5 MATCHES</option>
              <option value="3-6">FIXED: 3–6 MATCHES</option>
              <option value="Custom">CUSTOM RANGE</option>
            </select>
          </div>
          
          {seriesLengthPreset === 'Custom' && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-left-2">
               <div>
                  <label className="block font-black text-xs mb-2 uppercase text-black">Min Matches (≥ 2)</label>
                  <input type="number" min="2" className="w-full brutalist-border p-4 font-black text-xl bg-white text-black outline-none" value={minMatches} onChange={e => setMinMatches(Math.max(2, Number(e.target.value)))} />
               </div>
               <div>
                  <label className="block font-black text-xs mb-2 uppercase text-black">Max Matches</label>
                  <input type="number" min={minMatches} className="w-full brutalist-border p-4 font-black text-xl bg-white text-black outline-none" value={maxMatches} onChange={e => setMaxMatches(Math.max(minMatches, Number(e.target.value)))} />
               </div>
            </div>
          )}
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 3: TEAMS CONFIGURATION" variant="lime">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <label className="font-black text-xl text-black">NUM OF TEAMS:</label>
              <input type="number" min="2" max="16" value={numTeams} onChange={e => setNumTeams(Number(e.target.value))} className="brutalist-border p-2 w-24 text-center font-black text-xl bg-white text-black outline-none" />
            </div>
            <BrutalistButton type="button" variant="secondary" onClick={fillAiTeams}>AUTO-FILL AI TEAMS</BrutalistButton>
          </div>
          <div className="brutalist-border bg-white overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black text-white uppercase text-[10px]">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">LOGO</th>
                  <th className="p-3">TEAM NAME</th>
                  <th className="p-3">SHORT</th>
                  <th className="p-3">COLOR</th>
                  <th className="p-3">OWNER</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={i} className="border-b border-black">
                    <td className="p-3 font-black mono text-center bg-gray-100 text-black">{i+1}</td>
                    <td className="p-2">
                       <div className="flex items-center gap-2">
                          <input type="file" id={`t-logo-${i}`} className="hidden" accept="image/*" onChange={e => handleImageUpload(e.target.files?.[0] || null, (b64) => {
                             const nt = [...teams]; nt[i].logoUrl = b64; setTeams(nt);
                          })} />
                          <label htmlFor={`t-logo-${i}`} className="w-8 h-8 brutalist-border bg-white flex items-center justify-center cursor-pointer overflow-hidden shadow-[2px_2px_0px_black]">
                             {t.logoUrl ? <img src={t.logoUrl} className="w-full h-full object-contain" alt="L" /> : <span className="text-[10px] text-gray-400">+</span>}
                          </label>
                       </div>
                    </td>
                    <td className="p-2"><input className="w-full p-2 uppercase font-bold outline-none bg-white text-black text-xs" value={t.name} onChange={e => { const nt = [...teams]; nt[i].name = e.target.value; setTeams(nt); }} required /></td>
                    <td className="p-2"><input className="w-full p-2 uppercase font-bold outline-none bg-white text-black text-center text-xs" maxLength={3} value={t.shortName} onChange={e => { const nt = [...teams]; nt[i].shortName = e.target.value.substring(0, 3).toUpperCase(); setTeams(nt); }} /></td>
                    <td className="p-2">
                       <input type="color" className="w-10 h-10 p-0 brutalist-border bg-white cursor-pointer" value={t.color} onChange={e => { const nt = [...teams]; nt[i].color = e.target.value; setTeams(nt); }} />
                    </td>
                    <td className="p-2"><input className="w-full p-2 uppercase font-bold outline-none bg-white text-black text-xs" value={t.owner} onChange={e => { const nt = [...teams]; nt[i].owner = e.target.value; setTeams(nt); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 4: MATCH MATRIX & DISTRIBUTION" variant="blue">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-black uppercase italic text-black">N × N Match Matrix</h3>
            <BrutalistButton type="button" variant="primary" compact onClick={generateMatrix}>REGENERATE MATRIX</BrutalistButton>
          </div>
          
          <div className="overflow-x-auto brutalist-border bg-white p-4">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr>
                  <th className="p-2 bg-black text-white border border-black text-[10px]">TEAM</th>
                  {teams.map((t, i) => (
                    <th key={i} className="p-2 bg-gray-200 border border-black font-black text-[10px] uppercase min-w-[60px] text-black">
                      {t.shortName || `T${i+1}`}
                    </th>
                  ))}
                  <th className="p-2 bg-yellow-400 border border-black font-black text-[10px] uppercase text-black">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, i) => (
                  <tr key={i}>
                    <td className="p-2 bg-gray-200 border border-black font-black text-[10px] uppercase text-black">
                      {teams[i]?.shortName || `T${i+1}`}
                    </td>
                    {row.map((cell, j) => (
                      <td key={j} className={`p-1 border border-black ${i === j ? 'bg-gray-100' : 'bg-white'}`}>
                        {i === j ? (
                          <span className="text-gray-300 font-bold">0</span>
                        ) : (
                          <input 
                            type="number" 
                            min={minMatches} 
                            max={maxMatches} 
                            className="w-full text-center font-black text-sm bg-transparent outline-none focus:bg-blue-50 text-black" 
                            value={cell} 
                            onChange={e => updateMatrixCell(i, j, Number(e.target.value))} 
                          />
                        )}
                      </td>
                    ))}
                    <td className="p-2 bg-yellow-50 border border-black font-black text-sm text-black">
                      {teamTotals[i]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {distributionWarning && distributionWarning.length > 0 && (
            <div className="p-4 bg-orange-50 brutalist-border border-orange-500">
               <h4 className="font-black text-xs uppercase text-orange-700 mb-2">Match Distribution Warnings:</h4>
               <ul className="text-[10px] space-y-1 font-bold list-disc pl-4 text-orange-600">
                  {distributionWarning.map((w, idx) => <li key={idx}>{w}</li>)}
               </ul>
            </div>
          )}

          <div className="space-y-2">
             <label className="block font-black text-sm uppercase text-black italic underline">Series Table Preview</label>
             <div className="max-h-60 overflow-y-auto brutalist-border">
                <table className="w-full text-left text-[10px] uppercase font-bold bg-white">
                   <thead className="bg-black text-white sticky top-0">
                      <tr>
                        <th className="p-2">Series #</th>
                        <th className="p-2">Team 1</th>
                        <th className="p-2">Team 2</th>
                        <th className="p-2">Matches</th>
                        <th className="p-2">Status</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-black/10">
                      {(() => {
                        let seriesIdx = 1;
                        const rows = [];
                        for(let i=0; i<numTeams; i++) {
                          for(let j=i+1; j<numTeams; j++) {
                            const matchCount = (matrix[i] && matrix[i][j]) ? matrix[i][j] : '-';
                            rows.push(
                              <tr key={`${i}-${j}`} className="hover:bg-gray-50 text-black">
                                <td className="p-2 font-black">{seriesIdx++}</td>
                                <td className="p-2">{teams[i]?.name || `Team ${i+1}`}</td>
                                <td className="p-2">{teams[j]?.name || `Team ${j+1}`}</td>
                                <td className="p-2 font-black">{matchCount}</td>
                                <td className="p-2 italic text-gray-400">INCOMPLETE</td>
                              </tr>
                            );
                          }
                        }
                        return rows;
                      })()}
                   </tbody>
                </table>
             </div>
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 5: CUSTOMIZED POINT SYSTEM" variant="cyan">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block font-black text-xs mb-2 uppercase text-black">Per Match Win</label>
              <input type="number" step="0.5" className="w-full brutalist-border p-3 font-black text-xl bg-white text-black outline-none" value={winPts} onChange={e => setWinPts(Number(e.target.value))} />
            </div>
            <div>
              <label className="block font-black text-xs mb-2 uppercase text-black">Per Match Loss</label>
              <input type="number" step="0.5" className="w-full brutalist-border p-3 font-black text-xl bg-white text-black outline-none" value={lossPts} onChange={e => setLossPts(Number(e.target.value))} />
            </div>
            <div>
              <label className="block font-black text-xs mb-2 uppercase text-black">Per Match Draw/Tie</label>
              <input type="number" step="0.5" className="w-full brutalist-border p-3 font-black text-xl bg-white text-black outline-none" value={drawPts} onChange={e => setDrawPts(Number(e.target.value))} />
            </div>
          </div>

          <div className="pt-4 border-t-2 border-black/10">
            <div className="mb-4">
              <label className="block font-black text-sm mb-2 uppercase text-black italic underline">Series Point Bonus System</label>
              <select 
                className="w-full brutalist-border p-3 font-black text-sm uppercase bg-white text-black outline-none" 
                value={countBonus ? 'YES' : 'NO'} 
                onChange={e => setCountBonus(e.target.value === 'YES')}
              >
                <option value="YES">YES - COUNT SERIES POINTS</option>
                <option value="NO">NO - MATCH POINTS ONLY</option>
              </select>
            </div>

            {countBonus && (
              <div className="p-4 bg-black/5 brutalist-border space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block font-black text-[10px] mb-2 uppercase text-black">Per Series Won</label>
                    <input type="number" step="0.5" className="w-full brutalist-border p-3 font-black text-lg bg-white text-black outline-none" value={sWinPts} onChange={e => setSWinPts(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block font-black text-[10px] mb-2 uppercase text-black">Per Series Loss</label>
                    <input type="number" step="0.5" className="w-full brutalist-border p-3 font-black text-lg bg-white text-black outline-none" value={sLossPts} onChange={e => setSLossPts(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block font-black text-[10px] mb-2 uppercase text-black">Per Series Draw</label>
                    <input type="number" step="0.5" className="w-full brutalist-border p-3 font-black text-lg bg-white text-black outline-none" value={sDrawPts} onChange={e => setSDrawPts(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 6: STADIUM SETUP" variant="pink">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input className="flex-grow brutalist-border p-4 font-black uppercase bg-white text-black outline-none" placeholder="ADD STADIUM NAME" value={currentStadium} onChange={e => setCurrentStadium(e.target.value)} />
            <BrutalistButton type="button" variant="success" onClick={addStadium}>ADD</BrutalistButton>
            <BrutalistButton type="button" variant="primary" onClick={fillAiStadiums}>AI STADIUMS</BrutalistButton>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-48 overflow-y-auto p-2">
            {stadiums.map((s, i) => (
              <div key={s.id} className="brutalist-border p-3 bg-white flex justify-between items-center group shadow-[4px_4px_0px_black]">
                <span className="font-black uppercase text-sm text-black">{i+1}. {s.name}</span>
                <button type="button" onClick={() => setStadiums(stadiums.filter(st => st.id !== s.id))} className="text-rose-600 font-black text-xs hover:underline uppercase">REMOVE</button>
              </div>
            ))}
          </div>
        </div>
      </BrutalistCard>

      <div className="sticky bottom-0 left-0 right-0 z-50 bg-gray-200/90 backdrop-blur-md -mx-4 md:-mx-10 px-4 md:px-10 py-6 border-t-4 border-black">
        <button 
          type="submit"
          disabled={isProcessing}
          className={`w-full brutalist-border p-8 md:p-10 text-3xl md:text-5xl font-black uppercase transition-all brutalist-shadow active:translate-y-1 active:shadow-none ${isProcessing ? 'bg-gray-400 cursor-wait' : 'bg-black text-white hover:bg-yellow-400 hover:text-black'}`}
        >
          {isProcessing ? 'GENERATING FIXTURES...' : 'INITIALIZE CHAMPIONSHIP'}
        </button>
      </div>
    </form>
  );
};

export default CreateTournamentForm;
