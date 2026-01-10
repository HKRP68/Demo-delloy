import React, { useState } from 'react';
import { Tournament } from '../types';
import BrutalistButton from './BrutalistButton';
import BrutalistCard from './BrutalistCard';

interface ManageTournamentListProps {
  tournaments: Tournament[];
  onDelete: (id: string) => void;
  onEnter: (tournament: Tournament) => void;
}

const ManageTournamentList: React.FC<ManageTournamentListProps> = ({ tournaments, onDelete, onEnter }) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');

  const handleDeleteAttempt = (t: Tournament) => {
    setDeleteConfirmId(t.id);
    setConfirmName('');
  };

  const finalizeDelete = (t: Tournament) => {
    if (confirmName === t.name) {
      onDelete(t.id);
      setDeleteConfirmId(null);
    } else {
      alert("Name mismatch! Type the tournament name exactly to delete.");
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <BrutalistCard title="SAVED TOURNAMENTS" variant="white" compact>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-black text-white uppercase mono">
              <tr>
                <th className="p-3 border-r border-white">S.No</th>
                <th className="p-3 border-r border-white">Tournament Name</th>
                <th className="p-3 border-r border-white">Type</th>
                <th className="p-3 border-r border-white">Teams</th>
                <th className="p-3 border-r border-white">Created</th>
                <th className="p-3">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-black">
              {tournaments.length > 0 ? tournaments.map((t, idx) => (
                <tr 
                  key={t.id} 
                  className="group hover:bg-yellow-400 transition-all cursor-default bg-white/50"
                  title={`${t.name} - Created ${t.createdDate}`}
                >
                  <td className="p-3 font-black mono border-r-2 border-black">{idx + 1}</td>
                  <td className="p-3 font-black uppercase border-r-2 border-black text-sm">{t.name}</td>
                  <td className="p-3 border-r-2 border-black">
                    <span className={`px-2 py-0.5 brutalist-border font-black text-[9px] uppercase shadow-[2px_2px_0px_black] ${t.type === 'TEST' ? 'bg-cyan-300' : 'bg-fuchsia-400'}`}>
                      {t.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 font-bold mono border-r-2 border-black text-center">
                    <span className="bg-black text-white px-2 py-0.5">{t.teams.length}</span>
                  </td>
                  <td className="p-3 font-bold mono border-r-2 border-black text-gray-400">{t.createdDate}</td>
                  <td className="p-3 flex gap-2">
                    <BrutalistButton 
                      onClick={() => onEnter(t)} 
                      variant="success" 
                      compact
                    >
                      ENTER
                    </BrutalistButton>
                    <BrutalistButton 
                      onClick={() => handleDeleteAttempt(t)} 
                      variant="danger" 
                      compact
                    >
                      DELETE
                    </BrutalistButton>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="p-16 text-center bg-gray-50">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-6xl animate-bounce">🏏</span>
                      <p className="font-black uppercase text-xl text-gray-300 tracking-tighter italic">No tournaments in database</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </BrutalistCard>

      {/* Security Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <BrutalistCard title="⚠️ SECURITY CHECK" className="max-w-xs w-full border-rose-600 bg-white">
            <div className="space-y-4">
              <p className="font-bold uppercase text-[10px]">Type name to confirm deletion of:</p>
              <div className="bg-rose-100 p-2 border-2 border-dashed border-rose-600 font-black text-center uppercase text-sm text-rose-700">
                {tournaments.find(t => t.id === deleteConfirmId)?.name}
              </div>
              <input 
                className="w-full brutalist-border p-2 font-black uppercase outline-none focus:bg-rose-50 text-xs"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder="TOURNAMENT NAME"
              />
              <div className="flex gap-2">
                <BrutalistButton 
                  variant="danger" 
                  className="flex-1"
                  onClick={() => finalizeDelete(tournaments.find(t => t.id === deleteConfirmId)!)}
                >
                  DELETE
                </BrutalistButton>
                <BrutalistButton 
                  variant="secondary" 
                  className="flex-1"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  CANCEL
                </BrutalistButton>
              </div>
            </div>
          </BrutalistCard>
        </div>
      )}
    </div>
  );
};

export default ManageTournamentList;