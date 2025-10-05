// Player Progress System - Leveling and Achievements

export interface PlayerStats {
  totalMatches: number;
  top1Wins: number;
  top1HighStakes: number;
  lastPlaces: number;
  totalPrizes: number; // Any prize won (not just top1)
  currentXP: number;
  level: number;
  
  // Streak tracking
  currentWinStreak: number;
  maxWinStreak: number;
  currentMatchStreak: number; // consecutive matches played
  currentTop1Streak: number;
  
  // Achievement counters
  stormCount: number; // Times achieved 10+ ⚡
  volcanoCount: number; // Times achieved 10+ 🔥
  soothsayerCount: number; // Times achieved 2+ top1 in a row
}

export interface Achievement {
  id: string;
  emoji: string;
  name: string;
  description: string;
  lore: string; // Max 45 chars
  isRepeatable: boolean;
  count?: number;
  isActive?: boolean; // For streak-based achievements
  activeCount?: number; // Current streak count
}

// XP Calculation
export function getXPForLevel(level: number): number {
  if (level <= 1) return 500;
  let xp = 500;
  for (let i = 2; i <= level; i++) {
    xp = Math.floor(xp * 1.2); // 20% increase each level
  }
  return xp;
}

export function getTotalXPForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += getXPForLevel(i);
  }
  return total;
}

export function calculateLevel(totalXP: number): { level: number; currentLevelXP: number; nextLevelXP: number } {
  let level = 1;
  let accumulatedXP = 0;
  
  while (true) {
    const xpNeeded = getXPForLevel(level);
    if (accumulatedXP + xpNeeded > totalXP) {
      const currentLevelXP = totalXP - accumulatedXP;
      return {
        level,
        currentLevelXP,
        nextLevelXP: xpNeeded
      };
    }
    accumulatedXP += xpNeeded;
    level++;
  }
}

// Achievement Definitions
export const ACHIEVEMENTS: Record<string, Omit<Achievement, 'count' | 'isActive' | 'activeCount'>> = {
  chaos_champion: {
    id: 'chaos_champion',
    emoji: '🏆',
    name: 'Chaos Champion',
    description: 'Won 1st place in Chaos Arena',
    lore: 'The crowd roars for the arena champion!',
    isRepeatable: true
  },
  high_stakes_emperor: {
    id: 'high_stakes_emperor',
    emoji: '👑',
    name: 'High Stakes Emperor',
    description: 'Won 1st place in High Stakes',
    lore: 'Only the bravest claim the golden crown!',
    isRepeatable: true
  },
  fallen_gladiator: {
    id: 'fallen_gladiator',
    emoji: '💩',
    name: 'Fallen Gladiator',
    description: 'Finished in last place',
    lore: 'Even the greatest warriors fall sometimes',
    isRepeatable: true
  },
  addict: {
    id: 'addict',
    emoji: '⚡',
    name: 'Arena Addict',
    description: 'Played 3+ matches in a row',
    lore: 'The arena calls and you must answer!',
    isRepeatable: false,
    isActive: true
  },
  storm: {
    id: 'storm',
    emoji: '🌩',
    name: 'Storm Bringer',
    description: 'Achieved 10+ ⚡ streak',
    lore: 'Lightning courses through your veins!',
    isRepeatable: true
  },
  soothsayer: {
    id: 'soothsayer',
    emoji: '🔮',
    name: 'Soothsayer',
    description: 'Won 1st place 2 times in a row',
    lore: 'You see victory before it happens!',
    isRepeatable: true
  },
  winning_streak: {
    id: 'winning_streak',
    emoji: '🔥',
    name: 'Winning Streak',
    description: 'Won prizes 2+ times in a row',
    lore: 'Victory flows through your sword!',
    isRepeatable: false,
    isActive: true
  },
  volcano: {
    id: 'volcano',
    emoji: '🌋',
    name: 'Volcano',
    description: 'Achieved 10+ 🔥 streak',
    lore: 'Your victories burn bright as volcano!',
    isRepeatable: true
  },
  veteran: {
    id: 'veteran',
    emoji: '🏅',
    name: 'Arena Veteran',
    description: 'Played 20+ matches',
    lore: 'Scars tell the story of a true warrior',
    isRepeatable: false
  }
};

