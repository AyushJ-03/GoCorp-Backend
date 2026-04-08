import mongoose from "mongoose";

const officeSchema = new mongoose.Schema(
    {
        company_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },

        name: {
            type: String,
            required: true,
        },

        address: {
            city: {
                type: String,
                required: true,
            },
            state: {
                type: String,
            },
            pincode: {
                type: String,
            },
            address_line: {
                type: String,
                required: true,
            },
        },

        office_location:
        {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point"
            },
            coordinates: [Number],
        },

        shift_start: {
            type: String,
        },

        shift_end: {
            type: String,
        },

        working_days: {
            type: [Number],
            default: [1, 2, 3, 4, 5]  
        },
        
        admin_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true
    }
);

export const Office = mongoose.model("Office", officeSchema);