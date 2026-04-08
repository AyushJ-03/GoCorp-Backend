import { Driver } from "./driver.model.js";
import ApiError from "../../utils/ApiError.js";
import { validationResult } from "express-validator";
import ApiResponse from "../../utils/ApiResponse.js";
import { BlacklistToken } from "../user/blacklistToken.model.js";

export const createDriver = async (req, res, next) => {
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(400, "Validation errors", errors.array());
  }

  try {
    const { name, email, contact, password, vehicle } = req.body;

    if (!name || !email || !contact || !password || !vehicle) {
      throw new ApiError(400, "All fields are required");
    }

    const isDriverExists = await Driver.findOne({ email });
    if (isDriverExists) {
      throw new ApiError(401, "Email already exists");
    }

    const driver = await Driver.create({
      name,
      email,
      contact,
      password: await Driver.hashPassword(password),
      vehicle
    });

    const token = await driver.generateAuthToken();

    res.cookie('token', token)

    res.status(201).json(new ApiResponse(201, "Driver created successfully", { driver, token }))
  } catch (error) {
    next(error || new ApiError(500, "Driver creation error"))
  }
}


export const loginDriver = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ApiError(400, "Email and password are required");
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ApiError(400, "Validation errors", errors.array());
    }

    const driver = await Driver.findOne({ email }).select('+password');
    if (!driver) {
      throw new ApiError(401, "Invalid email or password");
    }

    const isMatch = await driver.comparePassword(password);
    if (!isMatch) {
      throw new ApiError(401, "Invalid email or password");
    }

    const token = await driver.generateAuthToken();

    res.cookie('token', token);

    res.status(200).json(new ApiResponse(200, "Driver logged in successfully", { driver, token }));
  } catch (error) {
    next(error || new ApiError(500, "Driver login error"));
  }
};

export const getDriverProfile = async (req, res, next) => {
  try {
    res.status(200).json(new ApiResponse(200, "Driver profile retrieved successfully", { driver: req.driver }));
  } catch (error) {
    next(error || new ApiError(500, "Driver profile retrieval error"));
  }
};

export const logoutDriver = async (req, res, next) => {
  try {
      const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
  
      if (!token) {
        throw new ApiError(400, "No token provided");
      }
  
      await BlacklistToken.create({ token });
  
      res.clearCookie('token');
  
      res.status(200).json(new ApiResponse(200, "Logout successful"));
  
    } catch (error) {
      next(error || new ApiError(500, "Driver logout error"));
    }
};