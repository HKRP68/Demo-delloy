
import React from 'react';

interface BrutalistCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  variant?: 'white' | 'translucent' | 'yellow' | 'blue' | 'pink' | 'green' | 'cyan' | 'lime' | 'magenta';
  compact?: boolean;
}

const BrutalistCard: React.FC<BrutalistCardProps> = ({ 
  children, 
  className = '', 
  title, 
  variant = 'white',
  compact = false 
}) => {
  const bgColors = {
    white: "bg-white",
    translucent: "bg-white/40 backdrop-blur-md",
    yellow: "bg-yellow-50",
    blue: "bg-sky-50",
    pink: "bg-rose-50",
    green: "bg-emerald-50",
    cyan: "bg-cyan-50",
    lime: "bg-lime-50",
    magenta: "bg-fuchsia-50"
  };

  return (
    <div className={`${bgColors[variant]} brutalist-border brutalist-shadow ${compact ? 'p-3' : 'p-5'} ${className}`}>
      {title && (
        <div className={`border-b-3 border-black ${compact ? '-mx-3 -mt-3 mb-3 px-3 py-1.5' : '-mx-5 -mt-5 mb-5 px-5 py-2'} bg-black text-white flex items-center justify-between`}>
          <h3 className="text-sm font-black uppercase tracking-tighter leading-none">{title}</h3>
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-rose-500 border border-white"></div>
            <div className="w-2 h-2 rounded-full bg-yellow-500 border border-white"></div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 border border-white"></div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
};

export default BrutalistCard;
