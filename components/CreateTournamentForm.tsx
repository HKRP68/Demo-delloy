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
  const [type, setType] = useState<TournamentType>('TEST');
  const [seriesLength, setSeriesLength] = useState('3-5');
  const [customSeries, setCustomSeries] = useState('');
  const [oversPerMatch, setOversPerMatch] = useState('20');
  const [numTeams, setNumTeams] = useState(8);
  const [teams, setTeams] = useState<Team[]>([]);
  const [stadiums, setStadiums] = useState<Stadium[]>([]);
  const [currentStadium, setCurrentStadium] = useState('');
  const [scheduleFormat, setScheduleFormat] = useState('SINGLE ROUND ROBIN (SRR)');
  const [playoffSystem, setPlayoffSystem] = useState('SEMI-FINAL SYSTEM (TOP 4)');
  const [headerConfig, setHeaderConfig] = useState<TournamentHeader>({
    siteLogoUrl: '',
    tournamentName: '',
    tournamentLogoUrl: '',
    confirmed: false
  });

  const [winPts, setWinPts] = useState(12);
  const [drawPts, setDrawPts] = useState(6);
  const [lossPts, setLossPts] = useState(4);
  const [countBonus, setCountBonus] = useState(true);
  const [sWinPts, setSWinPts] = useState(4);
  const [sDrawPts, setSDrawPts] = useState(2);
  const [officials, setOfficials] = useState('');

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

  useEffect(() => {
    const newTeams: Team[] = Array.from({ length: numTeams }, (_, i) => ({
      id: `team-${i}`,
      name: teams[i]?.name || '',
      logoUrl: teams[i]?.logoUrl || '',
      owner: teams[i]?.owner || '',
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
      runsScored: 0,
      oversFaced: 0,
      runsConceded: 0,
      oversBowled: 0,
    }));
    setTeams(newTeams);
  }, [numTeams]);

  const handleImageUpload = (file: File | null, callback: (base64: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 256; const MAX_HEIGHT = 256;
        let width = img.width; let height = img.height;
        if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
        else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          callback(canvas.toDataURL('image/jpeg', 0.6));
        }
      };
    };
  };

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

  const handleSubmit = () => {
    if (!name.trim()) return alert("Tournament Name Required!");
    if (teams.some(t => !t.name.trim())) return alert("All Team Names Required!");

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
        seriesLength: type === 'LIMITED_OVERS' ? '1' : (seriesLength === 'Custom' ? customSeries : seriesLength),
        oversPerMatch: type === 'LIMITED_OVERS' ? oversPerMatch : undefined,
        scheduleFormat,
        playoffSystem,
        pointsForWin: winPts,
        pointsForDraw: drawPts,
        pointsForLoss: lossPts,
        countSeriesBonus: type === 'TEST' ? countBonus : false,
        pointsForSeriesWin: sWinPts,
        pointsForSeriesDraw: sDrawPts,
        officials: officials.split(',').map(s => s.trim())
      }
    };
    onCreate(finalTournament);
  };

  return (
    <div className="space-y-12 pb-32 max-w-5xl mx-auto relative">
      <BrutalistCard title="PANEL 1: TOURNAMENT BASIC INFORMATION" variant="yellow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block font-black text-xl mb-2 text-black">TOURNAMENT NAME *</label>
              <input 
                className="w-full brutalist-border p-4 text-2xl font-black uppercase bg-white text-black outline-none" 
                value={name} onChange={e => setName(e.target.value)} placeholder="E.G. DISCORD ASHES"
              />
            </div>
            <div>
              <label className="block font-black text-sm mb-2 uppercase text-black">Upload Tournament Logo</label>
              <div className="flex gap-2">
                <input type="file" id="t-logo" className="hidden" accept="image/*" onChange={e => handleImageUpload(e.target.files?.[0] || null, setLogoUrl)} />
                <label htmlFor="t-logo" className="flex-1 brutalist-border bg-white text-black p-3 font-black text-center cursor-pointer hover:bg-yellow-400 brutalist-shadow text-sm">CHOOSE LOGO</label>
              </div>
            </div>
          </div>
          <div className="brutalist-border bg-white flex items-center justify-center p-4 min-h-[150px]">
            {logoUrl ? <img src={logoUrl} alt="Preview" className="max-h-32 object-contain" /> : <span className="font-black text-gray-300">PREVIEW</span>}
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 2: TOURNAMENT TYPE SELECTION" variant="cyan">
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setType('TEST')} className={`p-8 brutalist-border text-3xl font-black uppercase ${type === 'TEST' ? 'bg-black text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white text-black hover:bg-gray-100 brutalist-shadow'}`}>TEST MATCH</button>
          <button onClick={() => setType('LIMITED_OVERS')} className={`p-8 brutalist-border text-3xl font-black uppercase ${type === 'LIMITED_OVERS' ? 'bg-black text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white text-black hover:bg-gray-100 brutalist-shadow'}`}>LIMITED OVERS</button>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 3: FORMAT CONFIGURATION" variant="magenta">
        <div className="space-y-4">
          {type === 'TEST' ? (
            <>
              <label className="block font-black text-xl mb-2">SERIES LENGTH</label>
              <select className="w-full brutalist-border p-4 font-black text-xl uppercase bg-white" value={seriesLength} onChange={e => setSeriesLength(e.target.value)}>
                <option value="2-5">2-5 MATCHES</option>
                <option value="3-5">3-5 MATCHES</option>
                <option value="Custom">CUSTOM</option>
              </select>
            </>
          ) : (
            <>
              <label className="block font-black text-xl mb-2">OVERS PER MATCH</label>
              <select className="w-full brutalist-border p-4 font-black text-xl uppercase bg-white" value={oversPerMatch} onChange={e => setOversPerMatch(e.target.value)}>
                <option value="10">T10 (10 OVERS)</option>
                <option value="20">T20 (20 OVERS)</option>
                <option value="50">ODI (50 OVERS)</option>
              </select>
            </>
          )}
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 4: TEAMS CONFIGURATION" variant="lime">
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <label className="font-black text-xl">NUM OF TEAMS:</label>
              <input type="number" min="2" max="32" value={numTeams} onChange={e => setNumTeams(Number(e.target.value))} className="brutalist-border p-2 w-24 text-center font-black text-xl bg-white" />
            </div>
            <BrutalistButton variant="secondary" onClick={fillAiTeams}>FILL AI NAMES</BrutalistButton>
          </div>
          <div className="brutalist-border bg-white overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black text-white">
                <tr><th className="p-3 border-r">TEAM #</th><th className="p-3 border-r">NAME</th><th className="p-3">OWNER</th></tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={t.id} className="border-b-2 border-black">
                    <td className="p-3 font-black mono text-center bg-gray-100">{i+1}</td>
                    <td className="p-2 border-r"><input className="w-full p-2 uppercase font-bold outline-none bg-white" value={t.name} onChange={e => { const nt = [...teams]; nt[i].name = e.target.value; setTeams(nt); }} /></td>
                    <td className="p-2"><input className="w-full p-2 uppercase font-bold outline-none bg-white" value={t.owner} onChange={e => { const nt = [...teams]; nt[i].owner = e.target.value; setTeams(nt); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </BrutalistCard>

      <BrutalistCard title="PANEL 8: POINTS FORMULA" variant="blue">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-6">
            <h4 className="font-black uppercase text-sm border-b-4 border-black pb-2">Match Points</h4>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="block text-[10px] font-black uppercase">WIN</label><input type="number" className="w-full brutalist-border p-4 font-black text-2xl" value={winPts} onChange={e => setWinPts(Number(e.target.value))} /></div>
              <div><label className="block text-[10px] font-black uppercase">DRAW</label><input type="number" className="w-full brutalist-border p-4 font-black text-2xl" value={drawPts} onChange={e => setDrawPts(Number(e.target.value))} /></div>
              <div><label className="block text-[10px] font-black uppercase">LOSS</label><input type="number" className="w-full brutalist-border p-4 font-black text-2xl" value={lossPts} onChange={e => setLossPts(Number(e.target.value))} /></div>
            </div>
          </div>
          {type === 'TEST' && (
            <div className="space-y-6">
              <h4 className="font-black uppercase text-sm border-b-4 border-black pb-2">Series Bonus</h4>
              <div className="flex items-center gap-4">
                <label className="text-xs font-black uppercase">COUNT BONUS?</label>
                <select className="flex-grow brutalist-border p-2 font-black bg-white" value={countBonus ? 'YES' : 'NO'} onChange={e => setCountBonus(e.target.value === 'YES')}>
                  <option value="YES">YES</option><option value="NO">NO</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </BrutalistCard>

      <div className="sticky bottom-0 left-0 right-0 z-50 bg-gray-200/90 backdrop-blur-md -mx-10 px-10 py-6 border-t-4 border-black">
        <button onClick={handleSubmit} className="w-full brutalist-border bg-black text-white p-10 text-5xl font-black uppercase tracking-tighter hover:bg-yellow-400 hover:text-black transition-all brutalist-shadow">
          CREATE TOURNAMENT
        </button>
      </div>
    </div>
  );
};

export default CreateTournamentForm;