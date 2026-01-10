import React, { useState, useEffect } from 'react';
import { Tournament, TournamentType, Team, Stadium, TournamentConfig, TournamentHeader } from '../types';
import BrutalistCard from './BrutalistCard';
import BrutalistButton from './BrutalistButton';

const AI_TEAM_NAMES = ["Thunder Gods", "Shadow Strikers", "Neon Knights", "Cyber Challengers", "Void Vipers", "Pixel Pirates", "Binary Batters", "Glitch Guardians"];
const AI_STADIUMS = ["The Grid Arena", "Discord Dome", "Vertex Oval", "Fragment Field", "Matrix Stadium"];

interface CreateTournamentFormProps {
  onCreate: (tournament: Tournament) => void;
}

const CreateTournamentForm: React.FC<CreateTournamentFormProps> = ({ onCreate }) => {
  // Panel 1: Basic Info
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Panel 2: Type
  const [type, setType] = useState<TournamentType>('LIMITED_OVERS');

  // Panel 3: Format Config
  const [seriesLength, setSeriesLength] = useState('3-5');
  const [customSeries, setCustomSeries] = useState('');
  const [overs, setOvers] = useState('20');
  const [customOvers, setCustomOvers] = useState('');

  // Panel 4: Teams
  const [numTeams, setNumTeams] = useState(8);
  const [teams, setTeams] = useState<Team[]>([]);

  // Panel 5: Stadiums
  const [stadiums, setStadiums] = useState<Stadium[]>([]);
  const [currentStadium, setCurrentStadium] = useState('');

  // Panel 6: Structure
  const [scheduleFormat, setScheduleFormat] = useState('SINGLE ROUND ROBIN (SRR)');
  const [playoffSystem, setPlayoffSystem] = useState('SEMI-FINAL SYSTEM (TOP 4)');

  // Panel 7: Header Preview
  const [headerConfig, setHeaderConfig] = useState<TournamentHeader>({
    siteLogoUrl: '',
    tournamentName: '',
    tournamentLogoUrl: '',
    confirmed: false
  });

  // Panel 8: Points
  const [winPts, setWinPts] = useState(2);
  const [drawPts, setDrawPts] = useState(1);
  const [lossPts, setLossPts] = useState(0);

  // Bonus Points
  const [countBonus, setCountBonus] = useState(false);
  const [sWinPts, setSWinPts] = useState(4);
  const [sDrawPts, setSDrawPts] = useState(2);

  // Auto-update point defaults based on tournament type
  useEffect(() => {
    if (type === 'TEST') {
      setWinPts(12);
      setDrawPts(6);
      setLossPts(4);
      setCountBonus(true);
    } else {
      setWinPts(2);
      setDrawPts(1);
      setLossPts(0);
      setCountBonus(false);
    }
  }, [type]);

  // Panel 9: Officials
  const [officials, setOfficials] = useState('');

  // Auto-generate team slots when numTeams changes
  useEffect(() => {
    const newTeams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
      id: `team-${i}`,
      name: teams[i]?.name || '',
      logoUrl: teams[i]?.logoUrl || '',
      owner: teams[i]?.owner || '',
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      matchesTie: 0,
      runsScored: 0,
      oversFaced: 0,
      runsConceded: 0,
      oversBowled: 0,
      penalties: 0,
      points: 0,
    }));
    setTeams(newTeams);
  }, [numTeams]);

  const fillAiTeams = () => {
    setTeams(teams.map((t, i) => ({
      ...t,
      name: AI_TEAM_NAMES[i % AI_TEAM_NAMES.length] + " " + (Math.floor(i / AI_TEAM_NAMES.length) + 1)
    })));
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

  const removeStadium = (id: string, sName: string) => {
    if (confirm(`Are you sure you want to remove "${sName}"?`)) {
      setStadiums(stadiums.filter(st => st.id !== id));
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return alert("Panel 1: Tournament Name Required!");
    if (teams.some(t => !t.name.trim())) return alert("Panel 4: All Team Names Required!");

    const finalTournament: Tournament = {
      id: Date.now().toString(),
      name,
      type,
      createdDate: new Date().toLocaleDateString(),
      teams,
      stadiums,
      matches: [],
      penalties: [],
      teamsCount: teams.length,
      header: headerConfig,
      config: {
        seriesLength: seriesLength === 'Custom' ? customSeries : seriesLength,
        oversPerMatch: type === 'LIMITED_OVERS' ? (overs === 'Custom' ? customOvers : overs) : undefined,
        scheduleFormat,
        playoffSystem,
        pointsForWin: winPts,
        pointsForDraw: drawPts,
        pointsForLoss: lossPts,
        countSeriesBonus: countBonus,
        pointsForSeriesWin: sWinPts,
        pointsForSeriesDraw: sDrawPts,
        officials: officials.split(',').map(s => s.trim())
      }
    };
    onCreate(finalTournament);
  };

  const calcMatches = () => {
    const N = numTeams;
    if (scheduleFormat.includes('SINGLE ROUND ROBIN')) return (N * (N - 1)) / 2;
    if (scheduleFormat.includes('DOUBLE ROUND ROBIN')) return N * (N - 1);
    if (scheduleFormat.includes('KNOCKOUT')) return N - 1;
    return 'CALCULATING...';
  };

  return (
    <div className="space-y-12 pb-32 max-w-5xl mx-auto relative">
      
      {/* PANEL 1 */}
      <BrutalistCard title="PANEL 1: TOURNAMENT BASIC INFORMATION" variant="yellow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block font-black text-xl mb-2">TOURNAMENT NAME *</label>
              <input 
                className="w-full brutalist-border p-4 text-2xl font-black uppercase focus:bg-white outline-none" 
                value={name} onChange={e => setName(e.target.value)} placeholder="E.G. DISCORD ASHES"
              />
            </div>
            <div>
              <label className="block font-black text-sm mb-2">TOURNAMENT LOGO (URL)</label>
              <input 
                className="w-full brutalist-border p-3 mono font-bold outline-none" 
                value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..."
              />
            </div>
          </div>
          <div className="brutalist-border bg-white flex items-center justify-center p-4 min-h-[150px]">
            {logoUrl ? <img src={logoUrl} alt="Logo Preview" className="max-h-32 object-contain" /> : <span className="font-black text-gray-300">LOGO PREVIEW</span>}
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 2 */}
      <BrutalistCard title="PANEL 2: TOURNAMENT TYPE SELECTION" variant="cyan">
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => setType('TEST')}
            className={`p-8 brutalist-border text-3xl font-black uppercase transition-all ${type === 'TEST' ? 'bg-black text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white hover:bg-gray-100 brutalist-shadow'}`}
          >
            TEST MATCH
          </button>
          <button 
            onClick={() => setType('LIMITED_OVERS')}
            className={`p-8 brutalist-border text-3xl font-black uppercase transition-all ${type === 'LIMITED_OVERS' ? 'bg-black text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white hover:bg-gray-100 brutalist-shadow'}`}
          >
            LIMITED OVERS
          </button>
        </div>
      </BrutalistCard>

      {/* PANEL 3 */}
      <BrutalistCard title="PANEL 3: FORMAT CONFIGURATION" variant="magenta">
        {type === 'TEST' ? (
          <div className="space-y-4">
            <label className="block font-black text-xl mb-2">SERIES LENGTH TYPE</label>
            <select className="w-full brutalist-border p-4 font-black text-xl uppercase bg-white" value={seriesLength} onChange={e => setSeriesLength(e.target.value)}>
              <option value="2-5">(2-5) MATCHES</option>
              <option value="3-5">(3-5) MATCHES</option>
              <option value="3-6">(3-6) MATCHES</option>
              <option value="Custom">CUSTOM LENGTH</option>
            </select>
            {seriesLength === 'Custom' && (
              <input className="w-full brutalist-border p-4 font-black uppercase bg-white mt-2" placeholder="E.G. 10 MATCH SERIES" value={customSeries} onChange={e => setCustomSeries(e.target.value)} />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block font-black text-xl mb-2">OVERS PER MATCH</label>
            <select className="w-full brutalist-border p-4 font-black text-xl uppercase bg-white" value={overs} onChange={e => setOvers(e.target.value)}>
              <option value="5">5 OVERS</option>
              <option value="10">10 OVERS</option>
              <option value="15">15 OVERS</option>
              <option value="20">20 OVERS</option>
              <option value="Custom">CUSTOM OVERS</option>
            </select>
            {overs === 'Custom' && (
              <input className="w-full brutalist-border p-4 font-black uppercase bg-white mt-2" placeholder="WRITE OVERS" value={customOvers} onChange={e => setCustomOvers(e.target.value)} />
            )}
          </div>
        )}
      </BrutalistCard>

      {/* PANEL 4 */}
      <BrutalistCard title="PANEL 4: TEAMS CONFIGURATION" variant="lime">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <label className="font-black text-xl">NUM OF TEAMS:</label>
              <input 
                type="number" min="2" max="32" value={numTeams} 
                onChange={e => setNumTeams(Number(e.target.value))}
                className="brutalist-border p-2 w-24 text-center font-black text-xl"
              />
            </div>
            <BrutalistButton variant="secondary" onClick={fillAiTeams}>FILL AI TEAM NAMES</BrutalistButton>
          </div>
          
          <div className="brutalist-border bg-white overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black text-white">
                <tr>
                  <th className="p-3 border-r border-white">TEAM #</th>
                  <th className="p-3 border-r border-white">TEAM NAME</th>
                  <th className="p-3 border-r border-white">LOGO URL</th>
                  <th className="p-3">OWNER</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={t.id} className="border-b-2 border-black">
                    <td className="p-3 font-black mono text-center bg-gray-100">{i+1}</td>
                    <td className="p-2 border-r border-black">
                      <input 
                        className="w-full p-2 uppercase font-bold outline-none focus:bg-yellow-50" 
                        value={t.name} onChange={e => {
                          const nt = [...teams];
                          nt[i].name = e.target.value;
                          setTeams(nt);
                        }}
                      />
                    </td>
                    <td className="p-2 border-r border-black">
                      <input 
                        className="w-full p-2 mono text-xs outline-none focus:bg-yellow-50" 
                        value={t.logoUrl} onChange={e => {
                          const nt = [...teams];
                          nt[i].logoUrl = e.target.value;
                          setTeams(nt);
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        className="w-full p-2 uppercase font-bold outline-none focus:bg-yellow-50" 
                        value={t.owner} onChange={e => {
                          const nt = [...teams];
                          nt[i].owner = e.target.value;
                          setTeams(nt);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 5 */}
      <BrutalistCard title="PANEL 5: STADIUM / VENUE SETUP" className="bg-orange-100">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input 
              className="flex-grow brutalist-border p-4 font-black uppercase bg-white outline-none" 
              placeholder="ADD STADIUM NAME" value={currentStadium} onChange={e => setCurrentStadium(e.target.value)}
            />
            <BrutalistButton variant="success" onClick={addStadium}>ADD</BrutalistButton>
            <BrutalistButton variant="primary" onClick={fillAiStadiums}>AI STADIUMS</BrutalistButton>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stadiums.map((s, i) => (
              <div key={s.id} className="brutalist-border p-3 bg-white flex justify-between items-center group hover:bg-rose-50 transition-colors">
                <span className="font-black uppercase tracking-tighter">{i+1}. {s.name}</span>
                <button onClick={() => removeStadium(s.id, s.name)} className="text-rose-600 font-black opacity-0 group-hover:opacity-100 text-xs hover:underline">REMOVE</button>
              </div>
            ))}
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 6 */}
      <BrutalistCard title="PANEL 6: STRUCTURE & PLAYOFF SELECTION" className="bg-purple-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="block font-black text-xl">SCHEDULE FORMAT</label>
            <select className="w-full brutalist-border p-4 font-black uppercase bg-white" value={scheduleFormat} onChange={e => setScheduleFormat(e.target.value)}>
              <option>SINGLE ROUND ROBIN (SRR)</option>
              <option>DOUBLE ROUND ROBIN (DRR)</option>
              <option>1.5 ROUND ROBIN</option>
              <option>PARTIAL ROUND ROBIN</option>
              <option>GROUP STAGE ROUND ROBIN</option>
              <option>SUPER STAGE</option>
              <option>ROUND ROBIN + FINAL</option>
              <option>ROUND ROBIN + PLAYOFFS (TOP 4)</option>
              <option>PAGE PLAYOFF SYSTEM (IPL STYLE)</option>
              <option>KNOCKOUT (SINGLE ELIMINATION)</option>
              <option>DOUBLE ELIMINATION</option>
            </select>
            <div className="bg-black text-white p-4 brutalist-border shadow-[4px_4px_0px_white]">
              <p className="mono text-xs mb-1">LIVE MATHEMATICS:</p>
              <p className="text-2xl font-black uppercase">EST. MATCHES: {calcMatches()}</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block font-black text-xl">PLAYOFF SYSTEM</label>
            <select className="w-full brutalist-border p-4 font-black uppercase bg-white" value={playoffSystem} onChange={e => setPlayoffSystem(e.target.value)}>
              <option>FINAL ONLY (TOP 2 FINAL)</option>
              <option>SEMI-FINAL SYSTEM (TOP 4)</option>
              <option>PAGE PLAYOFF SYSTEM (IPL STYLE)</option>
              <option>KNOCKOUT PLAYOFF (TOP 8 / TOP 16)</option>
              <option>DOUBLE ELIMINATION PLAYOFF</option>
              <option>SUPER LEAGUE PLAYOFF</option>
              <option>STEPLADDER PLAYOFF</option>
              <option>QUALIFIER + FINAL (TOP 3)</option>
              <option>SUPER OVER PLAYOFF (TIE-BREAK)</option>
            </select>
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 8: POINTS FORMULA */}
      <BrutalistCard title="PANEL 8: POINTS FORMULA & SERIES BONUS" variant="blue">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Match Points Section */}
          <div className="space-y-6">
            <h4 className="font-black uppercase text-sm border-b-4 border-black pb-2">Match Point Allocation</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block font-black uppercase text-[10px] mb-1">WIN</label>
                <input type="number" className="w-full brutalist-border p-4 font-black text-2xl" value={winPts} onChange={e => setWinPts(Number(e.target.value))} />
              </div>
              <div>
                <label className="block font-black uppercase text-[10px] mb-1">DRAW</label>
                <input type="number" className="w-full brutalist-border p-4 font-black text-2xl" value={drawPts} onChange={e => setDrawPts(Number(e.target.value))} />
              </div>
              <div>
                <label className="block font-black uppercase text-[10px] mb-1">LOSS</label>
                <input type="number" className="w-full brutalist-border p-4 font-black text-2xl" value={lossPts} onChange={e => setLossPts(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Series Bonus Section */}
          <div className="space-y-6 bg-white/50 p-4 brutalist-border border-dashed">
            <h4 className="font-black uppercase text-sm border-b-4 border-black pb-2">Series Bonus Points</h4>
            <div className="space-y-4">
               <div className="flex items-center justify-between gap-4">
                 <label className="font-black uppercase text-xs">COUNT SERIES BONUS?</label>
                 <select 
                    className="flex-grow brutalist-border p-2 font-black uppercase bg-white outline-none"
                    value={countBonus ? 'YES' : 'NO'}
                    onChange={e => setCountBonus(e.target.value === 'YES')}
                 >
                   <option value="YES">YES</option>
                   <option value="NO">NO</option>
                 </select>
               </div>
               
               {countBonus && (
                 <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                   <div>
                     <label className="block font-black uppercase text-[10px] mb-1">SERIES WIN (+PTS)</label>
                     <input type="number" className="w-full brutalist-border p-4 font-black text-xl" value={sWinPts} onChange={e => setSWinPts(Number(e.target.value))} />
                   </div>
                   <div>
                     <label className="block font-black uppercase text-[10px] mb-1">SERIES DRAW (+PTS)</label>
                     <input type="number" className="w-full brutalist-border p-4 font-black text-xl" value={sDrawPts} onChange={e => setSDrawPts(Number(e.target.value))} />
                   </div>
                 </div>
               )}
            </div>
          </div>
        </div>
      </BrutalistCard>

      {/* PANEL 7 */}
      <BrutalistCard title="PANEL 7: CREATE HEADER" variant="white">
        <div className="grid grid-cols-3 gap-4 mb-6 border-b-4 border-black pb-8">
          <div className="flex flex-col items-center gap-2">
            <div className="w-full h-24 brutalist-border bg-white flex items-center justify-center p-2 text-center overflow-hidden">
               {headerConfig.siteLogoUrl ? <img src={headerConfig.siteLogoUrl} className="max-h-full" /> : <span className="mono text-[10px] uppercase font-bold text-gray-300">SITE LOGO (UPLOAD)</span>}
            </div>
            <input placeholder="URL" className="w-full brutalist-border p-1 text-[10px]" onChange={e => setHeaderConfig({...headerConfig, siteLogoUrl: e.target.value})} />
            <span className="font-black text-[10px] uppercase">SITE LOGO</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-full h-24 brutalist-border bg-white flex items-center justify-center p-2 text-center">
               <span className="font-black uppercase text-sm leading-tight">{headerConfig.tournamentName || name || "WRITE TOURNAMENT NAME"}</span>
            </div>
            <input placeholder="NAME" className="w-full brutalist-border p-1 text-[10px]" onChange={e => setHeaderConfig({...headerConfig, tournamentName: e.target.value})} />
            <span className="font-black text-[10px] uppercase">HEADER TITLE</span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="w-full h-24 brutalist-border bg-white flex items-center justify-center p-2 text-center overflow-hidden">
               {headerConfig.tournamentLogoUrl ? <img src={headerConfig.tournamentLogoUrl} className="max-h-full" /> : <span className="mono text-[10px] uppercase font-bold text-gray-300">TOURNAMENT LOGO</span>}
            </div>
            <input placeholder="URL" className="w-full brutalist-border p-1 text-[10px]" onChange={e => setHeaderConfig({...headerConfig, tournamentLogoUrl: e.target.value})} />
            <span className="font-black text-[10px] uppercase">TOURNEY LOGO</span>
          </div>
        </div>
        <div className="flex justify-between items-end">
          <div className="mono text-[10px] space-y-1">
            <p>SITE NAME: CRICKET ASSOCIATION OF DISCORD</p>
            <p>DETAILS: {type} | {numTeams} TEAMS</p>
            <p>JOIN DISCORD: discord.gg/cad</p>
          </div>
          <BrutalistButton variant={headerConfig.confirmed ? 'success' : 'primary'} onClick={() => setHeaderConfig({...headerConfig, confirmed: !headerConfig.confirmed})}>
            {headerConfig.confirmed ? 'HEADER CONFIRMED!' : 'CONFIRM HEADER'}
          </BrutalistButton>
        </div>
      </BrutalistCard>

      {/* PANEL 9 */}
      <BrutalistCard title="PANEL 9: OFFICIALS / PANELISTS" className="bg-teal-100">
        <div className="space-y-4">
          <p className="mono text-xs font-bold uppercase">Enter authorized operator usernames separated by commas</p>
          <textarea 
            className="w-full brutalist-border p-4 h-24 font-bold mono outline-none" 
            placeholder="USER1#0001, USER2#0002..."
            value={officials}
            onChange={e => setOfficials(e.target.value)}
          />
        </div>
      </BrutalistCard>

      {/* STICKY FOOTER */}
      <div className="sticky bottom-0 left-0 right-0 z-50 bg-gray-200/90 backdrop-blur-md -mx-4 md:-mx-10 px-4 md:px-10 py-6 border-t-4 border-black">
        <button 
          onClick={handleSubmit}
          className="w-full brutalist-border bg-black text-white p-6 md:p-10 text-3xl md:text-5xl font-black uppercase tracking-tighter hover:bg-yellow-400 hover:text-black transition-all brutalist-shadow active:translate-y-1 active:shadow-none"
        >
          CREATE TOURNAMENT NOW
        </button>
      </div>

    </div>
  );
};

export default CreateTournamentForm;