import { Router } from "express"
import { createUser, getUserProfile, loginUser, logoutUser, updateUserProfile, getMyRides, searchUsers, getUserSummary, removeSavedLocation } from "./user.controller.js"
import { body } from "express-validator"
import { authUser } from "../../middleware/auth.middleware.js"

const router = Router()

router.post('/add-user', [

  body('name.first_name').isLength({ min: 3 }).notEmpty().withMessage('First name is required'),

  body('email').isEmail().withMessage('Please provide a valid email'),

  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),

  body('contact').isMobilePhone().withMessage('Please provide a valid phone number')

], createUser)

router.post('/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email'),

    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
  ],
  loginUser
)

router.get('/profile' ,authUser, getUserProfile)

router.patch('/update-profile', authUser, updateUserProfile)

router.get('/my-rides', authUser, getMyRides)

router.get('/search', authUser, searchUsers)

router.get('/summary', authUser, getUserSummary)
router.delete('/saved-locations', authUser, removeSavedLocation)

router.get('/logout', authUser, logoutUser)

export default router