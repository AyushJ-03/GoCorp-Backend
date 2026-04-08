import { Router } from "express"
import { registerCompanyController } from "./company.controller.js"

const router = Router()


router.post('/add-company', registerCompanyController)

export default router