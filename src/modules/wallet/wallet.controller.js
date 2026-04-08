import * as walletService from "./wallet.service.js";
import OfficeWallet from "./wallet.model.js";
import OfficeWalletTransaction from "./walletTransaction.model.js";

export const addMoney = async (req, res) => {
    try {
        const wallet = await walletService.addMoney(
            req.body.officeId,
            req.body.amount
        );

        res.json(wallet);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const blockAmount = async (req, res) => {
    try {
        const { officeId, estimatedFare, rideId } = req.body;
        const wallet = await walletService.blockAmount(officeId, estimatedFare, rideId);
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const deductFare = async (req, res) => {
    try {
        const { officeId, amount, rideId } = req.body;
        const wallet = await walletService.deductFinalFare(officeId, amount, rideId);
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const releaseAmount = async (req, res) => {
    try {
        const { officeId, amount, rideId } = req.body;
        const wallet = await walletService.releaseAmount(officeId, amount, rideId);
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getWallet = async (req, res) => {
    try {
        const wallet = await OfficeWallet.findOne({ officeId: req.params.officeId });
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const getTransactions = async (req, res) => {
    try {
        const txns = await OfficeWalletTransaction.find({
            officeId: req.params.officeId
        }).sort({ createdAt: -1 });

        res.json(txns);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
