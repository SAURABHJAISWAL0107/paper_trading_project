// ============================================================
// Stock universe — 50 popular NSE stocks with SAMPLE base prices
// ============================================================

export interface StockDefinition {
  symbol: string;
  name: string;
  sector: string;
  basePrice: number;
}

export const STOCKS: StockDefinition[] = [
  // Large Cap — IT
  { symbol: "TCS",        name: "Tata Consultancy Services",    sector: "Information Technology", basePrice: 3900 },
  { symbol: "INFY",       name: "Infosys",                      sector: "Information Technology", basePrice: 1780 },
  { symbol: "WIPRO",      name: "Wipro",                        sector: "Information Technology", basePrice: 480  },
  { symbol: "HCLTECH",    name: "HCL Technologies",             sector: "Information Technology", basePrice: 1620 },
  { symbol: "TECHM",      name: "Tech Mahindra",                sector: "Information Technology", basePrice: 1330 },
  { symbol: "LTI",        name: "LTIMindtree",                  sector: "Information Technology", basePrice: 5400 },

  // Large Cap — Banking & Finance
  { symbol: "HDFCBANK",   name: "HDFC Bank",                    sector: "Banking",                basePrice: 1710 },
  { symbol: "ICICIBANK",  name: "ICICI Bank",                   sector: "Banking",                basePrice: 1270 },
  { symbol: "SBIN",       name: "State Bank of India",          sector: "Banking",                basePrice: 820  },
  { symbol: "AXISBANK",   name: "Axis Bank",                    sector: "Banking",                basePrice: 1190 },
  { symbol: "KOTAKBANK",  name: "Kotak Mahindra Bank",          sector: "Banking",                basePrice: 1870 },
  { symbol: "BAJFINANCE", name: "Bajaj Finance",                sector: "Financial Services",     basePrice: 7100 },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv",                sector: "Financial Services",     basePrice: 1700 },

  // Large Cap — Consumer & FMCG
  { symbol: "RELIANCE",   name: "Reliance Industries",          sector: "Energy",                 basePrice: 2970 },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever",           sector: "FMCG",                   basePrice: 2540 },
  { symbol: "ITC",        name: "ITC",                          sector: "FMCG",                   basePrice: 440  },
  { symbol: "NESTLEIND",  name: "Nestlé India",                 sector: "FMCG",                   basePrice: 2450 },
  { symbol: "DABUR",      name: "Dabur India",                  sector: "FMCG",                   basePrice: 560  },
  { symbol: "MARICO",     name: "Marico",                       sector: "FMCG",                   basePrice: 580  },

  // Large Cap — Auto
  { symbol: "TATAMOTORS", name: "Tata Motors",                  sector: "Automobiles",            basePrice: 990  },
  { symbol: "MARUTI",     name: "Maruti Suzuki India",          sector: "Automobiles",            basePrice: 12400 },
  { symbol: "M&M",        name: "Mahindra & Mahindra",          sector: "Automobiles",            basePrice: 2900 },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto",                   sector: "Automobiles",            basePrice: 9200 },
  { symbol: "EICHERMOT",  name: "Eicher Motors",                sector: "Automobiles",            basePrice: 4700 },

  // Large Cap — Pharma
  { symbol: "SUNPHARMA",  name: "Sun Pharmaceutical",           sector: "Pharmaceuticals",        basePrice: 1760 },
  { symbol: "DRREDDY",    name: "Dr. Reddy's Laboratories",     sector: "Pharmaceuticals",        basePrice: 6400 },
  { symbol: "CIPLA",      name: "Cipla",                        sector: "Pharmaceuticals",        basePrice: 1530 },
  { symbol: "DIVISLAB",   name: "Divi's Laboratories",          sector: "Pharmaceuticals",        basePrice: 3900 },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals",             sector: "Healthcare",             basePrice: 6900 },

  // Large Cap — Infrastructure & Capital Goods
  { symbol: "LT",         name: "Larsen & Toubro",              sector: "Construction",           basePrice: 3700 },
  { symbol: "POWERGRID",  name: "Power Grid Corporation",       sector: "Utilities",              basePrice: 330  },
  { symbol: "NTPC",       name: "NTPC",                         sector: "Utilities",              basePrice: 385  },
  { symbol: "ADANIPORTS", name: "Adani Ports",                  sector: "Infrastructure",         basePrice: 1450 },
  { symbol: "ADANIENT",   name: "Adani Enterprises",            sector: "Infrastructure",         basePrice: 2750 },

  // Metals & Mining
  { symbol: "TATASTEEL",  name: "Tata Steel",                   sector: "Metals",                 basePrice: 165  },
  { symbol: "JSWSTEEL",   name: "JSW Steel",                    sector: "Metals",                 basePrice: 870  },
  { symbol: "HINDALCO",   name: "Hindalco Industries",          sector: "Metals",                 basePrice: 650  },
  { symbol: "COALINDIA",  name: "Coal India",                   sector: "Mining",                 basePrice: 430  },

  // Telecom & Media
  { symbol: "BHARTIARTL", name: "Bharti Airtel",                sector: "Telecom",                basePrice: 1570 },
  { symbol: "ZOMATO",     name: "Zomato",                       sector: "Consumer Internet",      basePrice: 260  },

  // Mid Cap
  { symbol: "PIDILITIND",  name: "Pidilite Industries",         sector: "Chemicals",              basePrice: 2980 },
  { symbol: "BERGEPAINT",  name: "Berger Paints",               sector: "Paints",                 basePrice: 555  },
  { symbol: "ASIANPAINT",  name: "Asian Paints",                sector: "Paints",                 basePrice: 2780 },
  { symbol: "TITAN",       name: "Titan Company",               sector: "Consumer Goods",         basePrice: 3650 },
  { symbol: "HAVELLS",     name: "Havells India",               sector: "Electricals",            basePrice: 1780 },
  { symbol: "GODREJCP",    name: "Godrej Consumer Products",    sector: "FMCG",                   basePrice: 1230 },
  { symbol: "TATACONSUM",  name: "Tata Consumer Products",      sector: "FMCG",                   basePrice: 1080 },
  { symbol: "MCDOWELL-N",  name: "United Spirits",              sector: "Beverages",              basePrice: 1170 },
  { symbol: "INDUSINDBK",  name: "IndusInd Bank",               sector: "Banking",                basePrice: 1400 },
  { symbol: "BANDHANBNK",  name: "Bandhan Bank",                sector: "Banking",                basePrice: 195  },
];
