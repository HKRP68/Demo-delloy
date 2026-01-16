
export type TournamentType = 'TEST';

export interface Team {
  id: string;
  name: string;
  shortName: string; // 3-letter abbreviation
  logoUrl?: string;
  color?: string; // Hex color for team branding
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
}

export interface SeriesGroup {
  id: string;
  round: number;
  team1Id: string;
  team2Id: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  matchIds: string[];
  matchCount: number;
}

export interface ResultLog {
  id: string;
  targetId: string; // matchId or seriesId
  type: 'UNLOCK' | 'EDIT' | 'DELETE' | 'PENALTY' | 'BONUS' | 'SETTING_CHANGE' | 'RESULT_ADDED';
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

export interface ManualBonus {
  id: string;
  teamId: string;
  points: number;
  reason: string;
  date: string;
  addedBy?: string;
}

export interface TournamentConfig {
  seriesLength?: string;
  minMatchesPerSeries: number;
  maxMatchesPerSeries: number;
  scheduleFormat: string;
  playoffSystem: string;
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  countSeriesBonus: boolean;
  pointsForSeriesWin: number;
  pointsForSeriesDraw: number;
  pointsForSeriesLoss: number;
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
  manualBonuses?: ManualBonus[];
  logs?: ResultLog[];
  config: TournamentConfig;
  header: TournamentHeader;
  teamsCount: number;
  description?: string;
}

export type AppView = 'MAIN' | 'WORKSPACE';
export type MainTab = 'CREATE' | 'MANAGE';
export type WorkspaceTab = 'OVERVIEW' | 'SCHEDULE' | 'RESULTS' | 'POINTS' | 'SETTINGS';
