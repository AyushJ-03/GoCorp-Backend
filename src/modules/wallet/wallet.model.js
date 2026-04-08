import mongoose from "mongoose";

const officeWalletSchema = new mongoose.Schema(
  {
    officeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    blockedBalance: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

export default mongoose.model("OfficeWallet", officeWalletSchema);
