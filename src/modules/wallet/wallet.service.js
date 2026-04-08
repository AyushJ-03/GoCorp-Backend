import OfficeWallet from "./wallet.model.js";
import OfficeWalletTransaction from "./walletTransaction.model.js";
import { calculateBlockedAmount } from "../../utils/fareBuffer.js";

export const addMoney = async (officeId, amount) => {

    let wallet = await OfficeWallet.findOne({ officeId });

    if (!wallet) {
        wallet = await OfficeWallet.create({
            officeId,
            balance: amount
        });
    } else {
        wallet.balance += amount;
        await wallet.save();
    }

    await OfficeWalletTransaction.create({
        officeId,
        type: "CREDIT",
        amount,
        description: "Admin recharge"
    });

    return wallet;
};

//block money for a ride
export const blockAmount = async (officeId, estimatedFare, rideId) => {

    const wallet = await OfficeWallet.findOne({ officeId });

    if (!wallet) throw new Error("Office wallet not found");

    const blockAmount = calculateBlockedAmount(estimatedFare);

    if (wallet.balance < blockAmount) {
        throw new Error("Office wallet insufficient");
    }

    wallet.balance -= blockAmount;
    wallet.blockedBalance += blockAmount;

    await wallet.save();

    await OfficeWalletTransaction.create({
        officeId,
        type: "BLOCK",
        amount: blockAmount,
        rideId,
        description: "Ride booking auto block"
    });

    return wallet;
};

//deduct final fair
export const deductFinalFare = async (officeId, finalAmount, rideId) => {

    const wallet = await OfficeWallet.findOne({ officeId });

    if (!wallet) throw new Error("Office wallet not found");

    // Find how much was blocked for this ride
    const blockedTxn = await OfficeWalletTransaction.findOne({
        officeId,
        rideId,
        type: "BLOCK"
    });

    if (!blockedTxn) {
        throw new Error("No blocked amount found for this ride");
    }

    const blockedAmount = blockedTxn.amount;

    if (wallet.blockedBalance < blockedAmount) {
        throw new Error("Blocked balance mismatch");
    }

    // Deduct final amount
    wallet.blockedBalance -= blockedAmount;

    // Auto release remaining
    const releaseAmount = blockedAmount - finalAmount;

    if (releaseAmount > 0) {
        wallet.balance += releaseAmount;

        await OfficeWalletTransaction.create({
            officeId,
            type: "RELEASE",
            amount: releaseAmount,
            rideId,
            description: "Auto release after final fare"
        });
    }

    await wallet.save();

    // Debit transaction
    await OfficeWalletTransaction.create({
        officeId,
        type: "DEBIT",
        amount: finalAmount,
        rideId,
        description: "Ride completed deduction"
    });

    return wallet;
};

//release remaining
export const releaseAmount = async (officeId, amount, rideId) => {

    const wallet = await OfficeWallet.findOne({ officeId });

    wallet.blockedBalance -= amount;
    wallet.balance += amount;

    await wallet.save();

    await OfficeWalletTransaction.create({
        officeId,
        type: "RELEASE",
        amount,
        rideId,
        description: "Ride adjustment"
    });

    return wallet;
};