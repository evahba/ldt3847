const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const csvFilePath = path.join(__dirname, '.zenflow-attachments/07c89626-c022-42c0-925b-e7ee848bd344.csv');
const csvFile = fs.readFileSync(csvFilePath, 'utf8');

Papa.parse(csvFile, {
  complete: function(results) {
    const data = results.data;
    // Row 14 is headers (index 13)
    // Row 15 starts data (index 14)
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const formattedData = [];
    const summary = {};

    days.forEach(day => {
      summary[day] = {
        totalSales: 0,
        avgRcmd: 0,
        maxRcmd: 0,
        count: 0
      };
    });

    for (let i = 14; i < data.length; i++) {
      const row = data[i];
      if (!row[4] || row[4] === '') continue;

      const entry = {
        id: row[0],
        dayPart: row[4],
        timeRange: row[5],
        time: row[6],
        days: {}
      };

      days.forEach((day, index) => {
        const baseIndex = 7 + (index * 4);
        const salesStr = row[baseIndex]?.trim() || "";
        const rcmdStr = row[baseIndex + 3]?.trim() || "0";
        
        // Extract numeric value from sales (e.g., "$143" -> 143)
        const salesVal = parseInt(salesStr.replace(/[^0-9]/g, '')) || 0;
        const rcmdVal = parseInt(rcmdStr) || 0;

        entry.days[day] = {
          sales: salesStr,
          minRcmd: row[baseIndex + 1]?.trim(),
          nonSmooth: row[baseIndex + 2]?.trim(),
          rcmd: rcmdStr
        };

        if (salesVal > 0 || rcmdVal > 0) {
          summary[day].totalSales += salesVal;
          summary[day].count++;
          summary[day].maxRcmd = Math.max(summary[day].maxRcmd, rcmdVal);
          summary[day].avgRcmd += rcmdVal;
        }
      });

      formattedData.push(entry);
    }

    days.forEach(day => {
      if (summary[day].count > 0) {
        summary[day].avgRcmd = (summary[day].avgRcmd / summary[day].count).toFixed(1);
      }
    });

    fs.writeFileSync(path.join(__dirname, 'src/lib/data.json'), JSON.stringify({ items: formattedData, summary }, null, 2));
    console.log('Data successfully parsed to src/lib/data.json');
  }
});
