
export interface Developer {
  id: string;
  name: string;
  rating: number;
  location: string;
  foundedYear: number;
  completedProjects: number;
  teamSize: string;
  bio: string;
  pastProjects: {
    name: string;
    year: number;
    roi: number;
    location: string;
  }[];
  performanceData: {
    year: string;
    roi: number;
  }[];
  riskFactors: string[];
  legalHistory: string;
  mediaArticles: {
    title: string;
    source: string;
    date: string;
    url: string;
  }[];
}
