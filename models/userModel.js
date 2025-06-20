import mongoose from 'mongoose';
import bcrypt from 'bcrypt'

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters long'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },

    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please enter a valid email address'
        ]
    },

    telephone: {
        type: String,
        required: [true, 'Telephone number is required'],
        trim: true,
        match: [
            /^[\+]?0(10|11|12|15)\d{8}$/,
            'Please enter a valid telephone number (11 digits, starting with 012, 010, 011, or 015)'
        ]
    },

    role: {
        type: String,
        required: [true, 'Role is required'],
        enum: {
            values: ['admin', 'seller', 'customer'],
            message: 'Role must be either admin, seller, or customer'
        },
        default: 'customer'
    },

    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long'],
        select: false
    }
}, {
    timestamps: true,
    collection: 'users'
});

// Index for better query performance
userSchema.index({ role: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const hashedPassword = await bcrypt.hash(this.password, 12);
        this.password = hashedPassword;
        next();
    } catch (error) {
        next(error);
    }
});

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Static method to find user by email
userSchema.statics.findByEmail = function (email) {
    return this.findOne({ email: email.toLowerCase() });
};

// Static method to find users by role
userSchema.statics.findByRole = function (role) {
    return this.find({ role });
};

// Create and export the User model
const User = mongoose.model('User', userSchema);

export default User;