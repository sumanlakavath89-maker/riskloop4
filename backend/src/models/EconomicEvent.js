import mongoose from 'mongoose';

const economicEventSchema = new mongoose.Schema(
    {
        eventName: {
            type: String,
            required: true,
            trim: true,
        },

        country: {
            type: String,
            default: 'India',
            required: true,
        },

        countryCode: {
            type: String,
            default: 'IN',
        },

        date: {
            type: Date,
            required: true,
        },

        time: {
            type: String,
            default: null,
        },

        timezone: {
            type: String,
            default: 'Asia/Kolkata',
        },

        impact: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium',
        },

        previous: {
            type: String,
            default: null,
        },

        forecast: {
            type: String,
            default: null,
        },

        actual: {
            type: String,
            default: null,
        },

        unit: {
            type: String,
            default: null,
        },

        source: {
            type: String,
            required: true,
        },

        sourceUrl: {
            type: String,
            default: null,
        },

        status: {
            type: String,
            enum: ['upcoming', 'released'],
            default: 'upcoming',
        },

        description: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Prevent duplicate events
economicEventSchema.index(
    { eventName: 1, countryCode: 1, date: 1 },
    { unique: true }
);

export default mongoose.model('EconomicEvent', economicEventSchema);