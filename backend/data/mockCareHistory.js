function dateDaysAgo(today, daysAgo) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function getMockCareHistory(today) {
  return [
    {
      plantId: "plant-1",
      action: "Water",
      completedAt: dateDaysAgo(today, 8),
      status: "completed"
    },
    {
      plantId: "plant-2",
      action: "Water",
      completedAt: dateDaysAgo(today, 3),
      status: "completed"
    },
    {
      plantId: "plant-3",
      action: "Water",
      completedAt: dateDaysAgo(today, 4),
      status: "completed"
    }
  ];
}
