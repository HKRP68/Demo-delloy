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

  // Points State
  const [winPts, setWinPts] = useState(12);
  const [drawPts, setDrawPts] = useState(6);
  const [lossPts, setLossPts] = useState(4);
  const [countBonus, setCountBonus] = useState(true);
  const [sWinPts, setSWinPts] = useState(6);
  const [sDrawPts, setSDrawPts] = useState(3);
  const [sLossPts, setSLossPts] = useState(1.5);
  
  const [isProcessing, setIsProcessing] = useState(false);

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
    reader.onloadend = () => callback(reader.result as string);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("Tournament Name Required!");
    if (teams.some(t => !t.name.trim())) return alert("All Team Names Required!");
    
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
      header: { 
        siteLogoUrl: '', 
        tournamentName: name, 
        tournamentLogoUrl: logoUrl,
        confirmed: true
      },
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
        officials: []
      }
    };

    setTimeout(() => {
      onCreate(finalTournament);
      setIsProcessing(false);
    }, 500);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-12 pb-32 max-w-5xl mx-auto relative">
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
            {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-32 object-contain" /> : <span className="font-black text-gray-300 italic">LOGO PREVIEW</span>}
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 2: FORMAT CONFIGURATION" variant="magenta">
        <div className="space-y-4">
          <label className="block font-black text-xl mb-2 text-black">SERIES LENGTH TYPE</label>
          <select className="w-full brutalist-border p-4 font-black text-xl uppercase bg-white text-black outline-none" value={seriesLength} onChange={e => setSeriesLength(e.target.value)}>
            <option value="2-5">(2-5) MATCHES</option>
            <option value="3-5">(3-5) MATCHES</option>
            <option value="3-6">(3-6) MATCHES</option>
            <option value="Custom">CUSTOM LENGTH</option>
          </select>
          {seriesLength === 'Custom' && <input className="w-full brutalist-border p-4 font-black uppercase bg-white text-black mt-2 outline-none" placeholder="E.G. 10 MATCH SERIES" value={customSeries} onChange={e => setCustomSeries(e.target.value)} />}
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 3: TEAMS CONFIGURATION" variant="lime">
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <label className="font-black text-xl text-black">NUM OF TEAMS:</label>
              <input type="number" min="2" max="32" value={numTeams} onChange={e => setNumTeams(Number(e.target.value))} className="brutalist-border p-2 w-24 text-center font-black text-xl bg-white text-black outline-none" />
            </div>
            <BrutalistButton type="button" variant="secondary" onClick={fillAiTeams}>AUTO-FILL AI TEAMS</BrutalistButton>
          </div>
          <div className="brutalist-border bg-white overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black text-white uppercase text-xs">
                <tr><th className="p-3">#</th><th className="p-3">TEAM NAME</th><th className="p-3">SHORT</th><th className="p-3">OWNER</th></tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={i} className="border-b border-black">
                    <td className="p-3 font-black mono text-center bg-gray-100 text-black">{i+1}</td>
                    <td className="p-2"><input className="w-full p-2 uppercase font-bold outline-none bg-white text-black" value={t.name} onChange={e => { const nt = [...teams]; nt[i].name = e.target.value; setTeams(nt); }} required /></td>
                    <td className="p-2"><input className="w-full p-2 uppercase font-bold outline-none bg-white text-black text-center" maxLength={3} value={t.shortName} onChange={e => { const nt = [...teams]; nt[i].shortName = e.target.value.substring(0, 3).toUpperCase(); setTeams(nt); }} /></td>
                    <td className="p-2"><input className="w-full p-2 uppercase font-bold outline-none bg-white text-black" value={t.owner} onChange={e => { const nt = [...teams]; nt[i].owner = e.target.value; setTeams(nt); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 4: STADIUM SETUP" variant="pink">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input className="flex-grow brutalist-border p-4 font-black uppercase bg-white text-black outline-none" placeholder="ADD STADIUM NAME" value={currentStadium} onChange={e => setCurrentStadium(e.target.value)} />
            <BrutalistButton type="button" variant="success" onClick={addStadium}>ADD</BrutalistButton>
            <BrutalistButton type="button" variant="primary" onClick={fillAiStadiums}>AI STADIUMS</BrutalistButton>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-48 overflow-y-auto p-2">
            {stadiums.map((s, i) => (
              <div key={s.id} className="brutalist-border p-3 bg-white flex justify-between items-center group">
                <span className="font-black uppercase text-sm text-black">{i+1}. {s.name}</span>
                <button type="button" onClick={() => setStadiums(stadiums.filter(st => st.id !== s.id))} className="text-rose-600 font-black text-xs hover:underline">REMOVE</button>
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
          {isProcessing ? 'INITIALIZING...' : 'INITIALIZE WTC CHAMPIONSHIP'}
        </button>
      </div>
    </form>
  );
};

export default CreateTournamentForm;