import express from "express";
import { createDriver, loginDriver, getDriverProfile, logoutDriver } from "./driver.controller.js";
import { body } from "express-validator";
import { authDriver } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.post('/add-driver', [

  body('name.first_name').isLength({ min: 3}).notEmpty().withMessage('First name is required'),

  body('email').isEmail().withMessage('Valid email is required'),

  body('contact').notEmpty().withMessage('Contact information is required'),

  body('vehicle.color').isLength({ min: 3 }).notEmpty().withMessage('Vehicle color is required'),

  body('vehicle.capacity').isInt({ min: 1, max: 7 }).withMessage('Vehicle capacity must be between 1 and 7'), 
  
  body('vehicle.license_plate').notEmpty().withMessage('License plate is required'),

  body('vehicle.vehicleType').isIn(['sedan', 'bike', 'suv', 'auto']).withMessage('Vehicle type must be one of: sedan, bike, suv, auto')

], createDriver)

router.post('/login',[

  body('email').isEmail().withMessage('Valid email is required'),

  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')

], loginDriver)

router.get('/profile', authDriver, getDriverProfile)

router.get('/logout', authDriver, logoutDriver)


export default router