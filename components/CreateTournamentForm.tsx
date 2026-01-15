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
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [type] = useState<TournamentType>('TEST');
  const [seriesLength, setSeriesLength] = useState('3-5');
  const [customSeries, setCustomSeries] = useState('');
  const [numTeams, setNumTeams] = useState(8);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stadiums, setStadiums] = useState<Stadium[]>([]);
  const [currentStadium, setCurrentStadium] = useState('');
  const [scheduleFormat, setScheduleFormat] = useState('SINGLE ROUND ROBIN (SRR)');
  const [playoffSystem, setPlayoffSystem] = useState('WTC FINAL (TOP 2 AT NEUTRAL VENUE)');
  const [headerConfig] = useState<TournamentHeader>({
    siteLogoUrl: '',
    tournamentName: '',
    tournamentLogoUrl: '',
    confirmed: false
  });

  // Points State
  const [winPts, setWinPts] = useState(12);
  const [drawPts, setDrawPts] = useState(6);
  const [lossPts, setLossPts] = useState(4);
  const [countBonus, setCountBonus] = useState(true);
  const [sWinPts, setSWinPts] = useState(6);
  const [sDrawPts, setSDrawPts] = useState(3);
  const [sLossPts, setSLossPts] = useState(1.5);
  
  const [officials] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize and preserve teams when count changes
  useEffect(() => {
    setTeams(prevTeams => {
      const newTeams: Team[] = Array.from({ length: numTeams }, (_, i) => {
        if (prevTeams[i]) return prevTeams[i];
        return {
          id: `team-${Date.now()}-${i}`,
          name: '',
          shortName: '',
          logoUrl: '',
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

  const handleImageUpload = (file: File | null, callback: (base64: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      callback(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const fillAiTeams = () => {
    setTeams(teams.map((t, i) => {
      const generatedName = AI_TEAM_NAMES[i % AI_TEAM_NAMES.length] + " " + (Math.floor(i / AI_TEAM_NAMES.length) + 1);
      return {
        ...t,
        name: generatedName,
        shortName: generatedName.split(' ').map(s => s[0]).join('').substring(0, 3).toUpperCase()
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

  const removeStadium = (id: string, sName: string) => {
    if (confirm(`Are you sure you want to remove "${sName}"?`)) {
      setStadiums(stadiums.filter(st => st.id !== id));
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return alert("Panel 1: Tournament Name Required!");
    if (teams.some(t => !t.name.trim())) return alert("Panel 3: All Team Names Required!");
    if (teams.some(t => !t.shortName.trim())) return alert("Panel 3: All Short Names Required!");

    setIsProcessing(true);
    
    const finalTournament: Tournament = {
      id: Date.now().toString(),
      name,
      type,
      createdDate: new Date().toLocaleDateString(),
      teams: teams.map(t => ({
        ...t,
        shortName: t.shortName || t.name.substring(0, 3).toUpperCase()
      })),
      stadiums,
      matches: [],
      penalties: [],
      teamsCount: teams.length,
      header: { ...headerConfig, tournamentName: name, tournamentLogoUrl: logoUrl },
      config: {
        seriesLength: seriesLength === 'Custom' ? customSeries : seriesLength,
        scheduleFormat,
        playoffSystem,
        pointsForWin: winPts,
        pointsForDraw: drawPts,
        pointsForLoss: lossPts,
        countSeriesBonus: countBonus,
        pointsForSeriesWin: sWinPts,
        pointsForSeriesDraw: sDrawPts,
        pointsForSeriesLoss: sLossPts,
        officials: officials.split(',').map(s => s.trim())
      }
    };

    setTimeout(() => {
      onCreate(finalTournament);
      setIsProcessing(false);
    }, 500);
  };

  const calcMatches = () => {
    const N = numTeams;
    if (scheduleFormat.includes('SINGLE ROUND ROBIN')) return (N * (N - 1)) / 2;
    if (scheduleFormat.includes('DOUBLE ROUND ROBIN')) return N * (N - 1);
    return 'CALCULATING...';
  };

  return (
    <div className="space-y-12 pb-32 max-w-5xl mx-auto relative">
      <BrutalistCard title="PANEL 1: TOURNAMENT BASIC INFORMATION" variant="yellow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block font-black text-xl mb-2 text-black">TOURNAMENT NAME *</label>
              <input 
                className="w-full brutalist-border p-4 text-2xl font-black uppercase focus:bg-white outline-none bg-white text-black" 
                value={name} onChange={e => setName(e.target.value)} placeholder="E.G. WTC SEASON 3"
              />
            </div>
            <div>
              <label className="block font-black text-sm mb-2 uppercase text-black">Upload Tournament Logo</label>
              <div className="flex gap-2">
                <input 
                  type="file" 
                  id="tournament-logo-upload"
                  className="hidden" 
                  accept="image/*"
                  onChange={e => handleImageUpload(e.target.files?.[0] || null, setLogoUrl)}
                />
                <label 
                  htmlFor="tournament-logo-upload"
                  className="flex-1 brutalist-border bg-white text-black p-3 font-black text-center cursor-pointer hover:bg-yellow-400 transition-colors brutalist-shadow text-sm"
                >
                  {logoUrl ? 'CHANGE LOGO' : 'CHOOSE IMAGE'}
                </label>
                {logoUrl && (
                  <BrutalistButton variant="danger" compact onClick={() => setLogoUrl('')}>CLEAR</BrutalistButton>
                )}
              </div>
            </div>
          </div>
          <div className="brutalist-border bg-white flex items-center justify-center p-4 min-h-[150px]">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo Preview" className="max-h-32 object-contain" />
            ) : (
              <span className="font-black text-gray-300 italic">LOGO PREVIEW</span>
            )}
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 2: FORMAT CONFIGURATION" variant="magenta">
        <div className="grid grid-cols-1 gap-8">
          <div className="space-y-4">
            <label className="block font-black text-xl mb-2 text-black">SERIES LENGTH TYPE</label>
            <select className="w-full brutalist-border p-4 font-black text-xl uppercase bg-white text-black outline-none" value={seriesLength} onChange={e => setSeriesLength(e.target.value)}>
              <option value="2-5">(2-5) MATCHES</option>
              <option value="3-5">(3-5) MATCHES</option>
              <option value="3-6">(3-6) MATCHES</option>
              <option value="Custom">CUSTOM LENGTH</option>
            </select>
            {seriesLength === 'Custom' && (
              <input className="w-full brutalist-border p-4 font-black uppercase bg-white text-black mt-2 outline-none" placeholder="E.G. 10 MATCH SERIES" value={customSeries} onChange={e => setCustomSeries(e.target.value)} />
            )}
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 3: TEAMS CONFIGURATION" variant="lime">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <label className="font-black text-xl text-black">NUM OF TEAMS:</label>
              <input 
                type="number" min="2" max="32" value={numTeams} 
                onChange={e => setNumTeams(Number(e.target.value))}
                className="brutalist-border p-2 w-24 text-center font-black text-xl bg-white text-black outline-none"
              />
            </div>
            <BrutalistButton variant="secondary" onClick={fillAiTeams}>AUTO-FILL AI TEAMS</BrutalistButton>
          </div>
          
          <div className="brutalist-border bg-white overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black text-white">
                <tr>
                  <th className="p-3 border-r border-white">#</th>
                  <th className="p-3 border-r border-white">TEAM NAME</th>
                  <th className="p-3 border-r border-white">SHORT</th>
                  <th className="p-3 border-r border-white text-center">LOGO</th>
                  <th className="p-3">OWNER</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={i} className="border-b-2 border-black bg-white">
                    <td className="p-3 font-black mono text-center bg-gray-100 text-black">{i+1}</td>
                    <td className="p-2 border-r border-black">
                      <input 
                        className="w-full p-2 uppercase font-bold outline-none focus:bg-yellow-50 bg-white text-black" 
                        value={t.name} onChange={e => {
                          const nt = [...teams];
                          nt[i].name = e.target.value;
                          setTeams(nt);
                        }}
                      />
                    </td>
                    <td className="p-2 border-r border-black">
                      <input 
                        className="w-full p-2 uppercase font-bold outline-none focus:bg-yellow-50 bg-white text-black text-center" 
                        maxLength={3}
                        placeholder="IND"
                        value={t.shortName} onChange={e => {
                          const nt = [...teams];
                          nt[i].shortName = e.target.value.substring(0, 3).toUpperCase();
                          setTeams(nt);
                        }}
                      />
                    </td>
                    <td className="p-2 border-r border-black">
                      <div className="flex items-center justify-center gap-2">
                        {t.logoUrl ? (
                          <div className="relative group">
                            <img src={t.logoUrl} className="w-10 h-10 object-contain brutalist-border bg-white" alt="Team Logo" />
                            <button 
                              className="absolute -top-2 -right-2 bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center font-black text-[8px] brutalist-border opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                const nt = [...teams];
                                nt[i].logoUrl = '';
                                setTeams(nt);
                              }}
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <>
                            <input 
                              type="file" 
                              id={`team-logo-${i}`}
                              className="hidden" 
                              accept="image/*"
                              onChange={e => handleImageUpload(e.target.files?.[0] || null, (b64) => {
                                const nt = [...teams];
                                nt[i].logoUrl = b64;
                                setTeams(nt);
                              })}
                            />
                            <label 
                              htmlFor={`team-logo-${i}`}
                              className="w-full brutalist-border bg-gray-50 text-black p-1 text-[8px] font-black text-center cursor-pointer hover:bg-yellow-400"
                            >
                              IMG
                            </label>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <input 
                        className="w-full p-2 uppercase font-bold outline-none focus:bg-yellow-50 bg-white text-black" 
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

      <BrutalistCard title="PANEL 4: STADIUM / VENUE SETUP" variant="pink">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input 
              className="flex-grow brutalist-border p-4 font-black uppercase bg-white text-black outline-none" 
              placeholder="ADD STADIUM NAME" value={currentStadium} onChange={e => setCurrentStadium(e.target.value)}
            />
            <BrutalistButton variant="success" onClick={addStadium}>ADD</BrutalistButton>
            <BrutalistButton variant="primary" onClick={fillAiStadiums}>AI STADIUMS</BrutalistButton>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-48 overflow-y-auto p-2">
            {stadiums.map((s, i) => (
              <div key={s.id} className="brutalist-border p-3 bg-white flex justify-between items-center group hover:bg-rose-50 transition-colors">
                <span className="font-black uppercase tracking-tighter text-black">{i+1}. {s.name}</span>
                <button onClick={() => removeStadium(s.id, s.name)} className="text-rose-600 font-black opacity-0 group-hover:opacity-100 text-xs hover:underline">REMOVE</button>
              </div>
            ))}
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 5: STRUCTURE & PLAYOFF SELECTION" variant="cyan">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <label className="block font-black text-xl text-black">SCHEDULE FORMAT</label>
            <select className="w-full brutalist-border p-4 font-black uppercase bg-white text-black outline-none" value={scheduleFormat} onChange={e => setScheduleFormat(e.target.value)}>
              <option>SINGLE ROUND ROBIN (SRR)</option>
              <option>DOUBLE ROUND ROBIN (DRR)</option>
            </select>
            <div className="bg-black text-white p-4 brutalist-border shadow-[4px_4px_0px_white]">
              <p className="mono text-xs mb-1">PAIRING MATHEMATICS:</p>
              <p className="text-2xl font-black uppercase">TOTAL PAIRINGS: {calcMatches()}</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="block font-black text-xl text-black">FINALS SYSTEM</label>
            <select className="w-full brutalist-border p-4 font-black uppercase bg-white text-black outline-none" value={playoffSystem} onChange={e => setPlayoffSystem(e.target.value)}>
              <option>WTC FINAL (TOP 2 AT NEUTRAL VENUE)</option>
              <option>SEMI-FINAL SYSTEM (TOP 4)</option>
            </select>
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 6: CUSTOMIZED POINTS SYSTEM" variant="yellow">
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="block font-black text-sm text-black uppercase">Per Match Win</label>
              <input 
                type="number"
                className="w-full brutalist-border p-3 font-black bg-white text-black outline-none"
                value={winPts}
                onChange={e => setWinPts(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="block font-black text-sm text-black uppercase">Per Match Loss</label>
              <input 
                type="number"
                className="w-full brutalist-border p-3 font-black bg-white text-black outline-none"
                value={lossPts}
                onChange={e => setLossPts(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="block font-black text-sm text-black uppercase">Per Match Draw/Tie</label>
              <input 
                type="number"
                className="w-full brutalist-border p-3 font-black bg-white text-black outline-none"
                value={drawPts}
                onChange={e => setDrawPts(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="p-6 brutalist-border bg-white/50 space-y-6">
            <h4 className="font-black uppercase text-lg border-b-2 border-black pb-2">Sub Panel: Series Points</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block font-black text-sm text-black uppercase">Enable Series Points?</label>
                <select 
                  className="w-full brutalist-border p-3 font-black bg-white text-black outline-none uppercase"
                  value={countBonus ? 'YES' : 'NO'}
                  onChange={e => setCountBonus(e.target.value === 'YES')}
                >
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                </select>
              </div>
              
              {/* Only show these if countBonus is YES */}
              {countBonus && (
                <>
                  <div className="space-y-2 animate-in fade-in duration-300">
                    <label className="block font-black text-sm text-black uppercase">Per Series Won</label>
                    <input 
                      type="number"
                      className="w-full brutalist-border p-3 font-black bg-white text-black outline-none"
                      value={sWinPts}
                      onChange={e => setSWinPts(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2 animate-in fade-in duration-300">
                    <label className="block font-black text-sm text-black uppercase">Per Series Loss</label>
                    <input 
                      type="number"
                      className="w-full brutalist-border p-3 font-black bg-white text-black outline-none"
                      value={sLossPts}
                      onChange={e => setSLossPts(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2 animate-in fade-in duration-300">
                    <label className="block font-black text-sm text-black uppercase">Per Series Draw</label>
                    <input 
                      type="number"
                      className="w-full brutalist-border p-3 font-black bg-white text-black outline-none"
                      value={sDrawPts}
                      onChange={e => setSDrawPts(Number(e.target.value))}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </BrutalistCard>

      <div className="sticky bottom-0 left-0 right-0 z-50 bg-gray-200/90 backdrop-blur-md -mx-4 md:-mx-10 px-4 md:px-10 py-6 border-t-4 border-black">
        <button 
          onClick={handleSubmit} 
          disabled={isProcessing}
          className={`w-full brutalist-border p-6 md:p-10 text-3xl md:text-5xl font-black uppercase tracking-tighter transition-all brutalist-shadow active:translate-y-1 active:shadow-none ${isProcessing ? 'bg-gray-400 text-gray-700 cursor-wait' : 'bg-black text-white hover:bg-yellow-400 hover:text-black'}`}
        >
          {isProcessing ? 'INITIALIZING...' : 'INITIALIZE WTC CHAMPIONSHIP'}
        </button>
      </div>
    </div>
  );
};

export default CreateTournamentForm;