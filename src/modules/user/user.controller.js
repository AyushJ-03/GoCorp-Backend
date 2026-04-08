import ApiResponse from '../../utils/ApiResponse.js';
import { validationResult } from 'express-validator';
import { User } from './user.model.js';
import { Office } from '../office/office.model.js';
import { Company } from '../company/company.model.js';  
import ApiError from '../../utils/ApiError.js';
import { BlacklistToken } from './blacklistToken.model.js';
import { RideRequest } from '../ride/ride.model.js'; 

export const createUser = async (req, res, next) => {
  try {
    const {
      company_id,
      office_id,
      name,
      email,
      password,
      contact,
      role
    } = req.body;

    if (!company_id || !office_id || !name || !email || !password || !contact || !role) {
      throw new ApiError(400, "All fields are required");
    }

    const isUserExists = await User.findOne({ email });
    if (isUserExists) {
      throw new ApiError(401, "Email already exists");
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, "Validation errors", errors.array());
    }

    const office = await Office.findById(office_id);
    if (!office) {
      throw new ApiError(404, "Office not found");
    }

    const company = await Company.findById(company_id);
    if (!company) {
      throw new ApiError(404, "Company not found");
    }

    const user = await User.create({
      company_id,
      office_id,
      name,
      email,
      password: await User.hashPassword(password),
      contact,
      role
    });

    const token = await user.generateAuthToken();

    res.status(201).json(new ApiResponse(201, "User registered successfully", { user, token }))
  } catch (error) {
    next(error || new ApiError(500, "Registration error"))
  }
};

export const loginUser = async (req, res, next) => {
  try {

    const { email, password } = req.body;
    if (!email || !password) {
      throw new ApiError(401, "Email and password are required");
    }

    const user = await User.findOne({ email }).select('+password').populate('office_id');
    if (!user) {
      throw new ApiError(401, "Invalid email or password");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new ApiError(401, "Invalid email or password");
    }

    const token = await user.generateAuthToken();

    res.cookie('token', token);

    res.status(200).json(new ApiResponse(200, "Login successful", { user, token }))
  } catch (error) {
    next(error || new ApiError(500, "Login error"))
  }
};

export const getUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('office_id');
    res.status(200).json(new ApiResponse(200, "User profile retrieved successfully", { user: user }))
  } catch (error) {
    next(error || new ApiError(500, "Profile retrieval error"))
  }
};

export const logoutUser = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw new ApiError(400, "No token provided");
    }

    await BlacklistToken.create({ token });

    res.clearCookie('token');

    res.status(200).json(new ApiResponse(200, "Logout successful"));

  } catch (error) {
    next(error || new ApiError(500, "Logout error"))
  }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const { name, contact, home_address, office_address, recent_locations, saved_locations } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Update name fields individually to avoid overwriting nested fields
    if (name?.first_name) user.name.first_name = name.first_name;
    if (name?.last_name) user.name.last_name = name.last_name;

    // Validate contact number format before saving
    if (contact) {
      if (!/^\d{10}$/.test(contact)) {
        throw new ApiError(400, "Contact must be a valid 10-digit number");
      }
      user.contact = contact;
    }

    if (home_address) user.home_address = home_address;
    if (office_address) user.office_address = office_address;
    if (recent_locations) user.recent_locations = recent_locations;
    if (saved_locations) user.saved_locations = saved_locations;

    await user.save();
    await user.populate('office_id');

    res.status(200).json(new ApiResponse(200, "Profile updated successfully", { user }));
  } catch (error) {
    next(error || new ApiError(500, "Profile update error"));
  }
};

export const getMyRides = async (req, res, next) => {
  try {
    const rides = await RideRequest.find({
      $or: [
        { employee_id: req.user._id },
        { invited_employee_ids: req.user._id }
      ]
    })
      .sort({ scheduled_at: -1 })
      .populate('employee_id', 'name contact')
      .populate('office_id', 'name address')
      .populate('invited_employee_ids', 'name contact');

    const activeStatuses = ["PENDING", "IN_CLUSTERING", "CLUSTERED", "BOOKED_SOLO", "ACCEPTED", "ARRIVED", "STARTED"];
    
    const active = rides.filter(ride => activeStatuses.includes(ride.status));
    const past = rides.filter(ride => ["COMPLETED", "CANCELLED"].includes(ride.status));

    res.status(200).json(new ApiResponse(200, 'My rides retrieved', {
      active,
      past
    }));
  } catch (error) {
    next(error || new ApiError(500, 'Error fetching rides'));
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(200).json(new ApiResponse(200, "Query too short", []));
    }

    const searchRegex = new RegExp(query, 'i');

    const users = await User.find({
      company_id: req.user.company_id,
      _id: { $ne: req.user._id },
      $or: [
        { "name.first_name": searchRegex },
        { "name.last_name": searchRegex },
        { email: searchRegex }
      ]
    })
    .select('name email contact')
    .limit(10);

    res.status(200).json(new ApiResponse(200, "Users found", users));
  } catch (error) {
    next(error || new ApiError(500, "Error searching users"));
  }
};

export const getUserSummary = async (req, res, next) => {
  try {
    const rideCount = await RideRequest.countDocuments({
      $or: [
        { employee_id: req.user._id },
        { invited_employee_ids: req.user._id }
      ]
    });

    const upcomingRides = await RideRequest.countDocuments({
      $or: [
        { employee_id: req.user._id },
        { invited_employee_ids: req.user._id }
      ],
      status: { $in: ["PENDING", "IN_CLUSTERING", "CLUSTERED", "BOOKED_SOLO"] }
    });

    res.status(200).json(new ApiResponse(200, "User summary retrieved", { 
      rideCount, 
      upcomingRides 
    }));
  } catch (error) {
    next(error || new ApiError(500, "Error fetching user summary"));
  }
};

export const removeSavedLocation = async (req, res, next) => {
  try {
    const { addr } = req.body;
    if (!addr) {
      throw new ApiError(400, "Address is required");
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { saved_locations: { addr } } },
      { new: true }
    );

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    res.status(200).json(new ApiResponse(200, "Location removed successfully", { user }));
  } catch (error) {
    next(error || new ApiError(500, "Error removing saved location"));
  }
};
