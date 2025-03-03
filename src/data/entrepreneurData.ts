
// Mock data for the entrepreneur dashboard
export const mockDeals = [
  {
    id: "deal1",
    title: "The International Gem Tower",
    location: "New York",
    price: "$2,700,000",
    fundingPercentage: 91,
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab"
  },
  {
    id: "deal2",
    title: "401 N Michigan Ave",
    location: "Chicago",
    price: "$8,770,000",
    fundingPercentage: 81,
    imageUrl: "https://images.unsplash.com/photo-1487958449943-2429e8be8625"
  },
  {
    id: "deal3",
    title: "Tech Hub Square",
    location: "Silicon Valley",
    price: "$12,500,000",
    fundingPercentage: 95,
    imageUrl: "https://images.unsplash.com/photo-1518005020951-eccb494ad742"
  }
];

export const mockInvestors = [
  {
    id: "inv1",
    name: "John Smith",
    email: "john.smith@example.com",
    investmentAmount: "$250,000",
    date: "2023-05-12",
    status: "active" as const
  },
  {
    id: "inv2",
    name: "Jane Doe",
    email: "jane.doe@example.com",
    investmentAmount: "$175,000",
    date: "2023-05-14",
    status: "active" as const
  },
  {
    id: "inv3",
    name: "Robert Johnson",
    email: "robert.j@example.com",
    investmentAmount: "$350,000",
    date: "2023-05-10",
    status: "pending" as const
  },
  {
    id: "inv4",
    name: "Maria Garcia",
    email: "maria.g@example.com",
    investmentAmount: "$180,000",
    date: "2023-05-18",
    status: "active" as const
  },
  {
    id: "inv5",
    name: "David Lee",
    email: "david.lee@example.com",
    investmentAmount: "$420,000",
    date: "2023-05-16",
    status: "declined" as const
  }
];

export const mockDueDiligenceItems = [
  {
    id: "dd1",
    name: "Financial Statement Review",
    status: "completed" as const,
    completedDate: "May 15, 2023"
  },
  {
    id: "dd2",
    name: "Property Title Search",
    status: "completed" as const,
    completedDate: "May 17, 2023"
  },
  {
    id: "dd3",
    name: "Environmental Assessment",
    status: "in-progress" as const
  },
  {
    id: "dd4",
    name: "Property Inspection",
    status: "in-progress" as const
  },
  {
    id: "dd5",
    name: "Legal Compliance Review",
    status: "not-started" as const
  },
  {
    id: "dd6",
    name: "Market Analysis Review",
    status: "not-started" as const
  }
];

export const mockDashboardStats = {
  activeDeals: 3,
  totalRaised: "$4.25M",
  investors: 27,
  avgCompletionRate: 89
};