// Calculate achievements based on player stats
export function calculateAchievements(stats: PlayerStats): Achievement[] {
  const achievements: Achievement[] = [];

  // Chaos Champion
  if (stats.top1Wins > 0) {
    achievements.push({
      ...ACHIEVEMENTS.chaos_champion,
      count: stats.top1Wins
    });
  }

  // High Stakes Emperor
  if (stats.top1HighStakes > 0) {
    achievements.push({
      ...ACHIEVEMENTS.high_stakes_emperor,
      count: stats.top1HighStakes
    });
  }

  // Fallen Gladiator
  if (stats.lastPlaces > 0) {
    achievements.push({
      ...ACHIEVEMENTS.fallen_gladiator,
      count: stats.lastPlaces
    });
  }

  // Arena Addict (active streak)
  if (stats.currentMatchStreak >= 3) {
    achievements.push({
      ...ACHIEVEMENTS.addict,
      isActive: true,
      activeCount: stats.currentMatchStreak
    });
  }

  // Storm (achieved 10+ ⚡)
  if (stats.stormCount > 0) {
    achievements.push({
      ...ACHIEVEMENTS.storm,
      count: stats.stormCount
    });
  }

  // Soothsayer
  if (stats.soothsayerCount > 0) {
    achievements.push({
      ...ACHIEVEMENTS.soothsayer,
      count: stats.soothsayerCount
    });
  }

  // Winning Streak (active)
  if (stats.currentWinStreak >= 2) {
    achievements.push({
      ...ACHIEVEMENTS.winning_streak,
      isActive: true,
      activeCount: Math.min(stats.currentWinStreak, 10) // Max 10 🔥
    });
  }

  // Volcano (achieved 10+ 🔥)
  if (stats.volcanoCount > 0) {
    achievements.push({
      ...ACHIEVEMENTS.volcano,
      count: stats.volcanoCount
    });
  }

  // Veteran
  if (stats.totalMatches >= 20) {
    achievements.push({
      ...ACHIEVEMENTS.veteran
    });
  }

  return achievements;
}

// Format achievements for display
export function formatAchievementsDisplay(achievements: Achievement[]): string {
  const sorted = achievements.sort((a, b) => {
    // Sort order: 🏆👑💩⚡🌩🔮🔥🌋🏅
    const order = ['chaos_champion', 'high_stakes_emperor', 'fallen_gladiator', 'addict', 'storm', 'soothsayer', 'winning_streak', 'volcano', 'veteran'];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });

  return sorted.map(achievement => {
    if (achievement.isActive && achievement.activeCount) {
      // Repeat emoji for active streaks
      if (achievement.id === 'addict') {
        // ⚡ shows once for 3+ matches
        return achievement.emoji;
      } else if (achievement.id === 'winning_streak') {
        // 🔥 repeats for each win after 2 (max 10)
        const fireCount = Math.min(achievement.activeCount - 1, 10);
        return achievement.emoji.repeat(fireCount);
      }
    }
    return achievement.emoji;
  }).join('');
}

// Mock data for testing (remove when connected to real backend)
export function getMockPlayerStats(address: string): PlayerStats {
  // Generate some pseudo-random stats based on address
  const seed = address.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const random = (max: number) => Math.floor((seed * 17 + Math.random()) * max) % max;
  
  return {
    totalMatches: random(50) + 5,
    top1Wins: random(8),
    top1HighStakes: random(3),
    lastPlaces: random(5),
    totalPrizes: random(15) + 2,
    currentXP: random(10000) + 500,
    level: 1, // Will be calculated
    currentWinStreak: random(5),
    maxWinStreak: random(8) + 2,
    currentMatchStreak: random(7) + 1,
    currentTop1Streak: random(3),
    stormCount: random(3),
    volcanoCount: random(2),
    soothsayerCount: random(4)
  };
}