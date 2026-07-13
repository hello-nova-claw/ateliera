export interface LifeArea {
  id: string;
  title: string;
}

export const defaultLifeAreas = [
  { id: 'family', title: 'Family' },
  { id: 'home', title: 'Home' },
  { id: 'health-wellbeing', title: 'Health & Wellbeing' },
  { id: 'work-business', title: 'Work / Business' },
  { id: 'money', title: 'Money' },
  { id: 'creativity', title: 'Creativity' },
  { id: 'relationships-community', title: 'Relationships / Community' },
  { id: 'adventure', title: 'Adventure' },
  { id: 'spirituality', title: 'Spirituality' },
  { id: 'learning', title: 'Learning' },
] as const satisfies readonly LifeArea[];
