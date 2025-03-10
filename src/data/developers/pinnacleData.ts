
import { Developer } from "./types";

export const pinnacleData: Developer = {
  id: "dev-1",
  name: "Pinnacle Real Estate Group",
  rating: 4.8,
  location: "New York, NY",
  foundedYear: 2005,
  completedProjects: 37,
  teamSize: "50-100",
  bio: "Pinnacle Real Estate Group is a leading developer of commercial and residential properties across the United States. With over 15 years of experience, we've completed more than 35 successful projects with consistent returns for our investors. Our focus on prime locations and sustainable building practices has established us as an industry leader.",
  pastProjects: [
    {
      name: "SoHo Heights Commercial Center",
      year: 2021,
      roi: 14.2,
      location: "New York, NY"
    },
    {
      name: "Riverside Towers",
      year: 2019,
      roi: 12.8,
      location: "Chicago, IL"
    },
    {
      name: "The Metropolitan Business Park",
      year: 2018,
      roi: 10.5,
      location: "Austin, TX"
    },
    {
      name: "Oakwood Residences",
      year: 2017,
      roi: 9.7,
      location: "Denver, CO"
    }
  ],
  performanceData: [
    { year: "2016", roi: 8.7 },
    { year: "2017", roi: 9.5 },
    { year: "2018", roi: 10.2 },
    { year: "2019", roi: 11.8 },
    { year: "2020", roi: 9.3 },
    { year: "2021", roi: 12.5 },
    { year: "2022", roi: 13.1 }
  ],
  riskFactors: [
    "Market volatility: Real estate markets can fluctuate based on economic conditions.",
    "Construction delays: Development projects may face timeline extensions.",
    "Regulatory changes: New regulations may impact property valuations or development plans.",
    "Occupancy risks: Commercial properties depend on tenant stability and rental income."
  ],
  legalHistory: "Pinnacle Real Estate Group has maintained a clean legal record with no significant litigation or regulatory issues in its operating history. The company adheres to all applicable regulations and maintains transparency with investors.",
  mediaArticles: [
    {
      title: "Pinnacle Completes $82M Commercial Development in Downtown Austin",
      source: "Commercial Property Executive",
      date: "March 15, 2022",
      url: "#"
    },
    {
      title: "Top 10 Developers Reshaping Urban Landscapes - Pinnacle Featured",
      source: "Real Estate Insider",
      date: "November 22, 2021",
      url: "#"
    },
    {
      title: "Pinnacle's Sustainable Building Practices Win Industry Award",
      source: "Green Building Journal",
      date: "August 5, 2020",
      url: "#"
    }
  ]
};
