export function generateMonthOptions(defaultLabel: string = "Select Month", yearsToGenerate: number = 4) {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-11

  // "0" key is the placeholder
  const options: Record<string, string> = {
    "0": defaultLabel
  };

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Loop through years
  for (let y = 0; y <= yearsToGenerate; y++) {
    const year = currentYear + y;
    // For current year, start from current month. For future years, start from Jan (0).
    const startM = (y === 0) ? currentMonth : 0;

    for (let m = startM; m < 12; m++) {
      // Key format based on searchParams.json: YYYY + Month (1-12)
      // e.g., 20242, 202410
      const monthNum = m + 1;
      const key = `${year}${monthNum}`;
      const value = `${months[m]} ${year}`;
      options[key] = value;
    }
  }
  return options;
}
