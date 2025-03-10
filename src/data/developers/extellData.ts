
import { Developer } from "./types";

export const extellData: Developer = {
  id: "dev-3",
  name: "EXTELL",
  rating: 4.7,
  location: "New York, NY",
  foundedYear: 1989,
  completedProjects: 43,
  teamSize: "100-250",
  bio: "EXTELL is one of New York's most active real estate developers. The company has developed more than 36 million square feet of residential, commercial, retail, office and mixed-use properties. The company's dedication to excellence is demonstrated through its wide portfolio of distinctive properties, delivering the highest caliber of design, construction, amenities and service.",
  pastProjects: [
    {
      name: "Central Park Tower",
      year: 2020,
      roi: 15.2,
      location: "New York, NY"
    },
    {
      name: "One Manhattan Square",
      year: 2019,
      roi: 13.8,
      location: "New York, NY"
    },
    {
      name: "The International Gem Tower",
      year: 2018,
      roi: 11.2,
      location: "New York, NY"
    }
  ],
  performanceData: [
    { year: "2016", roi: 9.5 },
    { year: "2017", roi: 10.2 },
    { year: "2018", roi: 11.7 },
    { year: "2019", roi: 12.8 },
    { year: "2020", roi: 10.5 },
    { year: "2021", roi: 13.2 },
    { year: "2022", roi: 14.5 }
  ],
  riskFactors: [
    "Luxury market exposure: Focused on high-end properties which may be affected by economic downturns.",
    "Geographic concentration: Primary focus on New York City market.",
    "Construction complexity: Advanced engineering requirements for tall buildings.",
    "Financing requirements: Large-scale projects require significant capital."
  ],
  legalHistory: "EXTELL has successfully navigated the complex New York real estate regulatory environment for over three decades. The company maintains strong relationships with regulatory authorities and has no significant litigation that would materially impact operations.",
  mediaArticles: [
    {
      title: "EXTELL's Central Park Tower Becomes World's Tallest Residential Building",
      source: "Architectural Digest",
      date: "February 8, 2022",
      url: "#"
    },
    {
      title: "EXTELL Reshaping New York's Luxury Real Estate Market",
      source: "Forbes",
      date: "October 15, 2021",
      url: "#"
    },
    {
      title: "The Future of Urban Living: EXTELL's Vision for Mixed-Use Development",
      source: "Urban Development Journal",
      date: "May 3, 2020",
      url: "#"
    }
  ]
};
