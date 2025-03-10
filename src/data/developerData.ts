
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

export const developers: Developer[] = [
  {
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
  },
  {
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
  },
  {
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
  }
];

export const getDeveloperById = (id: string): Developer | undefined => {
  return developers.find(developer => developer.id === id);
};

export const getDeveloperByName = (name: string): Developer | undefined => {
  return developers.find(developer => developer.name.toLowerCase() === name.toLowerCase());
};
