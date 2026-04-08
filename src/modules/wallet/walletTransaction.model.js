import mongoose from "mongoose";

const officeWalletTransactionSchema = new mongoose.Schema({
    officeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Office"
    },
    type: {
        type: String,
        enum: ["CREDIT", "DEBIT", "BLOCK", "RELEASE"]
    },
    amount: Number,
    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
        default: null
    },
    description: String,
    status: {
        type: String,
        enum: ["SUCCESS", "FAILED", "PENDING"],
        default: "SUCCESS"
    }
}, { timestamps: true });

export default mongoose.model("OfficeWalletTransaction", officeWalletTransactionSchema);