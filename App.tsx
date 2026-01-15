import React, { useState, useEffect, useRef } from 'react';
import { Tournament, AppView, MainTab, WorkspaceTab } from './types';
import CreateTournamentForm from './components/CreateTournamentForm';
import ManageTournamentList from './components/ManageTournamentList';
import TournamentWorkspace from './components/TournamentWorkspace';
import BrutalistButton from './components/BrutalistButton';

const App: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeView, setActiveView] = useState<AppView>('MAIN');
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('CREATE');
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const isInitialized = useRef(false);

  // Load from LocalStorage once on mount
  useEffect(() => {
    const saved = localStorage.getItem('cad_tournaments');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setTournaments(parsed);
        }
      } catch (e) {
        console.error("Failed to parse tournaments", e);
      }
    }
    isInitialized.current = true;
  }, []);

  // Save to LocalStorage whenever tournaments change, but only after initial load
  useEffect(() => {
    if (isInitialized.current) {
      localStorage.setItem('cad_tournaments', JSON.stringify(tournaments));
    }
  }, [tournaments]);

  const handleCreateTournament = (newTournament: Tournament) => {
    setTournaments(prev => [...prev, newTournament]);
    setActiveMainTab('MANAGE');
  };

  const handleUpdateTournament = (updated: Tournament) => {
    setTournaments(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelectedTournament(updated); 
  };

  const handleDeleteTournament = (id: string) => {
    setTournaments(prev => prev.filter(t => t.id !== id));
  };

  const handleEnterWorkspace = (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setActiveView('WORKSPACE');
  };

  const handleExitWorkspace = () => {
    setActiveView('MAIN');
    setActiveMainTab('MANAGE');
    setSelectedTournament(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-200">
      {/* Global Header - Sticky as per Panel 7 */}
      <header className="bg-white border-b-4 border-black p-4 md:px-8 md:py-4 flex flex-col md:flex-row items-center justify-between gap-4 z-50 sticky top-0 shadow-[0_4px_0px_black]">
        {/* Left: Tournament Logo */}
        <div className="flex items-center gap-4 w-full md:w-1/4">
          {activeView === 'WORKSPACE' && selectedTournament && selectedTournament.header.tournamentLogoUrl ? (
             <img src={selectedTournament.header.tournamentLogoUrl} className="h-12 w-12 object-contain brutalist-border p-1 bg-white" alt="Tourney Logo" />
          ) : (
             <div className="h-12 w-12 bg-black flex items-center justify-center brutalist-border">
                <span className="text-white font-black text-2xl">?</span>
             </div>
          )}
        </div>

        {/* Center: Tournament Name */}
        <div className="text-center flex-1">
          <h1 className="text-xl md:text-3xl font-black tracking-tighter uppercase leading-none">
            {activeView === 'WORKSPACE' && selectedTournament ? selectedTournament.name : 'WTC CHAMPIONSHIP MANAGER'}
          </h1>
          <p className="text-[10px] md:text-xs font-bold uppercase mono tracking-widest text-gray-500 mt-1">
            CRICKET ASSOCIATION OF DISCORD – Cricket Tournament Organiser
          </p>
        </div>

        {/* Right: Site Logo */}
        <div className="flex items-center justify-end gap-4 w-full md:w-1/4">
          {activeView === 'WORKSPACE' && (
            <BrutalistButton variant="danger" onClick={handleExitWorkspace} compact className="hidden md:flex">
              EXIT
            </BrutalistButton>
          )}
          <div className="w-12 h-12 bg-black flex items-center justify-center brutalist-border transform -rotate-3">
             <span className="text-white font-black text-2xl">W</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow p-4 md:p-10 max-w-7xl mx-auto w-full">
        {activeView === 'MAIN' ? (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-4">
              <button 
                onClick={() => setActiveMainTab('CREATE')}
                className={`flex-1 p-6 text-3xl font-black uppercase text-left transition-all brutalist-border brutalist-shadow ${activeMainTab === 'CREATE' ? 'bg-black text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white hover:bg-gray-100'}`}
              >
                1. Create Tournament
              </button>
              <button 
                onClick={() => setActiveMainTab('MANAGE')}
                className={`flex-1 p-6 text-3xl font-black uppercase text-left transition-all brutalist-border brutalist-shadow ${activeMainTab === 'MANAGE' ? 'bg-black text-white translate-x-1 translate-y-1 shadow-none' : 'bg-white hover:bg-gray-100'}`}
              >
                2. Manage Tournament
              </button>
            </div>

            <div className="animate-in fade-in duration-500">
              {activeMainTab === 'CREATE' ? (
                <CreateTournamentForm onCreate={handleCreateTournament} />
              ) : (
                <ManageTournamentList 
                  tournaments={tournaments} 
                  onDelete={handleDeleteTournament} 
                  onEnter={handleEnterWorkspace}
                />
              )}
            </div>
          </div>
        ) : (
          selectedTournament && (
            <TournamentWorkspace 
              tournament={selectedTournament} 
              onExit={handleExitWorkspace}
              onUpdateTournament={handleUpdateTournament}
            />
          )
        )}
      </main>

      <footer className="mt-auto bg-black text-white p-6 border-t-4 border-black">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] mono uppercase font-black">
          <div>&copy; {new Date().getFullYear()} CRICKET ASSOCIATION OF DISCORD.</div>
          <div className="flex gap-6 italic">
            <span>WTC SYSTEM V1.5.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;