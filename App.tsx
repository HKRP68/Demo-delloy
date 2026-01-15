
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
      {/* Global Header */}
      <header className="bg-white border-b-4 border-black p-4 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4 z-50 sticky top-0 shadow-[0_4px_0px_black]">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-black flex items-center justify-center brutalist-border transform -rotate-3">
             <span className="text-white font-black text-4xl">W</span>
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase leading-none">
              Cricket Association of Discord
            </h1>
            <p className="text-sm md:text-lg font-bold uppercase mono tracking-widest text-gray-600">
              WTC MANAGER
            </p>
          </div>
        </div>

        {activeView === 'WORKSPACE' && selectedTournament && (
          <div className="flex items-center gap-4 bg-yellow-400 p-2 brutalist-border brutalist-shadow transform rotate-1">
            <div className="text-right">
              <div className="font-black uppercase text-xl leading-none">{selectedTournament.name}</div>
              <div className="text-[10px] font-bold uppercase mono">TEST MODE ACTIVE</div>
            </div>
            <BrutalistButton variant="secondary" onClick={handleExitWorkspace} compact>
              EXIT
            </BrutalistButton>
          </div>
        )}
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
