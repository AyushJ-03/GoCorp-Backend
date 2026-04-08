import express from "express";
import * as walletController from "./wallet.controller.js";

const router = express.Router();

router.post("/add-money", walletController.addMoney);
router.post("/block", walletController.blockAmount);
router.post("/deduct", walletController.deductFare);
router.post("/release", walletController.releaseAmount);

router.get("/:officeId", walletController.getWallet);
router.get("/transactions/:officeId", walletController.getTransactions);

export default router;