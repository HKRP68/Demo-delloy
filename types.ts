
export type TournamentType = 'TEST' | 'LIMITED_OVERS';

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  owner?: string;
  // Stats
  seriesPlayed: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesDrawn: number;
  matchesTie: number;
  matchesNR: number;
  // Points
  basePoints: number; // From matches
  bonusPoints: number; // From series
  penaltyPoints: number; // Deducted
  totalPoints: number; // Net points
  pct: number; // Points Percentage
  // Extra (Limited Overs)
  runsScored: number;
  oversFaced: number;
  runsConceded: number;
  oversBowled: number;
  nrr?: number; 
}

export interface Stadium {
  id: string;
  name: string;
  assignedMatches?: number;
}

export type MatchResultType = 'T1_WIN' | 'T2_WIN' | 'DRAW' | 'TIE' | 'NO_RESULT' | 'ABANDONED';

export interface Match {
  id: string;
  round: number;
  seriesId: string; 
  team1Id: string;
  team2Id: string;
  venueId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  winnerId?: string;
  resultType?: MatchResultType;
  notes?: string;
  t1Runs?: number;
  t1Wickets?: number;
  t1Overs?: number; 
  t2Runs?: number;
  t2Wickets?: number;
  t2Overs?: number; 
  tossWinnerId?: string;
  isDlsApplied?: boolean;
}

export interface SeriesGroup {
  id: string;
  round: number;
  team1Id: string;
  team2Id: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  matchIds: string[];
}

export interface ResultLog {
  id: string;
  targetId: string; // matchId or seriesId
  type: 'UNLOCK' | 'EDIT' | 'DELETE' | 'PENALTY';
  reason: string;
  adminName: string;
  timestamp: string;
}

export interface PenaltyRecord {
  id: string;
  teamId: string;
  points: number;
  reason: string;
  date: string;
  addedBy?: string;
}

export interface TournamentConfig {
  seriesLength?: string;
  oversPerMatch?: string;
  scheduleFormat: string;
  playoffSystem: string;
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  countSeriesBonus: boolean;
  pointsForSeriesWin: number;
  pointsForSeriesDraw: number;
  officials: string[];
}

export interface TournamentHeader {
  siteLogoUrl: string;
  tournamentName: string;
  tournamentLogoUrl: string;
  confirmed: boolean;
}

export type TournamentStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED';

export interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  createdDate: string;
  season?: string;
  status?: TournamentStatus;
  isLocked?: boolean;
  teams: Team[];
  stadiums: Stadium[];
  matches: Match[];
  series?: SeriesGroup[];
  penalties: PenaltyRecord[];
  logs?: ResultLog[];
  config: TournamentConfig;
  header: TournamentHeader;
  teamsCount: number;
}

export type AppView = 'MAIN' | 'WORKSPACE';
export type MainTab = 'CREATE' | 'MANAGE';
export type WorkspaceTab = 'DASHBOARD' | 'INFO' | 'SCHEDULE' | 'RESULTS' | 'POINTS' | 'SETTINGS';
