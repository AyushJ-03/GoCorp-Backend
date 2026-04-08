import { User } from "../modules/user/user.model.js";
import jwt from "jsonwebtoken";
import ApiError from "../utils/ApiError.js";
import { Driver } from "../modules/driver/driver.model.js";
import { BlacklistToken } from "../modules/user/blacklistToken.model.js";

export const authUser = async (req, res, next) => {

  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  const isBlacklisted = await BlacklistToken.findOne({ token });
  if (isBlacklisted) {
    throw new ApiError(401, "Token has been blacklisted");
  }

  if (!token) {
    throw new ApiError(401, "Authorization header missing or malformed");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);
    if (!user) {
      throw new ApiError(401, "User not found");
    }
    req.user = user;
  } catch (error) {
    throw new ApiError(401, "Invalid token");
  }
  next();

};

export const authDriver = async (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  const isBlacklisted = await BlacklistToken.findOne({ token });
  if (isBlacklisted) {
    throw new ApiError(401, "Token has been blacklisted");
  }

  if (!token) {
    throw new ApiError(401, "Authorization header missing or malformed");
  }

  try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const driver = await Driver.findById(decoded._id);
    if (!driver) {
      throw new ApiError(401, "Driver not found");
    }
    req.driver = driver;

  } catch (error) {
    throw new ApiError(401, "Invalid token");
  }

  next();
};