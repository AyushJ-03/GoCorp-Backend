export const calculateBlockedAmount = (estimatedFare) => {

    const bufferPercent = 0.25; // 25% buffer

    const blockedAmount = estimatedFare + (estimatedFare * bufferPercent);

    return Math.ceil(blockedAmount);
};