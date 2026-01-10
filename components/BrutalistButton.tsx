import React from 'react';

interface BrutalistButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'info' | 'accent' | 'cyan' | 'magenta' | 'lime';
  className?: string;
  compact?: boolean;
}

const BrutalistButton: React.FC<BrutalistButtonProps> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  compact = false,
  ...props 
}) => {
  const baseStyles = "font-black uppercase transition-all brutalist-border brutalist-shadow brutalist-shadow-hover brutalist-shadow-active active:translate-y-1 inline-flex items-center justify-center gap-2 cursor-pointer";
  
  const variants = {
    primary: "bg-yellow-400 hover:bg-yellow-300 text-black",
    secondary: "bg-white hover:bg-gray-100 text-black",
    danger: "bg-rose-500 text-white hover:bg-rose-400",
    success: "bg-emerald-400 hover:bg-emerald-300 text-black",
    warning: "bg-orange-400 hover:bg-orange-300 text-black",
    info: "bg-sky-400 hover:bg-sky-300 text-black",
    accent: "bg-violet-500 text-white hover:bg-violet-400",
    cyan: "bg-cyan-300 hover:bg-cyan-200 text-black",
    magenta: "bg-fuchsia-400 hover:bg-fuchsia-300 text-black",
    lime: "bg-lime-400 hover:bg-lime-300 text-black"
  };

  const size = compact ? "px-3 py-1.5 text-[10px]" : "px-6 py-2.5 text-sm";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${size} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default BrutalistButton;