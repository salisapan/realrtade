
import { Developer } from "./types";

export const urbanHorizonData: Developer = {
  id: "dev-2",
  name: "Urban Horizon Development",
  rating: 4.6,
  location: "San Francisco, CA",
  foundedYear: 2010,
  completedProjects: 22,
  teamSize: "20-50",
  bio: "Urban Horizon specializes in mixed-use developments across major metropolitan areas, with a focus on innovative design and technological integration. Our properties blend commercial, residential, and retail spaces to create dynamic urban environments. We pride ourselves on transforming underutilized spaces into vibrant community assets.",
  pastProjects: [
    {
      name: "The Foundry Tech Hub",
      year: 2022,
      roi: 13.5,
      location: "San Francisco, CA"
    },
    {
      name: "Harbor View Mixed-Use Complex",
      year: 2020,
      roi: 11.2,
      location: "Seattle, WA"
    },
    {
      name: "Innovation Square",
      year: 2019,
      roi: 10.9,
      location: "Boston, MA"
    }
  ],
  performanceData: [
    { year: "2017", roi: 8.2 },
    { year: "2018", roi: 9.1 },
    { year: "2019", roi: 10.5 },
    { year: "2020", roi: 10.2 },
    { year: "2021", roi: 11.8 },
    { year: "2022", roi: 12.3 }
  ],
  riskFactors: [
    "Tech sector dependency: Many projects rely on tech company tenants.",
    "Urban competition: High competition in prime metropolitan areas.",
    "Development costs: Rising construction costs in major cities.",
    "Environmental compliance: Stricter urban environmental regulations."
  ],
  legalHistory: "Urban Horizon has maintained compliance with regulatory requirements across multiple jurisdictions. There was one minor dispute with a contractor in 2018 that was settled out of court with no material impact on operations.",
  mediaArticles: [
    {
      title: "Urban Horizon's Tech Hub Attracts Major Software Companies",
      source: "Tech Business Review",
      date: "January 10, 2023",
      url: "#"
    },
    {
      title: "Mixed-Use Developments Transforming Urban Centers - Urban Horizon Leading the Way",
      source: "Architecture Today",
      date: "May 18, 2022",
      url: "#"
    }
  ]
};
