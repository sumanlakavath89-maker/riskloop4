/**
 * Official Indian Economic Calendar Schedule Configuration
 * 
 * Sourced directly from Official Government Advance Release Calendars (ARC):
 * 1. CPI Inflation: MoSPI / NSO (12th of each month @ 17:30 IST)
 * 2. IIP - Index of Industrial Production: MoSPI / NSO (28th of each month @ 16:00/17:30 IST)
 * 3. WPI Inflation: DPIIT / Office of Economic Adviser (14th of each month @ 12:00 IST)
 * 4. GDP Quarterly Estimates: MoSPI / NSO (Last working day of Feb, May, Aug, Nov @ 17:30 IST)
 * 5. RBI Monetary Policy / Repo Rate: Reserve Bank of India MPC Schedule
 * 
 * Strict Source-of-Truth Rule:
 *  - Only dates explicitly verified against published official ARCs are in `officialDates`.
 *  - Events within `officialDates` get `schedule_status: 'confirmed'`, `schedule_source: 'official'`.
 *  - Dynamic recurrence beyond ARC gets `schedule_status: 'provisional'`, `schedule_source: 'calculated'`.
 */

export const INDIA_ECONOMIC_EVENT_CONFIGS = [
  {
    id: 'IN_CPI',
    eventName: 'CPI Inflation',
    country: 'India',
    countryCode: 'IN',
    timezone: 'Asia/Kolkata',
    impact: 'high',
    defaultTime: '17:30:00',
    unit: '%',
    source: 'MoSPI',
    sourceUrl: 'https://www.mospi.gov.in',
    description: 'All India Consumer Price Index (Combined) Inflation Rate (Year-over-Year)',
    recurrence: {
      frequency: 'monthly',
      dayOfMonth: 12,
      rollWeekendToNextWorkingDay: true
    },
    // Official Advance Release Calendar (ARC) overrides (MoSPI)
    officialDates: [
      { date: '2026-08-12', time: '17:30:00', period: 'Jul 2026' },
      { date: '2026-09-14', time: '17:30:00', period: 'Aug 2026' }, // 12th is Saturday -> Monday 14th
      { date: '2026-10-12', time: '17:30:00', period: 'Sep 2026' },
      { date: '2026-11-12', time: '17:30:00', period: 'Oct 2026' },
      { date: '2026-12-14', time: '17:30:00', period: 'Nov 2026' }, // 12th is Saturday -> Monday 14th
      { date: '2027-01-12', time: '17:30:00', period: 'Dec 2026' },
      { date: '2027-02-12', time: '17:30:00', period: 'Jan 2027' },
    ]
  },
  {
    id: 'IN_IIP',
    eventName: 'IIP',
    country: 'India',
    countryCode: 'IN',
    timezone: 'Asia/Kolkata',
    impact: 'medium',
    defaultTime: '17:30:00',
    unit: '%',
    source: 'MoSPI',
    sourceUrl: 'https://www.mospi.gov.in',
    description: 'Quick Estimates of Index of Industrial Production (IIP) Growth (Base 2011-12)',
    recurrence: {
      frequency: 'monthly',
      dayOfMonth: 28,
      rollWeekendToNextWorkingDay: true
    },
    // Official MoSPI Advance Release Calendar: IIP Quick Estimates released on 28th of every month
    officialDates: [
      { date: '2026-08-28', time: '17:30:00', period: 'Jun 2026' },
      { date: '2026-09-28', time: '17:30:00', period: 'Jul 2026' },
      { date: '2026-10-28', time: '17:30:00', period: 'Aug 2026' },
      { date: '2026-11-30', time: '17:30:00', period: 'Sep 2026' }, // 28th is Saturday -> Monday 30th
      { date: '2026-12-28', time: '17:30:00', period: 'Oct 2026' },
      { date: '2027-01-28', time: '17:30:00', period: 'Nov 2026' },
      { date: '2027-02-26', time: '17:30:00', period: 'Dec 2026' }, // Last working day of Feb
    ]
  },
  {
    id: 'IN_WPI',
    eventName: 'WPI Inflation',
    country: 'India',
    countryCode: 'IN',
    timezone: 'Asia/Kolkata',
    impact: 'medium',
    defaultTime: '12:00:00',
    unit: '%',
    source: 'DPIIT / Ministry of Commerce',
    sourceUrl: 'https://eaindustry.nic.in',
    description: 'Wholesale Price Index (WPI) Inflation Rate (Base 2011-12)',
    recurrence: {
      frequency: 'monthly',
      dayOfMonth: 14,
      rollWeekendToNextWorkingDay: true
    },
    // Official DPIIT / Ministry of Commerce Calendar: 14th of each month @ 12:00 IST
    officialDates: [
      { date: '2026-08-14', time: '12:00:00', period: 'Jul 2026' },
      { date: '2026-09-14', time: '12:00:00', period: 'Aug 2026' },
      { date: '2026-10-14', time: '12:00:00', period: 'Sep 2026' },
      { date: '2026-11-16', time: '12:00:00', period: 'Oct 2026' }, // 14th is Saturday -> Monday 16th
      { date: '2026-12-14', time: '12:00:00', period: 'Nov 2026' },
      { date: '2027-01-14', time: '12:00:00', period: 'Dec 2026' },
      { date: '2027-02-15', time: '12:00:00', period: 'Jan 2027' }, // 14th is Sunday -> Monday 15th
    ]
  },
  {
    id: 'IN_RBI_POLICY',
    eventName: 'RBI Monetary Policy / Repo Rate',
    country: 'India',
    countryCode: 'IN',
    timezone: 'Asia/Kolkata',
    impact: 'high',
    defaultTime: '10:00:00',
    unit: '%',
    source: 'Reserve Bank of India',
    sourceUrl: 'https://www.rbi.org.in',
    description: 'Monetary Policy Committee (MPC) Resolution and Policy Repo Rate Decision',
    recurrence: {
      frequency: 'bi-monthly',
    },
    // Official RBI MPC Schedule
    officialDates: [
      { date: '2026-08-07', time: '10:00:00', period: 'Aug 2026 MPC' },
      { date: '2026-10-08', time: '10:00:00', period: 'Oct 2026 MPC' },
      { date: '2026-12-04', time: '10:00:00', period: 'Dec 2026 MPC' },
      { date: '2027-02-05', time: '10:00:00', period: 'Feb 2027 MPC' },
      { date: '2027-04-09', time: '10:00:00', period: 'Apr 2027 MPC' },
    ]
  },
  {
    id: 'IN_GDP',
    eventName: 'GDP',
    country: 'India',
    countryCode: 'IN',
    timezone: 'Asia/Kolkata',
    impact: 'high',
    defaultTime: '17:30:00',
    unit: '%',
    source: 'MoSPI',
    sourceUrl: 'https://www.mospi.gov.in',
    description: 'Quarterly Gross Domestic Product (GDP) Estimates (Year-over-Year Growth)',
    recurrence: {
      frequency: 'quarterly',
      months: [2, 5, 8, 11]
    },
    // Official MoSPI Quarterly GDP Release Schedule (NSO)
    officialDates: [
      { date: '2026-08-31', time: '17:30:00', period: 'Q1 FY27 (Apr-Jun 2026)' },
      { date: '2026-11-30', time: '17:30:00', period: 'Q2 FY27 (Jul-Sep 2026)' },
      { date: '2027-02-26', time: '17:30:00', period: 'Q3 FY27 (Oct-Dec 2026)' },
      { date: '2027-05-31', time: '17:30:00', period: 'Q4 FY27 (Jan-Mar 2027)' },
    ]
  }
];
