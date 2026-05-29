// /api/date.js
// Returns current date context for AI prompts
// Deploy to: api/date.js in your Vercel project

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const now = new Date();
  
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  // Upcoming gifting events with real countdown
  const events = [
    { name: "Father's Day UK", date: new Date(now.getFullYear(), 5, 15) },
    { name: "Halloween", date: new Date(now.getFullYear(), 9, 31) },
    { name: "Bonfire Night", date: new Date(now.getFullYear(), 10, 5) },
    { name: "Christmas", date: new Date(now.getFullYear(), 11, 25) },
    { name: "Valentine's Day", date: new Date(now.getFullYear()+1, 1, 14) },
    { name: "Mother's Day UK", date: new Date(now.getFullYear()+1, 2, 30) },
    { name: "Easter", date: new Date(now.getFullYear()+1, 3, 5) },
  ];

  // Calculate days until each event
  const upcomingEvents = events
    .map(e => {
      // If event passed this year, use next year
      let eventDate = new Date(e.date);
      if (eventDate < now) {
        eventDate = new Date(eventDate.setFullYear(now.getFullYear() + 1));
      }
      const daysUntil = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));
      return {
        name: e.name,
        date: eventDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        daysUntil,
        urgent: daysUntil <= 42, // 6 weeks = time to list
        listBy: daysUntil <= 14 ? 'LIST NOW — URGENT' : 
                daysUntil <= 42 ? `List in next ${daysUntil - 14} days` :
                `${Math.floor((daysUntil - 42) / 7)} weeks until you need to list`
      };
    })
    .filter(e => e.daysUntil > 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);

  res.status(200).json({
    // For AI prompts
    aiContext: `TODAY IS ${days[now.getDay()].toUpperCase()} ${now.getDate()} ${months[now.getMonth()].toUpperCase()} ${now.getFullYear()}. `,
    
    // Human readable
    today: now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    month: months[now.getMonth()],
    year: now.getFullYear(),
    monthNum: now.getMonth() + 1,
    
    // Upcoming events with real countdowns
    upcomingEvents,
    
    // Current season context for sellers
    season: now.getMonth() >= 2 && now.getMonth() <= 4 ? 'Spring' :
             now.getMonth() >= 5 && now.getMonth() <= 7 ? 'Summer' :
             now.getMonth() >= 8 && now.getMonth() <= 10 ? 'Autumn' : 'Winter',
    
    // What sellers should be listing right now (6 week lead time)
    listForNow: upcomingEvents
      .filter(e => e.daysUntil <= 42)
      .map(e => e.name),
    
    // Timestamp
    timestamp: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000)
  });
}
