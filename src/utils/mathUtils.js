export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

export function calculateConsensus(reports) {
  const NOW = Date.now();
  let weightedSum = 0;
  let weightSum = 0;

  reports.forEach(report => {
    const hoursPassed = (NOW - report.timestamp) / (1000 * 60 * 60);
    if (hoursPassed >= 24) return; 
    const timeWeight = 1 - (hoursPassed / 24); 
    weightedSum += (report.price * timeWeight);
    weightSum += timeWeight;
  });

  if (weightSum === 0) return { price: null, confidence: 0 };
  const finalPrice = weightedSum / weightSum;
  const confidence = Math.min(100, Math.round((weightSum / 3) * 100));
  return { price: finalPrice, confidence };
}

export const formatMoney = (val) => {
  let num = val.replace(/\D/g, '');
  if (!num) return '';
  return (Number(num) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const getRawNumber = (formattedVal) => {
  return Number(formattedVal.replace(/\D/g, '')) / 100;
};