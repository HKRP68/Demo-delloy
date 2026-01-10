export type TournamentType = 'TEST' | 'LIMITED_OVERS';

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  owner?: string;
  // Stats
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesTie: number;
  runsScored: number;
  oversFaced: number;
  runsConceded: number;
  oversBowled: number;
  penalties: number;
  points: number;
  pct?: number; // For Test Matches
  nrr?: number; // For Limited Overs
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
  seriesId?: string; // Grouping for Test matches
  team1Id: string;
  team2Id: string;
  venueId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  winnerId?: string;
  resultType?: MatchResultType;
  notes?: string;
  // Limited Overs Specific
  t1Runs?: number;
  t1Wickets?: number;
  t1Overs?: number; // Format: 19.3
  t2Runs?: number;
  t2Wickets?: number;
  t2Overs?: number; // Format: 19.3
  tossWinnerId?: string;
  isDlsApplied?: boolean;
}

export interface SeriesGroup {
  id: string;
  team1Id: string;
  team2Id: string;
  matches: Match[];
  status: 'INCOMPLETE' | 'IN_PROGRESS' | 'COMPLETED';
  completedCount: number;
  totalCount: number;
  tournamentRound: number;
}

export interface ResultLog {
  id: string;
  matchId: string;
  oldResult: string;
  newResult: string;
  editedBy: string;
  timestamp: string;
  reason: string;
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
  // Series Bonus Logic
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
  teams: Team[];
  stadiums: Stadium[];
  matches: Match[];
  penalties: PenaltyRecord[];
  logs?: ResultLog[];
  config: TournamentConfig;
  header: TournamentHeader;
  teamsCount: number;
}

export type AppView = 'MAIN' | 'WORKSPACE';
export type MainTab = 'CREATE' | 'MANAGE';
export type WorkspaceTab = 'INFO' | 'SCHEDULE' | 'RESULTS' | 'POINTS' | 'DISTRIBUTION' | 'PLAYOFFS' | 'SETTINGS';